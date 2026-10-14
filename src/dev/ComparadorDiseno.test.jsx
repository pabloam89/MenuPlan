import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ComparadorDiseno from "./ComparadorDiseno.jsx";
import base from "../../lint-tokens-base.json";
import { valoresPlanos } from "../design/tokens.js";
import { leerBase, agruparBase } from "../../scripts/lib/comparadorFundamentos.mjs";

/**
 * La página del comparador (#825) se pinta entera con la base real: una
 * tarjeta por familia del tipo que abre (colores) y la tabla de cifras de los
 * ocho tipos. Se renderiza a texto, sin navegador: lo visual lo mira qa.
 */
describe("ComparadorDiseno · valores base", () => {
  const html = renderToStaticMarkup(<ComparadorDiseno />);
  const datos = agruparBase(leerBase(base), valoresPlanos());

  it("pinta una tarjeta por cada familia de color", () => {
    const tarjetas = html.match(/<article/g) ?? [];
    expect(tarjetas.length).toBe(datos.cifras.color.familias);
  });

  it("la tabla de cifras lleva los ocho tipos con sus valores distintos", () => {
    expect(html).toContain("Tamaños de letra");
    const filas = html.match(/<tr>/g) ?? [];
    expect(filas.length).toBe(1 + 8);
    expect(html).toContain(`>${datos.cifras.color.distintos}</td>`);
  });

  it("propone el token de marca para el verde de marca", () => {
    expect(html).toContain("Pasa a marca (#2d5a3d)");
  });
});
