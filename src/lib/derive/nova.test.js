import { describe, it, expect } from "vitest";
import alimentos from "../../data/alimentos.json";
import { recipeCatalog } from "../../data/recipeCatalog.js";
import { computeRecipeNutrition } from "../ingredients.js";
import { novaDe, novaPorId, repartoNova } from "./nova.js";

const ficha = (id) => alimentos.find((a) => a.id === id);

describe("los cuatro grupos", () => {
  it("una lenteja seca y una merluza son grupo 1", () => {
    expect(novaDe(ficha("lentejas")).valor).toBe(1);
    expect(novaDe(ficha("merluza")).valor).toBe(1);
  });

  /**
   * LA PASTA SECA ES GRUPO 1, y la primera versión de este fichero la dejó sin
   * clasificar por prudencia mal puesta. Sémola de trigo duro y agua es el
   * ejemplo que usa la propia clasificación para el grupo 1. Lo que sube de
   * grupo es la rellena o la instantánea.
   */
  it("y la pasta seca también, que no es lo mismo que la instantánea", () => {
    expect(novaDe(ficha("espaguetis")).valor).toBe(1);
    expect(novaDe(ficha("macarrones") ?? ficha("pasta")).valor).toBe(1);
  });

  it("el aceite y el azúcar son ingrediente culinario, grupo 2", () => {
    expect(novaDe(ficha("aceite-oliva")).valor).toBe(2);
    expect(novaDe(ficha("azucar")).valor).toBe(2);
    expect(novaDe(ficha("mantequilla")).valor).toBe(2);
  });

  it("el queso y los encurtidos son procesados, grupo 3", () => {
    expect(novaDe(ficha("aceitunas")).valor).toBe(3);
    expect(novaDe(ficha("mozzarella")).valor).toBe(3);
  });

  it("el kétchup y el surimi son de fábrica, grupo 4", () => {
    expect(novaDe(ficha("ketchup")).valor).toBe(4);
    expect(novaDe(ficha("surimi")).valor).toBe(4);
  });

  /**
   * UNA CONSERVA DEJA DE SER GRUPO 1 aunque su familia lo sea: el atún es
   * pescado, y el atún en lata es pescado conservado con sal y aceite.
   */
  it("conservar sube de grupo", () => {
    expect(novaDe(ficha("atun-lata")).valor).toBe(3);
  });
});

describe("lo que se puede hacer en casa no se condena", () => {
  /**
   * LA REGLA PARA ENTRAR EN EL GRUPO 4 es que el producto NO EXISTA fuera de
   * una fábrica. Lo que sí se puede hacer en casa se va a la duda aunque
   * también se venda hecho, porque la ficha no dice cuál de las dos es.
   */
  it("un alioli o una bechamel no se dan por industriales", () => {
    for (const id of ["alioli", "bechamel", "mayonesa", "pesto"]) {
      const r = novaDe(ficha(id));
      if (!r) continue;
      expect(r.valor, id).toBeNull();
      expect(r.duda, id).toBeTruthy();
    }
  });

  /**
   * LOS CALDOS ESTABAN EN EL GRUPO 4 Y ERA UN ERROR, y lo delató el dato: la
   * «Sopa de cocido con fideos finos» salía con el 88 % de su masa
   * ultraprocesada. Un caldo de cocido es lo más casero que hay; estaban
   * clasificados como pastilla mientras al alioli se le daba el beneficio de
   * la duda — la misma pregunta contestada de dos maneras en el mismo fichero.
   */
  it("un caldo no es una pastilla de caldo", () => {
    for (const id of ["caldo-de-pollo", "caldo-de-carne", "caldo-de-verduras"]) {
      expect(novaDe(ficha(id)).valor, id).toBeNull();
    }
  });

  it("y por eso una sopa de cocido no sale ultraprocesada", () => {
    const sopa = recipeCatalog.find((r) => r.name.startsWith("Sopa de cocido"));
    if (!sopa) return;
    const n = computeRecipeNutrition(sopa, sopa.baseServings || 2);
    expect(n.nova.reparto[4]).toBeLessThan(0.1);
  });

  /**
   * El embutido y el pan son la frontera 3/4 de manual, y se decide con la
   * lista de ingredientes del producto, que el catálogo no tiene. La duda dice
   * la HORQUILLA en vez de callarse: saber que está entre 3 y 4, y por qué, es
   * más de lo que se sabía.
   */
  it("el embutido y el pan devuelven la horquilla, no un grupo", () => {
    for (const id of ["chorizo", "jamon", "pan", "pan-molde"]) {
      const r = novaDe(ficha(id));
      if (!r) continue;
      expect(r.valor, id).toBeNull();
      expect(r.duda, id).toMatch(/3 o 4/);
    }
  });

  /**
   * Y UNA FAMILIA NUEVA CAE EN «NO LO SÉ», no en grupo 1. Las familias de
   * grupo 1 se listan en positivo justo para eso: el error barato sería que
   * cualquier cosa sin regla pasara por comida sin procesar.
   */
  it("una familia desconocida no se cuela como grupo 1", () => {
    const r = novaDe({ id: "x", familia: "familia_que_no_existe", rol: "basico", dimensiones: {} });
    expect(r.valor).toBeNull();
  });
});

describe("el reparto del plato", () => {
  it("las fracciones suman uno con lo sin clasificar", () => {
    const malos = [];
    for (const r of recipeCatalog) {
      const n = computeRecipeNutrition(r, r.baseServings || 2);
      if (!n?.nova?.reparto) continue;
      const suma = n.nova.reparto[1] + n.nova.reparto[2] + n.nova.reparto[3] + n.nova.reparto[4] + n.nova.sinClasificar;
      if (Math.abs(suma - 1) > 0.01) malos.push(`${r.id}: ${suma}`);
    }
    expect(malos).toEqual([]);
  });

  /**
   * Se devuelve REPARTO y no etiqueta única a propósito. Decir que un plato
   * «es NOVA 3» por una cucharada de tomate frito sobre 400 g de verdura
   * fresca sería falso en la práctica.
   */
  it("una pizca de grupo 4 no convierte el plato en grupo 4", () => {
    const r = repartoNova([{ id: "tomate", gramos: 400 }, { id: "ketchup", gramos: 10 }]);
    expect(r.reparto[1]).toBeGreaterThan(0.9);
    expect(r.reparto[4]).toBeLessThan(0.05);
  });

  it("y avisa cuando el hueco es mayor que el dato", () => {
    const r = repartoNova([{ id: "chorizo", gramos: 200 }, { id: "tomate", gramos: 100 }]);
    expect(r.duda).toMatch(/no tiene grupo NOVA/);
  });

  /**
   * EL TRINQUETE. 283 de las 396 fichas son grupo 1, 20 son grupo 2, 26 grupo
   * 3 y 12 grupo 4; 55 se quedan en la frontera que necesita la etiqueta del
   * producto. Se fija el suelo, no el número.
   */
  it("al menos 330 fichas tienen grupo", () => {
    const con = alimentos.filter((a) => novaDe(a).valor != null).length;
    expect(con).toBeGreaterThanOrEqual(330);
  });

  it("el catálogo es mayoritariamente comida sin procesar", () => {
    const g1 = recipeCatalog
      .filter((r) => r.estrella)
      .map((r) => computeRecipeNutrition(r, r.baseServings || 2)?.nova?.reparto?.[1])
      .filter((x) => x != null)
      .sort((a, b) => a - b);
    const mediana = g1[Math.floor(g1.length / 2)];
    expect(mediana).toBeGreaterThan(0.7);
  });

  it("novaPorId memoiza y da lo mismo que novaDe", () => {
    expect(novaPorId("aceite-oliva").valor).toBe(novaDe(ficha("aceite-oliva")).valor);
    expect(novaPorId("aceite-oliva")).toBe(novaPorId("aceite-oliva"));
  });
});

describe("NOVA no ordena de sano a insano", () => {
  /**
   * Conviene que esto esté escrito en un test y no solo en un comentario: el
   * aceite de oliva es grupo 2 y el pan integral es grupo 3, y nadie diría que
   * el pan es mejor que el aceite. NOVA mide procesado. Cualquier frase que
   * salga de aquí tiene que decir «procesado», no «malo».
   */
  it("el aceite de oliva está en un grupo más alto que una verdura, y no es peor", () => {
    expect(novaDe(ficha("aceite-oliva")).valor).toBeGreaterThan(novaDe(ficha("tomate")).valor);
  });
});
