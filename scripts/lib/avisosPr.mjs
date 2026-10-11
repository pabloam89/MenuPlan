/**
 * avisosPr.mjs — tres avisos del CI sobre un PR (#576): tests relajados (C8), PR demasiado
 * grande (C1) y fondo cerrado sin lección (C12). Lógica pura; el script fino es
 * scripts/avisos-pr.mjs y el paso, «Avisos del PR» de .github/workflows/tests.yml.
 *
 * Los tres son AVISO: nunca fallan el job (un check obligatorio que se pone rojo por una
 * heurística bloquearía los PR de las demás sesiones). Cada regla deja una línea que se puede
 * contar:
 *
 *     avisos-pr: regla=c8 resultado=warning detalle=removed_assertions=3 added_assertions=0
 *
 * Excepción declarada: el cuerpo del PR lleva una línea por aviso, con motivo. Si está, el aviso
 * no sale (`resultado=exempt`) y el motivo queda en `detalle`:
 *
 *     Tests relajados: sí — <motivo>     (C8)
 *     Tamaño: grande — <motivo>          (C1)
 *     Lección: <dónde queda>             (C12)
 *
 * Pasar de aviso a fallo (cuando haya cifras): contar con `grep -h "avisos-pr:" ` en los logs de
 * `tests` (o con `gh run view --log`) cuántos PR salen con `resultado=warning` por regla y
 * cuántos de esos avisos eran falsos (el PR acabó con la línea de excepción por un motivo
 * trivial). Una regla pasa a fallo cuando, en 30 PR seguidos, menos del 10 % de sus avisos
 * son falsos: en `scripts/avisos-pr.mjs`, `resultado=warning` pasa a salir con código 1 solo
 * para esa regla. Mientras tanto, todo sigue en salida 0.
 */
import { GENERADOS, casaRuta } from "./generados.mjs";
import { TABLAS } from "../../src/data/model.js";
import { limpiarCuerpo } from "../../.claude/hooks/casos.mjs";

/** Vocabulario cerrado de la línea contable (campos y valores en inglés). Lo vigila su test. */
export const REGLAS = ["c1", "c8", "c12"];
export const RESULTADOS = ["ok", "warning", "exempt", "unchecked"];
/** Por qué un resultado es `unchecked`: no se pudo mirar (no es un fallo del PR). */
export const MOTIVOS_SIN_COMPROBAR = ["api_error", "no_token", "no_diff", "script_error"];

/**
 * Umbrales de C1, medidos el 11 oct 2026 sobre los últimos 150 PR fusionados en staging, sin
 * contar lo generado: lineas p50 582, p90 2021; ficheros p50 8, p90 28; áreas p50 3, p90 5.
 * Cada umbral deja pasar el 90 % de los PR; un PR por encima de uno es de los más grandes y
 * cuesta más de revisar. Se afinan con las cifras de `avisos-pr:` (ver la cabecera).
 */
export const UMBRALES_TAMANO = { lines: 2000, files: 30, areas: 5 };

/** C8: cuántas aserciones netas quitadas bastan para avisar. 1 = cualquier pérdida neta. */
export const MIN_ASERCIONES_PERDIDAS = 1;

/** Largo mínimo del motivo de una excepción (como el «Casos: ninguno»: una palabra suelta no vale). */
export const MIN_MOTIVO = 10;

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

const cuenta = (lineas, re) => lineas.reduce((n, l) => (/^\s*(?:\/\/|\*|\/\*)/.test(l) ? n : n + (l.match(re)?.length ?? 0)), 0);

// ── La excepción declarada ─────────────────────────────────────────────────

const lineaDe = (cuerpo, etiqueta, valor) =>
  new RegExp(`^[ \\t>*-]*(?:\\*\\*)?${etiqueta}(?:\\*\\*)?[ \\t]*:(?:\\*\\*)?[ \\t]*${valor}[ \\t]*$`, "gim").exec(limpiarCuerpo(cuerpo));

const motivoLimpio = (m) => String(m).trim().replace(/\s+/g, " ").slice(0, 120);

/** `Tests relajados: sí — motivo` → motivo, o null. */
export function excepcionTests(cuerpo) {
  const m = lineaDe(cuerpo, "Tests relajados", "s[ií][ \\t]*[—–-][ \\t]*(.{" + MIN_MOTIVO + ",})");
  return m ? motivoLimpio(m[1]) : null;
}
/** `Tamaño: grande — motivo` → motivo, o null. */
export function excepcionTamano(cuerpo) {
  const m = lineaDe(cuerpo, "Tama[ñn]o", "grande[ \\t]*[—–-][ \\t]*(.{" + MIN_MOTIVO + ",})");
  return m ? motivoLimpio(m[1]) : null;
}
/** `Lección: <dónde>` → el dónde, o null. */
export function excepcionLeccion(cuerpo) {
  const m = lineaDe(cuerpo, "Lecci[óo]n", "(.{" + MIN_MOTIVO + ",})");
  return m ? motivoLimpio(m[1]) : null;
}

// ── Las tres reglas. Cada una → { regla, resultado, detalle } ───────────────

const r = (regla, resultado, detalle) => ({ regla, resultado, detalle });

/** C8: tests relajados. */
export function evaluarC8({ ficheros, cuerpo = "" }) {
  const tests = ficheros.filter((f) => RE_TEST.test(f.ruta));
  const quitadas = tests.reduce((n, f) => n + cuenta(f.quitadas, RE_ASERCION), 0);
  const nuevas = tests.reduce((n, f) => n + cuenta(f.anadidas, RE_ASERCION), 0);
  const saltados = tests.reduce((n, f) => n + cuenta(f.anadidas, RE_SALTADO) - cuenta(f.quitadas, RE_SALTADO), 0);

  const motivos = [];
  if (quitadas - nuevas >= MIN_ASERCIONES_PERDIDAS) motivos.push(`removed_assertions=${quitadas} added_assertions=${nuevas}`);
  if (saltados > 0) motivos.push(`new_skip_only_todo=${saltados}`);

  // Un umbral que sube: testTimeout en cualquier fichero…
  const numeros = (lineas, re) => lineas.flatMap((l) => [...l.matchAll(re)].map((m) => Number(m[1].replace(/_/g, ""))));
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
  const motivo = excepcionTests(cuerpo);
  if (motivo) return r("c8", "exempt", `${motivos.join(" ")} reason=${motivo}`);
  return r("c8", "warning", motivos.join(" "));
}

/** C1: PR demasiado grande, sin contar lo generado. */
export function evaluarC1({ ficheros, cuerpo = "", umbrales = UMBRALES_TAMANO }) {
  const propios = ficheros.filter((f) => !esGenerado(f.ruta));
  const lines = propios.reduce((n, f) => n + f.anadidas.length + f.quitadas.length, 0);
  const areas = new Set(propios.map((f) => (f.ruta.includes("/") ? f.ruta.split("/")[0] : "(root)")));
  const medida = `lines=${lines} files=${propios.length} areas=${areas.size} generated_skipped=${ficheros.length - propios.length}`;

  const pasa = [];
  if (lines > umbrales.lines) pasa.push(`lines>${umbrales.lines}`);
  if (propios.length > umbrales.files) pasa.push(`files>${umbrales.files}`);
  if (areas.size > umbrales.areas) pasa.push(`areas>${umbrales.areas}`);

  if (!pasa.length) return r("c1", "ok", medida);
  const motivo = excepcionTamano(cuerpo);
  if (motivo) return r("c1", "exempt", `${medida} over=${pasa.join(",")} reason=${motivo}`);
  return r("c1", "warning", `${medida} over=${pasa.join(",")}`);
}

// Donde CLAUDE.md admite la lección: un test, la guardia, y si no se puede, una regla o una skill.
const RE_LECCION_RUTA = [RE_TEST, /^\.claude\/hooks\//, /^\.claude\/skills\//, /^\.claude\/rules\//];
export const dejaLeccion = (ruta) => RE_LECCION_RUTA.some((re) => re.test(ruta));

/**
 * C12: un fondo cerrado sin lección. `fondosCerrados`: los `Closes #n` que son tipo:fondo
 * (lo calcula el script con la API); `null` si no se pudo mirar.
 */
export function evaluarC12({ ficheros, cuerpo = "", fondosCerrados, sinComprobar = null }) {
  if (sinComprobar) return r("c12", "unchecked", `reason=${sinComprobar}`);
  if (!fondosCerrados?.length) return r("c12", "ok", "closed_funds=0");
  const lista = fondosCerrados.map((n) => `#${n}`).join(",");
  const tocados = ficheros.filter((f) => dejaLeccion(f.ruta)).length;
  if (tocados > 0) return r("c12", "ok", `closed_funds=${lista} lesson_files=${tocados}`);
  const donde = excepcionLeccion(cuerpo);
  if (donde) return r("c12", "exempt", `closed_funds=${lista} lesson_files=0 reason=${donde}`);
  return r("c12", "warning", `closed_funds=${lista} lesson_files=0`);
}

// ── La salida ──────────────────────────────────────────────────────────────

/** La línea contable. Falla si la regla o el resultado no son del vocabulario. */
export function lineaContable({ regla, resultado, detalle }) {
  if (!REGLAS.includes(regla)) throw new Error(`avisos-pr: regla fuera del vocabulario: ${regla}`);
  if (!RESULTADOS.includes(resultado)) throw new Error(`avisos-pr: resultado fuera del vocabulario: ${resultado}`);
  return `avisos-pr: regla=${regla} resultado=${resultado} detalle=${String(detalle ?? "-").replace(/[\r\n]+/g, " ")}`;
}

/** El mensaje de GitHub (`::warning::`) de un aviso, en castellano. */
export function mensajeAviso({ regla, detalle }) {
  const como = {
    c8: "Tests relajados: el PR quita aserciones, añade skip/only/todo o sube un umbral. Si es a propósito, pon en el cuerpo «Tests relajados: sí — <motivo>»",
    c1: "PR grande: pasa de los umbrales de tamaño. Si no se puede partir, pon en el cuerpo «Tamaño: grande — <motivo>»",
    c12: "El PR cierra un fondo y no toca ningún test, la guardia ni una skill: ¿dónde queda la lección? Pon en el cuerpo «Lección: <dónde>»",
  }[regla];
  return `::warning title=Aviso ${regla.toUpperCase()}::${como} (${detalle})`;
}

/**
 * Todo junto: las tres evaluaciones de un PR. Los bots salen exentos de las tres.
 * → [{ regla, resultado, detalle }]
 */
export function avisosDelPr({ diff, cuerpo = "", autor = "", fondosCerrados = null, sinComprobar = null }) {
  if (BOTS.has(String(autor).toLowerCase())) return REGLAS.map((regla) => r(regla, "exempt", "reason=bot"));
  if (sinComprobar === "no_diff") return REGLAS.map((regla) => r(regla, "unchecked", "reason=no_diff"));
  const ficheros = leerDiff(diff);
  return [
    evaluarC8({ ficheros, cuerpo }),
    evaluarC1({ ficheros, cuerpo }),
    evaluarC12({ ficheros, cuerpo, fondosCerrados, sinComprobar }),
  ];
}
