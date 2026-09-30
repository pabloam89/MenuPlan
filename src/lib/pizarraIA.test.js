import { describe, expect, it } from "vitest";
import { aplicarOrden, contextoDelTablero, parecido, validarOrden } from "./pizarraIA.js";

const dias = ["Lun", "Mar", "Mié"];
const comidas = ["Comida", "Cena"];

const CATALOGO = [
  { id: "lentejas", name: "Lentejas estofadas", time: 45, category: "legumbres" },
  { id: "merluza", name: "Merluza a la plancha", time: 15, category: "pescados", mainProtein: "pescado" },
  { id: "pollo", name: "Pollo al horno con patatas", time: 60, category: "carnes", mainProtein: "pollo" },
  { id: "tortilla", name: "Tortilla de patatas", time: 30, category: "huevos" },
];

/** Un `pickCatalogReplacement` de mentira: sin filtros, excluye lo ya puesto. */
function pick(_data, plan, { groupId, day, meal, course, forcedRecipe, candidatos }) {
  const slot = plan[groupId]?.[`${day}-${meal}`];
  if (!slot) return null;
  const usados = new Set(Object.values(plan[groupId]).flatMap((s) => [s.recipeId, s.firstRecipeId]).filter(Boolean));
  if (candidatos) return { candidatos: CATALOGO.filter((r) => !usados.has(r.id)).slice(0, candidatos) };
  const r = forcedRecipe ?? CATALOGO.find((x) => !usados.has(x.id));
  return r ? { frontendRecipe: { id: r.id, name: r.name }, recipeId: r.id, course } : null;
}

function planVacio() {
  const g = {};
  for (const d of dias) for (const c of comidas) g[`${d}-${c}`] = { recipeId: null, cleared: true, eaters: 2 };
  return { g1: g };
}

describe("validarOrden", () => {
  it("se queda solo con operaciones conocidas y huecos que existen", () => {
    const { ops } = validarOrden({
      reply: "Hecho",
      ops: [
        { op: "poner", dia: "Lun", comida: "Cena", plato: "lentejas" },
        { op: "borrar_todo" },
        { op: "rellenar", dia: "Dom" },
        { op: "cambiar", dia: "Mar", comida: "Comida", pista: { maxMinutos: "20", familia: "marisco" } },
      ],
    }, { dias, comidas });
    expect(ops).toEqual([
      { op: "poner", dias: ["Lun"], comidas: ["Cena"], plato: "lentejas", curso: "main" },
      { op: "cambiar", dias: ["Mar"], comidas: ["Comida"], curso: "main", pista: { maxMinutos: 20 } },
    ]);
  });

  it("no revienta con basura", () => {
    expect(validarOrden(null, { dias, comidas })).toEqual({ reply: "", ops: [] });
    expect(validarOrden({ ops: "x" }, { dias, comidas }).ops).toEqual([]);
  });
});

describe("parecido", () => {
  it("encuentra el plato sin tildes ni artículos", () => {
    expect(parecido("Lentejas estofadas", "unas lentejas")).toBe(1);
    expect(parecido("Merluza a la plancha", "merluza")).toBe(1);
    expect(parecido("Tortilla de patatas", "lentejas")).toBe(0);
  });
});

describe("aplicarOrden", () => {
  it("pone el plato pedido en su hueco", () => {
    const ops = [{ op: "poner", dias: ["Lun"], comidas: ["Cena"], plato: "lentejas", curso: "main" }];
    const r = aplicarOrden(ops, { data: {}, plan: planVacio(), dias, comidas, pick });
    expect(r.hechos).toBe(1);
    expect(r.trabajo.g1["Lun-Cena"].recipeId).toBe("lentejas");
    expect(r.trabajo.g1["Lun-Cena"].cleared).toBe(false);
    expect(r.tocados).toEqual(["Lun-Cena"]);
  });

  it("dice lo que no encaja en vez de forzarlo", () => {
    const ops = [{ op: "poner", dias: ["Lun"], comidas: ["Cena"], plato: "paella", curso: "main" }];
    const r = aplicarOrden(ops, { data: {}, plan: planVacio(), dias, comidas, pick });
    expect(r.hechos).toBe(0);
    expect(r.noHechos[0]).toMatch(/paella/);
  });

  it("cambiar con pista elige lo que la cumple", () => {
    const ops = [{ op: "cambiar", dias: ["Mar"], comidas: ["Comida"], curso: "main", pista: { maxMinutos: 20 } }];
    const r = aplicarOrden(ops, { data: {}, plan: planVacio(), dias, comidas, pick });
    expect(r.trabajo.g1["Mar-Comida"].recipeId).toBe("merluza");
  });

  it("rellenar solo toca los vacíos y no repite plato", () => {
    const plan = planVacio();
    plan.g1["Lun-Comida"] = { recipeId: "pollo", cleared: false };
    const r = aplicarOrden([{ op: "rellenar", dias: ["Lun"], comidas: [], curso: "main", pista: null }], { data: {}, plan, dias, comidas, pick });
    expect(r.trabajo.g1["Lun-Comida"].recipeId).toBe("pollo");
    expect(r.trabajo.g1["Lun-Cena"].recipeId).toBeTruthy();
    expect(r.trabajo.g1["Lun-Cena"].recipeId).not.toBe("pollo");
    expect(r.hechos).toBe(1);
  });

  it("mover intercambia y vaciar deja el hueco libre, sin tocar el plan original", () => {
    const plan = planVacio();
    plan.g1["Lun-Comida"] = { recipeId: "pollo", cleared: false };
    plan.g1["Mar-Cena"] = { recipeId: "tortilla", cleared: false };
    const r = aplicarOrden([
      { op: "mover", de: { dia: "Lun", comida: "Comida" }, a: { dia: "Mar", comida: "Cena" } },
      { op: "vaciar", dias: ["Lun"], comidas: ["Comida"], curso: "main", pista: null },
    ], { data: {}, plan, dias, comidas, pick });
    expect(r.trabajo.g1["Mar-Cena"].recipeId).toBe("pollo");
    expect(r.trabajo.g1["Lun-Comida"].recipeId).toBeNull();
    expect(r.trabajo.g1["Lun-Comida"].cleared).toBe(true);
    expect(plan.g1["Lun-Comida"].recipeId).toBe("pollo");
  });
});

describe("contextoDelTablero", () => {
  it("una línea por hueco, con los vacíos dichos", () => {
    const plan = planVacio().g1;
    plan["Lun-Comida"] = { recipeId: "pollo" };
    const txt = contextoDelTablero({ plan, dias, comidas, nombreDe: (id) => id.toUpperCase() });
    expect(txt).toContain("Lun Comida: POLLO");
    expect(txt).toContain("Lun Cena: (vacío)");
  });
});
