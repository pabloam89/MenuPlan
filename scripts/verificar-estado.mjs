/**
 * verificar-estado.mjs — ¿qué migraciones están de verdad en la base?
 *
 * ── Para qué ───────────────────────────────────────────────────────────────
 * El registro de Supabase (`supabase_migrations.schema_migrations`) no sirve:
 * casi todo se aplicó a mano. El registro que vale es `supabase/ESTADO.md`, y
 * este script comprueba que dice la verdad. De cada migración saca sus objetos
 * testigo (tablas, columnas, funciones con su cuerpo, constraints con su
 * definición, políticas, índices, triggers, tipos, vistas, crons, roles), los busca
 * en el catálogo de la base y compara con la lista «Sin aplicar» de ESTADO.md.
 *
 * ── Solo lee, y no puede escribir ──────────────────────────────────────────
 * La base es la de PRODUCCIÓN. Todo va en una transacción `read only` que
 * acaba en ROLLBACK, y la sesión entera se declara de solo lectura antes de la
 * primera consulta: aunque alguien añadiera aquí un UPDATE, Postgres lo
 * rechazaría. Solo consulta el catálogo (pg_catalog, information_schema,
 * cron.job), nunca filas de usuarios. Por eso puede ir en la lista de
 * permitidos sin preguntar.
 *
 *   node scripts/verificar-estado.mjs                 # todas
 *   node scripts/verificar-estado.mjs --desde 0065    # de la 0065 en adelante
 *   node scripts/verificar-estado.mjs --solo 0079     # una
 *   node scripts/verificar-estado.mjs --detalle       # cada testigo, no solo el resumen
 *   node scripts/verificar-estado.mjs --json
 *
 * Lee SUPABASE_DB_URL del entorno o, si no está, de `.env.local`.
 *
 * ── Lo que NO ve ───────────────────────────────────────────────────────────
 * Grants, comments, datos (inserts/updates) ni cambios dentro de una columna
 * que ya existía (tipo, default). Una migración que solo hace eso sale «sin
 * testigo» y hay que mirarla a mano.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leerEnv } from "./lib/env.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(RAIZ, "supabase", "migrations");
// Lo que no cabe en una transacción (índices concurrentes) va a manual/ con el
// número de su migración y una letra (0080b): también cuenta, en su orden.
const DIR_MANUAL = join(RAIZ, "supabase", "manual");

// ── Leer el SQL ────────────────────────────────────────────────────────────

/** Quita comentarios `--` y `/* *\/` fuera de cadenas y cuerpos $$. */
export function sinComentarios(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const resto = sql.slice(i);
    const dolar = resto.match(/^\$[A-Za-z_]*\$/);
    if (dolar) {
      const fin = sql.indexOf(dolar[0], i + dolar[0].length);
      const hasta = fin === -1 ? sql.length : fin + dolar[0].length;
      out += sql.slice(i, hasta);
      i = hasta;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (resto.startsWith("--")) {
      const fin = sql.indexOf("\n", i);
      i = fin === -1 ? sql.length : fin;
    } else if (resto.startsWith("/*")) {
      const fin = sql.indexOf("*/", i + 2);
      i = fin === -1 ? sql.length : fin + 2;
    } else {
      out += sql[i++];
    }
  }
  return out;
}

/** Parte en sentencias por `;`, respetando cadenas y cuerpos $$. */
export function sentencias(sql) {
  const limpio = sinComentarios(sql);
  const out = [];
  let actual = "";
  let i = 0;
  while (i < limpio.length) {
    const dolar = limpio.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (dolar) {
      const fin = limpio.indexOf(dolar[0], i + dolar[0].length);
      const hasta = fin === -1 ? limpio.length : fin + dolar[0].length;
      actual += limpio.slice(i, hasta);
      i = hasta;
    } else if (limpio[i] === "'") {
      let j = i + 1;
      while (j < limpio.length && !(limpio[j] === "'" && limpio[j + 1] !== "'")) j += limpio[j] === "'" ? 2 : 1;
      actual += limpio.slice(i, j + 1);
      i = j + 1;
    } else if (limpio[i] === ";") {
      if (actual.trim()) out.push(actual.trim());
      actual = "";
      i++;
    } else {
      actual += limpio[i++];
    }
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QID = String.raw`(?:${ID}\.)?${ID}`;

/** "public"."Tabla" | public.tabla | tabla → { esquema, nombre } en la forma del catálogo. */
export function nombre(q) {
  const partes = q.match(new RegExp(ID, "g")).map((p) => (p.startsWith('"') ? p.slice(1, -1) : p.toLowerCase()));
  return partes.length === 2 ? { esquema: partes[0], nombre: partes[1] } : { esquema: "public", nombre: partes[0] };
}
const clave = (n) => `${n.esquema}.${n.nombre}`;
const normaliza = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Los objetos que crea o cambia una migración, y los que quita.
 * Cada testigo: { tipo, id, ...lo que haga falta para buscarlo }.
 */
export function testigos(sql) {
  const crea = [];
  const quita = [];
  for (const s of sentencias(sql)) {
    let m;
    if ((m = s.match(new RegExp(String.raw`^create\s+schema\s+(?:if\s+not\s+exists\s+)?(${ID})`, "i")))) {
      crea.push({ tipo: "esquema", id: nombre(m[1]).nombre });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(${QID})`, "i")))) {
      crea.push({ tipo: "tabla", id: clave(nombre(m[1])) });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(${QID})`, "i")))) {
      crea.push({ tipo: "vista", id: clave(nombre(m[1])) });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?function\s+(${QID})\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\bas\s+(\$[A-Za-z_]*\$)([\s\S]*?)\3`, "i")))) {
      crea.push({ tipo: "función", id: clave(nombre(m[1])), cuerpo: normaliza(m[4]) });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(${ID})\s+on\s+(?:only\s+)?(${QID})`, "i")))) {
      crea.push({ tipo: "índice", id: `${nombre(m[2]).esquema}.${nombre(m[1]).nombre}`, de: clave(nombre(m[2])) });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+policy\s+(${ID})\s+on\s+(${QID})`, "i")))) {
      crea.push({ tipo: "política", id: `${clave(nombre(m[2]))}:${nombre(m[1]).nombre}` });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(${ID})[\s\S]*?\bon\s+(${QID})`, "i")))) {
      crea.push({ tipo: "trigger", id: `${clave(nombre(m[2]))}:${nombre(m[1]).nombre}` });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+type\s+(${QID})\s+as\s+enum\s*\(([\s\S]*)\)`, "i")))) {
      const t = clave(nombre(m[1]));
      crea.push({ tipo: "tipo", id: t });
      for (const v of m[2].matchAll(/'((?:[^']|'')*)'/g)) crea.push({ tipo: "valor", id: `${t}:${v[1]}` });
    } else if ((m = s.match(new RegExp(String.raw`^create\s+type\s+(${QID})`, "i")))) {
      crea.push({ tipo: "tipo", id: clave(nombre(m[1])) });
    } else if ((m = s.match(new RegExp(String.raw`^alter\s+type\s+(${QID})\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'((?:[^']|'')*)'`, "i")))) {
      crea.push({ tipo: "valor", id: `${clave(nombre(m[1]))}:${m[2]}` });
    } else if ((m = s.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QID})\s+([\s\S]*)$`, "i")))) {
      const t = clave(nombre(m[1]));
      // Renombrar o cambiar de esquema: la tabla de antes deja de existir, como en un drop.
      const rn = m[2].match(new RegExp(String.raw`^rename\s+to\s+(${ID})`, "i"));
      const sc = m[2].match(new RegExp(String.raw`^set\s+schema\s+(${ID})`, "i"));
      if (rn) { quita.push({ tipo: "tabla", id: t }); crea.push({ tipo: "tabla", id: clave({ esquema: nombre(m[1]).esquema, nombre: nombre(rn[1]).nombre }) }); }
      if (sc) { quita.push({ tipo: "tabla", id: t }); crea.push({ tipo: "tabla", id: clave({ esquema: nombre(sc[1]).nombre, nombre: nombre(m[1]).nombre }) }); }
      // Una alter table puede llevar varias acciones separadas por comas.
      for (const a of m[2].matchAll(new RegExp(String.raw`add\s+column\s+(?:if\s+not\s+exists\s+)?(${ID})`, "gi"))) {
        crea.push({ tipo: "columna", id: `${t}.${nombre(a[1]).nombre}` });
      }
      for (const a of m[2].matchAll(new RegExp(String.raw`add\s+constraint\s+(${ID})\s+([\s\S]*?)(?=,\s*(?:add|drop|alter)\s|$)`, "gi"))) {
        const literales = [...a[2].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]);
        crea.push({ tipo: "constraint", id: `${t}:${nombre(a[1]).nombre}`, literales });
      }
      for (const a of m[2].matchAll(new RegExp(String.raw`drop\s+column\s+(?:if\s+exists\s+)?(${ID})`, "gi"))) {
        quita.push({ tipo: "columna", id: `${t}.${nombre(a[1]).nombre}` });
      }
      for (const a of m[2].matchAll(new RegExp(String.raw`drop\s+constraint\s+(?:if\s+exists\s+)?(${ID})`, "gi"))) {
        quita.push({ tipo: "constraint", id: `${t}:${nombre(a[1]).nombre}` });
      }
    } else if ((m = s.match(new RegExp(String.raw`^drop\s+(table|view|materialized\s+view|function|type|index)\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(${QID}(?:\s*,\s*${QID})*)`, "i")))) {
      const tipo = { table: "tabla", view: "vista", function: "función", type: "tipo", index: "índice" }[m[1].toLowerCase().split(/\s+/).pop()];
      // `drop table a, b` borra las dos: un testigo por nombre.
      for (const q of m[2].match(new RegExp(QID, "g"))) quita.push({ tipo, id: clave(nombre(q)) });
    } else if ((m = s.match(new RegExp(String.raw`^drop\s+policy\s+(?:if\s+exists\s+)?(${ID})\s+on\s+(${QID})`, "i")))) {
      quita.push({ tipo: "política", id: `${clave(nombre(m[2]))}:${nombre(m[1]).nombre}` });
    } else if ((m = s.match(new RegExp(String.raw`^drop\s+trigger\s+(?:if\s+exists\s+)?(${ID})\s+on\s+(${QID})`, "i")))) {
      quita.push({ tipo: "trigger", id: `${clave(nombre(m[2]))}:${nombre(m[1]).nombre}` });
    } else if ((m = s.match(/^alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public\s+revoke\s+[\w\s,]*?\bon\s+(tables|sequences|functions)\s+from\s+([\w\s,]+)$/i))) {
      // Privilegio por defecto quitado: «está» si la plantilla de postgres en public ya no lo lleva.
      for (const r of m[2].split(",")) quita.push({ tipo: "permiso_defecto", id: `${m[1].toLowerCase()}:${r.trim().toLowerCase()}` });
    }
    for (const c of s.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/gi)) crea.push({ tipo: "cron", id: c[1] });
    for (const c of s.matchAll(/cron\.unschedule\s*\(\s*'([^']+)'/gi)) quita.push({ tipo: "cron", id: c[1] });
    // Roles: también dentro de un `do $$ … $$` (así se crean, para que sea idempotente).
    for (const c of s.matchAll(new RegExp(String.raw`\bcreate\s+role\s+(${ID})`, "gi"))) crea.push({ tipo: "rol", id: nombre(c[1]).nombre });
    for (const c of s.matchAll(new RegExp(String.raw`\bdrop\s+role\s+(?:if\s+exists\s+)?(${ID})`, "gi"))) quita.push({ tipo: "rol", id: nombre(c[1]).nombre });
  }
  // Lo de pg_temp muere con la sesión que aplica la migración: nunca está.
  const duradero = (t) => !/^pg_temp(?:_\d+)?\./i.test(t.id);
  return { crea: crea.filter(duradero), quita: quita.filter(duradero) };
}

/**
 * Lo que le pasa a las tablas y vistas, sentencia a sentencia y EN ORDEN:
 * [{ accion: "crea"|"borra", tipo: "tabla"|"vista", esquema, nombre }].
 * El orden importa: `drop table if exists x; create table x (…)` deja la tabla
 * viva y `create table x (…); drop table x` no. Cuenta `create table`,
 * `drop table|view` (con lista), `alter table … rename to` y
 * `alter table … set schema` (la de antes borra y la de después crea).
 * Límite: lo que va dentro de un `do $$ … $$` o de una función no se ve, y
 * `alter view … rename` tampoco.
 */
export function eventosTabla(sql) {
  const out = [];
  for (const s of sentencias(sql)) {
    let m;
    if ((m = s.match(new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(${QID})`, "i")))) {
      out.push({ accion: "crea", tipo: "tabla", ...nombre(m[1]) });
    } else if ((m = s.match(new RegExp(String.raw`^drop\s+(table|(?:materialized\s+)?view)\s+(?:if\s+exists\s+)?(${QID}(?:\s*,\s*${QID})*)`, "i")))) {
      const tipo = m[1].toLowerCase() === "table" ? "tabla" : "vista";
      for (const q of m[2].match(new RegExp(QID, "g"))) out.push({ accion: "borra", tipo, ...nombre(q) });
    } else if ((m = s.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QID})\s+(rename\s+to|set\s+schema)\s+(${ID})`, "i")))) {
      const de = nombre(m[1]);
      out.push({ accion: "borra", tipo: "tabla", ...de });
      const a = nombre(m[3]).nombre;
      out.push({ accion: "crea", tipo: "tabla", ...(/^rename/i.test(m[2]) ? { esquema: de.esquema, nombre: a } : { esquema: a, nombre: de.nombre }) });
    }
  }
  return out;
}

// ── Decidir con el catálogo ────────────────────────────────────────────────

const k = (t) => `${t.tipo}|${t.id}`;
export const SOBRECARGA = "\u0000";

/**
 * Cruza los testigos de todas las migraciones con el catálogo.
 * Un testigo que una migración POSTERIOR quita o redefine no cuenta (sale
 * como «después»): la base ya no tiene por qué tenerlo así.
 * Y si una migración POSTERIOR borra una tabla o vista, también cuenta como
 * quitado todo lo que colgaba de ella (columnas, constraints, índices,
 * políticas, triggers) en las migraciones anteriores: el `drop table` se lo
 * lleva por delante aunque la migración no lo nombre.
 */
export function veredictos(migraciones, catalogo, sinAplicar) {
  // Una migración que ESTADO.md da por sin aplicar no cuenta como «posterior».
  const activa = (m) => !sinAplicar.has(m.nombre);
  const esObjeto = (t) => t.tipo === "tabla" || t.tipo === "vista";
  const ausente = (t) => catalogo[t.tipo]?.get(t.id) === undefined;
  // ¿Lo crea una migración activa desde la j (incluida) en adelante?
  const creadoDesde = (t, j) => migraciones.findIndex((m, l) => l >= j && activa(m) && m.crea.some((c) => c.tipo === t.tipo && c.id === t.id));
  // Un drop de tabla o vista solo cuenta cuando está APLICADO (falta en la base) y nadie la recrea.
  const dropAplicado = (t, j) => esObjeto(t) && ausente(t) && creadoDesde(t, j) === -1;

  const ultimaQueToca = new Map(); // testigo → índice de la última migración activa que lo crea o lo quita
  const borradaEn = new Map(); // tabla o vista → índices de las migraciones que la borran (aplicadas)
  migraciones.forEach((m, i) => {
    if (!activa(m)) return;
    for (const t of m.crea) ultimaQueToca.set(k(t), i);
    for (const t of m.quita) {
      if (esObjeto(t)) {
        if (!dropAplicado(t, i)) continue;
        borradaEn.set(t.id, [...(borradaEn.get(t.id) ?? []), i]);
      }
      ultimaQueToca.set(k(t), i);
    }
  });
  const borraLaTabla = (t, i) => {
    const tabla = t.tipo === "columna" ? t.id.slice(0, t.id.lastIndexOf("."))
      : ["constraint", "política", "trigger"].includes(t.tipo) ? t.id.slice(0, t.id.indexOf(":"))
      : t.tipo === "índice" ? t.de : null;
    return tabla ? (borradaEn.get(tabla) ?? []).find((j) => j > i) : undefined;
  };

  return migraciones.map((m, i) => {
    const filas = m.crea.map((t) => {
      const ultima = Math.max(ultimaQueToca.get(k(t)) ?? -1, borraLaTabla(t, i) ?? -1);
      if (ultima > i) return { ...t, resultado: "después", por: migraciones[ultima].nombre };
      const hay = catalogo[t.tipo]?.get(t.id);
      if (hay === undefined) return { ...t, resultado: "falta" };
      // Una función puede tener varias versiones (sobrecargas): vale si alguna coincide.
      if (t.tipo === "función" && t.cuerpo && !hay.split(SOBRECARGA).some((b) => normaliza(b) === t.cuerpo)) {
        return { ...t, resultado: "distinto" };
      }
      if (t.tipo === "constraint" && t.literales?.some((l) => !hay.includes(`'${l}'`))) return { ...t, resultado: "distinto" };
      return { ...t, resultado: "está" };
    });
    // Testigo NEGATIVO: el drop de una tabla o vista «está» si el objeto falta de la base.
    // Si la misma migración lo recrea no se mide; si una posterior lo recrea, sale «después».
    // Igual con un privilegio por defecto quitado: «está» si la plantilla ya no lo lleva.
    for (const t of m.quita.filter((x) => esObjeto(x) || x.tipo === "permiso_defecto")) {
      const nueva = creadoDesde(t, i);
      if (nueva === i) continue;
      if (nueva > i) filas.push({ ...t, negativo: true, resultado: "después", por: migraciones[nueva].nombre });
      else filas.push({ ...t, negativo: true, resultado: ausente(t) ? "está" : "falta" });
    }
    const vivos = filas.filter((f) => f.resultado !== "después");
    const esta = vivos.filter((f) => f.resultado === "está").length;
    let estado;
    if (!filas.length) estado = "sin testigo";
    else if (!vivos.length) estado = "sobrescrita";
    else if (esta === vivos.length) estado = "aplicada";
    else if (esta === 0 && !vivos.some((f) => f.resultado === "distinto")) estado = "sin aplicar";
    else estado = "parcial";

    const estadoMd = sinAplicar.has(m.nombre) ? "sin aplicar" : "aplicada";
    const choca =
      (estado === "aplicada" && estadoMd === "sin aplicar") ||
      ((estado === "sin aplicar" || estado === "parcial") && estadoMd === "aplicada");
    return { nombre: m.nombre, estado, estadoMd, choca, filas };
  });
}

// ── La base ────────────────────────────────────────────────────────────────

const CONSULTAS = {
  esquema: "select nspname as id, '' as v from pg_namespace",
  tabla: "select n.nspname||'.'||c.relname as id, '' as v from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p')",
  vista: "select n.nspname||'.'||c.relname as id, '' as v from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m')",
  índice: "select n.nspname||'.'||c.relname as id, '' as v from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('i','I')",
  columna: "select table_schema||'.'||table_name||'.'||column_name as id, '' as v from information_schema.columns",
  función: "select n.nspname||'.'||p.proname as id, p.prosrc as v from pg_proc p join pg_namespace n on n.oid=p.pronamespace",
  constraint: "select n.nspname||'.'||t.relname||':'||c.conname as id, pg_get_constraintdef(c.oid) as v from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace",
  política: "select schemaname||'.'||tablename||':'||policyname as id, '' as v from pg_policies",
  trigger: "select n.nspname||'.'||t.relname||':'||g.tgname as id, '' as v from pg_trigger g join pg_class t on t.oid=g.tgrelid join pg_namespace n on n.oid=t.relnamespace where not g.tgisinternal",
  tipo: "select n.nspname||'.'||t.typname as id, '' as v from pg_type t join pg_namespace n on n.oid=t.typnamespace",
  valor: "select n.nspname||'.'||t.typname||':'||e.enumlabel as id, '' as v from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace",
  rol: "select rolname as id, '' as v from pg_roles",
  // Qué roles figuran en la plantilla de privilegios por defecto de postgres en public ("tables:anon").
  permiso_defecto: "select (case a.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' else a.defaclobjtype::text end)||':'||coalesce(r.rolname, 'public') as id, '' as v from pg_default_acl a cross join lateral aclexplode(a.defaclacl) x left join pg_roles r on r.oid = x.grantee where a.defaclrole = 'postgres'::regrole and a.defaclnamespace = 'public'::regnamespace",
};

async function leerCatalogo(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const catalogo = {};
  try {
    await client.query("set session characteristics as transaction read only");
    await client.query("begin read only");
    await client.query("set local statement_timeout = '20s'");
    for (const [tipo, q] of Object.entries(CONSULTAS)) {
      const { rows } = await client.query(q);
      catalogo[tipo] = new Map();
      for (const r of rows) {
        const previo = catalogo[tipo].get(r.id);
        catalogo[tipo].set(r.id, previo === undefined ? (r.v ?? "") : previo + SOBRECARGA + (r.v ?? ""));
      }
    }
    const { rows: hayCron } = await client.query("select 1 from pg_namespace where nspname = 'cron'");
    catalogo.cron = new Map();
    if (hayCron.length) {
      const { rows } = await client.query("select jobname as id from cron.job");
      catalogo.cron = new Map(rows.map((r) => [r.id, ""]));
    }
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
  return catalogo;
}

function urlDeLaBase() {
  return leerEnv("SUPABASE_DB_URL") ?? null;
}

export function leerSinAplicar(estadoMd) {
  const linea = estadoMd.split("\n").find((l) => /\|\s*\*\*Sin aplicar\*\*\s*\|/.test(l));
  return new Set(linea ? [...linea.matchAll(/`(\d{4}_[\w-]+)`/g)].map((m) => m[1]) : []);
}

export function leerMigraciones() {
  const de = (dir) => {
    try {
      return readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => ({ f, dir }));
    } catch {
      return [];
    }
  };
  return [...de(DIR), ...de(DIR_MANUAL).filter(({ f }) => /^\d{4}[a-z]_/.test(f))]
    .sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0))
    .map(({ f, dir }) => ({ nombre: f.replace(/\.sql$/, ""), ...testigos(readFileSync(join(dir, f), "utf8")) }));
}

// ── Principal ──────────────────────────────────────────────────────────────

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const arg = (n) => {
    const i = process.argv.indexOf(n);
    return i === -1 ? null : process.argv[i + 1];
  };
  const desde = arg("--desde");
  const solo = arg("--solo");
  const url = urlDeLaBase();
  if (!url) {
    console.error("Falta SUPABASE_DB_URL (ni en el entorno ni en .env.local).");
    process.exit(1);
  }

  const migraciones = leerMigraciones();
  const sinAplicar = leerSinAplicar(readFileSync(join(RAIZ, "supabase", "ESTADO.md"), "utf8"));
  const catalogo = await leerCatalogo(url);
  const todas = veredictos(migraciones, catalogo, sinAplicar);
  const elegidas = todas.filter((v) => (!solo || v.nombre.startsWith(solo)) && (!desde || v.nombre >= desde));

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(elegidas, null, 2));
  } else {
    console.log(`Base: ${new URL(url).hostname} (solo lectura) · ${elegidas.length} migraciones\n`);
    for (const v of elegidas) {
      const vivos = v.filas.filter((f) => f.resultado !== "después");
      const esta = vivos.filter((f) => f.resultado === "está").length;
      const marca = v.choca ? "  ⚠ ESTADO.md dice " + v.estadoMd : "";
      console.log(`${v.nombre.padEnd(48)} ${v.estado.padEnd(12)} ${String(esta).padStart(3)}/${String(vivos.length).padEnd(3)}${marca}`);
      if (process.argv.includes("--detalle") || v.choca || v.estado === "parcial") {
        for (const f of v.filas.filter((x) => x.resultado !== "está")) {
          console.log(`    ${f.resultado.padEnd(8)} ${f.tipo} ${f.id}${f.por ? ` (lo toca ${f.por})` : ""}`);
        }
      }
    }
    const choques = elegidas.filter((v) => v.choca);
    console.log(`\n${choques.length ? `⚠ ${choques.length} no cuadran con ESTADO.md: ${choques.map((v) => v.nombre).join(", ")}` : "Todo cuadra con ESTADO.md."}`);
    const ciegas = elegidas.filter((v) => v.estado === "sin testigo").map((v) => v.nombre);
    if (ciegas.length) console.log(`Sin testigo (mirar a mano): ${ciegas.join(", ")}`);
  }
}
