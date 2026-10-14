import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ComparadorDiseno, { Muestra } from "./ComparadorDiseno.jsx";
import base from "../../lint-tokens-base.json";
import { valoresPlanos } from "../design/tokens.js";
import { TIPOS, leerBase, agruparBase, versionesConOtroToken } from "../../scripts/lib/comparadorFundamentos.mjs";

/**
 * La página del comparador (#825) se pinta entera con la base real: una
 * tarjeta por familia del tipo que abre (colores) y las cifras de los ocho
 * tipos. Se renderiza a texto, sin navegador: lo visual lo mira qa.
 */
describe("ComparadorDiseno · valores base", () => {
  const html = renderToStaticMarkup(<ComparadorDiseno />);
  const datos = agruparBase(leerBase(base), valoresPlanos());

  it("pinta una tarjeta por cada familia de color", () => {
    const tarjetas = html.match(/<article/g) ?? [];
    expect(tarjetas.length).toBe(datos.cifras.color.familias);
  });

  it("las cifras de los ocho tipos van en tarjetas que se parten, sin tabla ni desplazamiento lateral", () => {
    // A 375 px una tabla de seis columnas se cortaba por la derecha (qa, #825).
    expect(html).not.toContain("<table");
    expect(html).not.toContain("overflow-x");
    const cifras = html.match(/data-cifras-tipo="/g) ?? [];
    expect(cifras.length).toBe(TIPOS.length);
    expect(html).toContain("Tamaños de letra");
    expect(html).toContain(`>${datos.cifras.color.distintos}</dd>`);
    expect(html).toContain("Sin token cercano");
    expect(html).toContain("Tokens hoy");
  });

  it("propone el token de marca para el verde de marca", () => {
    expect(html).toContain("Pasa a marca (#2d5a3d)");
  });

  it("marca a la vista, no solo en title, las versiones que pasan a otro token", () => {
    const esperadas = datos.porTipo.color.familias.reduce((n, f) => n + (f.valores.length > 1 ? versionesConOtroToken(f).length : 0), 0);
    expect(esperadas).toBeGreaterThan(0);
    expect((html.match(/data-otro-token="si"/g) ?? []).length).toBe(esperadas);
  });
});

describe("ComparadorDiseno · sombras", () => {
  const sombras = agruparBase(leerBase(base), valoresPlanos()).porTipo.sombra.valores.map((v) => v.valor);

  it("toda muestra de sombra va recortada a su caja y con su propio contexto de apilamiento", () => {
    // Las sombras tipo velo (0 0 0 9999px) oscurecían la página entera (qa, #825).
    for (const valor of sombras) {
      for (const grande of [false, true]) {
        const h = renderToStaticMarkup(<Muestra tipo="sombra" valor={valor} grande={grande} />);
        expect(h, valor).toMatch(/^<span[^>]*style="[^"]*overflow:hidden[^"]*isolation:isolate/);
      }
    }
  });

  it("una sombra de extensión enorme se enseña como velo dentro de la caja, sin pintarla", () => {
    const velo = "0 0 0 9999px rgba(11,28,18,.66)";
    expect(sombras).toContain(velo);
    const h = renderToStaticMarkup(<Muestra tipo="sombra" valor={velo} grande />);
    expect(h).not.toContain("box-shadow");
    expect(h).toContain("velo");
  });
});

describe("ComparadorDiseno · tipos numéricos", () => {
  it("tamaños de letra: ofrece ordenar por valor y explica el umbral relativo", () => {
    const h = renderToStaticMarkup(<ComparadorDiseno tipoInicial="tamano-letra" ordenInicial="valor" />);
    expect(h).toContain("Por valor");
    expect(h).toContain("Por usos");
    expect(h).toMatch(/15 px/);
    const valores = [...h.matchAll(/data-representante="([^"]+)"/g)].map((m) => Number(m[1]));
    expect(valores.length).toBeGreaterThan(1);
    expect(valores).toEqual([...valores].sort((a, b) => a - b));
  });

  it("los colores no ofrecen ordenar por valor", () => {
    expect(renderToStaticMarkup(<ComparadorDiseno />)).not.toContain("Por valor");
  });
});
