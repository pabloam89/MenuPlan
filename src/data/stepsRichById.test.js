import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlainSteps, resolveRichSteps, stepsRichById } from "./stepsRichById.js";

/**
 * LOS PASOS SE BUSCAN POR ID, NUNCA POR NOMBRE.
 *
 * Hasta el 9 oct 2026 `resolveRichSteps` caía al nombre (cortado en «con …»)
 * cuando el id no estaba. En el catálogo hay 75 nombres repetidos (212
 * recetas) y 53 de ellos mezclan Estrella y fondo: «puré de calabaza» era el
 * puré de bebé (`bebes_003`) o la guarnición de adultos con jengibre
 * (`guarniciones_055`), según quién ganara. En producción, 11 ids de menús
 * guardados (recetas retiradas) no tienen id de catálogo ni pasos propios: son
 * los únicos que habrían llegado al nombre.
 */
const RAIZ = fileURLToPath(new URL("./recipes", import.meta.url));
const recetas = readdirSync(RAIZ)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(RAIZ, f), "utf8")));

const clave = (n) => String(n ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+con\s+.*$/i, "").trim();

describe("pasos: un id, sus pasos", () => {
  it("cada id con pasos rich devuelve los suyos", () => {
    const conRich = recetas.filter((r) => Array.isArray(r.stepsRich) && r.stepsRich.length > 0);
    expect(conRich.length).toBeGreaterThan(900);
    const mal = conRich.filter((r) => resolveRichSteps(r.id, { id: r.id, name: r.name }) !== stepsRichById[r.id]);
    expect(mal.map((r) => r.id)).toEqual([]);
  });

  it("un id desconocido no se resuelve por nombre, ni siquiera con un nombre del catálogo", () => {
    const porNombre = new Map();
    for (const r of recetas) {
      const k = clave(r.name);
      if (k) porNombre.set(k, [...(porNombre.get(k) ?? []), r]);
    }
    const choques = [...porNombre.values()].filter((v) => v.length > 1);
    // Suelo: hoy son 75. Si baja a 0 el bucle de abajo no prueba nada.
    expect(choques.length).toBeGreaterThan(20);
    const adivinados = [];
    for (const grupo of choques) {
      for (const r of grupo) {
        const nombre = { id: "id_que_no_existe", name: r.name };
        if (resolveRichSteps("id_que_no_existe", nombre) !== null) adivinados.push(`${r.id} «${r.name}»`);
        if (resolvePlainSteps("id_que_no_existe", nombre).length > 0) adivinados.push(`${r.id} (planos) «${r.name}»`);
      }
    }
    expect(adivinados, "los pasos de un plato no se buscan por nombre: se pegarían los de otro carril (Estrella/fondo)").toEqual([]);
  });

  it("los nombres repetidos que mezclan Estrella y fondo siguen resolviéndose cada uno por su id", () => {
    const porNombre = new Map();
    for (const r of recetas) {
      const k = clave(r.name);
      if (k) porNombre.set(k, [...(porNombre.get(k) ?? []), r]);
    }
    const mezclan = [...porNombre.values()].filter((v) => v.length > 1 && new Set(v.map((r) => Boolean(r.estrella))).size > 1);
    expect(mezclan.length).toBeGreaterThan(20);
    const cruzados = [];
    for (const grupo of mezclan) {
      for (const r of grupo) {
        if (!r.stepsRich?.length) continue;
        if (resolveRichSteps(r.id, { name: r.name }) !== stepsRichById[r.id]) cruzados.push(r.id);
      }
    }
    expect(cruzados).toEqual([]);
  });
});
