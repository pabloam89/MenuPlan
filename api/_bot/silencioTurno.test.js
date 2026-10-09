/**
 * Las alergias por silencio en el turno de Lola (responder, #229). El
 * silencio nunca se decide antes de que el modelo lea el mensaje: se mira al
 * acabar el turno, con las herramientas que Lola pidió, y dentro de
 * generar_menu justo antes de generar (así el menú de ese turno sale entero).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ memoria: [], herramientas: [], casa: null, orden: [], silencioAlLeer: null, vistas: [] }));

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
  ajustarAlergias: vi.fn(async () => { t.orden.push("ajustar_alergias"); return "Anotado."; }),
}));
vi.mock("./generar.js", async (original) => ({
  ...(await original()),
  generarMenu: vi.fn(async (_h, _s, _f, out) => { t.orden.push("generarMenu"); Object.assign(out, { ok: false }); return "Menú nuevo generado."; }),
}));
vi.mock("./uso.js", () => ({ fueraDeLimite: async () => null, contarUso: async () => 0, avisoDeLimite: () => "" }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}), rastro: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => null), cimientosCompletos: () => false }));
vi.mock("./silencio.js", async (original) => ({
  ...(await original()),
  // Copia de lo que vio en ESE momento (la lista del turno sigue creciendo).
  apuntarSilencio: vi.fn(async (a) => { t.orden.push(`silencio:${a.llamadas.join("+")}`); t.vistas.push({ ...a, llamadas: [...a.llamadas] }); return null; }),
}));
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original();
  class Falsa extends real.default {
    constructor() {
      super({ apiKey: "prueba" });
      this.beta = { messages: { toolRunner: (params) => (async function* () {
        // Cuántas veces se había mirado el silencio cuando el modelo empieza a leer.
        t.silencioAlLeer ??= t.orden.filter((x) => x.startsWith("silencio:")).length;
        // Como el runner de verdad: primero el mensaje con el bloque de
        // llamadas, y las herramientas se ejecutan DESPUÉS, todas a la vez.
        if (t.herramientas.length) {
          yield { content: t.herramientas.map((h) => ({ type: "tool_use", id: h.nombre, name: h.nombre, input: h.args })), usage: {} };
          for (const h of t.herramientas) await params.tools.find((x) => x.name === h.nombre).run(h.args, { toolUse: { id: h.nombre } });
        }
        yield { content: [{ type: "text", text: "Vale." }], usage: {} };
      })() } };
    }
  }
  return { ...real, default: Falsa };
});

const { responder } = await import("./agente.js");
const { apuntarSilencio, decidirSilencio, AVISO_SILENCIO } = await import("./silencio.js");

const PREGUNTA = `¿Alguien tiene alguna alergia o intolerancia? ${AVISO_SILENCIO}`;
const CASA = {
  householdId: "h1", botRev: 1, recetasPropias: [], menu: null, semana: null, semanas: [], semanaViva: null,
  state: { data: { members: [{ id: "a", name: "Ana", allergies: [], alergiasRevisadas: false }] } },
};
const turno = async (texto = "hazme el menú") => {
  const r = await responder({ channel: "telegram", chatId: "100", householdId: "h1", texto, desde: ["9"] });
  await r.guardado;
  return r;
};

beforeEach(() => {
  vi.clearAllMocks();
  t.casa = structuredClone(CASA);
  t.herramientas = [];
  t.orden = [];
  t.silencioAlLeer = null;
  t.vistas = [];
  t.memoria = [
    { id: 2, role: "assistant", content: { texto: PREGUNTA }, created_at: new Date().toISOString() },
    { id: 1, role: "user", content: { texto: "hola" }, created_at: new Date().toISOString() },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("responder y las alergias por silencio", () => {
  it("nunca antes de que el modelo lea el mensaje: al acabar, con lo último de Lola y quién había", async () => {
    await turno();
    expect(t.silencioAlLeer).toBe(0);
    expect(apuntarSilencio).toHaveBeenCalledTimes(1);
    expect(apuntarSilencio.mock.calls[0][0]).toMatchObject({
      householdId: "h1", ultimaDeLola: PREGUNTA, texto: "hazme el menú", papel: "owner", userId: "u1", llamadas: [], nombres: ["Ana"],
    });
  });

  it("al cerrar el turno pasa lo que contestó Lola; dentro de generar_menu, todavía nada", async () => {
    t.herramientas = [{ nombre: "generar_menu", args: { semana: "esta" } }];
    await turno();
    expect(t.vistas.map((v) => v.respuestaDeLola ?? null)).toEqual([null, "Vale."]);
  });

  it("(b) generar_menu aplica el silencio ANTES de generar", async () => {
    t.herramientas = [{ nombre: "generar_menu", args: { semana: "esta" } }];
    await turno();
    expect(t.orden.slice(0, 2)).toEqual(["silencio:generar_menu", "generarMenu"]);
  });

  it("bloque en paralelo [generar_menu, ajustar_alergias]: nada se marca antes de generar (seguridad alimentaria)", async () => {
    t.herramientas = [
      { nombre: "generar_menu", args: { semana: "esta" } },
      { nombre: "ajustar_alergias", args: { persona: "Ana", alergenos: ["huevos"], confirmado: true } },
    ];
    await turno();
    const antesDeGenerar = t.vistas.slice(0, t.orden.filter((x, i) => i < t.orden.indexOf("generarMenu") && x.startsWith("silencio:")).length);
    expect(antesDeGenerar.length).toBeGreaterThan(0);
    for (const a of antesDeGenerar) {
      expect(a.llamadas).toContain("ajustar_alergias");
      expect(decidirSilencio(a)).toBe(null);
    }
  });

  it("(c) si en el turno Lola llamó a ajustar_alergias, lo que llega a decidir no marca", async () => {
    t.herramientas = [
      { nombre: "ajustar_alergias", args: { persona: "Ana", ninguna: true, confirmado: true } },
      { nombre: "generar_menu", args: { semana: "esta" } },
    ];
    await turno("Ana no tiene nada, hazme el menú");
    expect(apuntarSilencio).toHaveBeenCalled();
    for (const [a] of apuntarSilencio.mock.calls) {
      expect(a.llamadas).toContain("ajustar_alergias");
      expect(decidirSilencio(a)).toBe(null);
    }
  });
});
