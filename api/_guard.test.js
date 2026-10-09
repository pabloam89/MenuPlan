import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { cors, isCrossOrigin, globalLimit, dailyBudget, topeDiario, TOPE_DIARIO_POR_DEFECTO } from "./_guard.js";
import { MOTIVOS_TOPE_DIARIO } from "../src/lib/vocabularios.js";

// Tope diario de IA: falla CERRADO y nunca queda «sin tope» por falta de variable.
describe("dailyBudget", () => {
  const redisDe = (incr) => ({ incr, expire: async () => 1 });
  const callado = async (fn) => {
    const quieto = console.warn;
    const lineas = [];
    console.warn = (l) => lineas.push(l);
    try {
      return { r: await fn(), lineas };
    } finally {
      console.warn = quieto;
    }
  };

  it("sin variable usa el tope por defecto, no «sin tope»", async () => {
    expect(topeDiario("generate", {})).toBe(TOPE_DIARIO_POR_DEFECTO.generate);
    expect(topeDiario("recipe-steps", { AI_DAILY_BUDGET_RECIPE_STEPS: "abc" })).toBe(TOPE_DIARIO_POR_DEFECTO["recipe-steps"]);
    expect(topeDiario("recipe-steps", { AI_DAILY_BUDGET_RECIPE_STEPS: "0" })).toBe(TOPE_DIARIO_POR_DEFECTO["recipe-steps"]);
    expect(topeDiario("dish-photo", { AI_DAILY_BUDGET_DISH_PHOTO: "7" })).toBe(7);
    let n = 0;
    const redis = redisDe(async () => ++n);
    const { r } = await callado(async () => {
      const oks = [];
      for (let i = 0; i < 3; i++) oks.push((await dailyBudget("dish-photo", { redis, env: { AI_DAILY_BUDGET_DISH_PHOTO: "2" } })).ok);
      return oks;
    });
    expect(r).toEqual([true, true, false]);
  });

  it("sin Redis, o con Redis fallando, no deja pasar y deja una línea contable", async () => {
    const sin = await callado(() => dailyBudget("generate", { redis: null, env: {} }));
    expect(sin.r).toEqual({ ok: false, motivo: "sin_redis" });
    const roto = await callado(() => dailyBudget("generate", { redis: redisDe(async () => { throw new Error("caído"); }), env: {} }));
    expect(roto.r).toEqual({ ok: false, motivo: "error_redis" });
    let n = 100;
    const lleno = await callado(() => dailyBudget("generate", { redis: redisDe(async () => ++n), env: { AI_DAILY_BUDGET_GENERATE: "100" } }));
    expect(lleno.r).toEqual({ ok: false, motivo: "tope_alcanzado" });
    for (const { r, lineas } of [sin, roto, lleno]) {
      expect(MOTIVOS_TOPE_DIARIO).toContain(r.motivo);
      expect(lineas.map((l) => JSON.parse(l))).toEqual([{ tag: "tope_diario", bucket: "generate", motivo: r.motivo }]);
    }
  });

  it("un bucket sin IA y sin variable no se cuenta", async () => {
    expect(await dailyBudget("track", { redis: null, env: {} })).toEqual({ ok: true });
  });

  // La clase, no el caso: todo endpoint de api/ que llama a un modelo y pasa
  // por blocked() tiene su tope por defecto.
  it("cada endpoint con IA tiene tope diario por defecto", () => {
    const dir = new URL("./", import.meta.url);
    const conIA = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".js") && !x.endsWith(".test.js"))) {
      const src = readFileSync(new URL(f, dir), "utf8");
      if (!/api\.anthropic\.com|GoogleGenAI/.test(src)) continue;
      const m = src.match(/blocked\(req, res, \{ bucket: "([^"]+)"/);
      if (!m) continue;
      conIA.push(m[1]);
      expect(TOPE_DIARIO_POR_DEFECTO[m[1]], `${f} (${m[1]}) sin tope por defecto`).toBeGreaterThan(0);
    }
    expect(conIA.sort()).toEqual(Object.keys(TOPE_DIARIO_POR_DEFECTO).sort());
  });
});

// Tope de gasto (el turno con modelo del canario, #267): falla CERRADO.
describe("globalLimit", () => {
  const opciones = { bucket: "prueba", limit: 2, windowSec: 60 };
  const redisDe = (incr) => ({ incr, expire: async () => 1 });

  it("cuenta para todos y corta pasado el límite", async () => {
    let n = 0;
    const redis = redisDe(async () => ++n);
    const r = [];
    for (let i = 0; i < 3; i++) r.push((await globalLimit(opciones, { redis })).ok);
    expect(r).toEqual([true, true, false]);
  });

  it("sin Redis, o con Redis fallando, no deja pasar", async () => {
    const quieto = console.warn;
    console.warn = () => {};
    try {
      expect(await globalLimit(opciones, { redis: null })).toEqual({ ok: false, motivo: "sin_redis" });
      expect(await globalLimit(opciones, { redis: redisDe(async () => { throw new Error("caído"); }) })).toEqual({ ok: false, motivo: "error_redis" });
    } finally {
      console.warn = quieto;
    }
  });
});

function fakeRes() {
  const res = { headers: {}, statusCode: null, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

const req = (origin, method = "POST", host = "homenu.vercel.app") => ({
  method,
  headers: { ...(origin ? { origin } : {}), host },
});

describe("cors", () => {
  it("no toca las peticiones de la web", () => {
    const res = fakeRes();
    expect(cors(req("https://homenu.vercel.app"), res)).toBe(false);
    expect(res.headers).toEqual({});
  });

  it("no da CORS a un origen ajeno, ni en el preflight", () => {
    const res = fakeRes();
    expect(cors(req("https://evil.example", "OPTIONS"), res)).toBe(false);
    expect(res.headers).toEqual({});
  });

  it("responde el preflight de la app iOS con 204", () => {
    const res = fakeRes();
    expect(cors(req("capacitor://localhost", "OPTIONS"), res)).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(res.headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  it("deja seguir el POST de la app iOS con la cabecera de origen", () => {
    const res = fakeRes();
    expect(cors(req("capacitor://localhost"), res)).toBe(false);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
  });
});

describe("isCrossOrigin", () => {
  it("permite el mismo dominio y la app iOS", () => {
    expect(isCrossOrigin(req("https://homenu.vercel.app"))).toBe(false);
    expect(isCrossOrigin(req("capacitor://localhost"))).toBe(false);
  });

  it("sigue bloqueando otros orígenes", () => {
    expect(isCrossOrigin(req("https://evil.example"))).toBe(true);
    expect(isCrossOrigin(req("capacitor://evil"))).toBe(true);
  });
});
