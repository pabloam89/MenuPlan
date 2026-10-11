/**
 * escritoresVocabulario.mjs — quién escribe una columna de vocabulario del producto y si
 * pasa por la lista viva (#539, #549, fondo #479).
 *
 * Desde #497 un valor retirado sale de su constante (src/lib/vocabularios.js), pero el
 * CHECK lo sigue admitiendo por las filas de familias ya guardadas. La base no impide que
 * el código lo vuelva a escribir; lo impide que todo escritor pase por `paraEscribir` (o
 * `listaParaEscribir`) de vocabularios.js, que traduce un retirado a su `pasa_a` y rechaza
 * lo desconocido. Las columnas salen de una sola lista, COLUMNAS_VOCABULARIO
 * (scripts/lib/columnasVocabulario.mjs), la misma de la paridad con el CHECK. Esto mira, en
 * el texto del código y sin ejecutarlo:
 *
 *   1. asignaciones: cada `col: <expr>`, `x.col = <expr>` o `{ col }` abreviado de una columna
 *      vigilada tiene que ser `paraEscribir("<su vocabulario>", …)`,
 *      `listaParaEscribir("<su vocabulario>", …)`, `carpetaParaEscribir(…)` (solo
 *      collection_id) o `null`, y la llamada cierra la expresión (`paraEscribir(…) || otro`
 *      no vale: lo de detrás se escribiría sin filtro). Un `_x` solo dentro de un patrón de
 *      destructurar (descartar). Dónde mira:
 *      - columna de nombre propio (`pack_kind`, `active_days`, `ui_lang`): en todo src/ y api/;
 *      - columna `comun` (`channel`, `lang`, `origen`…, nombres que usan también objetos que
 *        no son filas): solo en los escritores de su tabla (supabase/cableado.json) y solo en
 *        un objeto con forma de fila, con otra clave en snake_case al lado (`chat_id`). El
 *        contexto de un chat (`{ channel, chatId, householdId }`) no es una fila;
 *      - parámetro de RPC (`rpc` de la columna): ese parámetro, en los ficheros que llaman a
 *        la función;
 *   2. literales: en los escritores de esas tablas (supabase/cableado.json más los que
 *      montan sus filas sin tocar la tabla, ARMAN_FILAS), ningún literal '…' o "…" igual a
 *      un valor vivo o retirado de los vocabularios de las tablas que escribe: el valor sale
 *      de la constante. La clave de un mapa de etiquetas (`{ dia_a_dia: "Día a día" }`) no es
 *      un literal: pinta un id, no lo escribe (y su paridad la mira vocabularios.test.js).
 *
 * Límites, a propósito: una fila copiada con `...fila` no se ve (por eso la copia de una
 * receta la monta su dueño, `filaCopiada` de userRecipesFila.js, que reescribe sus columnas);
 * una clave calculada (`[col]: x`) o entre comillas, tampoco; una asignación partida en dos
 * líneas (`col:` y el valor debajo) sale como «no pasa»: se escribe en una. En una columna
 * `comun` no se mira `x.col = …` (el `rec.lang` del reconocimiento de voz no es una fila).
 * Lo que se escribe desde SQL no se ve: lo dice ESCRITORES_SQL de columnasVocabulario.mjs.
 * Puro: quien llama le pasa los textos.
 */
import { COLUMNAS_VOCABULARIO } from "./columnasVocabulario.mjs";

/** Columna → nombre de su vocabulario en VOCABULARIOS, sacado de la lista común. */
export const COLUMNAS = Object.freeze(Object.fromEntries(Object.entries(COLUMNAS_VOCABULARIO).map(([c, d]) => [c, d.lista])));

/** Montan filas de esas tablas sin tocarlas (el que inserta las importa): fichero → tablas. */
export const ARMAN_FILAS = { "src/lib/userRecipesFila.js": ["user_recipes"] };

const tablaDe = (c) => c.split(".")[0];
const colDe = (c) => c.split(".")[1];
/** Acepta la lista común ({ lista, … }) o un mapa corto columna → vocabulario (los tests). */
const descriptor = (d) => (typeof d === "string" ? { lista: d } : d);

/**
 * Lo que se vigila, agrupado por clave escrita: [{ clave, vocab, columnas, tablas, comun, rpcs }].
 * Varias tablas con la misma clave y vocabulario (`channel` de las bot_*) son un solo vigía.
 */
export function vigias(columnas = COLUMNAS_VOCABULARIO) {
  const out = new Map();
  const sumar = (clave, vocab, columna, { comun = false, rpc = null } = {}) => {
    const k = `${clave}|${vocab}|${comun}|${rpc ?? ""}`;
    if (!out.has(k)) out.set(k, { clave, vocab, columnas: [], tablas: new Set(), comun, rpc });
    const v = out.get(k);
    v.columnas.push(columna);
    v.tablas.add(tablaDe(columna));
  };
  for (const [columna, d] of Object.entries(columnas)) {
    const { lista, comun, rpc } = descriptor(d);
    sumar(colDe(columna), lista, columna, { comun: Boolean(comun) });
    for (const [funcion, parametro] of Object.entries(rpc ?? {})) sumar(parametro, lista, columna, { rpc: funcion });
  }
  return [...out.values()];
}

/** Quita comentarios de bloque, de línea entera y los que van tras código (` // …`). */
export function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l.replace(/\s\/\/\s.*$/, "")))
    .join("\n");
}

/** Los ficheros que escriben (o tocan) esas tablas: los de cableado.json y ARMAN_FILAS. */
export function escritores(cableado, columnas = COLUMNAS_VOCABULARIO) {
  const tablas = new Set(Object.keys(columnas).map(tablaDe));
  const arman = Object.entries(ARMAN_FILAS).filter(([, ts]) => ts.some((t) => tablas.has(t))).map(([f]) => f);
  return [...new Set([...[...tablas].flatMap((t) => cableado[t] ?? []), ...arman])].sort();
}

/** Las columnas (de la lista) de las tablas que escribe un fichero: para sus literales. */
export function columnasDe(fichero, cableado, columnas = COLUMNAS_VOCABULARIO) {
  const tablas = new Set([...Object.entries(cableado).filter(([, fs]) => fs.includes(fichero)).map(([t]) => t), ...(ARMAN_FILAS[fichero] ?? [])]);
  return Object.fromEntries(Object.entries(columnas).filter(([c]) => tablas.has(tablaDe(c))));
}

/** El contenido de cada literal '…', "…" o `…` de una línea, en blanco (las comillas se quedan). */
const sinCadenas = (l) => l.replace(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g, (_, q, c) => q + " ".repeat(c.length) + q);

const ABRE = { "(": ")", "[": "]", "{": "}" };

/** Desde `i` (un `(`), la posición de su `)`; -1 si no cierra. `t`: texto sin cadenas ni comentarios. */
function cierre(t, i) {
  const pila = [];
  for (let j = i; j < t.length; j++) {
    if (ABRE[t[j]]) pila.push(ABRE[t[j]]);
    else if (")]}".includes(t[j])) {
      if (pila.pop() !== t[j]) return -1;
      if (!pila.length) return j;
    }
  }
  return -1;
}

/**
 * Si lo que empieza en `i` (una llamada `f(…)` o `null`) cierra la expresión: detrás solo
 * `,`, `;`, `}`, `)`, `]` o el final de la línea. `paraEscribir(…) || x` no la cierra.
 */
function cierraLaExpresion(t, i) {
  const abre = t.slice(i).match(/^null\b|^[\w$]+\s*\(/);
  if (!abre) return false;
  const fin = abre[0] === "null" ? i + 4 : cierre(t, i + abre[0].length - 1) + 1;
  if (fin <= 0) return false;
  return /^[ \t]*(?:[,;})\]]|\n|$)/.test(t.slice(fin));
}

/**
 * Lo de la derecha de una asignación a `col`: null si pasa por la lista viva del vocabulario
 * de esa columna, o el porqué si no. `rhs`: texto ORIGINAL (con sus cadenas); `t` e `i`: el
 * texto sin cadenas y dónde empieza el valor, para ver si la llamada cierra la expresión.
 * `paraEscribir("usos_receta", x)` en pack_kind no vale: escribiría con la lista equivocada.
 */
function problemaDelValor(rhs, t, i, vocab, col) {
  const motivo = (() => {
    const llamada = rhs.match(/^(?:paraEscribir|listaParaEscribir)\(\s*(["'])([^"']*)\1/);
    if (llamada) return llamada[2] === vocab ? null : `usa el vocabulario «${llamada[2]}» y la columna es de «${vocab}»`;
    if (/^(?:paraEscribir|listaParaEscribir)\(/.test(rhs)) return "el vocabulario de paraEscribir va escrito, no en una variable";
    if (/^carpetaParaEscribir\(/.test(rhs)) return col === "collection_id" ? null : "carpetaParaEscribir solo vale para collection_id";
    if (/^null\b/.test(rhs)) return null;
    return "no pasa por la lista viva";
  })();
  if (motivo) return motivo;
  return cierraLaExpresion(t, i) ? null : "la llamada no cierra la expresión: lo de detrás se escribiría sin pasar por la lista viva";
}

/**
 * Si la posición `i` está dentro de un literal de objeto con forma de fila: alguna otra clave
 * suya, al primer nivel, en snake_case (`chat_id`, `entrada_xid`, `p_household_id`).
 */
function enFila(t, i, clave) {
  let prof = 0;
  let abre = -1;
  for (let j = i - 1; j >= 0; j--) {
    if (")]}".includes(t[j])) prof++;
    else if (ABRE[t[j]]) {
      if (prof === 0) {
        if (t[j] === "{") abre = j;
        break;
      }
      prof--;
    }
  }
  if (abre < 0) return false;
  const fin = cierre(t, abre);
  let cuerpo = t.slice(abre + 1, fin < 0 ? t.length : fin);
  // Lo de dentro de un (…), […] o {…} anidado no es clave de esta fila.
  for (let antes = ""; antes !== cuerpo;) {
    antes = cuerpo;
    cuerpo = cuerpo.replace(/\([^()[\]{}]*\)|\[[^()[\]{}]*\]|\{[^()[\]{}]*\}/g, (m) => " ".repeat(m.length));
  }
  return [...`,${cuerpo}`.matchAll(/,\s*([a-z][a-z0-9]*_[a-z0-9_]+)\s*(?=[:,]|$)/g)].some((m) => m[1] !== clave);
}

/**
 * Las asignaciones que no pasan por la lista viva: [{ columna, linea, texto, motivo }].
 * Lo de dentro de una cadena no cuenta (un `select("…, pack_kind, …")` lee, no escribe), así
 * que una clave entre comillas (`"pack_kind": x`) tampoco se ve: nadie las usa hoy.
 * `fichero` y `cableado` acotan las columnas `comun` a los escritores de su tabla; sin ellos
 * (los ejemplos del test) se miran en cualquier texto, pero solo en objetos con forma de fila.
 */
export function asignacionesSinFiltro(texto, { columnas = COLUMNAS_VOCABULARIO, fichero = null, cableado = null } = {}) {
  const originales = sinComentarios(texto).split("\n");
  const lineas = originales.map(sinCadenas);
  const todo = lineas.join("\n");
  const inicio = [];
  lineas.reduce((n, l, i) => ((inicio[i] = n), n + l.length + 1), 0);
  const out = [];
  const vistos = new Set();
  for (const v of vigias(columnas)) {
    if (v.rpc && !new RegExp(`\\brpc\\(\\s*["'\`]${v.rpc}["'\`]`).test(texto)) continue;
    if (v.comun && fichero && cableado && ![...v.tablas].some((t) => (cableado[t] ?? []).includes(fichero) || (ARMAN_FILAS[fichero] ?? []).includes(t))) continue;
    const col = v.clave;
    const columna = v.columnas.join(", ");
    // Un patrón de destructurar (`const { col: _x } =`, `({ col: _x }) =>`) no escribe.
    const destructura = new RegExp(`(?:\\b(?:const|let|var)\\s*\\{[^}]*\\b${col}\\b[^}]*\\}\\s*=)|(?:\\(\\s*\\{[^}]*\\b${col}\\b[^}]*\\}\\s*\\)\\s*=>)`);
    lineas.forEach((l, i) => {
      const texto = originales[i].trim();
      const apunta = (motivo) => {
        const k = `${i}|${col}|${motivo}`;
        if (vistos.has(k)) return;
        vistos.add(k);
        out.push({ columna, linea: i + 1, texto, motivo });
      };
      const enDestructura = destructura.test(l);
      const esFila = (pos) => !v.comun || enFila(todo, inicio[i] + pos, col);
      for (const m of l.matchAll(new RegExp(`(?<![\\w.$])${col}\\s*:\\s*(.*)$`, "g"))) {
        // `a ? col : c` no es una clave: se exige que la columna abra la línea o venga tras `{`, `,` o `(`.
        const antes = l.slice(0, m.index).trimEnd();
        if (antes && !/[{,(]$/.test(antes)) continue;
        if (!esFila(m.index)) continue;
        const desde = m.index + m[0].length - m[1].length;
        const rhs = originales[i].slice(desde).trim();
        // `_x` solo descarta dentro de un patrón de destructurar; en un objeto que se escribe es un valor.
        if (enDestructura && /^_\w*\b/.test(rhs)) continue;
        const p = problemaDelValor(rhs, todo, inicio[i] + desde, v.vocab, col);
        if (p) apunta(p);
      }
      // Asignación a una propiedad: `fila.col = x` (no en una columna `comun`: ver los límites).
      if (!v.comun) {
        for (const m of l.matchAll(new RegExp(`\\.${col}\\s*=(?![=>])\\s*(.*)$`, "g"))) {
          const desde = m.index + m[0].length - m[1].length;
          const p = problemaDelValor(originales[i].slice(desde).trim(), todo, inicio[i] + desde, v.vocab, col);
          if (p) apunta(p);
        }
      }
      // Abreviada: `{ …, col }`, `{ col, … }` o `col,` en su línea dentro de un literal de objeto.
      const abreviada = l.match(new RegExp(`(?:^|[{,])\\s*${col}\\s*(?=[,}]|$)`));
      if (abreviada && !enDestructura && esFila(abreviada.index + abreviada[0].length - 1)) apunta("abreviada: no pasa por la lista viva");
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
export function valoresVigilados(vocabularios, retirados, columnas = COLUMNAS_VOCABULARIO) {
  const nombres = [...new Set(Object.values(columnas).map((d) => descriptor(d).lista))];
  return new Set(nombres.flatMap((n) => [...(vocabularios[n] ?? []), ...Object.keys(retirados[n] ?? {})]));
}
