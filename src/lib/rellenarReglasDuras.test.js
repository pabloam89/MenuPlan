import { describe, it, expect } from "vitest";
import { pickCatalogReplacement } from "./aiPlanner.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

// Rellenar la pizarra (y «Cambiar plato») elige con `pickCatalogReplacement`.
// Antes tenía su propia lista de filtros y no aplicaba las reglas duras del
// solver: sacaba guisos de legumbre de cena y legumbre en comida Y cena.
const group = { id: "g1", label: "Familia", memberIds: ["m1"] };
const data = { members: [{ id: "m1", age: 35 }], allergiesReviewed: true, groups: [group], schedule: {} };
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const esLegumbre = (r) => !!r && (r.category === "legumbres" || r.mainProtein === "legumbre");
const esGuisoDeLegumbre = (r) => esLegumbre(r) && (!r.formato || ["guiso", "sopa"].includes(r.formato));
const hueco = () => ({ recipeId: null, eaters: 2, cleared: true });

function rellenarSemana() {
  const plan = { g1: {} };
  for (const d of DIAS) for (const m of ["Comida", "Cena"]) plan.g1[`${d}-${m}`] = hueco();
  for (const d of DIAS) {
    for (const m of ["Comida", "Cena"]) {
      const r = pickCatalogReplacement(data, plan, { groupId: "g1", day: d, meal: m, course: "main" });
      if (r) plan.g1[`${d}-${m}`] = { ...plan.g1[`${d}-${m}`], recipeId: r.recipeId, cleared: false };
    }
  }
  return plan;
}

describe("Rellenar cumple las reglas duras del solver", () => {
  it("ninguna cena es un guiso de legumbre ni un día lleva dos legumbres", () => {
    let cenas = 0;
    for (let semana = 0; semana < 15; semana++) {
      const plan = rellenarSemana();
      for (const d of DIAS) {
        const comida = recipeCatalogById[plan.g1[`${d}-Comida`].recipeId];
        const cena = recipeCatalogById[plan.g1[`${d}-Cena`].recipeId];
        if (cena) cenas++;
        expect(esGuisoDeLegumbre(cena), `${d}: ${cena?.name}`).toBe(false);
        expect(esLegumbre(comida) && esLegumbre(cena), `${d}: ${comida?.name} + ${cena?.name}`).toBe(false);
      }
    }
    // Que el filtro no haya vaciado la pizarra: casi todas las cenas se rellenan.
    expect(cenas).toBeGreaterThan(15 * 7 * 0.9);
  });

  it("con legumbre en la comida, la cena no propone legumbre", () => {
    const ropaVieja = recipeCatalogById.legumbres_065;
    expect(ropaVieja).toBeTruthy();
    const plan = { g1: { "Dom-Comida": { recipeId: ropaVieja.id, eaters: 2 }, "Dom-Cena": hueco() } };
    const res = pickCatalogReplacement(data, plan, {
      groupId: "g1", day: "Dom", meal: "Cena", course: "main", candidatos: 200,
    });
    expect(res.candidatos.length).toBeGreaterThan(10);
    for (const r of res.candidatos) expect(esLegumbre(r), r.name).toBe(false);
  });

  it("una comida de un solo plato se compara como plato único, no como «segundo»", () => {
    // La casa tiene primero+segundo por defecto, pero el tablero solo lleva un
    // plato: el pool no puede quedarse solo con lo que además sirve de segundo.
    const plan = { g1: { "Mar-Comida": hueco() } };
    const res = pickCatalogReplacement(data, plan, {
      groupId: "g1", day: "Mar", meal: "Comida", course: "main", candidatos: 400,
    });
    expect(res.candidatos.some((r) => !r.mealRole.includes("segundo"))).toBe(true);
  });
});
