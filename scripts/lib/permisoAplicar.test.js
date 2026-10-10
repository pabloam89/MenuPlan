import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { auditoriaDe, hashDe, motivosDePablo, motivosParaNoAplicar, VIGENCIA_MS } from "./permisoAplicar.mjs";

const OK = "-- AUDITADA: auditor-datos 2026-10-08 OK\n";
const SQL = `${OK}set lock_timeout = '5s';\ncreate table public.x (id int);\nalter table public.x enable row level security;\nrevoke all on table public.x from anon, authenticated;\n`;
const ahora = Date.parse("2026-10-08T12:00:00Z");
const hace = (ms) => new Date(ahora - ms).toISOString();
/** Un caso que pasa todo salvo lo que se cambie: el mismo SQL en local, en staging y en el ensayo. */
const con = (sql, extra = {}) => ({ nombre: "0088_x", local: sql, enStaging: sql, ensayo: { hash: hashDe(sql), at: hace(60_000) }, ahora, ...extra });
const base = con(SQL);

describe("cuándo se puede aplicar en producción", () => {
  it("en staging, idéntica, ensayada hace un minuto y con el OK del juez: sí", () => {
    expect(motivosParaNoAplicar(base)).toEqual([]);
  });

  it("los saltos de línea de Windows no la hacen distinta", () => {
    expect(motivosParaNoAplicar({ ...base, local: SQL.replace(/\n/g, "\r\n") })).toEqual([]);
  });

  it("si no está en staging, no", () => {
    expect(motivosParaNoAplicar({ ...base, enStaging: null })[0]).toMatch(/no está en origin\/staging/);
  });

  it("si la local difiere de la de staging, no", () => {
    expect(motivosParaNoAplicar({ ...base, local: `${SQL}create index i on public.x (id);` }).join()).toMatch(/no es igual que en origin\/staging/);
  });

  it("sin ensayo, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: null })[0]).toMatch(/No hay ensayo/);
  });

  it("si cambió después del ensayo, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: { hash: hashDe("otra cosa"), at: hace(60_000) } })[0]).toMatch(/cambió después/);
  });

  it("con el ensayo de hace más de una hora, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: { hash: hashDe(SQL), at: hace(VIGENCIA_MS + 1) } })[0]).toMatch(/más de una hora/);
  });
});

describe("el juez auditor-datos", () => {
  it("sin la línea AUDITADA, no", () => {
    expect(motivosParaNoAplicar(con(SQL.replace(OK, ""))).join()).toMatch(/pide al juez auditor-datos/);
  });

  it("con un veredicto que no es OK, no, y dice cuál", () => {
    const sql = SQL.replace("OK\n", "falta el índice de la FK\n");
    expect(motivosParaNoAplicar(con(sql)).join()).toMatch(/no dio el OK.*falta el índice de la FK/);
  });

  it("con una fecha imposible, no cuenta como auditada", () => {
    expect(auditoriaDe("-- AUDITADA: auditor-datos 2026-02-30 OK")).toBe(null);
    expect(auditoriaDe(OK)).toEqual({ fecha: "2026-10-08", veredicto: "OK" });
  });
});

describe("lo que lanza Pablo", () => {
  it("una tabla nueva con su RLS y su revoke no es de Pablo", () => {
    expect(motivosDePablo(SQL)).toEqual([]);
  });

  it("CONTRAE es de Pablo", () => {
    expect(motivosParaNoAplicar(con(`-- CONTRAE: user_recipes.vieja, sin lector\n${SQL}`)).join()).toMatch(/la lanza Pablo/);
  });

  it("una política sobre una tabla que ya existía es de Pablo", () => {
    expect(motivosParaNoAplicar(con(`${SQL}create policy p on public.households for select using (true);\n`)).join()).toMatch(/política de households/);
  });

  it("un grant sobre una tabla que ya existía es de Pablo", () => {
    expect(motivosParaNoAplicar(con(`${SQL}grant select on public.persona to anon;\n`)).join()).toMatch(/grant sobre persona/);
  });

  it("security definer es de Pablo", () => {
    const sql = `${SQL}create function public.f() returns int language sql security definer as 'select 1';\n`;
    expect(motivosDePablo(sql).join()).toMatch(/security definer/);
  });

  // Los huecos del juez de seguridad (8 oct 2026): se mira lo que HACE el SQL.
  it.each([
    ["truncate", "truncate public.user_pantry;"],
    ["delete from", "delete from public.persona where true;"],
    ["update … set", "update public.persona set nombre = 'x';"],
    ["drop view", "drop view public.v_casas;"],
    ["drop table sin CONTRAE", "drop table public.viejas;"],
    ["drop column sin CONTRAE", "alter table public.persona drop column apodo;"],
    ["cambio de tipo", "alter table public.persona alter column edad type text;"],
    ["RLS al final de un alter con varias cosas", "alter table public.persona add column x int, disable row level security;"],
    ["grant a varias tablas", "grant select on public.cosas, public.persona to anon;"],
    ["grant de un rol a otro", "grant authenticated to anon;"],
    ["permisos por defecto", "alter default privileges in schema public grant select on tables to anon;"],
    ["create table if not exists no es nueva", "create table if not exists public.persona (id uuid);\nalter table public.persona disable row level security;"],
    ["vista sin security_invoker", "create view public.v as select * from public.persona;"],
    ["SQL dinámico en un do", "do $$ begin execute 'drop table public.persona'; end $$;"],
  ])("%s es de Pablo", (_n, extra) => {
    expect(motivosDePablo(`${SQL}${extra}\n`)).not.toEqual([]);
  });

  it("un update dentro del cuerpo de una función no es de Pablo (no se ejecuta al aplicar)", () => {
    const f = "create or replace function public.marcar(p uuid) returns void language sql as $$ update public.cosas set nombre = 'x' where id = p $$;\n";
    expect(motivosDePablo(`${SQL}${f}`)).toEqual([]);
  });

  it("un '--' dentro de un literal no esconde lo que viene detrás", () => {
    expect(motivosDePablo(`${SQL}insert into public.cosas (nombre) values ('--'); truncate public.persona;\n`)).not.toEqual([]);
  });

  it("una vista con security_invoker no es de Pablo", () => {
    expect(motivosDePablo(`${SQL}create view public.v with (security_invoker = true) as select 1;\n`)).toEqual([]);
  });

  it("--pablo levanta lo de Pablo…", () => {    expect(motivosParaNoAplicar(con(`-- CONTRAE: x\n${SQL}`, { pablo: true }))).toEqual([]);
  });

  it("…pero no se salta al juez, ni staging, ni el ensayo", () => {
    const sql = `-- CONTRAE: x\n${SQL.replace(OK, "")}`;
    const no = motivosParaNoAplicar({ ...con(sql, { pablo: true }), enStaging: null, ensayo: null }).join("\n");
    expect(no).toMatch(/pide al juez/);
    expect(no).toMatch(/no está en origin\/staging/);
    expect(no).toMatch(/No hay ensayo/);
  });
});

// #440: revocar a `anon` la plantilla de tablas y secuencias nuevas de `public`
// no toca nada de lo que existe, así que no hace falta una persona. Lista
// blanca estrecha: cualquier otra forma de `alter default privileges` sigue
// siendo de Pablo.
describe("privilegios por defecto a anon (#440)", () => {
  const TABLAS = "alter default privileges for role postgres in schema public revoke all on tables from anon;";
  const SECUENCIAS = "alter default privileges for role postgres in schema public revoke all on sequences from anon;";
  const SOLO = (...s) => `${OK}set lock_timeout = '5s';\n${s.join("\n")}\n`;

  it("los dos revoke a anon (tablas y secuencias) no son de Pablo", () => {
    expect(motivosDePablo(SOLO(TABLAS, SECUENCIAS))).toEqual([]);
    expect(motivosParaNoAplicar(con(SOLO(TABLAS, SECUENCIAS)))).toEqual([]);
  });

  it("vale con mayúsculas, saltos de línea, `all privileges` o la lista de permisos", () => {
    expect(motivosDePablo(SOLO("ALTER DEFAULT PRIVILEGES\n  FOR ROLE postgres\n  IN SCHEMA public\n  REVOKE ALL PRIVILEGES ON TABLES FROM anon"))).toEqual([]);
    expect(motivosDePablo(SOLO("alter default privileges for role postgres in schema public revoke select, insert, update, delete, truncate, references, trigger, maintain on tables from anon;"))).toEqual([]);
    expect(motivosDePablo(SOLO("alter default privileges for role postgres in schema public revoke usage, select, update on sequences from anon;"))).toEqual([]);
  });

  it("dentro de un do (como la 0096) y con una autoprueba que crea una tabla, tampoco", () => {
    const sql = SOLO(
      TABLAS,
      SECUENCIAS,
      "do $$ begin create table public.zz_prueba (id bigint generated always as identity primary key); raise exception 'ok'; end $$;",
    );
    expect(motivosDePablo(sql)).toEqual([]);
  });

  it("`'truncate'` solo se ignora como permiso a comprobar (lista del foreach o has_*_privilege)", () => {
    expect(motivosDePablo(SOLO("do $$ declare p text; begin foreach p in array array['select', 'truncate'] loop null; end loop; end $$;"))).toEqual([]);
    expect(motivosDePablo(SOLO("select has_table_privilege('anon','public.x','truncate');"))).toEqual([]);
    expect(motivosDePablo(SOLO("select has_sequence_privilege('anon','public.s','usage');"))).toEqual([]);
  });

  // Ronda 2 (seguridad, #440): cada forma de esconder un truncate o un execute.
  it.each([
    ["truncate de verdad", "truncate public.persona;"],
    ["truncate tras un literal", "insert into public.cosas (n) values ('a'); truncate public.persona;"],
    ["execute con literal", "do $$ begin execute 'truncate public.persona'; end $$;"],
    ["execute concat", "do $$ begin execute concat('truncate ', 'public.persona'); end $$;"],
    ["execute entre paréntesis", "do $$ begin execute ('truncate public.persona'); end $$;"],
    ["execute E''", "do $$ begin execute E'truncate public.persona'; end $$;"],
    ["execute lower", "do $$ begin execute lower('TRUNCATE public.persona'); end $$;"],
    ["E'\\'' y truncate detrás", "select E'\\''; truncate public.persona; select 'x';"],
    ["comilla dentro de $q$", "select $q$'$q$; truncate public.persona; select $q$'$q$;"],
    ["comilla dentro de un identificador", 'select 1 as "\'"; truncate public.persona; select 1 as "\'";'],
    ["truncate como tercer argumento de otra función", "select otra('anon','public.x','truncate'); truncate public.persona;"],
    ["execute con variable", "do $$ declare q text := 'x'; begin execute q; end $$;"],
    ["execute using", "do $$ begin execute 'select 1' using 1; end $$;"],
    ["la lista blanca con un execute dentro de un do", `do $$ begin ${TABLAS} execute 'truncate persona'; end $$;`],
    ["la lista blanca con un delete en el mismo do", `do $$ begin ${TABLAS} delete from persona; end $$;`],
    ["la lista blanca con un truncate al lado", `${TABLAS} truncate persona;`],
    ["la lista blanca con espacio no separador (nbsp)", TABLAS.replace(" from ", " from ")],
    ["la lista blanca con un comentario en medio y un grant", `alter default privileges for role postgres in schema public revoke all on tables /* x */ from anon; grant all on public.persona to anon;`],
    ["la lista blanca dentro de un literal y un drop", `select '${TABLAS}'; drop table public.persona;`],
    ["lista blanca con restrict", TABLAS.replace(";", " restrict;")],
    ["lista blanca con dos roles creadores", "alter default privileges for role postgres, supabase_admin in schema public revoke all on tables from anon;"],
  ])("sigue siendo de Pablo: %s", (_n, extra) => {
    expect(motivosDePablo(SOLO(extra))).not.toEqual([]);
  });

  it("un trigger con `execute function` no cuenta como SQL dinámico", () => {
    expect(motivosDePablo(SOLO("create trigger t before insert on public.x for each row execute function public.f();"))).toEqual([]);
  });

  it("la migración 0096 real ya no es de Pablo", () => {
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    const f = readdirSync(dir).find((n) => n.startsWith("0096"));
    expect(f).toBeTruthy();
    expect(motivosDePablo(readFileSync(new URL(f, dir), "utf8"))).toEqual([]);
  });

  // Lo que SIGUE exigiendo a Pablo.
  it.each([
    ["grant por defecto a anon", "alter default privileges for role postgres in schema public grant select on tables to anon;"],
    ["grant por defecto a authenticated", "alter default privileges for role postgres in schema public grant all on tables to authenticated;"],
    ["mutación: sin el filtro `from anon`, a todos (public)", "alter default privileges for role postgres in schema public revoke all on tables from public;"],
    ["mutación: from authenticated", "alter default privileges for role postgres in schema public revoke all on tables from authenticated;"],
    ["mutación: from service_role", "alter default privileges for role postgres in schema public revoke all on tables from service_role;"],
    ["mutación: from consulta_lectura", "alter default privileges for role postgres in schema public revoke select on tables from consulta_lectura;"],
    ["mutación: from copia_lectura", "alter default privileges for role postgres in schema public revoke select on sequences from copia_lectura;"],
    ["anon y otro rol a la vez", "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;"],
    ["otro rol y anon", "alter default privileges for role postgres in schema public revoke all on tables from authenticated, anon;"],
    ["fuera de public", "alter default privileges for role postgres in schema extensions revoke all on tables from anon;"],
    ["sin `in schema` (todos los esquemas)", "alter default privileges for role postgres revoke all on tables from anon;"],
    ["sin `for role` (el rol de turno)", "alter default privileges in schema public revoke all on tables from anon;"],
    ["otro rol creador", "alter default privileges for role supabase_admin in schema public revoke all on tables from anon;"],
    ["funciones", "alter default privileges for role postgres in schema public revoke execute on functions from anon;"],
    ["funciones con all", "alter default privileges for role postgres in schema public revoke all on functions from anon;"],
    ["tipos", "alter default privileges for role postgres in schema public revoke all on types from anon;"],
    ["esquemas", "alter default privileges for role postgres in schema public revoke all on schemas from anon;"],
    ["con cascade", "alter default privileges for role postgres in schema public revoke all on tables from anon cascade;"],
    ["con grant option for", "alter default privileges for role postgres in schema public revoke grant option for all on tables from anon;"],
    ["permiso que no existe en esa clase", "alter default privileges for role postgres in schema public revoke execute on tables from anon;"],
    ["esquema entre comillas", 'alter default privileges for role postgres in schema "public" revoke all on tables from anon;'],
    ["un drop al lado", `${TABLAS}\ndrop table public.persona;`],
    ["un delete al lado", `${TABLAS}\ndelete from public.persona;`],
    ["un grant suelto al lado", `${TABLAS}\ngrant select on public.persona to anon;`],
    ["un revoke sobre una tabla existente al lado", `${TABLAS}\nrevoke all on table public.persona from anon;`],
    ["un revoke sobre una función al lado", `${TABLAS}\nrevoke execute on function public.f() from anon;`],
    ["RLS de una tabla existente al lado", `${TABLAS}\nalter table public.persona disable row level security;`],
    ["security definer al lado", `${TABLAS}\ncreate function public.f() returns int language sql security definer as 'select 1';`],
    ["SQL dinámico al lado", `${TABLAS}\ndo $$ begin execute 'drop table public.persona'; end $$;`],
    ["CONTRAE al lado", `-- CONTRAE: x\n${TABLAS}`],
    ["la buena pegada a una mala", `${TABLAS}\nalter default privileges for role postgres in schema public grant select on tables to anon;`],
    ["pegada a un grant que la usa de cola", "grant select on public.persona to alter default privileges for role postgres in schema public revoke all on tables from anon;"],
    ["execute dinámico que la monta", "do $$ begin execute 'alter default privileges for role postgres in schema public grant all on tables to anon'; end $$;"],
  ])("%s sigue siendo de Pablo", (_n, extra) => {
    expect(motivosDePablo(SOLO(extra))).not.toEqual([]);
    expect(motivosParaNoAplicar(con(SOLO(extra))).join()).toMatch(/la lanza Pablo/);
  });

  it("un comentario que simula la sentencia no tapa un grant por defecto de verdad", () => {
    const sql = SOLO(
      `-- ${TABLAS}`,
      `/* ${SECUENCIAS} */`,
      "alter default privileges for role postgres in schema public grant select on tables to anon;",
    );
    expect(motivosDePablo(sql)).not.toEqual([]);
  });

  it("un literal que simula la sentencia no tapa un grant por defecto de verdad", () => {
    const sql = SOLO(`comment on schema public is '${TABLAS}';`, "alter default privileges for role postgres in schema public grant select on tables to anon;");
    expect(motivosDePablo(sql)).not.toEqual([]);
  });

  it("un comentario que simula la sentencia no cuenta como sentencia (no hay nada que exigir)", () => {
    expect(motivosDePablo(SOLO(`-- ${TABLAS}`))).toEqual([]);
  });

  it("la lista blanca no relaja los demás motivos: con la opción de Pablo sigue valiendo lo de siempre", () => {
    expect(motivosParaNoAplicar(con(SOLO(TABLAS, "grant select on public.persona to anon;"), { pablo: true }))).toEqual([]);
  });
});
