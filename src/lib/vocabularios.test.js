import { describe, it, expect } from "vitest";
import { VOCABULARIOS, vocabulario, TIPOS_GRUPO } from "./vocabularios.js";
import { REGISTRO_CAMPOS, TIPOS_CAMPO, POLITICAS, CAMPOS_PREGUNTABLES } from "./registroCampos.js";
import { CAMPOS, ENUMS } from "./registroTareas.js";
import { DAYS } from "./planner.js";
import { PACK_KINDS } from "./packUnits.js";
import { USAGE_TAGS, USAGE_TAG_IDS } from "./userRecipes.js";
import { BUILT_IN_COLLECTIONS, BUILT_IN_IDS } from "./recipeCollections.js";
import { KITCHEN_TOOL_IDS } from "./electrodomesticos.js";
import { tipoDeGrupo } from "./groups.js";

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
      if (c.vocabulario !== null) expect(vocabulario(c.vocabulario), `${id}.vocabulario`).not.toBe(null);
      if (c.vocabulario !== null) expect(["enum", "lista_enum"], `${id}: vocabulario sin ser enum`).toContain(c.tipo);
      if (c.minimo !== null && c.maximo !== null) expect(c.minimo).toBeLessThanOrEqual(c.maximo);
      if (c.minimo !== null || c.maximo !== null) expect(["int", "float"], `${id}: rango sin ser numérico`).toContain(c.tipo);
    }
  });

  it("registroTareas sigue viendo los mismos campos (CAMPOS y el enum de bot_tareas.campo)", () => {
    expect(CAMPOS).toBe(REGISTRO_CAMPOS);
    expect(CAMPOS_PREGUNTABLES).toEqual(["alergias", "etapaBebe"]);
    if (ENUMS["bot_tareas.campo"]) expect(ENUMS["bot_tareas.campo"]).toEqual(CAMPOS_PREGUNTABLES);
    expect(CAMPOS.alergias.seguridad).toBe(true);
    expect(CAMPOS.etapaBebe.caduca_dias).toBe(21);
  });
});
