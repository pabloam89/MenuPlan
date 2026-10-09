import { describe, expect, it } from "vitest";

import { analizarCasos } from "./casos.mjs";

const MOTIVO = "solo mueve ficheros de sitio, no se ha visto ningún fallo";

describe("la línea «Casos:» del PR (#185)", () => {
  it.each([
    ["Closes #1\n\nCasos: #301", [301]],
    ["Casos: #301, #305", [301, 305]],
    ["Casos: #301 y #305", [301, 305]],
    ["Casos: #301; #305.", [301, 305]],
    ["**Casos:** #12", [12]],
    ["- Casos: #12", [12]],
    ["casos: #12\nCasos: #12, #13", [12, 13]],
  ])("vale: %j", (cuerpo, numeros) => {
    const r = analizarCasos(cuerpo);
    expect(r.valida).toBe(true);
    expect(r.numeros).toEqual(numeros);
    expect(r.ninguno).toBe(false);
  });

  it.each([`Casos: ninguno — ${MOTIVO}`, `Casos: ninguno - ${MOTIVO}.`, `Casos: Ninguno: ${MOTIVO}`])("«ninguno» con motivo vale: %s", (c) => {
    const r = analizarCasos(c);
    expect(r.valida).toBe(true);
    expect(r.ninguno).toBe(true);
  });

  // Lo que hay que ver fallar: cada puerta cerrada es un hueco por el que se colaba el paso.
  it.each([
    ["sin la línea", "Closes #1\nAgente: sesión"],
    ["vacía", "Casos:"],
    ["vacía con la plantilla", "Casos:   \n\nRunbook: sin novedades"],
    ["ninguno a secas", "Casos: ninguno"],
    ["ninguno con «n/a»", "Casos: ninguno — n/a"],
    ["ninguno con motivo corto", "Casos: ninguno — nada"],
    ["ninguno con cuatro palabras sueltas y cortas", "Casos: ninguno — no hay nada que ver"],
    ["ninguno con pocas palabras", "Casos: ninguno — noseguntalcomoyquetal123"],
    ["texto que no es número", "Casos: varios"],
    ["número sin almohadilla", "Casos: 301"],
    ["números con cola", "Casos: #301 más cosas que no son números"],
    ["ninguno y números a la vez", `Casos: #301\nCasos: ninguno — ${MOTIVO}`],
    ["una buena y otra rota", "Casos: #301\nCasos: "],
  ])("no vale: %s", (_, cuerpo) => {
    const r = analizarCasos(cuerpo);
    expect(r.valida).toBe(false);
    expect(r.motivo).toMatch(/Casos/);
  });

  it("ni los comentarios de la plantilla ni los bloques de código cuentan", () => {
    expect(analizarCasos("<!-- Casos: #1 -->\nCloses #2").valida).toBe(false);
    expect(analizarCasos("```\nCasos: #1\n```\n").valida).toBe(false);
    expect(analizarCasos("<!-- explica -->\nCasos: #7\n").numeros).toEqual([7]);
  });

  describe("dentro de un comando (la guardia)", () => {
    const cmd = (c) => analizarCasos(c, { enComando: true });
    it("--body entre comillas, en una línea", () => {
      expect(cmd('gh pr create --body "Closes #1. Casos: #301"').numeros).toEqual([301]);
      expect(cmd(`gh pr create --body "Casos: ninguno — ${MOTIVO}"`).ninguno).toBe(true);
    });
    it("heredoc", () => {
      expect(cmd("gh pr create --body \"$(cat <<'EOF'\nCloses #1\nCasos: #301, #302\nEOF\n)\"").numeros).toEqual([301, 302]);
    });
    it("sin la línea o con un motivo corto, no", () => {
      expect(cmd('gh pr create --body "hecho"').valida).toBe(false);
      expect(cmd('gh pr create --body "Casos: ninguno — x"').valida).toBe(false);
    });
  });
});
