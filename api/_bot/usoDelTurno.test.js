/**
 * Lo que se paga en un turno de Lola cuenta en bot_usage una vez, también si
 * el turno falla, y con lo del enrutador (#958, clase F). Con responder de
 * verdad y el SDK de mentira: cada llamada al modelo da su uso y, si toca, se
 * cae después (529, como un Anthropic saturado).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ guiones: [], contados: [] }));

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  config: () => ({}),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: false }),
  borrar: vi.fn(async () => []), rpc: vi.fn(async () => null),
  select: vi.fn(async () => []),
  insert: vi.fn(async (_t, filas) => filas), update: vi.fn(async () => []),
}));
vi.mock("./casa.js", async (original) => ({
  ...(await original()),
  cargarCasa: vi.fn(async () => ({ householdId: "h1", botRev: 1, recetasPropias: [], menu: null, semana: null, semanas: [], semanaViva: null, state: { data: { members: [{ id: "a", name: "Ana", allergies: [] }] } } })),
}));
vi.mock("./papel.js", () => ({ papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: "u1" })), idiomaDe: vi.fn(async () => null) }));
vi.mock("./uso.js", () => ({ fueraDeLimite: async () => null, contarUso: vi.fn(async (_h, uso) => { t.contados.push(uso); return 1; }), avisoDeLimite: () => "" }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}), rastro: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => null), cimientosCompletos: () => false }));
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original();
  const caida = () => real.APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: "saturado" } }, "saturado", new Headers());
  class Falsa extends real.default {
    constructor() {
      super({ apiKey: "prueba" });
      // Cada llamada a toolRunner (un intento) sigue su guion: { entrada, texto } o { entrada, cae: true }.
      this.beta = { messages: { toolRunner: () => {
        const g = t.guiones.shift() ?? { entrada: 1, texto: "Vale." };
        return (async function* () {
          yield { content: g.cae ? [{ type: "tool_use", id: "v", name: "ver_menu", input: {} }] : [{ type: "text", text: g.texto }], stop_reason: g.cae ? "tool_use" : "end_turn", usage: { input_tokens: g.entrada, output_tokens: 1 } };
          if (g.cae) throw caida();
        })();
      } } };
    }
  }
  return { ...real, default: Falsa };
});

const { responder } = await import("./agente.js");
// En los tests no existe core.mjs (sale del build): el motor, del fuente.
const { usarMotor } = await import("./menu.js");
usarMotor(await import("../../src/server/botCore.js"));

const turno = (extra = {}) => responder({ channel: "telegram", chatId: "100", householdId: "h1", texto: "¿qué cenamos?", desde: ["9"], ...extra });

beforeEach(() => {
  t.guiones = [];
  t.contados = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("el uso de un turno de Lola, una vez y siempre (#958)", () => {
  it("un turno que se cae en los dos modelos cuenta lo que ya se pagó de los dos", async () => {
    t.guiones = [{ entrada: 900, cae: true }, { entrada: 700, cae: true }];
    await expect(turno()).rejects.toThrow();
    expect(t.contados).toHaveLength(1);
    expect(t.contados[0].input_tokens).toBe(1600);
  });

  it("si contesta el de reserva, su uso lleva también lo del principal que se cayó", async () => {
    t.guiones = [{ entrada: 900, cae: true }, { entrada: 10, texto: "Hoy, lentejas." }];
    await turno();
    expect(t.contados).toHaveLength(1);
    expect(t.contados[0].input_tokens).toBe(910);
  });

  it("lo del enrutador (Haiku) cuenta con lo de Lola cuando contesta Lola", async () => {
    t.guiones = [{ entrada: 10, texto: "Hoy, lentejas." }];
    await turno({ usoExtra: Promise.resolve({ input_tokens: 300, output_tokens: 20 }) });
    expect(t.contados).toEqual([{ input_tokens: 310, output_tokens: 21, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }]);
  });

  it("si el turno era de la vía rápida (puerta cerrada), Lola no lo cuenta: lo cuenta telegram.js una vez", async () => {
    t.guiones = [{ entrada: 10, texto: "Hoy, lentejas." }];
    await turno({ puerta: Promise.resolve(false), usoExtra: Promise.resolve({ input_tokens: 300 }) });
    expect(t.contados).toEqual([]);
  });
});
