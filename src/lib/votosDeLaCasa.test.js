import { describe, it, expect } from "vitest";
import { votosDeLaCasa, sinFavoritas, favoriteIdsForGroup, voteOf } from "./recipeVotes.js";
import { favoritasDeFilas, votosDeFavoritas } from "./recetasDeLaCasa.js";

// La casa tiene dos favoritas; quien abre la app tiene otra suya y un 👎.
const filas = [{ recipe_id: "lentejas", scope: null }, { recipe_id: "tortilla", scope: null }];
const personal = { paella: { v: "up", fav: "all" }, coliflor: "down", lentejas: { v: "up" } };
const favoritas = (votos) => [...favoriteIdsForGroup(votos, { label: "Familia" })].sort();

describe("las favoritas de una casa, iguales en la app y en Lola (#958)", () => {
  it("el motor de la app ve las mismas favoritas que Lola", () => {
    // Lola: solo household_favorites (api/_bot/casa.js).
    const deLola = votosDeFavoritas(favoritasDeFilas(filas));
    // La app: lo mismo, más la nota personal (householdFavoritesToVotes = votosDeFavoritas con voteOf).
    const deLaApp = votosDeLaCasa(personal, votosDeFavoritas(favoritasDeFilas(filas), personal, voteOf));
    expect(favoritas(deLaApp)).toEqual(favoritas(deLola));
    expect(favoritas(deLaApp)).toEqual(["lentejas", "tortilla"]);
  });

  it("la nota personal (👍/👎) se queda; la favorita personal no entra en la casa", () => {
    const v = votosDeLaCasa(personal, votosDeFavoritas(favoritasDeFilas(filas), personal, voteOf));
    expect(voteOf(v.coliflor)).toBe("down");
    expect(voteOf(v.lentejas)).toBe("up");
    expect(favoritas(v)).not.toContain("paella");
  });

  it("sin casa (sin cuenta), las favoritas personales son las únicas", () => {
    expect(votosDeLaCasa(personal, null)).toBe(personal);
  });

  it("sinFavoritas quita la favorita y deja la nota", () => {
    expect(sinFavoritas({ a: { v: "up", fav: "all" }, b: { fav: "all" }, c: "down" })).toEqual({ a: { v: "up" }, c: "down" });
  });
});
