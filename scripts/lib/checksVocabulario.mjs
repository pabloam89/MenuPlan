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
 *     `constraint N` o con el nombre que le pondría Postgres (`T_col_check` si mira una sola
 *     columna, `T_check` si no);
 *   - `alter table T add column … check (…)`, `add constraint N check (…)`,
 *     `drop constraint [if exists] N` y `drop column [if exists] c`;
 *   - `drop table T` (se lleva sus CHECK).
 * Un constraint se identifica por tabla y nombre (en Postgres el nombre es único por tabla,
 * no en la base): `drop constraint x` en una tabla no toca el `x` de otra.
 *
 * Un CHECK es «de lista» si dice, de una sola columna (con o sin comillas), `c in ('a', …)`,
 * `c = any (array['a', …])` o `c <@ array['a', …]` (con o sin `::text` en cada literal y
 * `::text[]` en el array), con `c is null or` delante y `or c like '…'` detrás como mucho.
 * Uno con literales e `in`/`any`/`<@` que no tiene esa forma (`(status in (…)) = (closed_at
 * is not null)`, `not in`) sale en `noReconocidos`, y el test exige que esté en su lista
 * cerrada NO_ES_LISTA con su motivo: así una forma nueva no se escapa sin que nadie la mire.
 *
 * Qué es «vivo»: lo que dicen las migraciones que se le pasan. El test le quita las de «Sin
 * aplicar» de supabase/ESTADO.md (leerSinAplicar), así que una migración sin aplicar no
 * cuenta como CHECK vivo; si esa lista de ESTADO.md no dice la verdad, esto tampoco.
 *
 * Límites, a propósito: lo que va dentro de `$$ … $$` no se ve (ningún CHECK vive ahí hoy).
 * Un `rename` de tabla, columna o constraint LANZA un error: ninguna migración lo usa, y si
 * llega, el lector tiene que aprender a seguirlo antes de dar nada por bueno. Puro: no lee
 * ficheros; quien llama le pasa [{ fichero, sql }] ordenados.
 */
import { nombre, sentencias } from "../verificar-estado.mjs";

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QID = String.raw`(?:${ID}\.)?${ID}`;
const tablaDe = (q) => {
  const n = nombre(q);
  return n.esquema === "public" ? n.nombre : `${n.esquema}.${n.nombre}`;
};
const idDe = (x) => (x.startsWith('"') ? x.slice(1, -1) : x.toLowerCase());

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
  for (const m of trozo.matchAll(new RegExp(String.raw`(?:\bconstraint\s+(${ID})\s+)?\bcheck\s*\(`, "gi"))) {
    const cuerpo = hastaCierre(trozo, m.index + m[0].length - 1);
    if (cuerpo !== null) out.push({ nombre: m[1] ? idDe(m[1]) : null, cuerpo });
  }
  return out;
}

const LIT = String.raw`'(?:[^']|'')*'`;
// Un literal con su cast opcional: 'a' o 'a'::text (como lo escribe pg_get_constraintdef).
const LITC = String.raw`${LIT}(?:\s*::\s*(?:text|character\s+varying|varchar))?`;
const LISTA = String.raw`${LITC}(?:\s*,\s*${LITC})*`;
const CAST_ARRAY = String.raw`(?:\s*::\s*(?:text|character\s+varying|varchar)\s*\[\s*\])?`;
const COL = String.raw`("[^"]+"|\w+)`;
const FORMAS = [
  new RegExp(String.raw`^${COL}\s+in\s*\(\s*(${LISTA})\s*\)`, "i"),
  new RegExp(String.raw`^${COL}\s*=\s*any\s*\(\s*\(?\s*array\s*\[\s*(${LISTA})\s*\]${CAST_ARRAY}\s*\)?\s*\)`, "i"),
  new RegExp(String.raw`^${COL}\s*<@\s*\(?\s*array\s*\[\s*(${LISTA})\s*\]${CAST_ARRAY}\s*\)?`, "i"),
];
const literales = (s) => [...s.matchAll(new RegExp(LIT, "g"))].map((x) => x[0].slice(1, -1).replace(/''/g, "'"));
/** Lo que delata un CHECK que quiere ser de lista: literales y un in/any/<@. */
const PARECE_LISTA = (cuerpo) => /'/.test(cuerpo) && /\bin\s*\(|\bany\s*\(|<@/i.test(cuerpo);

/**
 * Si el cuerpo de un CHECK es de lista, { columna, valores, patrones } (patrones: los `like`);
 * si no, null.
 */
export function listaDelCheck(cuerpo) {
  let resto = cuerpo.replace(/\s+/g, " ").trim();
  const sinParentesis = () => { while (resto.startsWith("(") && hastaCierre(resto, 0) === resto.slice(1, -1)) resto = resto.slice(1, -1).trim(); };
  sinParentesis();
  const nulo = resto.match(new RegExp(String.raw`^\(?\s*${COL}\s+is\s+null\s*\)?\s+or\s+`, "i"));
  if (nulo) { resto = resto.slice(nulo[0].length); sinParentesis(); }
  let m = null;
  for (const f of FORMAS) if ((m = resto.match(f))) break;
  if (!m) {
    // «(c in (…)) or (c like …)»: el primer término entre paréntesis.
    const t = resto.startsWith("(") ? hastaCierre(resto, 0) : null;
    if (t === null) return null;
    for (const f of FORMAS) if ((m = t.trim().match(f)) && m[0].length === t.trim().length) break; else m = null;
    if (!m) return null;
    resto = resto.slice(t.length + 2);
  } else resto = resto.slice(m[0].length);
  const columna = idDe(m[1]);
  if (nulo && idDe(nulo[1]) !== columna) return null;
  const patrones = [];
  resto = resto.trim();
  const LIKE = new RegExp(String.raw`^or\s+\(?\s*${COL}\s+like\s+(${LIT})(?:\s*::\s*text)?\s*\)?\s*`, "i");
  let like;
  while ((like = resto.match(LIKE))) {
    if (idDe(like[1]) !== columna) return null;
    patrones.push(like[2].slice(1, -1));
    resto = resto.slice(like[0].length).trim();
  }
  if (resto) return null;
  return { columna, valores: literales(m[2]), patrones };
}

/** Recorre las migraciones: { vivos: Map «tabla|constraint» → …, raros: [...] }. */
function recorrer(migraciones) {
  const vivos = new Map();
  const raros = new Map(); // «tabla.constraint» → { tabla, constraint, fichero, cuerpo }, en toda la historia
  const tablas = new Set(); // las creadas y no borradas: un `create table if not exists` de una que ya está no hace nada
  const clave = (tabla, n) => `${tabla}|${n}`;
  const poner = (tabla, nombreC, cuerpo, fichero, columnaPorDefecto) => {
    const l = listaDelCheck(cuerpo);
    const col = l?.columna ?? columnaPorDefecto;
    const n = nombreC ?? (col ? `${tabla}_${col}_check` : `${tabla}_check`);
    if (l) vivos.set(clave(tabla, n), { tabla, columna: l.columna, constraint: n, valores: l.valores, patrones: l.patrones, fichero });
    else {
      vivos.delete(clave(tabla, n));
      if (PARECE_LISTA(cuerpo)) raros.set(`${tabla}.${n}`, { tabla, constraint: n, fichero, cuerpo: cuerpo.replace(/\s+/g, " ").trim() });
    }
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
          const col = /^(constraint|check|primary|unique|foreign|exclude|like)\b/i.test(item) ? null : idDe(item.match(new RegExp(`^${ID}`))?.[0] ?? "");
          for (const c of checksDe(item)) poner(tabla, c.nombre, c.cuerpo, fichero, col || null);
        }
        continue;
      }
      const borra = s.match(new RegExp(String.raw`^drop\s+table\s+(?:if\s+exists\s+)?(${QID}(?:\s*,\s*${QID})*)`, "i"));
      if (borra) {
        const borradas = new Set(borra[1].split(",").map((x) => tablaDe(x.trim())));
        for (const t of borradas) tablas.delete(t);
        for (const [k, v] of vivos) if (borradas.has(v.tabla)) vivos.delete(k);
        continue;
      }
      const alt = s.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QID})\s+`, "i"));
      if (!alt) continue;
      const tabla = tablaDe(alt[1]);
      for (const accion of partes(s.slice(alt[0].length))) {
        let m;
        if (/^rename\b/i.test(accion)) {
          throw new Error(`${fichero}: «alter table ${tabla} ${accion.slice(0, 60)}»: el lector de CHECK no sigue los rename (scripts/lib/checksVocabulario.mjs); enséñale antes de seguir`);
        } else if ((m = accion.match(new RegExp(String.raw`^drop\s+constraint\s+(?:if\s+exists\s+)?(${ID})`, "i")))) vivos.delete(clave(tabla, idDe(m[1])));
        else if ((m = accion.match(new RegExp(String.raw`^drop\s+(?:column\s+)?(?:if\s+exists\s+)?(${ID})`, "i")))) {
          for (const [k, v] of vivos) if (v.tabla === tabla && v.columna === idDe(m[1])) vivos.delete(k);
        } else if ((m = accion.match(new RegExp(String.raw`^add\s+column\s+(?:if\s+not\s+exists\s+)?(${ID})`, "i")))) {
          for (const c of checksDe(accion)) poner(tabla, c.nombre, c.cuerpo, fichero, idDe(m[1]));
        } else if (new RegExp(String.raw`^add\s+(constraint\s+${ID}\s+)?check\b`, "i").test(accion)) {
          for (const c of checksDe(accion)) poner(tabla, c.nombre, c.cuerpo, fichero, null);
        }
      }
    }
  }
  return { vivos, raros };
}

/**
 * Los CHECK de lista vivos tras aplicar las migraciones en orden.
 * Devuelve Map «tabla.columna» → [{ constraint, valores, patrones, fichero }].
 */
export function checksDeLista(migraciones) {
  const porColumna = new Map();
  for (const v of recorrer(migraciones).vivos.values()) {
    const k = `${v.tabla}.${v.columna}`;
    porColumna.set(k, [...(porColumna.get(k) ?? []), { constraint: v.constraint, valores: v.valores, patrones: v.patrones, fichero: v.fichero }]);
  }
  return new Map([...porColumna].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Los CHECK de toda la historia con literales e `in`/`any`/`<@` que el lector no reconoce como
 * de lista: Map «tabla.constraint» → { fichero, cuerpo }. El test los compara con NO_ES_LISTA.
 */
export function checksNoReconocidos(migraciones) {
  return new Map([...recorrer(migraciones).raros].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, { fichero: v.fichero, cuerpo: v.cuerpo }]));
}

/**
 * La paridad entre los CHECK de lista vivos y sus listas de JS.
 *   - `checks`: lo que da checksDeLista con las migraciones aplicadas;
 *   - `mapa`: { «tabla.columna»: { vivos, retirados = [], patrones = [] } }, la lista de cada
 *     columna (vivos: lo que el código ofrece; retirados: lo que ya no ofrece y la base tiene
 *     que seguir admitiendo, por las filas de familias guardadas con ello);
 *   - `sinLista`: { «tabla.columna»: motivo }, los CHECK de lista que aún no tienen su lista
 *     en src/lib/vocabularios.js (deuda a la vista);
 *   - `pendientes`: lo que da checksDeLista con TODAS las migraciones (también las sin
 *     aplicar), para decir en el mensaje si lo que falta ya está escrito y espera a aplicarse.
 *     Una columna que solo tiene CHECK en una migración sin aplicar se compara con ese.
 * Devuelve las frases de lo que no cuadra; vacío si todo cuadra.
 */
export function problemasDeParidad(checks, mapa, sinLista = {}, pendientes = checks) {
  const p = [];
  const cols = new Set([...checks.keys(), ...pendientes.keys()]);
  for (const col of cols) {
    const cs = checks.get(col) ?? pendientes.get(col);
    if (cs.length > 1) p.push(`${col}: ${cs.length} CHECK de lista vivos a la vez (${cs.map((c) => c.constraint).join(", ")}); deja uno`);
    if (!(col in mapa) && !(col in sinLista)) p.push(`${col}: CHECK de lista (${cs[0].constraint}, ${cs[0].fichero}) sin su lista de JS: añádela al mapa de columnas o a «sin lista» con su motivo`);
  }
  for (const col of Object.keys(sinLista)) {
    if (!cols.has(col)) p.push(`${col}: está en «sin lista» y ya no tiene CHECK de lista: quítalo de ahí`);
    if (col in mapa) p.push(`${col}: está a la vez en el mapa y en «sin lista»: quítalo de «sin lista»`);
  }
  for (const [col, { vivos, retirados = [], patrones = [] }] of Object.entries(mapa)) {
    const vivo = checks.get(col)?.[0];
    const escrito = pendientes.get(col)?.[0];
    const c = vivo ?? escrito;
    if (!c) { p.push(`${col}: tiene lista en JS y ninguna migración le pone un CHECK de lista`); continue; }
    const sinAplicar = !vivo ? ` [la ${c.fichero} está sin aplicar (supabase/ESTADO.md): ese CHECK aún no está en la base]` : "";
    const enSql = new Set(c.valores);
    const donde = `${col} (${c.constraint}, ${c.fichero})`;
    for (const v of vivos) {
      if (enSql.has(v)) continue;
      const loTrae = escrito && escrito !== c && escrito.valores.includes(v) ? ` La ${escrito.fichero} lo añade, pero está sin aplicar (supabase/ESTADO.md): el código no puede ofrecerlo hasta que se aplique (plan B).` : " Falta la migración que lo añada, y el código no puede ofrecerlo hasta que esté aplicada.";
      p.push(`${donde}: el código ofrece «${v}» y el CHECK vivo no lo admite.${loTrae}${sinAplicar}`);
    }
    for (const v of retirados) if (!enSql.has(v)) p.push(`${donde}: «${v}» está retirado y el CHECK ya no lo admite: las filas de familias guardadas con él dejarían de poder actualizarse; el CHECK lo tiene que seguir admitiendo${sinAplicar}`);
    for (const v of enSql) if (!vivos.includes(v) && !retirados.includes(v)) p.push(`${donde}: el CHECK admite «${v}», que el código ya no tiene ni está retirado: retíralo con su pasa_a en ops/vocabularios-vida.json o devuélvelo a la lista${sinAplicar}`);
    const pj = [...patrones].sort().join("|");
    const ps = [...c.patrones].sort().join("|");
    if (pj !== ps) p.push(`${donde}: los patrones like del CHECK (${ps || "ninguno"}) no son los del mapa (${pj || "ninguno"})${sinAplicar}`);
  }
  return p;
}
