import { describe, it, expect } from "vitest";
import { pairGarnishes } from "./pairGarnishes.js";
import guarniciones from "../data/recipes/guarniciones.json";

/**
 * Estos tests fijan una regla de producto, no un algoritmo: aquí no se combina.
 *
 * La versión anterior de este fichero probaba la combinatoria — tope de kcal,
 * patatas fritas solo con carne, guarnición de cena por debajo de 15 min,
 * respaldo a pan… — y toda esa lógica se borró a propósito (ver el porqué en
 * pairGarnishes.js). Lo que queda que merezca una prueba es justo lo contrario:
 * que NADA aparezca solo, y que lo elegido a mano sí se respete.
 */

const UNA = guarniciones[0];
const OTRA = guarniciones[1];

const plato = (id, extra = {}) => ({ id, name: `Plato ${id}`, category: "carnes", ...extra });
const slot = (recipeId, slotId = "lun_comida") => ({ slotId, recipeId });

describe("pairGarnishes", () => {
  it("no inventa guarnición para un plato normal", () => {
    const pool = { r1: plato("r1") };
    const [out] = pairGarnishes([slot("r1")], pool);
    expect(out.garnishId).toBeUndefined();
  });

  it("tampoco la inventa para el fondo de armario (sin estrella)", () => {
    // Este era EL caso que sí se combinaba antes, y el que producía el plato
    // recargado en cuanto una de estas entraba al pool.
    const pool = { r1: plato("r1", { estrella: false }) };
    const [out] = pairGarnishes([slot("r1")], pool);
    expect(out.garnishId).toBeUndefined();
  });

  it("respeta la guarnición fijada a mano en un plato fijo", () => {
    const pool = { r1: plato("r1") };
    const [out] = pairGarnishes([slot("r1")], pool, { r1: UNA.id });
    expect(out.garnishId).toBe(UNA.id);
  });

  it("respeta la que la propia receta declara suya", () => {
    const pool = { r1: plato("r1", { pinnedGarnishId: OTRA.id }) };
    const [out] = pairGarnishes([slot("r1")], pool);
    expect(out.garnishId).toBe(OTRA.id);
  });

  it("lo fijado a mano gana a lo que declara la receta", () => {
    const pool = { r1: plato("r1", { pinnedGarnishId: OTRA.id }) };
    const [out] = pairGarnishes([slot("r1")], pool, { r1: UNA.id });
    expect(out.garnishId).toBe(UNA.id);
  });

  it("descarta una guarnición fijada que no pase el filtro de alergias", () => {
    // Una alergia no se negocia: un plato fijo guardado hace meses no sabe que
    // desde entonces alguien de la casa dejó de tolerar algo.
    const pool = { r1: plato("r1") };
    const [out] = pairGarnishes([slot("r1")], pool, { r1: UNA.id }, [OTRA]);
    expect(out.garnishId).toBeUndefined();
  });

  it("ignora un id de guarnición que no existe", () => {
    const pool = { r1: plato("r1") };
    const [out] = pairGarnishes([slot("r1")], pool, { r1: "__inventada__" });
    expect(out.garnishId).toBeUndefined();
  });

  it("no muta la entrada", () => {
    const entrada = [slot("r1")];
    const pool = { r1: plato("r1", { pinnedGarnishId: UNA.id }) };
    pairGarnishes(entrada, pool);
    expect(entrada[0].garnishId).toBeUndefined();
  });
});
