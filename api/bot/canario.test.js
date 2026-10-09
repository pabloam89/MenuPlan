// El canario de Lola (api/bot/canario.js, #267): solo con su secreto, cada
// chequeo con su motivo de los vocabularios, sin nada de la casa en la
// respuesta, el turno con modelo falla si escribe y tiene tope, y la URL que
// llama sale del entorno y no de la petición. Que de verdad no escribe, con
// la base de verdad: canarioSoloLectura.test.js.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const llamar = vi.fn();
const cargarCasa = vi.fn();
const respuestaHoy = vi.fn();
const ejecutar = vi.fn();
let negadas = [];
let caben = true;

vi.mock("../_bot/telegram.js", () => ({ llamar: (...a) => llamar(...a) }));
vi.mock("../_bot/db.js", () => ({ enSoloLectura: async (correr) => ({ r: await correr(), negadas, calladas: 0 }) }));
vi.mock("../_bot/casa.js", () => ({ cargarCasa: (...a) => cargarCasa(...a) }));
vi.mock("../_bot/rapido.js", () => ({ respuestaHoy: (...a) => respuestaHoy(...a) }));
vi.mock("../_guard.js", () => ({ globalLimit: async () => ({ ok: caben }) }));
vi.mock("../_bot/agente.js", () => ({
  ejecutar: (...a) => ejecutar(...a),
  herramientas: async () => [{ name: "ver_menu" }, { name: "cambiar_plato" }],
  conQuienEscribe: (f) => f,
  SOLO_LECTURA: new Set(["ver_menu"]),
}));
vi.mock("../_bot/ficha.js", () => ({ montarFicha: () => ({ estable: "CASA", delDia: "HOY" }) }));

const { default: handler, motivoDelWebhook, esteDespliegue } = await import("./canario.js");
const { CHEQUEOS_CANARIO, MOTIVOS_CANARIO, MOTIVOS_FALLO } = await import("../../src/lib/vocabularios.js");

const NINGUNA = "00000000-0000-0000-0000-000000000000";

function llamada({ nivel = "salud", secreto = "s3creto", host = "homenu.example" } = {}) {
  const req = { method: "POST", query: { nivel }, headers: { authorization: `Bearer ${secreto}`, host, "x-forwarded-host": host } };
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

const INFO_BIEN = { url: "https://homenu.example/api/bot/telegram", pending_update_count: 0 };

beforeEach(() => {
  process.env.CANARIO_SECRET = "s3creto";
  process.env.BOT_CRON_SECRET = "el-de-los-crons";
  process.env.TELEGRAM_WEBHOOK_SECRET = "w";
  process.env.APP_URL = "https://homenu.example";
  delete process.env.VERCEL_URL;
  delete process.env.BOT_CANARIO_CASA;
  negadas = [];
  vi.clearAllMocks();
  caben = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  llamar.mockResolvedValue(INFO_BIEN);
  cargarCasa.mockImplementation(async (id) => (id === NINGUNA ? null : { state: { data: { members: [{ name: "Ana López" }] } } }));
  respuestaHoy.mockResolvedValue({ texto: "Hoy: lentejas de Ana" });
  // El webhook: 401 sin secreto, 200 con él.
  vi.stubGlobal("fetch", vi.fn(async (_url, o) => ({ status: o.headers["X-Telegram-Bot-Api-Secret-Token"] === "w" ? 200 : 401 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("canario", () => {
  it("sin su secreto, 401 y nada más; el de los crons no vale", async () => {
    for (const secreto of ["otro", "el-de-los-crons"]) {
      const { req, res } = llamada({ secreto });
      await handler(req, res);
      expect(res.code, secreto).toBe(401);
    }
    expect(llamar).not.toHaveBeenCalled();
  });

  it("salud sin casa de prueba: todo bien, la base por casa.js, sin vía rápida", async () => {
    const { req, res } = llamada();
    await handler(req, res);
    expect(res.code).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.chequeos.map((c) => c.chequeo)).toEqual(["webhook_guardia", "webhook_vivo", "webhook_info", "base"]);
    expect(cargarCasa).toHaveBeenCalledWith(NINGUNA, { fresca: true });
    expect(respuestaHoy).not.toHaveBeenCalled();
  });

  it("llama al webhook de la URL del entorno, nunca a la de las cabeceras", async () => {
    const { req, res } = llamada({ host: "malo.example" });
    await handler(req, res);
    const urls = fetch.mock.calls.map(([u]) => u);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toBe("https://homenu.example/api/bot/telegram");
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
    cargarCasa.mockRejectedValue(Object.assign(new Error("GET /rest/v1/household_state → 503"), { status: 503 }));
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

  it("modelo: si intenta escribir en la base, falla aunque conteste bien", async () => {
    negadas = ["household_state"];
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

  it("modelo: pasado el tope, 429 sin llamar al modelo", async () => {
    caben = false;
    const { req, res } = llamada({ nivel: "modelo" });
    await handler(req, res);
    expect(res.code).toBe(429);
    expect(res.body.chequeos).toEqual([{ chequeo: "modelo", ok: false, motivo: "limite" }]);
    expect(ejecutar).not.toHaveBeenCalled();
  });
});

describe("esteDespliegue", () => {
  it("APP_URL manda; si no, VERCEL_URL; y sin ninguna, sin base", () => {
    expect(esteDespliegue({ APP_URL: "https://homenu.example/", VERCEL_URL: "homenu-abc.vercel.app" }).base).toBe("https://homenu.example");
    expect(esteDespliegue({ VERCEL_URL: "homenu-abc.vercel.app" }).base).toBe("https://homenu-abc.vercel.app");
    expect(esteDespliegue({}).base).toBe(null);
    expect(esteDespliegue({ APP_URL: "https://a.example", VERCEL_BRANCH_URL: "b.vercel.app" }).hosts).toEqual(["a.example", "b.vercel.app"]);
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
