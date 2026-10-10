import { describe, it, expect } from "vitest";
import { VOCABULARIOS, vocabulario, TIPOS_GRUPO } from "./vocabularios.js";
import { REGISTRO_CAMPOS, TIPOS_CAMPO, POLITICAS, POR, APLICA, CAMPOS_PREGUNTABLES, VOCABULARIOS_PENDIENTES } from "./registroCampos.js";

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
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./vocabularios.js";
import { checksDeLista, checksNoReconocidos, problemasDeParidad } from "../../scripts/lib/checksVocabulario.mjs";
import { leerSinAplicar } from "../../scripts/verificar-estado.mjs";
import { admitidosEnLaBase, leerRegistro } from "../../scripts/lib/vocabulariosVida.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Cada columna con un CHECK de lista vivo en las migraciones → su lista en JS (#319 punto 1, #497).
 * Por columna, no por nombre de constraint: los de `channel` y `lang` nacieron en línea
 * (`<tabla>_<col>_check`). `lista`: nombre en VOCABULARIOS (entra en el ciclo de vida: sus
 * retirados los tiene que seguir admitiendo el CHECK); `valores`: una lista de otro módulo
 * (la ficha y las tareas del bot), sin ciclo de vida todavía; `patrones`: los `like` del CHECK.
 */
const COLUMNA_A_VOCABULARIO = {
  "user_menu_weeks.active_days": { lista: "dias" },
  "user_pantry.pack_kind": { lista: "envases" },
  "user_recipes.required_appliances": { lista: "aparatos" },
  "user_recipes.usage_tags": { lista: "usos_receta" },
  "recipe_collections.collection_id": { lista: "carpetas_fijas", patrones: ["fld\\_%"] },
  "bot_entradas.proveedor": { lista: "canales" },
  "bot_identities.channel": { lista: "canales" },
  "bot_chats.channel": { lista: "canales" },
  "bot_codigos.channel": { lista: "canales" },
  "bot_messages.channel": { lista: "canales" },
  "bot_reminders.channel": { lista: "canales" },
  "bot_tareas.channel": { lista: "canales" },
  "bot_cola.channel": { lista: "canales" },
  "user_profiles.ui_lang": { lista: "idiomas" },
  "household_invites.lang": { lista: "idiomas" },
  "sobre.origen": { lista: "origen_dato" },
  "sobre.canal": { lista: "canales_dato" },
  "sobre.ref_tipo": { lista: "ref_tipo" },
  // La ficha (0097): las listas de registro_campo viven en registroCampos.js (su fuente).
  "registro_campo.tipo": { valores: TIPOS_CAMPO },
  "registro_campo.politica": { valores: POLITICAS },
  "registro_campo.por": { valores: POR },
  "registro_campo.aplica": { valores: APLICA },
  // Las tareas del bot (0076, 0080): ENUMS de registroTareas.js.
  ...Object.fromEntries(["kind", "scope", "status", "tipo", "resultado", "objetivo", "campo"].map((c) => [`bot_tareas.${c}`, { valores: ENUMS[`bot_tareas.${c}`] }])),
  "bot_idempotencia.rpc": { valores: ENUMS["bot_idempotencia.rpc"] },
};

/**
 * CHECK de lista sin su lista en src/lib/vocabularios.js: deuda a la vista (#318, #319), que solo
 * puede bajar. Sus valores están escritos a mano por el código; nadie compara las dos copias.
 */
const SIN_LISTA = {
  "bot_chats.kind": "private/group, a mano en api/bot/",
  "bot_codigos.tipo": "vincular/entrar/alta, a mano en api/bot/telegram.js",
  "bot_messages.role": "user/assistant, a mano en el bot",
  "bot_reminders.repite": "diario/semanal, a mano en api/_bot/recordatorios.js",
  "bot_reminders.status": "pending/sent/cancelled, a mano en api/_bot/recordatorios.js",
  "bot_reminders.tipo": "TIPOS_RECORDATORIO de api/_bot/recordatorios.js; su paridad, en api/_bot/vocabulario.test.js",
  "content_reports.status": "lo social, apagado en staging",
  "content_translations.lang": "solo 'en' (el idioma al que se traduce), a mano en api/_bot/traducir.js",
  "household_invites.role": "editor/viewer, de src/lib/papeles.js sin test",
  "recipe_votes.vote": "up/down, a mano en la app",
  "user_menus.variety_pref": "strict/moderate/relaxed, a mano en la app",
  "user_pantry.item_type": "ingredient/cooked_dish, a mano en src/lib/pantry.js",
  "user_pantry.location": "nevera/despensa/congelador, a mano en src/lib/pantry.js",
  "user_pantry.pack_size_unit": "g/ml, a mano en src/lib/pantry.js",
  "user_pantry.source": "manual/voice/photo, a mano en la app",
  "user_pantry.unit": "g/ml/ud/racion, de src/lib/kitchenUnits.js sin test",
  "user_recipes.nutrition_source": "computed/ai, a mano en src/lib/userRecipes.js",
};
// Lo que había el 11 oct 2026 (#497). Baja cuando una pasa a COLUMNA_A_VOCABULARIO; no sube.
const SIN_LISTA_MAX = 17;

/**
 * CHECK con literales e `in`/`any`/`<@` que NO son de lista (el lector no los reconoce), con su
 * motivo. Lista cerrada: uno nuevo que el lector no entienda falla aquí hasta que alguien diga
 * qué es (o el lector aprenda su forma). Clave «tabla.constraint», de toda la historia.
 */
const NO_ES_LISTA = {
  "bot_tareas.bot_tareas_cierre_check": "ata status y closed_at; la lista de status es bot_tareas_status_check",
  "ingredient_substitutions.chk_substitution_not_an_allergen": "not in: prohíbe valores, no los enumera (tabla borrada en la 0093)",
  "recipes.chk_no_guarnicion_role_outside_type": "ata type y meal_roles (tabla borrada en la 0093)",
  "registro_campo.registro_campo_enum_lista_check": "ata tipo y vocabulario; la lista de tipo es registro_campo_tipo_vocabulario",
  "registro_campo.registro_campo_rango_numerico": "ata minimo/maximo y tipo; la lista de tipo es registro_campo_tipo_vocabulario",
};

/** Las migraciones en orden, para checksDeLista; `aplicadas` quita las de «Sin aplicar» de supabase/ESTADO.md. */
function migraciones({ aplicadas = false } = {}) {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const sinAplicar = leerSinAplicar(readFileSync(new URL("../../supabase/ESTADO.md", import.meta.url), "utf8"));
  return readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()
    .filter((f) => !aplicadas || !sinAplicar.has(f.replace(/\.sql$/, "")))
    .map((f) => ({ fichero: f, sql: readFileSync(new URL(f, dir), "utf8") }));
}

/** El mapa de columnas con vivos y retirados, para problemasDeParidad. */
function mapaDeParidad(registro) {
  return Object.fromEntries(Object.entries(COLUMNA_A_VOCABULARIO).map(([col, { lista, valores, patrones = [] }]) => {
    if (valores) return [col, { vivos: valores, retirados: [], patrones }];
    const a = admitidosEnLaBase(registro, lista);
    if (!a) throw new Error(`${col}: no existe la lista ${lista} en VOCABULARIOS`);
    return [col, { ...a, patrones }];
  }));
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

  it("el CHECK de lista vigente de cada columna admite exactamente su lista: los vivos y los retirados", () => {
    // Vivo = lo de las migraciones aplicadas; las sin aplicar solo cuentan para decirlo en el mensaje.
    expect(problemasDeParidad(checksDeLista(migraciones({ aplicadas: true })), mapaDeParidad(leerRegistro(RAIZ)), SIN_LISTA, checksDeLista(migraciones()))).toEqual([]);
  });

  it("todo CHECK con literales e in/any/<@ que no es de lista está en NO_ES_LISTA con su motivo", () => {
    expect([...checksNoReconocidos(migraciones()).keys()], "Si es de lista, enseña su forma a scripts/lib/checksVocabulario.mjs; si no, añádelo a NO_ES_LISTA con su porqué").toEqual(Object.keys(NO_ES_LISTA).sort());
  });

  it("los CHECK de lista sin su lista en JS solo pueden bajar", () => {
    expect(Object.keys(SIN_LISTA).length).toBeLessThanOrEqual(SIN_LISTA_MAX);
  });

  it("toda lista exportada de vocabularios.js está en el mapa VOCABULARIOS (y así en el ciclo de vida)", () => {
    const listas = Object.entries(V).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v]);
    const enMapa = new Set(Object.values(VOCABULARIOS));
    expect(listas.filter(([, v]) => !enMapa.has(v)).map(([k]) => k)).toEqual([]);
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
      if (c.minimo !== null || c.maximo !== null) expect(["int", "decimal"], `${id}: rango sin ser numérico`).toContain(c.tipo);
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
