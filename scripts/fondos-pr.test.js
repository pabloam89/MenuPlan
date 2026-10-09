import { describe, expect, it } from "vitest";

import { agentesDelPr, cierresDelPr, comprobar } from "./fondos-pr.mjs";
import { ErrorDeApi } from "./lib/ghApi.mjs";

// Sin red: la API es un par de funciones que devuelven issues de mentira.
const etiquetas = (...n) => n.map((name) => ({ name }));
const ficha = (d) => `\`\`\`fondo\n${Object.entries(d).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\`\`\`\n### Arreglo general`;
const DIAG = { estado: "diagnosticado", tipo_causa: "vigilante-hueco", alcance: "local", severidad: "medio", mecanismo: "El control solo corre si alguien lo lanza", causa_escape: "Ningún workflow reacciona" };
const ENCARGO = { number: 51, labels: etiquetas("tipo:encargo", "area:ops"), body: "" };
const FONDO = (body, extra = {}) => ({ number: 50, labels: etiquetas("tipo:fondo", "causa:vigilante-hueco", "area:ops"), created_at: "2026-10-12T10:00:00Z", body, ...extra });

const consultaDe = (tabla, padres = {}) => ({
  consultar: async (n) => tabla[n] ?? null,
  consultarPadre: async (n) => padres[n] ?? null,
});
const CUERPO = "Arregla.\n\nCloses #51\n\nAgente: gobierno\n\nCasos: ninguno — solo mueve ficheros de sitio\n";

describe("las líneas del cuerpo", () => {
  it("Agente: acepta mayúsculas, negrita, comillas y «sesion» sin tilde; ignora comentarios y bloques de código", () => {
    expect(agentesDelPr("Agente: Gobierno").lineas).toEqual(["gobierno"]);
    expect(agentesDelPr("**Agente:** `datos`").lineas).toEqual(["datos"]);
    expect(agentesDelPr("Agente: sesion").lineas).toEqual(["sesión"]);
    expect(agentesDelPr("<!-- Agente: el que lo construyó -->\nAgente: sesión").lineas).toEqual(["sesión"]);
    expect(agentesDelPr("```\nAgente: datos\n```").lineas).toEqual([]);
    expect(agentesDelPr("Agente: robot").malas).toEqual(["robot"]);
    expect(agentesDelPr("Agente:").malas).toEqual([""]);
  });
  it("Closes: close, closes, closed, fix, resolves…, sin repetir y sin contar los comentarios de la plantilla", () => {
    expect(cierresDelPr("Closes #5\nfixes #6\nResolved: #7\nCloses #5")).toEqual([5, 6, 7]);
    expect(cierresDelPr("<!-- «Closes #n» por cada encargo -->\nCloses #")).toEqual([]);
    expect(cierresDelPr("no cierra: ver #9 y PR #10")).toEqual([]);
  });
});

describe("scripts/fondos-pr.mjs: el PR y su problema de fondo (#337)", () => {
  it("un PR completo, cuyo encargo cuelga de un fondo con diagnóstico, vale", async () => {
    const r = await comprobar({ cuerpo: CUERPO, rama: "ops/51-algo", ...consultaDe({ 51: ENCARGO }, { 51: FONDO(ficha(DIAG)) }) });
    expect(r.ok).toBe(true);
    expect(r.motivo).toMatch(/Agente: gobierno; Closes #51/);
  });

  it("sin Agente: falla y dice qué agentes valen", async () => {
    const r = await comprobar({ cuerpo: "Closes #51\n", ...consultaDe({ 51: ENCARGO }, {}) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/falta la línea «Agente: <nombre>»[\s\S]*gobierno/);
  });

  it("un agente que no existe, falla", async () => {
    const r = await comprobar({ cuerpo: "Agente: robot", ...consultaDe({}) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/«Agente: robot» no es un agente/);
  });

  it("la rama es de un issue y el PR no lo cierra, falla; con otro Closes distinto, también", async () => {
    const sin = await comprobar({ cuerpo: "Agente: gobierno", rama: "ops/337-esquema-fondo", ...consultaDe({}) });
    expect(sin.ok).toBe(false);
    expect(sin.motivo).toMatch(/la rama es del issue #337: pon «Closes #337»/);
    const otro = await comprobar({ cuerpo: "Agente: gobierno\nCloses #51", rama: "ops/337-esquema-fondo", ...consultaDe({ 51: ENCARGO }, {}) });
    expect(otro.ok).toBe(false);
  });

  it("una rama sin número de issue no exige Closes", async () => {
    expect((await comprobar({ cuerpo: "Agente: sesión", rama: "fix/algo-sin-numero", ...consultaDe({}) })).ok).toBe(true);
  });

  it("un encargo cuyo fondo no tiene diagnóstico, falla (sin diagnóstico no hay encargos)", async () => {
    const sinMecanismo = { ...DIAG };
    delete sinMecanismo.mecanismo;
    const r = await comprobar({ cuerpo: CUERPO, ...consultaDe({ 51: ENCARGO }, { 51: FONDO(ficha(sinMecanismo)) }) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/su fondo #50 no tiene diagnóstico \(falta mecanismo\)/);
  });

  it("un encargo cuyo fondo nuevo no tiene ficha, falla; si el fondo es anterior a la ficha, no se exige", async () => {
    const nuevo = await comprobar({ cuerpo: CUERPO, ...consultaDe({ 51: ENCARGO }, { 51: FONDO("### Arreglo general") }) });
    expect(nuevo.ok).toBe(false);
    expect(nuevo.motivo).toMatch(/no tiene ficha/);
    const viejo = await comprobar({ cuerpo: CUERPO, ...consultaDe({ 51: ENCARGO }, { 51: FONDO("### Arreglo general", { created_at: "2026-10-01T00:00:00Z" }) }) });
    expect(viejo.ok).toBe(true);
  });

  it("la ficha del fondo con errores de forma, falla", async () => {
    const r = await comprobar({ cuerpo: CUERPO, ...consultaDe({ 51: ENCARGO }, { 51: FONDO(ficha({ ...DIAG, estado: "hackeado" })) }) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/ficha de su fondo #50 tiene errores/);
  });

  it("un encargo suelto (sin fondo) pasa", async () => {
    expect((await comprobar({ cuerpo: CUERPO, ...consultaDe({ 51: ENCARGO }, {}) })).ok).toBe(true);
  });

  it("cerrar un FONDO con el PR exige aprendizaje en su ficha", async () => {
    const cuerpo = "Closes #50\nAgente: gobierno";
    const sin = await comprobar({ cuerpo, ...consultaDe({ 50: FONDO(ficha(DIAG)) }) });
    expect(sin.ok).toBe(false);
    expect(sin.motivo).toMatch(/no tiene «aprendizaje»[\s\S]*sin él no se cierra[\s\S]*cierra el encargo, no el fondo/);
    const con = await comprobar({ cuerpo, ...consultaDe({ 50: FONDO(ficha({ ...DIAG, aprendizaje: "Test nuevo en fondos.test.js" })) }) });
    expect(con.ok).toBe(true);
    const ninguno = await comprobar({ cuerpo, ...consultaDe({ 50: FONDO(ficha({ ...DIAG, aprendizaje: "ninguno" })) }) });
    expect(ninguno.ok).toBe(false);
  });

  it("cerrar un fondo anterior a la ficha y sin ella no se exige", async () => {
    const r = await comprobar({ cuerpo: "Closes #50\nAgente: gobierno", ...consultaDe({ 50: FONDO("### Arreglo general", { created_at: "2026-10-01T00:00:00Z" }) }) });
    expect(r.ok).toBe(true);
  });

  it("un Closes de un issue que no existe, o de un PR, falla", async () => {
    expect((await comprobar({ cuerpo: "Closes #404\nAgente: sesión", ...consultaDe({}) })).motivo).toMatch(/«Closes #404»: ese issue no existe/);
    expect((await comprobar({ cuerpo: "Closes #8\nAgente: sesión", ...consultaDe({ 8: { number: 8, labels: [], pull_request: {} } }) })).motivo).toMatch(/#8» es un PR/);
  });

  it("los PR de un bot están exentos", async () => {
    expect((await comprobar({ cuerpo: "", autor: "dependabot[bot]", ...consultaDe({}) })).ok).toBe(true);
    expect((await comprobar({ cuerpo: "", autor: "github-actions[bot]", ...consultaDe({}) })).ok).toBe(true);
  });

  it("con la API caída FALLA con la causa, no pasa en silencio", async () => {
    const caida = { consultar: async () => { throw new ErrorDeApi("GET /issues/51: HTTP 502"); }, consultarPadre: async () => null };
    const r = await comprobar({ cuerpo: CUERPO, ...caida });
    expect(r.ok).toBe(false);
    expect(r.api).toBe(true);
    expect(r.motivo).toMatch(/HTTP 502[\s\S]*relanza/);
  });

  it("un 401 dice que es del token y que relanzar no sirve", async () => {
    const sinPermiso = { consultar: async () => { throw new ErrorDeApi("HTTP 401", { permisos: true }); }, consultarPadre: async () => null };
    const r = await comprobar({ cuerpo: CUERPO, ...sinPermiso });
    expect(r.motivo).toMatch(/rechaza el token[\s\S]*ni sirve relanzar[\s\S]*issues: read/);
  });

  it("si falla al leer el PADRE del encargo, también falla cerrado", async () => {
    const r = await comprobar({ cuerpo: CUERPO, consultar: async () => ENCARGO, consultarPadre: async () => { throw new ErrorDeApi("GET /issues/51/parent: HTTP 503"); } });
    expect(r.ok).toBe(false);
    expect(r.api).toBe(true);
  });

  it("más de 20 cierres o un número descomunal se rechazan antes de llamar a la API", async () => {
    const nunca = { consultar: async () => { throw new Error("no debería llamarse"); }, consultarPadre: async () => null };
    const lista = Array.from({ length: 21 }, (_, i) => `Closes #${i + 1}`).join("\n");
    expect((await comprobar({ cuerpo: `${lista}\nAgente: sesión`, ...nunca })).ok).toBe(false);
    expect((await comprobar({ cuerpo: "Closes #99999999\nAgente: sesión", ...nunca })).ok).toBe(false);
  });

  it("un cuerpo hostil no lanza ni tarda", async () => {
    const t0 = Date.now();
    const cuerpo = `${"Closes #1\n".repeat(3)}${"Agente: ".repeat(5000)}${"x".repeat(1_000_000)}`;
    const r = await comprobar({ cuerpo, ...consultaDe({}) });
    expect(r.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
