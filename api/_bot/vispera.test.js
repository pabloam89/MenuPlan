import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { avisoDeVispera } = await import("./vispera.js");

// El viernes 2 oct 2026: comida con cocido (garbanzos secos), cena con un
// guiso que sale del congelador. El sábado, lentejas y garbanzos de bote.
const aiRecipes = [
  { id: "g__cocido", name: "Cocido madrileño", ingredients: [{ name: "Garbanzos" }, { name: "Morcillo" }] },
  { id: "g__guiso", name: "Guiso de ternera", ingredients: [{ name: "Ternera" }] },
  { id: "g__lentejas", name: "Lentejas estofadas", ingredients: [{ name: "Lentejas pardinas" }] },
  { id: "g__hummus", name: "Hummus", ingredients: [{ name: "Garbanzos cocidos de bote" }] },
];
const semana = {
  weekStart: "2026-09-28", weekEnd: "2026-10-04",
  plan: { g: {
    "Vie-Comida": { recipeId: "g__cocido" },
    "Vie-Cena": { recipeId: "g__guiso", fromFreezer: true, frozenPortions: 4, frozenRecipeId: "g__guiso" },
    "Sáb-Comida": { recipeId: "g__lentejas" },
    "Sáb-Cena": { recipeId: "g__hummus" },
  } },
};
const casa = (data = {}) => ({ state: { data, aiRecipes }, semanas: [semana] });

describe("el aviso de la víspera", () => {
  it("remojo y congelador, con el plato y la comida", () => {
    const t = avisoDeVispera(casa(), "2026-10-02");
    expect(t).toMatch(/^🌙 <b>Para mañana<\/b>/);
    expect(t).toContain("🫘 Pon en remojo los garbanzos esta noche: mañana toca Cocido madrileño (comida).");
    expect(t).toContain("🧊 Saca del congelador Guiso de ternera: se come mañana.");
  });

  it("las lentejas y lo de bote no van a remojo: si no hay nada que hacer, no hay aviso", () => {
    expect(avisoDeVispera(casa(), "2026-10-03")).toBe(null);
  });

  it("mañana es su día de batch cooking", () => {
    const data = { tanda: { sofrito: 3, arroz: 2 }, diaTanda: "Dom", tandaMinutos: 60 };
    const t = avisoDeVispera(casa(data), "2026-10-04");
    expect(t).toContain("🥘 Mañana es tu día de batch cooking: sofrito ×3, arroz ×2 (1 h de manos).");
    expect(t).not.toMatch(/tanda/i);
    // Otro día, nada.
    expect(avisoDeVispera(casa(data), "2026-10-03")).toBe(null);
  });

  it("sin menú para mañana, sin aviso", () => {
    expect(avisoDeVispera(casa(), "2026-10-12")).toBe(null);
  });
});
