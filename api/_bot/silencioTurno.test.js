/**
 * Las alergias por silencio en el turno de Lola (responder, #229): lo decide
 * el código con lo último que dijo Lola, no el modelo. Con el enrutador
 * apagado (BOT_ROUTER=off, por defecto) es responder quien lo mira; si el
 * webhook ya lo hizo, llega `silencio: false` y no se repite. En el alta, los
 * que se añaden en ese mismo turno también cuentan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ memoria: [], herramienta: null, casa: null }));

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  config: () => ({}),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: false }),
  borrar: vi.fn(async () => []), rpc: vi.fn(async () => null),
  select: vi.fn(async (tabla) => (tabla === "bot_messages" ? t.memoria : [])),
  insert: vi.fn(async (_t, filas) => filas), update: vi.fn(async () => []),
}));
vi.mock("./casa.js", async (original) => ({ ...(await original()), cargarCasa: vi.fn(async () => structuredClone(t.casa)) }));
vi.mock("./papel.js", () => ({ papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: "u1" })), idiomaDe: vi.fn(async () => null) }));
vi.mock("./ajustes.js", async (original) => ({
  ...(await original()),
  dominiosDeGustos: async () => "favoritos (Lo que os gusta)",
  anadirComensal: vi.fn(async () => "Añadido a la casa: Ana."),
}));
vi.mock("./uso.js", () => ({ fueraDeLimite: async () => null, contarUso: async () => 0, avisoDeLimite: () => "" }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}), rastro: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => null), cimientosCompletos: () => false }));
vi.mock("./silencio.js", async (original) => ({ ...(await original()), apuntarSilencio: vi.fn(async () => null) }));
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original();
  class Falsa extends real.default {
    constructor() {
      super({ apiKey: "prueba" });
      this.beta = { messages: { toolRunner: (params) => (async function* () {
        const h = t.herramienta && params.tools.find((x) => x.name === t.herramienta.nombre);
        if (h) await h.run(t.herramienta.args);
        yield { content: [{ type: "text", text: "Vale." }], usage: {} };
      })() } };
    }
  }
  return { ...real, default: Falsa };
});

const { responder } = await import("./agente.js");
const { apuntarSilencio, AVISO_SILENCIO } = await import("./silencio.js");

const PREGUNTA = `¿Alguien tiene alguna alergia o intolerancia? ${AVISO_SILENCIO}`;
const CASA = {
  householdId: "h1", botRev: 1, recetasPropias: [], menu: null, semana: null, semanas: [], semanaViva: null,
  state: { data: { members: [{ id: "a", name: "Ana", allergies: [], alergiasRevisadas: false }] } },
};
const turno = async (extra = {}) => {
  const r = await responder({ channel: "telegram", chatId: "100", householdId: "h1", texto: "hazme el menú", desde: ["9"], ...extra });
  await r.guardado;
  return r;
};

beforeEach(() => {
  vi.clearAllMocks();
  t.casa = structuredClone(CASA);
  t.herramienta = null;
  t.memoria = [
    { id: 2, role: "assistant", content: { texto: PREGUNTA }, created_at: new Date().toISOString() },
    { id: 1, role: "user", content: { texto: "hola" }, created_at: new Date().toISOString() },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("responder y las alergias por silencio", () => {
  it("mira lo último que dijo Lola antes del modelo, con el papel de quien escribe", async () => {
    await turno();
    expect(apuntarSilencio).toHaveBeenCalledTimes(1);
    expect(apuntarSilencio.mock.calls[0][0]).toMatchObject({ householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner", userId: "u1" });
  });

  it("si el webhook ya lo hizo (silencio: false), no lo repite", async () => {
    await turno({ silencio: false });
    expect(apuntarSilencio).not.toHaveBeenCalled();
  });

  it("en el alta, tras añadir a alguien en este turno, lo vuelve a mirar para los nuevos", async () => {
    t.herramienta = { nombre: "anadir_comensal", args: { nombre: "Pablo" } };
    await turno({ silencio: false, texto: "somos Ana y Pablo" });
    expect(apuntarSilencio).toHaveBeenCalledTimes(1);
    expect(apuntarSilencio.mock.calls[0][0]).toMatchObject({ ultimaDeLola: PREGUNTA, texto: "somos Ana y Pablo" });
  });

  it("sin añadir a nadie, no hay segunda mirada", async () => {
    await turno({ silencio: false, texto: "somos Ana y Pablo" });
    expect(apuntarSilencio).not.toHaveBeenCalled();
  });
});
