// El cron de cada pocos minutos (/api/bot/recordatorios): además de los recordatorios y las caducidades, aprende de
// las señales (trozo 15), y si eso falla lo de antes ya salió.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const llamadas = vi.hoisted(() => []);
const vencidos = vi.hoisted(() => []);
// enviarPendientes, de mentira: manda los vencidos que le pongamos.
vi.mock("../_bot/recordatorios.js", () => ({
  enviarPendientes: vi.fn(async (mandar) => { llamadas.push("recordatorios"); for (const r of vencidos) await mandar(r); return vencidos.length; }),
}));
vi.mock("../_bot/telegram.js", () => ({ enviar: vi.fn(), escaparHtml: (t) => t }));
vi.mock("../_bot/vispera.js", () => ({ VISPERA: "v", TIPO_VISPERA: "vispera", avisoDeVisperaDe: vi.fn() }));
vi.mock("../_bot/db.js", () => ({ rpc: vi.fn(async () => { llamadas.push("tareas"); return 0; }) }));
vi.mock("../_bot/caducidades.js", () => ({ barrer: vi.fn(async () => { llamadas.push("caducidades"); return {}; }) }));
const aprender = vi.hoisted(() => ({ falla: false }));
vi.mock("../_bot/aprender.js", () => ({
  aprenderDeSenales: vi.fn(async () => {
    llamadas.push("senales");
    if (aprender.falla) throw new Error("sin base");
    return { casas: 1, escritas: 1, fallos: 0 };
  }),
}));

const { default: handler } = await import("./recordatorios.js");
const { enviar } = await import("../_bot/telegram.js");

const respuesta = () => {
  const r = { code: null, cuerpo: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (j) => { r.cuerpo = j; return r; };
  r.end = () => r;
  return r;
};
const pedir = () => ({ method: "POST", headers: { authorization: "Bearer secreto" } });

beforeEach(() => { llamadas.length = 0; vencidos.length = 0; vi.mocked(enviar).mockClear(); aprender.falla = false; process.env.BOT_CRON_SECRET = "secreto"; });
afterEach(() => { delete process.env.BOT_CRON_SECRET; vi.restoreAllMocks(); });

describe("cron: aprende de las señales en cada pasada", () => {
  it("después de recordatorios, tareas y caducidades, y lo devuelve", async () => {
    const res = await handler(pedir(), respuesta());
    expect(llamadas).toEqual(["recordatorios", "tareas", "caducidades", "senales"]);
    expect(res.cuerpo).toMatchObject({ ok: true, aprendido: { casas: 1, escritas: 1, fallos: 0 } });
  });

  it("si aprender falla, la pasada contesta igual y queda en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    aprender.falla = true;
    const res = await handler(pedir(), respuesta());
    expect(res.code).toBe(200);
    expect(res.cuerpo).toMatchObject({ ok: true, aprendido: null });
    expect(log).toHaveBeenCalledWith("[senales]", "sin base");
  });
});

describe("cron: el botón de un recordatorio lleva su tarea (#1238)", () => {
  it("también con un texto que no cabría en el botón", async () => {
    const id = "0f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
    vencidos.push({ id, channel: "telegram", chat_id: "7", household_id: "casaA", texto: "Sacar la carne del congelador para el guiso del domingo con los abuelos" });
    await handler(pedir(), respuesta());
    const [, texto, opciones] = vi.mocked(enviar).mock.calls[0];
    expect(texto).toMatch(/Recordatorio/);
    expect(opciones.botones).toEqual([[{ texto: "👉 Vamos", dato: `rec:${id}` }]]);
  });
});
