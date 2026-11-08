// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { DishDetail } from "./Menu.jsx";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { catalogToFrontendRecipe } from "../lib/aiPlanner.js";

/**
 * La ficha de un plato con alérgenos se abre (del 3 al 7 oct 2026 se caía con
 * React #130: los alérgenos llegaban sin icono, ver allergensIconos.test.js).
 * Los dos platos con los que se vio, montados como los monta la app.
 */
describe("DishDetail con alérgenos", () => {
  for (const id of ["pescados_128", "pescados_120"]) {
    it(`${recipeCatalogById[id].name}: se abre y enseña sus alérgenos`, { timeout: 60000 }, () => {
      const receta = catalogToFrontendRecipe(recipeCatalogById[id], 4);
      const html = renderToStaticMarkup(<DishDetail recipe={receta} slot={{ eaters: 4 }} browse onClose={() => {}} />);
      expect(html).toContain("Pescado");
    });
  }
});
