// El canario de Lola (api/bot/canario.js, #267): solo con el secreto, cada
// chequeo con su motivo de los vocabularios, sin nada de la casa en la
// respuesta, y el turno con modelo falla si escribe.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const llamar = vi.fn();
const select = vi.fn();
const cargarCasa = vi.fn();
const respuestaHoy = vi.fn();
const ejecutar = vi.fn();
let escribe = false;

vi.mock("../_bot/telegram.js", () => ({ llamar: (...a) => llamar(...a) }));
vi.mock("../_bot/db.js", () => ({
  select: (...a) => select(...a),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: escribe }),
}));
vi.mock("../_bot/casa.js", () => ({ cargarCasa: (...a) => cargarCasa(...a) }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: (...a) => respuestaHoy(...a) }));
vi.mock("../_bot/agente.js", () => ({
  ejecutar: (...a) => ejecutar(...a),
  herramientas: async () => [{ name: "ver_menu" }, { name: "cambiar_plato" }],
  conQuienEscribe: (f) => f,
  SOLO_LECTURA: new Set(["ver_menu"]),
}));
vi.mock("../_bot/ficha.js", () => ({ montarFicha: () => ({ estable: "CASA", delDia: "HOY" }) }));

const { default: handler, motivoDelWebhook } = await import("./canario.js");
const { CHEQUEOS_CANARIO, MOTIVOS_CANARIO, MOTIVOS_FALLO } = await import("../../src/lib/vocabularios.js");

function llamada({ nivel = "salud", secreto = "s3creto" } = {}) {
  const req = { method: "POST", query: { nivel }, headers: { authorization: `Bearer ${secreto}`, host: "homenu.example" } };
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

const INFO_BIEN = { url: "https://homenu.example/api/bot/telegram", pending_update_count: 0 };

beforeEach(() => {
  process.env.BOT_CRON_SECRET = "s3creto";
  process.env.TELEGRAM_WEBHOOK_SECRET = "w";
  process.env.APP_URL = "https://homenu.example";
  delete process.env.BOT_CANARIO_CASA;
  escribe = false;
  vi.spyOn(console, "log").mockImplementation(() => {});
  llamar.mockResolvedValue(INFO_BIEN);
  select.mockResolvedValue([]);
  cargarCasa.mockResolvedValue({ state: { data: { members: [{ name: "Ana López" }] } } });
  respuestaHoy.mockResolvedValue({ texto: "Hoy: lentejas de Ana" });
  // El webhook: 401 sin secreto, 200 con él.
  vi.stubGlobal("fetch", vi.fn(async (_url, o) => ({ status: o.headers["X-Telegram-Bot-Api-Secret-Token"] === "w" ? 200 : 401 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("canario", () => {
  it("sin el secreto, 401 y nada más", async () => {
    const { req, res } = llamada({ secreto: "otro" });
    await handler(req, res);
    expect(res.code).toBe(401);
    expect(llamar).not.toHaveBeenCalled();
  });

  it("salud sin casa de prueba: todo bien, sin vía rápida", async () => {
    const { req, res } = llamada();
    await handler(req, res);
    expect(res.code).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.chequeos.map((c) => c.chequeo)).toEqual(["webhook_guardia", "webhook_vivo", "webhook_info", "base"]);
    expect(respuestaHoy).not.toHaveBeenCalled();
  });

  it("salud con casa de prueba: lee la casa y pasa por la vía rápida, y no devuelve nada de ella", async () => {
    process.env.BOT_CANARIO_CASA = "casa-1";
    const { req, res } = llamada();
    await handler(req, res);
    expect(res.body.ok).toBe(true);
    expect(res.body.chequeos.map((c) => c.chequeo)).toContain("via_rapida");
    expect(JSON.stringify(res.body)).not.toContain("Ana");
  });

  it("un webhook sin guardia o caído falla con su motivo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500 })));
    const { req, res } = llamada();
    await handler(req, res);
    const por = Object.fromEntries(res.body.chequeos.map((c) => [c.chequeo, c]));
    expect(res.body.ok).toBe(false);
    expect(por.webhook_guardia).toMatchObject({ ok: false, motivo: "respuesta_inesperada" });
    expect(por.webhook_vivo).toMatchObject({ ok: false, motivo: "servidor" });
  });

  it("cada chequeo y cada motivo, de los vocabularios", async () => {
    llamar.mockRejectedValue(Object.assign(new Error("Telegram getWebhookInfo: 502"), { servicio: "telegram" }));
    select.mockRejectedValue(Object.assign(new Error("GET /rest/v1/households → 503"), { status: 503 }));
    const { req, res } = llamada();
    await handler(req, res);
    for (const c of res.body.chequeos) {
      expect(CHEQUEOS_CANARIO).toContain(c.chequeo);
      if (!c.ok) expect([...MOTIVOS_FALLO, ...MOTIVOS_CANARIO]).toContain(c.motivo);
    }
  });

  it("modelo: contesta, solo con herramientas de lectura, y no devuelve lo que dijo", async () => {
    process.env.BOT_CANARIO_CASA = "casa-1";
    ejecutar.mockResolvedValue({ dicho: "Hoy coméis lentejas, Ana.", uso: { input_tokens: 10, output_tokens: 5 }, modelo: "claude-sonnet-5", planB: false, vueltas: 1 });
    const { req, res } = llamada({ nivel: "modelo" });
    await handler(req, res);
    expect(res.body).toMatchObject({ ok: true, nivel: "modelo", modelo: "claude-sonnet-5", uso: { in: 10, out: 5, cr: 0, cw: 0 } });
    expect(ejecutar.mock.calls[0][0].tools.map((t) => t.name)).toEqual(["ver_menu"]);
    expect(JSON.stringify(res.body)).not.toContain("Ana");
  });

  it("modelo: si escribe en la base, falla aunque conteste bien", async () => {
    escribe = true;
    ejecutar.mockResolvedValue({ dicho: "Hoy coméis lentejas.", uso: {}, modelo: "m" });
    const { req, res } = llamada({ nivel: "modelo" });
    await handler(req, res);
    expect(res.body.chequeos).toEqual([expect.objectContaining({ chequeo: "modelo", ok: false, motivo: "escribio" })]);
  });

  it("modelo: una respuesta vacía falla", async () => {
    ejecutar.mockResolvedValue({ dicho: "  ", uso: {}, modelo: "m" });
    const { req, res } = llamada({ nivel: "modelo" });
    await handler(req, res);
    expect(res.body.chequeos[0]).toMatchObject({ ok: false, motivo: "respuesta_vacia" });
  });
});

describe("motivoDelWebhook", () => {
  const hosts = ["homenu.example"];
  const ahora = Date.parse("2026-10-09T10:00:00Z");
  it("bien si apunta aquí, sin cola ni errores recientes", () => {
    expect(motivoDelWebhook(INFO_BIEN, { hosts, ahora })).toBe(null);
    expect(motivoDelWebhook({ ...INFO_BIEN, last_error_date: ahora / 1000 - 3600 }, { hosts, ahora })).toBe(null);
  });
  it("cada problema, su motivo", () => {
    expect(motivoDelWebhook({ url: "" }, { hosts, ahora })).toBe("webhook_otra_url");
    expect(motivoDelWebhook({ url: "https://staging.example/api/bot/telegram" }, { hosts, ahora })).toBe("webhook_otra_url");
    expect(motivoDelWebhook({ url: "https://homenu.example/otra" }, { hosts, ahora })).toBe("webhook_otra_url");
    expect(motivoDelWebhook({ ...INFO_BIEN, pending_update_count: 500 }, { hosts, ahora })).toBe("webhook_atascado");
    expect(motivoDelWebhook({ ...INFO_BIEN, last_error_date: ahora / 1000 - 60 }, { hosts, ahora })).toBe("webhook_con_errores");
  });
});
