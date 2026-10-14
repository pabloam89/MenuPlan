/**
 * dimensionado.mjs — el dimensionador (#641, fondo #639): de un encargo, un diff o unos ficheros, calcula con reglas (sin tabla
 * de combinaciones) su alcance, su complejidad, qué agentes intervienen, qué va en paralelo y qué en serie, y el brief de cada
 * uno. Lo lanza `npm run dimensionar` (scripts/dimensionar.mjs) y `/orquestar` pega su brief en vez de escribirlo a mano.
 *
 * No guarda datos propios: junta lo que ya hay, cada cosa de su sola fuente.
 *   - el tamaño es el del aviso del CI (`UMBRALES_TAMANO` y `esGenerado` de avisosPr.mjs: líneas, ficheros y áreas, sin lo generado);
 *   - el alcance sale de los módulos de ops/MODULOS.json y de los ámbitos de ambitos.mjs; los números, de `dimensionado` de
 *     ops/presupuestos.json (a ojo mientras `valores_iniciales` sea true);
 *   - el constructor y el juez de la zona, de AMBITOS (`construye` y `jueces`); el revisor entra siempre (`JUEZ_SIEMPRE`);
 *   - los pasos de cada tipo, de ops/tipos-de-encargo.json por `encargoDe` (tiposDeEncargo.mjs), con el presupuesto por causa;
 *   - el estándar y las normas del brief, de `textoDeTarea` (estandaresAgentes.mjs): el mismo texto que `npm run estandar`.
 *
 * Alcance (ALCANCES_FALLO de flujo.mjs): local (pocos ficheros, un dominio y un módulo), transversal (muchos dominios, o módulos de
 * la app y de Lola a la vez) y módulo el resto. Un dominio es un ámbito que no es `code`: casi todo fichero es también código.
 * Complejidad (COMPLEXITIES): large si pasa un umbral del CI o el alcance es transversal; trivial si es local y cabe en
 * `dimensionado.trivial`; normal el resto. La complejidad que declare el encargo no manda: se avisa si no cuadra.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cargarMapa } from "../../.claude/hooks/dominios.mjs";
import { JUECES } from "./agentes.mjs";
import { AMBITOS, ambitosDeFichero, constructorDeFichero, juecesDeAmbitos } from "./ambitos.mjs";
import { UMBRALES_TAMANO, esGenerado } from "./avisosPr.mjs";
import { PROYECTO_POR_DEFECTO } from "./zonasProyecto.mjs";
import { leerEstandares, leerNormasEn, RAIZ_REPO, tareasDe, textoDeTarea } from "./estandaresAgentes.mjs";
import { leerPrecedencia } from "./precedencia.mjs";
import { ALCANCES, CATALOGO, CAUSAS, COMPLEXITIES, MOTIVOS_COMPLEJIDAD, presupuestoDe } from "./presupuestos.mjs";
import { ALL_SUBTYPES, FLAGS, ROLES, SUBTYPES, TYPES, encargoDe, rolDe } from "./tiposDeEncargo.mjs";
import { precargadasDe, skillsDelEncargo } from "./usoSkills.mjs";

const RAIZ = RAIZ_REPO;

/** Los ficheros que casi todo PR toca (orquestar, «Paralelo sin pisarse»): con varios constructores se tocan al final. */
export const COMPARTIDOS_AL_FINAL = ["CLAUDE.md", "package.json", ".github/workflows/tests.yml", "vite.config.js", "src/App.jsx"];

/**
 * Los literales de vocabulario que usa este módulo, juntos para que un test los cruce con su fuente (acciones de ops/estandares-agentes.json,
 * finalidades y especiales de ops/tipos-de-encargo.json, causa de issues.mjs, roles de scripts/lib/tiposDeEncargo.mjs).
 */
export const LITERALES = {
  acciones: ["diagnosticar", "juzgar", "medir", "construir", "operar"],
  finalidades: ["diagnose", "measure_before", "measure_after"],
  especiales: ["sesion", "constructor", "constructores"],
  // Los roles salen de su fuente (ROLES de tiposDeEncargo.mjs), no de una copia (deuda de #641, saldada en #642).
  roles: ROLES,
  causa_defecto: "sin-comprobar",
  subtipo_defecto: "create-plain",
};
const [SESION, CONSTRUCTOR, CONSTRUCTORES_PLURAL] = LITERALES.especiales;
const ES_CONSTRUCTOR_GENERICO = [CONSTRUCTOR, CONSTRUCTORES_PLURAL];

/** Las formas de un tipo, derivadas de su `skeleton` en ops/tipos-de-encargo.json (nada por nombre de tipo), por nombre y no por posición. */
export const FORMAS = {
  soloJueces: "solo-jueces-en-paralelo",
  medir: "medir-antes-y-despues",
  diagnosticar: "diagnosticar-primero",
  construir: "construir-y-juzgar",
};
export function formaDe(skeleton) {
  if (skeleton.judges_only_in_parallel) return FORMAS.soloJueces;
  if (skeleton.measures_before_after) return FORMAS.medir;
  if (skeleton.roles[0] === "judge") return FORMAS.diagnosticar;
  return FORMAS.construir;
}

const ORDEN_COMPLEJIDAD = Object.keys(COMPLEXITIES);
const ORDEN_ALCANCE = ALCANCES;
/** Las acciones de una tarea que hacen de un juez un candidato para completar el mínimo de jueces (subconjunto de LITERALES.acciones; lo vigila dimensionar.test.js). */
export const ACCIONES_DE_JUEZ_EXTRA = ["juzgar", "medir", "diagnosticar"];

const norm = (r) => String(r).replace(/\\/g, "/").replace(/^\.\//, "");
const unicos = (xs) => [...new Set(xs)];

// ── La medida, el alcance y la complejidad ──────────────────────────────────────────────────────

/** Los ficheros como { ruta, lines }: acepta rutas sueltas. */
const comoFicheros = (xs) => (xs ?? []).map((x) => (typeof x === "string" ? { ruta: norm(x), lines: null } : { ruta: norm(x.ruta), lines: Number.isInteger(x.lines) ? x.lines : null }));

/**
 * La medida del tamaño, la del aviso del CI (`evaluarC1`): líneas (añadidas más quitadas), ficheros y áreas (la primera carpeta),
 * sin lo generado. `lines` suma las líneas que se conocen (null si no se conoce ninguna: ficheros previstos, no un diff);
 * `lines_minimo` es true si falta alguna, y entonces `lines` es un mínimo.
 */
export function medidaDe(ficheros) {
  const todos = comoFicheros(ficheros);
  const propios = todos.filter((x) => !esGenerado(x.ruta));
  const conocidas = propios.filter((x) => x.lines !== null);
  const lines = conocidas.length ? conocidas.reduce((n, x) => n + x.lines, 0) : null;
  const areas = new Set(propios.map((x) => (x.ruta.includes("/") ? x.ruta.split("/")[0] : "(root)")));
  return { lines, lines_minimo: conocidas.length < propios.length, files: propios.length, areas: areas.size, generated_skipped: todos.length - propios.length };
}

/** El módulo de nivel superior de ops/MODULOS.json de cada ruta (también de submódulos y tests). → { modulos: [id], ambitos: [app|lola|compartido] } */
export function modulosDe(rutas, mapa) {
  const dueno = new Map();
  for (const m of mapa?.modulos ?? []) {
    const todos = [m, ...(m.submodulos ?? [])];
    for (const u of todos) for (const r of [...(u.ficheros ?? []), ...(u.tests ?? [])]) if (!dueno.has(r)) dueno.set(r, m);
  }
  const ms = unicos(rutas.map((r) => dueno.get(norm(r))).filter(Boolean));
  return { modulos: ms.map((m) => m.id), ambitos: unicos(ms.map((m) => m.ambito)) };
}

/** El alcance de unos ficheros → { alcance, dominios, modulos, ambitos_modulo }. `cfg` es `dimensionado` de ops/presupuestos.json. */
export function alcanceDe({ ficheros, mapa, cfg = CATALOGO.dimensionado }) {
  const propios = comoFicheros(ficheros).filter((x) => !esGenerado(x.ruta)).map((x) => x.ruta);
  const dominios = Object.keys(AMBITOS).filter((id) => id !== "code" && propios.some((r) => ambitosDeFichero(r).includes(id)));
  const { modulos, ambitos } = modulosDe(propios, mapa);
  let alcance = "modulo";
  if (dominios.length >= cfg.transversal_min_dominios || (ambitos.includes("app") && ambitos.includes("lola"))) alcance = "transversal";
  else if (propios.length <= cfg.local_max_files && dominios.length <= 1 && modulos.length <= 1) alcance = "local";
  return { alcance, dominios, modulos, ambitos_modulo: ambitos };
}

/**
 * La complejidad por la medida y el alcance → { complejidad, motivo }. El motivo es un id de MOTIVOS_COMPLEJIDAD (presupuestos.mjs).
 * Trivial pide que el tamaño se conozca entero: con líneas sueltas sin conocer (`lines_minimo` y alguna conocida) no vale; con ninguna
 * conocida (ficheros previstos) cuentan solo ficheros y áreas.
 */
export function complejidadDe(medida, alcance, cfg = CATALOGO.dimensionado) {
  if (medida.lines !== null && medida.lines > UMBRALES_TAMANO.lines) return { complejidad: "large", motivo: "over_lines" };
  if (medida.files > UMBRALES_TAMANO.files) return { complejidad: "large", motivo: "over_files" };
  if (medida.areas > UMBRALES_TAMANO.areas) return { complejidad: "large", motivo: "over_areas" };
  if (alcance === "transversal") return { complejidad: "large", motivo: "transversal" };
  const t = cfg.trivial;
  const tamanoConocido = medida.lines === null || !medida.lines_minimo;
  if (alcance === "local" && tamanoConocido && (medida.lines === null || medida.lines <= t.lines_max) && medida.files <= t.files_max && medida.areas <= t.areas_max) return { complejidad: "trivial", motivo: "small" };
  return { complejidad: "normal", motivo: "default" };
}

// ── El plan ─────────────────────────────────────────────────────────────────────────────────────

let _mapa = null;
const mapaDeModulos = () => (_mapa ??= JSON.parse(readFileSync(join(RAIZ, "ops", "MODULOS.json"), "utf8")));

function subtipoDe({ subtipo, tipo }) {
  if (subtipo) {
    const s = ALL_SUBTYPES.find((x) => x.id === subtipo);
    if (!s) throw new Error(`subtipo «${String(subtipo).slice(0, 40)}» desconocido; los hay: ${SUBTYPES.map((x) => x.id).join(", ")}`);
    return { id: s.id, origen: "dado" };
  }
  if (tipo) {
    if (!(tipo in TYPES)) throw new Error(`tipo «${String(tipo).slice(0, 40)}» desconocido; los hay: ${Object.keys(TYPES).join(", ")}`);
    const s = SUBTYPES.find((x) => x.type === tipo && x.plain) ?? SUBTYPES.find((x) => x.type === tipo && x.valve);
    return { id: s.id, origen: "tipo" };
  }
  return { id: LITERALES.subtipo_defecto, origen: "defecto" };
}

/**
 * Reparte los ficheros entre quien construye: el `constructor` (uno solo desde #688, con el dominio que dan los ámbitos de sus ficheros: `ambitos`) y
 * la sesión, para lo que no tiene dueño. Lo que casi todo PR toca va al final si hay varios grupos.
 */
/** Los dominios (ids de ámbito) en que construye alguien del reparto. */
const dominiosDe = (constructores) => unicos(constructores.flatMap((c) => c.ambitos ?? []));

function repartir(propios) {
  const grupos = new Map();
  const ambitosPorAgente = new Map();
  const avisos = [];
  const compartidos = propios.filter((r) => COMPARTIDOS_AL_FINAL.includes(r));
  const resto = compartidos.length && compartidos.length < propios.length ? propios.filter((r) => !compartidos.includes(r)) : propios;
  for (const r of resto) {
    const c = constructorDeFichero(r);
    const agente = c?.agente ?? SESION;
    if (c?.agente) ambitosPorAgente.set(agente, [...(ambitosPorAgente.get(agente) ?? []), c.ambito]);
    if (!c?.agente) avisos.push(`${r} es del ámbito ${c?.ambito ?? "ninguno"}, que no tiene constructor dueño: construye la sesión`);
    if (!grupos.has(agente)) grupos.set(agente, []);
    grupos.get(agente).push(r);
  }
  let alFinal = [];
  if (resto !== propios) {
    if (grupos.size >= 2) alFinal = compartidos;
    else if (grupos.size === 1) [...grupos.values()][0].push(...compartidos);
  }
  return { constructores: [...grupos].map(([agente, ficheros]) => ({ agente, ficheros, ...(ambitosPorAgente.has(agente) ? { ambitos: unicos(ambitosPorAgente.get(agente)) } : {}) })), alFinal, avisos: unicos(avisos) };
}

/**
 * El plan de un encargo.
 * entrada: { fuente: "encargo"|"ficheros"|"diff", ficheros: [{ruta, lines}|ruta], subtipo?, tipo?, causa?, banderas?,
 *            numero?, titulo?, objetivo?, declarada?, hecho_cuando?, verificacion?, rama?, tarea? }
 * `tarea`: el id de la tarea del catálogo de estándares que cumple el constructor, si quien orquesta la conoce (manda sobre la deducida).
 * deps: { mapa } para probar con otro mapa de módulos. Lanza si el subtipo, el tipo, la causa o una bandera no existen.
 */
export function dimensionar(entrada, deps = {}) {
  const mapa = deps.mapa ?? mapaDeModulos();
  const cfg = deps.cfg ?? CATALOGO.dimensionado;
  const causa = entrada.causa ?? LITERALES.causa_defecto;
  if (!CAUSAS.includes(causa)) throw new Error(`causa «${String(causa).slice(0, 40)}» desconocida; las hay: ${CAUSAS.join(", ")}`);
  const banderas = entrada.banderas ?? [];
  for (const b of banderas) if (!(b in FLAGS)) throw new Error(`bandera «${String(b).slice(0, 40)}» desconocida; las hay: ${Object.keys(FLAGS).join(", ")}`);
  const sub = subtipoDe(entrada);

  const ficheros = comoFicheros(entrada.ficheros);
  const propios = ficheros.filter((x) => !esGenerado(x.ruta)).map((x) => x.ruta);
  const medida = medidaDe(ficheros);
  const { alcance, dominios, modulos, ambitos_modulo } = alcanceDe({ ficheros, mapa, cfg });
  const { complejidad, motivo } = complejidadDe(medida, alcance, cfg);
  const ambitos = Object.keys(AMBITOS).filter((id) => propios.some((r) => ambitosDeFichero(r).includes(id)));
  const avisos = [];
  if (entrada.declarada && entrada.declarada !== complejidad) avisos.push(`complejidad declarada ${entrada.declarada} y calculada ${complejidad} (${motivo}): manda la calculada`);

  const enc = encargoDe({ subtype: sub.id, scope: alcance, cause: causa, complexity: complejidad }, deps.presupuestos);
  if (!enc) throw new Error(`no hay encargo para ${sub.id}, ${alcance}, ${causa}, ${complejidad}`);
  avisos.push(...enc.warnings);
  if ((medida.lines === null || medida.lines_minimo) && propios.length) avisos.push("sin todas las líneas (ficheros previstos o sin commitear): la complejidad es un mínimo; con --diff sale la real");
  if (sub.origen === "defecto") avisos.push(`sin subtipo ni tipo: ${LITERALES.subtipo_defecto} por defecto; di --subtipo o --tipo para que la forma sea la del trabajo`);
  const tipo = enc.type;
  const esqueleto = TYPES[tipo].skeleton;
  const forma = formaDe(esqueleto);
  const subDatos = ALL_SUBTYPES.find((x) => x.id === enc.subtype);

  // Quién construye: los fijos del subtipo, o el `constructor` (uno solo desde #688; el dominio sale de los ficheros) y la sesión donde un ámbito no tiene dueño.
  const reparto = repartir(propios);
  avisos.push(...reparto.avisos);
  const sinFicheros = !propios.length;
  let constructores = reparto.constructores;
  const medidores = subDatos.measured_with ?? [];
  const fijos = enc.steps.flatMap((p) => p.agentes ?? []).filter((a) => rolDe(a) === "builder" && !ES_CONSTRUCTOR_GENERICO.includes(a) && !medidores.includes(a));
  if (fijos.length) constructores = unicos(fijos).map((agente) => ({ agente, ficheros: propios }));
  else if (esqueleto.irreversible_needs_close) {
    // Operar la casa (el tipo cuyo esqueleto cierra con una persona si es irreversible: hoy, operate) lo hace el constructor entero,
    // sea cual sea la zona de los ficheros. Por la bandera del esqueleto, no por el nombre del tipo.
    const ambitos = unicos(propios.map((r) => constructorDeFichero(r)).filter((c) => c?.agente).map((c) => c.ambito));
    constructores = [{ agente: CONSTRUCTOR, ficheros: propios, ...(ambitos.length ? { ambitos } : {}) }];
  }
  else if (enc.steps.some((p) => (p.agentes ?? []).some((a) => ES_CONSTRUCTOR_GENERICO.includes(a) && !medidores.includes(a)))) {
    if (sinFicheros) {
      constructores = [{ agente: CONSTRUCTOR, ficheros: [] }];
      avisos.push("sin ficheros: el dominio de la tarea no se puede saber; da --ficheros o --diff");
    } else if (dominiosDe(constructores).length > 1 && !subDatos.differs_in.includes("plans_first")) {
      const conPlan = SUBTYPES.find((x) => x.type === tipo && x.differs_in.includes("plans_first"));
      if (conPlan) avisos.push(`${dominiosDe(constructores).length} dominios con ${enc.subtype}: considera ${conPlan.id} (plan primero)`);
    }
  } else if (esqueleto.judges_only_in_parallel) constructores = [];
  else if (enc.steps.some((p) => (p.agentes ?? []).includes(SESION)) && subDatos.builds_in_session) constructores = [{ agente: SESION, ficheros: propios }];

  // Los pasos del subtipo, con el diagnóstico siempre primero en un arreglo (el pipeline mínimo lo salta).
  let pasos = enc.steps;
  if (forma === FORMAS.diagnosticar && !pasos.some((p) => p.purpose === LITERALES.finalidades[0])) pasos = [...subDatos.pasos.filter((p) => p.purpose === LITERALES.finalidades[0]), ...pasos];

  const fases = [];
  const condicionales = [];
  for (const paso of pasos) {
    const agentes = [];
    const pon = (agente, rol) => { if (!agentes.some((a) => a.agente === agente)) agentes.push({ agente, rol }); };
    for (const a of paso.agentes ?? []) {
      if (medidores.includes(a)) pon(a, "measurer");
      else if (ES_CONSTRUCTOR_GENERICO.includes(a)) for (const c of constructores) pon(c.agente, "builder");
      else if (a === SESION) pon(a, subDatos.builds_in_session ? "builder" : "planner");
      else pon(a, rolDe(a) ?? "judge");
    }
    for (const o of paso.opcional ?? []) {
      if (banderas.includes(o.flag)) pon(o.agente, rolDe(o.agente) ?? "judge");
      else condicionales.push({ agente: o.agente, si: o.si, flag: o.flag });
    }
    fases.push({ finalidad: paso.purpose ?? null, agentes });
  }

  // Los jueces: los del subtipo, el revisor siempre, los de la zona y los que exige la causa; nadie juzga lo que construye.
  const juecesFase = (i) => fases[i].agentes.filter((a) => a.rol === "judge").map((a) => a.agente);
  let ultima = -1;
  fases.forEach((x, i) => { if (x.agentes.some((a) => a.rol === "judge")) ultima = i; });
  if (ultima < 0) { fases.push({ finalidad: null, agentes: [] }); ultima = fases.length - 1; }
  const construyen = new Set(fases.flatMap((x) => x.agentes.filter((a) => a.rol === "builder").map((a) => a.agente)));
  const pideJuez = (j, porque) => {
    if (construyen.has(j)) { avisos.push(`${j} ${porque} pero construye en este encargo: quien construye no juzga`); return; }
    if (!fases.some((_, i) => juecesFase(i).includes(j))) fases[ultima].agentes.push({ agente: j, rol: "judge" });
  };
  for (const j of juecesDeAmbitos(ambitos)) pideJuez(j, "es juez de la zona");
  for (const j of enc.judges_required) pideJuez(j, "lo exige la causa");
  const todosLosJueces = () => unicos(fases.flatMap((_, i) => juecesFase(i)));
  const tareas = tareasDe(deps.estandares ?? leerEstandares(RAIZ));
  while (todosLosJueces().length < enc.judges_min) {
    const puntua = (j) => tareas.filter((t) => t.agente === j && ACCIONES_DE_JUEZ_EXTRA.includes(t.tarea.accion) && t.tarea.ambitos.some((a) => ambitos.includes(a))).length;
    const candidato = JUECES.filter((j) => !todosLosJueces().includes(j) && !construyen.has(j)).map((j) => ({ j, n: puntua(j) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0];
    if (!candidato) { avisos.push(`jueces: el mínimo es ${enc.judges_min} y solo hay ${todosLosJueces().length} (${todosLosJueces().join(", ")}); ningún otro juez tiene tarea en estos ámbitos`); break; }
    fases[ultima].agentes.push({ agente: candidato.j, rol: "judge" });
  }

  const fasesFinal = fases.filter((x) => x.agentes.length).map((x, i) => ({ n: i + 1, modo: x.agentes.length > 1 ? "paralelo" : "serie", finalidad: x.finalidad, agentes: x.agentes }));
  const presu = presupuestoDe(alcance, causa, deps.presupuestos ?? CATALOGO);
  return {
    fuente: entrada.fuente ?? "ficheros",
    numero: entrada.numero ?? null,
    titulo: entrada.titulo ?? null,
    objetivo: entrada.objetivo ?? entrada.titulo ?? null,
    hecho_cuando: entrada.hecho_cuando ?? null,
    verificacion: entrada.verificacion ?? null,
    rama: entrada.rama ?? null,
    declarada: entrada.declarada ?? null,
    tarea: entrada.tarea ?? null,
    tipo,
    subtipo: enc.subtype,
    subtipo_origen: sub.origen,
    causa,
    alcance,
    complejidad,
    motivo_complejidad: motivo,
    medida,
    ambitos,
    dominios,
    modulos,
    ficheros: propios,
    forma,
    medicion: esqueleto.measures_before_after ? { kind: subDatos.measure_kind, counters: subDatos.counters ?? [] } : null,
    diagnostico: forma === FORMAS.diagnosticar ? { quien: presu.diagnostica, hipotesis_max: presu.hipotesis_en_paralelo_max, es_no_es: presu.es_no_es } : null,
    constructores,
    al_final: reparto.alFinal,
    jueces: unicos(fasesFinal.flatMap((x) => x.agentes.filter((a) => a.rol === "judge").map((a) => a.agente))),
    jueces_min: enc.judges_min,
    jueces_requeridos: enc.judges_required,
    condicionales,
    fases: fasesFinal,
    cierre: enc.close_with,
    rondas_max: enc.fund_rondas_max,
    minutos: enc.fund_minutes,
    pipeline: enc.pipeline,
    avisos: unicos(avisos),
  };
}

/**
 * ¿Hay que redimensionar? Compara lo previsto con el diff real. Si lo previsto trae la complejidad declarada del encargo,
 * solo manda esa; si no, se compara también el alcance. → { redimensionar, motivos: ["complejidad:a->b", "alcance:a->b"], ficheros_fuera }
 * `ficheros_fuera` son los del real que no estaban en lo previsto: se cuentan, no obligan por sí solos.
 */
export function redimensionar(previsto, real) {
  const motivos = [];
  const cprev = previsto.declarada ?? previsto.complejidad;
  if (ORDEN_COMPLEJIDAD.indexOf(real.complejidad) > ORDEN_COMPLEJIDAD.indexOf(cprev)) motivos.push(`complejidad:${cprev}->${real.complejidad}`);
  if (!previsto.declarada && ORDEN_ALCANCE.indexOf(real.alcance) > ORDEN_ALCANCE.indexOf(previsto.alcance)) motivos.push(`alcance:${previsto.alcance}->${real.alcance}`);
  const antes = new Set(previsto.ficheros ?? []);
  return { redimensionar: motivos.length > 0, motivos, ficheros_fuera: (real.ficheros ?? []).filter((r) => !antes.has(r)) };
}

// ── La salida ───────────────────────────────────────────────────────────────────────────────────

/**
 * El plan como líneas `campo: valor`, UN campo por línea (así se lee y se cuenta sin trocear; no son líneas de métrica); `redim` es el
 * resultado de `redimensionar`, si se pidió comparar. Las listas, separadas por coma.
 */
export function textoDe(plan, redim = null) {
  const m = plan.medida;
  const l = [];
  const campo = (nombre, valor) => l.push(`${nombre}: ${valor}`);
  if (plan.numero) campo("encargo", `#${plan.numero}`);
  campo("fuente", plan.fuente);
  campo("tipo", plan.tipo);
  campo("subtipo", plan.subtipo);
  campo("subtipo_origen", plan.subtipo_origen);
  campo("causa", plan.causa);
  campo("alcance", plan.alcance);
  campo("complejidad", plan.complejidad);
  campo("complejidad_motivo", plan.motivo_complejidad);
  if (plan.declarada) campo("complejidad_declarada", plan.declarada);
  campo("medida", `lines=${m.lines ?? "desconocidas"}${m.lines_minimo ? "+" : ""} files=${m.files} areas=${m.areas} generated_skipped=${m.generated_skipped}`);
  campo("ambitos", plan.ambitos.join(", ") || "ninguno");
  campo("dominios", plan.dominios.join(", ") || "ninguno");
  campo("modulos", plan.modulos.join(", ") || "ninguno");
  campo("forma", plan.forma);
  if (plan.medicion) {
    campo("medicion", plan.medicion.kind);
    if (plan.medicion.counters.length) campo("medicion_contadores", plan.medicion.counters.join(", "));
  }
  if (plan.diagnostico) {
    campo("diagnostica", plan.diagnostico.quien);
    campo("diagnostica_hipotesis_max", plan.diagnostico.hipotesis_max);
    campo("diagnostica_es_no_es", plan.diagnostico.es_no_es ? "si" : "no");
  }
  campo("constructores", plan.constructores.map((c) => `${c.agente} (${c.ficheros.length} ficheros)`).join(", ") || "ninguno");
  campo("jueces", plan.jueces.join(", ") || "ninguno");
  campo("jueces_min", plan.jueces_min);
  if (plan.jueces_requeridos.length) campo("jueces_requeridos", plan.jueces_requeridos.join(", "));
  for (const c of plan.condicionales) campo("condicional", `${c.agente} si ${c.si} (bandera ${c.flag})`);
  for (const f of plan.fases) {
    campo(`fase ${f.n}`, f.modo);
    campo(`fase_${f.n}_agentes`, f.agentes.map((a) => `${a.agente} (${a.rol})`).join(", "));
    if (f.finalidad) campo(`fase_${f.n}_finalidad`, f.finalidad);
  }
  if (plan.al_final.length) campo("al_final", `${plan.al_final.join(", ")} (varios constructores: los toca uno solo al final)`);
  if (plan.cierre) campo("cierre", plan.cierre);
  campo("rondas_max", plan.rondas_max);
  campo("minutos", plan.minutos);
  campo("pipeline", plan.pipeline);
  for (const a of plan.avisos) campo("aviso", a);
  if (redim) {
    campo("redimensionar", redim.redimensionar ? "si" : "no");
    campo("redimensionar_motivos", redim.motivos.join(", ") || "ninguno");
    campo("redimensionar_ficheros_fuera", redim.ficheros_fuera.length);
  } else campo("redimensionar", "sin comparar (da el número de un encargo y --diff)");
  return l.join("\n");
}

// ── El brief de cada agente ─────────────────────────────────────────────────────────────────────

let _real = null;
const depsReales = () => (_real ??= { datos: leerEstandares(RAIZ), registro: leerNormasEn(RAIZ), precedencia: leerPrecedencia(RAIZ), mapaSkills: cargarMapa(RAIZ) });

/** Qué acciones del catálogo de estándares sirven para este agente en esta fase, por orden de preferencia. */
function accionesDeFase(rol, finalidad, esqueleto) {
  if (finalidad === LITERALES.finalidades[0]) return ["diagnosticar", "juzgar"];
  if (finalidad === LITERALES.finalidades[1]) return ["medir", "construir"];
  if (finalidad === LITERALES.finalidades[2]) return ["medir", "juzgar"];
  if (rol === "judge" || rol === "measurer") return ["juzgar", "medir"];
  return esqueleto?.irreversible_needs_close ? ["operar", "construir"] : ["construir", "operar"];
}

/**
 * La tarea del catálogo de estándares que le toca a un agente en una fase. Con una finalidad concreta (diagnosticar, medir antes o
 * después) manda la acción; si no, manda la coincidencia de ámbitos con los ficheros y la acción desempata.
 */
export function tareaParaFase(plan, agente, fase, datos) {
  const ag = datos.agentes[agente];
  if (!ag) return null;
  if (plan.tarea && fase.rol === "builder") {
    if (!ag.tareas.some((t) => t.id === plan.tarea)) throw new Error(`${agente} no tiene la tarea «${plan.tarea}»; tiene: ${ag.tareas.map((t) => t.id).join(", ")}`);
    return { id: plan.tarea, aproximada: false };
  }
  const quiero = accionesDeFase(fase.rol, fase.finalidad, TYPES[plan.tipo].skeleton);
  const cand = ag.tareas.filter((t) => quiero.includes(t.accion)).map((t) => ({ t, solape: (t.ambitos ?? []).filter((a) => plan.ambitos.includes(a)).length, rango: quiero.indexOf(t.accion) }));
  if (fase.finalidad) cand.sort((a, b) => a.rango - b.rango || b.solape - a.solape);
  else cand.sort((a, b) => b.solape - a.solape || a.rango - b.rango);
  return cand[0] ? { id: cand[0].t.id, aproximada: cand[0].solape === 0 } : null;
}

/**
 * El brief de un agente del plan (las nueve piezas de `/orquestar`, sección 4), como texto para pegar. `opciones.fase`: la fase del plan
 * (la primera en que aparece el agente, si no se da). Lanza si el agente no está en el plan.
 */
export function briefDe(plan, agente, opciones = {}, deps = depsReales()) {
  const fases = plan.fases.filter((f) => f.agentes.some((a) => a.agente === agente));
  if (!fases.length) throw new Error(`${agente} no está en el plan (agentes: ${unicos(plan.fases.flatMap((f) => f.agentes.map((a) => a.agente))).join(", ")})`);
  const fase = opciones.fase ? plan.fases.find((f) => f.n === opciones.fase && f.agentes.some((a) => a.agente === agente)) : fases[0];
  if (!fase) throw new Error(`${agente} no interviene en la fase ${opciones.fase}`);
  const rol = fase.agentes.find((a) => a.agente === agente).rol;
  const suyos = plan.constructores.find((c) => c.agente === agente)?.ficheros;
  const alcance = rol === "builder" && suyos ? suyos : plan.ficheros;
  const tarea = tareaParaFase(plan, agente, { rol, finalidad: fase.finalidad }, deps.datos);
  const skills = skillsDelEncargo({ ficheros: alcance, comandos: [], mapa: deps.mapaSkills, precargadas: precargadasDe(RAIZ, agente) });
  const abrir = skills.filter((s) => !s.precargada).map((s) => s.skill);
  const estandar = tarea
    // El proyecto del brief es el de una sesión sin marca (PROYECTO_POR_DEFECTO, homenu): el segundo uso declarado de D1 (#748); no es un «sin proyecto».
    ? [tarea.aproximada ? `Coincidencia: aproximada (ninguna tarea de ${agente} es de los ámbitos ${plan.ambitos.join(", ") || "de los ficheros"}; si el encargo no encaja en ninguna, es la señal de una tarea que falta)` : null,
      textoDeTarea(agente, tarea.id, deps.datos, deps.registro, { ficheros: alcance, precedencia: deps.precedencia, proyecto: PROYECTO_POR_DEFECTO })].filter(Boolean).join("\n")
    : `ESTÁNDAR: ninguna tarea del catálogo para ${agente} en esta fase (${agente in deps.datos.agentes ? "ninguna de sus tareas es de la acción que toca" : "no es un agente de .claude/agents/"}); dilo en el informe`;
  const forma = {
    [FORMAS.diagnosticar]: "primero se diagnostica (causa raíz y test que reproduce el fallo), después se arregla, y el juez repite",
    [FORMAS.medir]: `se mide antes y después (${plan.medicion?.kind ?? "medida"}${plan.medicion?.counters.length ? `: ${plan.medicion.counters.join(", ")}` : ""}) y la cifra va al informe`,
    [FORMAS.soloJueces]: "solo se mira, sin tocar nada, y los jueces trabajan a la vez",
    [FORMAS.construir]: "construye el constructor y juzga uno distinto",
  }[plan.forma];
  return [
    `BRIEF DE ${agente} — rol: ${rol}, fase ${fase.n} de ${plan.fases.length} (${fase.modo})`,
    `Rol: ${rol}`,
    `1. Objetivo: ${plan.objetivo ?? "(sin objetivo escrito: lo da quien orquesta)"}`,
    `2. Contexto: ${plan.numero ? `encargo #${plan.numero}; ` : ""}tipo ${plan.tipo}, subtipo ${plan.subtipo}, alcance ${plan.alcance}, complejidad ${plan.complejidad}; ${forma}. Fases: ${plan.fases.map((f) => `${f.n}=${f.agentes.map((a) => a.agente).join("+")}`).join(" → ")}`,
    `3. Alcance: ${alcance.length ? alcance.join(", ") : "sin ficheros dados"}${rol === "builder" && plan.constructores.length > 1 ? `; los de los otros constructores (${plan.constructores.filter((c) => c.agente !== agente).map((c) => c.agente).join(", ")}) no son tuyos` : ""}${plan.al_final.length ? `; ${plan.al_final.join(", ")} los toca uno solo al final` : ""}`,
    `4. Rama: ${plan.rama ?? "la de la tarea (`npm run tarea -- <area>/<nombre> <n>`)"}`,
    `5. Verificación: ${plan.verificacion ?? plan.hecho_cuando ?? "tests de lo que tocas y `npm run vecinos`; el CI de su PR en verde"}`,
    `6. SKILLS A ABRIR: ${abrir.length ? abrir.join(", ") : "ninguna"}`,
    `7. Lo ya apuntado: pasa \`npm run buscar -- "${plan.ambitos.join(" ")} ${alcance.slice(0, 3).join(" ")}"\` y \`npm run issues\` antes de dar nada por nuevo; cada hallazgo lleva \`YA APUNTADO: #n\` o \`NUEVO (buscado: …)\``,
    "8. Estándar de la tarea:",
    estandar,
    "9. Recordatorio: termina con el informe común de `.claude/PLANTILLA-AGENTE.md`, con `CASOS:`, `SKILLS:` y `ESTÁNDAR:`. Quien construye no juzga.",
  ].join("\n");
}
