import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { estructuraDelGrupo, conEstructura, estructuraEfectiva } from "./estructuraPlatos.js";
import { PREGUNTAS_POR_ID } from "./wizardRegistry.js";

// Una casa en modo experto: la familia con primero y segundo, puesto a mano.
const casa = () => ({
  mealStructure: "primero_segundo",
  mealStructureByGroup: { familia: "primero_segundo", peques: "primero_segundo" },
  groups: [{ id: "familia", label: "Familia" }, { id: "peques", label: "Peques" }],
});

describe("uno o dos platos (#958): lo que se escribe es lo que usa el motor", () => {
  it("«solo un plato» desde Lola llega a todos los grupos, también con estructura por grupo", () => {
    // Lola escribe con el `escribe` del registro (ajustes.js, ajustar_cocina).
    const d = PREGUNTAS_POR_ID.estructura.escribe(casa(), "1_plato");
    expect(estructuraDelGrupo(d, "familia")).toBe("1_plato");
    expect(estructuraDelGrupo(d, "peques")).toBe("1_plato");
  });

  it("conEstructura no toca la cena", () => {
    const d = conEstructura({ ...casa(), mealStructureCenaByGroup: { peques: "primero_segundo" } }, "1_plato");
    expect(d.mealStructureCenaByGroup).toEqual({ peques: "primero_segundo" });
  });

  it("lo que se cuenta es lo efectivo: un valor si todos igual, uno por grupo si no", () => {
    expect(estructuraEfectiva(conEstructura(casa(), "1_plato"))).toEqual({ casa: "1_plato", porGrupo: null });
    const mezcla = { ...casa(), mealStructure: "1_plato", mealStructureByGroup: { familia: "primero_segundo" } };
    expect(estructuraEfectiva(mezcla).porGrupo).toEqual([{ grupo: "Familia", valor: "primero_segundo" }, { grupo: "Peques", valor: "1_plato" }]);
  });

  it("sin nada guardado, primero y segundo", () => {
    expect(estructuraDelGrupo({}, "x")).toBe("primero_segundo");
  });

  it("nadie más lee la estructura por grupo a mano: todos pasan por estructuraPlatos.js", () => {
    const raiz = new URL("../../", import.meta.url);
    const codigo = (dir) => readdirSync(new URL(dir, raiz), { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return codigo(`${dir}${e.name}/`);
      return /\.(m?js|jsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}${e.name}`] : [];
    });
    // `mealStructureByGroup?.[g] ?? …`: la lectura con su defecto, que es lo que divergía.
    const lecturaAMano = /mealStructure(?:Cena)?ByGroup\?\.\[[^\]]*\]\s*\?\?/;
    const copias = [...codigo("src/"), ...codigo("api/")]
      .filter((f) => f !== "src/lib/estructuraPlatos.js" && !f.startsWith("src/data/"))
      .filter((f) => lecturaAMano.test(readFileSync(new URL(f, raiz), "utf8")));
    expect(copias).toEqual([]);
  });
});
