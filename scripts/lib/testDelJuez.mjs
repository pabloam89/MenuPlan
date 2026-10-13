/**
 * El test del juez (#693): mide a un juez con casos fijos, buenos (debe aprobar) y malos (debe señalar),
 * y da una cifra de acierto. Un control cuyo procesador es «juez» solo cuenta si su norma apunta a un
 * fichero de estos (`test_del_juez` en ops/normas.json) y el fichero tiene casos de esa norma.
 *
 * Un fichero por juez: `ops/test-del-juez/<juez>.json`. Forma:
 *   { juez, version, casos: [ { id, norma, tipo: "bueno"|"malo", titulo, diff, debe_senalar (solo malo),
 *                               origen, marcado_por } ] }
 * - `norma`: el id de la norma de juicio que ejercita el caso.
 * - `marcado_por`: quién decidió el veredicto esperado. Nunca el propio juez (calibrated-distinct-judge).
 * - `origen`: de dónde sale el caso (un fallo real con su número, o «sintético a partir de …»).
 *
 * Aquí no se llama a ningún modelo: `medir` recibe a quien juzga y a quien corrige como funciones
 * (la de pago, en scripts/test-del-juez.mjs, las cablea a la API; los tests, con unas de mentira).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DIR_TEST_DEL_JUEZ = "ops/test-del-juez";
export const JUECES = ["revisor", "qa", "evaluador", "seguridad", "auditor-datos"];
export const TIPOS_CASO = ["bueno", "malo"];
/** Casos mínimos por norma y tipo para que el fichero cuente como su test del juez. */
export const MIN_POR_NORMA_Y_TIPO = 1;
/** Un diff más largo que esto no es un caso fijo y pequeño: se parte. */
export const MAX_DIFF = 1500;

const rutaDe = (juez) => `${DIR_TEST_DEL_JUEZ}/${juez}.json`;
export const esFicheroDeJuez = (ruta) => new RegExp(`^${DIR_TEST_DEL_JUEZ}/(${JUECES.join("|")})\\.json$`).test(ruta);

export function leerFichero(juez, raiz) {
  const ruta = join(raiz, rutaDe(juez));
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, "utf8"));
}

/** Errores de forma del fichero de un juez, como lista de textos (vacía si vale). `normasDeJuez`: ids de normas con procesador juez. */
export function faltasDeFichero(f, juez, normasDeJuez = []) {
  const malos = [];
  if (!f || typeof f !== "object") return [`${juez}: el fichero no es un objeto`];
  if (f.juez !== juez) malos.push(`${juez}: «juez» dice «${f.juez}»`);
  if (!Array.isArray(f.casos) || !f.casos.length) return [...malos, `${juez}: sin casos`];
  const vistos = new Set();
  for (const c of f.casos) {
    const d = `${juez}/${c?.id ?? "?"}`;
    if (!c || typeof c.id !== "string" || !c.id.trim()) { malos.push(`${d}: sin id`); continue; }
    if (vistos.has(c.id)) malos.push(`${d}: id repetido`);
    vistos.add(c.id);
    if (!normasDeJuez.includes(c.norma)) malos.push(`${d}: la norma «${c.norma}» no es una norma de juez del registro`);
    if (!TIPOS_CASO.includes(c.tipo)) malos.push(`${d}: tipo «${c.tipo}» (${TIPOS_CASO.join(" | ")})`);
    for (const k of ["titulo", "diff", "origen", "marcado_por"]) if (typeof c[k] !== "string" || !c[k].trim()) malos.push(`${d}: falta «${k}»`);
    if (typeof c.diff === "string" && c.diff.length > MAX_DIFF) malos.push(`${d}: el diff pasa de ${MAX_DIFF} caracteres`);
    if (c.tipo === "malo" && (typeof c.debe_senalar !== "string" || !c.debe_senalar.trim())) malos.push(`${d}: un caso malo dice qué debe señalar el juez («debe_senalar»)`);
    if (c.tipo === "bueno" && "debe_senalar" in c) malos.push(`${d}: un caso bueno no lleva «debe_senalar»`);
    if (String(c.marcado_por ?? "").trim().toLowerCase() === juez) malos.push(`${d}: el veredicto lo marca el propio juez (marcado_por «${c.marcado_por}»): un juez no se califica a sí mismo`);
  }
  return malos;
}

/** ¿Tiene el fichero casos buenos y malos de esta norma? Devuelve el motivo o null. */
export function motivoFicheroSinNorma(f, normaId) {
  const de = (t) => (f?.casos ?? []).filter((c) => c.norma === normaId && c.tipo === t).length;
  if (de("bueno") < MIN_POR_NORMA_Y_TIPO || de("malo") < MIN_POR_NORMA_Y_TIPO) {
    return `necesita al menos ${MIN_POR_NORMA_Y_TIPO} caso bueno y ${MIN_POR_NORMA_Y_TIPO} malo de «${normaId}» (hay ${de("bueno")} y ${de("malo")})`;
  }
  return null;
}

/** El texto que ve el juez: el diff y la norma que se le pide mirar, sin decirle si es bueno o malo. */
export function promptCaso(c, norma) {
  return [
    `Revisa este cambio solo contra esta norma: «${norma.nombre}» (${norma.sujeto} ${norma.fuerza === "no_debe" ? "no debe" : "debe"} ${norma.exigencia}).`,
    `Título del PR: ${c.titulo}`,
    "<diff>", c.diff, "</diff>",
    'Responde solo con JSON: {"veredicto":"aprueba"|"senala","hallazgos":["…"]}. «senala» si el cambio incumple la norma, con el caso concreto; «aprueba» si no.',
  ].join("\n");
}

/**
 * Pasa los casos por un juez y un corrector, que son funciones (async) inyectadas:
 *   juzgar(caso) → { veredicto, hallazgos: [texto] }
 *   corregir(caso, hallazgos) → boolean (¿algún hallazgo dice lo que `debe_senalar`?)
 * Acierta un bueno si el juez aprueba; un malo, si señala Y el corrector confirma que señala lo esperado.
 */
export async function medir(casos, { juzgar, corregir }) {
  const filas = [];
  for (const c of casos) {
    let r;
    try { r = await juzgar(c); } catch (e) { filas.push({ id: c.id, norma: c.norma, tipo: c.tipo, estado: "sin_correr", motivo: String(e.message).slice(0, 120) }); continue; }
    const veredicto = r?.veredicto === "senala" ? "senala" : r?.veredicto === "aprueba" ? "aprueba" : null;
    let acierta = false;
    if (c.tipo === "bueno") acierta = veredicto === "aprueba";
    else if (veredicto === "senala") {
      try { acierta = (await corregir(c, r.hallazgos ?? [])) === true; } catch (e) { filas.push({ id: c.id, norma: c.norma, tipo: c.tipo, estado: "sin_correr", motivo: String(e.message).slice(0, 120) }); continue; }
    }
    filas.push({ id: c.id, norma: c.norma, tipo: c.tipo, estado: acierta ? "ok" : "falla", veredicto });
  }
  return filas;
}

/** La cifra de un juez: aciertos entre casos corridos, por tipo y por norma. Los `sin_correr` no cuentan como acierto ni como fallo. */
export function cifra(filas) {
  const corridas = filas.filter((f) => f.estado !== "sin_correr");
  const ok = (l) => l.filter((f) => f.estado === "ok").length;
  const por = (t) => corridas.filter((f) => f.tipo === t);
  const normas = {};
  for (const f of corridas) { const n = (normas[f.norma] ??= { ok: 0, total: 0 }); n.total++; if (f.estado === "ok") n.ok++; }
  return {
    aciertos: ok(corridas), total: corridas.length, sin_correr: filas.length - corridas.length,
    buenos_ok: ok(por("bueno")), buenos: por("bueno").length, malos_ok: ok(por("malo")), malos: por("malo").length,
    acierto: corridas.length ? Number((ok(corridas) / corridas.length).toFixed(3)) : null, normas,
  };
}

/** Línea contable de un juez, como `skills-prueba`: una por juez, con `campo: valor`. */
export const lineaDeCifra = (juez, c, extra = "") =>
  `test-del-juez juez: ${juez} aciertos: ${c.aciertos}/${c.total} buenos: ${c.buenos_ok}/${c.buenos} malos: ${c.malos_ok}/${c.malos} sin_correr: ${c.sin_correr} acierto: ${c.acierto ?? "-"}${extra}`;
