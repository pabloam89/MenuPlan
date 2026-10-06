import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import { householdFavoritesToVotes, saveHouseholdFavorite } from "./householdFavoritesSync.js";
import {
  mergeVotes,
  isRecipeFavorite,
  getFavoriteScope,
  getUserRecipeVote,
  favoriteIdsForGroup,
} from "./recipeVotes.js";

beforeEach(() => {
  Object.keys(supabase).forEach((k) => delete supabase[k]);
});

// Lo mismo que hace App.jsx al cargar de la nube: votos personales y, encima,
// las favoritas de la casa.
function cargar(personal, filasCasa) {
  return mergeVotes(personal, householdFavoritesToVotes(filasCasa, personal));
}

describe("favoritas de la casa al cargar", () => {
  it("una favorita de la casa sigue siendo favorita después de mezclar", () => {
    const votos = cargar({}, { "r-1": { scope: null } });
    expect(isRecipeFavorite(votos, "r-1")).toBe(true);
    expect(getFavoriteScope(votos, "r-1")).toBe("all");
  });

  it("no borra la nota personal de una receta que es favorita de la casa", () => {
    const votos = cargar({ "r-1": { v: "up" } }, { "r-1": { scope: null } });
    expect(getUserRecipeVote(votos, "r-1")).toBe("up");
    expect(isRecipeFavorite(votos, "r-1")).toBe(true);
  });

  it("el ámbito en texto (\"Adultos,Niños\") vuelve como lista de grupos", () => {
    const votos = cargar({}, { "r-1": { scope: "Adultos,Niños" } });
    expect(getFavoriteScope(votos, "r-1")).toEqual(["Adultos", "Niños"]);
    expect(favoriteIdsForGroup(votos, "Niños").has("r-1")).toBe(true);
    expect(favoriteIdsForGroup(votos, "Bebé").has("r-1")).toBe(false);
  });
});

describe("saveHouseholdFavorite", () => {
  function espiarUpsert() {
    const filas = [];
    supabase.from = () => ({
      upsert: (fila) => {
        filas.push(fila);
        return Promise.resolve({ error: null });
      },
    });
    return filas;
  }

  it("guarda el ámbito de la entrada tal y como la tiene la app ({ v, fav })", async () => {
    const filas = espiarUpsert();
    await saveHouseholdFavorite("h-1", "r-1", { v: "up", fav: ["Niños"] });
    expect(filas[0].scope).toBe("Niños");
  });

  it("\"all\" se guarda como null, que es lo que la columna entiende por «todos»", async () => {
    const filas = espiarUpsert();
    await saveHouseholdFavorite("h-1", "r-1", { fav: "all" });
    expect(filas[0].scope).toBeNull();
  });

  it("varios grupos se guardan separados por comas, como la migración 0018", async () => {
    const filas = espiarUpsert();
    await saveHouseholdFavorite("h-1", "r-1", { fav: ["Adultos", "Niños"] });
    expect(filas[0].scope).toBe("Adultos,Niños");
  });
});
