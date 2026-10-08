import { describe, it, expect, vi, beforeEach } from "vitest";

// Un cliente de mentira que apunta cada llamada: tabla, operación, filtros y
// filas. Las lecturas devuelven `filasNube`.
const llamadas = [];
let filasNube = [];
vi.mock("./supabase.js", () => {
  const consulta = (tabla) => {
    const c = { tabla, op: null, filtros: [], filas: null, opciones: null };
    llamadas.push(c);
    const q = {
      select: (cols) => { c.op = "select"; c.cols = cols; return q; },
      delete: () => { c.op = "delete"; return q; },
      upsert: async (filas, opciones) => { c.op = "upsert"; c.filas = filas; c.opciones = opciones; return { error: null }; },
      eq: (col, val) => { c.filtros.push([col, val]); return q; },
      then: (ok) => ok(c.op === "select" ? { data: filasNube, error: null } : { error: null }),
    };
    return q;
  };
  return { supabase: { from: consulta } };
});

const { loadHouseholdDiscards, saveHouseholdDiscard, deleteHouseholdDiscard, subirDescartesPendientes, subirDescartesUnaVez } =
  await import("./householdDiscardsSync.js");

const descartes = { forever: ["r-1"], cooldownUntil: { "r-2": Date.parse("2026-11-01T00:00:00Z") } };

beforeEach(() => { llamadas.length = 0; filasNube = []; });

// Los descartes son de la casa: household_recipe_discards con household_id.
// La tabla por usuario (user_recipe_discards, 0010) no existe en producción:
// ninguna función puede tocarla.
describe("descartes en la nube, siempre de la casa", () => {
  it("carga los de la casa, filtrando por household_id, y quita los enfriamientos vencidos", async () => {
    filasNube = [
      { recipe_id: "r-1", is_permanent: true, cooldown_until: null },
      { recipe_id: "r-2", is_permanent: false, cooldown_until: "2999-01-01T00:00:00Z" },
      { recipe_id: "r-3", is_permanent: false, cooldown_until: "2000-01-01T00:00:00Z" },
    ];
    const r = await loadHouseholdDiscards("casa-1");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ tabla: "household_recipe_discards", op: "select", filtros: [["household_id", "casa-1"]] });
    expect(r.forever).toEqual(["r-1"]);
    expect(Object.keys(r.cooldownUntil)).toEqual(["r-2"]);
  });

  it("guarda un descarte con household_id y conflicto por (casa, receta)", async () => {
    await saveHouseholdDiscard("casa-1", "r-1", { isPermanent: true });
    await saveHouseholdDiscard("casa-1", "r-2", { cooldownUntil: Date.parse("2026-11-01T00:00:00Z") });
    expect(llamadas.map((c) => [c.tabla, c.op])).toEqual([
      ["household_recipe_discards", "upsert"],
      ["household_recipe_discards", "upsert"],
    ]);
    expect(llamadas[0].opciones).toEqual({ onConflict: "household_id,recipe_id" });
    expect(llamadas[0].filas).toEqual({ household_id: "casa-1", recipe_id: "r-1", is_permanent: true, cooldown_until: null });
    expect(llamadas[1].filas).toEqual({ household_id: "casa-1", recipe_id: "r-2", is_permanent: false, cooldown_until: "2026-11-01T00:00:00.000Z" });
  });

  it("recuperar borra solo esa receta de esa casa", async () => {
    await deleteHouseholdDiscard("casa-1", "r-1");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ tabla: "household_recipe_discards", op: "delete" });
    expect(llamadas[0].filtros).toEqual([["household_id", "casa-1"], ["recipe_id", "r-1"]]);
  });

  it("sube los pendientes a la casa", async () => {
    await subirDescartesPendientes("casa-1", descartes);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].tabla).toBe("household_recipe_discards");
    expect(llamadas[0].opciones).toEqual({ onConflict: "household_id,recipe_id" });
    expect(llamadas[0].filas).toEqual([
      { household_id: "casa-1", recipe_id: "r-1", is_permanent: true, cooldown_until: null },
      { household_id: "casa-1", recipe_id: "r-2", is_permanent: false, cooldown_until: "2026-11-01T00:00:00.000Z" },
    ]);
  });

  it("sin casa no toca la nube: ni la casa ni la tabla por usuario", async () => {
    const r = await loadHouseholdDiscards(null);
    await saveHouseholdDiscard(null, "r-1", { isPermanent: true });
    await deleteHouseholdDiscard(null, "r-1");
    await subirDescartesPendientes(null, descartes);
    expect(llamadas).toHaveLength(0);
    expect(r).toEqual({ forever: [], cooldownUntil: {} });
  });

  it("si no falta nada, no escribe", async () => {
    await subirDescartesPendientes("casa-1", { forever: [], cooldownUntil: {} });
    expect(llamadas).toHaveLength(0);
  });
});

// Lo local se sube una vez por casa y dispositivo, y sin pisar lo de la casa:
// (a) un enfriamiento viejo del dispositivo volvía temporal un descarte para
// siempre (upsert con is_permanent=false); (b) lo que un miembro sacaba de
// descartes volvía del localStorage de otro en cada carga.
describe("subirDescartesUnaVez", () => {
  const ahora = Date.parse("2026-10-08T12:00:00Z");
  const futuro = Date.parse("2026-11-01T00:00:00Z");
  const pasado = Date.parse("2026-09-01T00:00:00Z");
  let guardado;
  beforeEach(() => {
    guardado = new Map();
    globalThis.localStorage = {
      getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
      setItem: (k, v) => guardado.set(k, String(v)),
      removeItem: (k) => guardado.delete(k),
    };
  });

  it("no sube un enfriamiento de una receta que la casa tiene descartada para siempre", async () => {
    const local = { forever: [], cooldownUntil: { "r-1": futuro } };
    const nube = { forever: ["r-1"], cooldownUntil: {} };
    await subirDescartesUnaVez({ userId: "u-1", householdId: "casa-1", local, remote: nube, now: ahora });
    expect(llamadas.filter((c) => c.op === "upsert")).toHaveLength(0);
  });

  it("no sube enfriamientos vencidos", async () => {
    const local = { forever: [], cooldownUntil: { "r-2": pasado, "r-3": futuro } };
    await subirDescartesUnaVez({ userId: "u-1", householdId: "casa-1", local, remote: { forever: [], cooldownUntil: {} }, now: ahora });
    expect(llamadas[0].filas.map((f) => f.recipe_id)).toEqual(["r-3"]);
  });

  it("sube lo local una sola vez: lo que otro sacó de descartes no vuelve en la carga siguiente", async () => {
    const local = { forever: ["r-1"], cooldownUntil: {} };
    const vacia = { forever: [], cooldownUntil: {} };
    await subirDescartesUnaVez({ userId: "u-1", householdId: "casa-1", local, remote: vacia, now: ahora });
    expect(llamadas.filter((c) => c.op === "upsert")).toHaveLength(1);
    // Otro miembro recupera r-1; este dispositivo vuelve a cargar con r-1 en local.
    await subirDescartesUnaVez({ userId: "u-1", householdId: "casa-1", local, remote: vacia, now: ahora });
    expect(llamadas.filter((c) => c.op === "upsert")).toHaveLength(1);
  });

  it("sin casa no sube ni marca: se sube en la primera carga ya con casa", async () => {
    const local = { forever: ["r-1"], cooldownUntil: {} };
    const vacia = { forever: [], cooldownUntil: {} };
    await subirDescartesUnaVez({ userId: "u-1", householdId: null, local, remote: vacia, now: ahora });
    expect(llamadas).toHaveLength(0);
    await subirDescartesUnaVez({ userId: "u-1", householdId: "casa-1", local, remote: vacia, now: ahora });
    expect(llamadas.filter((c) => c.op === "upsert")).toHaveLength(1);
  });
});

// Que nadie vuelva a escribir en la tabla que no existe.
describe("user_recipe_discards no se usa en el código", () => {
  it("ni src/ ni api/ la consultan", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(import.meta.dirname, "..", "..");
    const usos = [];
    const recorrer = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules") recorrer(p); continue; }
        if (!/\.(m?js|jsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
        if (/from\(\s*["'`]user_recipe_discards/.test(readFileSync(p, "utf8"))) usos.push(p);
      }
    };
    recorrer(join(raiz, "src"));
    recorrer(join(raiz, "api"));
    expect(usos).toEqual([]);
  });
});
