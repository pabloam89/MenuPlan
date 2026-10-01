import { describe, it, expect } from "vitest";
import { rasgosDeFrase, cumple, excluye, GRUPOS } from "./rasgosBusqueda.js";

const campos = (lista) => lista.map((x) => `${x.campo}:${x.valor}`);
const fuera = (frase) => rasgosDeFrase(frase).excluir.map((x) => `${x.tipo}:${x.valor}`);

describe("rasgosDeFrase", () => {
  it("«para el frío» es caliente y reconfortante, no un plato frío", () => {
    const r = rasgosDeFrase("algo de cuchara para el frío");
    expect(campos(r.blandos)).toEqual(expect.arrayContaining(["temperatura:caliente", "connotacion:reconfortante", "textura:cuchara"]));
    expect(campos(r.blandos)).not.toContain("temperatura:frio");
  });

  it("la técnica dicha y el tiempo son duros; lo demás, blando", () => {
    const r = rasgosDeFrase("pescado al horno rapidito");
    expect(campos(r.duros)).toEqual(["tecnica:horno", "maxMinutos:25"]);
    expect(campos(r.blandos)).toEqual(["grupo:pescado"]);
    expect(campos(rasgosDeFrase("algo en 20 minutos").duros)).toEqual(["maxMinutos:20"]);
  });

  it("la carpeta sacada de palabras no filtra: «ensalada de pasta» no se queda sin nada", () => {
    expect(rasgosDeFrase("ensalada de pasta").duros).toEqual([]);
  });

  it("negaciones que se resuelven: grupo, técnica, picante, y al final de la frase", () => {
    expect(fuera("que no sea pescado")).toEqual(["grupo:pescado"]);
    expect(fuera("no me apetece pescado")).toEqual(["grupo:pescado"]);
    expect(fuera("pescado no")).toEqual(["grupo:pescado"]);
    expect(fuera("sin encender el horno")).toEqual(["tecnica:horno"]);
    expect(fuera("ni carne ni pescado")).toEqual(["grupo:pescado", "grupo:carne"]);
    expect(fuera("algo que no pique")).toEqual(["picante:true"]);
    expect(rasgosDeFrase("que no sea pescado").negacionSinResolver).toBe(false);
  });

  it("lo negado no cuenta como pedido ni se vectoriza", () => {
    const r = rasgosDeFrase("algo sin carne para cenar");
    expect(campos(r.blandos)).not.toContain("grupo:carne");
    expect(r.resto).not.toMatch(/carne/);
  });

  it("una negación que no se entiende va a Haiku", () => {
    expect(rasgosDeFrase("algo que no sea muy pesado").negacionSinResolver).toBe(true);
  });

  it("frases hechas que no niegan nada", () => {
    for (const f of ["algo sin complicarse", "sin prisa, lo que sea", "ni idea, sorpréndeme", "algo en menos de 20 minutos"]) {
      expect(rasgosDeFrase(f).negacion, f).toBe(false);
    }
    expect(campos(rasgosDeFrase("algo sin complicarse").blandos)).toContain("dificultad:facil");
  });

  it("frontera de palabra: «ni» no es «niños», «pique» no es «picar», «pollo» no es «repollo»", () => {
    expect(rasgosDeFrase("algo para los niños").negacion).toBe(false);
    expect(campos(rasgosDeFrase("algo para los niños").blandos)).toContain("ninos:true");
    expect(campos(rasgosDeFrase("algo de picar para el fútbol").blandos)).toEqual(["textura:mano"]);
    expect(campos(rasgosDeFrase("algo con repollo").blandos)).toEqual([]);
  });

  it("el grupo concreto tapa al general", () => {
    expect(campos(rasgosDeFrase("pescado azul").blandos)).toEqual(["grupo:pescado_azul"]);
    expect(campos(rasgosDeFrase("carne roja").blandos)).toEqual(["grupo:carne_roja"]);
  });
});

describe("cumple y excluye", () => {
  it("al pedir, un dato que falta no cumple; al excluir, pasa", () => {
    const sinTecnica = { name: "x", ingredients: [] };
    expect(cumple(sinTecnica, { campo: "tecnica", valor: "horno" })).toBe(false);
    expect(excluye(sinTecnica, { tipo: "tecnica", valor: "horno" })).toBe(false);
  });

  it("el pescado se ve por la proteína y los ingredientes, no solo por la carpeta", () => {
    const arrozConGambas = { category: "pasta_arroces", mainProtein: "marisco", ingredients: [{ name: "Gambas" }] };
    const lentejasConChorizo = { category: "legumbres", mainProtein: "legumbre", ingredients: [{ name: "Chorizo" }] };
    expect(GRUPOS.pescado.es(arrozConGambas)).toBe(true);
    expect(GRUPOS.carne.es(lentejasConChorizo)).toBe(true);
  });
});
