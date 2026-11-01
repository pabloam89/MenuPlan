/**
 * «La función no existe» (una migración sin aplicar) se reconoce en un solo sitio: el juez de #1105 (C14) vio el
 * código escrito a mano en cuatro ficheros.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { esSinFuncion, PGRST_SIN_FUNCION, PG_SIN_FUNCION } from "./postgrest.js";

describe("la función no existe", () => {
  it("lo dicen PostgREST (PGRST202) y Postgres (42883); otro error, no", () => {
    expect(esSinFuncion({ code: PGRST_SIN_FUNCION })).toBe(true);
    expect(esSinFuncion({ code: PG_SIN_FUNCION })).toBe(true);
    expect(esSinFuncion({ code: "42501" })).toBe(false);
    expect(esSinFuncion(null)).toBe(false);
  });

  it("los códigos se escriben solo en postgrest.js", () => {
    const fuera = execFileSync("git", ["grep", "-l", "-e", "\"PGRST202\"", "-e", "\"42883\"", "--", "src", "api", ":!*.test.*"], { encoding: "utf8" })
      .split("\n").filter(Boolean);
    expect(fuera).toEqual(["src/lib/postgrest.js"]);
  });
});
