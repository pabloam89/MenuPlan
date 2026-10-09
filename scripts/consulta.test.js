import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { motivoParaNoLeer } from "./lib/consulta.mjs";

describe("npm run consulta solo lee", () => {
  it("deja pasar lecturas", () => {
    for (const q of [
      "select count(*) from households",
      "with x as (select 1) select * from x;",
      "show log_min_messages",
      "select 'delete from x' as texto", // la palabra va dentro de un texto
      "-- update en un comentario\nselect 1",
    ]) expect(motivoParaNoLeer(q), q).toBe(null);
  });

  it("para escrituras, varias sentencias y lo que no es lectura", () => {
    expect(motivoParaNoLeer("delete from households")).toMatch(/Solo lectura/);
    expect(motivoParaNoLeer("select 1; delete from households")).toMatch(/Una sola sentencia/);
    expect(motivoParaNoLeer("with b as (delete from households returning *) select * from b")).toMatch(/escribe/);
    expect(motivoParaNoLeer("select set_config('x','y',false); update t set a=1")).toMatch(/Una sola sentencia/);
    expect(motivoParaNoLeer("")).toMatch(/vacía/);
  });

  it("el truco del juez del PR #223: un -- dentro de una cadena no esconde lo que viene después", () => {
    expect(motivoParaNoLeer("select '--'; commit; begin read write; delete from households; commit")).not.toBe(null);
    expect(motivoParaNoLeer("select '/*'; delete from households; select '*/'")).not.toBe(null);
    expect(motivoParaNoLeer("select $$--$$; commit")).not.toBe(null);
    expect(motivoParaNoLeer("select 'it''s'; commit")).not.toBe(null);
  });

  it("para lo que read only no impide: señales, replicación, sesión, red", () => {
    for (const q of [
      "select pg_terminate_backend(pid) from pg_stat_activity",
      "select pg_create_physical_replication_slot('x', true)",
      "select set_config('role','postgres',false)",
      "select pg_advisory_lock(1)",
      "select net.http_get('https://x')",
      "select cron.schedule('x','* * * * *','select 1')",
    ]) expect(motivoParaNoLeer(q), q).not.toBe(null);
  });

  it("las tres formas de esconder una función del re-juicio del PR #223", () => {
    for (const q of [
      "select E'\\'' as a, pg_sleep(0)::text as b --'",
      'select "pg_sleep"(0)::text',
      "select 1 as x$$, pg_sleep(0)::text as y$$",
      // Tercer juicio: un nombre con escape Unicode y SQL armado desde un texto.
      `select U&"pg!005fsleep" UESCAPE '!' (0)::text as b`,
      "select query_to_xml('select pg_' || 'sleep(0)::text as b', true, false, '')::text",
    ]) expect(motivoParaNoLeer(q), q).not.toBe(null);
  });

  it("case … end y explain analyze son lecturas", () => {
    expect(motivoParaNoLeer("select case when 1 = 1 then 'a' end")).toBe(null);
    expect(motivoParaNoLeer("explain analyze select 1")).toBe(null);
  });

  it("el script manda la consulta por el protocolo extendido, que no admite varias sentencias", () => {
    const fuente = readFileSync(new URL("./consulta.mjs", import.meta.url), "utf8");
    expect(fuente).toMatch(/client\.query\(\{ text: sql, values: \[\] \}\)/);
  });

  it("los permisos dejan lanzarla sin preguntar, y la autorización está escrita", () => {
    const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8"));
    expect(settings.permissions.allow).toContain("Bash(npm run *)");
    const claude = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
    expect(claude).toMatch(/Autorizado de forma permanente/);
    expect(claude).toMatch(/npm run consulta/);
  });
});
