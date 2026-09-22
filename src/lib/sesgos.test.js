import { describe, it, expect } from "vitest";
import { PESO_SESGO, ordenarPorSesgo, preferirPorSesgo, sesgoScoreBoost } from "./sesgos.js";

const horno = { id: "h", tecnica: "horno", mainBase: "patatas", llevaSalsa: true, ingredients: [{ name: "Queso manchego" }, { name: "Patata" }] };
const crudo = { id: "c", tecnica: "crudo", mainBase: "arroz", llevaSalsa: false, ingredients: [{ name: "Tomate" }] };

describe("sesgoScoreBoost", () => {
  it("sin sesgos ni favoritos no mueve nada", () => {
    expect(sesgoScoreBoost(horno, null)).toBe(0);
    expect(sesgoScoreBoost(horno, {})).toBe(0);
    expect(sesgoScoreBoost(horno, { tecnica: {} }, [])).toBe(0);
    expect(sesgoScoreBoost(null, { tecnica: { horno: 1 } })).toBe(0);
  });

  it("tecnica: 1 sube el plato que casa, -1 lo baja, 0 es neutro, y el que no casa no se toca", () => {
    expect(sesgoScoreBoost(horno, { tecnica: { horno: 1 } })).toBe(PESO_SESGO);
    expect(sesgoScoreBoost(horno, { tecnica: { horno: -1 } })).toBe(-PESO_SESGO);
    expect(sesgoScoreBoost(horno, { tecnica: { horno: 0 } })).toBe(0);
    // "más horno" no sube artificialmente lo que no es horno.
    expect(sesgoScoreBoost(crudo, { tecnica: { horno: 1 } })).toBe(0);
  });

  it("base: casa por mainBase, que es lo que el catálogo declara", () => {
    expect(sesgoScoreBoost(horno, { base: { patatas: 1 } })).toBe(PESO_SESGO);
    expect(sesgoScoreBoost(crudo, { base: { patatas: 1 } })).toBe(0);
    expect(sesgoScoreBoost(crudo, { base: { arroz: -1 } })).toBe(-PESO_SESGO);
  });

  it("salsa: la polaridad sign(si)−sign(no) mueve SOLO a los que la llevan", () => {
    // Quiere salsa → los que la traen suben; los que no, ni se tocan.
    expect(sesgoScoreBoost(horno, { salsa: { si: 1 } })).toBe(PESO_SESGO);
    expect(sesgoScoreBoost(crudo, { salsa: { si: 1 } })).toBe(0);
    // No quiere salsa → los que la traen bajan.
    expect(sesgoScoreBoost(horno, { salsa: { no: 1 } })).toBe(-PESO_SESGO);
    expect(sesgoScoreBoost(crudo, { salsa: { no: 1 } })).toBe(0);
    // "menos salsa" (si: -1) equivale a "no": bajan los que la llevan.
    expect(sesgoScoreBoost(horno, { salsa: { si: -1 } })).toBe(-PESO_SESGO);
    // si y no a la vez se anulan.
    expect(sesgoScoreBoost(horno, { salsa: { si: 1, no: 1 } })).toBe(0);
  });

  it("favoritos: sube una sola vez por plato, por inclusión en minúsculas, y sin plato no casa", () => {
    expect(sesgoScoreBoost(horno, null, ["queso"])).toBe(PESO_SESGO);
    // Dos favoritos que casan siguen siendo UN boost: una tabla de quesos no
    // se vuelve el mejor plato de la semana.
    expect(sesgoScoreBoost(horno, null, ["queso", "patata"])).toBe(PESO_SESGO);
    expect(sesgoScoreBoost(horno, null, ["Queso"])).toBe(PESO_SESGO);
    expect(sesgoScoreBoost(crudo, null, ["queso"])).toBe(0);
    expect(sesgoScoreBoost(horno, null, ["", "   "])).toBe(0);
  });

  it("los ejes se suman, y valores no numéricos o basura no rompen", () => {
    const sesgos = { tecnica: { horno: 1 }, base: { patatas: 1 }, salsa: { si: 1 } };
    expect(sesgoScoreBoost(horno, sesgos, ["queso"])).toBe(4 * PESO_SESGO);
    expect(sesgoScoreBoost(horno, { tecnica: { horno: "mas" }, salsa: { si: NaN } })).toBe(0);
  });

  it("esfuerzo no tiene consumidor aquí, a propósito", () => {
    expect(sesgoScoreBoost(horno, { esfuerzo: { facil: 1 } })).toBe(0);
  });
});

describe("ordenarPorSesgo", () => {
  const plancha = { id: "p", tecnica: "plancha", ingredients: [] };
  const pool = [crudo, plancha, horno];

  it("sin sesgos ni favoritos devuelve EL MISMO array, sin copiar", () => {
    expect(ordenarPorSesgo(pool, null)).toBe(pool);
    expect(ordenarPorSesgo(pool, {})).toBe(pool);
    expect(ordenarPorSesgo(pool, { tecnica: { horno: 0 } }, [])).toBe(pool);
    expect(ordenarPorSesgo(pool, { tecnica: { horno: "mas" } }, ["  "])).toBe(pool);
  });

  it("pone delante lo pedido y conserva el orden previo entre iguales", () => {
    // "más horno": horno pasa al frente; crudo y plancha siguen en su orden.
    expect(ordenarPorSesgo(pool, { tecnica: { horno: 1 } }).map((r) => r.id)).toEqual(["h", "c", "p"]);
    // "menos horno": horno va al final; los demás no se mueven entre sí.
    expect(ordenarPorSesgo(pool, { tecnica: { horno: -1 } }).map((r) => r.id)).toEqual(["c", "p", "h"]);
  });

  it("no muta el pool de entrada", () => {
    const antes = pool.map((r) => r.id);
    ordenarPorSesgo(pool, { tecnica: { horno: 1 } });
    expect(pool.map((r) => r.id)).toEqual(antes);
  });

  it("los favoritos también ordenan, y pools de 0 o 1 se devuelven tal cual", () => {
    expect(ordenarPorSesgo(pool, null, ["queso"]).map((r) => r.id)).toEqual(["h", "c", "p"]);
    const uno = [crudo];
    expect(ordenarPorSesgo(uno, { tecnica: { horno: 1 } })).toBe(uno);
    expect(ordenarPorSesgo([], { tecnica: { horno: 1 } })).toEqual([]);
    expect(ordenarPorSesgo(null, { tecnica: { horno: 1 } })).toBe(null);
  });
});

describe("preferirPorSesgo", () => {
  const plancha = { id: "p", tecnica: "plancha", ingredients: [] };
  const horno2 = { id: "h2", tecnica: "horno", ingredients: [] };
  const pool = [crudo, plancha, horno, horno2];

  it("sin sesgos, o con todos al mismo boost, devuelve EL MISMO array", () => {
    expect(preferirPorSesgo(pool, null)).toBe(pool);
    expect(preferirPorSesgo(pool, {})).toBe(pool);
    // Sesgo que no casa con nadie: todos a 0 → sin escalón que preferir.
    expect(preferirPorSesgo(pool, { base: { quinoa: 1 } })).toBe(pool);
  });

  it("'más horno' deja el sorteo entre los de horno; 'menos horno' entre los demás", () => {
    expect(preferirPorSesgo(pool, { tecnica: { horno: 1 } }).map((r) => r.id)).toEqual(["h", "h2"]);
    expect(preferirPorSesgo(pool, { tecnica: { horno: -1 } }).map((r) => r.id)).toEqual(["c", "p"]);
  });

  it("es preferencia, no filtro: si todos casan con un 'menos', se quedan todos", () => {
    const soloHorno = [horno, horno2];
    expect(preferirPorSesgo(soloHorno, { tecnica: { horno: -1 } })).toBe(soloHorno);
  });

  it("con varios ejes gana el escalón más alto, y los favoritos cuentan", () => {
    // horno casa con tecnica y con "queso" (2 boosts); horno2 solo con tecnica.
    expect(preferirPorSesgo(pool, { tecnica: { horno: 1 } }, ["queso"]).map((r) => r.id)).toEqual(["h"]);
  });

  it("pools de 0 o 1 se devuelven tal cual", () => {
    const uno = [crudo];
    expect(preferirPorSesgo(uno, { tecnica: { horno: 1 } })).toBe(uno);
    expect(preferirPorSesgo([], { tecnica: { horno: 1 } })).toEqual([]);
  });
});
