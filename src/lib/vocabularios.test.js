import { describe, it, expect } from "vitest";
import { VOCABULARIOS, vocabulario, TIPOS_GRUPO } from "./vocabularios.js";
import { REGISTRO_CAMPOS, TIPOS_CAMPO, POLITICAS, CAMPOS_PREGUNTABLES, VOCABULARIOS_PENDIENTES } from "./registroCampos.js";

// Enums cuya lista aún no existe: deuda a la vista, que solo puede bajar.
const ENUM_SIN_LISTA = [];
import { CAMPOS, ENUMS } from "./registroTareas.js";
import { DAYS } from "./planner.js";
import { PACK_KINDS } from "./packUnits.js";
import { USAGE_TAGS, USAGE_TAG_IDS } from "./userRecipes.js";
import { BUILT_IN_COLLECTIONS, BUILT_IN_IDS } from "./recipeCollections.js";
import { KITCHEN_TOOL_IDS } from "./electrodomesticos.js";
import { tipoDeGrupo } from "./groups.js";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Cada CHECK que se llame <tabla>_<col>_vocabulario → el nombre de su lista en
 * VOCABULARIOS (y lo que admite de más, que no es un valor de la lista).
 */
const CHECK_A_VOCABULARIO = {
  user_menu_weeks_active_days_vocabulario: { lista: "dias" },
  user_pantry_pack_kind_vocabulario: { lista: "envases" },
  user_recipes_required_appliances_vocabulario: { lista: "aparatos" },
  user_recipes_usage_tags_vocabulario: { lista: "usos_receta" },
  recipe_collections_collection_id_vocabulario: { lista: "carpetas_fijas", extra: ["fld\\_%"] },
  bot_entradas_proveedor_vocabulario: { lista: "canales" },
};

/** { constraint: [literales] } de todas las migraciones; si una se redefine, gana la última. */
function checksDeVocabulario() {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(new URL(f, dir), "utf8").split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    for (const m of sql.matchAll(/constraint\s+(\w+_vocabulario)\s+check\s*\(/gi)) {
      // Hasta el paréntesis que cierra el check (…).
      let i = m.index + m[0].length, nivel = 1;
      while (i < sql.length && nivel > 0) nivel += sql[i] === "(" ? 1 : sql[i] === ")" ? -1 : 0, i++;
      out[m[1]] = [...sql.slice(m.index + m[0].length, i - 1).matchAll(/'([^']*)'/g)].map((x) => x[1]);
    }
  }
  return out;
}

describe("vocabularios: una lista, un sitio", () => {
  it("cada lista sin repetidos, sin vacíos y en NFC (los CHECK comparan bytes)", () => {
    for (const [nombre, lista] of Object.entries(VOCABULARIOS)) {
      expect(lista.length, nombre).toBeGreaterThan(0);
      expect(new Set(lista).size, `${nombre} repite`).toBe(lista.length);
      for (const v of lista) {
        expect(typeof v === "string" && v.length > 0, `${nombre}: ${v}`).toBe(true);
        expect(v, `${nombre}: ${v} no está en NFC`).toBe(v.normalize("NFC"));
      }
    }
  });

  it("los módulos de siempre sacan su lista de aquí, y sus etiquetas cuadran", () => {
    expect(DAYS).toBe(VOCABULARIOS.dias);
    expect(PACK_KINDS.map((k) => k.value)).toEqual(VOCABULARIOS.envases);
    expect(USAGE_TAG_IDS).toBe(VOCABULARIOS.usos_receta);
    expect(USAGE_TAGS.map((t) => t.id)).toEqual(VOCABULARIOS.usos_receta);
    expect(BUILT_IN_IDS).toBe(VOCABULARIOS.carpetas_fijas);
    expect(BUILT_IN_COLLECTIONS.map((c) => c.id)).toEqual(VOCABULARIOS.carpetas_fijas);
    expect(VOCABULARIOS.aparatos).toBe(KITCHEN_TOOL_IDS);
  });

  it("los tipos de grupo que deduce groups.js están en la lista", () => {
    for (const label of ["Familia", "Adultos", "Niños", "Bebé"]) expect(TIPOS_GRUPO).toContain(tipoDeGrupo({ label }));
    expect(TIPOS_GRUPO).toContain(tipoDeGrupo({ label: "Dieta blanda", adHoc: true }));
  });

  it("cada CHECK <tabla>_<col>_vocabulario de las migraciones dice lo mismo que su lista", () => {
    const encontrados = checksDeVocabulario();
    // Un CHECK de vocabulario nuevo sin entrada en CHECK_A_VOCABULARIO falla aquí: hay que decir su lista.
    expect(Object.keys(encontrados).sort()).toEqual(Object.keys(CHECK_A_VOCABULARIO).sort());
    for (const [constraint, literales] of Object.entries(encontrados)) {
      const { lista, extra = [] } = CHECK_A_VOCABULARIO[constraint];
      expect(vocabulario(lista), `${constraint}: no existe la lista ${lista}`).not.toBe(null);
      expect([...literales].sort(), constraint).toEqual([...vocabulario(lista), ...extra].sort());
    }
  });

  it("vocabulario() devuelve la lista o null", () => {
    expect(vocabulario("dias")).toBe(VOCABULARIOS.dias);
    expect(vocabulario("no_existe")).toBe(null);
  });
});

describe("registroCampos: la fuente de registro_campo", () => {
  it("cada campo con tipo y política válidos, y su vocabulario existe si lo nombra", () => {
    for (const [id, c] of Object.entries(REGISTRO_CAMPOS)) {
      expect(TIPOS_CAMPO, `${id}.tipo`).toContain(c.tipo);
      expect(POLITICAS, `${id}.politica`).toContain(c.politica);
      const pendiente = VOCABULARIOS_PENDIENTES.includes(c.vocabulario);
      if (c.vocabulario !== null && !pendiente) expect(vocabulario(c.vocabulario), `${id}.vocabulario`).not.toBe(null);
      // Lo mismo que el CHECK de registro_campo (ficha v18): vocabulario si y solo si es enum.
      // Los enum sin lista todavía (sexo) se marcan como deuda aquí, no se inventa la lista.
      const esEnum = ["enum", "lista_enum"].includes(c.tipo);
      if (c.vocabulario !== null) expect(esEnum, `${id}: vocabulario sin ser enum`).toBe(true);
      if (esEnum && c.vocabulario === null) expect(ENUM_SIN_LISTA, `${id}: enum sin vocabulario`).toContain(id);
      if (c.minimo !== null && c.maximo !== null) expect(c.minimo).toBeLessThanOrEqual(c.maximo);
      if (c.minimo !== null || c.maximo !== null) expect(["int", "float"], `${id}: rango sin ser numérico`).toContain(c.tipo);
    }
  });

  it("registroTareas sigue viendo los mismos campos (CAMPOS y el enum de bot_tareas.campo)", () => {
    expect(CAMPOS).toBe(REGISTRO_CAMPOS);
    expect(CAMPOS_PREGUNTABLES).toEqual(["alergias", "etapaBebe"]);
    expect(ENUMS["bot_tareas.campo"]).toEqual(CAMPOS_PREGUNTABLES);
    expect(CAMPOS.alergias.seguridad).toBe(true);
    expect(CAMPOS.etapaBebe.caduca_dias).toBe(21);
  });
});
