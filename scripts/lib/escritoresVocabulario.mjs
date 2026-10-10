/**
 * escritoresVocabulario.mjs — quién escribe una columna de vocabulario del producto y si
 * pasa por la lista viva (#539, fondo #479).
 *
 * Desde #497 un valor retirado sale de su constante (src/lib/vocabularios.js), pero el
 * CHECK lo sigue admitiendo por las filas de familias ya guardadas. La base no impide que
 * el código lo vuelva a escribir; lo impide que todo escritor pase por `paraEscribir` (o
 * `listaParaEscribir`) de vocabularios.js, que traduce un retirado a su `pasa_a` y rechaza
 * lo desconocido. Esto mira, en el texto del código y sin ejecutarlo:
 *
 *   1. asignaciones: cada `col: <expr>`, `x.col = <expr>` o `{ col }` abreviado de una columna
 *      de COLUMNAS, en cualquier fichero de src/ o api/, tiene que ser
 *      `paraEscribir("<su vocabulario>", …)`, `listaParaEscribir("<su vocabulario>", …)`,
 *      `carpetaParaEscribir(…)` (solo collection_id) o `null`; un `_x` solo dentro de un
 *      patrón de destructurar (descartar). Lo que no, es un escritor que se salta la lista viva
 *      o la de otra columna;
 *   2. literales: en los escritores de esas tablas (supabase/cableado.json más los que
 *      montan sus filas sin tocar la tabla, ARMAN_FILAS), ningún literal '…' o "…" igual a
 *      un valor vivo o retirado de sus vocabularios: el valor sale de la constante. La clave
 *      de un mapa de etiquetas (`{ dia_a_dia: "Día a día" }`) no es un literal: pinta un id,
 *      no lo escribe (y su paridad con la constante la mira vocabularios.test.js).
 *
 * Límites, a propósito: una fila copiada con `...fila` no se ve (por eso la copia de una
 * receta la monta su dueño, `filaCopiada` de userRecipesFila.js, que reescribe sus columnas);
 * una clave calculada (`[col]: x`) o entre comillas, tampoco; una asignación partida en dos
 * líneas (`col:` y el valor debajo) sale como «no pasa»: se escribe en una.
 * Puro: quien llama le pasa los textos.
 */

/** Columna → nombre de su vocabulario en VOCABULARIOS. Las de las tres tablas de #539. */
export const COLUMNAS = {
  "user_pantry.pack_kind": "envases",
  "user_recipes.usage_tags": "usos_receta",
  "user_recipes.required_appliances": "aparatos",
  "recipe_collections.collection_id": "carpetas_fijas",
};

/** Montan filas de esas tablas sin tocarlas (el que inserta las importa). */
export const ARMAN_FILAS = ["src/lib/userRecipesFila.js"];

/**
 * Lo de la derecha de una asignación a `col` (texto ORIGINAL, con sus cadenas): null si pasa
 * por la lista viva del vocabulario de esa columna, o el porqué si no.
 * `paraEscribir("usos_receta", x)` en pack_kind no vale: escribiría con la lista equivocada.
 */
function problemaDelValor(rhs, vocab, col) {
  const llamada = rhs.match(/^(?:paraEscribir|listaParaEscribir)\(\s*(["'])([^"']*)\1/);
  if (llamada) return llamada[2] === vocab ? null : `usa el vocabulario «${llamada[2]}» y la columna es de «${vocab}»`;
  if (/^(?:paraEscribir|listaParaEscribir)\(/.test(rhs)) return "el vocabulario de paraEscribir va escrito, no en una variable";
  if (/^carpetaParaEscribir\(/.test(rhs)) return col === "collection_id" ? null : "carpetaParaEscribir solo vale para collection_id";
  if (/^null\b/.test(rhs)) return null;
  return "no pasa por la lista viva";
}

/** Quita comentarios de bloque, de línea entera y los que van tras código (` // …`). */
export function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l.replace(/\s\/\/\s.*$/, "")))
    .join("\n");
}

const tablasDe = (columnas) => [...new Set(Object.keys(columnas).map((c) => c.split(".")[0]))];
const colDe = (c) => c.split(".")[1];

/** Los ficheros que escriben (o tocan) esas tablas: los de cableado.json y ARMAN_FILAS. */
export function escritores(cableado, columnas = COLUMNAS) {
  return [...new Set([...tablasDe(columnas).flatMap((t) => cableado[t] ?? []), ...ARMAN_FILAS])].sort();
}

/** El contenido de cada literal '…', "…" o `…` de una línea, en blanco (las comillas se quedan). */
const sinCadenas = (l) => l.replace(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g, (_, q, c) => q + " ".repeat(c.length) + q);

/**
 * Las asignaciones `col: expr` o `col` abreviado que no pasan por la lista viva: [{ columna, linea, texto }].
 * Lo de dentro de una cadena no cuenta (un `select("…, pack_kind, …")` lee, no escribe), así
 * que una clave entre comillas (`"pack_kind": x`) tampoco se ve: nadie las usa hoy.
 */
export function asignacionesSinFiltro(texto, columnas = COLUMNAS) {
  const originales = sinComentarios(texto).split("\n");
  const out = [];
  const lineas = originales.map(sinCadenas);
  for (const [columna, vocab] of Object.entries(columnas)) {
    const col = colDe(columna);
    // Un patrón de destructurar (`const { col: _x } =`, `({ col: _x }) =>`) no escribe.
    const destructura = new RegExp(`(?:\\b(?:const|let|var)\\s*\\{[^}]*\\b${col}\\b[^}]*\\}\\s*=)|(?:\\(\\s*\\{[^}]*\\b${col}\\b[^}]*\\}\\s*\\)\\s*=>)`);
    lineas.forEach((l, i) => {
      const texto = originales[i].trim();
      const apunta = (motivo) => out.push({ columna, linea: i + 1, texto, motivo });
      const enDestructura = destructura.test(l);
      for (const m of l.matchAll(new RegExp(`(?<![\\w.$])${col}\\s*:\\s*(.*)$`, "g"))) {
        // `a ? col : c` no es una clave: se exige que la columna abra la línea o venga tras `{`, `,` o `(`.
        const antes = l.slice(0, m.index).trimEnd();
        if (antes && !/[{,(]$/.test(antes)) continue;
        const rhs = originales[i].slice(m.index + m[0].length - m[1].length).trim();
        // `_x` solo descarta dentro de un patrón de destructurar; en un objeto que se escribe es un valor.
        if (enDestructura && /^_\w*\b/.test(rhs)) continue;
        const p = problemaDelValor(rhs, vocab, col);
        if (p) apunta(p);
      }
      // Asignación a una propiedad: `fila.col = x`.
      for (const m of l.matchAll(new RegExp(`\\.${col}\\s*=(?![=>])\\s*(.*)$`, "g"))) {
        const p = problemaDelValor(originales[i].slice(m.index + m[0].length - m[1].length).trim(), vocab, col);
        if (p) apunta(p);
      }
      // Abreviada: `{ …, col }` o `{ col, … }` dentro de un literal de objeto que se escribe.
      if (new RegExp(`[{,]\\s*${col}\\s*[,}]`).test(l) && !enDestructura) apunta("abreviada: no pasa por la lista viva");
    });
  }
  return out;
}

/** Los literales sueltos de un valor de esos vocabularios: [{ valor, linea, texto }]. `valores`: Set. */
export function literalesSueltos(texto, valores) {
  const out = [];
  sinComentarios(texto).split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) if (valores.has(m[2])) out.push({ valor: m[2], linea: i + 1, texto: l.trim() });
  });
  return out;
}

/** Los valores (vivos y retirados) de los vocabularios de esas columnas. */
export function valoresVigilados(vocabularios, retirados, columnas = COLUMNAS) {
  const nombres = [...new Set(Object.values(columnas))];
  return new Set(nombres.flatMap((n) => [...(vocabularios[n] ?? []), ...Object.keys(retirados[n] ?? {})]));
}
