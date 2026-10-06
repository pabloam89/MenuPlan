import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

import { DAYS } from "./planner.js";
import { PACK_KINDS } from "./packUnits.js";
import { KITCHEN_TOOL_IDS } from "./electrodomesticos.js";
import { KITCHEN_TOOLS } from "./applianceMethods.js";
import { USAGE_TAG_IDS, COOKING_METHODS } from "./userRecipes.js";
import { BUILT_IN_IDS, DISCARDED_ID, newFolderId } from "./recipeCollections.js";

/**
 * La 0086 cierra cinco vocabularios de la app con un CHECK. Cada lista vive
 * en JS (la que pinta la app y la que escribe) y se repite en el SQL: este
 * test es lo que impide que se separen. Si añades un valor en JS sin migración,
 * la base rechazaría las escrituras nuevas con ese valor.
 */
const sql = readFileSync(new URL("../../supabase/migrations/0086_vocabulario_de_la_app.sql", import.meta.url), "utf8");
const codigo = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

/** Los literales '…' del CHECK con ese nombre, en orden. */
function literales(constraint) {
  const m = codigo.match(new RegExp(`add constraint ${constraint}\\s+check\\s*([\\s\\S]*?)\\s+not valid;`, "i"));
  expect(m, `falta el CHECK ${constraint} (NOT VALID) en la 0086`).not.toBeNull();
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

const ordenado = (xs) => [...xs].sort();

describe("0086: el SQL dice lo mismo que la app", () => {
  it("user_menu_weeks.active_days ⊆ DAYS (con las tildes en NFC)", () => {
    const sqlDias = literales("user_menu_weeks_active_days_vocabulario");
    expect(sqlDias).toEqual(DAYS);
    for (const d of sqlDias) expect(d).toBe(d.normalize("NFC"));
  });

  it("user_pantry.pack_kind ∈ PACK_KINDS", () => {
    expect(ordenado(literales("user_pantry_pack_kind_vocabulario"))).toEqual(ordenado(PACK_KINDS.map((k) => k.value)));
  });

  it("user_recipes.required_appliances ⊆ los aparatos declarables", () => {
    const sqlAparatos = literales("user_recipes_required_appliances_vocabulario");
    expect(ordenado(sqlAparatos)).toEqual(ordenado(KITCHEN_TOOL_IDS));
    for (const a of sqlAparatos) expect(a).toBe(a.normalize("NFC"));
  });

  it("user_recipes.usage_tags ⊆ USAGE_TAGS", () => {
    expect(ordenado(literales("user_recipes_usage_tags_vocabulario"))).toEqual(ordenado(USAGE_TAG_IDS));
  });

  it("recipe_collections.collection_id: las 4 fijas o una carpeta fld_", () => {
    const lits = literales("recipe_collections_collection_id_vocabulario");
    expect(ordenado(lits)).toEqual(ordenado([...BUILT_IN_IDS, "fld\\_%"]));
    // "Descartados" no se guarda nunca en recipe_collections.
    expect(lits).not.toContain(DISCARDED_ID);
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
