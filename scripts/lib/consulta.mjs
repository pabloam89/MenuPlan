/**
 * Qué deja pasar `npm run consulta`: una sola sentencia de lectura.
 *
 * No es la única barrera. scripts/consulta.mjs además:
 * - manda la consulta por el protocolo extendido de Postgres, que no admite
 *   varias sentencias (la que importa: el juez de seguridad del PR #223 coló
 *   «select '--'; commit; begin read write; delete …» por el texto);
 * - la corre en una transacción `read only` y la deshace al final;
 * - pone un tope de 15 s y de 200 filas.
 * Lo que `read only` no para (señales a otras conexiones, slots de
 * replicación, cambiar la sesión) se para aquí, por nombre.
 */

import { TABLAS } from "../../src/data/model.js";

const LECTURA = /^(select|with|show|explain|table|values)\b/i;

// Escribe, cambia o controla la transacción o la sesión.
const ESCRIBE = /\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|copy|call|do|commit|rollback|begin|start|savepoint|release|set|reset|discard|lock|listen|notify|prepare|execute|deallocate|vacuum|cluster|reindex|refresh|security|import|load)\b/i;

// Funciones con efectos que una transacción read only no impide, o que salen
// de la base: matar conexiones, slots de replicación, bloqueos, cambiar la
// sesión, ficheros, red y cron.
const PELIGROSAS = /\b(pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_promote|pg_create_\w*slot|pg_drop_replication_slot|pg_replication_slot_advance|pg_advisory\w*|pg_try_advisory\w*|set_config|pg_read_\w*|pg_ls_\w*|pg_stat_file|lo_\w+|dblink\w*|pg_sleep\w*|pg_notify|txid_current|pg_switch_wal|pg_backup_\w*|http\w*|query_to_xml\w*|cursor_to_xml\w*)\s*\(/i;

// Esquemas que salen de la base o programan trabajo: cualquier cosa suya.
const ESQUEMAS = /\b(net|cron|vault|pgsodium|supabase_functions)\s*\./i;

/** Quita textos entre comillas y luego comentarios, sin que uno engañe al otro. */
export function sinTexto(sql) {
  let s = String(sql);
  let out = "";
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "'") { // cadena: hasta la comilla de cierre ('' es una comilla dentro)
      let j = i + 1;
      while (j < s.length && !(s[j] === "'" && s[j + 1] !== "'")) j += s[j] === "'" ? 2 : 1;
      out += "''";
      i = j + 1;
    } else if (c === "$" && !/[\w$]/.test(s[i - 1] ?? "") && /^\$([a-z_]*)\$/i.test(s.slice(i))) { // texto entre dólares (no dentro de un nombre: `x$$`)
      const tag = s.slice(i).match(/^\$([a-z_]*)\$/i)[0];
      const fin = s.indexOf(tag, i + tag.length);
      out += "''";
      i = fin < 0 ? s.length : fin + tag.length;
    } else if (c === "-" && s[i + 1] === "-") { // comentario de línea
      const fin = s.indexOf("\n", i);
      out += " ";
      i = fin < 0 ? s.length : fin;
    } else if (c === "/" && s[i + 1] === "*") { // comentario de bloque
      const fin = s.indexOf("*/", i + 2);
      out += " ";
      i = fin < 0 ? s.length : fin + 2;
    } else if (c === '"') { // identificador entre comillas dobles: se queda, sin juzgar lo de dentro
      const fin = s.indexOf('"', i + 1);
      out += '"x"';
      i = fin < 0 ? s.length : fin + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** null si se puede lanzar; si no, el motivo en llano. */
export function motivoParaNoLeer(sql) {
  const limpio = sinTexto(sql).trim().replace(/;\s*$/, "");
  if (!limpio) return "La consulta está vacía.";
  // Las cadenas con escapes (`E'\''`) se leen distinto aquí y en Postgres:
  // fuera, sin excepción (juez de seguridad del PR #223).
  if (sql.includes("\\")) return "Sin barras invertidas: las cadenas con escapes no se pueden comprobar.";
  // Ni nombres con escapes Unicode (`U&"pg!005fsleep" UESCAPE '!'`), por lo mismo.
  if (/\bu&|\buescape\b/i.test(sql)) return "Sin U& ni UESCAPE: los nombres con escapes no se pueden comprobar.";
  if (limpio.includes(";")) return "Una sola sentencia por consulta.";
  if (!LECTURA.test(limpio)) return "Solo lectura: tiene que empezar por select, with, show, explain, table o values.";
  if (ESCRIBE.test(limpio)) return "Lleva una palabra que escribe o cambia algo; esto es solo para leer.";
  // Las funciones se buscan también en el SQL en crudo, sin comillas dobles
  // (`"pg_sleep"(0)`): mejor un falso positivo dentro de un texto que dejarla pasar.
  const crudo = String(sql).replaceAll('"', "");
  if ([limpio, crudo].some((t) => PELIGROSAS.test(t) || ESQUEMAS.test(t))) return "Llama a una función con efectos fuera de la consulta (conexiones, replicación, sesión, ficheros o red).";
  return null;
}

/**
 * Avisos (no negativas) de las copias retiradas (#292). Auditar una copia
 * retirada sigue siendo legítimo, así que la consulta se lanza igual; solo se
 * dice en llano que la tabla ya no es la fuente y cuál la sustituye.
 * Lee el registro `TABLAS` de src/data/model.js: lo que esté ahí como
 * `retirado` o `copia_retirada` y nombre tablas o vistas. Busca el nombre con
 * `\b` tras FROM, JOIN o INTO (con esquema opcional; un nombre entre comillas dobles no se ve), sobre el
 * SQL sin comentarios ni cadenas.
 */
export function avisosDeRetiradas(sql, fuentes = TABLAS) {
  const limpio = sinTexto(sql);
  const avisos = [];
  const vistos = new Set();
  for (const f of fuentes) {
    if (f.estado !== "retirado" && f.rol !== "copia_retirada") continue;
    const objetos = [...(f.tablas ?? []).map((n) => [n, "tabla"]), ...(f.vistas ?? []).map((n) => [n, "vista"])];
    for (const [nombre, clase] of objetos) {
      if (vistos.has(nombre)) continue;
      const re = new RegExp(String.raw`\b(?:from|join|into)\s+(?:\w+\s*\.\s*)?${nombre}\b`, "i");
      if (!re.test(limpio)) continue;
      vistos.add(nombre);
      const mig = String(f.nota ?? "").match(/borrad[ao]s? en la (\d{4})/i);
      const borrada = mig ? ` (borrada en la ${mig[1]})` : "";
      const sust = f.sustituido_por ? `La fuente que la sustituye es ${f.sustituido_por}` : "No tiene fuente que la sustituya";
      avisos.push(`La ${clase} ${nombre} es una copia retirada${borrada}. ${sust}. Lanzo la consulta igual: auditar es legítimo.`);
    }
  }
  return avisos;
}
