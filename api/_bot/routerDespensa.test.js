/**
 * «Tengo esto en la nevera: …» no va a «ver despensa» (#958). Unas 40 cosas
 * dichas por voz se fueron por la vía rápida de la despensa, que solo LEE:
 * la familia vio su despensa de antes y no se apuntó ninguna. Se prueba por
 * la puerta de verdad, vaPorLaRapida, con lo que clasificó el enrutador.
 */
import { describe, it, expect } from "vitest";
import { vaPorLaRapida } from "./router.js";

const d = () => ({ modo: "despensa", confianza: 0.95, datos: { varias: false } });

describe("la despensa por la vía rápida solo se lee", () => {
  it.each([
    "tengo esto en la nevera: leche, huevos, pollo",
    "me quedan tres huevos",
    "he comprado pollo y arroz",
    "tengo en la nevera leche, ¿me lo apuntas?",
    "Tenemos en el congelador dos pizzas y guisantes",
  ])("«%s» es apuntar: a Lola", (t) => {
    expect(vaPorLaRapida(d(), { texto: t })).toBe(false);
  });

  it.each([
    "¿qué tengo en la despensa?",
    "qué queda en el congelador",
    "¿tengo huevos?",
    "dime qué hay en la nevera",
    "¿Cuántos huevos quedan?",
  ])("«%s» es preguntar: por la vía rápida", (t) => {
    expect(vaPorLaRapida(d(), { texto: t })).toBe(true);
  });
});
