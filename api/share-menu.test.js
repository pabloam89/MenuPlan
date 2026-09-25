import { describe, it, expect } from "vitest";
import { resumenDePlatos, cuentaDePlatos, descripcionDelMenu } from "./share-menu.js";

/** La forma que produce lib/sharedMenu.js#buildSharedMenuPayload. */
const payload = (dias) => ({ weeks: [{ weekStart: "2026-09-21", days: dias }] });
const dia = (day, ...nombres) => ({
  day,
  meals: [{ slot: "Comida", dishes: nombres.map((name) => ({ name, recipeId: name, readable: true })) }],
});

describe("el resumen que lee WhatsApp", () => {
  it("coge los primeros y se para en el tope", () => {
    const p = payload([dia("Lun", "Lentejas", "Tortilla"), dia("Mar", "Merluza", "Pisto", "Arroz")]);
    expect(resumenDePlatos(p, 4)).toEqual(["Lentejas", "Tortilla", "Merluza", "Pisto"]);
  });

  it("cuenta la semana entera, no la muestra", () => {
    const p = payload([dia("Lun", "Lentejas", "Tortilla"), dia("Mar", "Merluza", "Pisto", "Arroz")]);
    expect(cuentaDePlatos(p)).toBe(5);
  });

  it("la frase dice cuántos quedan fuera", () => {
    const p = payload([dia("Lun", "Lentejas", "Tortilla"), dia("Mar", "Merluza", "Pisto", "Arroz")]);
    expect(descripcionDelMenu(p)).toBe("Lentejas · Tortilla · Merluza · Pisto y 1 más");
  });

  it("y no dice «y 0 más» cuando caben todos", () => {
    expect(descripcionDelMenu(payload([dia("Lun", "Lentejas")]))).toBe("Lentejas");
  });

  it("un payload vacío no deja la burbuja en blanco", () => {
    expect(descripcionDelMenu(payload([]))).toBe("Una semana de comidas en HoMenu.");
    expect(descripcionDelMenu(null)).toBe("Una semana de comidas en HoMenu.");
  });

  it("aguanta un payload viejo o roto sin tumbar la preview", () => {
    // Esto corre en un servidor: peor que una descripción corta es un 500.
    expect(() => descripcionDelMenu({ weeks: [{ days: [{ day: "Lun" }] }] })).not.toThrow();
    expect(() => descripcionDelMenu({ weeks: [{ days: [{ meals: [{}] }] }] })).not.toThrow();
    expect(resumenDePlatos({ weeks: [{ days: [{ meals: [{ dishes: [{}] }] }] }] })).toEqual([]);
  });
});
