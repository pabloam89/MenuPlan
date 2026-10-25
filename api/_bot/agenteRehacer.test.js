/**
 * El botón «Rehacer la del 26 oct» llega a generarMenu con esa semana y con
 * rehacer: true, aunque el modelo pida otra cosa (#915, de #907): en las evals
 * pedía `semana: "siguiente"` y eso es la primera semana libre, no la del botón.
 * Se prueba la herramienta de verdad (herramientas() de agente.js), con
 * generarMenu y la base de mentira.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({ ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []) }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
vi.mock("./silencio.js", async (original) => ({ ...(await original()), apuntarSilencio: vi.fn(async () => null) }));
vi.mock("./generar.js", async (original) => ({ ...(await original()), generarMenu: vi.fn(async (_h, _cual, _fijos, out) => { out.ok = false; return "Menú nuevo generado (mentira)."; }) }));

const { herramientas } = await import("./agente.js");
const { generarMenu } = await import("./generar.js");

const llamar = async (texto, args) => {
  const chat = { householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto };
  const generar = (await herramientas(chat)).find((t) => t.name === "generar_menu");
  return generar.run(args, { toolUse: { id: `t-${Math.random()}` } });
};

beforeEach(() => {
  generarMenu.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T10:00:00Z")); // sábado
});
afterEach(() => vi.useRealTimers());

describe("generar_menu al pulsar «Rehacer la del …»", () => {
  it("pasa `desde` (ese lunes) y rehacer: true aunque el modelo pida `semana: siguiente` y nada más", async () => {
    await llamar("Rehacer la del 26 oct", { semana: "siguiente" });
    expect(generarMenu).toHaveBeenCalledTimes(1);
    const [, cual, fijos, , opciones] = generarMenu.mock.calls[0];
    expect(cual).toBe("siguiente");
    expect(fijos).toEqual([]);
    expect(opciones).toEqual({ desde: "2026-10-26", rehacer: true });
  });

  it("manda el botón sobre una fecha o un rehacer: false que invente el modelo", async () => {
    await llamar("Rehacer la del 26 oct", { semana: "esta", desde: "2026-11-02", rehacer: false });
    expect(generarMenu.mock.calls[0][4]).toEqual({ desde: "2026-10-26", rehacer: true });
  });

  it("un mensaje que no es el botón no fuerza nada: va lo que pide el modelo", async () => {
    await llamar("hazme el menú de la semana que viene", { semana: "siguiente" });
    expect(generarMenu.mock.calls[0][4]).toEqual({ desde: null, rehacer: false });
    await llamar("rehaz la del 26", { semana: "siguiente", desde: "2026-10-26", rehacer: true });
    expect(generarMenu.mock.calls[1][4]).toEqual({ desde: "2026-10-26", rehacer: true });
  });
});
