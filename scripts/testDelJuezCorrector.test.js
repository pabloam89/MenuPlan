import { describe, expect, it } from "vitest";
import { corregirPorClaves, extraerJson, leerFichero, leerRespuestaDelJuez, promptCaso, repararCadenas } from "./lib/testDelJuez.mjs";
import { leerRegistro } from "./lib/normas.mjs";
import { RAIZ } from "./lib/skills.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// El instrumento del test del juez (#698): leer lo que responde el juez y decidir, sin modelo, si dijo el defecto.
// Los hallazgos son los reales de la segunda tanda de pago (fixture sin claves).
const fx = JSON.parse(readFileSync(join(RAIZ, "scripts/fixtures/test-del-juez-pasada-2.json"), "utf8")).casos;
const malos = leerFichero("revisor", RAIZ).casos.filter((c) => c.tipo === "malo");

describe("leer la respuesta del juez", () => {
  const base = { veredicto: "senala", hallazgos: ["uno"] };
  const crudo = JSON.stringify(base);

  it("extrae el JSON con vallas, prosa alrededor o sin cerrar la valla (JSON.parse a secas falla)", () => {
    expect(() => JSON.parse("```json\n" + crudo + "\n```")).toThrow();
    for (const t of [crudo, "```json\n" + crudo + "\n```", "Aquí va: " + crudo + " Espero que sirva.", "```\n" + crudo]) {
      expect(extraerJson(t, "veredicto")).toEqual(base);
    }
  });

  it("repara escapes inválidos (\\' y barras sueltas) sin perder el texto", () => {
    const ilegible = String.raw`{"veredicto":"senala","hallazgos":["la funci\'on \d de C:\dir"]}`;
    expect(() => JSON.parse(ilegible)).toThrow(/escaped|position/i);
    const r = extraerJson(ilegible, "veredicto");
    expect(r.veredicto).toBe("senala");
    expect(r.hallazgos[0]).toBe(String.raw`la funci'on \d de C:\dir`);
  });

  it("repara un salto de línea crudo en una cadena y no toca las barras válidas", () => {
    expect(JSON.parse(repararCadenas('{"a":"x\ny","b":"c\\n"}'))).toEqual({ a: "x\ny", b: "c\n" });
  });

  it("una respuesta cortada o sin JSON no inventa nada; la clave elige el objeto", () => {
    expect(extraerJson('{"veredicto":"senala","hallazgos":["se cortó')).toBeNull();
    expect(extraerJson("sin llaves")).toBeNull();
    expect(extraerJson('{"otro":1} y {"veredicto":"aprueba","hallazgos":[]}', "veredicto")).toEqual({ veredicto: "aprueba", hallazgos: [] });
    expect(leerRespuestaDelJuez("nada")).toMatchObject({ veredicto: null, hallazgos: [] });
    expect(leerRespuestaDelJuez('{"veredicto":"senala","hallazgos":"uno solo"}').hallazgos).toEqual(["uno solo"]);
  });
});

describe("el corrector determinista (claves_senal)", () => {
  it("acepta los 12 hallazgos reales que dicen el defecto (el corrector de modelo aceptó 8)", () => {
    expect(fx.map((x) => x.id).sort()).toEqual(malos.map((c) => c.id).sort());
    expect(fx.filter((x) => x.resultado_de_pago === "ok")).toHaveLength(8);
    for (const c of malos) expect(corregirPorClaves(c, fx.find((x) => x.id === c.id).hallazgos), c.id).toBe(true);
  });

  it("no acepta el hallazgo de otro defecto: ninguna de las 132 combinaciones cruzadas pasa", () => {
    for (const c of malos) for (const x of fx.filter((y) => y.id !== c.id)) expect(corregirPorClaves(c, x.hallazgos), `${c.id} con ${x.id}`).toBe(false);
  });

  it("exige todos los grupos en un mismo hallazgo; sin hallazgos o sin claves, no acepta", () => {
    const c = { claves_senal: [["alfa"], ["beta", "gamma"]] };
    expect(corregirPorClaves(c, ["Alfa y GAMMA"])).toBe(true);
    expect(corregirPorClaves(c, ["alfa", "beta"])).toBe(false);
    expect(corregirPorClaves(c, [])).toBe(false);
    expect(corregirPorClaves({}, ["alfa beta"])).toBe(false);
  });
});

describe("quitar-permiso: el juez ve la condición de la norma", () => {
  it("el prompt incluye «cuando amplía…», que antes se perdía y hacía exigir el OK a un cambio que solo restringe", () => {
    const norma = leerRegistro(RAIZ).normas.find((n) => n.id === "permisos-ok-pablo");
    const t = promptCaso({ titulo: "t", diff: "d" }, norma);
    expect(t).toContain(norma.condicion);
    expect(t).toMatch(/debe cuando amplía/);
  });
});
