/**
 * El turno de Lola (responder, api/_bot/agente.js) cuando la base no contesta
 * (#208): sin la casa no se llama al modelo, porque contestaría como si
 * estuviera vacía, sin alergias; sin el papel, como a alguien de fuera. Lola
 * lo dice. Una casa que de verdad no existe (null) sigue como siempre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ peticiones: 0, casa: null, idioma: null }));
const caida = () => Object.assign(new Error("GET /rest/v1/household_state → 500 57014 canceling statement due to statement timeout"), { status: 500, codigo: "57014" });

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  config: () => ({}),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: false }),
  borrar: vi.fn(async () => []), rpc: vi.fn(async () => null),
  select: vi.fn(async () => []), insert: vi.fn(async (_t, filas) => filas), update: vi.fn(async () => []),
}));
vi.mock("./casa.js", async (original) => ({
  ...(await original()),
  cargarCasa: vi.fn(async () => t.casa),
}));
vi.mock("./papel.js", () => ({
  papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: "u1" })),
  idiomaDe: vi.fn(async () => t.idioma),
}));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "favoritos (Lo que os gusta)" }));
vi.mock("./uso.js", () => ({ fueraDeLimite: async () => null, contarUso: async () => 0, avisoDeLimite: () => "" }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => null), cimientosCompletos: () => false }));
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original();
  class Falsa extends real.default {
    constructor() {
      super({ apiKey: "prueba" });
      this.beta = { messages: { toolRunner: () => {
        t.peticiones++;
        return (async function* () { yield { content: [{ type: "text", text: "Vale." }], usage: {} }; })();
      } } };
    }
  }
  return { ...real, default: Falsa };
});

const { responder } = await import("./agente.js");
const { cargarCasa } = await import("./casa.js");
const { papelDeQuien } = await import("./papel.js");

const CASA = { householdId: "h1", botRev: 1, state: { data: { members: [{ name: "Ana", allergies: ["cacahuete"] }] } }, recetasPropias: [], menu: null, semana: null, semanas: [], semanaViva: null };
const turno = async () => {
  const r = await responder({ channel: "telegram", chatId: "100", householdId: "h1", texto: "¿qué cenamos?", desde: ["9"] });
  await r.guardado;
  return r;
};

beforeEach(() => {
  t.peticiones = 0; t.casa = structuredClone(CASA); t.idioma = null;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("responder sin poder leer la base", () => {
  it("sin la casa: lo dice y no llama al modelo (contestaría sin las alergias)", async () => {
    cargarCasa.mockRejectedValueOnce(caida());
    const r = await turno();
    expect(r.texto).toMatch(/^No he podido leer tu casa ahora mismo; vuelve a intentarlo en un minuto/);
    expect(t.peticiones).toBe(0);
    // Y deja su línea, con el motivo.
    const lineas = console.error.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("bot_fallo"));
    expect(lineas.map((l) => JSON.parse(l))).toContainEqual(expect.objectContaining({ donde: "agente_casa", motivo: "tiempo", grave: true }));
  });

  it("a quien eligió inglés, en inglés", async () => {
    t.idioma = "en";
    cargarCasa.mockRejectedValueOnce(caida());
    expect((await turno()).texto).toMatch(/^I couldn't read your home just now/);
  });

  it("sin el papel: lo dice y no le trata como de fuera", async () => {
    papelDeQuien.mockRejectedValueOnce(caida());
    const r = await turno();
    expect(r.texto).toMatch(/^No he podido comprobar quién eres en esta casa ahora mismo/);
    expect(t.peticiones).toBe(0);
  });

  it("y con la base bien, contesta el modelo como siempre", async () => {
    expect((await turno()).texto).toContain("Vale.");
    expect(t.peticiones).toBe(1);
  });

  it("una casa que no existe (null) no es un fallo: sigue como antes", async () => {
    t.casa = null;
    expect((await turno()).texto).toContain("Vale.");
    expect(t.peticiones).toBe(1);
  });
});
