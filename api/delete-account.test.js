import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const orden = [];
vi.mock("./_bot/borrar.js", () => ({ borrarLoDelBot: vi.fn(async () => { orden.push("bot"); return { casas: 0 }; }) }));

const { default: handler } = await import("./delete-account.js");

const respuesta = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
};
const peticion = () => ({ method: "POST", headers: { authorization: "Bearer token-de-u1" } });

let prepara;
beforeEach(() => {
  orden.length = 0;
  process.env.VITE_SUPABASE_URL = "https://base";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_x";
  prepara = () => new Response(JSON.stringify({ pasadas: 1, borradas: 0, lectores: 0 }), { status: 200 });
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
    if (u.includes("/rpc/prepare_account_deletion")) { orden.push("heredar"); return prepara(); }
    if (u.includes("apple_auth_tokens")) { orden.push("apple"); return new Response("[]", { status: 200 }); }
    if (opts.method === "DELETE" && u.includes("/auth/v1/admin/users/u1")) { orden.push("borrar"); return new Response(null, { status: 200 }); }
    return new Response("[]", { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Eliminar cuenta y la casa de quien la lleva contigo", () => {
  it("primero se pasa la casa, luego lo del bot, y por último la cuenta", async () => {
    const res = respuesta();
    await handler(peticion(), res);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ ok: true, pasadas: 1, lectores: 0 });
    expect(orden.filter((x) => x !== "apple")).toEqual(["heredar", "bot", "borrar"]);
  });

  it("si no se puede pasar la casa, no se borra nada", async () => {
    prepara = () => new Response("boom", { status: 500 });
    const res = respuesta();
    await handler(peticion(), res);
    expect(res.code).toBe(500);
    expect(orden).toEqual(["heredar"]);
  });
});
