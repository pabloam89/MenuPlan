import { describe, it, expect } from "vitest";
import { filterRecipes } from "./filterRecipes.js";
import { SIEMPRE_ENCENDIDAS } from "../lib/cocinaTopes.js";

/**
 * La puerta de cocinas: una cocina extranjera está apagada salvo que la pidas.
 *
 * Es al revés que el resto de filtros del fichero, y por eso lleva sus propias
 * pruebas: lo que se comprueba aquí no es que EXCLUYA bien, sino que no excluya
 * de más — el 78 % del catálogo servible no tiene `cocina`, y ese fondo de
 * armario español no puede caerse nunca.
 */
const pool = (cocinas) => filterRecipes(cocinas === undefined ? {} : { cocinas }).recipes;
const conCocina = (rs, c) => rs.filter((r) => r.cocina === c);
const TODAS_APAGADAS = pool({
  peruana: 0, india: 0, mexicana: 0, arabe: 0, francesa: 0, asiatica: 0, americana: 0,
});
/**
 * El baseline ya NO puede ser `pool(undefined)`: sin pedir nada tampoco entran.
 * Para saber cuántos platos tiene una cocina hay que pedirla.
 */
const TODAS_PEDIDAS = pool({
  peruana: 1, india: 1, mexicana: 1, arabe: 1, francesa: 1, asiatica: 1, americana: 1,
});

describe("puerta de cocinas en filterRecipes", () => {
  /**
   * Esto ANTES decía lo contrario ("sin pedir nada, no filtra"), y era un
   * agujero: la casa recién creada, la que nunca ha tocado el mando de Cocina,
   * era justo la única que recibía platos de todas las cocinas del mundo. No se
   * notaba porque las 27 recetas peruanas e indias estaban en `estrella: false`
   * y no llegaban al pool de todas formas; al encenderlas, ese hueco las metía
   * en la semana de cualquiera sin haberlas pedido.
   */
  it("sin pedir nada no entra ninguna: es lo mismo que pedir cero", () => {
    const sinNada = pool(undefined);
    expect(pool(null)).toHaveLength(sinNada.length);
    expect(pool({})).toHaveLength(sinNada.length);
    expect(sinNada).toHaveLength(TODAS_APAGADAS.length);
    for (const c of ["peruana", "india", "mexicana", "asiatica", "arabe", "francesa", "americana"]) {
      expect(conCocina(sinNada, c), `${c} entra sin pedirla`).toHaveLength(0);
    }
  });

  it("una cocina a cero desaparece del pool", () => {
    expect(conCocina(TODAS_PEDIDAS, "peruana").length).toBeGreaterThan(0);
    expect(conCocina(pool({ peruana: 0 }), "peruana")).toHaveLength(0);
  });

  it("pedirla la deja entrar", () => {
    const todas = conCocina(TODAS_PEDIDAS, "mexicana").length;
    expect(todas).toBeGreaterThan(0);
    expect(conCocina(pool({ mexicana: 2 }), "mexicana")).toHaveLength(todas);
  });

  it("apagar una no apaga las demás que no se han nombrado", () => {
    // `cocinas` es un mapa parcial: lo que no aparece se trata como cero, que
    // es la política de opt-in. Lo importante es que apagar todas NO toque lo
    // español.
    const soloMexicana = pool({ mexicana: 3 });
    expect(conCocina(soloMexicana, "mexicana").length).toBeGreaterThan(0);
    expect(conCocina(soloMexicana, "peruana")).toHaveLength(0);
    expect(conCocina(soloMexicana, "india")).toHaveLength(0);
  });

  it("lo que NO tiene cocina no se toca jamás", () => {
    // La mayoría del pool servible no tiene `cocina`, y ausente significa
    // española por convención. Si la puerta se los llevara, apagar las cocinas
    // dejaría la casa sin comida.
    const base = pool(undefined);
    const todo = base.filter((r) => !r.cocina).length;
    const apagado = TODAS_APAGADAS.filter((r) => !r.cocina).length;
    expect(apagado).toBe(todo);
    // Y son la mayoría del pool: si algún día dejan de serlo, esta puerta pasa
    // a ser peligrosa y conviene enterarse.
    expect(todo).toBeGreaterThan(base.length / 2);
  });

  it("italiana sobrevive aunque no la pidas: es el bloque de pasta", () => {
    expect(SIEMPRE_ENCENDIDAS.has("italiana")).toBe(true);
    const antes = conCocina(pool(undefined), "italiana").length;
    expect(antes).toBeGreaterThan(0);
    expect(conCocina(pool({ italiana: 0, peruana: 0 }), "italiana")).toHaveLength(antes);
  });

  it("apagarlo todo quita EXACTAMENTE las extranjeras, ni un plato más", () => {
    // La puerta nunca puede matar de hambre al planner: lo que se cae es
    // contable y es justo lo que se ha apagado.
    const base = pool(undefined);
    const extranjeras = base.filter((r) => r.cocina && !SIEMPRE_ENCENDIDAS.has(r.cocina)).length;
    expect(TODAS_APAGADAS).toHaveLength(base.length - extranjeras);
    // Un menú son ~14 huecos: que quede pool de sobra no es opinión.
    expect(TODAS_APAGADAS.length).toBeGreaterThan(100);
  });
});
