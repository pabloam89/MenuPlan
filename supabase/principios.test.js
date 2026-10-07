import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Los principios de docs/datos/PRINCIPIOS.md que se pueden leer en el SQL.
 *
 * Se aplican a las migraciones desde la 0087: lo anterior no se reescribe.
 * Una excepción, que mira TODAS: cada constraint NOT VALID que ninguna
 * migración posterior valida tiene que estar apuntado en PENDIENTES.md, o se
 * queda sin validar para siempre sin que nadie lo sepa.
 *
 * Es un lector de texto, no un parser de SQL: quita comentarios, vacía los
 * cuerpos $$…$$ y los textos largos, y busca patrones. Lo de abajo, con SQL de
 * ejemplo bueno y malo, prueba que cada regla falla cuando debe.
 */
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(AQUI, "migrations");
const DESDE = 87;

const leer = (f) => fs.readFileSync(path.join(AQUI, f), "utf8");

/**
 * El SQL sin comentarios, sin cuerpos de función y en minúsculas. Los textos
 * entre comillas cortos se quedan (un `search_path = 'public, pg_temp'`); los
 * largos se vacían, para que un comentario que dice «references» o «begin;»
 * no cuente como SQL.
 */
export function limpiar(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      const j = sql.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
      out += " ";
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      const texto = sql.slice(i + 1, j);
      out += texto.length <= 40 && !/[;$]/.test(texto) ? `'${texto}'` : "''";
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const j = sql.indexOf(m[0], i + m[0].length);
        out += "$$ $$";
        i = j < 0 ? n : j + m[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out.toLowerCase();
}

/** Parte por comas que no estén dentro de paréntesis. */
function trozos(s) {
  const r = [];
  let prof = 0;
  let desde = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") prof++;
    else if (s[i] === ")") prof--;
    else if (s[i] === "," && prof === 0) { r.push(s.slice(desde, i)); desde = i + 1; }
  }
  r.push(s.slice(desde));
  return r.map((x) => x.trim());
}

const nombre = (s) => s.replace(/"/g, "").replace(/^public\./, "");
const ID = String.raw`((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)`;
const RE_CREATE_TABLE = new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${ID}`);
const RE_ALTER_TABLE = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${ID}\s+([\s\S]*)$`);
const RE_CREATE_FUNCTION = new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?function\s+${ID}`);

/** Sentencias de nivel superior, ya limpias. */
const sentencias = (codigo) => codigo.split(";").map((s) => s.trim()).filter(Boolean);

/** Las cláusulas de una sentencia: columnas de un create table, acciones de un alter table. */
function clausulas(s) {
  const ct = RE_CREATE_TABLE.exec(s);
  if (ct) {
    const abre = s.indexOf("(", ct[0].length);
    const cierra = s.lastIndexOf(")");
    return abre < 0 ? [] : trozos(s.slice(abre + 1, cierra));
  }
  const at = RE_ALTER_TABLE.exec(s);
  if (at) return trozos(at[2]);
  return trozos(s);
}

const RE_ADD_CONSTRAINT = /^add\s+(?:constraint\s+("?[\w]+"?)\s+)?(check|foreign\s+key)\b/;

/** Constraints NOT VALID de un fichero, en orden, con lo que los valida o quita. */
function eventosConstraint(codigo) {
  const ev = [];
  for (const s of sentencias(codigo)) {
    const at = RE_ALTER_TABLE.exec(s);
    if (!at) continue;
    const tabla = nombre(at[1]);
    for (const c of trozos(at[2])) {
      const add = RE_ADD_CONSTRAINT.exec(c) ?? /^add\s+constraint\s+("?[\w]+"?)/.exec(c);
      const val = /^validate\s+constraint\s+("?[\w]+"?)/.exec(c);
      const drop = /^drop\s+constraint\s+(?:if\s+exists\s+)?("?[\w]+"?)/.exec(c);
      if (add && add[1]) ev.push({ tipo: /\bnot\s+valid\b/.test(c) ? "not_valid" : "valido", nombre: nombre(add[1]), tabla });
      else if (val) ev.push({ tipo: "validado", nombre: nombre(val[1]), tabla });
      else if (drop) ev.push({ tipo: "quitado", nombre: nombre(drop[1]), tabla });
    }
  }
  return ev;
}

const contiene = (lista, ...quienes) => quienes.every((q) => new RegExp(String.raw`\b${q}\b`).test(lista));
const apuntado = (texto, n) => new RegExp(String.raw`(?<![\w])${n}(?![\w])`).test(texto);

/**
 * Las violaciones de una migración ≥ 0087. Cada una empieza por el nombre de
 * la regla («on-delete: …»), que es lo que mira el autotest.
 */
export function revisar(fichero, sql, { pendientes, estado }) {
  const v = [];
  const codigo = limpiar(sql);
  const sents = sentencias(codigo);

  const creadas = new Set();
  for (const s of sents) {
    const m = RE_CREATE_TABLE.exec(s);
    if (m && !/^create\s+(?:unlogged\s+)?table\s+[^(]*\bas\b/.test(s)) creadas.add(nombre(m[1]));
  }

  // on-delete: toda FK dice qué pasa al borrar.
  for (const s of sents) {
    for (const c of clausulas(s)) {
      if (/\breferences\b/.test(c) && !/\bon\s+delete\b/.test(c)) v.push(`on-delete: ${c.slice(0, 120)}`);
    }
  }

  // rls y revoke-tabla.
  for (const t of creadas) {
    const tRe = String.raw`(?:public\.)?"?${t}"?`;
    if (!new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${tRe}\s+enable\s+row\s+level\s+security`).test(codigo)) {
      v.push(`rls: ${t} sin enable row level security`);
    }
    const conPolitica = new RegExp(String.raw`create\s+policy\s+[^;]*?\bon\s+${tRe}(?![\w])`).test(codigo);
    if (!conPolitica) {
      const revocado = [...codigo.matchAll(/revoke\s+all\s+(?:privileges\s+)?on\s+(?:table\s+)?([^;]*?)\s+from\s+([^;]*)/g)]
        .some((m) => m[1].split(",").map((x) => nombre(x.trim())).includes(t) && contiene(m[2], "anon", "authenticated"));
      if (!revocado) v.push(`revoke-tabla: ${t} no tiene políticas ni revoke all … from anon, authenticated`);
    }
  }

  // definer.
  for (const s of sents) {
    const f = RE_CREATE_FUNCTION.exec(s);
    if (!f || !/\bsecurity\s+definer\b/.test(s)) continue;
    const fn = nombre(f[1]);
    if (!/set\s+search_path\s*(?:=|to)\s*(?:''|[^;$]*\bpg_temp\b)/.test(s)) {
      v.push(`definer: ${fn} sin set search_path = public, pg_temp`);
    }
    const quienes = [...codigo.matchAll(new RegExp(String.raw`revoke\s+(?:all|execute)\s+(?:privileges\s+)?on\s+function\s+(?:public\.)?"?${fn}"?\s*(?:\([^)]*\))?\s+from\s+([^;]*)`, "g"))]
      .map((m) => m[1]).join(" ");
    if (!contiene(quienes, "public", "anon", "authenticated")) {
      v.push(`definer: ${fn} sin revoke … from public, anon, authenticated`);
    }
  }

  // enum.
  if (/create\s+type\s+[\w."]+\s+as\s+enum\b/.test(codigo)) v.push("enum: create type … as enum");
  if (/alter\s+type\s+[\w."]+\s+add\s+value\b/.test(codigo)) v.push("enum: alter type … add value");

  // not-valid y contrae (cláusulas de alter table).
  let contrae = /\bdrop\s+table\b/.test(codigo);
  for (const s of sents) {
    const at = RE_ALTER_TABLE.exec(s);
    if (!at) continue;
    const tabla = nombre(at[1]);
    for (const c of trozos(at[2])) {
      if (/^drop\s+(?!constraint\b)/.test(c)) contrae = true;
      const add = RE_ADD_CONSTRAINT.exec(c);
      if (!add || creadas.has(tabla)) continue;
      if (!add[1]) v.push(`not-valid: constraint sin nombre en ${tabla}`);
      else if (!/\bnot\s+valid\b/.test(c)) v.push(`not-valid: ${nombre(add[1])} sobre ${tabla} sin not valid`);
    }
  }
  if (contrae && !/^--\s*CONTRAE:/m.test(sql)) v.push("contrae: drop table|column sin cabecera -- CONTRAE:");

  // pendientes.
  const vivos = new Map();
  for (const e of eventosConstraint(codigo)) {
    if (e.tipo === "not_valid") vivos.set(e.nombre, e);
    else vivos.delete(e.nombre);
  }
  for (const n of vivos.keys()) {
    if (!apuntado(pendientes, n)) v.push(`pendientes: ${n} es NOT VALID y no está en supabase/PENDIENTES.md`);
  }

  // transaccion.
  if (/\bconcurrently\b/.test(codigo)) v.push("transaccion: concurrently (va a supabase/manual/)");
  for (const s of sents) {
    if (/^(begin|commit|rollback|start\s+transaction|vacuum)\b/.test(s)) v.push(`transaccion: ${s.split(/\s/)[0]}`);
  }

  // estado.
  const num = fichero.slice(0, 4);
  if (!new RegExp(String.raw`(?<!\d)${num}(?!\d)`).test(estado)) v.push(`estado: ${num} no está en supabase/ESTADO.md`);

  // lock-timeout.
  if (!/\bset\s+(?:local\s+)?lock_timeout\b/.test(codigo)) v.push("lock-timeout: falta set lock_timeout");

  // tipos: fechas con zona, texto sin longitud fija, números exactos.
  for (const s of sents) {
    const ct = RE_CREATE_TABLE.exec(s);
    const at = RE_ALTER_TABLE.exec(s);
    if (!ct && !at) continue;
    for (const c of clausulas(s)) {
      if (at && !/^add\s+(?:column\b|(?!constraint\b)\w)/.test(c) && !/^alter\s+(?:column\s+)?\w+\s+(?:set\s+data\s+)?type\b/.test(c)) continue;
      if (/\btimestamp\b(?!\s*(?:\(\s*\d+\s*\)\s*)?with\s+time\s+zone)/.test(c)) v.push(`tipos: timestamp sin zona (usa timestamptz): ${c.slice(0, 80)}`);
      if (/\b(?:varchar|character\s+varying|char|character)\s*\(/.test(c)) v.push(`tipos: texto con longitud fija (usa text + check): ${c.slice(0, 80)}`);
      if (/\b(?:real|float[48]?|double\s+precision|money)\b/.test(c)) v.push(`tipos: número inexacto (usa integer o numeric): ${c.slice(0, 80)}`);
    }
  }

  // comentario: cada tabla nueva dice qué es.
  for (const t of creadas) {
    if (!new RegExp(String.raw`comment\s+on\s+table\s+(?:public\.)?"?${t}"?\s+is\b`).test(codigo)) v.push(`comentario: ${t} sin comment on table`);
  }

  return v;
}

/** NOT VALID que ninguna migración posterior valida y que no están en PENDIENTES.md. */
export function sinApuntar(migraciones, pendientes) {
  const vivos = new Map();
  for (const { fichero, sql } of migraciones) {
    for (const e of eventosConstraint(limpiar(sql))) {
      if (e.tipo === "not_valid") vivos.set(e.nombre, { ...e, fichero });
      else vivos.delete(e.nombre);
    }
  }
  const todos = [...vivos.values()];
  return { todos, faltan: todos.filter((e) => !apuntado(pendientes, e.nombre)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Autotest: la regla falla con el SQL malo y no con el bueno.

const BUENA = `-- 0999 · ejemplo que cumple todo
set lock_timeout = '5s';

create table if not exists public.cosas (
  household_id uuid not null references public.households(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.cosas enable row level security;
create policy "miembros leen cosas" on public.cosas
  for select using (household_id in (select household_id from public.household_members where user_id = (select auth.uid())));

create table public.cosas_log (
  id bigserial primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  cosa_id uuid,
  constraint cosas_log_cosa_fk foreign key (household_id, cosa_id)
    references public.cosas(household_id, id) on delete cascade,
  constraint cosas_log_nota_vocabulario check (cosa_id is not null)
);
alter table public.cosas_log enable row level security;
revoke all on table public.cosas_log from anon, authenticated;

alter table public.bot_tareas add constraint bot_tareas_ejemplo_vocabulario
  check (tipo in ('a', 'b')) not valid;
alter table public.bot_tareas validate constraint bot_tareas_viejo_check;

create or replace function public.hacer_cosa(p uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- dentro del cuerpo nada cuenta: references x(id), commit, drop table
  perform 1;
  commit;
end;
$fn$;
revoke all on function public.hacer_cosa(uuid) from public, anon, authenticated;
grant execute on function public.hacer_cosa(uuid) to service_role;

comment on table public.cosas is 'Un texto largo que dice references, begin; y drop table, y no es SQL de verdad';
comment on table public.cosas_log is 'Registro de solo añadir de lo que pasa con cada cosa';
`;

const CTX = { pendientes: "- `bot_tareas_ejemplo_vocabulario`", estado: "| `0999_ejemplo` | sin aplicar |" };
const F = "0999_ejemplo.sql";

const reglas = (v) => [...new Set(v.map((x) => x.split(":")[0]))].sort();

/** Cada caso cambia UNA cosa del SQL bueno y debe disparar exactamente esa regla. */
const MALAS = [
  ["on-delete", "FK en create table sin on delete",
    (s) => s.replace("references public.households(id) on delete cascade,\n  id uuid", "references public.households(id),\n  id uuid")],
  ["on-delete", "FK en add column sin on delete",
    (s) => s + "alter table public.bot_tareas add column cosa_id uuid references public.cosas(id);\n"],
  ["on-delete", "FK de tabla sin on delete",
    (s) => s.replace("references public.cosas(household_id, id) on delete cascade", "references public.cosas(household_id, id)")],
  ["rls", "tabla sin enable row level security",
    (s) => s.replace("alter table public.cosas enable row level security;\n", "")],
  ["revoke-tabla", "tabla sin políticas ni revoke",
    (s) => s.replace("revoke all on table public.cosas_log from anon, authenticated;\n", "")],
  ["revoke-tabla", "revoke que se olvida de authenticated",
    (s) => s.replace("revoke all on table public.cosas_log from anon, authenticated;", "revoke all on table public.cosas_log from anon;")],
  ["definer", "security definer sin search_path",
    (s) => s.replace("set search_path = public, pg_temp\n", "")],
  ["definer", "search_path sin pg_temp",
    (s) => s.replace("set search_path = public, pg_temp", "set search_path = public")],
  ["definer", "revoke solo a public (Supabase deja a anon)",
    (s) => s.replace("from public, anon, authenticated;", "from public;")],
  ["enum", "create type as enum",
    (s) => s + "create type public.color as enum ('rojo');\n"],
  ["enum", "alter type add value",
    (s) => s + "alter type public.household_member_role add value 'otro';\n"],
  ["not-valid", "check sobre tabla existente sin not valid",
    (s) => s.replace("check (tipo in ('a', 'b')) not valid;", "check (tipo in ('a', 'b'));")],
  ["not-valid", "foreign key sobre tabla existente sin not valid",
    (s) => s + "alter table public.bot_reminders add constraint bot_reminders_cosa_fk foreign key (household_id, cosa_id) references public.cosas(household_id, id) on delete cascade;\n"],
  ["pendientes", "not valid sin apuntar en PENDIENTES.md",
    (s) => s.replace("bot_tareas_ejemplo_vocabulario", "bot_tareas_otro_vocabulario")],
  ["transaccion", "begin/commit sueltos",
    (s) => "begin;\n" + s + "commit;\n"],
  ["transaccion", "create index concurrently",
    (s) => s + "create index concurrently idx_cosas_nombre on public.cosas (nombre);\n"],
  ["contrae", "drop column sin cabecera",
    (s) => s + "alter table public.user_recipes drop column vieja;\n"],
  ["contrae", "drop sin la palabra column",
    (s) => s + "alter table public.user_recipes drop if exists vieja;\n"],
  ["contrae", "drop table sin cabecera",
    (s) => s + "drop table if exists public.viejas;\n"],
  ["lock-timeout", "sin set lock_timeout",
    (s) => s.replace("set lock_timeout = '5s';\n", "")],
  ["tipos", "timestamp sin zona",
    (s) => s.replace("created_at timestamptz not null", "created_at timestamp not null")],
  ["tipos", "varchar con longitud",
    (s) => s.replace("nombre text not null", "nombre varchar(80) not null")],
  ["tipos", "precio en float",
    (s) => s + "alter table public.cosas add column precio double precision;\n"],
  ["tipos", "columna cambiada a real",
    (s) => s + "alter table public.cosas alter column nombre type real;\n"],
  ["comentario", "tabla nueva sin comment on table",
    (s) => s.replace("comment on table public.cosas_log is 'Registro de solo añadir de lo que pasa con cada cosa';\n", "")],
];

describe("principios: el lector distingue SQL bueno de malo", () => {
  it("el SQL bueno pasa todas las reglas", () => {
    expect(revisar(F, BUENA, CTX)).toEqual([]);
  });

  it.each(MALAS)("%s: %s", (regla, _desc, mutar) => {
    const malo = mutar(BUENA);
    expect(malo, "la mutación no cambió nada: el caso no prueba nada").not.toBe(BUENA);
    expect(reglas(revisar(F, malo, CTX))).toEqual([regla]);
  });

  it("estado: el número tiene que estar en ESTADO.md (y 0099 no vale por 0999)", () => {
    expect(reglas(revisar(F, BUENA, { ...CTX, estado: "| `0099` |" }))).toEqual(["estado"]);
  });

  it("contrae: con la cabecera, el drop pasa", () => {
    const sql = "-- CONTRAE: user_recipes.vieja, sin lector desde el PR #80\n"
      + BUENA + "alter table public.user_recipes drop column vieja;\ndrop table if exists public.viejas;\n";
    expect(revisar(F, sql, CTX)).toEqual([]);
  });

  it("constraint añadido en la tabla que se crea en el mismo fichero no necesita not valid", () => {
    const sql = BUENA + "alter table public.cosas add constraint cosas_nombre_vocabulario check (nombre <> '');\n";
    expect(revisar(F, sql, CTX)).toEqual([]);
  });

  it("dos revokes separados (public, y luego anon y authenticated) también valen", () => {
    const sql = BUENA.replace("from public, anon, authenticated;",
      "from public;\nrevoke execute on function public.hacer_cosa(uuid) from anon, authenticated;");
    expect(revisar(F, sql, CTX)).toEqual([]);
  });
});

describe("principios: NOT VALID sin validar, en todas las migraciones", () => {
  const A = { fichero: "0001_a.sql", sql: "alter table t drop constraint if exists x_check;\nalter table t add constraint x_check check (a > 0) not valid;\n" };
  it("un NOT VALID sin validar y sin apuntar sale", () => {
    expect(sinApuntar([A], "").faltan.map((e) => e.nombre)).toEqual(["x_check"]);
  });
  it("apuntado en PENDIENTES.md, ya no", () => {
    expect(sinApuntar([A], "`x_check`").faltan).toEqual([]);
  });
  it("validado en una migración posterior, ya no está pendiente", () => {
    const B = { fichero: "0002_b.sql", sql: "set lock_timeout = '5s';\nalter table t validate constraint x_check;\n" };
    expect(sinApuntar([A, B], "").todos).toEqual([]);
  });
  it("el validate en un comentario no cuenta", () => {
    const B = { fichero: "0002_b.sql", sql: "-- alter table t validate constraint x_check;\n" };
    expect(sinApuntar([A, B], "").faltan.map((e) => e.nombre)).toEqual(["x_check"]);
  });
  it("x_check_v2 apuntado no tapa a x_check", () => {
    expect(sinApuntar([A], "`x_check_v2`").faltan.map((e) => e.nombre)).toEqual(["x_check"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lo real.

const ficheros = fs.readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const PENDIENTES = leer("PENDIENTES.md");
const ESTADO = leer("ESTADO.md");

describe("principios: las migraciones del repo", () => {
  const nuevas = ficheros.filter((f) => Number(f.slice(0, 4)) >= DESDE);

  it.each(nuevas.length ? nuevas : ["(ninguna todavía)"])("%s cumple los principios", (f) => {
    if (!nuevas.length) return;
    expect(revisar(f, fs.readFileSync(path.join(DIR, f), "utf8"), { pendientes: PENDIENTES, estado: ESTADO })).toEqual([]);
  });

  it("todo NOT VALID sin validar de cualquier migración está en PENDIENTES.md", () => {
    const { todos, faltan } = sinApuntar(
      ficheros.map((f) => ({ fichero: f, sql: fs.readFileSync(path.join(DIR, f), "utf8") })),
      PENDIENTES,
    );
    // Que el lector encuentra los que sabemos que hay (si no, este test no mide nada).
    expect(todos.map((e) => e.nombre)).toEqual(expect.arrayContaining([
      "bot_tareas_status_check", "bot_reminders_tarea_fk", "user_pantry_pack_kind_vocabulario",
    ]));
    expect(faltan.map((e) => `${e.fichero}: ${e.tabla}.${e.nombre}`)).toEqual([]);
  });
});
