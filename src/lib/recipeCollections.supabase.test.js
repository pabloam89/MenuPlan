import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import { deleteRecipeFolder } from "./recipeCollections.js";

beforeEach(() => {
  Object.keys(supabase).forEach((k) => delete supabase[k]);
});

/** Cliente falso que apunta cada delete con sus filtros: { table, eq: {col: val} }. */
function espiarDeletes() {
  const borrados = [];
  supabase.from = (table) => {
    const q = {
      delete: () => {
        const b = { table, eq: {} };
        borrados.push(b);
        const filtro = {
          eq: (col, val) => ((b.eq[col] = val), filtro),
          then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
        };
        return filtro;
      },
    };
    return q;
  };
  return borrados;
}

describe("deleteRecipeFolder", () => {
  it("borra también las filas de recipe_collections de esa carpeta", async () => {
    // Sin esto, loadRecipeCollections las volvía a traer en la siguiente
    // carga: recetas apuntando a una carpeta que ya no existe.
    const borrados = espiarDeletes();
    await deleteRecipeFolder("u-1", "fld_abc");
    const pertenencias = borrados.find((b) => b.table === "recipe_collections");
    expect(pertenencias?.eq).toEqual({ user_id: "u-1", collection_id: "fld_abc" });
    const carpeta = borrados.find((b) => b.table === "recipe_folders");
    expect(carpeta?.eq).toEqual({ user_id: "u-1", id: "fld_abc" });
  });
});
