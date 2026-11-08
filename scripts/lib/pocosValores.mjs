/**
 * pocosValores.mjs — qué columnas de texto libre tienen tan pocos valores distintos que
 * parecen un vocabulario sin cerrar (#585, norma C4). Puro: no toca la base.
 *
 * Lo usa scripts/columnas-pocos-valores.mjs (que mide en producción, solo lectura) y su test.
 * El test del CI (supabase/columnasTexto.test.js) NO depende de esto: solo mira el esquema.
 */

/**
 * Hasta cuántos valores distintos cuenta como «pocos». Veinte: casi todos los vocabularios de
 * src/lib/vocabularios.js tienen entre 1 y 12 valores (medido el 11 oct 2026; la excepción,
 * sitios_fallo con 72, es ya un catálogo) y los CHECK de columnas con lista de la base llegan
 * a 17; 20 deja holgura sin llegar a una lista que no se pueda leer y mantener en un CHECK.
 * Límite: un vocabulario cerrado de más de 20 valores (user_events.event, 29) no sale como
 * candidato; esos se ven leyendo su motivo en ops/columnas-texto.json, no con esta medida.
 */
export const MAX_DISTINTOS = 20;

/**
 * Cuántas filas hacen falta para fiarse. Cincuenta: con menos filas, pocos distintos es lo
 * normal en cualquier columna (tres filas = tres valores como mucho) y no dice nada.
 */
export const MIN_FILAS = 50;

/** ¿Es candidata a vocabulario? Con filas suficientes y pocos distintos. */
export function esCandidata({ filas, distintos }, { maxDistintos = MAX_DISTINTOS, minFilas = MIN_FILAS } = {}) {
  return filas >= minFilas && distintos <= maxDistintos;
}

/** «tabla.columna» (o «esquema.tabla.columna») → { esquema, tabla, columna }. */
export function partirColumna(clave) {
  const trozos = clave.split(".");
  const columna = trozos.pop();
  const tabla = trozos.pop();
  const esquema = trozos.pop() ?? "public";
  for (const t of [esquema, tabla, columna]) if (!/^\w+$/.test(t ?? "")) throw new Error(`${clave}: nombre no válido`);
  return { esquema, tabla, columna };
}

/**
 * El select de solo lectura que cuenta una columna: filas con valor y valores distintos. Una
 * columna `text[]` cuenta los elementos (unnest), no el array entero; `nulas` son las filas
 * sin valor, que no cuentan como un valor más.
 */
export function consultaDeColumna(clave, tipo = "text") {
  const { esquema, tabla, columna } = partirColumna(clave);
  const t = `"${esquema}"."${tabla}"`;
  const c = `"${columna}"`;
  if (/\[/.test(tipo)) {
    return `select (select count(*) from ${t}) as filas, count(v) as con_valor, count(distinct v) as distintos from (select unnest(${c}) as v from ${t}) x`;
  }
  return `select count(*) as filas, count(${c}) as con_valor, count(distinct ${c}) as distintos from ${t}`;
}

/**
 * La línea contable de una columna, una por columna, para contarla con un script:
 * `columna_pocos_valores: columna=<t.c> filas=<n> con_valor=<n> distintos=<n> candidata=<si|no>`
 * o `… medida=no motivo=<motivo>` si no se pudo leer.
 */
export function lineaContable(clave, medida) {
  if (!medida || medida.error) return `columna_pocos_valores: columna=${clave} medida=no motivo=${String(medida?.error ?? "sin_dato").replace(/\s+/g, "_").slice(0, 80)}`;
  const { filas, conValor, distintos } = medida;
  return `columna_pocos_valores: columna=${clave} filas=${filas} con_valor=${conValor} distintos=${distintos} candidata=${esCandidata({ filas: conValor, distintos }) ? "si" : "no"}`;
}
