import { describe, it, expect, vi, beforeEach } from "vitest";

// #958: un cotitular (editor) ve las recetas del titular de la casa (política
// de la 0104), de solo lectura. Nunca se suben a su nombre: con su owner_id la
// RLS las rechazaría y, en un upsert de varias, tumbaría también las suyas.

const llamadas = [];
let filasNube = [];
let errorNube = null;
let lanzar = false;
vi.mock("./supabase.js", () => {
  const consulta = (tabla) => {
    if (lanzar) throw new Error("sin red");
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

const { loadRecetasDelTitular, subirRecetasSoloLocales, upsertUserRecipe, upsertUserRecipes } = await import("./userRecipesSync.js");
const { esRecetaDelTitular, unirConLasDelTitular } = await import("./userRecipesFila.js");
const { filterMyLibraryRecipes } = await import("./userRecipes.js");

const subidas = () => llamadas.filter((c) => c.op === "upsert");
const delTitular = { id: "user_t1", name: "Lentejas del titular", source: "user", owner: { id: "titular" }, soloLectura: true };
const propia = { id: "user_p1", name: "Crema del cotitular", source: "user", owner: { id: "editor" } };

beforeEach(() => {
  llamadas.length = 0;
  filasNube = [];
  errorNube = null;
  lanzar = false;
});

describe("recetas del titular para un cotitular", () => {
  it("se cargan marcadas de solo lectura", async () => {
    filasNube = [{ id: "user_t1", owner_id: "titular", name: "Lentejas del titular" }];
    const { data, error } = await loadRecetasDelTitular("titular");
    expect(error).toBeNull();
    expect(data.map((x) => x.id)).toEqual(["user_t1"]);
    expect(data.every(esRecetaDelTitular)).toBe(true);
  });

  it("sin ninguna visible (plan B: sin la 0104 la RLS no da ninguna), lista vacía y sin error", async () => {
    expect(await loadRecetasDelTitular("titular")).toEqual({ data: [], error: null });
  });

  it("si la lectura falla o lanza, lo dice (no es «no tiene ninguna») y no lanza", async () => {
    errorNube = { message: "503" };
    const fallo = await loadRecetasDelTitular("titular");
    expect(fallo.data).toBeNull();
    expect(fallo.error).toBeTruthy();
    errorNube = null;
    lanzar = true;
    const tiro = await loadRecetasDelTitular("titular");
    expect(tiro.data).toBeNull();
    expect(tiro.error).toBeTruthy();
  });

  it("no se suben nunca: ni al rellenar lo solo local, ni en bloque, ni una a una", async () => {
    const carga = { data: [], error: null };
    const n = await subirRecetasSoloLocales({ userId: "editor", local: [delTitular, propia], carga });
    expect(n).toBe(1);
    expect(subidas()).toHaveLength(1);
    expect(subidas()[0].filas.map((f) => f.id)).toEqual(["user_p1"]);

    llamadas.length = 0;
    await upsertUserRecipes("editor", [delTitular]);
    expect(subidas()).toHaveLength(0);

    await upsertUserRecipe("editor", delTitular);
    expect(subidas()).toHaveLength(0);
  });

  it("las propias se suben igual aunque vayan mezcladas con las del titular", async () => {
    await upsertUserRecipes("editor", [delTitular, propia]);
    expect(subidas()).toHaveLength(1);
    expect(subidas()[0].filas.map((f) => f.id)).toEqual(["user_p1"]);
    expect(subidas()[0].filas[0].owner_id).toBe("editor");
  });

  it("salen en el recetario del cotitular, detrás de las suyas y sin repetir id", () => {
    const user = { id: "editor" };
    const repetida = { ...delTitular, id: "user_p1" };
    const todas = unirConLasDelTitular(filterMyLibraryRecipes([propia], user), [delTitular, repetida]);
    expect(todas.map((r) => r.id)).toEqual(["user_p1", "user_t1"]);
    expect(filterMyLibraryRecipes(todas, user).map((r) => r.id)).toEqual(["user_p1", "user_t1"]);
  });
});
