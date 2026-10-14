import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PREFIJO_PRODUCTO, VOCABULARIOS, leerRegistro, problemasContraReferencia, valoresActuales } from "../../scripts/lib/vocabulariosVida.mjs";
import { VOCABULARIOS as PRODUCTO } from "./vocabularios.js";

/**
 * La parte de ops/vocabularios-vida.test.js que lee los vocabularios de HoMenu (src/lib/vocabularios.js) y vive
 * aquí porque un test de la casa no lee ficheros del proyecto (#710, PR 6): su copia fijada y que cada uno esté
 * vigilado como producto.<nombre>. El ciclo de vida (retirar, no borrar) y los vocabularios de proceso siguen allí.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = leerRegistro(RAIZ);
const ACT = valoresActuales();

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

describe("los vocabularios del producto: se retiran, no se borran", () => {
  it("la copia fijada de lo anclado al entrar se respeta", () => {
    expect(problemasContraReferencia(REG, ACT, { anclados: FIJADA_PRODUCTO })).toEqual([]);
  });

  it("cada vocabulario del producto (src/lib/vocabularios.js) está vigilado como producto.<nombre>", () => {
    const vigilados = Object.keys(VOCABULARIOS).filter((id) => id.startsWith(PREFIJO_PRODUCTO)).map((id) => id.slice(PREFIJO_PRODUCTO.length));
    expect(vigilados.sort()).toEqual(Object.keys(PRODUCTO).sort());
  });
});
