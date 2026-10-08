/**
 * Qué deja pasar `npm run consulta`: una sola sentencia de lectura.
 *
 * La consulta corre además en una transacción `read only` (Postgres rechaza
 * cualquier escritura aunque se colara), con un tope de tiempo y de filas. Esto
 * es la primera barrera, para que el error sea claro y no un rechazo de la base.
 */

const LECTURA = /^(select|with|show|explain|table|values)\b/i;

/** Quita comentarios y textos entre comillas, para no juzgar lo que es texto. */
function sinTexto(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "''");
}

/** null si se puede lanzar; si no, el motivo en llano. */
export function motivoParaNoLeer(sql) {
  const limpio = sinTexto(sql).trim().replace(/;\s*$/, "");
  if (!limpio) return "La consulta está vacía.";
  if (limpio.includes(";")) return "Una sola sentencia por consulta.";
  if (!LECTURA.test(limpio)) return "Solo lectura: tiene que empezar por select, with, show, explain, table o values.";
  // Un with puede llevar un insert/update/delete dentro (data-modifying CTE).
  if (/\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|copy|call|do)\b/i.test(limpio)) {
    return "Lleva una palabra que escribe o cambia algo; esto es solo para leer.";
  }
  return null;
}
