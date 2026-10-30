import { describe, it, expect, vi } from "vitest";
import { VOCABULARIOS, vocabulario, TIPOS_GRUPO, RETIRADOS, ENVASES, CANAL, IDIOMA, CANALES, IDIOMAS, ESCRITOR, ESCRITORES, CHOQUE, CHOQUES, crearEscritor, FueraDeVocabulario } from "./vocabularios.js";
import { REGISTRO_CAMPOS, TIPOS_CAMPO, POLITICAS, POR, APLICA, CAMPOS_PREGUNTABLES, VOCABULARIOS_PENDIENTES } from "./registroCampos.js";

// Enums cuya lista aún no existe: deuda a la vista, que solo puede bajar.
const ENUM_SIN_LISTA = [];
import { CAMPOS, ENUMS } from "./registroTareas.js";
import { DAYS } from "./planner.js";
import { PACK_KINDS, ETIQUETAS_ENVASE } from "./packUnits.js";
import { COLUMNAS, escritores, columnasDe, sinComentarios, cifra, asignacionesSinFiltro, literalesSueltos, valoresVigilados } from "../../scripts/lib/escritoresVocabulario.mjs";
import { COLUMNAS_VOCABULARIO, ESCRITORES_SQL } from "../../scripts/lib/columnasVocabulario.mjs";
import { USAGE_TAGS, USAGE_TAG_IDS } from "./userRecipes.js";
import { BUILT_IN_COLLECTIONS, BUILT_IN_IDS } from "./recipeCollections.js";
import { KITCHEN_TOOL_IDS } from "./electrodomesticos.js";
import { tipoDeGrupo } from "./groups.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./vocabularios.js";
import { checksDeLista, checksNoReconocidos, problemasDeParidad } from "../../scripts/lib/checksVocabulario.mjs";
import { leerSinAplicar } from "../../scripts/verificar-estado.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Cada columna con un CHECK de lista vivo en las migraciones → su lista en JS (#319 punto 1, #497).
 * Por columna, no por nombre de constraint: los de `channel` y `lang` nacieron en línea
 * (`<tabla>_<col>_check`). `lista`: nombre en VOCABULARIOS (entra en el ciclo de vida: sus
 * retirados los tiene que seguir admitiendo el CHECK); `valores`: una lista de otro módulo
 * (la ficha y las tareas del bot), sin ciclo de vida todavía; `patrones`: los `like` del CHECK.
 * Las de `lista` salen de COLUMNAS_VOCABULARIO (scripts/lib/columnasVocabulario.mjs), la misma
 * lista que vigila el escáner de escritores (#549): no hay una segunda copia que olvidar.
 */
const COLUMNA_A_VOCABULARIO = {
  ...COLUMNAS_VOCABULARIO,
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

/**
 * El mapa de columnas con vivos y retirados, para problemasDeParidad. Los retirados salen de
 * RETIRADOS (src/lib/vocabularios.js), su única fuente desde #878.
 */
function mapaDeParidad() {
  return Object.fromEntries(Object.entries(COLUMNA_A_VOCABULARIO).map(([col, { lista, valores, patrones = [] }]) => {
    if (valores) return [col, { vivos: valores, retirados: [], patrones }];
    if (!VOCABULARIOS[lista]) throw new Error(`${col}: no existe la lista ${lista} en VOCABULARIOS`);
    return [col, { vivos: [...VOCABULARIOS[lista]], retirados: Object.keys(RETIRADOS[lista] ?? {}), patrones }];
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
    expect(problemasDeParidad(checksDeLista(migraciones({ aplicadas: true })), mapaDeParidad(), SIN_LISTA, checksDeLista(migraciones()))).toEqual([]);
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

  it("las listas del eje de la ficha (plan fichas con estado, trozo 5) existen", () => {
    for (const nombre of ["postura", "choque", "fichas", "escritores"]) expect(vocabulario(nombre), nombre).not.toBe(null);
  });
});

/** Los .js/.jsx/.mjs de src/ y api/ que no son tests, con su texto. */
function codigo() {
  const out = [];
  const andar = (d) => {
    for (const f of readdirSync(join(RAIZ, d))) {
      const p = `${d}/${f}`;
      if (statSync(join(RAIZ, p)).isDirectory()) { if (f !== "node_modules") andar(p); } else if (/\.(js|jsx|mjs)$/.test(f) && !/\.test\./.test(f)) out.push(p);
    }
  };
  andar("src");
  andar("api");
  return out.map((f) => ({ fichero: f, texto: readFileSync(join(RAIZ, f), "utf8") }));
}

// Un registro de prueba: «carton» retirado a «brick», como si se hubiera retirado hoy.
const ENVASES_SIN_CARTON = ENVASES.filter((v) => v !== "carton");
const CARTON_A_BRICK = { envases: { carton: "brick" } };

describe("un valor retirado no vuelve a escribirse (#539)", () => {
  it("paraEscribir: vivo tal cual, retirado a su sucesor, sin sucesor se quita con su línea, desconocido lanza", () => {
    const avisos = [];
    const { paraEscribir, listaParaEscribir } = crearEscritor({ ...VOCABULARIOS, envases: ENVASES_SIN_CARTON }, { envases: { carton: "brick", tetra: null } }, (n, v) => avisos.push([n, v]));
    expect(paraEscribir("envases", "lata")).toBe("lata");
    expect(paraEscribir("envases", "carton")).toBe("brick");
    expect(paraEscribir("envases", null)).toBe(null);
    expect(paraEscribir("envases", "tetra")).toBe(null);
    expect(avisos).toEqual([["envases", "tetra"]]);
    expect(() => paraEscribir("envases", "caja")).toThrow(FueraDeVocabulario);
    expect(() => paraEscribir("no_existe", "x")).toThrow(/no existe el vocabulario/);
    expect(listaParaEscribir("envases", ["carton", "brick", "tetra", "lata"])).toEqual(["brick", "lata"]);
    expect(avisos).toHaveLength(2);
    // Un desconocido en una lista también falla claro: el CHECK lo rechazaría igual.
    expect(() => listaParaEscribir("envases", ["lata", "caja"])).toThrow(FueraDeVocabulario);
    expect(listaParaEscribir("envases", null)).toBe(null);
  });

  it("la línea de un quitado es JSON de evento y su accion está en ACCIONES_ESCRITURA", () => {
    const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      crearEscritor({ envases: ["lata"] }, { envases: { tetra: null } }).paraEscribir("envases", "tetra");
      expect(JSON.parse(espia.mock.calls[0][0])).toEqual({ evento: "vocabulario_escritura", vocabulario: "envases", valor: "tetra", accion: "quitado" });
      expect(VOCABULARIOS.acciones_escritura).toContain("quitado");
    } finally {
      espia.mockRestore();
    }
  });

  it("los módulos dueños: con «carton» retirado a «brick», escribir carton da brick; sin sucesor, se quita", async () => {
    // Un cliente falso que apunta, en orden, cada delete y cada upsert.
    const llamadas = [];
    const falso = {
      from: (tabla) => ({
        delete: () => { llamadas.push(["delete", tabla]); const f = { eq: () => f, then: (ok) => ok({ error: null }) }; return f; },
        upsert: (rows) => { llamadas.push(["upsert", tabla, rows]); return Promise.resolve({ error: null }); },
      }),
    };
    vi.resetModules();
    vi.doMock("./supabase.js", () => ({ supabase: falso }));
    vi.doMock("./vocabularios.js", async (original) => {
      const m = await original();
      const vocabularios = { ...m.VOCABULARIOS, envases: ENVASES_SIN_CARTON.filter((v) => v !== "bolsa"), usos_receta: ["plato_unico", "plato_normal"], aparatos: m.APARATOS.filter((v) => v !== "Vaporera"), carpetas_fijas: ["dia_a_dia", "ocasion_especial"] };
      const retirados = { envases: { ...CARTON_A_BRICK.envases, bolsa: null }, usos_receta: { guarnicion: "plato_normal" }, aparatos: { Vaporera: null }, carpetas_fijas: { hijos: "dia_a_dia", cena_rapida: null } };
      return { ...m, ENVASES: vocabularios.envases, VOCABULARIOS: vocabularios, RETIRADOS: retirados, ...m.crearEscritor(vocabularios, retirados, () => {}) };
    });
    const espia = vi.spyOn(console, "warn").mockImplementation((m) => llamadas.push(["aviso", m]));
    try {
      const { packDbFields } = await import("./pantry.js");
      const { recipeToRow, filaCopiada } = await import("./userRecipesFila.js");
      const { carpetaParaEscribir, saveRecipeCollections } = await import("./recipeCollections.js");
      // Despensa.
      expect(packDbFields({ kind: "carton", sizeQty: 1000, sizeUnit: "ml" }).pack_kind).toBe("brick");
      expect(packDbFields({ kind: "bolsa", sizeQty: 500, count: 2 })).toEqual({ pack_count: null, pack_kind: null, pack_size: null, pack_size_unit: null });
      expect(() => packDbFields({ kind: "caja", sizeQty: 1 })).toThrow(/envases/);
      // Receta propia, y la copia de la de otro.
      const fila = recipeToRow({ id: "r1", name: "x", usageTags: ["guarnicion", "plato_normal"], requiredAppliances: ["Horno", "Vaporera"] }, "u1");
      expect(fila.usage_tags).toEqual(["plato_normal"]);
      expect(fila.required_appliances).toEqual(["Horno"]);
      const copia = filaCopiada({ id: "r9", owner_id: "otro", name: "y", usage_tags: ["guarnicion"], required_appliances: ["Vaporera"], created_at: "2026-01-01" }, { id: "r10", dueno: "u1" });
      expect(copia).toMatchObject({ id: "r10", owner_id: "u1", visibility: "private", copied_from_recipe_id: "r9", usage_tags: ["plato_normal"], required_appliances: [] });
      expect("created_at" in copia).toBe(false);
      // Carpetas.
      expect(carpetaParaEscribir("hijos")).toBe("dia_a_dia");
      expect(carpetaParaEscribir("cena_rapida")).toBe(null);
      expect(carpetaParaEscribir("fld_abc")).toBe("fld_abc");
      expect(() => carpetaParaEscribir("descartados")).toThrow(/carpetas_fijas/);
      // Guardar: la mala se salta, la sin sucesor se quita, las buenas se guardan; se valida antes del delete.
      llamadas.length = 0;
      await saveRecipeCollections("u1", "r1", ["descartados", "cena_rapida", "fld_abc", "hijos", "dia_a_dia"]);
      // El aviso de la carpeta mala sale antes del delete: se valida antes de borrar nada.
      expect(llamadas.map((l) => l[0])).toEqual(["aviso", "delete", "upsert"]);
      expect(llamadas[0][1]).toMatch(/fuera del vocabulario/);
      expect(llamadas[2][2].map((r) => r.collection_id)).toEqual(["fld_abc", "dia_a_dia"]);
    } finally {
      espia.mockRestore();
      vi.doUnmock("./vocabularios.js");
      vi.doUnmock("./supabase.js");
      vi.resetModules();
    }
  });

  it("todo escritor de una columna de vocabulario pasa por la lista viva (paraEscribir y compañía)", () => {
    const cableado = JSON.parse(readFileSync(join(RAIZ, "supabase/cableado.json"), "utf8"));
    const fuera = codigo().flatMap(({ fichero, texto }) => asignacionesSinFiltro(texto, { fichero, cableado }).map((a) => `${fichero}:${a.linea} ${a.columna}: ${a.texto} (${a.motivo})`));
    expect(fuera, "Escribe la columna con paraEscribir/listaParaEscribir de src/lib/vocabularios.js (o carpetaParaEscribir)").toEqual([]);
  });

  it("ningún literal de esos vocabularios en los escritores de sus tablas: sale de la constante", () => {
    const cableado = JSON.parse(readFileSync(join(RAIZ, "supabase/cableado.json"), "utf8"));
    // Cada fichero, con los vocabularios de las tablas que escribe: el «es» de un escritor de bot_* no es de su incumbencia.
    const sueltos = escritores(cableado).flatMap((f) => literalesSueltos(readFileSync(join(RAIZ, f), "utf8"), valoresVigilados(VOCABULARIOS, RETIRADOS, columnasDe(f, cableado))).map((l) => `${f}:${l.linea} «${l.valor}»`));
    expect(sueltos, "Usa la constante de src/lib/vocabularios.js (CANAL.TELEGRAM, IDIOMAS…) en vez del literal").toEqual([]);
  });

  it("el escáner ve lo que tiene que ver (ejemplos buenos y malos)", () => {
    // Cada forma mala, sola, tiene que salir.
    const malos = {
      "const fila = { pack_kind: pack.kind };": "no pasa por la lista viva",
      "rows.push({ user_id, recipe_id, collection_id });": "abreviada",
      "  usage_tags: recipe.usageTags ?? [],": "no pasa por la lista viva",
      "const fila = { pack_kind: paraEscribir(\"usos_receta\", pack.kind) };": "usa el vocabulario «usos_receta»",
      "  required_appliances: listaParaEscribir(\"envases\", x),": "usa el vocabulario «envases»",
      "  usage_tags: listaParaEscribir(nombre, x),": "va escrito, no en una variable",
      "const f = { pack_kind: carpetaParaEscribir(x) };": "solo vale para collection_id",
      "fila.pack_kind = pack.kind;": "no pasa por la lista viva",
      "copia.usage_tags = [\"guarnicion\"];": "no pasa por la lista viva",
      "const fila = { pack_kind: _k };": "no pasa por la lista viva",
      // #549: lo que cierra la expresión, las bot_*, las RPC y el resto de columnas.
      "const fila = { pack_kind: paraEscribir(\"envases\", k) || \"bote\" };": "no cierra la expresión",
      "const fila = { usage_tags: listaParaEscribir(\"usos_receta\", u) ?? [] };": "no cierra la expresión",
      "await insert(\"bot_messages\", [{ channel, chat_id: String(chatId) }]);": "abreviada",
      "const fila = { household_id: h, channel: ctx.channel };": "no pasa por la lista viva",
      "await insert(\"bot_entradas\", [{ proveedor, entrada_xid: x }]);": "abreviada",
      "await supabase.rpc(\"create_household_invite\", { p_household_id: h, p_lang: lang });": "no pasa por la lista viva",
      "const fila = { active_days: week.days };": "no pasa por la lista viva",
      "const p = { user_id: u, ui_lang: \"en\" };": "no pasa por la lista viva",
      "const s = { campo_id: c, canal: CANAL.TELEGRAM };": "no pasa por la lista viva",
    };
    for (const [linea, motivo] of Object.entries(malos)) {
      const r = asignacionesSinFiltro(linea);
      expect(r, linea).toHaveLength(1);
      expect(r[0].motivo, linea).toContain(motivo);
    }
    const bueno = [
      "const fila = { pack_kind: paraEscribir(\"envases\", pack.kind) };",
      "rows.map(({ pack_count: _c, pack_kind: _k, ...rest }) => rest);",
      "const PACK_COLS = \"pack_count, pack_kind, pack_size\";",
      "const x = { pack_kind: null };",
      "for (const collection_id of folders) rows.push({ collection_id: carpetaParaEscribir(collection_id) });",
      "// pack_kind: pack.kind (comentario)",
      "fila.pack_kind = paraEscribir(\"envases\", k);",
      "if (fila.pack_kind === \"x\") return;",
      "const { usage_tags: _u, ...resto } = fila;",
      // Un contexto de chat no es una fila (ninguna otra clave en snake_case): no se mira.
      "const contexto = { channel: chat.channel ?? CANAL.TELEGRAM, chatId: chat.chatId };",
      "export async function crearRecordatorio({ channel, chatId, householdId }, x) {",
      "const { householdId, channel, chatId } = ctx;",
      "await insert(\"bot_chats\", [{ channel: paraEscribir(\"canales\", channel), chat_id: \"1\" }]);",
      "const fila = { pack_kind: paraEscribir(\"envases\", k), pack_count: 1 };",
      "const fila = { active_days: listaParaEscribir(\"dias\", hay ? dias : null) };",
      // Sin la llamada a su RPC, p_lang es de otra función: no se mira.
      "const r = { p_household_id: h, p_lang: lang };",
      "rec.lang = \"es-ES\";",
      "trackEvent(user, X, \"menu\", { canal: \"app\", recipeId: r });",
    ].join("\n");
    expect(asignacionesSinFiltro(bueno)).toEqual([]);
    // Una fila en varias líneas: la abreviada de su línea sale; el valor con su lista, no.
    const varias = "await insert(\"bot_chats\", [{\n  channel,\n  chat_id: String(chatId),\n}]);";
    expect(asignacionesSinFiltro(varias).map((a) => [a.linea, a.motivo])).toEqual([[2, "abreviada: no pasa por la lista viva"]]);
    expect(asignacionesSinFiltro(varias.replace("  channel,", "  channel: paraEscribir(\"canales\", channel),"))).toEqual([]);
    // Una columna común solo se mira en los escritores de su tabla (cableado.json).
    const otra = { fichero: "api/_bot/otro.js", cableado: { bot_chats: ["api/_bot/enlace.js"] } };
    expect(asignacionesSinFiltro("insert(\"x\", [{ channel, chat_id: 1 }]);", otra)).toEqual([]);
    expect(asignacionesSinFiltro("insert(\"x\", [{ channel, chat_id: 1 }]);", { ...otra, fichero: "api/_bot/enlace.js" })).toHaveLength(1);
    // Validar una vez al entrar: la variable vale si TODAS sus asignaciones pasan por su lista.
    const fila = "insert(\"x\", [{ channel: canal, chat_id: 1 }]);";
    expect(asignacionesSinFiltro(`const canal = paraEscribir("canales", channel);\n${fila}`)).toEqual([]);
    expect(asignacionesSinFiltro(`let canal;\ntry { canal = paraEscribir("canales", c); } catch { return; }\n${fila}`)).toEqual([]);
    expect(asignacionesSinFiltro(`let canal = paraEscribir("canales", c);\ncanal = otro;\n${fila}`)).toHaveLength(1);
    expect(asignacionesSinFiltro(`const canal = paraEscribir("idiomas", c);\n${fila}`)).toHaveLength(1);
    expect(asignacionesSinFiltro(`const canal = paraEscribir("canales", c) || x;\n${fila}`)).toHaveLength(1);
    // La cifra (scripts/escritores-vocabulario.mjs): filtradas, sin filtro y literales.
    const c = cifra([{ fichero: "api/_bot/enlace.js", texto: `const f = (canal) => [{ channel: paraEscribir("canales", canal), chat_id: 1 }, { channel, chat_id: 2 }, "telegram"];` }], { bot_chats: ["api/_bot/enlace.js"] }, VOCABULARIOS, RETIRADOS);
    expect([c.columnas, c.filtradas, c.sinFiltro.length, c.literales.map((l) => l.valor)]).toEqual([Object.keys(COLUMNAS).length, 1, 1, ["telegram"]]);
    expect(literalesSueltos("if (kind === \"carton\") return 1; // \"lata\"", new Set(["carton", "lata"])).map((l) => l.valor)).toEqual(["carton"]);
    expect(Object.values(COLUMNAS).every((n) => VOCABULARIOS[n])).toBe(true);
  });

  it("el escáner vigila todas las columnas con lista del producto: las mismas que la paridad con el CHECK (#549)", () => {
    const conLista = Object.entries(COLUMNA_A_VOCABULARIO).filter(([, d]) => d.lista).map(([c, d]) => [c, d.lista]);
    expect(Object.entries(COLUMNAS).sort()).toEqual(conLista.sort());
    // Una columna con `valores` que son una lista del producto se escaparía del escáner: va con `lista`.
    const listas = new Map(Object.entries(VOCABULARIOS).map(([n, l]) => [JSON.stringify([...l].sort()), n]));
    const disfrazadas = Object.entries(COLUMNA_A_VOCABULARIO).filter(([, d]) => d.valores && listas.has(JSON.stringify([...d.valores].sort())))
      .map(([c, d]) => `${c} = ${listas.get(JSON.stringify([...d.valores].sort()))}`);
    expect(disfrazadas, "Ponla en COLUMNAS_VOCABULARIO con `lista`, para que el escáner vigile quién la escribe").toEqual([]);
  });

  it("toda escritura desde SQL de una columna vigilada está en ESCRITORES_SQL con su porqué, y sus RPC existen", () => {
    const sql = migraciones().map(({ sql }) => sql.replace(/--.*$/gm, "")).join("\n");
    const vistas = new Set();
    for (const m of sql.matchAll(/\binsert\s+into\s+(?:public\.)?(\w+)\s*\(([^)]*)\)/gi)) {
      for (const c of m[2].split(",").map((x) => x.trim())) if (COLUMNAS[`${m[1]}.${c}`]) vistas.add(`${m[1]}.${c}`);
    }
    for (const m of sql.matchAll(/\bupdate\s+(?:public\.)?(\w+)\s+set\s+([\s\S]*?)(?:\bwhere\b|;)/gi)) {
      for (const a of m[2].matchAll(/(\w+)\s*=/g)) if (COLUMNAS[`${m[1]}.${a[1]}`]) vistas.add(`${m[1]}.${a[1]}`);
    }
    // Un `default '<valor>'` también escribe: la base pone el valor si la fila llega sin la columna
    // (`default '{}'`, la lista vacía, no escribe ningún valor).
    for (const m of sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      for (const a of m[2].matchAll(/^\s*(\w+)\s+[^,\n]*\bdefault\s+'(?!\{\}')/gim)) if (COLUMNAS[`${m[1]}.${a[1]}`]) vistas.add(`${m[1]}.${a[1]}`);
    }
    for (const m of sql.matchAll(/\balter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+(?:alter\s+column\s+(\w+)\s+set\s+default\s+'(?!\{\}')|add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)\s+[^;,]*\bdefault\s+'(?!\{\}'))/gi)) {
      const c = m[2] ?? m[3];
      if (COLUMNAS[`${m[1]}.${c}`]) vistas.add(`${m[1]}.${c}`);
    }
    expect([...vistas].sort(), "Una escritura nueva desde SQL: apúntala en ESCRITORES_SQL de scripts/lib/columnasVocabulario.mjs, con de dónde le llega el valor").toEqual(Object.keys(ESCRITORES_SQL).sort());
    for (const [columna, { rpc = {} }] of Object.entries(COLUMNAS_VOCABULARIO)) {
      for (const [funcion, parametro] of Object.entries(rpc)) {
        expect(sql, `${columna}: la RPC ${funcion}(${parametro})`).toMatch(new RegExp(`function\\s+public\\.${funcion}\\s*\\([^)]*\\b${parametro}\\b`));
      }
    }
  });

  it("todo CANAL.X, IDIOMA.X, ESCRITOR.X y CHOQUE.X del código existe (sale de su lista: un retirado desaparece)", () => {
    const porNombre = (lista) => Object.fromEntries(lista.map((c) => [c.toUpperCase(), c]));
    expect(CANAL).toEqual(porNombre(CANALES));
    expect(IDIOMA).toEqual(porNombre(IDIOMAS));
    expect(ESCRITOR).toEqual(porNombre(ESCRITORES));
    expect(CHOQUE).toEqual(porNombre(CHOQUES));
    const mapas = { CANAL, IDIOMA, ESCRITOR, CHOQUE };
    const usados = codigo().flatMap(({ fichero, texto }) => [...sinComentarios(texto).matchAll(/\b(CANAL|IDIOMA|ESCRITOR|CHOQUE)\.([A-Z_]+)\b/g)].map((m) => [fichero, m[1], m[2]]));
    for (const mapa of Object.keys(mapas)) expect(usados.some(([, m]) => m === mapa), `nadie usa ${mapa}.X`).toBe(true);
    expect(usados.filter(([, mapa, nombre]) => !mapas[mapa][nombre]).map((u) => u.join(" "))).toEqual([]);
  });

  it("cada envase vivo o retirado tiene su etiqueta, y ninguna sobra", () => {
    expect(Object.keys(ETIQUETAS_ENVASE).sort()).toEqual([...ENVASES, ...Object.keys(RETIRADOS.envases ?? {})].sort());
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
