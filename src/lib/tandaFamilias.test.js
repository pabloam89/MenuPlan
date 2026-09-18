import { describe, expect, it } from "vitest";

import {
  familiaDePlato, familiasCocinado, familiasPlato, familiasSemi,
  manosDeTanda, sinFamilia,
} from "./tandaFamilias.js";
import { NO_AGUANTA } from "./tandaFamiliasDefs.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { INGREDIENT_IMAGE_IDS } from "./ingredientImageIds.js";

describe("las familias de la tanda", () => {
  it("ningún plato marcado se queda sin familia", () => {
    expect(sinFamilia()).toEqual([]);
  });

  it("cada familia tiene al menos una receta y un dibujo", () => {
    const dibujos = new Set(INGREDIENT_IMAGE_IDS);
    for (const f of familiasPlato()) {
      expect(f.recetas.length, f.id).toBeGreaterThan(0);
      // El id de la familia ES el nombre del dibujo: sin él, la fila sale con
      // la imagen genérica del pasillo y no se distingue de la de al lado.
      expect(dibujos.has(f.id), `falta /ingredients/${f.id}.png`).toBe(true);
    }
  });

  it("reparte los 39 platos a medio hacer entre las doce familias", () => {
    const marcados = recipeCatalog.filter((r) => r.adelanto).length;
    const repartidos = familiasSemi().reduce((n, f) => n + f.recetas.length, 0);
    expect(repartidos).toBe(marcados);
    expect(familiasSemi()).toHaveLength(12);
  });

  it("ninguna receta cae en dos familias", () => {
    const vistas = new Set();
    for (const f of familiasPlato()) {
      for (const id of f.recetas) {
        expect(vistas.has(id), `${id} en dos familias`).toBe(false);
        vistas.add(id);
      }
    }
  });

  it("las ollas son solo sopas y cremas, y solo las que aguantan", () => {
    const porId = new Map(recipeCatalog.map((r) => [r.id, r]));
    for (const f of familiasCocinado()) {
      for (const id of f.recetas) {
        const r = porId.get(id);
        expect(r.category, id).toBe("sopas_cremas");
        expect(r.estrella, id).toBe(true);
        expect(NO_AGUANTA.test(r.name), `${r.name} no aguanta la olla`).toBe(false);
      }
    }
  });

  it("una sopa que se gratina ración a ración no entra", () => {
    const dentro = familiasCocinado().flatMap((f) => f.recetas);
    const gratinada = recipeCatalog.find((r) => /Sopa de cebolla gratinada/i.test(r.name));
    expect(gratinada).toBeDefined();
    expect(dentro).not.toContain(gratinada.id);
  });
});

describe("lo que cuesta una tanda", () => {
  it("cero veces no cuesta nada, y una familia que no existe tampoco", () => {
    expect(manosDeTanda("croquetas-crudas", 0)).toBe(0);
    expect(manosDeTanda("no-existe", 3)).toBe(0);
  });

  it("doblar la tanda no dobla el trabajo", () => {
    const una = manosDeTanda("croquetas-crudas", 1);
    const dos = manosDeTanda("croquetas-crudas", 2);
    expect(dos).toBeGreaterThan(una);
    expect(dos).toBeLessThan(una * 2);
  });

  it("las croquetas cuestan más que los buñuelos, que es lo que se ve en la fila", () => {
    expect(manosDeTanda("croquetas-crudas", 1)).toBeGreaterThan(manosDeTanda("bunuelos-masa", 1));
  });

  it("se puede buscar una familia por su id", () => {
    expect(familiaDePlato("crema").tipo).toBe("cocinado");
    expect(familiaDePlato("croquetas-crudas").tipo).toBe("semi");
    expect(familiaDePlato("arroz")).toBeNull();
  });
});
