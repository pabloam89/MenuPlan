import { describe, it, expect } from "vitest";
import { POLITICA, vaPorLaRapida, permitidoEn } from "./router.js";

// Una decisión del enrutador con los datos que cada modo necesita.
const DATOS = {
  consulta: { que: "menu", cuando: "hoy" },
  recomendar: { comida: "Cena" },
  compra_anadir: { productos: ["leche"] },
  compra_marcar: { productos: ["leche"] },
  cambiar: { dia: "jueves", comida: "Cena", receta: "tortilla" },
  generar: { semana: "esta" },
  deshacer: {},
};
const d = (modo, confianza) => ({ modo, confianza, datos: DATOS[modo] ?? {} });
const PRIVADO = { esGrupo: false, variosAutores: false };
const GRUPO_UNO = { esGrupo: true, variosAutores: false };
const GRUPO_VARIOS = { esGrupo: true, variosAutores: true };

describe("la política del enrutador, por modo", () => {
  it("en privado: por la rápida a partir del umbral de cada modo, no antes", () => {
    for (const [modo, p] of Object.entries(POLITICA)) {
      if (p.umbral == null || !DATOS[modo]) continue;
      expect(vaPorLaRapida(d(modo, p.umbral), PRIVADO)).toBe(true);
      expect(vaPorLaRapida(d(modo, p.umbral - 0.01), PRIVADO)).toBe(false);
    }
  });

  it("los umbrales de partida: leer 0,8, compra 0,85, escribir en el menú 0,9", () => {
    expect(vaPorLaRapida(d("consulta", 0.8), PRIVADO)).toBe(true);
    expect(vaPorLaRapida(d("compra_anadir", 0.84), PRIVADO)).toBe(false);
    expect(vaPorLaRapida(d("cambiar", 0.85), PRIVADO)).toBe(false);
    expect(vaPorLaRapida(d("cambiar", 0.95), PRIVADO)).toBe(true);
  });

  it("generar con platos pedidos va a Lola, por segura que esté", () => {
    expect(vaPorLaRapida({ modo: "generar", confianza: 0.99, datos: { semana: "siguiente", fijos: "salmon" } }, PRIVADO)).toBe(false);
    expect(vaPorLaRapida({ modo: "generar", confianza: 0.99, datos: { semana: "siguiente", fijos: ["salmon"] } }, PRIVADO)).toBe(false);
    expect(vaPorLaRapida({ modo: "generar", confianza: 0.99, datos: { semana: "siguiente", fijos: [] } }, PRIVADO)).toBe(true);
  });

  it("en un chat de grupo, una persona: leer y la compra, sí; cambiar, generar y deshacer, a Lola", () => {
    expect(vaPorLaRapida(d("consulta", 0.95), GRUPO_UNO)).toBe(true);
    expect(vaPorLaRapida(d("recomendar", 0.95), GRUPO_UNO)).toBe(true);
    expect(vaPorLaRapida(d("compra_anadir", 0.95), GRUPO_UNO)).toBe(true);
    expect(vaPorLaRapida(d("compra_marcar", 0.95), GRUPO_UNO)).toBe(true);
    expect(vaPorLaRapida(d("cambiar", 0.99), GRUPO_UNO)).toBe(false);
    expect(vaPorLaRapida(d("generar", 0.99), GRUPO_UNO)).toBe(false);
    expect(vaPorLaRapida(d("deshacer", 0.99), GRUPO_UNO)).toBe(false);
  });

  it("en un chat de grupo con varias personas en el mismo turno: solo leer el menú", () => {
    expect(vaPorLaRapida(d("consulta", 0.95), GRUPO_VARIOS)).toBe(true);
    expect(vaPorLaRapida(d("recomendar", 0.95), GRUPO_VARIOS)).toBe(false);
    expect(vaPorLaRapida(d("compra_anadir", 0.95), GRUPO_VARIOS)).toBe(false);
  });

  it("elegir una opción (paso 0): en privado sí, en grupo no", () => {
    expect(permitidoEn("eleccion", PRIVADO)).toBe(true);
    expect(permitidoEn("eleccion", GRUPO_UNO)).toBe(false);
  });

  it("un modo sin entrada en la tabla va siempre a Lola", () => {
    expect(vaPorLaRapida({ modo: "inventado", confianza: 1, datos: {} }, PRIVADO)).toBe(false);
    expect(vaPorLaRapida({ modo: "lola", confianza: 1, datos: {} }, PRIVADO)).toBe(false);
    expect(permitidoEn("inventado", PRIVADO)).toBe(false);
  });

  it("los datos que pide cada modo se siguen exigiendo", () => {
    expect(vaPorLaRapida({ modo: "consulta", confianza: 0.95, datos: { que: "menu", cuando: "dia" } }, PRIVADO)).toBe(false);
    // Desde el 1 oct 2026 el día basta: si falta comida o cena, la vía rápida
    // lo pregunta con botones (api/_bot/plato.js). Sin día, sigue yendo a Lola.
    expect(vaPorLaRapida({ modo: "cambiar", confianza: 0.95, datos: { dia: "jueves" } }, PRIVADO)).toBe(true);
    expect(vaPorLaRapida({ modo: "cambiar", confianza: 0.95, datos: { comida: "Cena" } }, PRIVADO)).toBe(false);
    expect(vaPorLaRapida({ modo: "compra_anadir", confianza: 0.95, datos: { productos: [] } }, PRIVADO)).toBe(false);
  });
});
