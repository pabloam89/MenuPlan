import { describe, expect, it } from "vitest";

import { BASES, claveDeBase, sesionDeBases } from "./bases.js";

/**
 * Cuánto aguanta una base en la nevera, y qué pasa con lo que no cabe.
 *
 * No es una preferencia de textura: el arroz y la pasta cocidos aguantan uno o
 * dos días a 4 °C por el *Bacillus cereus*, que no cambia ni el olor ni el
 * sabor, y las guías de seguridad alimentaria dicen por eso que no son
 * preparaciones de tanda semanal. Sin este límite la sesión del domingo
 * proponía cocinar arroz para comerlo el jueves.
 *
 * Lo que cae fuera de la ventana va al congelador si la base lo admite; si no,
 * ese día se cocina desde cero y la tanda no se lo apunta.
 */

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const COMIDAS = ["Cena"];

const receta = (id, claves) => ({ id, name: id, basesAparte: claves, mealRole: ["cena"] });

/** Un plan con un plato por día, todos con las mismas bases. */
const planDe = (dias) => {
  const slots = {};
  for (const d of dias) slots[`${d}-Cena`] = { recipeId: `plato-${d}`, eaters: 2 };
  return { g1: slots };
};

const catalogo = (dias, claves) =>
  Object.fromEntries(dias.map((d) => [`plato-${d}`, receta(`plato-${d}`, claves)]));

const sesion = (dias, claves) =>
  sesionDeBases(planDe(dias), catalogo(dias, claves), { dias: DIAS, comidas: COMIDAS });

describe("conservación · hasta dónde llega una tanda", () => {
  it("todas las bases dicen cuánto aguantan", () => {
    const mudas = BASES.filter((b) => !(b.conservacion?.nevera > 0));
    expect(mudas.map(claveDeBase)).toEqual([]);
  });

  it("el arroz cubre lunes y martes, y el resto va al congelador", () => {
    // Arroz: 2 días de nevera, y se congela.
    const s = sesion(["Lun", "Mar", "Jue"], ["arroz"]);
    const arroz = s.bases.find((b) => claveDeBase(b.base) === "arroz");
    expect(arroz.huecos.map((h) => h.desde)).toEqual(["nevera", "nevera", "congelador"]);
    expect(arroz.racionesNevera).toBe(4);
    expect(arroz.racionesCongelador).toBe(2);
  });

  it("lo que ni cabe en la nevera ni se congela, se cae del reparto", () => {
    // Cuscús: 2 días y NO congelable. El jueves se hidrata en el momento.
    const s = sesion(["Lun", "Mar", "Jue"], ["cuscus"]);
    const cuscus = s.bases.find((b) => claveDeBase(b.base) === "cuscus");
    expect(cuscus.huecos).toHaveLength(2);
    expect(cuscus.huecos.every((h) => h.desde === "nevera")).toBe(true);
    // Y se dice cuál se ha quedado fuera, en vez de callarlo.
    expect(cuscus.huecosFuera.map((h) => h.clave)).toEqual(["Jue-Cena"]);
  });

  it("si al quitar lo que no cabe quedan menos de dos, no hay tanda", () => {
    // Lunes dentro de la ventana, viernes y sábado fuera y sin congelador:
    // queda un solo plato, y uno no es una tanda.
    const s = sesion(["Lun", "Vie", "Sáb"], ["cuscus"]);
    expect(s.bases.find((b) => claveDeBase(b.base) === "cuscus")).toBeUndefined();
  });

  it("el sofrito llega hasta el jueves sin tocar el congelador", () => {
    const s = sesion(["Lun", "Jue"], ["sofrito"]);
    const sofrito = s.bases.find((b) => claveDeBase(b.base) === "sofrito");
    expect(sofrito.huecos.every((h) => h.desde === "nevera")).toBe(true);
    expect(sofrito.diasEnNevera).toBe(4);
  });

  it("una semana que empieza tarde cuenta desde su primer día, no desde el lunes", () => {
    // El reparto mira la posición dentro de los días ACTIVOS: si la semana
    // empieza el miércoles, el miércoles es el día 1 y no el tercero.
    const s = sesionDeBases(
      planDe(["Mié", "Jue"]),
      catalogo(["Mié", "Jue"], ["cuscus"]),
      { dias: ["Mié", "Jue", "Vie"], comidas: COMIDAS },
    );
    const cuscus = s.bases.find((b) => claveDeBase(b.base) === "cuscus");
    expect(cuscus.huecos.every((h) => h.desde === "nevera")).toBe(true);
  });

  it("las raciones que publica son las que de verdad salen de la olla", () => {
    // Si un hueco se cae por conservación, sus raciones no se cocinan.
    const s = sesion(["Lun", "Mar", "Jue"], ["cuscus"]);
    const cuscus = s.bases.find((b) => claveDeBase(b.base) === "cuscus");
    expect(cuscus.raciones).toBe(4);
    expect(cuscus.raciones).toBe(cuscus.racionesNevera + cuscus.racionesCongelador);
  });
});
