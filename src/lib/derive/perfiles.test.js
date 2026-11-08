/**
 * Los perfiles se comprueban contra una segunda escritura de cada definición,
 * hecha a mano aquí con las fórmulas, y no contra números copiados: si el
 * catálogo cambia, el recuento cambia en los dos lados y el test sigue diciendo
 * la verdad.
 */

import { describe, it, expect } from "vitest";
import { recipeCatalog } from "../../data/recipeCatalog.js";
import { EJE_POR_ID } from "../../data/axisRegistry.js";
import { completitudDe } from "./ejesDePlato.js";
import { PERFILES, IDS_PERFILES, puntuar, perfilesDe, ordenarPorPerfil } from "./perfiles.js";

const leer = (p, campo) => (p?.[campo] == null ? null : p[campo]);
const ctx = { leer, completitud: completitudDe };
const estrella = recipeCatalog.filter((r) => r.estrella);

const pct = (r, campo, kcalG) => (r[campo] == null || !(r.kcal > 0) ? null : (kcalG * r[campo]) / r.kcal);
const entre = (x, min, max) => x != null && (min == null || x >= min) && (max == null || x <= max);

const A_MANO = {
  equilibrado: (r) => entre(pct(r, "protein_g", 4), 0.2) && entre(pct(r, "carbs_g", 4), 0.3, 0.55)
    && entre(pct(r, "fat_g", 9), 0.2, 0.4) && completitudDe(r).valor === true,
  altoProteina: (r) => entre(pct(r, "protein_g", 4), 0.3) && entre(r.protein_g, 25),
  despuesEntrenar: (r) => entre(r.protein_g, 25) && entre(r.carbs_g, 35) && entre(pct(r, "fat_g", 9), null, 0.35),
  antesEntrenar: (r) => entre(pct(r, "carbs_g", 4), 0.45) && entre(pct(r, "fat_g", 9), null, 0.3) && entre(pct(r, "protein_g", 4), 0.15),
  ligeroQueSacie: (r) => entre(r.kcal, null, 450) && r.protein_g != null && r.fiber_g != null && r.kcal > 0
    && (100 * (r.protein_g + r.fiber_g)) / r.kcal >= 7.6,
  bajoSal: (r) => entre(r.sodium_mg, null, 500),
  ricoHierro: (r) => entre(r.iron_mg, 4.2),
};

describe("perfiles nutricionales", () => {
  it("cada perfil tiene su segunda escritura en el test", () => {
    expect(Object.keys(A_MANO).sort()).toEqual([...IDS_PERFILES].sort());
  });

  it("el vocabulario del eje 50 son los perfiles que existen", () => {
    expect([...EJE_POR_ID.get("perfilNutricional").vocabulario].sort()).toEqual([...IDS_PERFILES].sort());
  });

  for (const id of Object.keys(A_MANO)) {
    it(`${id}: el recuento del módulo es el de la fórmula, y no es cero`, () => {
      const modulo = estrella.filter((r) => puntuar(id, r, ctx).cumple).length;
      const mano = estrella.filter(A_MANO[id]).length;
      expect(modulo).toBe(mano);
      expect(modulo).toBeGreaterThan(0);
      expect(modulo).toBeLessThan(estrella.length);
    });
  }

  it("un dato que falta nunca cumple: bajo en sal sin sodio es «no lo sé»", () => {
    const sinSodio = estrella.filter((r) => r.sodium_mg == null);
    expect(sinSodio.length).toBeGreaterThan(0);
    for (const r of sinSodio) {
      const res = puntuar("bajoSal", r, ctx);
      expect(res.cumple).toBe(false);
      expect(res.sinDato).toContain("sodium_mg");
    }
    const res = puntuar("equilibrado", { kcal: 500, protein_g: 30, carbs_g: 50, fat_g: 18 }, { leer, completitud: () => null });
    expect(res.cumple).toBe(false);
    expect(res.sinDato).toContain("completitud");
  });

  it("perfilesDe solo devuelve lo que se cumple sin dudas", () => {
    for (const r of estrella.slice(0, 200)) {
      for (const id of perfilesDe(r, ctx)) expect(A_MANO[id](r)).toBe(true);
    }
  });

  describe("el caso real: el gazpacho de fresas de la cena se queda corto", () => {
    const gazpacho = recipeCatalog.find((r) => r.id === "sopas_cremas_046");
    const cenas = estrella.filter((r) => r.id !== gazpacho.id && [].concat(r.mealRole ?? []).includes("cena"));
    const { lista, aviso } = ordenarPorPerfil(cenas, "equilibrado", { ...ctx, kcalActual: gazpacho.kcal });

    it("hay cenas que cumplen, y solo salen esas", () => {
      expect(aviso).toBeNull();
      expect(lista.length).toBeGreaterThan(0);
      expect(lista.length).toBeLessThan(cenas.length);
    });
    it("las tres primeras cumplen todas las condiciones y no bajan de calorías", () => {
      for (const r of lista.slice(0, 3)) {
        expect(A_MANO.equilibrado(r)).toBe(true);
        expect(r.kcal).toBeGreaterThanOrEqual(gazpacho.kcal);
      }
    });
    it("entre las que cumplen, primero las de más proteína", () => {
      const prot = lista.map((r) => (4 * r.protein_g) / r.kcal);
      for (let i = 1; i < prot.length; i++) expect(prot[i]).toBeLessThanOrEqual(prot[i - 1]);
    });
  });

  it("si ninguna cumple, salen todas por cercanía y con aviso", () => {
    const ligeras = estrella.filter((r) => r.kcal > 0 && r.kcal < 200).slice(0, 15);
    const { lista, aviso } = ordenarPorPerfil(ligeras, "equilibrado", { ...ctx, kcalActual: 600 });
    expect(aviso).toMatch(/Ninguna cumple del todo «equilibrado»/);
    expect(lista).toHaveLength(ligeras.length);
    const puntos = lista.map((r) => puntuar("equilibrado", r, { ...ctx, kcalActual: 600 }).puntos);
    for (let i = 1; i < puntos.length; i++) expect(puntos[i]).toBeGreaterThanOrEqual(puntos[i - 1]);
  });

  it("un perfil que no existe deja la lista como estaba y lo dice", () => {
    const lista = estrella.slice(0, 5);
    const r = ordenarPorPerfil(lista, "keto", ctx);
    expect(r.lista).toBe(lista);
    expect(r.aviso).toMatch(/«keto»/);
    expect(puntuar("keto", lista[0], ctx)).toBeNull();
  });

  it("cuanto más se aleja del rango, más puntos", () => {
    const base = { kcal: 500, carbs_g: 50, fat_g: 18 };
    const sinComp = { leer, completitud: () => ({ valor: true }) };
    const poca = puntuar("equilibrado", { ...base, protein_g: 20 }, sinComp).puntos;
    const menos = puntuar("equilibrado", { ...base, protein_g: 10 }, sinComp).puntos;
    expect(PERFILES.equilibrado.condiciones.length).toBe(3);
    expect(poca).toBeGreaterThan(0);
    expect(menos).toBeGreaterThan(poca);
  });
});
