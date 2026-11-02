import { describe, it, expect } from "vitest";
import { pickCatalogReplacement, chocaConElGrupo, choquesDelPlan, motivoDelChoque } from "./aiPlanner.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

// La puerta de seguridad (#958, raíz 2): ningún atajo coloca un plato que
// choque con alguien de su grupo. Pasaba con lo pedido por su nombre que el
// motor había rechazado por alergia: Lola lo metía a la fuerza (forcedRecipe).

const pescado = recipeCatalog.find((r) => (r.allergens ?? []).includes("pescado") && r.mealRole?.includes("segundo") && r.category !== "bebes");
const sinAlergenos = recipeCatalog.find((r) => !(r.allergens ?? []).length && r.mealRole?.includes("segundo") && r.category !== "bebes");
const group = { id: "g1", label: "Familia", memberIds: ["m1", "m2"] };
const datos = (alergias = ["pescado"]) => ({
  members: [{ id: "m1", age: 35 }, { id: "m2", age: 8, allergies: alergias }],
  allergiesReviewed: true, groups: [group], schedule: {},
});
const plan = (recipeId) => ({ g1: { "Lun-Comida": { recipeId, eaters: 2 } } });

describe("puerta de seguridad del plan", () => {
  it("hay recetas de prueba en el catálogo", () => {
    expect(pescado).toBeTruthy();
    expect(sinAlergenos).toBeTruthy();
  });

  it("un plato con el alérgeno de alguien del grupo choca; sin él, no", () => {
    expect(chocaConElGrupo(pescado, datos(), group)).toBe(true);
    expect(chocaConElGrupo(pescado, datos([]), group)).toBe(false);
    expect(chocaConElGrupo(sinAlergenos, datos(), group)).toBe(false);
  });

  it("el plato elegido a mano (forcedRecipe) no se coloca si choca", () => {
    const opts = { groupId: "g1", day: "Lun", meal: "Comida", course: "main" };
    expect(pickCatalogReplacement(datos(), plan(sinAlergenos.id), { ...opts, forcedRecipe: pescado })).toBeNull();
    expect(pickCatalogReplacement(datos([]), plan(sinAlergenos.id), { ...opts, forcedRecipe: pescado })?.recipeId).toBeTruthy();
  });

  it("choquesDelPlan encuentra el plato que choca, y con `antes` solo mira lo que cambia", () => {
    const conPescado = plan(pescado.id);
    expect(choquesDelPlan(datos(), conPescado)).toEqual([
      expect.objectContaining({ groupId: "g1", clave: "Lun-Comida", campo: "recipeId", recipeId: pescado.id }),
    ]);
    expect(choquesDelPlan(datos(), conPescado, { antes: conPescado })).toEqual([]);
    expect(choquesDelPlan(datos(), plan(sinAlergenos.id))).toEqual([]);
  });

  it("un grupo sin nadie no cuenta", () => {
    const vacio = { ...datos(), groups: [{ ...group, memberIds: [] }] };
    expect(choquesDelPlan(vacio, plan(pescado.id))).toEqual([]);
  });
});

describe("motivoDelChoque: la puerta dice por qué", () => {
  it("sin choque no hay motivo", () => {
    expect(motivoDelChoque(pescado, datos([]), group)).toBeNull();
  });

  it("nombra a la persona y su alergia", () => {
    const d = datos();
    d.members[1].name = "Ana";
    expect(motivoDelChoque(pescado, d, group)).toBe(`«${pescado.name}» no entra: Ana tiene alergia a pescado`);
  });

  it("nombra la intolerancia", () => {
    const d = datos([]);
    d.members[1] = { ...d.members[1], name: "Ana", intolerances: ["vegetariano"] };
    expect(motivoDelChoque(pescado, d, group)).toContain("Ana: vegetariano");
  });

  it("la regla de bebé no es un choque: coincide con la puerta", () => {
    const bebe = recipeCatalog.find((r) => r.category === "bebes" && !(r.allergens ?? []).length && !r.puedeContener?.length);
    const d = { ...datos([]), allergiesReviewed: false };
    expect(chocaConElGrupo(bebe, d, group)).toBe(false);
    expect(motivoDelChoque(bebe, d, group)).toBeNull();
  });

  it("sin revisar lo dice, sin inventarse una alergia", () => {
    const d = { ...datos([]), allergiesReviewed: false };
    d.members = d.members.map((m) => ({ ...m, name: "Ana" }));
    expect(motivoDelChoque(pescado, d, group)).toContain("faltan por revisar las alergias de Ana, Ana");
    d.members = d.members.map((m) => ({ ...m, name: "" }));
    expect(motivoDelChoque(pescado, d, group)).toContain("de la casa");
  });
});
