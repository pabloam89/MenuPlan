/**
 * erroresTragados.mjs — encuentra los `catch` que se tragan un error sin avisar.
 *
 * Problema de fondo #177: un error que se calla no lo ve nadie. Pasó con la
 * limpieza de carpetas (#141), que las dejaba a medias sin decir nada al
 * arrancar sesión. La norma: ningún error se ignora sin dejar aviso. Tragarse
 * uno a propósito se puede, pero dejándolo escrito en el propio bloque.
 *
 * Un `catch` se traga el error cuando su cuerpo (sin comentarios):
 *   - está vacío, o
 *   - solo devuelve, asigna o salta (`continue`) con un valor por defecto: una
 *     expresión que no nombra el error capturado y no llama a nada
 *     (`return null`, `x = []`, `return { ok: false }`, `return fallback`).
 * Vale igual para `try {} catch {}` que para `.catch(() => null)`.
 *
 * No cuenta como tragado si el bloque lleva un comentario `a propósito: <porqué>`
 * o un aviso: `console.warn`, `console.error`, `process.stderr.write` o el
 * `avisos.push` del arranque.
 *
 * Sin dependencias: un recorrido de caracteres que se salta cadenas,
 * comentarios y expresiones regulares. No es un parser de JavaScript, pero no
 * necesita serlo para esto; si un día confunde algo, el test lo enseña.
 */

const AVISO = /\b(console\.(warn|error)|process\.stderr\.write|avisos\.push)\s*\(/;
// Con su porqué: tras los dos puntos tiene que venir texto, no el cierre del comentario.
const A_PROPOSITO = /a prop[oó]sito:\s*[\p{L}\p{N}«"`]/iu;

/**
 * Devuelve el código con el contenido de comentarios (y, si `cadenas`, de
 * cadenas y regex) cambiado por espacios. Mismas posiciones y saltos de línea,
 * para poder volver al original.
 */
export function enmascarar(src, { cadenas = true } = {}) {
  const out = src.split("");
  const borra = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  let i = 0;
  let previo = ""; // último carácter de código no blanco, para distinguir regex de división
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      const j = fin === -1 ? src.length : fin;
      borra(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      const j = fin === -1 ? src.length : fin + 2;
      borra(i, j);
      i = j;
    } else if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      if (cadenas) borra(i + 1, j);
      i = j + 1;
      previo = c;
    } else if (c === "/" && (previo === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(previo))) {
      // Regex literal: hasta la barra sin escapar fuera de una clase [...]
      let j = i + 1;
      let clase = false;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") clase = true;
        else if (src[j] === "]") clase = false;
        else if (src[j] === "/" && !clase) break;
        j++;
      }
      if (cadenas) borra(i + 1, j);
      i = j + 1;
      previo = "/";
    } else {
      if (!/\s/.test(c)) previo = c;
      i++;
    }
  }
  return out.join("");
}

/** Índice de la llave que cierra la que abre en `desde` (sobre código enmascarado). */
function cierre(mascara, desde) {
  let n = 0;
  for (let k = desde; k < mascara.length; k++) {
    if (mascara[k] === "{") n++;
    else if (mascara[k] === "}" && --n === 0) return k;
  }
  return -1;
}

/** Índice del paréntesis que cierra la expresión que empieza en `desde`, a nivel 0. */
function finDeExpresion(mascara, desde) {
  let n = 0;
  for (let k = desde; k < mascara.length; k++) {
    const c = mascara[k];
    if ("([{".includes(c)) n++;
    else if (")]}".includes(c)) {
      if (n === 0) return k;
      n--;
    }
  }
  return -1;
}

/** ¿Es `expr` un valor por defecto? Ni nombra el error ni llama a nada. */
function porDefecto(expr, param) {
  const e = expr.trim();
  if (!e) return true;
  if (/\(/.test(e)) return false; // llama a algo (o agrupa una llamada): no es solo un valor
  if (param && new RegExp(`(^|[^\\w$.])${param.replace(/\$/g, "\\$")}\\b`).test(e)) return false;
  return true;
}

/** ¿Se traga el error un cuerpo de bloque ya sin comentarios ni cadenas? */
function cuerpoTraga(codigo, param) {
  const frases = codigo
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return frases.every((f) => {
    if (f === "continue" || f === "break") return true;
    const ret = f.match(/^return\b(.*)$/s);
    if (ret) return porDefecto(ret[1], param);
    const asig = f.match(/^(?:(?:let|const|var)\s+)?[\w$.[\]"' ]+?\s*(?:=|\|\|=|\?\?=)(?!=)(.*)$/s);
    if (asig) return porDefecto(asig[1], param);
    return false;
  });
}

const linea = (src, pos) => src.slice(0, pos).split("\n").length;

/**
 * Los `catch` que se tragan el error en `src`. Cada uno con su línea y el
 * texto de esa línea, recortado (lo que va a la lista fija del test).
 */
export function erroresTragados(src) {
  const mascara = enmascarar(src);
  const hallados = [];
  const apunta = (pos, inicio, fin) => {
    const bloque = src.slice(inicio, fin);
    if (A_PROPOSITO.test(bloque) || AVISO.test(bloque)) return;
    const l = linea(src, pos);
    hallados.push({ linea: l, texto: src.split("\n")[l - 1].trim().slice(0, 100) });
  };

  // try { … } catch (e) { … }
  for (const m of mascara.matchAll(/(?<![.\w$])catch\s*(?:\(\s*([\w$]*)[^)]*\))?\s*\{/g)) {
    const abre = m.index + m[0].length - 1;
    const cierra = cierre(mascara, abre);
    if (cierra === -1) continue;
    if (cuerpoTraga(mascara.slice(abre + 1, cierra), m[1] || null)) apunta(m.index, abre, cierra + 1);
  }

  // promesa.catch(() => …) y .catch((e) => { … })
  for (const m of mascara.matchAll(/\.catch\s*\(\s*(?:async\s*)?(?:\(\s*([\w$]*)[^)]*\)|([\w$]+))\s*=>\s*/g)) {
    const param = m[1] || m[2] || null;
    const desde = m.index + m[0].length;
    if (mascara[desde] === "{") {
      const cierra = cierre(mascara, desde);
      if (cierra === -1) continue;
      if (cuerpoTraga(mascara.slice(desde + 1, cierra), param)) apunta(m.index, m.index, cierra + 1);
    } else {
      const fin = finDeExpresion(mascara, desde);
      if (fin === -1) continue;
      if (porDefecto(mascara.slice(desde, fin), param)) apunta(m.index, m.index, fin + 1);
    }
  }
  return hallados.sort((a, b) => a.linea - b.linea);
}
