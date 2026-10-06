/**
 * api/bot/entrar.js: la llave de Lola. Con un código `entrar`, la cuenta ya
 * existe; con uno `alta` (el saludo, 0084), se crea al abrir la app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ codigos: {}, deOtra: false }));

vi.mock("../_guard.js", () => ({ rateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("../_bot/db.js", () => ({ config: () => ({ url: "https://base", headers: {} }) }));
vi.mock("../_bot/enlace.js", () => ({ gastarCodigo: vi.fn(async (c, tipo) => t.codigos[`${tipo}:${c}`] ?? null) }));
vi.mock("../_bot/cuentas.js", () => ({
  tokenHashDe: vi.fn(async (email) => `hash-${email}`),
  emailSintetico: (id) => `tg${id}@bot`,
}));
vi.mock("../_bot/altaTelegram.js", () => ({
  cuentaYChat: vi.fn(async () => ({ userId: "nueva", householdId: "h" })),
  esDeOtraCuenta: vi.fn(async () => t.deOtra),
}));

const { default: handler } = await import("./entrar.js");
const { cuentaYChat } = await import("../_bot/altaTelegram.js");

// La cuenta que devuelve auth: la nacida del Telegram 7.
globalThis.fetch = vi.fn(async (url) => ({ json: async () => ({ id: url.split("/").pop(), email: "tg7@bot" }) }));

function llama(codigo) {
  const res = { json: (j) => { res.cuerpo = j; return res; }, status: (c) => { res.code = c; return res; } };
  return handler({ method: "POST", headers: {}, body: { codigo } }, res).then(() => res);
}

beforeEach(() => { t.codigos = {}; t.deOtra = false; vi.clearAllMocks(); });

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

  it("un código gastado o caducado: 410", async () => {
    const res = await llama("nada");
    expect(res.code).toBe(410);
  });
});
