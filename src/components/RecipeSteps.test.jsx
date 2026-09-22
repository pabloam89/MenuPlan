import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecipeStepList } from "./RecipeSteps.jsx";
import { recetaConBases } from "../lib/recetaConBases.js";

/**
 * El paso a paso pintado, con y sin bases hechas.
 *
 * Se renderiza a texto plano (sin DOM ni interacción) porque lo único que hace
 * falta comprobar aquí es que un paso que viene de sacar el táper se distinga
 * del que hay que cocinar. Sin esa etiqueta, "calienta el sofrito un minuto"
 * parece un paso más de la receta y la promesa del batch cooking se pierde
 * justo donde el usuario la cobra.
 */
describe("RecipeStepList · pasos de la tanda", () => {
  const PLATO = {
    name: "Pollo con sofrito",
    basesAparte: ["sofrito"],
    ingredients: [
      { name: "Cebolla", ingredientId: "cebolla", amount: 150, unit: "g" },
      { name: "Pechuga de pollo", ingredientId: "pechuga-de-pollo", amount: 300, unit: "g" },
    ],
    stepsRich: [
      { text: "Picar {{Cebolla}} muy fina.", minutes: 5, kind: "prep", base: "sofrito" },
      { text: "Pocharla a fuego suave.", minutes: 15, kind: "activo", base: "sofrito" },
      { text: "Saltear {{Pechuga de pollo}} y añadir el sofrito.", minutes: 8, kind: "activo" },
    ],
  };

  it("sin bases hechas no aparece ninguna etiqueta de tanda", () => {
    const html = renderToStaticMarkup(
      <RecipeStepList rich={PLATO.stepsRich} ingredients={PLATO.ingredients} />,
    );
    expect(html).toContain("Pocharla a fuego suave");
    expect(html).not.toContain("De la tanda");
  });

  it("con la base hecha, los pasos de reactivar salen marcados", () => {
    const vista = recetaConBases(PLATO);
    const html = renderToStaticMarkup(
      <RecipeStepList rich={vista.pasos} ingredients={PLATO.ingredients} />,
    );
    expect(html).toContain("De la tanda");
    // El paso de pochar la cebolla ya no está: eso se hizo el domingo.
    expect(html).not.toContain("Pocharla a fuego suave");
    // Y el que junta el sofrito con el pollo sigue, que hay que hacerlo hoy.
    expect(html).toContain("Saltear");
  });

  it("no revienta con una lista vacía ni con pasos sueltos en texto plano", () => {
    expect(() => renderToStaticMarkup(<RecipeStepList rich={[]} plain={["Cocer."]} />)).not.toThrow();
    expect(renderToStaticMarkup(<RecipeStepList rich={null} plain={["Cocer."]} />)).toContain("Cocer.");
  });
});
