/**
 * dimensionadoPr.mjs — lo dimensionado, exigido en cada PR (#642, fondo #639; decisión #387 del 14 oct 2026).
 *
 * El dimensionador de #641 (dimensionado.mjs) calcula de un diff qué jueces le tocan. Hasta aquí solo lo leía quien
 * orquestaba; ahora el CI lo exige a TODO PR, no solo a los de un fondo:
 *
 *   1. `Tipo:` es un tipo o un subtipo de ops/tipos-de-encargo.json, y `Jueces:` nombra solo jueces de .claude/agents/
 *      y, como mínimo, los que exige el dimensionado de su diff con ese tipo (norma `pr-tipo-y-jueces-exigidos`).
 *   2. `Agente:` encaja con el tipo: un juez no construye, y «sesión» (o el orquestador) solo vale donde el tipo o un
 *      ámbito sin constructor dueño (catalog, api, product, entities) la dejan construir (`pr-agente-encaja-con-el-tipo`).
 *   3. Ningún `Agente:` está en `Jueces:` (`quien-construye-no-juzga`) y hay al menos un juez distinto de quien
 *      construyó, que es lo que deja fusionar a la propia sesión (`fusiona-otro-que-el-constructor`).
 *
 * Cada norma deja su línea (`norma: <id> resultado: … pr: <n> detalle: …`, medicionNormas.mjs). Falla solo al PR
 * responsable: todo lo que mira es de su propio cuerpo y su propio diff. Transición (para no poner en rojo los PR ya
 * abiertos sin las líneas): un PR CREADO antes de FALLA_DESDE solo avisa (`warning`); desde ese día, falla, y desde FIN_TRANSICION
 * (FALLA_DESDE + DIAS_DE_GRACIA, por la fecha del run) falla también el creado antes: ninguno queda exento para siempre. Una
 * excepción válida de la norma (`Excepción: <id> — <motivo> — hasta AAAA-MM-DD`, excepciones.mjs) la deja pasar (`exempt`),
 * salvo las normas con `admite_excepcion: false` (las tres de los jueces: nadie se exime de que le juzgue otro).
 * Los jueces exigidos incluyen los de las banderas que activan las rutas del diff (seguridad por .github/, hooks, settings…;
 * evaluador por el bot): las deriva el dimensionador (banderasDeRutas), nadie las declara, y con las banderas de la BASE del PR
 * (`flagsRutas`, que el script lee con `git show HEAD^1:ops/tipos-de-encargo.json`): un PR no se quita su propia exigencia por error.
 * Si esa base no se puede leer, falla cerrado: se exige además a JUEZ_SIN_BASE (`baseLegible: false`). Igual con las normas: si
 * una admite excepción lo dice ops/normas.json de la base (`normasBase`), no el del PR; sin base legible, ninguna la admite.
 * Alcance: es un control contra errores y olvidos, no un blindaje. El paso ejecuta el código del propio PR, así que un PR que
 * cambie el propio control puede saltárselo; ese blindaje queda para un workflow que corra el código de la base (pendiente).
 * Exentos: los bots y los PR a `main` (el paso a producción es de Pablo y lleva lo que ya se juzgó en staging).
 * Puro: el cuerpo, los ficheros, las normas, la base y las fechas entran por argumento.
 */
import { REGLAS, analizarTipoYJueces } from "../../.claude/hooks/tipo-y-jueces.mjs";
import { AGENTES, JUECES } from "./agentes.mjs";
import { BOTS } from "./avisosPr.mjs";
import { dimensionar } from "./dimensionado.mjs";
import { excepcionDe, leerExcepciones } from "./excepciones.mjs";
import { ALL_SUBTYPES, TYPES } from "./tiposDeEncargo.mjs";

/** El día (UTC, incluido) desde el que un PR creado ese día o después FALLA; los creados antes solo avisan. */
export const FALLA_DESDE = "2026-10-17";
/** Los días de gracia de un PR creado antes de FALLA_DESDE: desde FIN_TRANSICION (incluido, por la fecha del run) también falla. */
export const DIAS_DE_GRACIA = 14;
export const FIN_TRANSICION = new Date(Date.parse(`${FALLA_DESDE}T00:00:00Z`) + DIAS_DE_GRACIA * 86400000).toISOString().slice(0, 10);

/** Las normas que mide este paso, en el orden en que salen sus líneas. */
export const NORMAS_DEL_PASO = {
  tipoYJueces: "pr-tipo-y-jueces-exigidos",
  agente: "pr-agente-encaja-con-el-tipo",
  noJuzga: "quien-construye-no-juzga",
  otroJuez: "fusiona-otro-que-el-constructor",
};

/** La rama de producción: un PR hacia ella no se dimensiona (lo que lleva ya pasó por staging con sus jueces). */
export const BASE_EXENTA = "main";

/** El juez que se exige de más cuando las banderas de la base no se pueden leer: en la duda, el de los permisos. */
export const JUEZ_SIN_BASE = "seguridad";

/**
 * Las normas con su `admite_excepcion` de la BASE del PR (#642): un PR no se exime poniendo la suya a true en su propio
 * ops/normas.json. `base`: la lista de normas de la base, o null si no se pudo leer (falla cerrado: ninguna admite excepción).
 * Una norma que la base no trae (nueva en este PR) se queda con la suya.
 */
export function normasConExcepcionDeLaBase(normas, base) {
  if (!Array.isArray(base)) return normas.map((n) => ({ ...n, admite_excepcion: false }));
  const deBase = new Map(base.filter((n) => n && typeof n === "object").map((n) => [n.id, n]));
  return normas.map((n) => (deBase.has(n.id) ? { ...n, admite_excepcion: deBase.get(n.id).admite_excepcion } : n));
}

/** Quien construye «en la sesión»: la línea `sesión` y el agente de la sesión principal. */
export const DE_SESION = ["sesión", "orquestador"];
/** Cómo llama el dimensionador a la sesión cuando construye (LITERALES.especiales de dimensionado.mjs). */
const SESION_EN_PLAN = "sesion";

/** El tipo de la línea `Tipo:` → { tipo } o { subtipo }, o null si no es ni lo uno ni lo otro. */
export function entradaDeTipo(valor) {
  if (Object.hasOwn(TYPES, valor)) return { tipo: valor };
  if (ALL_SUBTYPES.some((s) => s.id === valor)) return { subtipo: valor };
  return null;
}

/** ¿Deja el plan construir a la sesión? Sí si no hay constructores (audit) o si el reparto le da ficheros sin dueño. */
export const sesionPermitida = (plan) => !plan.constructores.length || plan.constructores.some((c) => c.agente === SESION_EN_PLAN);

/**
 * Los ficheros del diff como los cuenta el dimensionador: { ruta, lines } (añadidas más quitadas), con `origen` (la ruta de antes
 * de un renombrado: sacar un fichero de su carpeta también la toca), que miran las banderas de rutas.
 */
export const ficherosDeDiff = (leidos) => leidos.map((f) => ({ ruta: f.ruta, lines: f.anadidas.length + f.quitadas.length, ...(f.origen ? { origen: f.origen } : {}) }));

/**
 * Comprueba el PR. entrada: { cuerpo, autor, base (rama destino), ficheros: [{ruta, lines}] | null (sin diff), normas (de
 * ops/normas.json), hoy (AAAA-MM-DD), creado (fecha ISO de creación del PR o null), flagsRutas (las banderas de la base del PR
 * con que se derivan las de rutas; sin ellas, las del catálogo), baseLegible (false si las banderas de la base no se pudieron leer:
 * se exige además JUEZ_SIN_BASE), normasBase (las normas de la base para `admite_excepcion`; null, ilegible: ninguna se exime;
 * sin pasarla, las del PR) }; deps: { dimensionar } para probar.
 * → { exento, transicion, medidas: [{ norma, resultado, detalle }], fallos: [texto], avisos: [texto], plan }
 * `fallos` hace salir con 1; `avisos` (lo mismo en transición) no.
 */
export function comprobarDimensionado({ cuerpo = "", autor = "", base = "", ficheros = null, normas = [], hoy, creado = null, flagsRutas = undefined, baseLegible = true, normasBase = undefined }, deps = {}) {
  const medidas = [];
  const fallos = [];
  const avisos = [];
  if (BOTS.has(String(autor).toLowerCase())) return { exento: true, porque: "bot", transicion: false, medidas, fallos, avisos, plan: null };
  if (String(base).trim() === BASE_EXENTA) return { exento: true, porque: "main", transicion: false, medidas, fallos, avisos, plan: null };
  const dia = /^\d{4}-\d{2}-\d{2}/.exec(String(creado ?? ""))?.[0] ?? hoy;
  const transicion = dia < FALLA_DESDE && String(hoy) < FIN_TRANSICION;
  const excepciones = leerExcepciones(cuerpo, { normas: normasBase === undefined ? normas : normasConExcepcionDeLaBase(normas, normasBase), hoy });

  /** Anota una norma: cumple, o no cumple con su motivo (excepción → exempt; transición → warning; si no, fail). */
  const anota = (norma, cumple, motivo = "") => {
    if (cumple) return medidas.push({ norma, resultado: "ok", detalle: null });
    const exc = excepcionDe(excepciones, norma);
    if (exc) return medidas.push({ norma, resultado: "exempt", detalle: `hasta=${exc.hasta ?? "-"}` });
    medidas.push({ norma, resultado: transicion ? "warning" : "fail", detalle: motivo.slice(0, 120) });
    (transicion ? avisos : fallos).push(`${motivo} (norma ${norma})`);
  };
  const sinMirar = (norma, porque) => medidas.push({ norma, resultado: "unchecked", detalle: porque });

  const l = analizarTipoYJueces(cuerpo);
  const agentes = l.agentes;
  // Lo de la forma: sin las dos líneas no hay nada más que mirar. Si la forma vale y el fallo es que quien construye
  // se nombra juez, se sigue: eso lo mide su norma (punto 3).
  const seJuzga = !l.valida && l.regla === REGLAS.construyeYJuzga;
  if (!l.valida && !seJuzga) {
    anota(NORMAS_DEL_PASO.tipoYJueces, false, l.motivo);
    for (const n of [NORMAS_DEL_PASO.agente, NORMAS_DEL_PASO.noJuzga, NORMAS_DEL_PASO.otroJuez]) sinMirar(n, "sin-tipo-o-jueces");
    return { exento: false, transicion, medidas, fallos, avisos, plan: null };
  }
  const tipo = entradaDeTipo(l.tipo);
  const noSonJueces = l.jueces.filter((j) => !JUECES.includes(j));

  // 1. Tipo y jueces exigidos por el dimensionado del diff.
  let plan = null;
  if (!tipo) anota(NORMAS_DEL_PASO.tipoYJueces, false, `«Tipo: ${l.tipo}» no es un tipo (${Object.keys(TYPES).join(", ")}) ni un subtipo de ops/tipos-de-encargo.json`);
  else if (noSonJueces.length) anota(NORMAS_DEL_PASO.tipoYJueces, false, `«Jueces:» nombra a ${noSonJueces.join(", ")}, que no es juez (${JUECES.join(", ")})`);
  else if (ficheros === null) sinMirar(NORMAS_DEL_PASO.tipoYJueces, "sin-diff");
  else {
    plan = (deps.dimensionar ?? dimensionar)({ fuente: "diff", ficheros, ...tipo }, flagsRutas ? { flagsRutas } : {});
    // Falla cerrado: sin las banderas de la base no se sabe qué rutas piden a quién, y se pide además al juez de los permisos.
    const exigidos = baseLegible || plan.jueces.includes(JUEZ_SIN_BASE) ? plan.jueces : [...plan.jueces, JUEZ_SIN_BASE];
    const faltan = exigidos.filter((j) => !l.jueces.includes(j));
    anota(NORMAS_DEL_PASO.tipoYJueces, !faltan.length, `el dimensionado de este diff con «Tipo: ${l.tipo}» exige ${exigidos.join(", ")}${baseLegible ? "" : " (seguridad, por no poder leer la base)"} y «Jueces:» no nombra a ${faltan.join(", ")}`);
  }

  // 2. El agente encaja con el tipo (sin línea Agente no se mide aquí: la pide «Fondos del PR»).
  if (!agentes.length) sinMirar(NORMAS_DEL_PASO.agente, "sin-agente");
  else if (!plan) sinMirar(NORMAS_DEL_PASO.agente, "sin-plan");
  else {
    const juez = agentes.find((a) => JUECES.includes(a));
    const sesion = agentes.find((a) => DE_SESION.includes(a));
    const desconocido = agentes.find((a) => !DE_SESION.includes(a) && !Object.hasOwn(AGENTES, a));
    const dueno = plan.constructores.map((c) => c.agente).filter((a) => a !== SESION_EN_PLAN);
    // Un nombre que no es agente ni sesión FALLA (no se deja sin mirar): si no, «Agente: <inventado>» esquivaría la regla de la
    // sesión en una zona con dueño. Es la misma línea que falla «Fondos del PR» (pr-agente-y-closes-en-ci), pero cada norma dice
    // una cosa distinta: aquella, que el nombre exista; esta, que encaje con el tipo, y un nombre que no existe no encaja.
    if (desconocido !== undefined) anota(NORMAS_DEL_PASO.agente, false, `«Agente: ${desconocido.slice(0, 30).replace(/[^\p{L}\p{N}_-]/gu, "?")}» no es un agente de .claude/agents/ ni «sesión»: no se puede ver si encaja con el tipo; declara el agente real`);
    else if (juez) anota(NORMAS_DEL_PASO.agente, false, `«Agente: ${juez}» es un juez, y un juez no construye`);
    else if (sesion && !sesionPermitida(plan)) anota(NORMAS_DEL_PASO.agente, false, `«Agente: ${sesion}» no vale para ${plan.tipo} con estos ficheros: tienen constructor dueño (${dueno.join(", ")}); declara el agente real`);
    else anota(NORMAS_DEL_PASO.agente, true);
  }

  // 3. Quien construye no juzga, y hay al menos un juez distinto de quien construyó (lo que deja fusionar a la sesión).
  anota(NORMAS_DEL_PASO.noJuzga, !seJuzga, l.motivo ?? "");
  anota(NORMAS_DEL_PASO.otroJuez, l.jueces.some((j) => JUECES.includes(j) && !agentes.includes(j)), "«Jueces:» no nombra ningún juez distinto de quien lo construyó");
  return { exento: false, transicion, medidas, fallos, avisos, plan };
}
