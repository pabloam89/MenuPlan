/**
 * tiposDeEncargo.mjs — el lector único de los tipos de encargo (#640, fondo #639; la puerta de entrada, #646, fondo #645).
 *
 * `ops/tipos-de-encargo.json` es el dato: CINCO tipos (create, fix, improve, operate, audit), cada uno con el esqueleto
 * mínimo de pasos, y sus SUBTIPOS (`tipos` en el JSON, nombre histórico que lee el panel de la factoría y no se renombra).
 * Un subtipo está `active` (se ofrece y lo usa el dimensionador) o `retired` (un alias de un id de antes, con `replaced_by`).
 * Aquí viven la lectura, las reglas de forma y de la PUERTA DE ENTRADA (`problemas`, con el nombre de la regla al principio de
 * cada línea) y la tabla de `/orquestar`, que se GENERA desde el JSON. Los agentes salen de `.claude/agents/` (agentes.mjs) y el
 * presupuesto, de `ops/presupuestos.json` (presupuestos.mjs): `encargoDe` los junta sin copiar nada.
 *
 * No calcula agentes desde el diff (eso es E2, #641): dado un subtipo, un alcance, una causa y una complejidad,
 * devuelve lo que dicen los dos catálogos.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENTES, CONSTRUCTORES, JUECES } from "./agentes.mjs";
import { AMBITOS, JUEZ_SIEMPRE } from "./ambitos.mjs";
import { MAX_NOTA_SUBTIPO } from "./issues.mjs";
import { CATALOGO as PRESUPUESTOS, COMPLEXITIES, PIPELINES, presupuestoDe } from "./presupuestos.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUTA_TIPOS = "ops/tipos-de-encargo.json";
export const RUTA_ORQUESTAR = ".claude/commands/orquestar.md";
export const MARCA_INICIO = "<!-- tipos:tabla:inicio -->";
export const MARCA_FIN = "<!-- tipos:tabla:fin -->";
export const MARCA_N1_TIPOS_INICIO = "<!-- n1:encargo:tipos:inicio -->";
export const MARCA_N1_TIPOS_FIN = "<!-- n1:encargo:tipos:fin -->";
export const MARCA_N1_PUERTA_INICIO = "<!-- n1:encargo:puerta:inicio -->";
export const MARCA_N1_PUERTA_FIN = "<!-- n1:encargo:puerta:fin -->";
export const MARCA_JUECES_INICIO = "<!-- ambitos:jueces:inicio -->";
export const MARCA_JUECES_FIN = "<!-- ambitos:jueces:fin -->";

export const leerTipos = (raiz = RAIZ) => JSON.parse(readFileSync(join(raiz, RUTA_TIPOS), "utf8"));
export const DATOS = leerTipos();

/** Los cinco tipos: { id: { what, skeleton } }. */
export const TYPES = DATOS.assignment_types;
/** TODOS los subtipos del JSON, activos y retirados (los alias del panel), agrupados: primero los activos. */
export const ALL_SUBTYPES = DATOS.tipos;
/** Los subtipos ACTIVOS: los que se ofrecen al crear un encargo y los únicos que usará el dimensionador (#641). */
export const SUBTYPES = ALL_SUBTYPES.filter((s) => s.status === "active");
/** Los alias retirados: ids de antes que se conservan solo para el panel, cada uno con su `replaced_by`. */
export const ALIASES = ALL_SUBTYPES.filter((s) => s.status === "retired");
/** Las banderas de una condición: { id: { si, what } }. */
export const FLAGS = DATOS.flags;
/** Los vocabularios cerrados de un subtipo: { valor: { what } }. */
export const DIFFERS_IN = DATOS.differs_in;
export const CLOSINGS = DATOS.closings;
export const MEASURES = DATOS.measures;
export const COUNTERS = DATOS.counters;
export const STEP_PURPOSES = DATOS.step_purposes;
export const STATUSES = DATOS.statuses;
/** Los agentes que no son ficheros: sesion, constructor, constructores. */
export const ESPECIALES = Object.keys(DATOS.especiales);
export { COMPLEXITIES };

/** El único texto libre de un subtipo (`note`) tiene este tope de caracteres; la etiqueta (`accion`), este otro. */
export const MAX_NOTE = MAX_NOTA_SUBTIPO;
export const MAX_ACCION = 100;
/** Cuántos encargos tiene que haber con el patrón de un subtipo para que merezca serlo (la puerta, regla «repite»). */
export const MIN_USOS = 3;

/** Definición de cada vocabulario, para anclarlo (vocabulariosVida.mjs). Los subtipos, solo los activos: los retirados pasan a «retirados». */
export const textosDeTipos = (d = DATOS) => Object.fromEntries(Object.entries(d.assignment_types).map(([k, t]) => [k, t.what]));
export const textosDeSubtipos = (d = DATOS) => Object.fromEntries(d.tipos.filter((t) => t.status === "active").map((t) => [t.id, t.accion]));
export const textosDeBanderas = (d = DATOS) => Object.fromEntries(Object.entries(d.flags).map(([k, b]) => [k, b.what]));
const textosDe = (vocab) => Object.fromEntries(Object.entries(vocab ?? {}).map(([k, v]) => [k, v.what]));
export const textosDeDiffersIn = (d = DATOS) => textosDe(d.differs_in);
export const textosDeCierres = (d = DATOS) => textosDe(d.closings);
export const textosDeMedidas = (d = DATOS) => textosDe(d.measures);
export const textosDeContadores = (d = DATOS) => textosDe(d.counters);
export const textosDeFinalidades = (d = DATOS) => textosDe(d.step_purposes);
export const textosDeEstados = (d = DATOS) => textosDe(d.statuses);

const todosLosAgentes = (paso) => [...(paso.agentes ?? []), ...(paso.opcional ?? []).map((o) => o.agente)];
/** El tipo de un agente en su cabecera (`Tipo:` de .claude/agents/) y su rol en un paso. */
const ROL_DE_CABECERA = { constructor: "builder", juez: "judge" };
const CTX = { agentes: AGENTES, especiales: DATOS.special_roles };

/** El rol de un agente en un paso: builder, judge, planner (la sesión) o null. La sesión planifica; no construye por defecto. */
export function rolDe(agente, ctx = CTX) {
  if (Object.hasOwn(ctx.especiales ?? {}, agente)) return ctx.especiales[agente];
  return ROL_DE_CABECERA[ctx.agentes[agente]] ?? null;
}

/** Roles de los agentes fijos de un paso; el planner cuenta como builder si el subtipo dice que construye en la sesión. */
const rolesDelPaso = (paso, sub, ctx) => {
  const r = (paso.agentes ?? []).map((a) => rolDe(a, ctx));
  return sub.builds_in_session && r.includes("planner") ? [...r, "builder"] : r;
};

/**
 * ¿Un subtipo cumple el esqueleto de su tipo? Lista de problemas, cada uno con el nombre de su regla delante.
 * Reglas: tipo, roles (los pasos contienen, en orden, los roles del esqueleto), juez-siempre (algún juez entra
 * siempre, no solo como opcional), juez-despues, paralelo y solo-jueces (audit), cierre (operate), medida (improve).
 */
export function problemasDeEsqueleto(sub, tipos = TYPES, ctx = CTX, d = DATOS) {
  const p = [];
  const tipo = tipos?.[sub.type];
  if (!tipo) return [`tipo: ${sub.id} cuelga de «${sub.type}», que no es un tipo (${Object.keys(tipos ?? {}).join(", ")})`];
  const esq = tipo.skeleton;
  const siempre = sub.pasos.map((paso) => rolesDelPaso(paso, sub, ctx));
  let i = 0;
  for (const roles of siempre) {
    if (i < esq.roles.length && roles.includes(esq.roles[i])) i++;
  }
  if (i < esq.roles.length) p.push(`roles: ${sub.id} (${sub.type}) tiene que llevar, en este orden, ${esq.roles.join(" → ")}; le falta «${esq.roles[i]}»`);
  if (!siempre.some((r) => r.includes("judge"))) p.push(`juez-siempre: ${sub.id} no tiene ningún juez que entre siempre (un juez solo opcional no vale): el juez mínimo es obligatorio`);
  const ultimo = siempre.at(-1) ?? [];
  if (sub.type !== "audit" && ultimo.includes("builder") && !ultimo.includes("judge")) p.push(`juez-despues: ${sub.id} termina en un constructor sin juez detrás`);
  if (esq.judges_only_in_parallel) {
    if (sub.pasos.length !== 1) p.push(`paralelo: ${sub.id} (${sub.type}) va en un solo paso con todos los jueces en paralelo y tiene ${sub.pasos.length}`);
    const permitidos = new Set([...JUECES, ...(sub.measured_with ?? [])]);
    for (const a of sub.pasos.flatMap(todosLosAgentes)) if (!permitidos.has(a)) p.push(`solo-jueces: ${sub.id} nombra «${a}», que no es juez; si solo mide, va en «measured_with»`);
    for (const a of sub.measured_with ?? []) if (!sub.pasos.flatMap(todosLosAgentes).includes(a)) p.push(`solo-jueces: ${sub.id} dice que mide con «${a}» y no aparece en sus pasos`);
  } else if (sub.measured_with) p.push(`solo-jueces: ${sub.id} (${sub.type}) lleva «measured_with», que es solo de audit`);
  if (esq.irreversible_needs_close) {
    if (typeof sub.irreversible !== "boolean") p.push(`cierre: ${sub.id} (${sub.type}) dice si es irreversible («irreversible»: verdadero o falso)`);
    else if (sub.irreversible && !sub.cierra_con) p.push(`cierre: ${sub.id} es irreversible y no cierra con el OK de una persona («cierra_con»)`);
  } else if ("irreversible" in sub) p.push(`cierre: ${sub.id} (${sub.type}) lleva «irreversible», que es solo de operate`);
  if (esq.measures_before_after) {
    if (!(sub.measure_kind in (d?.measures ?? {}))) p.push(`medida: ${sub.id} (${sub.type}) dice qué se mide antes y después con un valor de «measure_kind» (${Object.keys(d?.measures ?? {}).join(", ")})`);
    else if (sub.measure_kind === "counter_before_after" && !(Array.isArray(sub.counters) && sub.counters.length && sub.counters.every((c) => c in (d?.counters ?? {})))) p.push(`medida: ${sub.id} mide un contador y dice cuáles en «counters» (${Object.keys(d?.counters ?? {}).join(", ")})`);
    else if (sub.measure_kind !== "counter_before_after" && "counters" in sub) p.push(`medida: ${sub.id} lleva «counters», que es solo de una medida de contador`);
  } else if ("measure_kind" in sub) p.push(`medida: ${sub.id} (${sub.type}) lleva «measure_kind», que es solo de improve`);
  if (sub.builds_in_session && !sub.pasos.some((paso) => (paso.agentes ?? []).includes("sesion"))) p.push(`roles: ${sub.id} dice «builds_in_session» y no tiene un paso de la sesión`);
  return p;
}

// ── La puerta de entrada de un subtipo (#645, #646) ─────────────────────────────────────────────

/** Las reglas de la puerta, con el nombre que lleva cada línea de `problemas`; el N1 del encargo las recoge tal cual. */
export const REGLAS_PUERTA = [
  { id: "plano", texto: "Mismo plano: un subtipo describe la naturaleza del trabajo y no la zona. La zona sale de los ficheros (ámbitos de scripts/lib/ambitos.mjs) y de ella salen el constructor y los jueces." },
  { id: "difiere", texto: "Difiere de su tipo en algo medible: lo declara en `differs_in` (vocabulario cerrado) y un test lo comprueba contra el esqueleto de su tipo. El subtipo liso (`plain`) es el esqueleto y no declara nada; si no difiere, no es subtipo." },
  { id: "repite", texto: `Se repite: al menos ${MIN_USOS} encargos con el patrón. Lo mide \`npm run fabrica\` y solo avisa. La válvula \`<tipo>-other\` cuenta sus usos, pide un motivo en \`subtype_note\` y, si se repite, propone un subtipo nuevo.` },
  { id: "texto-libre", texto: `Lo discreto primero: todo atributo es un valor de vocabulario cerrado o un número; los únicos huecos de texto son \`note\` (de ${MAX_NOTE} caracteres como mucho) y la etiqueta \`accion\` (la definición del valor, de ${MAX_ACCION}).` },
  { id: "nombre", texto: "Nombre con plantilla <tipo>-<objeto>, en inglés y en kebab-case: el prefijo es su tipo (create, fix, improve, operate, audit) y el objeto, de una a tres palabras." },
];

const sinAcentos = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Palabras de zona que no son ámbitos: lo que se toca, no el tipo de trabajo. Los ámbitos (ids y nombres legibles) se suman solos. */
const PALABRAS_DE_ZONA = [
  "pantalla", "pantallas", "screen", "page", "component", "componente", "endpoint", "endpoints", "lola", "esquema", "schema", "tabla", "tablas", "table",
  "migracion", "migraciones", "migration", "despliegue", "deploy", "catalogo", "receta", "recetas", "recipe", "asset", "assets", "hook", "hooks",
  "workflow", "ci", "rls", "base", "token", "tokens", "monolito", "monolith", "cableado", "wiring",
];
/** Las palabras de zona: lo anterior más los ids y los nombres de AMBITOS. */
export const ZONAS = [...new Set([...PALABRAS_DE_ZONA, ...Object.entries(AMBITOS).flatMap(([id, a]) => [id, a.legible])].map(sinAcentos))];
/** Qué palabras de zona nombra un texto. */
export const zonasQueNombra = (texto) => sinAcentos(texto).split(/[^a-z]+/).filter((w) => w && ZONAS.includes(w));

/**
 * Los secuencia de roles que SIEMPRE entran, un rol por paso (builder, judge o planner), sin contar a quien solo mide.
 * La sesión que construye cuenta como builder.
 */
function secuenciaDeRoles(sub, ctx = CTX) {
  const medidores = sub.measured_with ?? [];
  return sub.pasos.map((paso) => {
    const r = rolesDelPaso({ ...paso, agentes: (paso.agentes ?? []).filter((a) => !medidores.includes(a)) }, sub, ctx);
    return r.includes("builder") ? "builder" : r.includes("judge") ? "judge" : r.includes("planner") ? "planner" : null;
  }).filter(Boolean);
}

/**
 * En qué difiere de verdad un subtipo del esqueleto de su tipo: el conjunto de valores de `differs_in` que se cumplen.
 * steps (sus roles no son los del esqueleto), closing (cierra con una persona), measure (mide otra cosa que la medida por
 * defecto; en audit, mide con un agente que no es juez), plans_first (empieza por el plan de la sesión), maps_first (empieza
 * por un juez que mapea, donde el esqueleto empieza por construir) y builds_in_session (lo construye la sesión). Un juez de
 * zona, fijo o por bandera, NO cuenta: la zona sale de los ficheros (`jueces` de AMBITOS en ambitos.mjs).
 */
export function facetasDe(sub, tipos = TYPES, ctx = CTX) {
  const esq = tipos?.[sub.type]?.skeleton;
  if (!esq) return new Set();
  const seq = secuenciaDeRoles(sub, ctx);
  const f = new Set();
  if (JSON.stringify(seq) !== JSON.stringify(esq.roles)) f.add("steps");
  if (sub.cierra_con) f.add("closing");
  if (("measure_kind" in sub && sub.measure_kind !== esq.default_measure) || (esq.judges_only_in_parallel && sub.measured_with?.length)) f.add("measure");
  if (seq[0] === "planner") f.add("plans_first");
  if (seq[0] === "judge" && esq.roles[0] === "builder") f.add("maps_first");
  if (sub.builds_in_session === true) f.add("builds_in_session");
  return f;
}

const CLAVES_ACTIVO = ["id", "type", "status", "plain", "valve", "accion", "note", "pasos", "differs_in", "closing", "cierra_con", "measure_kind", "counters", "irreversible", "measured_with", "builds_in_session"];
const CLAVES_PASO = ["agentes", "opcional", "purpose"];
const CLAVES_OPCIONAL = ["agente", "si", "flag"];

/**
 * La puerta de entrada de UN subtipo activo (las reglas de REGLAS_PUERTA y la forma del subtipo). Lista de problemas, cada
 * uno con el nombre de su regla delante: plano, difiere, texto-libre, nombre, estado, liso, valvula.
 */
export function problemasDeLaPuerta(sub, d = DATOS, ctx = { agentes: AGENTES, especiales: d?.special_roles ?? {} }) {
  const p = [];
  const tipos = d?.assignment_types ?? {};
  // estado
  if (!(sub.status in (d?.statuses ?? {}))) return [`estado: ${sub.id} dice «${sub.status}», que no es un estado (${Object.keys(d?.statuses ?? {}).join(", ")})`];
  if (sub.status !== "active") return p;
  // nombre: <tipo>-<objeto>, en inglés y en kebab-case
  const m = /^(create|fix|improve|operate|audit)-([a-z]+(?:-[a-z]+){0,2})$/.exec(sub.id);
  if (!m) p.push(`nombre: ${sub.id} no sigue la plantilla <tipo>-<objeto> (create, fix, improve, operate o audit, un guion y de una a tres palabras en inglés y minúsculas)`);
  else if (m[1] !== sub.type) p.push(`nombre: ${sub.id} empieza por «${m[1]}» y es del tipo «${sub.type}»`);
  // plano: ni el id ni la etiqueta nombran una zona
  const objeto = m ? m[2] : sub.id;
  for (const z of zonasQueNombra(objeto)) p.push(`plano: ${sub.id} nombra la zona «${z}» en su id; un subtipo describe la naturaleza del trabajo, la zona sale de los ficheros`);
  for (const z of zonasQueNombra(sub.accion ?? "")) p.push(`plano: ${sub.id} nombra la zona «${z}» en su etiqueta; un subtipo describe la naturaleza del trabajo, la zona sale de los ficheros`);
  for (const paso of sub.pasos ?? []) for (const z of zonasQueNombra(`${paso.purpose ?? ""} ${d?.step_purposes?.[paso.purpose]?.what ?? ""}`)) p.push(`plano: ${sub.id} lleva un paso con la finalidad «${paso.purpose}», que nombra la zona «${z}»; las finalidades de paso también describen el trabajo`);
  // texto-libre: solo `note`, con tope; lo demás, vocabularios cerrados
  for (const k of Object.keys(sub)) if (!CLAVES_ACTIVO.includes(k)) p.push(`texto-libre: ${sub.id} lleva el campo «${k}», que no es de un subtipo activo: el texto libre vive solo en «note» (hasta ${MAX_NOTE} caracteres) y en la etiqueta «accion» (hasta ${MAX_ACCION}), que define el valor`);
  if ("note" in sub && (typeof sub.note !== "string" || sub.note.length < 10 || sub.note.length > MAX_NOTE)) p.push(`texto-libre: ${sub.id} lleva una «note» de 10 a ${MAX_NOTE} caracteres`);
  if (typeof sub.accion !== "string" || sub.accion.length < 3 || sub.accion.length > MAX_ACCION) p.push(`texto-libre: ${sub.id} lleva su «accion» (la definición del valor) de 3 a ${MAX_ACCION} caracteres`);
  for (const k of ["plain", "valve", "builds_in_session"]) if (k in sub && sub[k] !== true) p.push(`texto-libre: ${sub.id} lleva «${k}» solo con el valor verdadero`);
  if ("closing" in sub && !(sub.closing in (d?.closings ?? {}))) p.push(`texto-libre: ${sub.id} dice el cierre «${sub.closing}» («closing»), que no es del vocabulario (${Object.keys(d?.closings ?? {}).join(", ")})`);
  else if ("closing" in sub && sub.cierra_con !== d.closings[sub.closing].label) p.push(`cierre: ${sub.id}: «cierra_con» tiene que ser el texto de su cierre («${d.closings[sub.closing].label}»)`);
  if (Boolean(sub.closing) !== Boolean(sub.cierra_con)) p.push(`cierre: ${sub.id} lleva «closing» y «cierra_con» a la vez, o ninguno de los dos`);
  if ("measure_kind" in sub && !(sub.measure_kind in (d?.measures ?? {}))) p.push(`texto-libre: ${sub.id} mide con «${sub.measure_kind}», que no es del vocabulario (${Object.keys(d?.measures ?? {}).join(", ")})`);
  for (const paso of sub.pasos ?? []) {
    for (const k of Object.keys(paso)) if (!CLAVES_PASO.includes(k)) p.push(`texto-libre: ${sub.id} lleva en un paso el campo «${k}», que no es de un subtipo activo: el texto libre vive solo en «note»`);
    if ("purpose" in paso && !(paso.purpose in (d?.step_purposes ?? {}))) p.push(`texto-libre: ${sub.id} lleva un paso con «${paso.purpose}», que no es una finalidad del vocabulario (${Object.keys(d?.step_purposes ?? {}).join(", ")})`);
    for (const o of paso.opcional ?? []) for (const k of Object.keys(o)) if (!CLAVES_OPCIONAL.includes(k)) p.push(`texto-libre: ${sub.id} lleva en una condición el campo «${k}», que no es de un subtipo activo`);
  }
  // difiere: lo declarado se cumple contra el esqueleto de su tipo; el liso no declara nada y no difiere
  const declaradas = sub.differs_in;
  if (!Array.isArray(declaradas)) {
    p.push(`difiere: ${sub.id} declara en qué difiere de su tipo en «differs_in» (una lista de valores de ${Object.keys(d?.differs_in ?? {}).join(", ")})`);
    return p;
  }
  for (const v of declaradas) if (!(v in (d?.differs_in ?? {}))) p.push(`difiere: ${sub.id} declara «${v}», que no es un valor de «differs_in» (${Object.keys(d?.differs_in ?? {}).join(", ")})`);
  if (new Set(declaradas).size !== declaradas.length) p.push(`difiere: ${sub.id} repite un valor en «differs_in»`);
  const reales = facetasDe(sub, tipos, ctx);
  for (const v of declaradas) if (v in (d?.differs_in ?? {}) && !reales.has(v)) p.push(`difiere: ${sub.id} dice que difiere de ${sub.type} en «${v}» y su esqueleto no lo cumple`);
  if (sub.plain) {
    if (declaradas.length) p.push(`liso: ${sub.id} es el subtipo liso de ${sub.type}: es el esqueleto y no declara «differs_in»`);
    if (reales.size) p.push(`liso: ${sub.id} es el subtipo liso de ${sub.type} y difiere del esqueleto en ${[...reales].join(", ")}: deja de ser liso`);
  } else if (!sub.valve && !declaradas.length) p.push(`difiere: ${sub.id} no difiere de ${sub.type} en nada medible: si no difiere, no es subtipo`);
  if (sub.plain && sub.valve) p.push(`valvula: ${sub.id} no puede ser lisa y válvula a la vez`);
  if (sub.valve) {
    if (sub.id !== `${sub.type}-other`) p.push(`valvula: la válvula de ${sub.type} se llama «${sub.type}-other» y no ${sub.id}`);
    if (typeof sub.note !== "string") p.push(`valvula: ${sub.id} es una válvula y explica en su «note» para qué sirve y que cada uso pide un motivo`);
  }
  return p;
}

/** Lo que está mal en un alias retirado: el id de antes que solo se conserva para el panel. */
export function problemasDeAlias(sub, d = DATOS) {
  const p = [];
  const activos = (d?.tipos ?? []).filter((t) => t.status === "active").map((t) => t.id);
  if (!d?.assignment_types?.[sub.type]) p.push(`tipo: ${sub.id} cuelga de «${sub.type}», que no es un tipo`);
  if (typeof sub.accion !== "string" || sub.accion.length < 3) p.push(`alias: ${sub.id} conserva su «accion», que lee el panel`);
  if (!Array.isArray(sub.pasos) || !sub.pasos.length) p.push(`alias: ${sub.id} conserva sus «pasos», que lee el panel`);
  if (!activos.includes(sub.replaced_by)) p.push(`alias: ${sub.id} está retirado y dice que lo sustituye «${sub.replaced_by}», que no es un subtipo activo`);
  for (const k of ["differs_in", "plain", "valve", "closing", "measure_kind", "purpose"]) if (k in sub) p.push(`alias: ${sub.id} está retirado y lleva «${k}», que es de un subtipo activo`);
  return p;
}

/** Lo que está mal en el catálogo de tipos (lista vacía si está bien). Cada línea empieza por el nombre de su regla. */
export function problemas(d = DATOS, ctx = { agentes: AGENTES, especiales: d?.special_roles ?? {} }) {
  const p = [];
  const tipos = d?.assignment_types ?? {};
  const especiales = Object.keys(d?.especiales ?? {});
  const todos = d?.tipos ?? [];
  const ids = todos.map((t) => t.id);
  if (new Set(ids).size !== ids.length) p.push("id: hay subtipos con el mismo id");
  for (const e of especiales) if (!["planner", "builder"].includes(d.special_roles?.[e])) p.push(`especial: «${e}» lleva su rol en «special_roles» (planner o builder)`);
  for (const nombre of ["differs_in", "closings", "measures", "counters", "step_purposes", "statuses"]) {
    for (const [k, v] of Object.entries(d?.[nombre] ?? {})) {
      if (!/^[a-z]+(_[a-z]+)*$/.test(k)) p.push(`vocabulario: «${k}» de ${nombre} va en minúsculas y snake_case`);
      if (typeof v?.what !== "string" || v.what.length < 10) p.push(`vocabulario: ${nombre}.${k} lleva su definición «what»`);
    }
    if (!Object.keys(d?.[nombre] ?? {}).length) p.push(`vocabulario: falta el vocabulario ${nombre}`);
  }
  for (const [k, c] of Object.entries(d?.closings ?? {})) if (typeof c?.label !== "string" || !c.label) p.push(`vocabulario: closings.${k} lleva su texto «label»`);
  for (const [k, t] of Object.entries(tipos)) {
    if (!/^[a-z]+$/.test(k)) p.push(`id: el tipo «${k}» es una palabra en minúsculas`);
    if (typeof t.what !== "string" || t.what.length < 10) p.push(`definicion: el tipo ${k} lleva su «what»`);
    const roles = t.skeleton?.roles;
    if (!Array.isArray(roles) || !roles.length || roles.some((r) => !["builder", "judge"].includes(r))) p.push(`esqueleto: el tipo ${k} lleva «roles» con builder y judge`);
    else if (!roles.includes("judge")) p.push(`juez: el tipo ${k} no tiene ningún juez en su esqueleto: ningún tipo se queda sin juez`);
    else if (k !== "audit" && !roles.includes("builder")) p.push(`esqueleto: el tipo ${k} no lleva constructor`);
    if (t.skeleton?.measures_before_after && !(t.skeleton.default_measure in (d?.measures ?? {}))) p.push(`esqueleto: el tipo ${k} mide antes y después y su «default_measure» es un valor de «measures»`);
    const activos = todos.filter((s) => s.type === k && s.status === "active");
    const lisos = activos.filter((s) => s.plain);
    const valvulas = activos.filter((s) => s.valve);
    if (lisos.length > 1) p.push(`liso: el tipo ${k} tiene ${lisos.length} subtipos lisos y solo puede tener uno`);
    if (lisos.length && valvulas.length) p.push(`valvula: el tipo ${k} ya tiene su subtipo liso (${lisos[0].id}); la válvula «${k}-other» solo cabe si el tipo no tiene liso`);
    if (valvulas.length > 1) p.push(`valvula: el tipo ${k} tiene ${valvulas.length} válvulas`);
    if (!lisos.length && !valvulas.length) p.push(`cobertura: el tipo ${k} no tiene dónde dejar lo que no encaja: un subtipo liso o una válvula «${k}-other»`);
    // gemelos: dos subtipos de un tipo con lo mismo no son dos
    const huella = (s) => JSON.stringify([s.pasos, s.measure_kind, s.cierra_con, s.irreversible, s.builds_in_session, s.measured_with]);
    for (const [n, s] of activos.entries()) {
      const gemelo = activos.slice(0, n).find((o) => huella(o) === huella(s));
      if (gemelo) p.push(`gemelo: ${s.id} y ${gemelo.id} tienen los mismos pasos, medida y cierre: son un solo subtipo`);
    }
  }
  // El orden del JSON: primero los activos y luego los alias, cada grupo agrupado por tipo en el orden de los tipos (así sale la tabla de /orquestar y lo ve el panel).
  const posicion = (s) => (s.status === "retired" ? 1000 : 0) + Object.keys(tipos).indexOf(s.type);
  const orden = todos.map(posicion);
  if (orden.some((n, i) => i > 0 && n < orden[i - 1])) p.push(`orden: primero los subtipos activos y luego los retirados, cada grupo agrupado por tipo en el orden ${Object.keys(tipos).join(", ")}`);
  const bandera = d?.flags ?? {};
  for (const [k, b] of Object.entries(bandera)) {
    if (!/^[a-z]+(_[a-z]+)*$/.test(k)) p.push(`bandera: «${k}» va en minúsculas y snake_case`);
    if (!b.si || !b.what) p.push(`bandera: ${k} lleva «si» (la condición corta) y «what»`);
  }
  for (const sub of todos) {
    if (!/^[a-z]+(-[a-z]+)*$/.test(sub.id)) p.push(`id: ${sub.id} va en minúsculas con guiones`);
    if (!sub.accion || sub.accion.length < 3) p.push(`campo: ${sub.id} lleva su «accion»`);
    if (!sub.pasos?.length) {
      p.push(`campo: ${sub.id} lleva pasos`);
      continue;
    }
    const alias = sub.status === "retired";
    if (alias) p.push(...problemasDeAlias(sub, d));
    else p.push(...problemasDeEsqueleto(sub, tipos, ctx, d), ...problemasDeLaPuerta(sub, d, ctx));
    if (!(sub.status in (d?.statuses ?? {}))) p.push(`estado: ${sub.id} dice «${sub.status}», que no es un estado (${Object.keys(d?.statuses ?? {}).join(", ")})`);
    for (const paso of sub.pasos) {
      if (todosLosAgentes(paso).length === 0) p.push(`paso: ${sub.id} tiene un paso vacío`);
      for (const a of todosLosAgentes(paso)) if (!especiales.includes(a) && !(a in ctx.agentes)) p.push(`agente: ${sub.id} nombra «${a}», que no existe en .claude/agents ni es especial`);
      for (const o of paso.opcional ?? []) {
        if (!(o.flag in bandera)) p.push(`bandera: ${sub.id}: la condición de «${o.agente}» (${o.si}) no tiene una bandera del vocabulario (${Object.keys(bandera).join(", ")})`);
        else if (bandera[o.flag].si !== o.si) p.push(`bandera: ${sub.id}: el texto «${o.si}» no es el de la bandera ${o.flag} («${bandera[o.flag].si}»)`);
      }
    }
  }
  return p;
}

/**
 * La regla «repite» de la puerta, como AVISO (no falla): dado cuántos encargos usan cada subtipo (`usos`: { id: n }),
 * una línea `subtipo-uso subtype: … usos: n minimo: 3 aviso: … usa: …` por cada uno que no cumple. Un subtipo activo con menos de
 * MIN_USOS usos todavía no ha demostrado repetirse (el liso no avisa: es el esqueleto del tipo); una válvula con MIN_USOS o más pide un subtipo nuevo (`valvula-repetida`); un alias retirado
 * con usos dice cuál usar (`alias-retirado`, en `usa`); un id que no existe no se cuenta.
 */
export function avisosDeUso(usos = {}, d = DATOS) {
  const l = [];
  // Los usos de un alias cuentan para su sustituto: es el mismo patrón con otro nombre.
  const creditados = { ...usos };
  for (const s of d.tipos) if (s.status === "retired" && usos[s.id]) creditados[s.replaced_by] = (creditados[s.replaced_by] ?? 0) + usos[s.id];
  const linea = (id, n, aviso, usa = "-") => l.push(`subtipo-uso subtype: ${id} usos: ${n} minimo: ${MIN_USOS} aviso: ${aviso} usa: ${usa}`);
  for (const s of d.tipos) {
    const n = creditados[s.id] ?? 0;
    if (s.status === "retired") {
      if ((usos[s.id] ?? 0) > 0) linea(s.id, usos[s.id], "alias-retirado", s.replaced_by);
    } else if (s.valve) {
      if (n >= MIN_USOS) linea(s.id, n, "valvula-repetida");
    } else if (n < MIN_USOS && !s.plain) linea(s.id, n, "pocos-usos");
  }
  for (const [id, n] of Object.entries(usos)) if (!d.tipos.some((s) => s.id === id)) linea(id, n, "subtipo-desconocido");
  return l;
}

// ── El lector común con el presupuesto ───────────────────────────────────────────────────────

/** Un subtipo por su id, activo o alias; un alias se resuelve a su sustituto (y `encargoDe` avisa). */
const subtipoDe = (id) => ALL_SUBTYPES.find((s) => s.id === id) ?? null;

/** Los jueces de un subtipo: { always: [...], optional: [{ agente, flag }] }. */
export function juecesDe(sub) {
  const always = [...new Set(sub.pasos.flatMap((p) => p.agentes ?? []).filter((a) => JUECES.includes(a)))];
  const optional = sub.pasos.flatMap((p) => p.opcional ?? []).filter((o) => JUECES.includes(o.agente)).map((o) => ({ agente: o.agente, flag: o.flag }));
  return { always, optional };
}

/**
 * Los pasos mínimos de un subtipo: el primer paso que construye y el primero con juez a partir de él, enteros (con sus
 * condiciones opcionales y sus banderas: un esquema con RLS conserva a `seguridad`). La sesión que solo planifica no
 * cuenta como constructor. Sin constructor (audit), el primer paso con juez.
 */
export function pasosMinimos(sub, ctx = CTX) {
  const c = sub.pasos.findIndex((p) => rolesDelPaso(p, sub, ctx).includes("builder"));
  const j = sub.pasos.findIndex((p, n) => n >= Math.max(c, 0) && rolesDelPaso(p, sub, ctx).includes("judge"));
  return [c, j].filter((n, k, a) => n >= 0 && a.indexOf(n) === k).map((n) => JSON.parse(JSON.stringify(sub.pasos[n])));
}

/**
 * Lo que dicen los dos catálogos de un encargo: el subtipo (con su tipo y esqueleto) de ops/tipos-de-encargo.json, y el
 * presupuesto de ops/presupuestos.json para su alcance y causa (`presupuestoDe`, con `por_causa` y los jueces que exige la
 * causa) y su complejidad. null si algún valor no existe. No calcula nada del diff (E2, #641).
 * → { subtype, type, skeleton, scope, cause, complexity, pipeline, steps, close_with, judges: { always, optional },
 *     judges_min, judges_required, missing_judges, warnings, fund_rondas_max, fund_minutes }
 * `judges_min` es el mayor entre el del alcance y la causa y el de la complejidad. Los pasos son los del subtipo si el
 * pipeline es `complete` y los mínimos si es `minimal`. `warnings` dice si el subtipo no lleva los jueces que se piden.
 * Las rondas y los minutos son del FONDO (de su alcance y causa), no del encargo: salen como `fund_*`.
 */
export function encargoDe({ subtype, scope, cause, complexity }, presupuestos = PRESUPUESTOS) {
  const pedido = subtipoDe(subtype);
  const s = pedido?.status === "retired" ? subtipoDe(pedido.replaced_by) : pedido;
  const porComplejidad = presupuestos.by_complexity?.[complexity];
  const fondo = presupuestoDe(scope, cause, presupuestos);
  if (!s || !porComplejidad || !fondo) return null;
  const judges = juecesDe(s);
  const judgesMin = Math.max(fondo.jueces_min, porComplejidad.jueces_min);
  const enPipeline = porComplejidad.pipeline === "complete" ? s.pasos : pasosMinimos(s);
  const nombrados = new Set(enPipeline.flatMap(todosLosAgentes).filter((a) => JUECES.includes(a)));
  const missing = fondo.jueces_obligatorios.filter((j) => !nombrados.has(j));
  const warnings = [];
  if (pedido.status === "retired") warnings.push(`el subtipo ${pedido.id} está retirado: usa ${s.id}`);
  if (nombrados.size < judgesMin) warnings.push(`el subtipo ${s.id} lleva ${nombrados.size} juez(ces) distintos y el presupuesto pide ${judgesMin}: añade ${judgesMin - nombrados.size} más del catálogo de /orquestar`);
  if (missing.length) warnings.push(`la causa ${cause} exige ${missing.join(", ")} y el subtipo ${s.id} no lo lleva`);
  return {
    subtype: s.id,
    type: s.type,
    skeleton: TYPES[s.type].skeleton,
    scope,
    cause,
    complexity,
    pipeline: porComplejidad.pipeline,
    steps: enPipeline,
    close_with: s.cierra_con ?? null,
    judges,
    judges_min: judgesMin,
    judges_required: fondo.jueces_obligatorios,
    missing_judges: missing,
    warnings,
    fund_rondas_max: fondo.rondas_max,
    fund_minutes: fondo.minutos_orientativos,
  };
}

export { PIPELINES };

// ── La tabla de /orquestar, generada ────────────────────────────────────────────────────────

const TEXTO_ESPECIAL = { sesion: "sesión principal", constructor: "constructor del dominio", constructores: "constructores por dominio" };
const agenteMd = (a) => TEXTO_ESPECIAL[a] ?? `\`${a}\``;

/** Un paso como texto: agentes con `+`, el opcional entre corchetes y la nota entre paréntesis. */
function pasoMd(paso) {
  const fijos = (paso.agentes ?? []).map(agenteMd);
  const opcionales = (paso.opcional ?? []).map((o) => `[\`${o.agente}\` si ${o.si}]`);
  const texto = [...fijos, ...opcionales].join(" + ");
  const finalidad = STEP_PURPOSES[paso.purpose]?.what;
  const nota = paso.nota ?? (finalidad ? finalidad[0].toLowerCase() + finalidad.slice(1) : null);
  return nota ? `${texto} (${nota})` : texto;
}

/** La fila de un subtipo: tipo, id, acción y pipeline. */
export function filaMd(sub) {
  const cierre = sub.cierra_con ? ` → *${sub.cierra_con}*` : "";
  const paralelo = sub.type === "audit" && sub.pasos.length === 1 && (sub.pasos[0].agentes ?? []).length > 1 ? ", en paralelo" : "";
  return `| ${sub.type} | \`${sub.id}\` | ${sub.accion} | ${sub.pasos.map(pasoMd).join(" → ")}${paralelo}${cierre} |`;
}

/** La tabla entera (cabecera y una fila por subtipo ACTIVO: los alias retirados no se ofrecen), sin las marcas. */
export function tablaPipelines(d = DATOS) {
  return ["| Tipo | Subtipo | Acción | Pipeline |", "|---|---|---|---|", ...d.tipos.filter((s) => s.status === "active").map(filaMd)].join("\n");
}

const entre = (md, ini, fin, texto) => {
  const i = md.indexOf(ini);
  const f = md.indexOf(fin);
  if (i < 0 || f < i) throw new Error(`falta alguna de las marcas ${ini} y ${fin}`);
  return `${md.slice(0, i + ini.length)}\n${texto}\n${md.slice(f)}`;
};

/** La tabla «jueces por zona» (de AMBITOS, scripts/lib/ambitos.mjs): hasta que #641 los calcule, la zona de los ficheros pide estos jueces. */
export function tablaJueces() {
  const filas = Object.entries(AMBITOS).filter(([, a]) => a.jueces.length)
    .map(([id, a]) => `| \`${id}\` (${a.legible}) | ${a.jueces.map((j) => `\`${j.juez}\``).join(", ")} | ${a.jueces.map((j) => `\`${j.fuente}\``).join(", ")} |`);
  return ["| Zona | Jueces, además de `" + JUEZ_SIEMPRE + "` | De dónde sale |", "|---|---|---|", ...filas].join("\n");
}

/** Pone las tablas generadas entre las marcas de un `orquestar.md` (subtipos y jueces por zona); si no están, lo dice. */
export const regenerarOrquestar = (md, d = DATOS) => entre(entre(md, MARCA_INICIO, MARCA_FIN, tablaPipelines(d)), MARCA_JUECES_INICIO, MARCA_JUECES_FIN, tablaJueces());

/** Los tipos y las banderas, como prosa del N1 (docs/entidades/N1-encargo.md, §4), generada del JSON. */
export function textoN1Tipos(d = DATOS) {
  const roles = (t) => t.skeleton.roles.join(" → ") + (t.skeleton.measures_before_after ? "; mide antes y después" : "") + (t.skeleton.irreversible_needs_close ? "; si es irreversible, cierra con el OK de una persona" : "") + (t.skeleton.judges_only_in_parallel ? "; solo jueces, en paralelo" : "");
  return [
    "| Tipo | Qué es | Esqueleto de pasos | Subtipos |",
    "|---|---|---|---|",
    ...Object.entries(d.assignment_types).map(([k, t]) => `| \`${k}\` | ${t.what} | ${roles(t)} | ${d.tipos.filter((s) => s.type === k && s.status === "active").map((s) => `\`${s.id}\``).join(", ")} |`),
    "",
    "Banderas de una condición (`flags`):",
    "",
    ...Object.entries(d.flags).map(([k, b]) => `- \`${k}\`: ${b.what}.`),
  ].join("\n");
}

export const conTiposN1 = (md, d = DATOS) => entre(md, MARCA_N1_TIPOS_INICIO, MARCA_N1_TIPOS_FIN, textoN1Tipos(d));

/** La puerta de entrada de un subtipo, como texto del N1 (§4): sus cinco reglas, los valores de `differs_in` y los alias retirados. */
export function textoN1Puerta(d = DATOS) {
  const activos = d.tipos.filter((s) => s.status === "active");
  return [
    "Las reglas de la puerta (`REGLAS_PUERTA` de `scripts/lib/tiposDeEncargo.mjs`; cada una la comprueba `ops/tipos-de-encargo.test.js`):",
    "",
    ...REGLAS_PUERTA.map((r) => `- \`${r.id}\`: ${r.texto}`),
    "",
    "En qué puede diferir un subtipo de su tipo (`differs_in`, vocabulario cerrado):",
    "",
    "| Valor | Se cumple si |",
    "|---|---|",
    ...Object.entries(d.differs_in).map(([k, v]) => `| \`${k}\` | ${v.what} |`),
    "",
    "Los subtipos activos y en qué difieren:",
    "",
    "| Subtipo | Es | Difiere en |",
    "|---|---|---|",
    ...activos.map((s) => `| \`${s.id}\` | ${s.plain ? "el liso del tipo" : s.valve ? "la válvula del tipo" : "un subtipo"} | ${s.differs_in.map((v) => `\`${v}\``).join(", ") || "—"} |`),
    "",
    "Los ids de antes, retirados (alias para el panel de la factoría; el dimensionador usa solo los activos):",
    "",
    "| Id retirado | Pasa a |",
    "|---|---|",
    ...d.tipos.filter((s) => s.status === "retired").map((s) => `| \`${s.id}\` | \`${s.replaced_by}\` |`),
  ].join("\n");
}

export const conPuertaN1 = (md, d = DATOS) => entre(md, MARCA_N1_PUERTA_INICIO, MARCA_N1_PUERTA_FIN, textoN1Puerta(d));

export { CONSTRUCTORES };
