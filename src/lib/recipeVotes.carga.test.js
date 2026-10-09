import { describe, it, expect, vi, beforeEach } from "vitest";

// #317: si la carga de votos fallaba, devolvía {} igual que «no has votado
// nada»; App.jsx subía todos los votos locales con un upsert por
// (usuario, receta) y pisaba los cambiados en otro dispositivo (quitar una
// favorita en el móvil volvía a ponerla el portátil).

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
      upsert: async (filas) => { c.op = "upsert"; c.filas = filas; return { error: null }; },
      then: (ok) => ok(errorNube ? { data: null, error: errorNube } : { data: filasNube, error: null }),
    };
    return q;
  };
  return { supabase: { from: consulta } };
});

const { loadRecipeVotes, subirVotosSoloLocales } = await import("./recipeVotes.js");

const subidas = () => llamadas.filter((c) => c.op === "upsert");

beforeEach(() => {
  llamadas.length = 0;
  filasNube = [];
  errorNube = null;
});

describe("votos: no se sube nada fiándose de una carga fallida", () => {
  // En este dispositivo r-1 sigue favorita (en el móvil se quitó) y r-2 es
  // un voto hecho sin red.
  const local = { "r-1": { fav: "all" }, "r-2": { v: "up" } };

  it("si la carga falló: cero upserts", async () => {
    errorNube = { message: "503 Service Unavailable" };
    const carga = await loadRecipeVotes("u-1");
    expect(carga.error).toBeTruthy();
    expect(carga.data).toBeNull();
    expect(await subirVotosSoloLocales({ userId: "u-1", local, carga })).toBe(0);
    expect(subidas()).toHaveLength(0);
  });

  it("con la carga buena sube solo lo que la nube no tiene", async () => {
    filasNube = [{ recipe_id: "r-1", vote: "up", is_favorite: false, scope: null }];
    const carga = await loadRecipeVotes("u-1");
    expect(carga.error).toBeNull();
    await subirVotosSoloLocales({ userId: "u-1", local, carga });
    expect(subidas()).toHaveLength(1);
    expect(subidas()[0].filas.map((f) => f.recipe_id)).toEqual(["r-2"]);
  });

  it("sin carga (nadie la pasó) no sube nada", async () => {
    expect(await subirVotosSoloLocales({ userId: "u-1", local })).toBe(0);
    expect(llamadas).toHaveLength(0);
  });
});
