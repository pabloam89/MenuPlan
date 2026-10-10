/**
 * Los criterios de cada skill y sus juicios (#457, fondo #455): por cada criterio de
 * `ops/forja.json` que se aplica a una skill, un estado del vocabulario de la forja
 * (`ESTADOS_CRITERIO`: cumple, no_cumple, no_aplica, juicio) y, solo en el hueco, una
 * nota. Una skill es un continuo; los criterios la sistematizan con discretos, y
 * corregir es ver qué falla en qué hueco.
 *
 * Un dato en un solo sitio. Cada fila sale de uno de tres orígenes (`ORIGENES`):
 *   - control: el criterio tiene un fichero que lo vigila; el estado lo calcula ese
 *     control con los códigos que emiten la higiene y el nivel 1, el estándar de cada
 *     tipo y el glosario. No se escribe en ningún sitio;
 *   - calculo: el criterio es de juicio, pero se deduce de una medida guardada y vigente
 *     (las pasadas del nivel 2 en `ops/skills-prueba/`). Tampoco se escribe;
 *   - juicio: lo escribe una persona o un agente en `ops/juicios-skills/<skill>.json`
 *     (un «juicio de skill»), con los campos de `campos_ficha.juicio` de ops/forja.json:
 *     evidencia que existe, fecha, firmante y la versión del SKILL.md que juzgó. Si el
 *     SKILL.md cambia, el juicio vuelve a pendiente (`otra_version`) sin que nadie lo toque.
 * Lo que es del criterio (le falta una medida o una decisión) va al criterio, con
 * `pendiente_de` y `motivo_pendiente`; el juicio solo lleva lo propio de su skill.
 *
 * `npm run higiene-skills` y el informe de cumplimiento lo enseñan en líneas
 * `skill: x criterio: y estado: z` (`lineaDeFicha` de forja.mjs), que se pueden contar.
 * Lo vigila `ops/criterios-skills.test.js`. Repo público: las notas dicen qué falla,
 * no cómo saltarse un control.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { hashLF } from "./evals.mjs";
import { CAPAS_AGENTE } from "./fondos.mjs";
import {
  ESTADOS_CON_NOTA, ESTADOS_CRITERIO, JUICIO, criteriosDeTipo, leerForja, lineaDeFicha, motivosPendienteEn, problemasDeCampos,
} from "./forja.mjs";
import { leerGlosario, medir } from "./glosario.mjs";
import { ctxHigiene, higieneDeSkill, scriptsDeNpm } from "./higieneSkills.mjs";
import { pasadaVigente } from "./saludSkills.mjs";
import { DIR_SKILLS, NIVEL_META, RAIZ, cargarSkill, nivelDe, nombresDeSkills, parsearSkill, tiposDeSkill } from "./skills.mjs";
import { faltasDeEstandares } from "./skillsForja.mjs";

export const DIR_JUICIOS = "ops/juicios-skills";
export const RUTA_PLANTILLA = ".claude/PLANTILLA-SKILL.md";
export const DIR_PASADAS = "ops/skills-prueba";

/** De dónde sale el estado de una fila (vocabulario cerrado). */
export const ORIGENES = {
  control: "Lo calcula el control del criterio (un fichero del repo); no se escribe a mano",
  calculo: "Criterio de juicio que se deduce de una medida guardada y vigente (ops/skills-prueba); no se escribe a mano",
  juicio: "Lo escribe una persona o un agente en ops/juicios-skills/<skill>.json, con su evidencia",
};

/** Los vocabularios que pide `campos_ficha.juicio`. El firmante es un actor de los fondos: una sola lista (CAPAS_AGENTE). */
export const vocabulariosDeJuicio = () => ({
  estados_criterio: Object.keys(ESTADOS_CRITERIO),
  motivos_pendiente: motivosPendienteEn("juicio"),
  firmantes: CAPAS_AGENTE,
});

export const MIN_NOTA = 8;
export const MAX_NOTA = 400;
/** Prefijos de una evidencia que no es una ruta. */
export const PREFIJOS_EVIDENCIA = { caso: "caso:", npm: "npm run ", pr: "pr:", issue: "issue:" };
const LARGO_VERSION = 12;

export const esAutomatico = (c) => c.control !== JUICIO;
const plana = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
/** La versión de un SKILL.md, como la guarda skills-prueba (`version.skill_md`). */
export const versionDe = (texto) => hashLF(texto);

/** Los criterios que se aplican a una skill: los de su tipo; a la pieza meta (nivel 0), todos los de skill. */
export function criteriosDeSkill(datos, metadata) {
  if (nivelDe(metadata) === NIVEL_META) return datos.criterios.filter((c) => c.aplica_a.includes("skill"));
  return criteriosDeTipo(datos, metadata?.tipo);
}

// ── Lo que calculan los controles ─────────────────────────────────────────

/**
 * Los cálculos de los criterios automáticos que no emiten un código propio. Reciben las
 * señales de la skill y devuelven { estado, nota }. Un criterio automático sin código y
 * sin cálculo aquí es un hueco: `problemasDeControles` lo dice.
 */
export const CALCULOS_SIN_CODIGO = {
  "vocabulario-canonico": (s) => {
    const n = s.glosario.length;
    if (!n) return { estado: "cumple", nota: null };
    const sinonimos = [...new Set(s.glosario.map((d) => `${d.sinonimo}→${d.canonico}`))].join(", ");
    return { estado: "no_cumple", nota: `${n} sinónimo(s) prohibido(s) en la skill (${sinonimos}); admitidos en ops/glosario-excepciones.json` };
  },
};

/** Los fallos de disparo de las pasadas vigentes en los que una skill es la esperada o la elegida. */
function dudasDe(nombre, pasadas) {
  const fuera = [];
  for (const [de, p] of Object.entries(pasadas)) {
    if (!p) continue;
    for (const x of p.disparo ?? []) if (x.estado !== "ok" && (x.esperado === nombre || x.elegido === nombre)) fuera.push(`${de}/${x.id}: esperaba ${x.esperado}, eligió ${x.elegido}`);
  }
  return fuera;
}

/**
 * Criterios de juicio que se deducen de las pasadas vigentes del nivel 2. Devuelven
 * { estado, nota } (con `motivo` si quedan pendientes). Nadie los escribe a mano.
 */
export const CALCULOS_DE_JUICIO = {
  "sin-duda-con-vecina": (s, nombre) => {
    const dudas = dudasDe(nombre, s.pasadas);
    if (dudas.length) return { estado: "no_cumple", nota: `duda en el disparo: ${dudas.join("; ")}` };
    if (!s.pasadas[nombre]) return { estado: "juicio", motivo: "sin_pasada", nota: null };
    return { estado: "cumple", nota: null };
  },
  "casos-medidos-con-y-sin-skill": (s, nombre) => {
    const propia = s.pasadas[nombre];
    if (!propia) return { estado: "juicio", motivo: "sin_pasada", nota: null };
    if (Number(propia.sin_skill?.ejecuciones) > 1) return { estado: "cumple", nota: null };
    return { estado: "no_cumple", nota: "la pasada vigente mide solo con la skill puesta" };
  },
};

/** Los criterios automáticos de skill que ningún cálculo cubre (deberían ser cero), y cálculos de juicio sobre criterios que no lo son. */
export function problemasDeControles(datos) {
  const malos = datos.criterios
    .filter((c) => c.aplica_a.includes("skill") && esAutomatico(c) && typeof c.codigo !== "string" && !(c.id in CALCULOS_SIN_CODIGO))
    .map((c) => `${c.id}: criterio con control ${c.control} y sin código ni cálculo en CALCULOS_SIN_CODIGO: no se puede saber su estado`);
  for (const id of Object.keys(CALCULOS_DE_JUICIO)) {
    const c = datos.criterios.find((x) => x.id === id);
    if (!c || esAutomatico(c)) malos.push(`${id}: CALCULOS_DE_JUICIO es para criterios de juicio que existen`);
  }
  return malos;
}

/**
 * El estado de un criterio automático para una skill, a partir de sus señales:
 * `defectos` (los de `higieneDeSkill`, que ya trae el nivel 1, la forja y la caducidad),
 * `estandar` (faltas del estándar de su tipo en la plantilla; null en la pieza meta, que
 * no tiene tipo) y `glosario` (sinónimos prohibidos en sus ficheros).
 */
export function estadoDeControl(c, s) {
  if (c.sujeto === "plantilla.tipo") {
    if (s.estandar === null) return { estado: "no_aplica", nota: null };
    const f = s.estandar.filter((x) => x.codigo === c.codigo);
    return f.length ? { estado: "no_cumple", nota: plana(f.map((x) => x.detalle).join("; ")) } : { estado: "cumple", nota: null };
  }
  if (typeof c.codigo === "string") {
    const f = s.defectos.filter((d) => d.codigo === c.codigo);
    return f.length ? { estado: "no_cumple", nota: plana(f.map((d) => d.detalle).join("; ")) } : { estado: "cumple", nota: null };
  }
  const calculo = CALCULOS_SIN_CODIGO[c.id];
  // Sin cálculo, el estado queda pendiente y lo dice; problemasDeControles lo convierte en un test en rojo.
  if (!calculo) return { estado: "juicio", nota: `sin cálculo del control ${c.control}: falta en CALCULOS_SIN_CODIGO` };
  return calculo(s);
}

/** Las señales de todas las skills del repo, de una vez: { nombre: { metadata, version, defectos, estandar, glosario, pasadas } }. */
export function senalesDelRepo(raiz = RAIZ, hoy = new Date()) {
  const nombres = nombresDeSkills(raiz);
  const skills = nombres.map((n) => cargarSkill(n, raiz));
  const meta = Object.fromEntries(skills.map((s) => [s.nombre, parsearSkill(s.texto).meta?.metadata ?? {}]));
  const plantilla = readFileSync(join(raiz, RUTA_PLANTILLA), "utf8");
  const estandar = faltasDeEstandares(plantilla, tiposDeSkill(raiz), skills.map((s) => ({ nombre: s.nombre, tipo: meta[s.nombre].tipo, texto: s.texto })));
  const { detalle } = medir(raiz, leerGlosario(raiz));
  const pasadas = Object.fromEntries(nombres.map((n) => [n, pasadaVigente(n, raiz)]));
  const fuera = {};
  for (const s of skills) {
    const m = meta[s.nombre];
    const dir = `${DIR_SKILLS}/${s.nombre}/`;
    fuera[s.nombre] = {
      metadata: m,
      version: versionDe(s.texto),
      defectos: higieneDeSkill(s, ctxHigiene(s.nombre, raiz, hoy)),
      estandar: nivelDe(m) === NIVEL_META ? null : estandar.filter((x) => x.tipo === m.tipo),
      glosario: detalle.filter((d) => d.ruta.startsWith(dir)),
      pasadas,
    };
  }
  return fuera;
}

// ── Los juicios guardados ─────────────────────────────────────────────────

export const rutaDeJuicios = (nombre) => `${DIR_JUICIOS}/${nombre}.json`;

/** Los juicios guardados: { skill: contenido } (los que no son JSON, con { error }). */
export function leerJuicios(raiz = RAIZ) {
  const dir = join(raiz, DIR_JUICIOS);
  if (!existsSync(dir)) return {};
  const fuera = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    try {
      fuera[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      // a propósito: un JSON roto se devuelve como error y problemasDeJuicios lo dice; no se traga
      fuera[f.replace(/\.json$/, "")] = { error: e.message };
    }
  }
  return fuera;
}

/** El contexto para validar evidencias: `existe(ruta)`, `leer(ruta)`, `casosDe(skill)`, `scriptsNpm`, `pasadaVigente(skill)` y `hoy`. */
export function ctxEvidencia(raiz = RAIZ, hoy = new Date()) {
  const casos = {};
  return {
    hoy,
    existe: (r) => existsSync(join(raiz, r)),
    leer: (r) => readFileSync(join(raiz, r), "utf8"),
    casosDe: (s) => {
      if (!(s in casos)) {
        const ruta = join(raiz, DIR_SKILLS, s, "casos.json");
        casos[s] = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, "utf8")).casos ?? []).map((c) => c.id) : null;
      }
      return casos[s];
    },
    scriptsNpm: scriptsDeNpm(raiz),
    pasadaVigente: (s) => pasadaVigente(s, raiz),
  };
}

/**
 * Por qué una evidencia no vale (null si vale):
 *   - `caso:<skill>/<id>`: un caso de prueba de esa skill;
 *   - `npm run <script>`: un script de package.json;
 *   - `pr:<n>` o `issue:<n>`: un PR o un issue (solo la forma: sin red no se mira que exista);
 *   - una ruta del repo, con `#Título` opcional de una cabecera de ese Markdown. Una pasada del
 *     nivel 2 (`ops/skills-prueba/<skill>.json`) solo vale si está vigente: si no, mide otra skill.
 */
export function faltaDeEvidencia(ref, ctx) {
  if (typeof ref !== "string" || !ref.trim()) return "evidencia vacía";
  const P = PREFIJOS_EVIDENCIA;
  if (ref.startsWith(P.caso)) {
    const m = ref.slice(P.caso.length).match(/^([\w-]+)\/([\w-]+)$/);
    if (!m) return `«${ref}»: un caso se cita como caso:<skill>/<id>`;
    const ids = ctx.casosDe(m[1]);
    if (!ids) return `«${ref}»: la skill ${m[1]} no tiene casos.json`;
    return ids.includes(m[2]) ? null : `«${ref}»: ${m[1]} no tiene el caso ${m[2]}`;
  }
  if (ref.startsWith(P.npm)) {
    const n = ref.slice(P.npm.length).split(/\s/)[0];
    return ctx.scriptsNpm.includes(n) ? null : `«${ref}»: no hay npm run ${n} en package.json`;
  }
  if (ref.startsWith(P.pr) || ref.startsWith(P.issue)) return /^(pr|issue):[1-9]\d{0,6}$/.test(ref) ? null : `«${ref}»: un PR o un issue se cita como pr:<n> o issue:<n>`;
  const [ruta, titulo] = ref.split("#");
  if (/[\s<>*]/.test(ruta) || ruta.startsWith("/") || ruta.includes("..")) return `«${ref}»: no es ni una ruta del repo, ni caso:, ni npm run, ni pr: o issue:`;
  if (!ctx.existe(ruta)) return `«${ref}»: ${ruta} no existe`;
  const pasada = ruta.startsWith(`${DIR_PASADAS}/`) && ruta.endsWith(".json") ? ruta.slice(DIR_PASADAS.length + 1, -".json".length) : null;
  if (pasada && !ctx.pasadaVigente(pasada)) return `«${ref}»: la pasada de ${pasada} está desactualizada (se hizo con otro SKILL.md o casos.json): relánzala con npm run skills-prueba o no la cites`;
  if (titulo === undefined) return null;
  const cabeceras = ctx.leer(ruta).replace(/\r\n/g, "\n").split("\n").filter((l) => /^#{1,4} /.test(l)).map((l) => l.replace(/^#+ /, "").trim());
  return cabeceras.includes(titulo.trim()) ? null : `«${ref}»: ${ruta} no tiene la cabecera «${titulo}»`;
}

/** De dónde sale cada criterio: «control» si lo vigila un fichero, «calculo» si lo deduce una medida, «juicio» si se escribe. */
export const origenDe = (c) => (esAutomatico(c) ? "control" : c.id in CALCULOS_DE_JUICIO ? "calculo" : "juicio");

/**
 * Los errores de los juicios guardados de una skill (lista vacía si están bien).
 * `guardada`: el contenido de ops/juicios-skills/<skill>.json (o undefined); `metadata`: la
 * de la skill; `ctx`: el de `ctxEvidencia`.
 */
export function problemasDeJuicios(nombre, guardada, metadata, datos, ctx) {
  const ruta = rutaDeJuicios(nombre);
  if (!guardada) return [`${nombre}: no tiene juicios (${ruta}); toda skill tiene los suyos, aunque estén pendientes con su motivo_pendiente`];
  if (guardada.error) return [`${ruta}: no es JSON (${guardada.error})`];
  const malos = [];
  for (const k of Object.keys(guardada)) if (!["skill", "juicios"].includes(k)) malos.push(`${ruta}: clave «${k}» no admitida (solo skill y juicios)`);
  if (guardada.skill !== nombre) malos.push(`${ruta}: «skill» es «${guardada.skill}», no ${nombre}`);
  const juicios = guardada.juicios;
  if (!juicios || typeof juicios !== "object" || Array.isArray(juicios)) return [...malos, `${ruta}: «juicios» es un objeto criterio → juicio`];
  const aplicables = criteriosDeSkill(datos, metadata);
  const porId = new Map(datos.criterios.map((c) => [c.id, c]));
  for (const c of aplicables.filter((x) => origenDe(x) === "juicio")) {
    if (!(c.id in juicios)) malos.push(`${ruta}: falta el criterio de juicio «${c.id}»; si nadie lo ha juzgado, { "estado": "juicio", "motivo_pendiente": "sin_mirar" }`);
  }
  const vocabularios = vocabulariosDeJuicio();
  // La forma de cada campo es la de campos_ficha.juicio; la evidencia la mira faltaDeEvidencia, que da el motivo.
  const ctxCampos = { vocabularios, existe: () => true };
  for (const [id, j] of Object.entries(juicios)) {
    const d = `${ruta}: ${id}`;
    const c = porId.get(id);
    if (!c) { malos.push(`${d}: no es un criterio de ops/forja.json`); continue; }
    if (!aplicables.includes(c)) { malos.push(`${d}: no se aplica a esta skill (su tipo o su nivel)`); continue; }
    if (origenDe(c) === "control") { malos.push(`${d}: lo vigila ${c.control}; su estado lo calcula el control y no se escribe a mano`); continue; }
    if (origenDe(c) === "calculo") { malos.push(`${d}: se deduce de las pasadas del nivel 2 (CALCULOS_DE_JUICIO) y no se escribe a mano`); continue; }
    if (!j || typeof j !== "object" || Array.isArray(j)) { malos.push(`${d}: es un objeto`); continue; }
    malos.push(...problemasDeCampos(j, "juicio", datos, ctxCampos).map((m) => `${d}: ${m}`));
    if (!(j.estado in ESTADOS_CRITERIO)) continue;
    if (j.estado === "juicio") {
      if (!j.motivo_pendiente) malos.push(`${d}: un juicio pendiente lleva motivo_pendiente (${vocabularios.motivos_pendiente.join(", ")})`);
      if (["falta_herramienta", "falta_decision"].includes(j.motivo_pendiente) && (c.motivo_pendiente !== j.motivo_pendiente || !c.pendiente_de)) {
        malos.push(`${d}: ${j.motivo_pendiente} es del criterio: ponlo en ops/forja.json (pendiente_de con su issue y motivo_pendiente: ${j.motivo_pendiente})`);
      }
    } else {
      if ("motivo_pendiente" in j) malos.push(`${d}: motivo_pendiente solo va con estado juicio`);
      for (const k of ["evidencia", "fecha", "firmante", "version_skill_md"]) if (!(k in j)) malos.push(`${d}: un juicio hecho (${j.estado}) lleva «${k}»`);
      if (typeof j.fecha === "string" && Date.parse(`${j.fecha}T00:00:00Z`) > ctx.hoy.getTime() + 86_400_000) malos.push(`${d}: la fecha ${j.fecha} es futura`);
      if ("version_skill_md" in j && (typeof j.version_skill_md !== "string" || j.version_skill_md.length !== LARGO_VERSION)) malos.push(`${d}: version_skill_md es el hash de ${LARGO_VERSION} del SKILL.md juzgado`);
    }
    if (j.estado === "no_cumple" && !j.nota) malos.push(`${d}: un no_cumple lleva «nota» (qué falla en el hueco)`);
    if (["cumple", "no_aplica"].includes(j.estado) && "nota" in j) malos.push(`${d}: la nota solo va con ${ESTADOS_CON_NOTA.join(" o ")} (el hueco); con ${j.estado}, la evidencia basta`);
    if ("nota" in j && (typeof j.nota !== "string" || plana(j.nota).length < MIN_NOTA || /\n/.test(j.nota) || j.nota.length > MAX_NOTA)) malos.push(`${d}: la nota es una línea de ${MIN_NOTA} a ${MAX_NOTA} caracteres`);
    if (Array.isArray(j.evidencia)) for (const r of j.evidencia) { const m = faltaDeEvidencia(r, ctx); if (m) malos.push(`${d}: ${m}`); }
  }
  return malos;
}

// ── Los criterios evaluados de una skill ──────────────────────────────────

const notaPendiente = (motivo, c, nota) => plana([motivo, c.pendiente_de && c.motivo_pendiente === motivo ? `(${c.pendiente_de})` : null, nota ? `— ${nota}` : null].filter(Boolean).join(" "));

/**
 * Los criterios de una skill con su estado: una fila por criterio que se le aplica, en el orden
 * del catálogo: { criterio, capa, control, origen, estado, motivo, nota, evidencia }.
 */
export function criteriosEvaluados(nombre, senales, guardada, datos) {
  const juicios = guardada?.juicios ?? {};
  return criteriosDeSkill(datos, senales.metadata).map((c) => {
    const base = { criterio: c.id, capa: c.capa, control: c.control, origen: origenDe(c), motivo: null, evidencia: [] };
    if (base.origen === "control") {
      const r = estadoDeControl(c, senales);
      return { ...base, estado: r.estado, nota: r.estado === "no_cumple" || r.estado === "juicio" ? r.nota : null };
    }
    if (base.origen === "calculo") {
      const r = CALCULOS_DE_JUICIO[c.id](senales, nombre);
      return { ...base, estado: r.estado, motivo: r.motivo ?? null, nota: r.estado === "juicio" ? notaPendiente(r.motivo, c, r.nota) : r.nota, evidencia: senales.pasadas[nombre] ? [`${DIR_PASADAS}/${nombre}.json`] : [] };
    }
    const j = juicios[c.id];
    if (!j) return { ...base, estado: "juicio", motivo: "sin_mirar", nota: `sin_mirar — sin juicio guardado en ${rutaDeJuicios(nombre)}` };
    if (j.estado !== "juicio" && j.version_skill_md !== senales.version) {
      return { ...base, estado: "juicio", motivo: "otra_version", nota: `otra_version — juzgado (${j.estado}) sobre otro SKILL.md (${j.version_skill_md ?? "sin versión"}; hoy ${senales.version})`, evidencia: j.evidencia ?? [] };
    }
    if (j.estado === "juicio") return { ...base, estado: "juicio", motivo: j.motivo_pendiente ?? null, nota: notaPendiente(j.motivo_pendiente, c, j.nota), evidencia: j.evidencia ?? [] };
    return { ...base, estado: j.estado, nota: j.nota ?? null, evidencia: j.evidencia ?? [] };
  });
}

/** Las líneas contables: `skill: x criterio: y estado: z [nota: …]`. */
export function lineasDeCriterios(nombre, filas, { estados } = {}) {
  return filas
    .filter((f) => !estados || estados.includes(f.estado))
    .map((f) => lineaDeFicha({ artefacto: "skill", nombre, criterio: f.criterio, estado: f.estado, nota: ESTADOS_CON_NOTA.includes(f.estado) ? plana(f.nota) : null }));
}

/** Cifras: criterios, vigilados por un control, de juicio (y de ellos, calculados y juzgados), cada estado y cada motivo de lo pendiente. */
export function cifrasDeCriterios(filas) {
  const c = { criterios: filas.length, vigilados: 0, de_juicio: 0, calculados: 0, juzgados: 0 };
  for (const e of Object.keys(ESTADOS_CRITERIO)) c[e] = 0;
  const motivos = {};
  for (const f of filas) {
    if (f.origen === "control") c.vigilados++;
    else {
      c.de_juicio++;
      if (f.origen === "calculo") c.calculados++;
      if (f.estado !== "juicio") c.juzgados++;
    }
    c[f.estado]++;
    if (f.estado === "juicio" && f.motivo) motivos[f.motivo] = (motivos[f.motivo] ?? 0) + 1;
  }
  return { ...c, motivos };
}

/** La línea de cifras de una skill, para contarla. */
export function lineaDeCifras(nombre, c) {
  return `criterios skill: ${nombre} criterios: ${c.criterios} vigilados: ${c.vigilados} de_juicio: ${c.de_juicio} calculados: ${c.calculados} juzgados: ${c.juzgados} cumple: ${c.cumple} no_cumple: ${c.no_cumple} no_aplica: ${c.no_aplica} juicio: ${c.juicio}`;
}

/** Suma las cifras de varias skills (los motivos, por motivo). */
export function sumarCifras(lista) {
  const t = { motivos: {} };
  for (const c of lista) {
    for (const [k, v] of Object.entries(c)) if (k !== "motivos") t[k] = (t[k] ?? 0) + v;
    for (const [m, v] of Object.entries(c.motivos ?? {})) t.motivos[m] = (t.motivos[m] ?? 0) + v;
  }
  return t;
}

/** La frase del conjunto. */
export function lineaDelConjunto(n, t) {
  const motivos = Object.entries(t.motivos ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => `${m} ${v}`).join(", ") || "ninguno";
  return `Criterios: ${n} skills, ${t.criterios ?? 0} criterios aplicados: ${t.vigilados ?? 0} vigilados por un control y ${t.de_juicio ?? 0} de juicio (${t.calculados ?? 0} deducidos de una medida, ${t.juzgados ?? 0} juzgados, ${t.juicio ?? 0} pendientes); cumple ${t.cumple ?? 0}, no_cumple ${t.no_cumple ?? 0}, no_aplica ${t.no_aplica ?? 0}; pendientes por motivo: ${motivos}.`;
}

/** Los criterios evaluados de todas las skills del repo: [{ nombre, filas, cifras }]. */
export function criteriosDelRepo(raiz = RAIZ, hoy = new Date(), { senales = senalesDelRepo(raiz, hoy), guardadas = leerJuicios(raiz), datos = leerForja(raiz) } = {}) {
  return Object.entries(senales).map(([nombre, s]) => {
    const filas = criteriosEvaluados(nombre, s, guardadas[nombre], datos);
    return { nombre, filas, cifras: cifrasDeCriterios(filas) };
  });
}
