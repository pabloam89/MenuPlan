import { describe, expect, it } from "vitest";

import alimentos from "./alimentos.json";
import bedcaChoices from "./bedcaChoices.json";
import ciqualChoices from "./ciqualChoices.json";
import usdaChoices from "./usdaChoices.json";

/**
 * LA DIRECCIÓN DIFÍCIL DE LA PROCEDENCIA.
 *
 * `alimentos.test.js` ya comprueba que toda decisión curada apunta a un
 * ingrediente que existe y trae su motivo. Eso es la dirección fácil: vigila
 * lo que alguien se sentó a escribir.
 *
 * Lo que faltaba es el recíproco, y es donde estaba el agujero: **que todo
 * número EN USO diga con qué autoridad se eligió su ficha**. Medido el 22 sep
 * 2026, 76 de los 377 alimentos con número tenían `fuenteId` y ninguna
 * decisión detrás — la patata (49 kg de catálogo), el aceite de oliva (28 kg),
 * el tomate, la pechuga de pollo. El 32 % de la masa servida, presentes en
 * 1.010 de las 1.033 recetas.
 *
 * `build-alimentos.mjs` los reconstruyó por coincidencia de los cuatro macros
 * duros contra candidatos que viven en `output/`, que está en .gitignore. La
 * inferencia se calculaba (`via: "macros"`) y se tiraba al escribir la fila,
 * así que desde el repo eran indistinguibles de una decisión revisada.
 *
 * No son «no lo sé»: son «creo que sí y no te lo digo», que es peor, porque
 * un «no lo sé» se puede ir a mirar y una respuesta plausible no.
 *
 * Este test NO exige que el trabajo esté hecho — exige que esté DECLARADO. Un
 * `fuenteId` sin decisión es válido si dice `via: "macros"`; lo que no puede
 * es callarse.
 */
const decididos = new Set(
  [bedcaChoices, ciqualChoices, usdaChoices]
    .flatMap((t) => Object.entries(t))
    .filter(([clave, v]) => !clave.startsWith("_") && v?.foodId != null)
    .map(([clave]) => clave),
);

describe("todo número dice de dónde sale", () => {
  it("ningún `fuenteId` se calla con qué autoridad se eligió", () => {
    const mudos = alimentos
      .filter((a) => a.fuenteId && a.via == null)
      .map((a) => `${a.id} → ${a.fuente}:${a.fuenteId}`);

    expect(
      mudos,
      "fichas en uso que no dicen con qué autoridad se eligieron. Un `fuenteId` sin `via` "
      + "parece trazado y no lo está — es peor que uno sin fuente, porque el sin_fuente "
      + "al menos se ve. Persiste lo que `procedenciaDe` ya calcula.",
    ).toEqual([]);
  });

  it("lo que dice `decision`/`ciqual`/`usda` tiene de verdad una decisión curada", () => {
    const mienten = alimentos
      .filter((a) => ["decision", "ciqual", "usda"].includes(a.via) && !decididos.has(a.id))
      .map((a) => `${a.id} dice via:"${a.via}" y no hay entrada suya en ningún *Choices.json`);

    expect(mienten, "declaran autoridad humana y no existe la decisión que la respalda").toEqual([]);
  });

  it("lo inferido por macros no finge tener un motivo", () => {
    // La rama `macros` no puede dar motivo: nadie decidió. Si alguna trae uno,
    // es que se está colando por la rama equivocada.
    const fingen = alimentos.filter((a) => a.via === "macros" && a.motivo != null).map((a) => a.id);
    expect(fingen, "`via: macros` con motivo: o la eligió alguien, y entonces es una decisión").toEqual([]);
  });

  it("toda decisión humana trae su motivo escrito en la fila", () => {
    const mudas = alimentos
      .filter((a) => ["decision", "ciqual", "usda"].includes(a.via))
      .filter((a) => typeof a.motivo !== "string" || a.motivo.trim().length < 20)
      .map((a) => `${a.id} (via:${a.via})`);
    expect(mudas, "decisión sin motivo: dentro de seis meses nadie sabrá si es un juicio o un typo").toEqual([]);
  });

  // ── El trinquete, y llegó a cero el 22 sep 2026 ───────────────────────────
  //
  // Empezó en 76: alimentos cuya ficha no eligió nadie, sino el emparejador por
  // coincidencia de los cuatro macros duros contra candidatos que viven en
  // output/ (que está en .gitignore). Desde el repo eran indistinguibles de una
  // decisión revisada — la patata, el aceite de oliva, el tomate, la pechuga de
  // pollo: el 32 % de la masa servida del catálogo.
  //
  // Se revisaron los 76 contra BEDCA en vivo, CIQUAL crudo y USDA SR Legacy.
  // NUEVE estaban mal, y no de forma sutil: la pechuga llevaba ficha «plancha»
  // sobre peso crudo, el tomate triturado compartía la del tomate fresco, el
  // pan rallado tenía 34,9 % de agua, las aceitunas 54 mg de sodio en salmuera,
  // el requesón era cottage cheese y el chocolate un 50 %. Los otros 67 estaban
  // bien y ahora lo DICEN, que es la mitad del trabajo: una revisión que no se
  // escribe se pierde igual que si no se hubiera hecho.
  //
  // Ahora el suelo es cero y significa otra cosa: que no entre ni uno nuevo.
  // Si sube, es que alguien añadió un alimento y dejó que la máquina le
  // adivinara la ficha.
  const INFERIDOS_MAX = 0;

  it(`los inferidos por macros no pasan de ${INFERIDOS_MAX} (hoy es un suelo, no un objetivo)`, () => {
    const inferidos = alimentos.filter((a) => a.via === "macros");
    expect(
      inferidos.length,
      `${inferidos.length} fichas elegidas por coincidencia de macros y no por nadie. `
      + "Si ha subido, alguien añadió un alimento sin decidir su ficha. Si ha bajado, "
      + "baja también este número.",
    ).toBeLessThanOrEqual(INFERIDOS_MAX);
  });
});
