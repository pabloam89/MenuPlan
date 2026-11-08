/**
 * ver_receta trae las kcal por ración (#958): conocimiento.md decía que las
 * traía y no salían, así que Lola o no las daba o se las inventaba. Con el
 * motor y el catálogo de verdad; sin base (la casa no tiene menú).
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const { describirReceta, usarMotor } = await import("./menu.js");
// Arriba y no dentro del test: cargar el motor entero tarda más que el tope de
// un it. En CI no existe core.mjs (sale del build): el motor es botCore.
const m = await import("../../src/server/botCore.js");
usarMotor(m);
// Dos recetas propias de la casa, con la forma de una del catálogo: una con
// kcal (el dato que lee también el atajo de calorías, plato.js) y otra sin.
const base = Object.values(m.RECIPES_BY_ID).find((r) => r?.name && r?.ingredients?.length);
const conKcal = { ...base, id: "user_con_kcal", name: "Guiso de prueba con calorías", kcal: 512.4 };
const sinKcal = { ...base, id: "user_sin_kcal", name: "Plato de prueba sin calorías", kcal: undefined };
m.registerRecipes([conKcal, sinKcal]);
const casa = { state: {}, recetasPropias: [conKcal, sinKcal] };

describe("ver_receta con las kcal", () => {
  it("una receta con kcal las dice, por ración", async () => {
    const t = await describirReceta(casa, conKcal.name);
    expect(t).toContain("unas 512 kcal por ración");
  });

  it("sin el dato no da ninguna cifra", async () => {
    const t = await describirReceta(casa, sinKcal.name);
    expect(t).toMatch(/^Plato de prueba sin calorías/);
    expect(t).not.toMatch(/kcal/);
  });
});
