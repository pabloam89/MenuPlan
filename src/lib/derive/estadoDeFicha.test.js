import { describe, it, expect } from "vitest";
import alimentos from "../../data/alimentos.json";
import { procesadoDe, vieneCocinada } from "./estadoDeFicha.js";

const ficha = (id) => alimentos.find((a) => a.id === id);

describe("la escalera decide en orden y se para donde debe", () => {
  it("lo declarado a mano manda, aunque el nombre diga otra cosa", () => {
    const inventada = {
      id: "x", familia: "legumbre",
      dimensiones: { procesado: "crudo" },
      fuenteNombre: "Lentil, boiled/cooked in water",
      nutricion: { kcal100g: 104 },
    };
    const r = procesadoDe(inventada);
    expect(r.valor).toBe("crudo");
    expect(r.via).toBe("declarado");
  });

  it("una familia sin ese eje contesta no_aplica, no null", () => {
    // El agua no puede estar cruda ni cocida, y eso no es una laguna.
    const r = procesadoDe(ficha("agua"));
    expect(r.valor).toBe("no_aplica");
    expect(r.duda).toBeNull();
  });

  it("cuando no hay nada que leer, no contesta Y dice qué le falta", () => {
    const r = procesadoDe({ id: "x", familia: "compuesto", fuenteNombre: "Alioli", nutricion: {} });
    expect(r.valor).toBeNull();
    expect(r.via).toBe("SIN DECIDIR");
    expect(r.duda).toMatch(/Alioli/);
  });
});

describe("la palabra propone y la familia dispone", () => {
  /**
   * LA TRAMPA QUE COSTÓ ESCRIBIR ESTE FICHERO. «Hazelnut, grilled» no es una
   * avellana a la plancha: es una avellana TOSTADA. La misma palabra inglesa
   * nombra dos cosas según lo que se cocine, así que una regla que solo mire
   * el texto se equivoca en las dos únicas fichas donde aparece.
   */
  it("un fruto seco grilled está tostado, no a la plancha", () => {
    expect(procesadoDe(ficha("avellanas")).valor).toBe("tostado");
    expect(procesadoDe(ficha("cacahuete")).valor).toBe("tostado");
  });

  it("pero una carne grilled sí está a la plancha", () => {
    const r = procesadoDe({ id: "x", familia: "carne_roja", fuenteNombre: "Beef, grilled", nutricion: {} });
    expect(r.valor).toBe("plancha");
  });

  /**
   * Y LA CONTRARIA. «Dried pasta, raw» lleva las dos palabras y NO se
   * contradice: es pasta seca y cruda a la vez. `seco` vive en `estado`, no en
   * `procesado`, y confundirlos habría marcado media despensa como cocinada.
   */
  it("seco no es cocinado: la pasta seca sigue cruda", () => {
    expect(procesadoDe(ficha("pasta")).valor).toBe("crudo");
    expect(vieneCocinada(ficha("pasta")).cocinada).toBe(false);
  });

  it("una conserva sí viene cocida", () => {
    expect(vieneCocinada(ficha("atun-lata")).cocinada).toBe(true);
    expect(vieneCocinada(ficha("maiz")).cocinada).toBe(true);
  });
});

describe("las kcal como testigo, no como oráculo", () => {
  it("solo hablan de lo que hidrata", () => {
    // Una carne de 300 kcal no es «cruda por sus kcal»: la banda se midió
    // sobre féculas y fuera de ahí no significa nada. El nombre lleva coma a
    // propósito, para que la convención de la tabla tampoco conteste y quede
    // solo el testigo numérico, que es lo que se está probando.
    const r = procesadoDe({ id: "x", familia: "carne_roja", fuenteNombre: "Beef, sirloin", nutricion: { kcal100g: 300 } });
    expect(r.valor).toBeNull();
  });

  it("y contradicen al nombre en vez de callarse", () => {
    const r = procesadoDe({
      id: "x", familia: "legumbre",
      fuenteNombre: "Lentil, boiled/cooked in water",
      nutricion: { kcal100g: 340 }, // pero pesa como una lenteja seca
    });
    expect(r.valor).toBeNull();
    expect(r.duda).toMatch(/340 kcal/);
  });

  /**
   * EL CATÁLOGO NO SE CONTRADICE HOY, Y ESTE TEST ES EL FUSIBLE. Las 396
   * fichas pasan sin una sola contradicción entre lo que dice el nombre y lo
   * que dicen las kcal. El día que alguien meta una lenteja «cocida» de 350
   * kcal, salta aquí y no en un menú.
   */
  it("ninguna ficha del catálogo se contradice a sí misma", () => {
    const rotas = alimentos
      .map((a) => ({ id: a.id, r: procesadoDe(a) }))
      .filter(({ r }) => r.duda && r.duda.startsWith("la ficha"))
      .map(({ id, r }) => `${id}: ${r.duda}`);
    expect(rotas).toEqual([]);
  });
});

describe("la cobertura, que es el objeto del ejercicio", () => {
  const decididas = () => alimentos.filter((a) => procesadoDe(a).valor != null).length;

  /**
   * EL TRINQUETE. `dimensiones.procesado` estaba escrito a mano en 59 fichas
   * de 396 y a `null` en las otras 337. El operador sube eso a 264 sin curar
   * ni una:
   *
   *     78  declarado                      las 59 a mano + 19 que resuelve la familia
   *    112  ficha (nombre)                 «raw», «boiled», «canned»…
   *     14  ficha (nombre, kcal de acuerdo)
   *     14  ficha (kcal)                   solo féculas, y solo como testigo
   *     46  convención de la tabla         el peldaño flojo, y va marcado
   *    132  SIN DECIDIR                    con su motivo, no en silencio
   *
   * No se fija el número exacto porque copiar la verdad la congela: se fija el
   * suelo, que es lo que no puede bajar sin que alguien lo haya roto.
   */
  it("al menos 255 fichas saben en qué estado están", () => {
    expect(decididas()).toBeGreaterThanOrEqual(255);
  });

  /**
   * Y ESTE ES EL QUE IMPORTA PARA LA RETENCIÓN. Lo que quede sin decidir no
   * puede ser lo que se cocina: una carne o una legumbre sin estado bloquea la
   * corrección justo donde más pesa. Las familias que sí se cuecen tienen que
   * estar casi enteras.
   */
  it("lo que se cocina sí sabe en qué estado está", () => {
    const CUECEN = ["carne_roja", "carne_cerdo", "carne_ave", "pescado_blanco", "pescado_azul", "legumbre", "pasta", "arroz", "verdura_raiz", "verdura_col"];
    const flojas = [];
    for (const fam of CUECEN) {
      const suyas = alimentos.filter((a) => a.familia === fam);
      if (!suyas.length) continue;
      const con = suyas.filter((a) => procesadoDe(a).valor != null).length;
      if (con / suyas.length < 0.6) flojas.push(`${fam}: ${con}/${suyas.length}`);
    }
    expect(flojas).toEqual([]);
  });
});

describe("vieneCocinada distingue no sé de no", () => {
  /**
   * EL PELDAÑO FLOJO VA MARCADO. Un «Boquerón» a secas se resuelve por cómo
   * escribe la tabla, no porque la ficha lo diga, y eso tiene que poder
   * filtrarse: quien exija evidencia explícita se queda con «ficha (nombre)».
   */
  it("lo deducido de la convención se distingue de lo declarado", () => {
    expect(procesadoDe(ficha("boquerones")).via).toBe("convención de la tabla");
    expect(procesadoDe(ficha("atun-fresco")).via).toBe("ficha (nombre)");
  });

  it("y un nombre con calificativo NO entra por esa puerta", () => {
    // «Atún en aceite vegetal» es una conserva, no un atún fresco.
    expect(procesadoDe(ficha("atun")).valor).toBeNull();
    expect(procesadoDe(ficha("anchoa-en-aceite")).valor).toBeNull();
  });

  it("cruda es false, cocida es true, y sin saber es null", () => {
    expect(vieneCocinada(ficha("alubias")).cocinada).toBe(true);
    expect(vieneCocinada(ficha("apio")).cocinada).toBe(false);
    expect(vieneCocinada({ id: "x", familia: "compuesto", fuenteNombre: "Alioli", nutricion: {} }).cocinada).toBeNull();
  });

  it("y el null viene con su motivo, no a secas", () => {
    const r = vieneCocinada({ id: "x", familia: "compuesto", fuenteNombre: "Bechamel", nutricion: {} });
    expect(r.cocinada).toBeNull();
    expect(r.duda).toBeTruthy();
  });
});
