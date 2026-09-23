import { describe, it, expect } from "vitest";
import { cors, isCrossOrigin } from "./_guard.js";

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
