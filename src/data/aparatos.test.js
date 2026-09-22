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
