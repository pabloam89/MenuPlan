/**
 * avisosPr.mjs — tres avisos del CI sobre un PR (#576): tests relajados (C8), PR demasiado
 * grande (C1) y fondo cerrado sin aprendizaje (C12). Lógica pura; el script fino es
 * scripts/avisos-pr.mjs y el paso, «Avisos del PR» de .github/workflows/tests.yml.
 *
 * Los tres son AVISO: nunca fallan el job (un check obligatorio que se pone rojo por una
 * heurística bloquearía los PR de las demás sesiones). Cada regla deja la línea de su norma, que se puede
 * contar (scripts/lib/medicionNormas.mjs; sustituye a la `avisos-pr: regla=… resultado=…` de antes, #621):
 *
 *     norma: tests-no-se-relajan resultado: warning pr: 123 detalle: removed_assertions=3 added_assertions=0
 *
 * Excepción declarada (#621): UNA forma para todas, en el cuerpo del PR, con la norma que se exceptúa, el
 * motivo y una caducidad. Si está y vale, el aviso no sale (`resultado: exempt`) y el motivo queda en `detalle`:
 *
 *     Excepción: <id de norma> — <motivo> — hasta AAAA-MM-DD
 *
 * Cada regla cuelga de una norma (NORMA_DE_REGLA): C8 de `tests-no-se-relajan`, C1 de `pr-acotado` y C12 de
 * `lecciones-a-un-test`. La forma, sus razones para no valer y la transición de las tres formas de antes
 * («Tests relajados: sí — …», «Tamaño: grande — …», «Aprendizaje: …», aceptadas hasta
 * RETIRADA_FORMAS_ANTIGUAS) están en scripts/lib/excepciones.mjs. Una excepción válida de una norma sin regla
 * aquí deja `norma: <id> resultado: declared` (no se midió ningún incumplimiento).
 *
 * Pasar de aviso a fallo (cuando haya cifras): contar con `grep -h "resultado: warning" ` en los logs de
 * `tests` (o con `gh run view --log`) cuántos PR salen con `resultado: warning` por regla y
 * cuántos de esos avisos eran falsos (el PR acabó con la línea de excepción por un motivo
 * trivial). Una regla pasa a fallo cuando, en 30 PR seguidos, menos del 10 % de sus avisos
 * son falsos: en `scripts/avisos-pr.mjs`, `resultado: warning` pasa a salir con código 1 solo
 * para esa regla. Mientras tanto, todo sigue en salida 0.
 */
import { GENERADOS, casaRuta } from "./generados.mjs";
import { TABLAS } from "../../src/data/model.js";
import { NORMA_DE_REGLA, RAZONES, RETIRADA_FORMAS_ANTIGUAS, excepcionDe, leerExcepciones } from "./excepciones.mjs";
import { RESULTADOS_NORMA, lineaDeNorma } from "./medicionNormas.mjs";

/** Vocabulario cerrado de la línea contable (campos y valores en inglés). Lo vigila su test. */
export const REGLAS = ["c1", "c8", "c12"];
/** Los resultados de la línea: los de scripts/lib/medicionNormas.mjs (un solo vocabulario); estas reglas usan ok, warning, exempt y unchecked. */
export const RESULTADOS = Object.keys(RESULTADOS_NORMA);
/** Por qué un resultado es `unchecked`: no se pudo mirar (no es un fallo del PR). */
export const MOTIVOS_SIN_COMPROBAR = ["api_error", "no_token", "no_diff", "script_error", "bot"];

/**
 * Umbrales de C1, medidos el 11 oct 2026 sobre los últimos 150 PR fusionados en staging, sin
 * contar lo generado: lineas p50 582, p90 2021; ficheros p50 8, p90 28; áreas p50 3, p90 5.
 * Cada umbral deja pasar el 90 % de los PR; un PR por encima de uno es de los más grandes y
 * cuesta más de revisar. Se afinan con las cifras de `avisos-pr:` (ver la cabecera).
 */
export const UMBRALES_TAMANO = { lines: 2000, files: 30, areas: 5 };

/** C8: cuántas aserciones netas quitadas bastan para avisar. 1 = cualquier pérdida neta. */
export const MIN_ASERCIONES_PERDIDAS = 1;

export { NORMA_DE_REGLA };

/** Bots exentos de los tres avisos (los demás pasos del CI los exentan igual). */
export const BOTS = new Set(["dependabot[bot]", "github-actions[bot]"]);

/** Ficheros de configuración con una línea base de lint cuya suma no debe crecer. */
export const FICHEROS_BASE = ["lint-base.json", "lint-tokens-base.json"];

const RE_TEST = /\.test\.(?:js|jsx|mjs)$/;
const RE_ASERCION = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(/g;
const RE_SALTADO = /\b(?:it|test|describe)\.(?:skip|only|todo|skipIf)\b|\bx(?:it|test|describe)\s*\(/g;

// ── El diff ────────────────────────────────────────────────────────────────

const sinComillas = (r) => r.replace(/^"|"$/g, "").replace(/\t.*$/, "");

/**
 * Lee un `git diff -U0` → [{ ruta, anadidas:[línea…], quitadas:[línea…] }]. Un fichero sin
 * líneas (binario, renombrado sin cambios) aparece con las listas vacías.
 */
export function leerDiff(texto) {
  const ficheros = [];
  let f = null;
  for (const linea of String(texto ?? "").replace(/\r/g, "").split("\n")) {
    if (linea.startsWith("diff --git ")) {
      const m = /^diff --git (?:"?a\/.*?"? )?"?b\/(.*?)"?$/.exec(linea);
      f = { ruta: m ? sinComillas(m[1]) : sinComillas(linea.slice(11)), anadidas: [], quitadas: [] };
      ficheros.push(f);
    } else if (!f) {
      continue;
    } else if (linea.startsWith("@@")) {
      f.enCuerpo = true;
    } else if (!f.enCuerpo && linea.startsWith("+++ ")) {
      const r = sinComillas(linea.slice(4));
      if (r !== "/dev/null") f.ruta = r.replace(/^b\//, "");
    } else if (!f.enCuerpo && linea.startsWith("--- ")) {
      const r = sinComillas(linea.slice(4));
      // Fichero borrado: su ruta solo está en la línea `---`.
      if (r !== "/dev/null" && f.sinNuevo) f.ruta = r.replace(/^a\//, "");
    } else if (linea.startsWith("deleted file mode")) {
      f.sinNuevo = true;
    } else if (linea.startsWith("+")) {
      f.anadidas.push(linea.slice(1));
    } else if (linea.startsWith("-")) {
      f.quitadas.push(linea.slice(1));
    }
  }
  for (const x of ficheros) {
    delete x.sinNuevo;
    delete x.enCuerpo;
  }
  return ficheros;
}

const DERIVADOS = new Set(TABLAS.filter((t) => t.rol === "derivado").flatMap((t) => t.ficheros ?? []));

/** ¿Lo genera una herramienta? (el lock, los documentos y anclas de GENERADOS, las fuentes derivadas del modelo). */
export function esGenerado(ruta) {
  return (
    ruta === "package-lock.json" ||
    ruta.startsWith("src/data/derived/") ||
    DERIVADOS.has(ruta) ||
    GENERADOS.some((g) => casaRuta(g.ruta, ruta))
  );
}

// Lo que va entre comillas es texto, no código: un test del propio detector escribe «it.skip(» en un string.
const sinCadenas = (l) => l.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
const cuenta = (lineas, re) => lineas.reduce((n, l) => (/^\s*(?:\/\/|\*|\/\*)/.test(l) ? n : n + (sinCadenas(l).match(re)?.length ?? 0)), 0);

// ── La excepción declarada ─────────────────────────────────────────────────

/** El día de hoy en UTC (AAAA-MM-DD): el CI compara fechas enteras, sin hora. */
export const hoyUtc = () => new Date().toISOString().slice(0, 10);

/** La excepción válida de una regla (forma única o antigua en transición) → su motivo, o null. */
function motivoDe(regla, cuerpo, hoy) {
  const lectura = leerExcepciones(cuerpo, { normas: Object.values(NORMA_DE_REGLA), hoy });
  const e = excepcionDe(lectura, NORMA_DE_REGLA[regla]);
  return e ? `${e.motivo}${e.hasta ? ` until=${e.hasta}` : " form=legacy"}` : null;
}

/** `Excepción: tests-no-se-relajan — motivo — hasta AAAA-MM-DD` (o la forma antigua, en transición) → motivo, o null. */
export const excepcionTests = (cuerpo, hoy = hoyUtc()) => motivoDe("c8", cuerpo, hoy);
/** Lo mismo para C1 (`pr-acotado`). */
export const excepcionTamano = (cuerpo, hoy = hoyUtc()) => motivoDe("c1", cuerpo, hoy);
/** Lo mismo para C12 (`lecciones-a-un-test`). */
export const excepcionAprendizaje = (cuerpo, hoy = hoyUtc()) => motivoDe("c12", cuerpo, hoy);

// ── Las tres reglas. Cada una → { regla, resultado, detalle } ───────────────

const r = (regla, resultado, detalle) => ({ regla, resultado, detalle });

/** C8: tests relajados. */
export function evaluarC8({ ficheros, cuerpo = "", hoy = hoyUtc() }) {
  const tests = ficheros.filter((f) => RE_TEST.test(f.ruta));
  const quitadas = tests.reduce((n, f) => n + cuenta(f.quitadas, RE_ASERCION), 0);
  const nuevas = tests.reduce((n, f) => n + cuenta(f.anadidas, RE_ASERCION), 0);
  const saltados = tests.reduce((n, f) => n + cuenta(f.anadidas, RE_SALTADO) - cuenta(f.quitadas, RE_SALTADO), 0);

  const motivos = [];
  if (quitadas - nuevas >= MIN_ASERCIONES_PERDIDAS) motivos.push(`removed_assertions=${quitadas} added_assertions=${nuevas}`);
  if (saltados > 0) motivos.push(`new_skip_only_todo=${saltados}`);

  // Un umbral que sube: testTimeout en cualquier fichero…
  const numeros = (lineas, re) => lineas.flatMap((l) => [...sinCadenas(l).matchAll(re)].map((m) => Number(m[1].replace(/_/g, ""))));
  const reTimeout = /\btestTimeout\s*:\s*([\d_]+)/g;
  for (const f of ficheros) {
    const nuevos = numeros(f.anadidas, reTimeout);
    if (!nuevos.length) continue;
    const viejos = numeros(f.quitadas, reTimeout);
    if (Math.max(...nuevos) > (viejos.length ? Math.max(...viejos) : 0)) motivos.push(`raised_threshold=testTimeout:${f.ruta}`);
  }
  // …y la suma de una línea base de lint (los valores enteros de sus líneas).
  const reValor = /:\s*(\d+),?\s*$/;
  const suma = (lineas) => lineas.reduce((n, l) => n + Number(reValor.exec(l)?.[1] ?? 0), 0);
  for (const f of ficheros.filter((x) => FICHEROS_BASE.includes(x.ruta))) {
    if (suma(f.anadidas) > suma(f.quitadas)) motivos.push(`raised_threshold=lint_baseline:${f.ruta}`);
  }

  if (!motivos.length) return r("c8", "ok", `test_files=${tests.length} removed_assertions=${quitadas} added_assertions=${nuevas}`);
  const motivo = excepcionTests(cuerpo, hoy);
  if (motivo) return r("c8", "exempt", `${motivos.join(" ")} reason=${motivo}`);
  return r("c8", "warning", motivos.join(" "));
}

/** C1: PR demasiado grande, sin contar lo generado. */
export function evaluarC1({ ficheros, cuerpo = "", umbrales = UMBRALES_TAMANO, hoy = hoyUtc() }) {
  const propios = ficheros.filter((f) => !esGenerado(f.ruta));
  const lines = propios.reduce((n, f) => n + f.anadidas.length + f.quitadas.length, 0);
  const areas = new Set(propios.map((f) => (f.ruta.includes("/") ? f.ruta.split("/")[0] : "(root)")));
  const medida = `lines=${lines} files=${propios.length} areas=${areas.size} generated_skipped=${ficheros.length - propios.length}`;

  const pasa = [];
  if (lines > umbrales.lines) pasa.push(`lines>${umbrales.lines}`);
  if (propios.length > umbrales.files) pasa.push(`files>${umbrales.files}`);
  if (areas.size > umbrales.areas) pasa.push(`areas>${umbrales.areas}`);

  if (!pasa.length) return r("c1", "ok", medida);
  const motivo = excepcionTamano(cuerpo, hoy);
  if (motivo) return r("c1", "exempt", `${medida} over=${pasa.join(",")} reason=${motivo}`);
  return r("c1", "warning", `${medida} over=${pasa.join(",")}`);
}

// Donde CLAUDE.md admite el aprendizaje: un test, la guardia, y si no se puede, una regla o una skill.
const RE_LECCION_RUTA = [RE_TEST, /^\.claude\/hooks\//, /^\.claude\/skills\//, /^\.claude\/rules\//];
export const dejaLeccion = (ruta) => RE_LECCION_RUTA.some((re) => re.test(ruta));

/**
 * C12: un fondo cerrado sin aprendizaje. `fondosCerrados`: los `Closes #n` que son tipo:fondo
 * (lo calcula el script con la API); `null` si no se pudo mirar.
 */
export function evaluarC12({ ficheros, cuerpo = "", fondosCerrados, sinComprobar = null, hoy = hoyUtc() }) {
  if (sinComprobar) return r("c12", "unchecked", `reason=${sinComprobar}`);
  if (!fondosCerrados?.length) return r("c12", "ok", "closed_funds=0");
  const lista = fondosCerrados.map((n) => `#${n}`).join(",");
  const tocados = ficheros.filter((f) => dejaLeccion(f.ruta)).length;
  if (tocados > 0) return r("c12", "ok", `closed_funds=${lista} lesson_files=${tocados}`);
  const donde = excepcionAprendizaje(cuerpo, hoy);
  if (donde) return r("c12", "exempt", `closed_funds=${lista} lesson_files=0 reason=${donde}`);
  return r("c12", "warning", `closed_funds=${lista} lesson_files=0`);
}

// ── La salida ──────────────────────────────────────────────────────────────

/**
 * La línea contable (#621): la de la norma de la regla, `norma: <id> resultado: … pr: <n> detalle: …`, la misma sintaxis
 * que «Fondos del PR» (scripts/lib/medicionNormas.mjs). Falla si la regla o el resultado no son del vocabulario.
 */
export function lineaContable({ regla, resultado, detalle }, pr = null) {
  if (!REGLAS.includes(regla)) throw new Error(`avisos-pr: regla fuera del vocabulario: ${regla}`);
  if (!RESULTADOS.includes(resultado)) throw new Error(`avisos-pr: resultado fuera del vocabulario: ${resultado}`);
  return lineaDeNorma(NORMA_DE_REGLA[regla], resultado, { pr, detalle });
}

/** El mensaje de GitHub (`::warning::`) de un aviso, en castellano. */
export function mensajeAviso({ regla, detalle }) {
  const como = {
    c8: "Tests relajados: el PR quita aserciones, añade skip/only/todo o sube un umbral. Si es a propósito, pon en el cuerpo «Excepción: tests-no-se-relajan — <motivo> — hasta AAAA-MM-DD»",
    c1: "PR grande: pasa de los umbrales de tamaño. Si no se puede partir, pon en el cuerpo «Excepción: pr-acotado — <motivo> — hasta AAAA-MM-DD»",
    c12: "El PR cierra un fondo y no toca ningún test, la guardia ni una skill: ¿dónde queda el aprendizaje? Pon en el cuerpo «Excepción: lecciones-a-un-test — <dónde queda> — hasta AAAA-MM-DD»",
  }[regla];
  return `::warning title=Aviso ${regla.toUpperCase()}::${como} (${detalle})`;
}

/**
 * Todo junto: las tres evaluaciones de un PR. Los bots salen exentos de las tres.
 * → [{ regla, resultado, detalle }]
 */
export function avisosDelPr({ diff, cuerpo = "", autor = "", fondosCerrados = null, sinComprobar = null, hoy = hoyUtc() }) {
  if (BOTS.has(String(autor).toLowerCase())) return REGLAS.map((regla) => r(regla, "unchecked", "reason=bot"));
  if (sinComprobar === "no_diff") return REGLAS.map((regla) => r(regla, "unchecked", "reason=no_diff"));
  const ficheros = leerDiff(diff);
  return [
    evaluarC8({ ficheros, cuerpo, hoy }),
    evaluarC1({ ficheros, cuerpo, hoy }),
    evaluarC12({ ficheros, cuerpo, fondosCerrados, sinComprobar, hoy }),
  ];
}

// ── La medición por norma y las excepciones del PR (#621) ──────────────────

/** ¿Toca el diff algún fichero de la norma (`donde`, o su `control` si es un fichero)? Una ruta con «/» al final es una carpeta. */
export function normaTocada(norma, rutas) {
  const suyas = [...(norma.donde ?? []), ...(norma.control && norma.control !== "juicio" && norma.control !== "planos" ? [norma.control] : [])];
  return suyas.some((d) => rutas.some((r) => r === d || (d.endsWith("/") && r.startsWith(d))));
}

/** Por qué una excepción no vale, de las que arreglar sin que el PR se rompa por ello: se avisa. De las demás, se falla si la norma es dura y el PR la toca. */
const RAZONES_QUE_FALLAN = ["expired", "too_far", "bad_date", "short_reason"];

/**
 * Lo que dice el cuerpo del PR sobre sus excepciones. `normas`: la lista de ops/normas.json; `ficheros`: los del
 * diff (leerDiff). → { lineas: [`norma: … resultado: declared` de las que no tienen regla], avisos: [texto],
 * fallos: [texto] }. Una excepción que no vale NO cuenta: avisa, y FALLA solo si su norma es dura (veredicto) y el
 * PR toca un fichero de esa norma (un control que se caducó no se esquiva con un PR que lo cambia). Una norma que
 * no existe, o una línea mal escrita, solo avisa. La forma antigua en transición avisa de que se cambie.
 */
export function excepcionesDelPr({ cuerpo = "", normas, ficheros = [], hoy = hoyUtc(), pr = null }) {
  const lectura = leerExcepciones(cuerpo, { normas, hoy });
  const porId = new Map(normas.map((n) => [n.id, n]));
  const rutas = ficheros.map((f) => f.ruta);
  const fuera = { lineas: [], avisos: [], fallos: [], lectura };
  for (const i of lectura.invalidas) {
    const n = i.norma ? porId.get(i.norma) : null;
    const texto = `Excepción${i.norma ? ` de «${i.norma}»` : ""} que no cuenta: ${RAZONES[i.razon]}${i.razon === "form" ? ` (${i.linea})` : ""}`;
    if (n?.veredicto === "dura" && RAZONES_QUE_FALLAN.includes(i.razon) && normaTocada(n, rutas)) fuera.fallos.push(`${texto}; «${n.id}» es una norma dura y este PR la toca`);
    else fuera.avisos.push(texto);
  }
  for (const a of lectura.antiguas) fuera.avisos.push(`La forma antigua de excepción (${a.id}) deja de valer el ${RETIRADA_FORMAS_ANTIGUAS}: escribe «Excepción: ${a.norma} — <motivo> — hasta AAAA-MM-DD»`);
  const conRegla = new Set(Object.values(NORMA_DE_REGLA));
  for (const e of lectura.validas) if (!conRegla.has(e.norma)) fuera.lineas.push(lineaDeNorma(e.norma, "declared", { pr, detalle: `until=${e.hasta ?? "-"}` }));
  return fuera;
}
