import { describe, expect, it } from "vitest";

import { buildGroupContext } from "./aiPlanner.js";
import { alergiasParaMenu } from "./alergias.js";
import { EU_ALLERGENS, normalizeAllergenId } from "./allergens.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { eligibleCatalogPool } from "../utils/recipeIntents.js";

/**
 * Sin revisar no es «sin alergias». Decidido por Pablo el 8 oct 2026: hasta
 * que alguien conteste, el menú esquiva los 14 alérgenos del reglamento.
 * Se prueba con lo que filtra el motor de verdad, no con la lista.
 */
const group = { id: "g1", label: "Familia", memberIds: ["m1"] };
const casa = (member, extra = {}) => ({ members: [{ id: "m1", age: 35, allergies: [], ...member }], groups: [group], schedule: {}, ...extra });
const CATORCE = Object.keys(EU_ALLERGENS);
const llevaAlergeno = (r) => (r.allergens ?? []).map(normalizeAllergenId).filter((id) => CATORCE.includes(id));

describe("alergiasParaMenu", () => {
  it("revisada: solo las suyas", () => {
    expect(alergiasParaMenu({}, { alergiasRevisadas: true, allergies: ["Leche"] })).toEqual(["Leche"]);
    expect(alergiasParaMenu({}, { alergiasRevisadas: true, allergies: [] })).toEqual([]);
  });

  it("sin revisar: las 14, más las que ya tuviera, sin repetir", () => {
    const r = alergiasParaMenu({}, { alergiasRevisadas: false, allergies: ["Leche"] });
    expect(r.map(normalizeAllergenId).sort()).toEqual([...CATORCE].sort());
  });

  it("un miembro de antes, sin el campo, hereda el resumen de la casa", () => {
    expect(alergiasParaMenu({ allergiesReviewed: true }, { allergies: [] })).toEqual([]);
    expect(alergiasParaMenu({}, { allergies: [] })).toHaveLength(14);
  });

  it("no toca al miembro: las supuestas nunca se guardan como suyas", () => {
    const m = { alergiasRevisadas: false, allergies: [] };
    alergiasParaMenu({}, m);
    expect(m.allergies).toEqual([]);
  });
});

describe("el motor", () => {
  const pool = (data) => filterRecipes(buildGroupContext(data, group).filterOpts).recipes;

  it("sin revisar, ningún plato del menú lleva alguno de los 14", () => {
    const platos = pool(casa({ alergiasRevisadas: false }));
    expect(platos.length).toBeGreaterThan(20); // hay menú, aunque estrecho
    expect(platos.filter((r) => llevaAlergeno(r).length).map((r) => `${r.name}: ${llevaAlergeno(r)}`)).toEqual([]);
  });

  it("revisada y sin alergias, el catálogo entero vuelve", () => {
    const sinRevisar = pool(casa({ alergiasRevisadas: false })).length;
    const revisada = pool(casa({ alergiasRevisadas: true })).length;
    expect(revisada).toBeGreaterThan(sinRevisar * 5);
  });

  it("basta una persona sin revisar para que el grupo entero lo respete", () => {
    const g2 = { ...group, memberIds: ["m1", "m2"] };
    const data = { members: [{ id: "m1", age: 35, alergiasRevisadas: true, allergies: [] }, { id: "m2", age: 8, alergiasRevisadas: false, allergies: [] }], groups: [g2], schedule: {} };
    const platos = filterRecipes(buildGroupContext(data, g2).filterOpts).recipes;
    expect(platos.filter((r) => llevaAlergeno(r).length)).toEqual([]);
  });

  it("las búsquedas de recetas (sustituir un plato) también", () => {
    const platos = eligibleCatalogPool(casa({ alergiasRevisadas: false }));
    const lista = Array.isArray(platos) ? platos : platos.recipes;
    expect(lista.filter((r) => llevaAlergeno(r).length)).toEqual([]);
  });
});
