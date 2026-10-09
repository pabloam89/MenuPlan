/**
 * Detector de lecturas de fuentes retiradas o deprecadas (issue #251).
 * Funciones puras; el test que las usa es ops/lecturasRetiradas.test.js.
 *
 * Todo sale del registro de fuentes (TABLAS de src/data/model.js): qué tablas,
 * vistas y ficheros están retirados, y quién puede leer una fuente deprecada.
 * Lo único que NO está en el registro es CÓMO se lee una fuente deprecada
 * (SIMBOLOS_DEPRECADAS): el nombre del símbolo que delata la lectura.
 */

/** Ficheros de código que se examinan (los que git ve, ver ops/ficherosGit.js). */
export const ES_CODIGO = /\.(m?js|jsx|cjs|ts|tsx)$/;

/**
 * Cómo se lee cada fuente DEPRECADA, por id del registro. recipes.js exporta
 * tres cosas y solo una es la fuente deprecada: `RECIPES` (= BASE_RECIPES con
 * campos añadidos). `RECIPES_BY_ID`, `registerRecipes` e `INGREDIENT_CATEGORIES`
 * son otras cosas, vivas, y NO se vigilan. `generateMenu` (planner.js) es la
 * puerta de atrás: lee RECIPES por dentro.
 */
export const SIMBOLOS_DEPRECADAS = {
  recetasPrototipo: [
    { nombre: "BASE_RECIPES", re: /\bBASE_RECIPES\b/ },
    // `import { RECIPES, … } from "…/recipes.js"`: RECIPES suelto dentro de las llaves
    { nombre: "RECIPES (de data/recipes.js)", re: /import\s*\{[^}]*(?<![\w$])RECIPES(?![\w$])[^}]*\}\s*from\s*["'`][^"'`]*\/recipes(\.js)?["'`]/ },
    { nombre: "generateMenu (planner.js)", re: /(?<![\w$.])generateMenu(?![\w$])/ },
  ],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Quita los comentarios (de línea y de bloque) sin tocar lo que va dentro de strings
 * ("…", '…', `…`) y devuelve además el contenido de cada string (para buscar
 * SQL embebido). Es un recorrido carácter a carácter, no un parser: un regex
 * literal con comillas puede desajustarlo, y entonces falla hacia no ver (nunca
 * hacia un falso positivo). " y ' terminan en el salto de línea.
 */
export function limpiar(src) {
  let codigo = "";
  const cadenas = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      const hasta = fin === -1 ? n : fin + 2;
      // conserva los saltos de línea para no mover las líneas
      codigo += src.slice(i, hasta).replace(/[^\n]/g, " ");
      i = hasta;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c && !(c !== "`" && src[j] === "\n")) j += src[j] === "\\" ? 2 : 1;
      const fin = Math.min(j + 1, n);
      codigo += src.slice(i, fin);
      cadenas.push(src.slice(i + 1, j));
      i = fin;
    } else {
      codigo += c;
      i++;
    }
  }
  return { codigo, cadenas };
}

/** Fuentes que ya no se leen (estado retirado o rol copia_retirada). */
export const retiradas = (registro) => registro.filter((f) => f.estado === "retirado" || f.rol === "copia_retirada");
export const deprecadas = (registro) => registro.filter((f) => f.estado === "deprecado");

/** Primer token que parece una ruta de fichero de un texto como «src/lib/planner.js (generateMenu)». */
export function rutaDe(texto) {
  const m = /^[\w./@-]+\.(?:m?js|jsx|cjs|ts|tsx|json|sql)\b/.exec(texto.trim());
  return m ? m[0] : null;
}

/** Los ficheros que el registro declara como dueños o lectores de la fuente (productor + consumidores + sus propios ficheros). */
export const rutasDeclaradas = (f) => new Set([...(f.productor ?? []), ...(f.consumidores ?? []), ...(f.ficheros ?? [])].map(rutaDe).filter(Boolean));

/**
 * Los patrones de lectura de las tablas y vistas retiradas, y el de los
 * ficheros retirados. Devuelve [{fuente, tipo, re, sobre}] donde `sobre` dice
 * si el patrón va sobre el código (sin comentarios) o sobre el contenido de los strings.
 */
export function reglasDe(registro) {
  const reglas = [];
  for (const f of retiradas(registro)) {
    for (const t of [...f.tablas, ...f.vistas]) {
      const T = esc(t);
      reglas.push(
        { fuente: f.id, objeto: t, tipo: "tabla", sobre: "codigo", re: new RegExp(`\\.from\\(\\s*["'\`]${T}["'\`]`) },
        { fuente: f.id, objeto: t, tipo: "tabla", sobre: "codigo", re: new RegExp(`/rest/v1/${T}(?![\\w])`) },
        // ayudantes del bot (api/_bot/db.js): select("t", …), insert, update, borrar
        { fuente: f.id, objeto: t, tipo: "tabla", sobre: "codigo", re: new RegExp(`(?<![\\w$.])(select|insert|update|upsert|borrar)\\(\\s*["'\`]${T}["'\`]`) },
        // SQL embebido: un verbo SQL y la tabla en el mismo string
        { fuente: f.id, objeto: t, tipo: "tabla (SQL)", sobre: "cadenas", re: new RegExp(`\\b(select\\b[^;]*\\bfrom|insert\\s+into|delete\\s+from|update|join|truncate(\\s+table)?|alter\\s+table|drop\\s+table)\\s+(public\\.)?${T}(?![\\w])`, "i") },
      );
    }
    for (const g of f.ficheros) {
      // `supabase/seed_*.sql` → el nombre de base, con * = cualquier cosa
      const base = g.split("/").pop();
      const re = new RegExp(esc(base).replace(/\\\*/g, "[\\w.-]*"));
      reglas.push({ fuente: f.id, objeto: g, tipo: "fichero", sobre: "cadenas", re });
    }
  }
  return reglas;
}

/** Lecturas de fuentes retiradas en un fuente de código: [{fuente, objeto, tipo}]. */
export function lecturasRetiradas(src, reglas) {
  const { codigo, cadenas } = limpiar(src);
  const textoCadenas = cadenas.join("\n");
  const vistos = new Set();
  const hallazgos = [];
  for (const r of reglas) {
    const k = `${r.fuente}|${r.objeto}`;
    if (vistos.has(k)) continue;
    if (r.re.test(r.sobre === "codigo" ? codigo : textoCadenas)) {
      vistos.add(k);
      hallazgos.push({ fuente: r.fuente, objeto: r.objeto, tipo: r.tipo });
    }
  }
  return hallazgos;
}

/** Símbolos de fuentes deprecadas que usa un fuente de código: [{fuente, simbolo}]. */
export function lecturasDeprecadas(src, registro) {
  const { codigo } = limpiar(src);
  const hallazgos = [];
  for (const f of deprecadas(registro)) {
    for (const s of SIMBOLOS_DEPRECADAS[f.id] ?? []) if (s.re.test(codigo)) hallazgos.push({ fuente: f.id, simbolo: s.nombre });
  }
  return hallazgos;
}
