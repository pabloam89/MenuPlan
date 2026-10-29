import { describe, it, expect } from "vitest";
import { conQuienEscribe, sinSecciones } from "./agente.js";
import { quitarLoQueChoca } from "./generar.js";

// Raíz 2 de la auditoría (#958): lo de seguridad no depende de que el modelo
// haga caso de una línea del prompt.

const FICHA = {
  estable: "SEGURIDAD\n- Leo: alergia al huevo\n- Ana: embarazo\nCASA\n- Leo, 6 años\nCOCINA\n- Aparatos: horno\nRECETARIO\n- 3 propias",
  delDia: "HOY\n- Hoy: lentejas",
};

describe("la ficha de alguien de fuera", () => {
  it("no lleva la salud ni las personas de la casa", () => {
    const f = conQuienEscribe(FICHA, "ajeno");
    expect(f.estable).not.toMatch(/huevo|embarazo|Leo/);
    expect(f.estable).toMatch(/COCINA/);
    expect(f.estable).toMatch(/RECETARIO/);
  });

  it("sin papel, igual que de fuera (falla cerrado)", () => {
    expect(conQuienEscribe(FICHA, undefined).estable).not.toMatch(/huevo/);
  });

  it("los de la casa la reciben entera", () => {
    for (const papel of ["owner", "editor", "viewer"]) expect(conQuienEscribe(FICHA, papel).estable).toMatch(/huevo/);
  });

  it("la ficha sin revisar, de una línea, también se quita", () => {
    expect(sinSecciones("SEGURIDAD: SIN REVISAR · PARA EMPEZAR FALTA: alergias", ["SEGURIDAD"])).toBe("");
  });
});

describe("la última puerta antes de guardar un menú", () => {
  it("vacía el hueco que choca y dice cuál", () => {
    const plan = { g1: { "Lun-Comida": { recipeId: "pescado_1", firstRecipeId: "crema_1" }, "Mar-Cena": { recipeId: "pollo_1" } } };
    const m = { choquesDelPlan: () => [{ groupId: "g1", clave: "Lun-Comida", campo: "recipeId", recipeId: "pescado_1", nombre: "Merluza" }] };
    expect(quitarLoQueChoca(m, {}, plan)).toEqual(["Merluza (Lun Comida)"]);
    expect(plan.g1["Lun-Comida"].recipeId).toBeNull();
    expect(plan.g1["Lun-Comida"].firstRecipeId).toBe("crema_1");
    expect(plan.g1["Mar-Cena"].recipeId).toBe("pollo_1");
  });

  it("sin choques no toca nada", () => {
    const plan = { g1: { "Lun-Comida": { recipeId: "pollo_1" } } };
    expect(quitarLoQueChoca({ choquesDelPlan: () => [] }, {}, plan)).toEqual([]);
    expect(plan.g1["Lun-Comida"].recipeId).toBe("pollo_1");
  });
});
