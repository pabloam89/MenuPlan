import { describe, it, expect } from "vitest";
import { construirHechos } from "./hechosAlergenos.js";
import { PRESENCIA } from "./comprobadorSeguridad.js";

const lineage = {
  items: [
    { id: "tomate", clase: "simple" },
    { id: "trigo-lineage-test", clase: "simple" },
    { id: "aceite-sesamo-test", clase: "derivado", origenes: [{ tipo: "ingrediente", id: "sesamo-test" }], heredaAlergenos: ["sesamo"] },
    { id: "chorizo-test", clase: "compuesto" },
  ],
};

describe("construirHechos", () => {
  it("un simple sin alérgenos declarados queda ausente en todo", () => {
    const h = construirHechos([{ id: "tomate" }], lineage);
    expect(h.tomate.gluten).toBe(PRESENCIA.AUSENTE);
    expect(h.tomate.leche).toBe(PRESENCIA.AUSENTE);
  });

  it("un derivado hereda su alérgeno y queda ausente en el resto", () => {
    const h = construirHechos([{ id: "aceite-sesamo-test" }], lineage);
    expect(h["aceite-sesamo-test"].sesamo).toBe(PRESENCIA.CONTIENE);
    expect(h["aceite-sesamo-test"].gluten).toBe(PRESENCIA.AUSENTE);
  });

  it("lo declarado en el catálogo manda sobre el resto, pero no sobre lo heredado", () => {
    const h = construirHechos([{ id: "trigo-lineage-test", allergens: ["gluten"], mayContain: ["sulfitos"] }], lineage);
    expect(h["trigo-lineage-test"].gluten).toBe(PRESENCIA.CONTIENE);
    expect(h["trigo-lineage-test"].sulfitos).toBe(PRESENCIA.PUEDE_CONTENER);
    expect(h["trigo-lineage-test"].leche).toBe(PRESENCIA.AUSENTE);
  });

  it("un compuesto solo lleva lo declarado: el resto se queda sin fila (no verificado)", () => {
    const h = construirHechos([{ id: "chorizo-test", allergens: ["sulfitos"] }], lineage);
    expect(h["chorizo-test"].sulfitos).toBe(PRESENCIA.CONTIENE);
    expect(h["chorizo-test"].gluten).toBeUndefined();
  });

  it("un ingrediente que no está en la relación no se da por seguro en nada", () => {
    const h = construirHechos([{ id: "no-clasificado" }], lineage);
    expect(h["no-clasificado"]).toEqual({});
  });
});
