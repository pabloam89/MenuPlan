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

  it("los permisos dejan lanzarla sin preguntar, y la autorización está escrita", () => {
    const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8"));
    expect(settings.permissions.allow).toContain("Bash(npm run *)");
    const claude = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
    expect(claude).toMatch(/Autorizado de forma permanente/);
    expect(claude).toMatch(/npm run consulta/);
  });
});
