import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REGISTRO_CAMPOS } from "../src/lib/registroCampos.js";

/**
 * La 0097 (ficha de la casa): lo que no vigila principios.test.js.
 *  - Una sola lista de «campos con columna propia»: registro_campo.columna (REGISTRO_CAMPOS).
 *    Los dos case de ficha_casa (datos y faltan) y el trigger de sobre salen de ella.
 *  - ficha_casa, solo para la service role hasta que la app la lea.
 *  - sobre: topes y nombres.
 */
const sql = readFileSync(new URL("./migrations/0097_ficha_registro_sobre.sql", import.meta.url), "utf8");
const codigo = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

const conColumna = Object.entries(REGISTRO_CAMPOS).filter(([, c]) => c.columna).map(([id]) => id).sort();
const cuerpoFicha = codigo.slice(codigo.indexOf("create or replace function public.ficha_casa"));

describe("0097: los campos con columna propia, en un solo sitio", () => {
  it("hay campos con columna (si no, el test no prueba nada)", () => {
    expect(conColumna).toEqual(["alergias", "edad", "nacimiento"]);
  });

  it("el case de «datos» de ficha_casa lee exactamente esos campos", () => {
    const m = cuerpoFicha.match(/case s\.campo([\s\S]*?)else s\.valor end/);
    expect(m, "falta el case s.campo de datos").not.toBeNull();
    const cuando = [...m[1].matchAll(/when '(\w+)' then/g)].map((x) => x[1]).sort();
    expect(cuando).toEqual(conColumna);
  });

  it("el filtro de «faltan» de ficha_casa mira exactamente esos campos", () => {
    const m = cuerpoFicha.match(/select r\.id as campo[\s\S]*?union all/);
    expect(m, "falta la parte de persona de faltan").not.toBeNull();
    const ids = [...m[0].matchAll(/not \(r\.id = '(\w+)'/g)].map((x) => x[1]).sort();
    expect(ids).toEqual(conColumna);
  });

  it("el trigger de sobre rechaza un valor en un campo con columna", () => {
    expect(codigo).toMatch(/r\.columna is not null and new\.valor is not null/);
  });
});

describe("0097: permisos y topes", () => {
  it("ficha_casa solo se concede a service_role", () => {
    const grants = [...codigo.matchAll(/grant\s+execute\s+on\s+function\s+public\.ficha_casa[^;]*?\bto\s+([^;]*);/gi)].map((m) => m[1].trim());
    expect(grants).toEqual(["service_role"]);
    expect(codigo).toMatch(/revoke all on function public\.ficha_casa\([^)]*\) from public, anon, authenticated/);
  });

  it("el trigger de sobre pone tope de 200 caracteres a los textos", () => {
    expect(codigo).toMatch(/char_length\(t #>> '\{\}'\) > 200/);
  });

  it("sobre no tiene las columnas sin lector ni los nombres viejos", () => {
    const sobre = codigo.match(/create table if not exists public\.sobre \(([\s\S]*?)\n\);/)[1];
    const columna = (c) => new RegExp(String.raw`^\s+${c}\s`, "m");
    for (const c of ["frase", "rechazados", "preguntado", "quien_user", "fecha"]) expect(sobre, c).not.toMatch(columna(c));
    for (const c of ["dicho_by", "confirmado_at"]) expect(sobre, c).toMatch(columna(c));
  });
});
