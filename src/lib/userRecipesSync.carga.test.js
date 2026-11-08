import { describe, it, expect, vi, beforeEach } from "vitest";

// #316: si la carga de recetas fallaba (5xx, corte de red), devolvía [] igual
// que «no tienes ninguna»; todas las locales parecían solo locales y el upsert
// por id pisaba la versión más nueva, editada en otro dispositivo.

// Un cliente de mentira que apunta cada llamada; las lecturas devuelven
// `filasNube` o, si hay `errorNube`, el error.
const llamadas = [];
let filasNube = [];
let errorNube = null;
vi.mock("./supabase.js", () => {
  const consulta = (tabla) => {
    const c = { tabla, op: null, filas: null };
    llamadas.push(c);
    const q = {
      select: () => { c.op = "select"; return q; },
      eq: () => q,
      order: () => q,
      upsert: async (filas) => { c.op = "upsert"; c.filas = filas; return { error: null }; },
      then: (ok) => ok(errorNube ? { data: null, error: errorNube } : { data: filasNube, error: null }),
    };
    return q;
  };
  return { supabase: { from: consulta, storage: { from: () => ({}) } } };
});

const { loadUserRecipes, subirRecetasSoloLocales } = await import("./userRecipesSync.js");

const fila = (id, name) => ({ id, owner_id: "u-1", name, created_at: "2026-10-01T00:00:00Z" });
const subidas = () => llamadas.filter((c) => c.op === "upsert");

let guardado;
beforeEach(() => {
  llamadas.length = 0;
  filasNube = [];
  errorNube = null;
  guardado = new Map();
  globalThis.localStorage = {
    getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
    setItem: (k, v) => guardado.set(k, String(v)),
    removeItem: (k) => guardado.delete(k),
  };
});

describe("recetas propias: no se sube nada fiándose de una carga fallida", () => {
  // Este dispositivo tiene una copia vieja de user_1 (editada después en el
  // móvil) y una receta creada sin red, user_2.
  const local = [
    { id: "user_1", name: "Lentejas (versión vieja)" },
    { id: "user_2", name: "Creada sin red" },
  ];

  it("si la carga falló: cero upserts y nada escrito en el dispositivo", async () => {
    errorNube = { message: "503 Service Unavailable" };
    const carga = await loadUserRecipes("u-1");
    expect(carga.error).toBeTruthy();
    expect(carga.data).toBeNull();
    const n = await subirRecetasSoloLocales({ userId: "u-1", local, carga });
    expect(n).toBe(0);
    expect(subidas()).toHaveLength(0);
    expect(guardado.size).toBe(0);
  });

  it("con la carga buena sube solo la que la nube no tiene, no la vieja", async () => {
    filasNube = [fila("user_1", "Lentejas (versión nueva)")];
    const carga = await loadUserRecipes("u-1");
    expect(carga.error).toBeNull();
    expect(carga.data.map((r) => r.id)).toEqual(["user_1"]);
    await subirRecetasSoloLocales({ userId: "u-1", local, carga });
    expect(subidas()).toHaveLength(1);
    expect(subidas()[0].filas.map((f) => f.id)).toEqual(["user_2"]);
  });

  it("no sube las borradas en este dispositivo", async () => {
    const carga = await loadUserRecipes("u-1");
    await subirRecetasSoloLocales({ userId: "u-1", local, carga, deletedIds: new Set(["user_2"]) });
    expect(subidas()[0].filas.map((f) => f.id)).toEqual(["user_1"]);
  });

  it("sin carga (nadie la pasó) no sube nada", async () => {
    expect(await subirRecetasSoloLocales({ userId: "u-1", local })).toBe(0);
    expect(llamadas).toHaveLength(0);
  });
});
