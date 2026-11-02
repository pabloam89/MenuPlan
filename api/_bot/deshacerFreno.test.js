import { describe, it, expect, vi, beforeEach } from "vitest";
import { familiaDeFilas, RPC_FAMILIA, RPC_FICHA, fichaV1, RPC_PREFERENCIAS_DE_CASA, preferenciasDeFilas } from "./familiaDePrueba.js";

const ahora = { members: [{ id: "m1", name: "Leo", allergies: ["Huevos"] }] };
// La hora de la foto se pone al leerla, no al cargar el fichero: deshacer()
// se niega si la casa se guardó más de 5 s después de la foto, y con el PC
// cargado importar el bot ya tarda más que eso (medido: 11 s el 8 oct 2026).
const foto = { id: 1, bot_rev_despues: 7, antes: { state: { data: { members: [{ id: "m1", name: "Leo", allergies: [] }] } } } };
// La familia sale de sus filas (personas_de_casa); lo demás, un guardado que sale bien.
const rpc = vi.fn(async (fn) => (fn === RPC_FAMILIA ? familiaDeFilas(ahora.members) : fn === RPC_FICHA ? fichaV1() : fn === RPC_PREFERENCIAS_DE_CASA ? preferenciasDeFilas() : { ok: true }));
/** Lo que se ha intentado escribir: todo menos leer la familia y la ficha. */
const escritas = () => rpc.mock.calls.map(([fn]) => fn).filter((fn) => fn !== RPC_FAMILIA && fn !== RPC_FICHA && fn !== RPC_PREFERENCIAS_DE_CASA);

vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla) => {
    if (tabla === "bot_deshacer") return [{ ...foto, created_at: new Date().toISOString() }];
    if (tabla === "household_state") return [{ state: { data: ahora }, bot_rev: 7, updated_at: new Date().toISOString() }];
    return [];
  }),
  insert: vi.fn(async () => []), update: vi.fn(async () => []), rpc, eq: (x) => `eq.${x}`,
}));

const { deshacer } = await import("./casa.js");
const { deshacerRapido } = await import("./turno.js");
const { frenoDeshacer } = await import("./supervisor.js");
const { conOperacion, ponerAutor } = await import("./operacion.js");
/** Un turno de Lola de una persona de la casa que la edita: deshacer siempre va dentro de uno. */
const enTurno = (fn) => conOperacion({ chat: "1", persona: "9", mid: "55" }, () => { ponerAutor({ userId: "u1", papel: "owner", canal: "telegram" }); return fn(); });

describe("el freno llega a deshacer", () => {
  beforeEach(() => rpc.mockClear());

  it("con un «deshaz» suelto no restaura: no llama a guardar", async () => {
    const r = await deshacer("casa", { freno: (a, b) => frenoDeshacer(a, b, "deshaz", "") });
    expect(r).toMatch(/No lo he deshecho/);
    expect(escritas()).toEqual([]);
  });

  it("con «No es así» tras «Apuntado: Leo es alérgico al huevo», sí intenta restaurar", async () => {
    await enTurno(() => deshacer("casa", { freno: (a, b) => frenoDeshacer(a, b, "Deshaz lo último que has cambiado", "✅ Apuntado: Leo es alérgico al huevo.") }));
    // El documento y la familia (la alergia de Leo vuelve a como estaba, por escribir_persona).
    expect(escritas()).toEqual(["bot_save_casa", "escribir_persona"]);
  });

  it("la vía rápida no deshace lo que quita protección: pasa a Lola", async () => {
    expect(await deshacerRapido("casa")).toBe(null);
    expect(escritas()).toEqual([]);
  });
});
