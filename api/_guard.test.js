import { describe, it, expect } from "vitest";
import { cors, isCrossOrigin, globalLimit } from "./_guard.js";

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
