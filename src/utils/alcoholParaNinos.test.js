/**
 * El vinagre no es alcohol, y por eso 50 recetas estrella volvieron al menú.
 *
 * `ALCOHOL_RE` pregunta «¿esta palabra nombra una bebida alcohólica?» y para
 * «vino» la respuesta es sí — la frontera de palabra está bien puesta y aun
 * así «Vinagre de vino» casaba, porque ahí «vino» ES una palabra completa.
 * Lo mismo `\bjerez\b` con «Vinagre de Jerez» y `\bsidra\b` con «Vinagre de
 * sidra».
 *
 * Se prueba por la puerta pública (`recipeViolatesHardSafety`), que es la que
 * usa la app, y no contra el regex interno: lo que importa no es cómo está
 * escrita la regla sino qué platos deja pasar.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { alcoholParaNinos, nombraAlcohol, recipeViolatesHardSafety } from "./filterRecipes.js";

const conNinos = (ingredientes) =>
  recipeViolatesHardSafety({ ingredients: ingredientes.map((name) => ({ name })) }, { hasKids: true });

describe("alcohol en casas con niños", () => {
  it("deja pasar los vinagres", () => {
    expect(conNinos(["Vinagre de vino"])).toBe(false);
    expect(conNinos(["Vinagre de Jerez"])).toBe(false);
    expect(conNinos(["Vinagre de sidra"])).toBe(false);
    expect(conNinos(["Vinagre balsámico"])).toBe(false);
    expect(conNinos(["Vinagre"])).toBe(false);
  });

  it("sigue bloqueando el alcohol de verdad", () => {
    expect(conNinos(["Vino blanco"])).toBe(true);
    expect(conNinos(["Vino tinto"])).toBe(true);
    expect(conNinos(["Jerez seco"])).toBe(true);
    expect(conNinos(["Sidra natural"])).toBe(true);
    expect(conNinos(["Brandy"])).toBe(true);
    expect(conNinos(["Cava brut"])).toBe(true);
  });

  it("y bloquea igual cuando el alcohol viaja con un vinagre al lado", () => {
    expect(conNinos(["Vinagre de vino", "Vino blanco"])).toBe(true);
  });

  /**
   * SUELO MEDIDO sobre el catálogo real, no un caso inventado.
   *
   * Antes del arreglo, 123 recetas estrella marcadas `kidFriendly: true` caían
   * igualmente por el filtro de alcohol, y en 50 de ellas el único disparador
   * era un vinagre: el salmorejo, cuatro gazpachos y casi todo el bloque de
   * ensaladas. Si alguien vuelve a romperlo, este número lo dice.
   */
  it("no deja fuera a las recetas que solo llevan vinagre", () => {
    const R = "src/data/recipes";
    const recetas = readdirSync(R)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => JSON.parse(readFileSync(`${R}/${f}`, "utf8")));

    const soloVinagre = recetas.filter((r) => {
      if (!r.estrella || !r.kidFriendly) return false;
      const nombres = (r.ingredients ?? []).map((i) => i.name);
      const tieneVinagre = nombres.some((n) => /vinagre/i.test(n));
      if (!tieneVinagre) return false;
      return recipeViolatesHardSafety(r, { hasKids: true });
    });

    // Las que siguen bloqueadas teniendo vinagre son las que ADEMÁS llevan
    // alcohol de verdad; ninguna puede estarlo por el vinagre solo.
    for (const r of soloVinagre) {
      const otros = (r.ingredients ?? [])
        .map((i) => i.name)
        .filter((n) => !/vinagre/i.test(n));
      expect(
        recipeViolatesHardSafety({ ingredients: otros.map((name) => ({ name })) }, { hasKids: true }),
        `«${r.name}» está bloqueada, pero sin sus vinagres ya no lo estaría`,
      ).toBe(true);
    }
  });
});

/**
 * EL ALCOHOL QUE SE CUECE NO CUENTA (Pablo, 10 nov 2026). Con niños en casa
 * caían 124 recetas por llevar vino, entre ellas la boloñesa, la lasaña y
 * ocho de los cincuenta clásicos; ni elegidas a mano entraban. Ahora la receta
 * dice si su alcohol se cuece (`alcoholCocido`), y sin la marca sigue fuera.
 */
describe("alcohol cocido en casas con niños", () => {
  const R = "src/data/recipes";
  const recetas = readdirSync(R)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(`${R}/${f}`, "utf8")))
    .filter((r) => r && typeof r === "object" && r.id);
  const porId = Object.fromEntries(recetas.map((r) => [r.id, r]));
  const fuera = (r) => recipeViolatesHardSafety(r, { hasKids: true });

  it("con la marca entra; sin ella, el mismo vino la deja fuera", () => {
    const vino = { ingredients: [{ name: "Vino tinto" }] };
    expect(fuera({ ...vino, alcoholCocido: true })).toBe(false);
    expect(fuera(vino)).toBe(true);
    expect(alcoholParaNinos({ ...vino, alcoholCocido: true })).toBe(false);
    expect(alcoholParaNinos(vino)).toBe(true);
  });

  it("la boloñesa y la lasaña vuelven al menú con niños", () => {
    for (const id of ["pasta_arroces_002", "pasta_arroces_059"]) {
      expect(porId[id], `${id} ya no está en el catálogo`).toBeTruthy();
      expect(fuera(porId[id]), porId[id].name).toBe(false);
    }
  });

  // Tiramisú (licor en el café), tarta borracha (ron en el almíbar templado),
  // Café de París (brandy en la mantequilla) y consomé con jerez (al final).
  const CRUDO = ["carnes_099", "postres_023", "postres_034", "sopas_cremas_058"];

  it("lo que se añade crudo sigue fuera", () => {
    for (const id of CRUDO) {
      expect(porId[id], `${id} ya no está en el catálogo`).toBeTruthy();
      expect(fuera(porId[id]), porId[id].name).toBe(true);
    }
  });

  /**
   * Y lo demás está decidido: cada receta con alcohol o lleva la marca o es
   * de las crudas. Una receta nueva con vino hace fallar esto hasta que
   * alguien lea sus pasos y diga si se cuece; mientras, queda fuera del menú
   * con niños (alcoholParaNinos), que es el lado seguro.
   */
  it("toda receta con alcohol está decidida: cocida o de las crudas", () => {
    const sinDecidir = recetas
      .filter((r) => (r.ingredients ?? []).some((i) => nombraAlcohol(i.name)) && r.alcoholCocido !== true)
      .map((r) => r.id)
      .sort();
    expect(sinDecidir).toEqual(CRUDO);
  });

  it("solo lleva la marca quien tiene alcohol", () => {
    const sobra = recetas
      .filter((r) => r.alcoholCocido && !(r.ingredients ?? []).some((i) => nombraAlcohol(i.name)))
      .map((r) => `${r.id} ${r.name}`);
    expect(sobra).toEqual([]);
  });
});
