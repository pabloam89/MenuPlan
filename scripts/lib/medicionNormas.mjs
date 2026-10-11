/**
 * La medición por norma (#621, fondo #618; principio `no-number-without-question`): cada control que salta
 * deja una línea `campo: valor` con el id de la norma y lo que pasó, y un lector las cuenta por norma.
 *
 *     norma: <id> resultado: cumple|salta|exceptuada
 *
 *   cumple      el control miró y la norma se cumplía
 *   salta       el control miró y la norma NO se cumplía (un aviso del CI, un bloqueo de la guardia)
 *   exceptuada  se incumplía y una excepción válida del PR (scripts/lib/excepciones.mjs) la dejó pasar
 *
 * Quién la deja: los avisos del CI (scripts/avisos-pr.mjs) y «Fondos del PR» (scripts/fondos-pr.mjs), en el
 * log del run; la guardia ya anota cada bloqueo, permiso pedido y aviso con el `codigo` de su norma en el
 * registro local de eventos (.claude/hooks/eventos.mjs): ahí cada línea con `codigo` es un `salta`. La guardia
 * no anota los `cumple` (miraría cada orden), así que de sus normas solo se sabe cuántas veces saltaron.
 * Ninguna línea lleva datos de familias, comandos ni rutas: el id de una norma y una palabra.
 *
 * Lo que cuenta `leerNormas`/`medir`: por norma, cuántas veces cumple, salta y se exceptúa, y de ahí:
 *   - nunca saltan: se comprobaron (cumple > 0) y jamás saltaron ni se exceptuaron: ¿sobra el control o la
 *     norma es de las que nadie incumple? Se mira antes de quitar nada;
 *   - sin dato: tienen quien las haga cumplir y aún no han dejado ninguna línea;
 *   - exceptuadas siempre: de las veces que saltaron, todas se dejaron pasar con una excepción (desde
 *     MIN_EXCEPTUADAS veces): la norma está mal puesta, o la excepción se usa de atajo.
 *
 * Puro: los textos entran por argumento. Lo vigila ops/precedencia.test.js (y scripts/normas-medicion.test.js).
 */
export const RESULTADOS_NORMA = ["cumple", "salta", "exceptuada"];
/** Desde cuántas excepciones y con cero saltos una norma cuenta como «exceptuada siempre». */
export const MIN_EXCEPTUADAS = 3;
/** Los eventos de la guardia que son un control que saltó (con su `codigo` = id de norma). */
export const EVENTOS_QUE_SALTAN = ["bloqueo_guardia", "permiso_pedido", "aviso_guardia"];

const ID_NORMA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** La línea de una norma; falla si el id o el resultado no son del vocabulario. */
export function lineaDeNorma(norma, resultado) {
  if (!ID_NORMA.test(String(norma))) throw new Error(`medición: «${norma}» no es el id de una norma`);
  if (!RESULTADOS_NORMA.includes(resultado)) throw new Error(`medición: resultado fuera del vocabulario: ${resultado}`);
  return `norma: ${norma} resultado: ${resultado}`;
}

/** Las líneas de norma de un texto (un log de CI, la salida de un script): [{ norma, resultado }]. */
export function leerLineasDeNorma(texto) {
  const re = /(?:^|\s)norma: ([a-z0-9]+(?:-[a-z0-9]+)*) resultado: (cumple|salta|exceptuada)(?=\s|$)/gm;
  return [...String(texto ?? "").matchAll(re)].map((m) => ({ norma: m[1], resultado: m[2] }));
}

/** Los eventos de la guardia (jsonl) con `codigo`, como líneas de norma `salta`. Las líneas rotas se saltan. */
export function saltosDeLaGuardia(jsonl) {
  const fuera = [];
  for (const l of String(jsonl ?? "").split(/\r?\n/)) {
    if (!l.trim()) continue;
    let o = null;
    try { o = JSON.parse(l); } catch { continue; /* a propósito: una línea corrupta no cuenta */ }
    if (o && EVENTOS_QUE_SALTAN.includes(o.evento) && typeof o.codigo === "string" && ID_NORMA.test(o.codigo)) fuera.push({ norma: o.codigo, resultado: "salta" });
  }
  return fuera;
}

/** Cuenta por norma: { id: { cumple, salta, exceptuada } }. */
export function contarPorNorma(lineas) {
  const c = {};
  for (const { norma, resultado } of lineas) (c[norma] ??= { cumple: 0, salta: 0, exceptuada: 0 })[resultado] += 1;
  return c;
}

/**
 * Lo que se pregunta a las cuentas. `normas`: la lista de ops/normas.json; `cuentas`: de contarPorNorma.
 * → { filas: [{ norma, cumple, salta, exceptuada }], nuncaSaltan, sinDato, exceptuadasSiempre, desconocidas }
 */
export function medir(normas, cuentas) {
  const vacia = { cumple: 0, salta: 0, exceptuada: 0 };
  const filas = normas.map((n) => ({ norma: n.id, ...vacia, ...(cuentas[n.id] ?? {}) }));
  const ids = new Set(normas.map((n) => n.id));
  const hechas = (f) => f.cumple + f.salta + f.exceptuada;
  const conEjecutor = new Set(normas.filter((n) => n.ejecutor !== "nada").map((n) => n.id));
  return {
    filas,
    nuncaSaltan: filas.filter((f) => f.cumple > 0 && f.salta === 0 && f.exceptuada === 0).map((f) => f.norma),
    sinDato: filas.filter((f) => hechas(f) === 0 && conEjecutor.has(f.norma)).map((f) => f.norma),
    exceptuadasSiempre: filas.filter((f) => f.exceptuada >= MIN_EXCEPTUADAS && f.salta === 0).map((f) => f.norma),
    desconocidas: Object.keys(cuentas).filter((id) => !ids.has(id)),
  };
}
