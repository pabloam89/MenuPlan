/**
 * Tareas que se abren o se cierran al escribir en la casa (ajustes.js), no al
 * turno siguiente. Con la casa de mentira: conCasa le pasa una y se queda con
 * lo que devuelve; la tabla de tareas es un array en memoria.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as alergias from "../../src/lib/alergias.js";
import { suggestHomeRole } from "../../src/lib/stages.js";
import { reconcileGroupsWithMembers, migrateGroupsForBabies } from "../../src/lib/groups.js";

let guardada = null;
let filas = [];
let fallaUpdate = false;
const casaInicial = () => ({
  state: { data: { allergiesReviewed: false, members: [
    { id: "nat", name: "Nat", age: 35, allergies: [], alergiasRevisadas: false },
    { id: "pablo", name: "Pablo", age: 36, allergies: [], alergiasRevisadas: false },
  ] } },
});
const deFiltro = (filtro) => Object.fromEntries(String(filtro).split("&").map((p) => p.split("=")));

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  rpc: vi.fn(),
  select: vi.fn(async (tabla, filtro) => {
    if (tabla !== "bot_tareas") return [];
    const f = deFiltro(filtro);
    return filas.filter((t) => `eq.${t.household_id}` === f.household_id && t.status === "abierta");
  }),
  insert: vi.fn(async (tabla, nuevas) => {
    for (const n of nuevas) {
      if (filas.some((t) => t.household_id === n.household_id && t.status === "abierta" && t.clave && t.clave === n.clave)) throw new Error("409 duplicate key");
      filas.push({ id: `t${filas.length + 1}aaaaaaaa`, status: "abierta", ...n });
    }
    return nuevas;
  }),
  update: vi.fn(async (tabla, filtro, parche) => {
    if (fallaUpdate) throw new Error("red caída");
    const f = deFiltro(filtro);
    const hits = filas.filter((t) => `eq.${t.id}` === f.id && t.status === "abierta");
    for (const t of hits) Object.assign(t, parche);
    return hits;
  }),
}));
vi.mock("./casa.js", () => ({
  cargarCasa: vi.fn(),
  conCasa: vi.fn(async (_id, cambiar) => {
    const r = await cambiar(guardada ?? casaInicial());
    if (r) guardada = { ...(guardada ?? casaInicial()), ...r };
    return { ok: true };
  }),
}));
vi.mock("./embudo.js", () => ({ registrar: vi.fn(), EMBUDO: {}, duenoDe: vi.fn(), cimientosCompletos: () => false }));
vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  motor: async () => ({ ...alergias, suggestHomeRole, reconcileGroupsWithMembers, migrateGroupsForBabies }),
}));

const { ajustarAlergias, anadirComensal } = await import("./ajustes.js");
const { resuelta } = await import("./estadoCasa.js");
const { separarPorEstado, cerrarResueltas } = await import("./tareas.js");

const pregunta = (clave) => ({ id: `${clave.replace(/\W/g, "")}xxxxxxxx`, household_id: "h", kind: "pregunta", scope: "casa", clave, status: "abierta", texto: clave });

beforeEach(() => { guardada = null; filas = []; fallaUpdate = false; });

describe("«ninguna» marca solo a quien se nombra", () => {
  it("Nat: ninguna → Pablo sigue sin revisar y su tarea sigue abierta", async () => {
    await ajustarAlergias("h", { persona: "Nat", ninguna: true, confirmado: true });
    const data = guardada.state.data;
    expect(resuelta("alergias:nat", data)).toBe(true);
    expect(resuelta("alergias:pablo", data)).toBe(false);
  });

  it("sin decir de quién, con más de uno sin revisar, no da la casa por revisada", async () => {
    const t = await ajustarAlergias("h", { ninguna: true, confirmado: true });
    expect(t).toMatch(/de quién|toda la casa/i);
    expect(resuelta("alergias:pablo", (guardada ?? casaInicial()).state.data)).toBe(false);
  });

  it("«toda la casa» sí marca a todos", async () => {
    await ajustarAlergias("h", { persona: "toda la casa", ninguna: true, confirmado: true });
    expect(resuelta("alergias:nat", guardada.state.data)).toBe(true);
    expect(resuelta("alergias:pablo", guardada.state.data)).toBe(true);
  });
});
