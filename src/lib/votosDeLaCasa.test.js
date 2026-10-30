import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { votosDeLaCasa, sinFavoritas, favoriteIdsForGroup, voteOf, favScopeOf, votarReceta } from "./recipeVotes.js";
import { favoritasDeFilas, votosDeFavoritas } from "./recetasDeLaCasa.js";
import { votosAlCargar } from "./householdFavoritesSync.js";

// La casa tiene dos favoritas; quien abre la app tiene otra suya y un 👎.
const filas = [{ recipe_id: "lentejas", scope: null }, { recipe_id: "tortilla", scope: null }];
const personal = { paella: { v: "up", fav: "all" }, coliflor: "down", lentejas: { v: "up" } };
const favoritas = (votos) => [...favoriteIdsForGroup(votos, { label: "Familia" })].sort();
const carga = { data: favoritasDeFilas(filas), error: null };

describe("las favoritas de una casa, iguales en la app y en Lola (#958)", () => {
  it("al cargar con casa, el motor de la app ve las mismas favoritas que Lola", () => {
    // Lola: solo household_favorites (api/_bot/casa.js).
    const deLola = votosDeFavoritas(favoritasDeFilas(filas));
    const deLaApp = votosAlCargar(personal, "h1", carga);
    expect(favoritas(deLaApp)).toEqual(favoritas(deLola));
    expect(favoritas(deLaApp)).toEqual(["lentejas", "tortilla"]);
  });

  it("la nota personal (👍/👎) se queda; la favorita personal no entra en la casa", () => {
    const v = votosAlCargar(personal, "h1", carga);
    expect(voteOf(v.coliflor)).toBe("down");
    expect(voteOf(v.lentejas)).toBe("up");
    expect(favoritas(v)).not.toContain("paella");
  });

  it("sin casa, o si household_favorites no se pudo leer, las personales", () => {
    expect(votosAlCargar(personal, null, carga)).toBe(personal);
    expect(votosAlCargar(personal, "h1", { data: null, error: { message: "corte" } })).toBe(personal);
    expect(votosDeLaCasa(personal, null)).toBe(personal);
  });

  it("sinFavoritas quita la favorita y deja la nota", () => {
    expect(sinFavoritas({ a: { v: "up", fav: "all" }, b: { fav: "all" }, c: "down" })).toEqual({ a: { v: "up" }, c: "down" });
  });
});

describe("votar con casa no borra la favorita personal (#958)", () => {
  it("un 👎 a una favorita personal guarda el voto y la favorita sigue", () => {
    const casa = votosAlCargar(personal, "h1", carga);
    const v = votarReceta(casa, personal, "paella", "down");
    expect(voteOf(v.guardar)).toBe("down");
    expect(favScopeOf(v.guardar)).toBe("all");
    expect(favoritas(v.casa)).not.toContain("paella");
  });

  it("quitar el voto de una favorita personal no borra la fila: queda la favorita", () => {
    const v = votarReceta(votosAlCargar(personal, "h1", carga), personal, "paella", "up");
    expect(v.guardar).not.toBeNull();
    expect(favScopeOf(v.guardar)).toBe("all");
  });

  it("App.jsx guarda el voto desde los personales (votarReceta), no desde los de la casa", () => {
    const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
    const votar = app.slice(app.indexOf("const handleVoteRecipe"), app.indexOf("const handleSetFavoriteScope"));
    expect(votar).toContain("votarReceta(");
    expect(votar).not.toContain("toggleRecipeVote(data.recipeVotes");
  });
});
