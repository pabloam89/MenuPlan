/**
 * checksVocabulario.mjs — los CHECK de lista que siguen vivos en la base, leídos de las
 * migraciones (#497, fondo #479).
 *
 * Un vocabulario del producto vive dos veces: la constante de src/lib/vocabularios.js (lo
 * que el código ofrece y escribe) y el CHECK de la columna (lo que la base admite). Para
 * que no puedan divergir, src/lib/vocabularios.test.js compara cada columna con su lista, y
 * para eso hace falta saber cuál es el CHECK VIGENTE de cada columna, no solo el que se
 * llama `_vocabulario`: los de `channel` y `lang` nacieron en línea (`channel text check
 * (channel in (…))`) y Postgres los llama `<tabla>_<col>_check`.
 *
 * Qué lee, sentencia a sentencia y en orden de migración:
 *   - `create table T (…)`: cada `check (…)` de una columna o de la tabla, con su
 *     `constraint N` o con el nombre que le pondría Postgres (`T_col_check`);
 *   - `alter table T add column … check (…)`, `add constraint N check (…)`,
 *     `drop constraint [if exists] N` y `drop column [if exists] c`;
 *   - `drop table T` (se lleva sus CHECK).
 * Un CHECK es «de lista» si dice, de una sola columna, `c in ('a', …)` o
 * `c <@ array['a', …]::text[]`, con `c is null or` delante y `or c like '…'` detrás como
 * mucho. Uno que mezcla otra cosa (`(status in (…)) = (closed_at is not null)`) no lo es.
 *
 * Límites, a propósito: lo que va dentro de `$$ … $$` no se ve (ningún CHECK vive ahí hoy),
 * ni `rename column`/`rename constraint` (ninguna migración los usa). Puro: no lee ficheros;
 * quien llama le pasa [{ fichero, sql }] ordenados.
 */
import { nombre, sentencias } from "../verificar-estado.mjs";

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QID = String.raw`(?:${ID}\.)?${ID}`;
const tablaDe = (q) => {
  const n = nombre(q);
  return n.esquema === "public" ? n.nombre : `${n.esquema}.${n.nombre}`;
};

/** Parte por comas de nivel 0 (fuera de paréntesis, corchetes y comillas). */
function partes(texto) {
  const out = [];
  let nivel = 0, actual = "", i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "'") {
      let j = i + 1;
      while (j < texto.length && !(texto[j] === "'" && texto[j + 1] !== "'")) j += texto[j] === "'" ? 2 : 1;
      actual += texto.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "(" || c === "[") nivel++;
    if (c === ")" || c === "]") nivel--;
    if (c === "," && nivel === 0) { out.push(actual.trim()); actual = ""; } else actual += c;
    i++;
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

/** Desde el `(` en `desde`, el texto hasta su `)` (sin los dos). */
function hastaCierre(texto, desde) {
  let nivel = 0;
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === "'") { i++; while (i < texto.length && !(texto[i] === "'" && texto[i + 1] !== "'")) i += texto[i] === "'" ? 2 : 1; continue; }
    if (texto[i] === "(") nivel++;
    if (texto[i] === ")" && --nivel === 0) return texto.slice(desde + 1, i);
  }
  return null;
}

/** Los `[constraint N] check (…)` de un trozo: [{ nombre|null, cuerpo }]. */
function checksDe(trozo) {
  const out = [];
  for (const m of trozo.matchAll(/(?:\bconstraint\s+(\w+)\s+)?\bcheck\s*\(/gi)) {
    const cuerpo = hastaCierre(trozo, m.index + m[0].length - 1);
    if (cuerpo !== null) out.push({ nombre: m[1]?.toLowerCase() ?? null, cuerpo });
  }
  return out;
}

const LIT = String.raw`'(?:[^']|'')*'`;
const LISTA_IN = new RegExp(String.raw`^(\w+)\s+in\s*\(\s*(${LIT}(?:\s*,\s*${LIT})*)\s*\)`, "i");
const LISTA_ARRAY = new RegExp(String.raw`^(\w+)\s*<@\s*array\s*\[\s*(${LIT}(?:\s*,\s*${LIT})*)\s*\]\s*::\s*text\s*\[\s*\]`, "i");
const literales = (s) => [...s.matchAll(new RegExp(LIT, "g"))].map((x) => x[0].slice(1, -1).replace(/''/g, "'"));

/**
 * Si el cuerpo de un CHECK es de lista, { columna, valores, patrones } (patrones: los `like`);
 * si no, null.
 */
export function listaDelCheck(cuerpo) {
  let resto = cuerpo.replace(/\s+/g, " ").trim();
  while (resto.startsWith("(") && hastaCierre(resto, 0) === resto.slice(1, -1)) resto = resto.slice(1, -1).trim();
  const nulo = resto.match(/^(\w+)\s+is\s+null\s+or\s+/i);
  if (nulo) resto = resto.slice(nulo[0].length);
  const m = resto.match(LISTA_IN) ?? resto.match(LISTA_ARRAY);
  if (!m) return null;
  const columna = m[1].toLowerCase();
  if (nulo && nulo[1].toLowerCase() !== columna) return null;
  resto = resto.slice(m[0].length).trim();
  const patrones = [];
  for (const like of resto.matchAll(new RegExp(String.raw`or\s+(\w+)\s+like\s+(${LIT})\s*`, "gi"))) {
    if (like[1].toLowerCase() !== columna) return null;
    patrones.push(like[2].slice(1, -1));
    resto = resto.replace(like[0], "");
  }
  if (resto.trim()) return null;
  return { columna, valores: literales(m[2]), patrones };
}

/**
 * Los CHECK de lista vivos tras aplicar las migraciones en orden.
 * Devuelve Map «tabla.columna» → [{ constraint, valores, patrones, fichero }].
 */
export function checksDeLista(migraciones) {
  const vivos = new Map(); // nombre del constraint → { tabla, columna, … }
  const tablas = new Set(); // las creadas y no borradas: un `create table if not exists` de una que ya está no hace nada
  const poner = (tabla, nombreC, cuerpo, fichero, columnaPorDefecto) => {
    const l = listaDelCheck(cuerpo);
    const col = l?.columna ?? columnaPorDefecto;
    const n = nombreC ?? (col ? `${tabla}_${col}_check` : null);
    if (!n) return;
    if (l) vivos.set(n, { tabla, columna: l.columna, constraint: n, valores: l.valores, patrones: l.patrones, fichero });
    else vivos.delete(n);
  };
  for (const { fichero, sql } of migraciones) {
    for (const s of sentencias(sql)) {
      const crea = s.match(new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+(if\s+not\s+exists\s+)?(${QID})\s*\(`, "i"));
      if (crea) {
        const tabla = tablaDe(crea[2]);
        if (crea[1] && tablas.has(tabla)) continue;
        tablas.add(tabla);
        const cuerpo = hastaCierre(s, crea[0].length - 1) ?? "";
        for (const item of partes(cuerpo)) {
          const col = /^(constraint|check|primary|unique|foreign|exclude)\b/i.test(item) ? null : item.match(/^(\w+)/)?.[1]?.toLowerCase();
          for (const c of checksDe(item)) poner(tabla, c.nombre, c.cuerpo, fichero, col);
        }
        continue;
      }
      const borra = s.match(new RegExp(String.raw`^drop\s+table\s+(?:if\s+exists\s+)?(${QID}(?:\s*,\s*${QID})*)`, "i"));
      if (borra) {
        const borradas = new Set(borra[1].split(",").map((x) => tablaDe(x.trim())));
        for (const t of borradas) tablas.delete(t);
        for (const [n, v] of vivos) if (borradas.has(v.tabla)) vivos.delete(n);
        continue;
      }
      const alt = s.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QID})\s+`, "i"));
      if (!alt) continue;
      const tabla = tablaDe(alt[1]);
      for (const accion of partes(s.slice(alt[0].length))) {
        let m;
        if ((m = accion.match(/^drop\s+constraint\s+(?:if\s+exists\s+)?(\w+)/i))) vivos.delete(m[1].toLowerCase());
        else if ((m = accion.match(/^drop\s+(?:column\s+)?(?:if\s+exists\s+)?(\w+)/i))) {
          for (const [n, v] of vivos) if (v.tabla === tabla && v.columna === m[1].toLowerCase()) vivos.delete(n);
        } else if ((m = accion.match(/^add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/i))) {
          for (const c of checksDe(accion)) poner(tabla, c.nombre, c.cuerpo, fichero, m[1].toLowerCase());
        } else if (/^add\s+(constraint\s+\w+\s+)?check\b/i.test(accion)) {
          for (const c of checksDe(accion)) poner(tabla, c.nombre, c.cuerpo, fichero, null);
        }
      }
    }
  }
  const porColumna = new Map();
  for (const v of vivos.values()) {
    const k = `${v.tabla}.${v.columna}`;
    porColumna.set(k, [...(porColumna.get(k) ?? []), { constraint: v.constraint, valores: v.valores, patrones: v.patrones, fichero: v.fichero }]);
  }
  return new Map([...porColumna].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * La paridad entre los CHECK de lista vivos y sus listas de JS.
 *   - `checks`: lo que da checksDeLista;
 *   - `mapa`: { «tabla.columna»: { vivos, retirados = [], patrones = [] } }, la lista de cada
 *     columna (vivos: lo que el código ofrece; retirados: lo que ya no ofrece y la base tiene
 *     que seguir admitiendo, por las filas de familias guardadas con ello);
 *   - `sinLista`: { «tabla.columna»: motivo }, los CHECK de lista que aún no tienen su lista
 *     en src/lib/vocabularios.js (deuda a la vista).
 * Devuelve las frases de lo que no cuadra; vacío si todo cuadra.
 */
export function problemasDeParidad(checks, mapa, sinLista = {}) {
  const p = [];
  for (const [col, cs] of checks) {
    if (cs.length > 1) p.push(`${col}: ${cs.length} CHECK de lista vivos a la vez (${cs.map((c) => c.constraint).join(", ")}); deja uno`);
    if (!(col in mapa) && !(col in sinLista)) p.push(`${col}: CHECK de lista (${cs[0].constraint}, ${cs[0].fichero}) sin su lista de JS: añádela al mapa de columnas o a «sin lista» con su motivo`);
  }
  for (const col of Object.keys(sinLista)) {
    if (!checks.has(col)) p.push(`${col}: está en «sin lista» y ya no tiene CHECK de lista: quítalo de ahí`);
    if (col in mapa) p.push(`${col}: está a la vez en el mapa y en «sin lista»: quítalo de «sin lista»`);
  }
  for (const [col, { vivos, retirados = [], patrones = [] }] of Object.entries(mapa)) {
    const c = checks.get(col)?.[0];
    if (!c) { p.push(`${col}: tiene lista en JS y ninguna migración le pone un CHECK de lista vivo`); continue; }
    const enSql = new Set(c.valores);
    const donde = `${col} (${c.constraint}, ${c.fichero})`;
    for (const v of vivos) if (!enSql.has(v)) p.push(`${donde}: el código ofrece «${v}» y el CHECK no lo admite: falta la migración que lo añada (y el código no puede escribirlo hasta que esté aplicada)`);
    for (const v of retirados) if (!enSql.has(v)) p.push(`${donde}: «${v}» está retirado y el CHECK ya no lo admite: las filas de familias guardadas con él dejarían de poder actualizarse; el CHECK lo tiene que seguir admitiendo`);
    for (const v of enSql) if (!vivos.includes(v) && !retirados.includes(v)) p.push(`${donde}: el CHECK admite «${v}», que el código ya no tiene ni está retirado: retíralo con su pasa_a en ops/vocabularios-vida.json o devuélvelo a la lista`);
    const pj = [...patrones].sort().join("|");
    const ps = [...c.patrones].sort().join("|");
    if (pj !== ps) p.push(`${donde}: los patrones like del CHECK (${ps || "ninguno"}) no son los del mapa (${pj || "ninguno"})`);
  }
  return p;
}
