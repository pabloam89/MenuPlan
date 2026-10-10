import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REFERENCIA, jsonEnReferencia } from "../scripts/lib/forjaReferencia.mjs";
import {
  PREFIJO_PRODUCTO, RUTA_VOCABULARIOS, VOCABULARIOS, admitidosEnLaBase, anclar, leerRegistro, problemasContraReferencia, problemasDeRetiros, problemasLocales, valoresActuales,
} from "../scripts/lib/vocabulariosVida.mjs";
import { checksDeLista, problemasDeParidad } from "../scripts/lib/checksVocabulario.mjs";
import { VOCABULARIOS as PRODUCTO } from "../src/lib/vocabularios.js";

/**
 * Ciclo de vida de los vocabularios cerrados de proceso (#481) y del producto (#497), fondo #479. Un valor
 * no se borra ni se reutiliza con otro significado: se retira en ops/vocabularios-vida.json
 * y dice a cuál pasa. Vigila:
 *
 *  1. local: lo anclado coincide con el código, y lo que falta del código está retirado;
 *  2. contra origin/staging (FORJA_REF la cambia, como en la forja): nada anclado o
 *     retirado allí desaparece aquí sin quedar retirado. Pilla el borrado doble (del
 *     código y del anclaje a la vez), que el paso 1 no ve;
 *  3. un valor retirado no vuelve al código.
 *
 * Plan B documentado: sin git, sin la referencia o sin el fichero en ella (antes de que
 * este PR entre en staging), el paso 2 se hace contra FIJADA, la copia de lo anclado al
 * nacer. Ese literal no se edita: un retiro no lo toca (el valor sigue en «retirados»).
 * El CI trae origin/staging (paso «Traer staging para los trinquetes» de tests.yml).
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REG = leerRegistro(RAIZ);
const ACT = valoresActuales();
const REF = REFERENCIA();
const enRef = jsonEnReferencia(RAIZ, REF, RUTA_VOCABULARIOS);
if (!enRef) console.info(`[vocabularios] contra ${REF}: sin git, sin la referencia o sin ${RUTA_VOCABULARIOS} en ella; se compara con la copia fijada`);

// Lo anclado el 10 oct 2026, al nacer (#481). NO se edita: ni para quitar ni para cambiar.
const FIJADA = {
  "flujo.actores": ["agente_dominio", "orquestador", "juez", "persona", "automatico"],
  "flujo.alcance_fallo": ["local", "modulo", "transversal"],
  "flujo.diagnostican": ["agente_dominio", "orquestador_con_diagnosticadores"],
  "flujo.estado_medida": ["existe", "pendiente"],
  "flujo.estado_tipo_skill": ["existe", "en_plan", "reservado"],
  "flujo.pasos": ["detectar", "registrar_caso", "triaje", "diagnosticar", "fondo", "plan", "ejecutar", "verificar", "observar", "cerrar", "aprender", "medir"],
  "fondos.estado": ["abierto", "diagnosticado", "plan", "en-curso", "en-observacion", "cerrado-eficaz", "reabierto"],
  "glosario.clase": ["accion", "estado", "artefacto", "rol", "campo", "lugar"],
  "glosario.estado": ["activo", "retirado"],
  "issues.analisis": ["nuevo", "abierto", "no-aguanto-roto", "no-aguanto-corto", "puntual"],
  "issues.area": ["datos", "lola", "ui", "catalogo", "motor", "ops"],
  "issues.arreglo": ["test", "guardia", "script", "regla", "skill", "ninguno"],
  "issues.causa": ["vigilante-falso", "vigilante-hueco", "entorno", "dos-fuentes", "error-silencioso", "coordinacion", "modelo-datos", "codigo", "sin-comprobar"],
  "issues.control": ["ok", "falla"],
  "issues.tipo": ["fondo", "caso", "encargo", "decision"],
  "issues.tipo_accion": ["preventivo", "detectivo", "correctivo"],
};

// Los del producto (src/lib/vocabularios.js), anclados el 11 oct 2026 al entrar (#497). NO se edita, igual que FIJADA.
const FIJADA_PRODUCTO = {
  "producto.dias": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
  "producto.envases": ["bote", "lata", "paquete", "bolsa", "brick", "botella", "carton"],
  "producto.usos_receta": ["plato_unico", "plato_normal", "guarnicion"],
  "producto.carpetas_fijas": ["dia_a_dia", "ocasion_especial", "cena_rapida", "hijos"],
  "producto.aparatos": ["Airfryer", "Horno", "Microondas", "Olla rápida", "Thermomix", "Vaporera"],
  "producto.tipos_grupo": ["familia", "adultos", "ninos", "bebe", "adhoc"],
  "producto.canales": ["telegram", "whatsapp"],
  "producto.idiomas": ["es", "en"],
  "producto.comidas": ["Desayuno", "Comida", "Merienda", "Cena", "Postre"],
  "producto.estructura_platos": ["primero_segundo", "1_plato"],
  "producto.donde_come": ["casa", "tupper", "fuera", "cole", "off"],
  "producto.ritmo_cocina": ["con_prisa", "normal", "con_tiempo", "depende"],
  "producto.nivel_cocina": ["basic", "normal", "pro"],
  "producto.etapa_bebe": ["cremas", "mixto", "solidos"],
  "producto.modelo_menu": ["same", "separate"],
  "producto.origen_dato": ["dicho", "supuesto", "visto", "derivado", "por_defecto", "delegado", "no_quiere_decirlo"],
  "producto.origen_alergias": ["dicha", "por_silencio"],
  "producto.ref_tipo": ["menu", "mensaje", "pantalla", "senal"],
  "producto.canales_dato": ["app", "telegram", "whatsapp", "sistema"],
  "producto.sexo": ["mujer", "hombre", "sin_dato"],
  "producto.patron_semanas": ["siempre", "alternas"],
  "producto.motivos_fallo": [
    "red", "tiempo", "sin_sesion", "permiso", "no_existe", "conflicto", "datos_invalidos", "limite", "servidor",
    "telegram", "modelo", "otro"
  ],
  "producto.sitios_fallo": [
    "agente_casa", "agente_dueno", "agente_idioma", "agente_papel", "agente_segunda_semana", "aclarar_via_rapida",
    "alta_adjunto", "apuntar_falta_via_rapida", "aviso_de_espera", "aviso_del_enrutador", "aviso_del_modo",
    "borrarcuenta_identidad", "borrarcuenta_nacida_aqui", "bot_telegram_aviso", "boton_nacida_aqui", "boton_quitar",
    "boton_responder", "eleccion_via_rapida", "entregar_casa", "entregar_pintar", "escribiendo", "fallo_dueno",
    "grupo_casa", "grupo_nombre_del_bot", "grupo_voz", "idioma", "invitacion", "invitacion_cuentas", "lola",
    "lola_cancelada", "limite", "papel", "reconocer", "ruta", "ruta_dueno", "ultima_de_lola", "uso",
    "vivo_borrar_aviso", "vivo_editar", "vivo_enviar", "bot_entrar", "borrar_tanda", "compartir_llave",
    "cuentas_hogar", "cuentas_json", "cuentas_nacida_aqui", "db_usuario", "embudo_dueno", "ficharpc_casa",
    "generar_borrar_menu_a_medias", "generar_describir", "generar_despensa", "generar_recetas_propias",
    "idempotencia_guardar_resultado", "idempotencia_soltar_la_llave", "invitacion_unirse", "menu_describir",
    "menu_foto_de_la_receta", "pintar_recetas", "pista_adelanto", "recetas_busqueda", "recetas_subir_foto",
    "recordatorios_reclamar", "silencio_apuntar", "silencio_cerrar", "telegram_json", "traducir_memoria", "turno_casa",
    "turnos_soltar_candado", "uso_limite", "vispera_casa", "voz_json"
  ],
  "producto.tipos_aviso_vigia": [
    "incidente_abierto", "incidente_resuelto", "resumen_diario", "vigia_parado", "vigia_falla", "vigia_vuelve",
    "vigia_sin_estado"
  ],
  "producto.chequeos_canario": ["canario", "webhook_guardia", "webhook_vivo", "webhook_info", "base", "via_rapida", "modelo", "logs"],
  "producto.motivos_canario": [
    "respuesta_inesperada", "respuesta_vacia", "escribio", "lento", "webhook_otra_url", "webhook_atascado",
    "webhook_con_errores", "sin_configurar"
  ],
  "producto.acciones_alergias": ["apuntada", "recordada"],
  "producto.grados_desarrollo": ["idea", "en_marcha", "usable", "estable"],
  "producto.ambitos_modulo": ["app", "lola", "compartido"],
  "producto.estados_metrica": ["medida", "posible"],
  "producto.motivos_sin_puerta": ["no_la_usa", "por_rpc", "por_trigger", "fuera_del_dueno", "en_desuso"],
  "producto.motivos_tope_diario": ["tope_alcanzado", "sin_redis", "error_redis"],
};

describe("los vocabularios de proceso: se retiran, no se borran", () => {
  it("cada vocabulario vigilado tiene valores y su fichero existe en el registro", () => {
    for (const [id, v] of Object.entries(VOCABULARIOS)) {
      expect(Object.keys(v.textos()).length, id).toBeGreaterThan(0);
      expect(v.fichero, id).toMatch(/^(scripts\/lib\/\w+\.mjs|src\/lib\/vocabularios\.js)$/);
    }
  });

  it("lo anclado coincide con el código, y lo que falta está retirado", () => {
    expect(problemasLocales(REG, ACT), "Lanza «npm run glosario -- --vocabularios --escribir»; si quitaste un valor, retíralo").toEqual([]);
  });

  it("los retiros están bien formados y ningún valor retirado vuelve al código", () => {
    expect(problemasDeRetiros(REG, ACT)).toEqual([]);
  });

  it(`nada de ${enRef ? REF : "la copia fijada"} desaparece sin retirarse`, () => {
    expect(problemasContraReferencia(REG, ACT, enRef ?? { anclados: FIJADA }), "Un valor no se borra: añádelo a «retirados» con su pasa_a").toEqual([]);
  });

  it("la copia fijada también se respeta aunque haya referencia", () => {
    expect(problemasContraReferencia(REG, ACT, { anclados: FIJADA })).toEqual([]);
    expect(problemasContraReferencia(REG, ACT, { anclados: FIJADA_PRODUCTO })).toEqual([]);
  });

  it("cada vocabulario del producto (src/lib/vocabularios.js) está vigilado como producto.<nombre>", () => {
    const vigilados = Object.keys(VOCABULARIOS).filter((id) => id.startsWith(PREFIJO_PRODUCTO)).map((id) => id.slice(PREFIJO_PRODUCTO.length));
    expect(vigilados.sort()).toEqual(Object.keys(PRODUCTO).sort());
  });
});

// ── Autotest: cada regla falla con datos malos ──────────────────────────────

describe("autotest del ciclo de vida", () => {
  const act = { "x.estado": ["abierto", "cerrado"] };
  const reg = (retirados = [], anclados = { "x.estado": ["abierto", "cerrado"] }) => ({ anclados, retirados });

  it("quitar un valor del código sin retirarlo falla en local", () => {
    expect(problemasLocales(reg(), { "x.estado": ["abierto"] }).join()).toMatch(/x\.estado: cerrado: ha desaparecido del código sin retirarse/);
  });

  it("un valor nuevo sin anclar falla, y anclar lo arregla", () => {
    const nuevo = { "x.estado": ["abierto", "cerrado", "pausado"] };
    expect(problemasLocales(reg(), nuevo).join()).toMatch(/pausado: valor nuevo sin anclar/);
    expect(problemasLocales(anclar(reg(), nuevo), nuevo)).toEqual([]);
  });

  it("el borrado doble (código y anclaje) pasa en local y falla contra la referencia", () => {
    const sinCerrado = { "x.estado": ["abierto"] };
    const borrado = anclar(reg(), sinCerrado);
    expect(problemasLocales(borrado, sinCerrado)).toEqual([]);
    expect(problemasContraReferencia(borrado, sinCerrado, reg()).join()).toMatch(/cerrado: estaba en la referencia y ha desaparecido sin retirarse/);
  });

  it("retirado con pasa_a vivo, todo bien; y la referencia no puede perder un retiro", () => {
    const sinCerrado = { "x.estado": ["abierto"] };
    const retiro = { vocabulario: "x.estado", valor: "cerrado", pasa_a: "abierto", desde: "2026-10-10" };
    const bien = anclar(reg([retiro]), sinCerrado);
    expect([...problemasLocales(bien, sinCerrado), ...problemasDeRetiros(bien, sinCerrado), ...problemasContraReferencia(bien, sinCerrado, reg())]).toEqual([]);
    expect(problemasContraReferencia(anclar(reg(), sinCerrado), sinCerrado, bien).join()).toMatch(/se ha quitado de «retirados»/);
  });

  it("un valor retirado que vuelve al código (otro significado) falla", () => {
    const retiro = { vocabulario: "x.estado", valor: "cerrado", pasa_a: "abierto", desde: "2026-10-10" };
    expect(problemasDeRetiros(reg([retiro]), act).join()).toMatch(/vuelve a estar en el código/);
  });

  it("pasa_a muerto, sin motivo, fecha mala, vocabulario inventado o campo de más fallan", () => {
    const sin = { "x.estado": ["abierto"] };
    const r = (x) => problemasDeRetiros(reg([{ vocabulario: "x.estado", valor: "cerrado", pasa_a: "abierto", desde: "2026-10-10", ...x }]), sin).join();
    expect(r({ pasa_a: "pausado" })).toMatch(/no es un valor vivo/);
    expect(r({ pasa_a: null })).toMatch(/hace falta un motivo/);
    expect(r({ pasa_a: null, motivo: "Ya no hay estado de cierre en la ficha" })).toBe("");
    expect(r({ desde: "10/10/2026" })).toMatch(/desde no es AAAA-MM-DD/);
    expect(r({ vocabulario: "y.otro" })).toMatch(/no está en VOCABULARIOS/);
    expect(r({ significado: "x" })).toMatch(/campo desconocido/);
  });
});

describe("autotest de las redefiniciones (#481, revisión M1)", () => {
  const act = { "x.estado": { abierto: "Registrado, sin diagnóstico", cerrado: "Ya no se mira" } };
  const reg = (extra = {}) => ({ anclados: { "x.estado": { abierto: "Registrado, sin diagnóstico", cerrado: "Ya no se mira" } }, retirados: [], redefiniciones: [], ...extra });
  const otro = { "x.estado": { abierto: "Cualquier issue sin cerrar", cerrado: "Ya no se mira" } };
  const redef = { vocabulario: "x.estado", valor: "abierto", desde: "2026-10-10", motivo: "Se amplía a todo issue sin cerrar" };

  it("cambiar la definición en el código sin re-anclar falla en local", () => {
    expect(problemasLocales(reg(), otro).join()).toMatch(/x\.estado: abierto: su definición ha cambiado/);
    expect(problemasLocales(reg(), act)).toEqual([]);
  });

  it("re-anclar sin registrar pasa en local y falla contra la referencia; con la redefinición, pasa", () => {
    const sinRegistro = anclar(reg(), otro);
    expect(problemasLocales(sinRegistro, otro)).toEqual([]);
    expect(problemasContraReferencia(sinRegistro, otro, reg()).join()).toMatch(/abierto: su definición ha cambiado respecto a la referencia sin una redefinición/);
    const conRegistro = anclar(reg({ redefiniciones: [redef] }), otro);
    expect([...problemasContraReferencia(conRegistro, otro, reg()), ...problemasDeRetiros(conRegistro, otro)]).toEqual([]);
  });

  it("una redefinición vieja no vale para un cambio nuevo, y el registro solo crece", () => {
    const ref = anclar(reg({ redefiniciones: [redef] }), otro);
    const tercero = { "x.estado": { abierto: "Otra cosa distinta", cerrado: "Ya no se mira" } };
    expect(problemasContraReferencia(anclar(ref, tercero), tercero, ref).join()).toMatch(/sin una redefinición registrada/);
    expect(problemasContraReferencia(anclar(reg(), otro), otro, ref).join()).toMatch(/tenía 1 redefinición\(es\) en la referencia y ahora menos/);
  });

  it("la forma de una redefinición y de un vocabulario retirado", () => {
    const p = (x) => problemasDeRetiros(reg({ redefiniciones: [{ ...redef, ...x }] }), act).join();
    expect(p({})).toBe("");
    expect(p({ motivo: "corto" })).toMatch(/motivo de la redefinición/);
    expect(p({ desde: "hoy" })).toMatch(/desde que no es AAAA-MM-DD/);
    expect(p({ valor: "pausado" })).toMatch(/redefinición de un valor que no está vivo/);
    expect(p({ extra: 1 })).toMatch(/campo desconocido extra/);
    expect(problemasDeRetiros(reg({ vocabularios_retirados: [{ vocabulario: "x.estado", desde: "2026-10-10", motivo: "Ya no se vigila este vocabulario" }] }), act).join()).toMatch(/está retirado y sigue en VOCABULARIOS/);
  });

  it("retirar un vocabulario entero: sin registro falla; con él, pasa en local y contra la referencia", () => {
    const sinVoc = {};
    expect(problemasLocales(reg(), sinVoc).join()).toMatch(/x\.estado: está anclado y ya no está en VOCABULARIOS/);
    expect(problemasContraReferencia(anclar(reg(), sinVoc), sinVoc, reg()).join()).toMatch(/ha desaparecido sin retirarse/);
    const retirado = anclar(reg({ vocabularios_retirados: [{ vocabulario: "x.estado", desde: "2026-10-10", motivo: "Ya no se vigila este vocabulario" }] }), sinVoc);
    expect([...problemasLocales(retirado, sinVoc), ...problemasDeRetiros(retirado, sinVoc), ...problemasContraReferencia(retirado, sinVoc, reg())]).toEqual([]);
  });
});

describe("autotest del producto (#497): retirar no rompe lo guardado", () => {
  // Una casa guardó «carton» en user_pantry.pack_kind. Se deja de ofrecer y pasa a «brick».
  const CREA = { fichero: "0001_x.sql", sql: "create table public.user_pantry (id bigint, pack_kind text check (pack_kind is null or pack_kind in ('bote', 'brick', 'carton')));" };
  const SIN_CARTON = { fichero: "0002_x.sql", sql: "alter table public.user_pantry drop constraint user_pantry_pack_kind_check;\nalter table public.user_pantry add constraint user_pantry_pack_kind_check check (pack_kind is null or pack_kind in ('bote', 'brick')) not valid;" };
  const antes = { "producto.envases": ["bote", "brick", "carton"] };
  const despues = { "producto.envases": ["bote", "brick"] };
  const retiro = { vocabulario: "producto.envases", valor: "carton", pasa_a: "brick", desde: "2026-10-11" };
  const ref = { anclados: antes, retirados: [] };
  const paridad = (reg, migs, lista) => problemasDeParidad(checksDeLista(migs), { "user_pantry.pack_kind": admitidosEnLaBase(reg, "envases", lista) });

  it("quitar «carton» de la lista sin retirarlo falla (en local y contra la referencia)", () => {
    expect(problemasLocales(ref, despues).join()).toMatch(/producto\.envases: carton: ha desaparecido del código sin retirarse/);
    expect(problemasContraReferencia(anclar(ref, despues), despues, ref).join()).toMatch(/carton: estaba en la referencia y ha desaparecido sin retirarse/);
  });

  it("retirado con pasa_a: el código ya no lo ofrece, pero la base lo sigue admitiendo para leer", () => {
    const reg = anclar({ ...ref, retirados: [retiro] }, despues);
    expect([...problemasLocales(reg, despues), ...problemasDeRetiros(reg, despues), ...problemasContraReferencia(reg, despues, ref)]).toEqual([]);
    const a = admitidosEnLaBase(reg, "envases", despues["producto.envases"]);
    expect(a.vivos).not.toContain("carton");
    expect(a.retirados).toEqual(["carton"]);
    // El CHECK de siempre sigue cuadrando: carton vale para las filas guardadas.
    expect(paridad(reg, [CREA], despues["producto.envases"])).toEqual([]);
  });

  it("una migración que saca del CHECK el valor retirado falla: rompería las filas guardadas", () => {
    const reg = anclar({ ...ref, retirados: [retiro] }, despues);
    expect(paridad(reg, [CREA, SIN_CARTON], despues["producto.envases"]).join()).toMatch(/«carton» está retirado y el CHECK ya no lo admite/);
  });

  it("quitar «carton» sin retirarlo también falla en la paridad (el CHECK lo admite y nadie lo explica)", () => {
    expect(paridad(ref, [CREA], despues["producto.envases"]).join()).toMatch(/el CHECK admite «carton», que el código ya no tiene ni está retirado/);
  });

  it("reutilizar «carton» con otro significado tras retirarlo falla", () => {
    const reg = anclar({ ...ref, retirados: [retiro] }, antes);
    expect(problemasDeRetiros(reg, antes).join()).toMatch(/carton: está retirado y vuelve a estar en el código/);
  });

  it("redefinir «carton» exige su motivo en «redefiniciones»; la primera definición no cuenta como cambio", () => {
    const sinDef = { anclados: { "producto.envases": { bote: "", brick: "", carton: "" } }, retirados: [], redefiniciones: [] };
    const conDef = { "producto.envases": { bote: "", brick: "", carton: "Caja de cartón (huevos, cereales)" } };
    expect(problemasContraReferencia(anclar(sinDef, conDef), conDef, sinDef)).toEqual([]);
    const otra = { "producto.envases": { bote: "", brick: "", carton: "Brick de leche" } };
    const refConDef = anclar(sinDef, conDef);
    expect(problemasContraReferencia(anclar(refConDef, otra), otra, refConDef).join()).toMatch(/carton: su definición ha cambiado respecto a la referencia sin una redefinición registrada/);
    const conMotivo = anclar({ ...refConDef, redefiniciones: [{ vocabulario: "producto.envases", valor: "carton", desde: "2026-10-11", motivo: "Se junta con brick por decisión de producto" }] }, otra);
    expect(problemasContraReferencia(conMotivo, otra, refConDef)).toEqual([]);
  });
});

describe("autotest de la paridad JS↔SQL (#497)", () => {
  const m = (sql, fichero = "0001_x.sql") => ({ fichero, sql });
  const lista = (vivos, extra = {}) => ({ "t.c": { vivos, retirados: [], patrones: [], ...extra } });

  it("añadir un valor en JS sin migración falla; con la migración, pasa", () => {
    const crea = m("create table t (c text check (c in ('a', 'b')));");
    expect(problemasDeParidad(checksDeLista([crea]), lista(["a", "b", "z"])).join()).toMatch(/el código ofrece «z» y el CHECK no lo admite/);
    const amplia = m("alter table t drop constraint t_c_check; alter table t add constraint t_c_vocabulario check (c in ('a', 'b', 'z')) not valid;", "0002_x.sql");
    expect(problemasDeParidad(checksDeLista([crea, amplia]), lista(["a", "b", "z"]))).toEqual([]);
  });

  it("gana el último CHECK de la columna; dos vivos a la vez, o uno sin lista en JS, fallan", () => {
    const crea = m("create table t (c text check (c in ('a')));");
    const otro = m("alter table t add constraint t_c_vocabulario check (c is null or c in ('a', 'b')) not valid;", "0002_x.sql");
    expect(problemasDeParidad(checksDeLista([crea, otro]), lista(["a", "b"])).join()).toMatch(/2 CHECK de lista vivos a la vez/);
    expect(problemasDeParidad(checksDeLista([crea]), {}).join()).toMatch(/t\.c: CHECK de lista \(t_c_check, 0001_x\.sql\) sin su lista de JS/);
    expect(problemasDeParidad(checksDeLista([crea]), {}, { "t.c": "deuda" })).toEqual([]);
  });

  it("un CHECK que no es de lista no cuenta, y un drop table se lleva los suyos", () => {
    const crea = m("create table t (c text, d timestamptz, constraint t_c_d check ((c in ('x')) = (d is not null)));");
    expect([...checksDeLista([crea]).keys()]).toEqual([]);
    const conLista = m("create table t (c text check (c in ('a')));");
    expect([...checksDeLista([conLista, m("drop table t;", "0002_x.sql")]).keys()]).toEqual([]);
  });

  it("un create table if not exists de una tabla que ya existe no cambia su CHECK", () => {
    const a = m("create table if not exists t (c text check (c in ('a', 'b')));");
    const b = m("create table if not exists t (c text not null check (c in ('a')));", "0002_x.sql");
    expect(checksDeLista([a, b]).get("t.c")[0].valores).toEqual(["a", "b"]);
  });

  it("los like del CHECK tienen que ser los del mapa", () => {
    const crea = m("create table t (c text, constraint t_c_vocabulario check (c in ('a') or c like 'fld\\_%'));");
    expect(problemasDeParidad(checksDeLista([crea]), lista(["a"])).join()).toMatch(/patrones like del CHECK/);
    expect(problemasDeParidad(checksDeLista([crea]), lista(["a"], { patrones: ["fld\\_%"] }))).toEqual([]);
  });
});
