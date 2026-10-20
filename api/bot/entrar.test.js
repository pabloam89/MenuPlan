/**
 * api/bot/entrar.js: la llave de Lola. Con un código `entrar`, la cuenta ya
 * existe; con uno `alta` (el saludo, 0084), se crea al abrir la app; con la
 * firma de un botón de login de Telegram, entra quien lo pulsó.
 */
import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ codigos: {}, viejos: [], deOtra: false, nacida: null }));

// El `cors` es el de verdad (lo que se prueba es que el endpoint lo llame); el límite de ritmo, no.
vi.mock("../_guard.js", async (original) => ({ ...(await original()), rateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("../_bot/db.js", () => ({
  config: () => ({ url: "https://base", headers: {} }),
  select: vi.fn(async () => t.viejos),
  eq: (x) => x,
}));
vi.mock("../_bot/enlace.js", () => ({ gastarCodigo: vi.fn(async (c, tipo) => t.codigos[`${tipo}:${c}`] ?? null) }));
vi.mock("../_bot/cuentas.js", () => ({
  tokenHashDe: vi.fn(async (email) => `hash-${email}`),
  emailSintetico: (id) => `tg${id}@bot`,
  cuentaNacidaAqui: vi.fn(async () => t.nacida),
}));
vi.mock("../_bot/altaTelegram.js", () => ({
  cuentaYChat: vi.fn(async () => ({ userId: "nueva", householdId: "h" })),
  esDeOtraCuenta: vi.fn(async () => t.deOtra),
}));

process.env.TELEGRAM_BOT_TOKEN = "123:abc";
const { default: handler } = await import("./entrar.js");
const { cuentaYChat } = await import("../_bot/altaTelegram.js");

// La cuenta que devuelve auth: la nacida del Telegram 7.
globalThis.fetch = vi.fn(async (url) => ({ json: async () => ({ id: url.split("/").pop(), email: "tg7@bot" }) }));

function llama(body) {
  const res = { json: (j) => { res.cuerpo = j; return res; }, status: (c) => { res.code = c; return res; } };
  return handler({ method: "POST", headers: {}, body: typeof body === "string" ? { codigo: body } : body }, res).then(() => res);
}

function firmado(datos, token = "123:abc") {
  const linea = Object.keys(datos).sort().map((k) => `${k}=${datos[k]}`).join("\n");
  const clave = crypto.createHash("sha256").update(token).digest();
  return { ...datos, hash: crypto.createHmac("sha256", clave).update(linea).digest("hex") };
}
const ahora = () => String(Math.floor(Date.now() / 1000));

beforeEach(() => { t.codigos = {}; t.viejos = []; t.deOtra = false; t.nacida = null; vi.clearAllMocks(); });

describe("entrar con la llave de Lola", () => {
  it("`alta`: crea la cuenta de ese Telegram, enlaza su chat y abre sesión", async () => {
    t.codigos["alta:C"] = { codigo: "C", tipo: "alta", external_id: "7", chat_id: "7", nombre: "Ana" };
    const res = await llama("C");
    expect(cuentaYChat).toHaveBeenCalledWith({ telegramId: "7", chatId: "7", nombre: "Ana" });
    expect(res.cuerpo).toEqual({ token_hash: "hash-tg7@bot", user_id: "nueva" });
  });

  it("`alta` con el Telegram ya atado a una cuenta de la app: no se crea otra", async () => {
    t.codigos["alta:C"] = { codigo: "C", tipo: "alta", external_id: "7", chat_id: "7" };
    t.deOtra = true;
    const res = await llama("C");
    expect(res.code).toBe(403);
    expect(cuentaYChat).not.toHaveBeenCalled();
  });

  it("`entrar` de siempre: la cuenta ya existe, no se crea nada", async () => {
    t.codigos["entrar:E"] = { codigo: "E", tipo: "entrar", external_id: "7", user_id: "ya" };
    const res = await llama("E");
    expect(cuentaYChat).not.toHaveBeenCalled();
    expect(res.cuerpo.user_id).toBe("ya");
  });

  it("un código gastado (botón de un mensaje viejo): 410, diciendo de quién era", async () => {
    t.viejos = [{ user_id: "u7" }];
    const res = await llama("viejo");
    expect(res.code).toBe(410);
    expect(res.cuerpo.user_id).toBe("u7");
  });

  it("un código que no existe: 410 sin cuenta", async () => {
    const res = await llama("nada");
    expect(res.code).toBe(410);
    expect(res.cuerpo.user_id).toBeNull();
  });
});

describe("entrar con el botón de login de Telegram", () => {
  it("firma buena de un Telegram con cuenta nacida allí: abre esa cuenta", async () => {
    t.nacida = { id: "u7", email: "tg7@bot" };
    const res = await llama({ telegram: firmado({ id: "7", first_name: "Ana", auth_date: ahora() }) });
    expect(res.cuerpo).toEqual({ token_hash: "hash-tg7@bot", user_id: "u7" });
  });

  it("firma falsificada (otro id): 403, sin sesión", async () => {
    t.nacida = { id: "u7", email: "tg7@bot" };
    const res = await llama({ telegram: { ...firmado({ id: "7", auth_date: ahora() }), id: "8" } });
    expect(res.code).toBe(403);
    expect(res.cuerpo.token_hash).toBeUndefined();
  });

  it("firma vieja: 410", async () => {
    t.nacida = { id: "u7", email: "tg7@bot" };
    const res = await llama({ telegram: firmado({ id: "7", auth_date: String(Number(ahora()) - 3 * 3600) }) });
    expect(res.code).toBe(410);
  });

  it("Telegram atado a una cuenta de Google: no se regala la sesión", async () => {
    t.deOtra = true;
    const res = await llama({ telegram: firmado({ id: "7", auth_date: ahora() }) });
    expect(res.code).toBe(403);
    expect(res.cuerpo.token_hash).toBeUndefined();
  });

  it("Telegram sin cuenta: 404 y a Lola", async () => {
    const res = await llama({ telegram: firmado({ id: "7", auth_date: ahora() }) });
    expect(res.code).toBe(404);
  });
});

// La app iOS (Capacitor) sirve la web desde capacitor://localhost: sus llamadas a /api son
// cross-origin. Sin cors() el POST nunca sale (el preflight OPTIONS no se contesta).
describe("entrar desde la app nativa (CORS)", () => {
  function conOrigen(method, origin) {
    const cabeceras = {};
    const res = {
      code: 0, terminado: false, cabeceras,
      setHeader: (k, v) => { cabeceras[k] = v; },
      status: (c) => { res.code = c; return res; },
      end: () => { res.terminado = true; return res; },
      json: (j) => { res.cuerpo = j; return res; },
    };
    return handler({ method, headers: { origin }, body: { codigo: "C" } }, res).then(() => res);
  }

  it("el preflight OPTIONS desde capacitor://localhost se contesta 204 sin tocar nada", async () => {
    const res = await conOrigen("OPTIONS", "capacitor://localhost");
    expect(res.code).toBe(204);
    expect(res.terminado).toBe(true);
    expect(res.cabeceras["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(res.cuerpo).toBeUndefined();
  });

  it("el POST real lleva el Allow-Origin de la app", async () => {
    t.codigos["entrar:C"] = { codigo: "C", tipo: "entrar", external_id: "7", user_id: "u7" };
    const res = await conOrigen("POST", "capacitor://localhost");
    expect(res.cabeceras["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(res.cuerpo).toEqual({ token_hash: "hash-tg7@bot", user_id: "u7" });
  });

  it("desde otro origen no se añade ninguna cabecera", async () => {
    const res = await conOrigen("POST", "https://evil.example");
    expect(res.cabeceras["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
