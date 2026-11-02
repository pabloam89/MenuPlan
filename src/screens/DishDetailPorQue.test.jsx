// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { DishDetail } from "./Menu.jsx";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { catalogToFrontendRecipe } from "../lib/aiPlanner.js";
import { CANAL_DATO } from "../lib/vocabularios.js";

// Trozo 18: la ficha de un plato del menú dice quién lo puso y por qué (sobreHueco.js); en el recetario, no.
describe("DishDetail: por qué está este plato", () => {
  const receta = catalogToFrontendRecipe(recipeCatalogById.pescados_128, 4);
  const data = { notepad: { campos: { "tecnica.horno": { valor: 1, fuente: "texto" } } }, sesgos: { tecnica: { horno: 1 } } };

  it("desde un hueco del menú, con su sobre", { timeout: 60000 }, () => {
    const slot = { eaters: 4, sobre: { canal: CANAL_DATO.SISTEMA, cuando: "2026-11-02", motivo: ["tecnica.horno"] } };
    const html = renderToStaticMarkup(<DishDetail recipe={receta} slot={slot} data={data} onClose={() => {}} />);
    expect(html).toContain("Lo puso el menú automático (2026-11-02). Lo pidió lo que hay apuntado en la casa: más cosas al horno.");
  });

  it("en el recetario no hay hueco: no sale", { timeout: 60000 }, () => {
    const slot = { eaters: 4, sobre: { canal: CANAL_DATO.APP, cuando: "2026-11-02T10:00:00Z" } };
    const html = renderToStaticMarkup(<DishDetail recipe={receta} slot={slot} browse onClose={() => {}} />);
    expect(html).not.toContain("Lo puso");
  });
});
