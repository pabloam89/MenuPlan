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

const { ajustarAlergias, anadirComensal, ajustarCocina, quitarComensal } = await import("./ajustes.js");
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
    filas = [];
    await ajustarAlergias("h", { persona: "toda la casa", ninguna: true, confirmado: true });
    expect(resuelta("alergias:nat", guardada.state.data)).toBe(true);
    expect(resuelta("alergias:pablo", guardada.state.data)).toBe(true);
  });
});

const abierta = (clave) => filas.find((t) => t.clave === clave)?.status;

describe("cerrar al escribir, no al turno siguiente", () => {
  it("«Nat no tiene alergias» cierra su tarea en esa misma llamada; la de Pablo sigue", async () => {
    filas = [pregunta("alergias:nat"), pregunta("alergias:pablo")];
    await ajustarAlergias("h", { persona: "Nat", ninguna: true, confirmado: true });
    expect(abierta("alergias:nat")).toBe("hecha");
    expect(abierta("alergias:pablo")).toBe("abierta");
  });

  it("apuntar la etapa del bebé cierra su tarea al momento", async () => {
    guardada = { state: { data: { members: [{ id: "cova", name: "Cova", age: 0 }] } } };
    filas = [pregunta("etapa:cova")];
    await ajustarCocina("h", { etapaBebe: "solidos" });
    expect(abierta("etapa:cova")).toBe("hecha");
  });

  it("si el cierre falla, el dato queda guardado y el turno siguiente la cierra", async () => {
    filas = [pregunta("alergias:nat")];
    fallaUpdate = true;
    const t = await ajustarAlergias("h", { persona: "Nat", ninguna: true, confirmado: true });
    expect(t).toMatch(/Nat no tiene alergias/);
    expect(abierta("alergias:nat")).toBe("abierta");
    fallaUpdate = false;
    // La red de siempre: al empezar el turno, lo que el estado ya resolvió se cierra.
    const { resueltas } = separarPorEstado(filas.filter((x) => x.status === "abierta"), guardada.state.data);
    await cerrarResueltas(resueltas, { householdId: "h" });
    expect(abierta("alergias:nat")).toBe("hecha");
  });
});

describe("quitar a alguien descarta sus tareas, no las da por hechas", () => {
  it("quitar a Pablo deja su pregunta de alergias descartada; la de Nat sigue abierta", async () => {
    filas = [pregunta("alergias:nat"), pregunta("alergias:pablo")];
    await quitarComensal("h", { nombre: "Pablo" });
    expect(abierta("alergias:pablo")).toBe("descartada");
    expect(abierta("alergias:nat")).toBe("abierta");
  });
});

describe("el alta abre la pregunta de alergias en código", () => {
  const ctx = { channel: "telegram", chatId: "c1", userId: null };
  it("añadir a alguien deja apuntada su tarea de alergias, sin depender de Lola", async () => {
    await anadirComensal("h", { nombre: "Leo", edad: 6 }, ctx);
    const leo = guardada.state.data.members.find((m) => m.name === "Leo");
    expect(abierta(`alergias:${leo.id}`)).toBe("abierta");
    const fila = filas.find((x) => x.clave === `alergias:${leo.id}`);
    expect(fila).toMatchObject({ kind: "pregunta", scope: "casa", chat_id: "c1" });
  });
  it("sin chat (no viene de una conversación) no se apunta nada", async () => {
    await anadirComensal("h", { nombre: "Leo", edad: 6 });
    expect(filas).toHaveLength(0);
  });
});
