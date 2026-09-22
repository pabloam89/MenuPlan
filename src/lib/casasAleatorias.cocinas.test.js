import { describe, expect, it } from "vitest";
import { COCINAS } from "../data/recipeSchema.js";
import { COCINAS_DEMO } from "./casasAleatorias.js";

/**
 * COCINAS_DEMO es un SUBCONJUNTO del enum, no una lista propia. Se construye
 * filtrando contra COCINAS, así que si alguien renombra una cocina en el
 * esquema el filtro la deja caer en silencio y las casas de prueba dejan de
 * pedirla sin que nadie lo vea. Este test es el que lo ve.
 */
describe("las cocinas de las casas de prueba", () => {
  it("siguen siendo las cinco de siempre, y todas existen en el enum", () => {
    expect(COCINAS_DEMO).toEqual(["italiana", "asiatica", "mexicana", "arabe", "india"]);
    for (const c of COCINAS_DEMO) expect(COCINAS).toContain(c);
  });
});
