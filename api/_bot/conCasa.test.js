/**
 * conCasa con varias escrituras a la vez sobre la misma casa (agente.js lanza
 * herramientas en paralelo). Caso real del 2 oct 2026: «Nat no come el finde
 * ni cena hoy» → 5 fuera_de_casa a la vez; 2 se rendían por choque y se perdían.
 * La base de mentira hace lo mismo que bot_save_casa: guarda solo si la
 * versión base coincide, y si no devuelve la actual.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ rev: 0, state: { data: { reglas: [] } }, choques: 0 }));
vi.mock("./db.js", () => ({
  eq: (x) => x,
  select: vi.fn(async (tabla) => {
    // Leer la casa tarda: es lo que hace que las escrituras se crucen.
    await new Promise((r) => setTimeout(r, 5));
    return tabla === "household_state" ? [{ state: structuredClone(db.state), bot_rev: db.rev, updated_at: "x" }] : [];
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  rpc: vi.fn(async (_fn, { p_base_rev, p_state }) => {
    await new Promise((r) => setTimeout(r, 5));
    if (p_base_rev !== db.rev) { db.choques++; return { ok: false, bot_rev: db.rev }; }
    db.rev++;
    db.state = p_state;
    return { ok: true, bot_rev: db.rev };
  }),
}));

const { conCasa } = await import("./casa.js");

const apuntar = (regla) => conCasa("casa-1", async (casa) => ({
  state: { ...casa.state, data: { ...casa.state.data, reglas: [...casa.state.data.reglas, regla] } },
  sinDeshacer: true,
}));

beforeEach(() => { db.rev = 0; db.state = { data: { reglas: [] } }; db.choques = 0; });

describe("conCasa: escrituras a la vez en la misma casa", () => {
  it("las 5 se guardan, sin choques", async () => {
    const r = await Promise.all(["vie-cena", "sab-comida", "sab-cena", "dom-comida", "dom-cena"].map(apuntar));
    expect(r.every((x) => x.ok)).toBe(true);
    expect(db.state.data.reglas.sort()).toEqual(["dom-cena", "dom-comida", "sab-cena", "sab-comida", "vie-cena"]);
    expect(db.choques).toBe(0);
  });

  it("un conCasa dentro de otro de la misma casa no se queda esperando", async () => {
    const r = await conCasa("casa-1", async () => {
      await apuntar("dentro");
      return null;
    });
    expect(r.ok).toBe(true);
    expect(db.state.data.reglas).toEqual(["dentro"]);
  });

  it("si una falla, las siguientes siguen", async () => {
    const mala = conCasa("casa-1", async () => { throw new Error("roto"); });
    const buena = apuntar("despues");
    await expect(mala).rejects.toThrow("roto");
    expect((await buena).ok).toBe(true);
  });
});
