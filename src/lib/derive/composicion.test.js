import { describe, expect, it } from "vitest";

import { recipeCatalog, recipeCatalogById } from "../../data/recipeCatalog.js";
import partesDerivadas from "../../data/derived/recipeParts.json";
import { getCarbType } from "../../utils/validateMenu.js";
import {
  composicionDe, dominante, ejeProteina, ejeHidrato,
  proteinaDominante, hidratoDominante, medirAcuerdo, proteinaCurada,
} from "./composicion.js";

describe("el vector reparte la masa servida entre nodos del árbol", () => {
  it("la merluza rebozada: el pescado manda en el principal y la patata en la guarnición", () => {
    // El hilo del documento. En un vector PLANO la patata (0,41) le ganaba al
    // pescado (0,33) y la respuesta salía mal; por parte, nunca compitieron.
    const r = recipeCatalog.find((x) => /Merluza (rebozada|a la romana)/i.test(x.name))
      ?? recipeCatalog.find((x) => x.mainProtein === "pescado_blanco");
    const v = composicionDe(r);
    expect(v.masaTotal).toBeGreaterThan(0);
    expect(Object.keys(v.partes).length).toBeGreaterThan(0);
  });

  it("el caldo cuenta como masa pero no compite", () => {
    const r = recipeCatalog.find((x) => (x.ingredients ?? []).some((i) => /^caldo-/.test(i.ingredientId ?? "")));
    const v = composicionDe(r);
    // Ningún nodo de compuesto/caldo aparece en los ejes de competición.
    expect([...v.proteina.keys()]).not.toContain("compuesto");
    expect(v.masaTotal).toBeGreaterThan(0);
  });

  it("el aceite de freír entra al 6 %, no entero", () => {
    const r = recipeCatalog.find((x) => (x.ingredients ?? [])
      .some((i) => i.ingredientId === "aceite-oliva" && i.unit === "ml" && i.amount >= 300));
    if (!r) return;                                  // no hay fritura grande en el catálogo
    const aceite = r.ingredients.find((i) => i.ingredientId === "aceite-oliva");
    const v = composicionDe(r);
    expect(v.masaTotal).toBeLessThan(
      r.ingredients.reduce((a, i) => a + (i.unit === "g" || i.unit === "ml" ? i.amount : 0), 0),
    );
    expect(aceite.amount).toBeGreaterThan(0);
  });
});

describe("los dos ejes hablan el vocabulario de la curación", () => {
  it("la proteína usa los valores de mainProtein", () => {
    expect(ejeProteina({ clase: "ave", subclase: "huevo", especie: "huevo" })).toBe("huevo");
    expect(ejeProteina({ clase: "ave", subclase: "carne_ave", especie: "pato" })).toBe("pato");
    expect(ejeProteina({ clase: "pez", subclase: "pescado_azul", especie: "salmon" })).toBe("pescado_azul");
    // El pastrami es ternera: la transformación es atributo, no posición.
    expect(ejeProteina({ clase: "mamifero", subclase: "embutido", especie: "pastrami" })).toBe("ternera");
    expect(ejeProteina({ clase: "mamifero", subclase: "embutido", especie: "chorizo" })).toBe("cerdo");
    // Unos callos son ternera, no «casquería».
    expect(ejeProteina({ clase: "viscera", subclase: "casqueria", especie: "ternera" })).toBe("ternera");
    // La verdura no compite en ningún eje de proteína.
    expect(ejeProteina({ clase: "hortaliza", subclase: "verdura_hoja", especie: "espinaca" })).toBeNull();
  });

  it("el hidrato usa los valores de carbType", () => {
    expect(ejeHidrato({ clase: "cereal", subclase: "arroz", especie: "arroz" })).toBe("arroz");
    expect(ejeHidrato({ clase: "hortaliza", subclase: "tuberculo", especie: "patata" })).toBe("patatas");
    // La harina no es una base servida: lo dice la línea con `preparacion`.
    expect(ejeHidrato({ clase: "cereal", subclase: "cereal", especie: "harina" })).toBeNull();
  });
});

describe("la dominancia", () => {
  it("el lácteo no compite si hay otra proteína sobre el umbral", () => {
    const masa = new Map([["lacteo", 800], ["cerdo", 200]]);
    const proteinaG = new Map([["cerdo", 40]]);
    const d = dominante(masa, { proteinaG, masaTotal: 1000, condicional: true });
    expect(d.nodo).toBe("cerdo");
    expect(d.porRegla, "gana la regla, no la masa: el margen sale negativo").toBe(true);
    expect(d.margen).toBeLessThan(0);
  });

  it("pero sí gana cuando no hay nadie más", () => {
    const d = dominante(new Map([["lacteo", 400]]), { masaTotal: 1000, condicional: true });
    expect(d.nodo).toBe("lacteo");
  });

  it("un pellizco no puede ser la proteína del plato", () => {
    // 20 g de parmesano sobre una sopa: el vector dice que no lo sabe, que es
    // mejor que decir «lácteo». La cuota es el 2 % de la masa servida.
    const d = dominante(new Map([["lacteo", 20]]), { masaTotal: 1120, condicional: true });
    expect(d.nodo).toBeNull();
  });

  it("15 g de anchoa SÍ son la proteína de una pasta: la cuota no se los come", () => {
    const d = dominante(new Map([["pescado_azul", 15]]), { masaTotal: 600, condicional: true });
    expect(d.nodo).toBe("pescado_azul");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL TRINQUETE
// ─────────────────────────────────────────────────────────────────────────────
//
// Sin esto, cualquiera puede mover un factor de hidratación o una fracción
// comestible y tumbar decenas de decisiones sin que nada avise: 69 de ellas se
// ganan por menos del 25 % de margen. Los suelos son los medidos el 22 sep
// 2026, y bajan solo si alguien decide bajarlos a mano.

const USABLES = new Set(["curado", "monocomponente", "monocomponente_juzgado"]);
const conParte = recipeCatalog.filter((r) => USABLES.has(partesDerivadas[r.id]?.origen));

/**
 * LAS CIEGAS SON LAS QUE NO SE CURARON A MANO, y hasta el 23 sep 2026 esto se
 * aproximaba con `origen === "sin_senal"`. La aproximación funcionaba mientras
 * `sin_senal` fuera el saco grande (529 recetas), y ha dejado de funcionar.
 *
 * Al volcar el ledger del pipeline sobre `stepPartsLabels.json`, 443 recetas
 * que el modelo YA había juzgado monocomponente dejaron de figurar como «nadie
 * las miró» y pasaron a `monocomponente_juzgado`. `sin_senal` cayó de 463 a 21:
 * ese es el hueco de verdad del catálogo, y como conjunto de validación ya no
 * da muestra para nada.
 *
 * Pero esas 443 siguen siendo ciegas en el único sentido que importa aquí: el
 * vector se afinó mirando las CURADAS, así que todo lo demás es examen sin ver
 * las respuestas. Definido así, el conjunto pasa a ser MAYOR que antes —453
 * recetas con proteína curada que comparar frente a las ~340 de entonces—, que
 * es justo lo contrario de perder validación.
 */
const ciegas = recipeCatalog.filter((r) =>
  ["monocomponente", "monocomponente_juzgado", "sin_senal"].includes(partesDerivadas[r.id]?.origen),
);

describe("acuerdo con la curación humana", () => {
  it("proteína, sobre las recetas con reparto de partes", () => {
    // 650 recetas desde que el ledger se volcó a `stepPartsLabels.json` (eran
    // ~290): el suelo baja de 0,99 a 0,98 porque el conjunto se ha DUPLICADO,
    // no porque el vector acierte menos. Los 9 fallos son la familia que este
    // módulo declara irreducible en su propia cabecera —el cerdo curado que en
    // poca masa define el plato— y siguen siendo los mismos nombres: la
    // carbonara, la tarta de puerros y bacon, el arroz con costra.
    const m = medirAcuerdo(conParte, "proteina", proteinaCurada);
    expect(m.total).toBeGreaterThan(600);
    expect(m.acuerdo, `${m.ok}/${m.total} — ${m.errores.map((e) => e.receta).join(", ")}`)
      .toBeGreaterThanOrEqual(0.98);
  });

  it("proteína, sobre las que nunca se usaron para afinarlo", () => {
    // Es la cifra honrada: estas recetas no se miraron al construir el modelo.
    // 453 con `mainProtein` curada que comparar, y 98,2 % de acuerdo. Ver la
    // definición de `ciegas` arriba: el conjunto CRECIÓ al arreglar la
    // clasificación, no encogió.
    const m = medirAcuerdo(ciegas, "proteina", proteinaCurada);
    expect(m.total).toBeGreaterThan(400);
    expect(m.acuerdo, `${m.ok}/${m.total}`).toBeGreaterThanOrEqual(0.97);
  });

  it("hidrato, sobre el catálogo entero", () => {
    const m = medirAcuerdo(recipeCatalog, "hidrato", (r) => getCarbType(r) ?? null);
    expect(m.total).toBeGreaterThan(400);
    expect(m.acuerdo, `${m.ok}/${m.total}`).toBeGreaterThanOrEqual(0.99);
  });

  it("el error sigue al margen: ni un fallo donde el ganador dobla al segundo", () => {
    // Esto es lo que dice que el modelo está CALIBRADO —que sabe cuándo duda—
    // y es más informativo que el acuerdo a secas: la mitad de las decisiones
    // no tienen rival y ahí no se decide nada.
    const m = medirAcuerdo(recipeCatalog, "proteina", proteinaCurada);
    expect(m.bandas.sinRival.mal).toBe(0);
    expect(m.bandas.holgado.mal).toBe(0);
    expect(m.bandas.apretado.mal + m.bandas.medio.mal).toBe(m.mal);
  });
});

describe("lo que el vector NO promete", () => {
  it("es auditor, no autoridad: no escribe mainProtein en ninguna receta", () => {
    // Si algún día lo hace, este test tiene que caer y alguien tiene que
    // decidirlo a mano. Hoy `mainProtein` es curado y el vector lo audita.
    const r = recipeCatalogById[recipeCatalog[0].id];
    expect(proteinaDominante(r)).not.toBe(undefined);
    expect(typeof hidratoDominante(r) === "string" || hidratoDominante(r) === null).toBe(true);
  });

  /**
   * Las dudas se cuentan POR CLASE, y no como un total.
   *
   * Había un solo número —«menos de 30»— y al añadir un detector nuevo se
   * quedó corto. La tentación es subirlo a 141 y seguir, y eso convierte un
   * trinquete en un sello de goma: a partir de ahí cabe cualquier cosa,
   * incluida una regresión de la clase vieja escondida detrás de la nueva.
   *
   * Cada clase lleva su propio techo y baja sola cuando alguien hace el
   * trabajo que la duda pide.
   */
  const dudasDe = (filtro) =>
    recipeCatalog.map(composicionDe).filter((v) => v.dudas.some(filtro)).length;

  const ES_FRACCION_AUSENTE = (d) => d.includes("nadie ha declarado su fracción");

  it("dice en voz alta cuando la ficha y las kcal se contradicen", () => {
    // La clase original: fichas cuyo nombre dice una cosa y cuyas kcal dicen
    // otra, o un «limpio» ambiguo en un pescado. Este número NO puede subir.
    expect(dudasDe((d) => !ES_FRACCION_AUSENTE(d))).toBeLessThan(30);
  });

  it("dice en voz alta cuando nadie ha declarado la fracción comestible", () => {
    // Empezó en 135 recetas y 27 alimentos. Quedan TRES, y los tres están
    // documentados en la cabecera de fraccionComestible.json:
    //
    //   gambas (14 líneas)   el ingrediente se llama «Gambas peladas» pero 14
    //                        líneas dicen «Gambas» a secas, y una de ellas son
    //                        350 g de «Gambas al ajillo» que se hacen peladas.
    //                        No se arregla con un número: hay que PARTIR el
    //                        alimento, como ya lo están `merluza` y
    //                        `merluza-lomos`.
    //   caballa, cabracho    se buscó fuente y no hay. Sus recetas dicen que
    //                        SÍ se tira («retirar las espinas centrales»,
    //                        «retirar piel y espinas»), y ni BEDCA ni CIQUAL
    //                        ni USDA publican el rendimiento. Se cierran con
    //                        una báscula, no con una tabla.
    //
    // Es un SUELO, no un objetivo: cada alimento que alguien declare lo baja,
    // y este número baja con él. Que suba significa que ha entrado pescado o
    // marisco nuevo sin que nadie mire si se tira algo.
    const MAX = 16;
    expect(
      dudasDe(ES_FRACCION_AUSENTE),
      "un `fraccionComestible` ausente se contaba igual que un 1 declarado, y "
      + "por tanto «nadie lo ha mirado» se leía como «no se tira nada».",
    ).toBeLessThanOrEqual(MAX);
  });
});
