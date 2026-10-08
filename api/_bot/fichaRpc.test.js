/**
 * La ficha y las tareas de Lola por la RPC ficha_casa (0120), detrás de
 * BOT_FICHA_RPC. Producción y staging comparten base y la 0120 aún no está
 * aplicada: con el interruptor apagado, lo que lee el modelo tiene que ser byte
 * a byte lo de antes. Eso lo fija la foto (snapshot) de los bloques que llegan
 * al modelo en un turno entero de responder(), sacada del código de antes de
 * tocar nada.
 *
 * La base es de mentira: bot_tareas, un array en memoria que imita los filtros
 * de PostgREST que usa tareas.js; el modelo, uno que apunta lo que le llega y
 * contesta «Vale.».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const CASA = "11111111-1111-1111-1111-111111111111";
const YO = "22222222-2222-2222-2222-222222222222";
const OTRO = "33333333-3333-3333-3333-333333333333";
const HOY = new Date("2026-10-08T10:00:00Z");

// La casa tal como la guarda la app (household_state.state.data).
const DATA = {
  allergiesReviewed: false,
  members: [
    { id: "p", name: "Pablo", age: 39, allergies: [], alergiasRevisadas: true, homeRole: "Papá" },
    { id: "m", name: "Marta", age: 37, allergies: [], alergiasRevisadas: true, homeRole: "Mamá", dietaryStates: ["lactancia"], dietaryStatesMeta: { lactancia: { hasta: "2026-12-31" } } },
    { id: "l", name: "Lucas", age: 7, allergies: ["frutos_cascara"], dislikes: ["champiñón"], homeRole: "Hijo/a", intolerances: ["fructosa"] },
    { id: "v", name: "Vega", age: 1, homeRole: "Bebé" },
    { id: "leo", name: "Leo", age: 40, homeRole: "Adulto" },
  ],
  groups: [{ id: "g", label: "Mayores", memberIds: ["p", "m", "l", "leo"] }, { id: "b", label: "Vega", memberIds: ["v"] }],
  etapaBebe: "solidos",
  schedule: { "l|Lun|Comida": "cole", "l|Mar|Comida": "cole", "l|Mié|Comida": "cole", "l|Jue|Comida": "cole", "l|Vie|Comida": "cole" },
  mealStructure: "primero_segundo",
};

// Las filas de bot_tareas (con las columnas v2 de la 0080).
const TAREAS = () => [
  { id: "a1b2c3d4-0000-0000-0000-000000000001", household_id: CASA, kind: "pregunta", scope: "casa", owner_user_id: null, texto: "¿Vega tiene alguna alergia?", falta: null, clave: "alergias:v", chat_id: "100", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-07T09:00:00Z", status: "abierta", tipo: "falta_saber", campo: "alergias", persona_id: "v", vuelve_at: null },
  { id: "b1b2c3d4-0000-0000-0000-000000000002", household_id: CASA, kind: "seguimiento", scope: "casa", owner_user_id: null, texto: "Comprar pan sin gluten para el sábado", falta: null, clave: "seguimiento:l:gluten-pan-sabado", chat_id: "200", para_member: "l", asignado_member: "m", vence: "2026-10-10", caduca_at: "2026-10-11T23:59:59Z", created_at: "2026-10-06T09:00:00Z", status: "abierta", tipo: "seguimiento", campo: null, persona_id: "l", vuelve_at: null },
  { id: "c1b2c3d4-0000-0000-0000-000000000003", household_id: CASA, kind: "seguimiento", scope: "personal", owner_user_id: YO, texto: "Pedir el cordero al carnicero", falta: null, clave: "seguimiento:casa:carnicero-cordero-pedir", chat_id: "100", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-05T09:00:00Z", status: "abierta", tipo: "seguimiento", campo: null, persona_id: null, vuelve_at: null },
  { id: "d1b2c3d4-0000-0000-0000-000000000004", household_id: CASA, kind: "seguimiento", scope: "personal", owner_user_id: OTRO, texto: "Regalo sorpresa de Marta", falta: null, clave: "seguimiento:casa:marta-regalo-sorpresa", chat_id: "300", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-04T09:00:00Z", status: "abierta", tipo: "seguimiento", campo: null, persona_id: null, vuelve_at: null },
  // Leo no quiso decirlo ayer: no se le vuelve a preguntar.
  { id: "e1b2c3d4-0000-0000-0000-000000000005", household_id: CASA, kind: "pregunta", scope: "casa", owner_user_id: null, texto: "¿Leo tiene alguna alergia?", falta: null, clave: "alergias:leo", chat_id: "100", para_member: null, asignado_member: null, vence: null, caduca_at: "2026-11-01T00:00:00Z", created_at: "2026-10-03T09:00:00Z", closed_at: "2026-10-07T20:00:00Z", status: "rechazada", tipo: "falta_saber", campo: "alergias", persona_id: "leo", vuelve_at: null },
];

let filas = [];
let llamadas = [];
let peticiones = [];
let rpcFicha = null;

const vivas = (t) => t.status === "abierta" || t.status === "aplazada";
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  config: () => ({}),
  contandoEscrituras: async (correr) => ({ r: await correr(), escribio: false }),
  borrar: vi.fn(async () => []),
  rpc: vi.fn(async (funcion, args) => {
    llamadas.push(["rpc", funcion, args]);
    if (funcion === "ficha_casa") return rpcFicha(args);
    return null;
  }),
  select: vi.fn(async (tabla, filtro = "") => {
    llamadas.push(["select", tabla, filtro]);
    if (tabla !== "bot_tareas") return [];
    if (/rechazada/.test(filtro)) return filas.filter((t) => t.status === "rechazada");
    return filas.filter((t) => vivas(t) && (t.scope === "casa" || filtro.includes(`owner_user_id.eq.${t.owner_user_id}`)));
  }),
  insert: vi.fn(async (tabla, nuevas) => { llamadas.push(["insert", tabla]); return nuevas; }),
  update: vi.fn(async () => []),
}));
vi.mock("./casa.js", async (original) => ({
  ...(await original()),
  cargarCasa: vi.fn(async () => ({ householdId: CASA, botRev: 41, state: { data: structuredClone(DATA) }, recetasPropias: [], menu: null, semana: null, semanas: [], semanaViva: null })),
}));
vi.mock("./papel.js", () => ({
  papelDeQuien: vi.fn(async () => ({ papel: "owner", userId: YO })),
  idiomaDe: vi.fn(async () => null),
}));
// Sin el build (core.mjs, dominiosGustos.json): las descripciones de las herramientas no cuentan aquí.
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "favoritos (Lo que os gusta)" }));
vi.mock("./uso.js",() => ({ fueraDeLimite: async () => null, contarUso: async () => 0, avisoDeLimite: () => "" }));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(async () => {}), EMBUDO: {}, duenoDe: vi.fn(async () => null), cimientosCompletos: () => false }));
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original();
  class Falsa extends real.default {
    constructor() {
      super({ apiKey: "prueba" });
      this.beta = { messages: { toolRunner: (p) => {
        peticiones.push(p);
        return (async function* () { yield { content: [{ type: "text", text: "Vale." }], usage: {} }; })();
      } } };
    }
  }
  return { ...real, default: Falsa };
});

const { responder } = await import("./agente.js");

/** Lo que llega al modelo en el turno: los bloques de la ficha y la entrada (con las tareas). */
async function turno({ esGrupo = false, chatId = "100" } = {}) {
  peticiones = [];
  const r = await responder({ channel: "telegram", chatId, householdId: CASA, texto: "¿qué cenamos?", autor: "Pablo", esGrupo, desde: ["9"] });
  await r.guardado;
  const p = peticiones[0];
  return {
    ficha: p.system.slice(1, -1).map((b) => b.text),
    entrada: p.messages.at(-1).content[0].text,
  };
}

let entorno;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOY);
  filas = TAREAS();
  llamadas = [];
  rpcFicha = () => { throw new Error("POST /rest/v1/rpc/ficha_casa → 404 PGRST202"); };
  entorno = { BOT_FICHA_RPC: process.env.BOT_FICHA_RPC, BOT_TAREAS_V2: process.env.BOT_TAREAS_V2 };
});
afterEach(() => {
  vi.useRealTimers();
  for (const [k, v] of Object.entries(entorno)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe("con BOT_FICHA_RPC apagado, lo que lee Lola es lo de antes", () => {
  for (const v2 of ["", "1"]) {
    it(`privado${v2 ? " (con BOT_TAREAS_V2)" : ""}: la ficha y las tareas, byte a byte`, async () => {
      delete process.env.BOT_FICHA_RPC;
      process.env.BOT_TAREAS_V2 = v2;
      const t = await turno();
      expect(t).toMatchSnapshot();
      expect(llamadas.some(([, f]) => f === "ficha_casa")).toBe(false);
    });

    it(`grupo${v2 ? " (con BOT_TAREAS_V2)" : ""}: la ficha y las tareas, byte a byte`, async () => {
      delete process.env.BOT_FICHA_RPC;
      process.env.BOT_TAREAS_V2 = v2;
      const t = await turno({ esGrupo: true, chatId: "200" });
      expect(t).toMatchSnapshot();
      expect(llamadas.some(([, f]) => f === "ficha_casa")).toBe(false);
    });
  }
});
