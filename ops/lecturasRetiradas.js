/**
 * Detector de lecturas de fuentes retiradas o deprecadas (issue #251).
 * Funciones puras; el test que las usa es ops/lecturasRetiradas.test.js.
 *
 * Todo sale del registro de fuentes (TABLAS de src/data/model.js): qué tablas,
 * vistas y ficheros están retirados, y quién puede leer una fuente deprecada.
 * Lo único que NO está en el registro es CÓMO se lee una fuente cuyo fichero es
 * código (SIMBOLOS_DEPRECADAS): el símbolo que delata la lectura.
 */

/** Ficheros de código que se examinan (los que git ve, ver ops/ficherosGit.js). */
export const ES_CODIGO = /\.(m?js|jsx|cjs|ts|tsx)$/;

/**
 * Cómo se lee una fuente cuyo FICHERO es código (recetasPrototipo), por id del
 * registro. recipes.js exporta varias cosas y solo una es la fuente: `RECIPES`
 * (= BASE_RECIPES con campos añadidos). `RECIPES_BY_ID`, `registerRecipes` e
 * `INGREDIENT_CATEGORIES` son otras cosas, vivas, y NO se vigilan: por eso estas
 * fuentes se vigilan por SÍMBOLO y no por el nombre del fichero (reglasDe()
 * salta los `ficheros` que son código). `generateMenu` (planner.js) es la puerta
 * de atrás: lee RECIPES por dentro.
 *
 * `re` va sobre el código sin comentarios, strings ni regex (soloCodigo);
 * `confirma`, si existe, sobre el mismo tramo con los strings a la vista.
 * `clave` de cada símbolo (la primera palabra del nombre) es un filtro rápido.
 * Vale para una fuente `deprecado` y, cuando se retire, para `retirado`:
 * la entrada se quita solo al borrar el fichero y la fuente; mientras tanto el
 * test cruza la lista con el registro en los dos sentidos.
 */
export const SIMBOLOS_DEPRECADAS = {
  recetasPrototipo: [
    { nombre: "BASE_RECIPES", re: /(?<![\w$])BASE_RECIPES(?![\w$])/ },
    // `import { RECIPES, … } from "…/recipes.js"`: RECIPES suelto dentro de las llaves
    { nombre: "RECIPES (de data/recipes.js)", re: /import\s*\{[^}]*(?<![\w$])RECIPES(?![\w$])[^}]*\}\s*from\s*["'`]\s*["'`]/, confirma: /\/recipes(\.js)?["'`]$/ },
    { nombre: "generateMenu (planner.js)", re: /(?<![\w$.])generateMenu(?![\w$])/ },
  ],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ANTES_DE_REGEX = new Set([..."(=,:[!&|?{};+-*%~^"]);
const PALABRAS_ANTES_DE_REGEX = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "instanceof", "yield", "await", "else", "do"]);
const RE_TEXTO = /[^{<]+/y;
const RE_PALABRA = /[\w$]/;
const RE_PALABRA_LARGA = /[\w$]+/y;
const blanco = (t) => t.replace(/[^\n]/g, " ");
const blancoSalvoComillas = (t) => t.replace(/[^\n"'`]/g, " ");

/**
 * Recorre un fuente JS/JSX de una pasada y separa el código de lo que es
 * comentario, string o regex literal. No es un parser. Sabe de: comentarios de
 * línea y de bloque; strings "…" y '…' (acaban en el salto de línea);
 * plantillas con ${…} anidado (el interior es código); y regex literales
 * por contexto (una / es regex tras ( = , : [ ! & | ? { } ; + - * % ~ ^, tras
 * return/typeof/case/…, o al inicio; con su clase […] y sus flags; si no
 * cierra en la misma línea no era regex).
 *
 * Devuelve, todos con la MISMA longitud y las mismas líneas que `src`:
 *  - codigo      sin comentarios (strings y regex intactos)
 *  - soloCodigo  además sin el contenido de strings y regex (quedan las comillas)
 *  - cadenas     el contenido de cada string y de cada trozo de plantilla
 *  - marcas      dónde empiezan comentarios, cadenas y regex (para medirlo)
 *
 * Medido contra espree (en el scratchpad, no en el repo) sobre los 847 ficheros
 * de código: 0 desfases en comentarios, strings y regex (el único aviso es un
 * texto JSX que empieza y acaba en comillas, donde la referencia se equivoca).
 * Aun así NO es un parser. Límites conocidos, todos de los que fallan hacia no
 * ver: una `/` tras `)` se toma por división (`if (x) /re/.test(y)`); un texto
 * suelto fuera de JSX con comillas sin cerrar en la misma línea; TypeScript con
 * genéricos (`a <B>`). Un código raro podría desajustarlo en el otro sentido:
 * si un falso positivo aparece, repite la medida contra espree antes de tocar nada.
 */
export function limpiar(src) {
  let codigo = "";
  let soloCodigo = "";
  const cadenas = [];
  const marcas = { comentarios: [], cadenas: [], regex: [] };
  const n = src.length;
  const pila = []; // "llave" | "plantilla" mientras se está dentro de ${ }
  let i = 0;
  let ultimo = ""; // último carácter significativo de código
  let ultimaPalabra = "";

  const emitirCodigo = (t) => { codigo += t; soloCodigo += t; };
  const emitirOpaco = (t) => { codigo += t; soloCodigo += blancoSalvoComillas(t); };

  /** Lee el cuerpo de una plantilla desde i; acaba en ` o en ${ (que abre código). */
  function plantilla() {
    let j = i;
    while (j < n && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
    j = Math.min(j, n);
    cadenas.push(src.slice(i, j));
    emitirOpaco(src.slice(i, j));
    i = j;
    if (src[i] === "`") { emitirCodigo("`"); i++; ultimo = "`"; ultimaPalabra = ""; }
    else if (i < n) { emitirCodigo("${"); i += 2; pila.push("plantilla"); ultimo = "{"; ultimaPalabra = ""; }
  }

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    const modo = pila[pila.length - 1];
    if (modo === "hijos") {
      // texto de un JSX: ni comentarios ni strings; solo { (código) y < (otra etiqueta)
      if (c === "{") { emitirCodigo(c); pila.push("jsxExpr"); i++; }
      else if (c === "<" && d === "/") { emitirCodigo("</"); pila.push("etiquetaCierre"); i += 2; }
      else if (c === "<" && (/[A-Za-z]/.test(d) || d === ">")) { emitirCodigo(c); pila.push("etiqueta"); i++; }
      else {
        RE_TEXTO.lastIndex = i;
        const m = RE_TEXTO.exec(src);
        const t = m ? m[0] : c;
        codigo += t; soloCodigo += blanco(t); i += t.length;
      }
    } else if (c === " " || c === "\n" || c === "\t" || c === "\r") {
      emitirCodigo(c); i++;
    } else if (RE_PALABRA.test(c)) {
      RE_PALABRA_LARGA.lastIndex = i;
      ultimaPalabra = RE_PALABRA_LARGA.exec(src)[0];
      emitirCodigo(ultimaPalabra);
      i += ultimaPalabra.length; ultimo = ultimaPalabra[ultimaPalabra.length - 1];
    } else if ((modo === "etiqueta" || modo === "etiquetaCierre") && c === "/" && d === ">") {
      emitirCodigo("/>"); pila.pop(); i += 2; ultimo = ")"; ultimaPalabra = "";
    } else if ((modo === "etiqueta" || modo === "etiquetaCierre") && c === ">") {
      emitirCodigo(c); i++;
      if (modo === "etiquetaCierre") { pila.pop(); pila.pop(); ultimo = ")"; ultimaPalabra = ""; } else pila[pila.length - 1] = "hijos";
    } else if ((modo === "etiqueta" || modo === "etiquetaCierre") && c === "{") {
      emitirCodigo(c); pila.push("jsxExpr"); i++;
    } else if (c === "}" && modo === "jsxExpr") {
      emitirCodigo(c); pila.pop(); i++; ultimo = ")"; ultimaPalabra = "";
    } else if (c === "<" && (/[A-Za-z]/.test(d) || d === ">") && modo !== "etiqueta" && modo !== "etiquetaCierre" && (ultimo === "" || ANTES_DE_REGEX.has(ultimo) || (PALABRAS_ANTES_DE_REGEX.has(ultimaPalabra) && /\w/.test(ultimo)))) {
      emitirCodigo(c); pila.push("etiqueta"); i++;
    } else if ((c === "/" && d === "/") || (i === 0 && c === "#" && d === "!")) {
      marcas.comentarios.push(i);
      const ini = i;
      while (i < n && src[i] !== "\n") i++;
      codigo += blanco(src.slice(ini, i)); soloCodigo += blanco(src.slice(ini, i));
    } else if (c === "/" && d === "*") {
      marcas.comentarios.push(i);
      const fin = src.indexOf("*/", i + 2);
      const hasta = fin === -1 ? n : fin + 2;
      codigo += blanco(src.slice(i, hasta)); soloCodigo += blanco(src.slice(i, hasta));
      i = hasta;
    } else if (c === '"' || c === "'") {
      marcas.cadenas.push(i);
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      j = Math.min(j, n);
      cadenas.push(src.slice(i + 1, j));
      emitirCodigo(c); emitirOpaco(src.slice(i + 1, j));
      if (src[j] === c) { emitirCodigo(c); j++; }
      i = j; ultimo = c; ultimaPalabra = "";
    } else if (c === "`") {
      marcas.cadenas.push(i);
      emitirCodigo("`"); i++;
      plantilla();
    } else if (c === "}" && pila[pila.length - 1] === "plantilla") {
      pila.pop(); emitirCodigo("}"); i++;
      plantilla();
    } else if (c === "/" && (ultimo === "" || ANTES_DE_REGEX.has(ultimo) || (PALABRAS_ANTES_DE_REGEX.has(ultimaPalabra) && /\w/.test(ultimo)))) {
      // ¿regex literal? Debe cerrarse en la misma línea; si no, era otra cosa (JSX, división).
      let j = i + 1;
      let clase = false;
      while (j < n && src[j] !== "\n" && (clase || src[j] !== "/")) {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") clase = true;
        else if (src[j] === "]") clase = false;
        j++;
      }
      if (j < n && src[j] === "/" && j > i + 1) {
        j++;
        while (j < n && /[a-z]/.test(src[j])) j++;
        marcas.regex.push(i);
        emitirOpaco(src.slice(i, j));
        i = j; ultimo = ")"; ultimaPalabra = "";
      } else { emitirCodigo(c); i++; ultimo = c; ultimaPalabra = ""; }
    } else if (/\s/.test(c)) {
      emitirCodigo(c); i++;
    } else if (/[\w$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      ultimaPalabra = src.slice(i, j);
      emitirCodigo(ultimaPalabra);
      i = j; ultimo = ultimaPalabra[ultimaPalabra.length - 1];
    } else {
      emitirCodigo(c);
      if (c === "{") pila.push("llave");
      else if (c === "}") pila.pop();
      // «=>» deja un hueco donde cabe una expresión (una regex, p. ej.)
      ultimo = c === ">" && src[i - 1] === "=" ? "=" : c; ultimaPalabra = ""; i++;
    }
  }
  return { codigo, soloCodigo, cadenas, marcas };
}

/** Fuentes que ya no se leen (estado retirado o rol copia_retirada). */
export const retiradas = (registro) => registro.filter((f) => f.estado === "retirado" || f.rol === "copia_retirada");
export const deprecadas = (registro) => registro.filter((f) => f.estado === "deprecado");
/** Las que se vigilan por símbolo: deprecadas, y retiradas que siguen teniendo entrada en SIMBOLOS_DEPRECADAS. */
export const porSimbolo = (registro) => registro.filter((f) => SIMBOLOS_DEPRECADAS[f.id] && (f.estado === "deprecado" || f.estado === "retirado"));

/** Primer token que parece una ruta de fichero de un texto como «src/lib/planner.js (generateMenu)». */
export function rutaDe(texto) {
  const m = /^[\w./@-]+\.(?:m?js|jsx|cjs|ts|tsx|json|sql)\b/.exec(texto.trim());
  return m ? m[0] : null;
}

/** Los ficheros que el registro declara como dueños o lectores de la fuente (productor + consumidores + sus propios ficheros). */
export const rutasDeclaradas = (f) => new Set([...(f.productor ?? []), ...(f.consumidores ?? []), ...(f.ficheros ?? [])].map(rutaDe).filter(Boolean));

/**
 * Los patrones de lectura de las tablas y vistas retiradas, y de los ficheros
 * retirados que NO son código. Devuelve [{fuente, objeto, tipo, sobre, re, previo?}]:
 *  - sobre "codigo": el patrón va sobre el código sin comentarios y su parte
 *    `previo` (p. ej. `.from(`) tiene que estar en código, no dentro de un string
 *    (un ejemplo `'supabase.from("recipes")'` en un test no es una lectura);
 *  - sobre "cadenas": el patrón va sobre el contenido de los strings.
 * Los `ficheros` que son código (recipes.js) se vigilan por símbolo, ver SIMBOLOS_DEPRECADAS.
 */
export function reglasDe(registro) {
  const reglas = [];
  for (const f of retiradas(registro)) {
    for (const t of [...f.tablas, ...f.vistas]) {
      const T = esc(t);
      reglas.push(
        { fuente: f.id, objeto: t, tipo: "tabla", sobre: "codigo", re: new RegExp(`(\\.from\\(\\s*)["'\`]${T}["'\`]`) },
        // ayudantes del bot (api/_bot/db.js): select("t", …), insert, update, borrar; también db.select("t")
        { fuente: f.id, objeto: t, tipo: "tabla", sobre: "codigo", re: new RegExp(`((?<![\\w$])(?:select|insert|update|upsert|borrar)\\(\\s*)["'\`]${T}["'\`]`) },
        { fuente: f.id, objeto: t, tipo: "tabla", sobre: "cadenas", re: new RegExp(`/rest/v1/${T}(?![\\w])`) },
        // SQL embebido: un verbo SQL y la tabla en el mismo string
        { fuente: f.id, objeto: t, tipo: "tabla (SQL)", sobre: "cadenas", re: new RegExp(`\\b(select\\b[^;]*\\bfrom|insert\\s+into|delete\\s+from|update|join|truncate(\\s+table)?|alter\\s+table|drop\\s+table)\\s+(public\\.)?${T}(?![\\w])`, "i") },
      );
    }
    for (const g of f.ficheros) {
      if (ES_CODIGO.test(g)) continue; // un fichero de código se lee por símbolo, no por su nombre
      // `supabase/seed_*.sql` → el nombre de base, con * = cualquier cosa
      const base = g.split("/").pop();
      reglas.push({ fuente: f.id, objeto: g, tipo: "fichero", sobre: "cadenas", re: new RegExp(esc(base).replace(/\\\*/g, "[\\w.-]*")) });
    }
  }
  // `clave`: texto que tiene que aparecer en el fuente para que merezca la pena examinarlo (rápido, sin tokenizar)
  for (const r of reglas) r.clave = r.tipo === "fichero" ? r.objeto.split("/").pop().split("*")[0] : r.objeto;
  return reglas;
}

/** ¿Algún acierto del patrón tiene su parte `previo` (grupo 1) en código y no dentro de un string? */
function enCodigo(re, codigo, soloCodigo) {
  for (const m of codigo.matchAll(re.global ? re : new RegExp(re.source, "g"))) {
    const previo = m[1] ?? "";
    if (soloCodigo.slice(m.index, m.index + previo.length) === previo) return true;
  }
  return false;
}

/** Lecturas de fuentes retiradas en un fuente de código: [{fuente, objeto, tipo}]. */
export function lecturasRetiradas(src, reglas) {
  const aplicables = reglas.filter((r) => src.includes(r.clave));
  if (!aplicables.length) return [];
  const { codigo, soloCodigo, cadenas } = limpiar(src);
  const textoCadenas = cadenas.join("\n");
  const vistos = new Set();
  const hallazgos = [];
  for (const r of aplicables) {
    const k = `${r.fuente}|${r.objeto}`;
    if (vistos.has(k)) continue;
    if (r.sobre === "codigo" ? enCodigo(r.re, codigo, soloCodigo) : r.re.test(textoCadenas)) {
      vistos.add(k);
      hallazgos.push({ fuente: r.fuente, objeto: r.objeto, tipo: r.tipo });
    }
  }
  return hallazgos;
}

/** Símbolos de fuentes vigiladas por símbolo que usa un fuente de código (solo en código): [{fuente, simbolo}]. */
export function lecturasDeprecadas(src, registro) {
  const hallazgos = [];
  let limpio = null;
  for (const f of porSimbolo(registro)) {
    for (const s of SIMBOLOS_DEPRECADAS[f.id]) {
      if (!src.includes(s.nombre.split(" ")[0])) continue;
      const { codigo, soloCodigo } = (limpio ??= limpiar(src));
      for (const m of soloCodigo.matchAll(new RegExp(s.re.source, "g"))) {
        if (s.confirma && !s.confirma.test(codigo.slice(m.index, m.index + m[0].length))) continue;
        hallazgos.push({ fuente: f.id, simbolo: s.nombre });
        break;
      }
    }
  }
  return hallazgos;
}
