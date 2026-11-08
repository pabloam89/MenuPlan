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

  it("el ámbito va por el tipo del grupo, no por cómo se llame", () => {
    const votos = cargar({}, { "r-1": { scope: "Adultos" } });
    expect(favoriteIdsForGroup(votos, { label: "Los mayores", tipo: "adultos" }).has("r-1")).toBe(true);
    expect(favoriteIdsForGroup(votos, { label: "Adultos", tipo: "ninos" }).has("r-1")).toBe(false);
    // El menú único de la casa recibe todas, se llame como se llame.
    expect(favoriteIdsForGroup(votos, { label: "Casa", tipo: "familia" }).has("r-1")).toBe(true);
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

  // Quitar de favoritas una receta con 👍 deja la entrada { v: "up" }: no es
  // null y App.jsx la guardaba. Con scope null, que es «todos»: al recargar
  // volvía a ser favorita de toda la casa.
  it("una entrada que ya no es favorita (solo 👍) borra la fila, no la guarda con scope null", async () => {
    const llamadas = [];
    const q = {
      upsert: (fila) => (llamadas.push(["upsert", fila]), Promise.resolve({ error: null })),
      delete: () => (llamadas.push(["delete"]), q),
      eq: (...a) => (llamadas.push(["eq", ...a]), q),
      then: (ok, ko) => Promise.resolve({ error: null }).then(ok, ko),
    };
    supabase.from = () => q;
    await saveHouseholdFavorite("h-1", "r-1", { v: "up" });
    expect(llamadas.map((l) => l[0])).not.toContain("upsert");
    expect(llamadas).toContainEqual(["eq", "recipe_id", "r-1"]);
    expect(llamadas[0]).toEqual(["delete"]);
  });
});
