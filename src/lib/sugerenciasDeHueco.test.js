import { describe, expect, it } from "vitest";
import { sugerenciasDeHueco } from "./sugerenciasDeHueco.js";

const plato = (name, extra = {}) => ({
  name, mainProtein: "none", category: "verduras", time: 30, ...extra,
});

/** El caso real que lo motivó: siete garbanzos seguidos y luego cuatro filetes. */
const POOL_REAL = [
  plato("Buñuelos de garbanzo especiados", { mainProtein: "legumbre", category: "legumbres" }),
  plato("Garbanzos con espinacas y huevo escalfado", { mainProtein: "legumbre", category: "legumbres" }),
  plato("Judías verdes con garbanzos y jamón", { mainProtein: "legumbre", category: "legumbres" }),
  plato("Ensalada de garbanzos asados con feta", { mainProtein: "legumbre", category: "legumbres" }),
  plato("Garbanzos con chorizo y huevo frito", { mainProtein: "legumbre", category: "legumbres" }),
  plato("Ropa vieja de cocido con garbanzos", { mainProtein: "legumbre", category: "legumbres" }),
  plato("Garbanzos con arroz y verduras", { mainProtein: "legumbre", category: "legumbres" }),
  plato("Steak frites con mantequilla de perejil", { mainProtein: "ternera", category: "carnes", cocina: "francesa" }),
  plato("Milanesa de ternera con patatas", { mainProtein: "ternera", category: "carnes" }),
  plato("Filetes empanados con patatas fritas", { mainProtein: "ternera", category: "carnes" }),
  plato("Entrecot a la brasa", { mainProtein: "ternera", category: "carnes", apetecible: true }),
  plato("Bowl de quinoa, pollo y verduras", { mainProtein: "pollo", category: "pasta_arroces" }),
  plato("Merluza a la romana", { mainProtein: "pescado_blanco", category: "pescados", time: 25 }),
  plato("Tortilla de patatas", { mainProtein: "huevo", category: "huevos", time: 30 }),
  plato("Macarrones con tomate", { mainProtein: "none", category: "pasta_arroces", time: 20 }),
  plato("Lentejas de la abuela", { mainProtein: "legumbre", category: "legumbres", time: 45 }),
];

describe("sugerenciasDeHueco", () => {
  // Con un pool holgado —que es como se usa: el motor da 60 candidatos para
  // 12 sugerencias— el tope se respeta.
  it("no gasta la mitad de la tira en la misma legumbre", () => {
    const out = sugerenciasDeHueco(POOL_REAL, 6);
    const legumbres = out.filter((r) => r.mainProtein === "legumbre");
    expect(legumbres.length).toBeLessThanOrEqual(2);
  });

  it("como mucho dos por proteína y dos por categoría", () => {
    const out = sugerenciasDeHueco(POOL_REAL, 6);
    for (const clave of ["mainProtein", "category"]) {
      const cuenta = {};
      for (const r of out) cuenta[r[clave]] = (cuenta[r[clave]] ?? 0) + 1;
      for (const v of Object.values(cuenta)) expect(v).toBeLessThanOrEqual(2);
    }
  });

  it("con el pool justo, relaja el tope antes que quedarse corto", () => {
    // 16 platos y 12 sugerencias: no hay forma de cumplir el tope, y es mejor
    // enseñar doce que enseñar cinco.
    expect(sugerenciasDeHueco(POOL_REAL, 12)).toHaveLength(12);
  });

  it("los platos de ocasión y los de fuera bajan, pero no se van", () => {
    const out = sugerenciasDeHueco(POOL_REAL, 12);
    const pos = (n) => out.findIndex((r) => r.name === n);
    expect(pos("Entrecot a la brasa")).toBeGreaterThan(pos("Tortilla de patatas"));
    expect(pos("Steak frites con mantequilla de perejil")).toBeGreaterThan(pos("Macarrones con tomate"));
  });

  it("lo de media hora sube sobre lo de tres cuartos", () => {
    const out = sugerenciasDeHueco(POOL_REAL, 16);
    const pos = (n) => out.findIndex((r) => r.name === n);
    expect(pos("Macarrones con tomate")).toBeLessThan(pos("Lentejas de la abuela"));
  });

  it("devuelve tantas como se piden mientras haya de dónde", () => {
    expect(sugerenciasDeHueco(POOL_REAL, 12)).toHaveLength(12);
    expect(sugerenciasDeHueco(POOL_REAL, 5)).toHaveLength(5);
  });

  it("con poco donde elegir, completa en vez de quedarse corto", () => {
    // Cinco platos de la misma familia: el tope de dos dejaría solo dos, y
    // cinco sugerencias parecidas son mejor que dos.
    const iguales = Array.from({ length: 5 }, (_, i) =>
      plato(`Lentejas ${i}`, { mainProtein: "legumbre", category: "legumbres" }));
    expect(sugerenciasDeHueco(iguales, 12)).toHaveLength(5);
  });

  it("no repite ningún plato", () => {
    const out = sugerenciasDeHueco(POOL_REAL, 12);
    expect(new Set(out).size).toBe(out.length);
  });

  it("no toca el array que le pasan", () => {
    const copia = [...POOL_REAL];
    sugerenciasDeHueco(POOL_REAL, 12);
    expect(POOL_REAL).toEqual(copia);
  });

  it("aguanta lo vacío y lo raro", () => {
    expect(sugerenciasDeHueco([], 12)).toEqual([]);
    expect(sugerenciasDeHueco(undefined, 12)).toEqual([]);
    expect(sugerenciasDeHueco([null, undefined], 12)).toEqual([]);
  });
});
