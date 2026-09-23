/**
 * Los dos vocabularios de electrodoméstico, y que ninguno se salga del suyo.
 *
 * El catálogo tiene DOS campos de aparato y son distintos a propósito:
 *
 *   `methods[].appliance`  ALTERNATIVAS del mismo plato (ids en snake_case:
 *                          airfryer, horno, thermomix, vaporera,
 *                          olla_express, microondas)
 *   `requiredAppliance`    lo que HACE FALTA para poder hacerlo, uno solo
 *
 * Los dos se comparan contra lo que el asistente deja declarar, así que un
 * valor fuera de vocabulario no da error: desaparece en silencio. Este fichero
 * es el que hace ruido.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { APPLIANCE_LABELS, KITCHEN_TOOL_IDS } from "../lib/applianceMethods.js";

const R = "src/data/recipes";
const recetas = readdirSync(R)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(`${R}/${f}`, "utf8")));

describe("cobertura de methods[] en estrella", () => {
  const estrella = recetas.filter((r) => r.estrella === true);

  /**
   * TODAS JUZGADAS, que no es lo mismo que todas con métodos.
   *
   * `methods: []` es un veredicto —«ningún electrodoméstico prepara esto sin
   * desvirtuarlo»— y es la respuesta correcta para una tortilla francesa o un
   * tartar. Lo que no puede haber es una receta estrella sin la clave, porque
   * eso no es «no aplica», es «nadie lo miró».
   *
   * 747 de 747 el 23 sep 2026: 710 con al menos un método y 37 juzgadas sin
   * ninguno. La tanda se generó en dos partes —Gemini hasta que se agotó el
   * crédito de AI Studio, Anthropic el resto— con el mismo prompt y el mismo
   * sanitizador.
   */
  it("no queda ninguna estrella sin juzgar", () => {
    const sinJuzgar = estrella.filter((r) => !("methods" in r)).map((r) => `${r.id} ${r.name}`);
    expect(sinJuzgar).toEqual([]);
  });

  it("y la mayoría tiene al menos un aparato", () => {
    const conAlguno = estrella.filter((r) => (r.methods ?? []).length).length;
    expect(conAlguno).toBeGreaterThanOrEqual(710);
  });

  /**
   * Un método sin tiempo o sin resumen no se puede pintar, y un tiempo de cero
   * no se puede creer. Son los tres campos que la tarjeta lee.
   */
  it("cada método trae tiempo, dificultad y resumen utilizables", () => {
    const rotos = recetas.flatMap((r) =>
      (r.methods ?? [])
        .filter(
          (m) =>
            !Number.isInteger(m.time) ||
            m.time <= 0 ||
            !["facil", "normal", "elaborada"].includes(m.difficulty) ||
            !m.prepSummary ||
            m.prepSummary.length < 20,
        )
        .map((m) => `${r.id}/${m.appliance}`),
    );
    expect(rotos).toEqual([]);
  });

  /**
   * Las recetas de bebé pasan por un prompt distinto con reglas que no se
   * negocian, porque el `prepSummary` lo lee un padre y lo hace tal cual. Sin
   * sal, sin azúcar ni miel, y sin «crujiente» ni «al dente»: a esta edad se
   * cocina de más a propósito, todo tiene que aplastarse entre dos dedos.
   */
  /**
   * UN PURÉ TIENE QUE SEGUIR SIENDO UN PURÉ, y este es el test que más importa
   * de este fichero.
   *
   * 29 de los 56 métodos de recetas `etapaBebe: "cremas"` terminaban en «cocina
   * al vapor durante 25 minutos» y ahí se paraban. La receta base sí decía
   * «triturar hasta obtener un puré fino», pero el método es lo que el usuario
   * lee cuando elige hacerlo con otro aparato: un padre que lo sigue al pie de
   * la letra le pone trozos de patata y de merluza delante a un bebé de seis
   * meses, que es riesgo de atragantamiento.
   *
   * Falla sobre todo con vaporera y olla exprés, porque esos aparatos no
   * trituran y el modelo describe honestamente lo que hacen. Reforzar el prompt
   * lo bajó de 29 a 15, y para esto 15 no es bajar. Ahora el triturado lo añade
   * `garantizarTriturado` en el propio generador, que es determinista.
   */
  it("todo método de puré de bebé acaba triturando", () => {
    const MENCIONA = /tritur|bat[ie]|chafa|aplasta|machaca|homogene|sin grumos|pur[eé] fino/i;
    const mudos = recetas
      .filter((r) => r.etapaBebe === "cremas")
      .flatMap((r) =>
        (r.methods ?? [])
          .filter((m) => !MENCIONA.test(m.prepSummary))
          .map((m) => `${r.id}/${m.appliance}`),
      );
    expect(mudos).toEqual([]);
  });

  it("ninguna receta de bebé propone sal, azúcar ni texturas duras", () => {
    const PROHIBIDO = /\bsal\b|salpimentar|sazonar|pastilla de caldo|caldo de brik|az[uú]car|\bmiel\b|crujiente|bien dorado|al dente|queso rallado/i;
    // «SIN SAL» CONTIENE «SAL», y la frontera de palabra no salva de eso: es el
    // mismo error que casaba «Vinagre de vino» con `\bvino\b`. «Caldo casero sin
    // sal» es un ingrediente REAL de estas recetas y justo lo que la regla
    // permite, así que se recorta la negación antes de preguntar en vez de
    // meterle una excepción al regex.
    const sinNegaciones = (s) => s.replace(/\bsin (sal|az[uú]car|miel)\b/gi, " ");
    const malas = recetas
      .filter((r) => r.category === "bebes")
      .flatMap((r) =>
        (r.methods ?? [])
          .filter((m) => PROHIBIDO.test(sinNegaciones(m.prepSummary)))
          .map((m) => `${r.id}/${m.appliance}: ${m.prepSummary.slice(0, 80)}`),
      );
    expect(malas).toEqual([]);
  });
});

describe("methods[].appliance", () => {
  /**
   * Cuatro recetas de legumbres traían `olla_rapida`, que NO existe: el id es
   * `olla_express`. No rompía nada visible —`APPLIANCE_LABELS[id]` devolvía
   * undefined y la etiqueta no se pintaba—, que es justo por lo que llevaba
   * ahí sin que nadie lo viera.
   */
  it("solo usa ids que existen en APPLIANCE_LABELS", () => {
    const fuera = recetas.flatMap((r) =>
      (r.methods ?? [])
        .filter((m) => !APPLIANCE_LABELS[m.appliance])
        .map((m) => `${r.id ?? r.name}: ${m.appliance}`),
    );
    expect(fuera).toEqual([]);
  });
});

describe("recipeStepsByAppliance", () => {
  const pasos = JSON.parse(readFileSync("src/data/recipeStepsByAppliance.json", "utf8"));
  const ids = new Set(recetas.map((r) => r.id));

  /**
   * DEUDA DECLARADA, no invariante. Seis claves de las 347 son de recetas que
   * ya no existen: `carnes_036`, `huevos_016`, `postres_005`, `postres_016`,
   * `postres_017`, `postres_018`. Son inofensivas —nadie puede pedir los pasos
   * de una receta borrada— y limpiarlas cuesta reescribir 1,7 MB de JSON, así
   * que se declaran aquí en vez de dejarlas invisibles. Lo que no puede es
   * crecer: si sube, es que se están borrando recetas sin barrer detrás.
   */
  it("no acumula pasos de recetas que ya no existen", () => {
    const huerfanas = Object.keys(pasos).filter((id) => !ids.has(id));
    expect(huerfanas.length).toBeLessThanOrEqual(6);
  });

  it("y sus aparatos existen en el vocabulario", () => {
    const fuera = Object.entries(pasos).flatMap(([id, porAparato]) =>
      Object.keys(porAparato)
        .filter((a) => !APPLIANCE_LABELS[a])
        .map((a) => `${id}: ${a}`),
    );
    expect(fuera).toEqual([]);
  });
});

describe("requiredAppliance", () => {
  const declarables = new Set(KITCHEN_TOOL_IDS.map((t) => t.toLowerCase()));
  const inalcanzables = recetas.filter(
    (r) => r.requiredAppliance && !declarables.has(r.requiredAppliance.toLowerCase()),
  );

  /**
   * LO QUE SE EXIGE TIENE QUE SER DECLARABLE, o la receta desaparece.
   *
   * `filterRecipes` excluye la receta cuyo `requiredAppliance` no esté entre
   * los `kitchenTools` que la casa declaró, y el asistente solo deja declarar
   * seis: airfryer, horno, microondas, olla rápida, thermomix, vaporera.
   *
   * El catálogo exigía además `batidora` (60 recetas), `plancha` (2) y
   * `gofrera` (1). Nadie podía declarar ninguna de las tres, así que esas 63
   * recetas NO SALÍAN NUNCA, para ningún usuario —47 eran estrella, y entre
   * ellas el gazpacho, el salmorejo, el hummus y todas las cremas— y no
   * fallaban de forma ruidosa: simplemente no estaban.
   *
   * Resuelto quitando el campo a las 62 de batidora y plancha: una batidora de
   * mano se presupone en cualquier cocina, y «plancha» no es un aparato sino
   * una sartén, que además ya vive en `tecnica`. El campo significa ahora lo
   * que decía significar: un trasto que NO se presupone y sin el cual el plato
   * no se puede hacer.
   *
   * La gofrera se queda, y es el único caso legítimo: una gofrera de verdad no
   * la tiene todo el mundo, y que los gofres no se propongan a quien no la
   * tiene es el comportamiento correcto. Está en la lista de excepciones para
   * que sea una decisión visible y no un descuido, como lo eran las otras 62.
   */
  const EXCEPCIONES = ["gofrera"];

  it("solo exige aparatos declarables, salvo las excepciones escritas", () => {
    const fuera = inalcanzables
      .filter((r) => !EXCEPCIONES.includes(r.requiredAppliance))
      .map((r) => `${r.id ?? r.name}: ${r.requiredAppliance}`);
    expect(fuera).toEqual([]);
  });

  it("las excepciones siguen siendo las que se decidieron", () => {
    const aparatos = [...new Set(inalcanzables.map((r) => r.requiredAppliance))].sort();
    expect(aparatos).toEqual(EXCEPCIONES);
  });
});
