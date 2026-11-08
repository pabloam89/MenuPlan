/**
 * columnasTexto.mjs — las columnas de texto de la base y la clase de cada una (#585, norma C4).
 *
 * Un campo nuevo de texto que debería ser un vocabulario cerrado y no entra en el registro de
 * vocabularios no hacía fallar ningún test. Aquí: qué columnas de texto hay (leídas de las
 * migraciones, sin red) y a cuál de cuatro clases pertenece cada una:
 *   - `vocabulary`: tiene un CHECK de lista vivo o está en COLUMNAS_VOCABULARIO. Sale sola;
 *     no se escribe en el fichero de clases;
 *   - `free_text`: texto de una persona (nombres, notas, mensajes);
 *   - `identifier`: ids externos, tokens, urls, emails, claves;
 *   - `excluded`: fuera del vocabulario a propósito (los de salud, que esperan su catálogo).
 * Las tres últimas viven en ops/columnas-texto.json, con un motivo por columna.
 *
 * Reutiliza el lector de sentencias de verificar-estado.mjs y el reparto por comas de
 * checksVocabulario.mjs: no hay un tercer parser de SQL.
 *
 * Qué lee, en orden de migración: `create table T (…)` (columnas con tipo text, varchar,
 * character varying, char, citext, también en array `text[]`), `alter table T add column`,
 * `alter column c [set data] type X`, `drop column` y `drop table`. Un `rename` LANZA un
 * error, como en checksVocabulario.mjs: ninguna migración lo usa y el lector tendría que
 * aprender a seguirlo antes de dar nada por bueno.
 *
 * Límites, a propósito: lo que va dentro de `$$ … $$` no se ve; una tabla creada con
 * `create table … as` o `(like …)` no aporta columnas. Puro: no lee ficheros; quien llama
 * le pasa [{ fichero, sql }] ordenados.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nombre, sentencias } from "../verificar-estado.mjs";
import { hastaCierre, partes } from "./checksVocabulario.mjs";

export const RUTA_COLUMNAS_TEXTO = "ops/columnas-texto.json";

/** Las migraciones de supabase/migrations/ en orden, como las pide columnasDeTexto: [{ fichero, sql }]. */
export function leerMigracionesSql(raiz) {
  const dir = join(raiz, "supabase", "migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((fichero) => ({ fichero, sql: readFileSync(join(dir, fichero), "utf8") }));
}

/** Las clases de una columna de texto, con su definición (las tres últimas, las del fichero). */
export const CLASES_COLUMNA = Object.freeze({
  vocabulary: "Tiene un CHECK de lista o está en el registro de vocabularios; se cruza sola",
  free_text: "Texto de una persona: nombres, notas, mensajes; no se agrupa",
  identifier: "Id externo, token, url, email o clave; no se agrupa",
  excluded: "Fuera del vocabulario a propósito, con su motivo (los de salud, que esperan su catálogo)",
});
/** Las que se escriben en ops/columnas-texto.json. */
export const CLASES_DEL_FICHERO = Object.freeze(["free_text", "identifier", "excluded"]);

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QID = String.raw`(?:${ID}\.)?${ID}`;
const idDe = (x) => (x.startsWith('"') ? x.slice(1, -1) : x.toLowerCase());
const tablaDe = (q) => {
  const n = nombre(q);
  return n.esquema === "public" ? n.nombre : `${n.esquema}.${n.nombre}`;
};

const TIPO_TEXTO = String.raw`(?:text|citext|varchar|character\s+varying|bpchar|character|char)(?:\s*\(\s*\d+\s*\))?(?:\s*\[\s*\d*\s*\])*`;
const EMPIEZA_CON_TIPO = new RegExp(String.raw`^(?:${TIPO_TEXTO})(?![\w$])`, "i");
const NO_ES_COLUMNA = /^(constraint|check|primary|unique|foreign|exclude|like)\b/i;

/** ¿El texto (lo que sigue al nombre de la columna, o tras `type`) empieza con un tipo de texto? */
const esTipoTexto = (resto) => EMPIEZA_CON_TIPO.test(resto.trim());

/**
 * Las columnas de texto vivas tras aplicar las migraciones en orden:
 * Map «tabla.columna» → { tipo, fichero } (fichero: la migración que la creó o la volvió texto).
 */
export function columnasDeTexto(migraciones) {
  const vivas = new Map();
  const quitaTabla = (tabla) => { for (const k of [...vivas.keys()]) if (k.startsWith(`${tabla}.`)) vivas.delete(k); };
  const pon = (tabla, col, resto, fichero) => {
    const k = `${tabla}.${col}`;
    if (esTipoTexto(resto)) vivas.set(k, { tipo: resto.trim().match(EMPIEZA_CON_TIPO)[0].replace(/\s+/g, " ").toLowerCase(), fichero });
    else vivas.delete(k);
  };
  for (const { fichero, sql } of migraciones) {
    for (const s of sentencias(sql)) {
      const crea = s.match(new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+(if\s+not\s+exists\s+)?(${QID})\s*\(`, "i"));
      if (crea) {
        const tabla = tablaDe(crea[2]);
        // «if not exists» de una tabla que ya está no hace nada.
        if (crea[1] && [...vivas.keys()].some((k) => k.startsWith(`${tabla}.`))) continue;
        const cuerpo = hastaCierre(s, crea[0].length - 1) ?? "";
        for (const item of partes(cuerpo)) {
          if (NO_ES_COLUMNA.test(item)) continue;
          const m = item.match(new RegExp(`^(${ID})\\s+([\\s\\S]*)$`));
          if (m) pon(tabla, idDe(m[1]), m[2], fichero);
        }
        continue;
      }
      const borra = s.match(new RegExp(String.raw`^drop\s+table\s+(?:if\s+exists\s+)?(${QID}(?:\s*,\s*${QID})*)`, "i"));
      if (borra) { for (const t of borra[1].split(",")) quitaTabla(tablaDe(t.trim())); continue; }
      const alt = s.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QID})\s+`, "i"));
      if (!alt) continue;
      const tabla = tablaDe(alt[1]);
      for (const accion of partes(s.slice(alt[0].length))) {
        let m;
        if (/^rename\b/i.test(accion)) {
          throw new Error(`${fichero}: «alter table ${tabla} ${accion.slice(0, 60)}»: el lector de columnas de texto no sigue los rename (scripts/lib/columnasTexto.mjs); enséñale antes de seguir`);
        } else if (/^drop\s+constraint\b/i.test(accion)) continue;
        else if (/^add\s+(?:constraint|primary|unique|check|foreign|exclude)\b/i.test(accion)) continue;
        // Postgres admite «add foo text» sin «column» (auditor-datos, #585): las dos formas cuentan.
        else if ((m = accion.match(new RegExp(String.raw`^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?(${ID})\s+([\s\S]*)$`, "i")))) {
          // «if not exists» sobre una columna que ya está no la cambia.
          if (/^add\s+(?:column\s+)?if\s+not\s+exists/i.test(accion) && vivas.has(`${tabla}.${idDe(m[1])}`)) continue;
          pon(tabla, idDe(m[1]), m[2], fichero);
        } else if ((m = accion.match(new RegExp(String.raw`^alter\s+(?:column\s+)?(${ID})\s+(?:set\s+data\s+)?type\s+([\s\S]*)$`, "i")))) {
          pon(tabla, idDe(m[1]), m[2], fichero);
        } else if ((m = accion.match(new RegExp(String.raw`^drop\s+(?:column\s+)?(?:if\s+exists\s+)?(${ID})`, "i")))) {
          vivas.delete(`${tabla}.${idDe(m[1])}`);
        }
      }
    }
  }
  return new Map([...vivas].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Clasifica cada columna de texto y devuelve las frases de lo que no cuadra (vacío si todo
 * cuadra).
 *   - `columnas`: lo que da columnasDeTexto;
 *   - `vocabulario`: Set de «tabla.columna» con CHECK de lista vivo o en COLUMNAS_VOCABULARIO;
 *   - `clasificadas`: { «tabla.columna»: { class, reason } } de ops/columnas-texto.json.
 */
export function problemasDeClases(columnas, vocabulario, clasificadas) {
  const p = [];
  for (const [col, { fichero }] of columnas) {
    const c = clasificadas[col];
    const voc = vocabulario.has(col);
    if (voc && c) { p.push(`${col}: tiene CHECK de lista o está en el registro de vocabularios y además está clasificada como ${c.class}: quítala de ${RUTA_COLUMNAS_TEXTO}`); continue; }
    if (voc) continue;
    if (!c) p.push(`${col}: columna de texto (${fichero}) sin clasificar: si es un vocabulario cerrado, ponle CHECK y su lista en src/lib/vocabularios.js; si no, añádela a ${RUTA_COLUMNAS_TEXTO} (free_text, identifier o excluded) con su motivo`);
  }
  for (const [col, c] of Object.entries(clasificadas)) {
    if (!columnas.has(col)) p.push(`${col}: está en ${RUTA_COLUMNAS_TEXTO} y ya no es una columna de texto de la base: quítala`);
    if (!CLASES_DEL_FICHERO.includes(c?.class)) p.push(`${col}: clase «${c?.class}» no válida (${CLASES_DEL_FICHERO.join(", ")})`);
    if (typeof c?.reason !== "string" || c.reason.trim().length < 10) p.push(`${col}: falta el motivo (reason, al menos 10 caracteres)`);
  }
  return p;
}
