// El cron de cada pocos minutos (/api/bot/recordatorios): además de los recordatorios y las caducidades, aprende de
// las señales (trozo 15), y si eso falla lo de antes ya salió.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const llamadas = vi.hoisted(() => []);
vi.mock("../_bot/recordatorios.js", () => ({ enviarPendientes: vi.fn(async () => { llamadas.push("recordatorios"); return 0; }) }));
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

const respuesta = () => {
  const r = { code: null, cuerpo: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (j) => { r.cuerpo = j; return r; };
  r.end = () => r;
  return r;
};
const pedir = () => ({ method: "POST", headers: { authorization: "Bearer secreto" } });

beforeEach(() => { llamadas.length = 0; aprender.falla = false; process.env.BOT_CRON_SECRET = "secreto"; });
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
