import { describe, expect, it } from "vitest";

import { ErrorDeApi, comprobar, consultaReal, falloDeCaso } from "./casos-pr.mjs";

// Sin red: la API es una función que devuelve issues de mentira.
const issue = (labels, extra = {}) => ({ labels: labels.map((name) => ({ name })), ...extra });
const CASO = issue(["tipo:caso", "analisis:abierto", "area:ops"]);
const MOTIVO = "solo mueve ficheros de sitio, no se ha visto ningún fallo";

const consultaDe = (tabla) => async (n) => tabla[n] ?? null;

describe("scripts/casos-pr.mjs: la línea «Casos:» en el CI (#185)", () => {
  it("un caso analizado vale", async () => {
    const r = await comprobar({ cuerpo: "Casos: #5", consultar: consultaDe({ 5: CASO }) });
    expect(r.ok).toBe(true);
  });

  it("«ninguno» con motivo vale sin llamar a la API", async () => {
    const consultar = async () => {
      throw new Error("no debería llamarse");
    };
    expect((await comprobar({ cuerpo: `Casos: ninguno — ${MOTIVO}`, consultar })).ok).toBe(true);
  });

  it("sin la línea, falla y dice qué escribir", async () => {
    const r = await comprobar({ cuerpo: "Closes #1", consultar: consultaDe({}) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/Falta la línea «Casos:»[\s\S]*Casos: #n, #m/);
  });

  it("ninguno sin motivo, falla", async () => {
    expect((await comprobar({ cuerpo: "Casos: ninguno", consultar: consultaDe({}) })).ok).toBe(false);
  });

  it.each([
    ["no existe", {}, /#5 no existe/],
    ["es un PR", { 5: issue(["tipo:caso", "analisis:nuevo"], { pull_request: {} }) }, /es un PR/],
    ["no es tipo:caso", { 5: issue(["tipo:encargo", "area:ops"]) }, /no es tipo:caso/],
    ["sin analisis", { 5: issue(["tipo:caso", "area:ops"]) }, /no tiene etiqueta analisis/],
    ["dos analisis", { 5: issue(["tipo:caso", "analisis:nuevo", "analisis:abierto"]) }, /más de un analisis/],
    ["analisis inventado", { 5: issue(["tipo:caso", "analisis:quiensabe"]) }, /no es de la lista/],
  ])("un #n que %s, falla", async (_, tabla, esperado) => {
    const r = await comprobar({ cuerpo: "Casos: #5", consultar: consultaDe(tabla) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(esperado);
  });

  it("de dos, uno malo basta para fallar y se nombra", async () => {
    const r = await comprobar({ cuerpo: "Casos: #5, #6", consultar: consultaDe({ 5: CASO, 6: issue(["tipo:decision"]) }) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/#6/);
    expect(r.motivo).not.toMatch(/#5 /);
  });

  it("los PR de un bot están exentos", async () => {
    expect((await comprobar({ cuerpo: "", autor: "dependabot[bot]", consultar: consultaDe({}) })).ok).toBe(true);
  });

  it("con la API caída FALLA con la causa, no pasa en silencio", async () => {
    const consultar = async () => {
      throw new ErrorDeApi("HTTP 502");
    };
    const r = await comprobar({ cuerpo: "Casos: #5", consultar });
    expect(r.ok).toBe(false);
    expect(r.api).toBe(true);
    expect(r.motivo).toMatch(/HTTP 502[\s\S]*relanza/);
  });

  it("falloDeCaso acepta las etiquetas como texto o como objeto", () => {
    expect(falloDeCaso(1, { labels: ["tipo:caso", "analisis:puntual"] })).toBeNull();
  });
});

describe("consultaReal: reintentos", () => {
  const respuesta = (status, cuerpo = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo });
  const sinEspera = async () => {};

  it("reintenta un 502 y acaba bien", async () => {
    const respuestas = [respuesta(502), respuesta(200, { number: 5 })];
    const consultar = consultaReal({ token: "t", repo: "a/b", fetchFn: async () => respuestas.shift(), espera: sinEspera });
    expect(await consultar(5)).toEqual({ number: 5 });
    expect(respuestas).toHaveLength(0);
  });

  it("un 404 es «no existe», sin reintentar", async () => {
    let llamadas = 0;
    const consultar = consultaReal({ token: "t", repo: "a/b", fetchFn: async () => (llamadas++, respuesta(404)), espera: sinEspera });
    expect(await consultar(5)).toBeNull();
    expect(llamadas).toBe(1);
  });

  it("si siempre falla, ErrorDeApi con la causa", async () => {
    const consultar = consultaReal({ token: "t", repo: "a/b", fetchFn: async () => respuesta(403), espera: sinEspera });
    await expect(consultar(5)).rejects.toThrow(/HTTP 403/);
  });

  it("un error de red también", async () => {
    const consultar = consultaReal({
      token: "t",
      repo: "a/b",
      fetchFn: async () => {
        throw new Error("fetch failed");
      },
      espera: sinEspera,
    });
    await expect(consultar(5)).rejects.toBeInstanceOf(ErrorDeApi);
  });
});
