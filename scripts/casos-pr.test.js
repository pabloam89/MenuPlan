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

  it("una línea de más de 2000 caracteres falla y dice cómo arreglarla", async () => {
    const r = await comprobar({ cuerpo: `Casos: #5 ${"x".repeat(2100)}`, consultar: consultaDe({ 5: CASO }) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/demasiado larga[\s\S]*lista de #n en una línea corta y los detalles en otra/);
  });

  // #856: un caso de otro repo de ops/entidades.json se consulta EN SU REPO; si el token no llega, aviso y no fallo.
  describe("casos de otro repo (#856)", () => {
    const REFS = { repoPropio: "pabloam89/MenuPlan", repos: { "pabloam89/MenuPlan": "homenu", "pabloam89/homenu-panel": "panel" } };
    it("cada referencia se pide en su repo, y #4 del panel no es el #4 propio", async () => {
      const pedidas = [];
      const consultar = async (n, repo) => {
        pedidas.push(`${repo}#${n}`);
        return repo === "pabloam89/homenu-panel" ? CASO : issue(["tipo:encargo"]);
      };
      const r = await comprobar({ cuerpo: "Casos: pabloam89/homenu-panel#4", consultar, refs: REFS });
      expect(r.ok).toBe(true);
      expect(pedidas).toEqual(["pabloam89/homenu-panel#4"]);
      const mal = await comprobar({ cuerpo: "Casos: #4, pabloam89/homenu-panel#4", consultar, refs: REFS });
      expect(mal.ok).toBe(false);
      expect(mal.motivo).toMatch(/#4 no es tipo:caso/);
      expect(mal.motivo).not.toMatch(/homenu-panel#4 no es/);
    });
    it("si el token no llega al otro repo (403 o 404), avisa y no falla; con el propio, falla como siempre", async () => {
      const sinAcceso = async (n, repo) => {
        if (repo === "pabloam89/homenu-panel") throw new ErrorDeApi(`GET /issues/${n}: HTTP 403`);
        return CASO;
      };
      const r = await comprobar({ cuerpo: "Casos: #5, pabloam89/homenu-panel#4", consultar: sinAcceso, refs: REFS });
      expect(r.ok).toBe(true);
      expect(r.avisos).toEqual([expect.stringMatching(/^pabloam89\/homenu-panel#4: el token no llega a ese repo/)]);
      const noLoVe = await comprobar({ cuerpo: "Casos: pabloam89/homenu-panel#4", consultar: async () => null, refs: REFS });
      expect(noLoVe.ok).toBe(true);
      expect(noLoVe.avisos).toHaveLength(1);
      expect((await comprobar({ cuerpo: "Casos: #4", consultar: async () => null, refs: REFS })).ok).toBe(false);
    });
    it("un repo que no está en ops/entidades.json (o con otras mayúsculas) falla sin llamar a la API", async () => {
      const nunca = async () => { throw new Error("no debería llamarse"); };
      for (const ref of ["otro/inventado#3", "PabloAM89/Homenu-Panel#4"]) {
        const r = await comprobar({ cuerpo: `Casos: ${ref}`, consultar: nunca, refs: REFS });
        expect(r.ok, ref).toBe(false);
        expect(r.motivo).toMatch(/no es un repo de ops\/entidades\.json/);
      }
    });
  });

  it("ninguno sin motivo, falla", async () => {
    expect((await comprobar({ cuerpo: "Casos: ninguno", consultar: consultaDe({}) })).ok).toBe(false);
  });

  it.each([
    ["no existe", {}, /#5 no existe/],
    ["es un PR", { 5: issue(["tipo:caso", "analisis:nuevo"], { pull_request: {} }) }, /es un PR[\s\S]*escríbela sin # \(por ejemplo PR 15, issue 15\)/],
    ["no es tipo:caso", { 5: issue(["tipo:encargo", "area:ops"]) }, /no es tipo:caso[\s\S]*#5 aparece en la línea Casos: pero no es un caso[\s\S]*escríbela sin #/],
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

  it("un 401 da un mensaje propio de permisos, sin «relanza»", async () => {
    const consultar = async () => {
      throw new ErrorDeApi("HTTP 401", { permisos: true });
    };
    const r = await comprobar({ cuerpo: "Casos: #5", consultar });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/rechaza el token[\s\S]*issues: read/);
    expect(r.motivo).toMatch(/ni sirve relanzar/);
  });

  // Mismo criterio que la guardia: el texto tras la lista se admite y solo cuentan los números.
  it("texto tras la lista: el CI lo admite y verifica TODOS los #n de la línea", async () => {
    const pedidos = [];
    const consultar = async (n) => (pedidos.push(n), CASO);
    const r = await comprobar({ cuerpo: "Casos: #5 (el test rojo de #99)", consultar });
    expect(r.ok).toBe(true);
    expect(pedidos).toEqual([5, 99]);
  });

  it.each(["Casos: #5 #6", "Casos: #5, y #6"])("un hueco en la lista no deja números sin verificar: %s", async (cuerpo) => {
    const r = await comprobar({ cuerpo, consultar: consultaDe({ 5: CASO, 6: issue(["tipo:decision"]) }) });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/#6/);
  });

  it("más de 20 casos o un número descomunal se rechazan antes de llamar a la API", async () => {
    const consultar = async () => {
      throw new Error("no debería llamarse");
    };
    const lista = Array.from({ length: 21 }, (_, i) => `#${i + 1}`).join(", ");
    expect((await comprobar({ cuerpo: `Casos: ${lista}`, consultar })).ok).toBe(false);
    expect((await comprobar({ cuerpo: "Casos: #99999999", consultar })).ok).toBe(false);
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

  it("un 401 no se reintenta y queda marcado como de permisos", async () => {
    let llamadas = 0;
    const consultar = consultaReal({ token: "t", repo: "a/b", fetchFn: async () => (llamadas++, respuesta(401)), espera: sinEspera });
    await expect(consultar(5)).rejects.toMatchObject({ permisos: true });
    expect(llamadas).toBe(1);
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
