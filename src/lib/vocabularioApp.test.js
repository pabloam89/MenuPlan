import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

import { KITCHEN_TOOL_IDS } from "./electrodomesticos.js";
import { KITCHEN_TOOLS } from "./applianceMethods.js";
import { COOKING_METHODS } from "./userRecipes.js";
import { DISCARDED_ID, newFolderId } from "./recipeCollections.js";

/**
 * La 0086 cierra cinco vocabularios de la app con un CHECK. Que el CHECK y la
 * constante digan lo mismo lo vigila UNA vez src/lib/vocabularios.test.js, por
 * columna y con los valores retirados (#497): aquí no se repite, porque una
 * igualdad exacta pondría en rojo un retiro bien hecho (el CHECK sigue
 * admitiendo el retirado). Aquí, lo propio de la 0086: NOT VALID, NFC y que
 * «Descartados» no se guarda nunca.
 */
const sql = readFileSync(new URL("../../supabase/migrations/0086_vocabulario_de_la_app.sql", import.meta.url), "utf8");
const codigo = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

/** Los literales '…' del CHECK con ese nombre, en orden. */
function literales(constraint) {
  const m = codigo.match(new RegExp(`add constraint ${constraint}\\s+check\\s*([\\s\\S]*?)\\s+not valid;`, "i"));
  expect(m, `falta el CHECK ${constraint} (NOT VALID) en la 0086`).not.toBeNull();
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

describe("0086: lo propio de la migración (la paridad, en vocabularios.test.js)", () => {
  it("días y aparatos llevan tildes: en NFC, que el CHECK compara bytes", () => {
    for (const c of ["user_menu_weeks_active_days_vocabulario", "user_recipes_required_appliances_vocabulario"]) {
      for (const v of literales(c)) expect(v, c).toBe(v.normalize("NFC"));
    }
  });

  it("recipe_collections.collection_id: «Descartados» no se guarda nunca, y las carpetas propias son fld_", () => {
    expect(literales("recipe_collections_collection_id_vocabulario")).not.toContain(DISCARDED_ID);
    expect(newFolderId()).toMatch(/^fld_/);
  });

  it("todos los CHECK entran NOT VALID y sin VALIDATE (eso va después, a mano)", () => {
    const checks = [...codigo.matchAll(/add constraint (\w+)\s+check/gi)].map((m) => m[1]);
    expect(checks).toHaveLength(5);
    expect(codigo).not.toMatch(/validate constraint/i);
  });
});

describe("una sola lista de aparatos", () => {
  it("KITCHEN_TOOLS (con foto) y COOKING_METHODS salen de KITCHEN_TOOL_IDS", () => {
    expect(KITCHEN_TOOLS.map((t) => t.id)).toEqual(KITCHEN_TOOL_IDS);
    expect(COOKING_METHODS.map((t) => t.id)).toEqual(KITCHEN_TOOL_IDS);
  });

  it("cada aparato tiene su ilustración en public/", () => {
    for (const t of KITCHEN_TOOLS) {
      expect(existsSync(new URL(`../../public${t.img}`, import.meta.url)), t.img).toBe(true);
    }
    expect(KITCHEN_TOOLS.find((t) => t.id === "Olla rápida").img).toBe("/avatares/cards/electrodomesticos/olla_rapida.webp");
  });

  it("el enum de preparar_receta en el bot es esa misma lista", () => {
    const agente = readFileSync(new URL("../../api/_bot/agente.js", import.meta.url), "utf8");
    expect(agente).toMatch(/electrodomestico:\s*\{\s*type:\s*"string",\s*enum:\s*KITCHEN_TOOL_IDS\s*\}/);
  });
});
