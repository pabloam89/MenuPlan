/**
 * Los vocabularios cerrados del modelo de datos, en un solo sitio.
 *
 * Cada lista vive AQUÍ y los módulos que la usan la importan de aquí (no al
 * revés): así la app, el bot (vía botCore), los CHECK de las migraciones y el
 * `dominio` de registro_campo (la ficha) hablan de la misma lista. Un test
 * compara cada CHECK `_vocabulario` de las migraciones con su lista de aquí.
 *
 * Sin dependencias: el bot lo importa sin arrastrar el motor ni el JSX.
 * Solo ids, tal como se guardan; las etiquetas para pintar viven en su
 * pantalla o módulo, encima de estos ids.
 *
 * Fuera de aquí, a propósito: alérgenos, intolerancias, estados y perfiles de
 * salud (los lleva otra sesión con su propio catálogo), y los formatos de id
 * (src/lib/ids.js).
 *
 * Criterio (docs/datos/PRINCIPIOS.md, regla 4): text + CHECK con la lista de
 * aquí; tabla catálogo solo si el valor lleva atributos con lector.
 */
import { KITCHEN_TOOL_IDS } from "./electrodomesticos.js";

/** Días de la semana tal como se guardan (claves del plan, active_days de 0086). En NFC. */
export const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Envases de la despensa (user_pantry.pack_kind, 0086). */
export const ENVASES = ["bote", "lata", "paquete", "bolsa", "brick", "botella", "carton"];

/** Para qué sirve una receta propia (user_recipes.usage_tags, 0086). */
export const USOS_RECETA = ["plato_unico", "plato_normal", "guarnicion"];

/** Carpetas fijas de recetas (recipe_collections.collection_id, 0086; las del usuario son fld_…). */
export const CARPETAS_FIJAS = ["dia_a_dia", "ocasion_especial", "cena_rapida", "hijos"];

/** Aparatos que una casa puede declarar (kitchenTools, user_recipes.required_appliances de 0086). */
export const APARATOS = KITCHEN_TOOL_IDS;

/** De qué es un grupo de menú (src/lib/groups.js tipoDeGrupo). */
export const TIPOS_GRUPO = ["familia", "adultos", "ninos", "bebe", "adhoc"];

/** Canales del bot (channel en las tablas bot_*, 0057/0058/0085). */
export const CANALES = ["telegram", "whatsapp"];

/** Idiomas que la app y Lola saben hablar (user_profiles.ui_lang, household_invites.lang). */
export const IDIOMAS = ["es", "en"];

// ── Los de la ficha de la casa (auditoría de tipos de menuplan-1e, 7 oct 2026).
// Tal como se guardan hoy en producción: pasar a una forma canónica (minúscula,
// sin tildes) es un paso aparte, con alias, nunca reescribiendo lo guardado.

/** Comidas del día (claves del plan «Lun-Comida», meals). */
export const COMIDAS = ["Desayuno", "Comida", "Merienda", "Cena", "Postre"];

/** Cómo se sirve una comida. ficha.js traduce plato_unico/unico, que no existen en producción. */
export const ESTRUCTURA_PLATOS = ["primero_segundo", "1_plato"];

/** Dónde come cada uno en un hueco (horario). */
export const DONDE_COME = ["casa", "tupper", "fuera", "cole", "off"];

/** Cuánto tiempo hay para cocinar. */
export const RITMO_COCINA = ["con_prisa", "normal", "con_tiempo", "depende"];

/**
 * Nivel de quien cocina. OJO: la libreta tiene otro eje de esfuerzo
 * (facil/rapido/elaborado) para lo mismo; hay que unificarlos, no añadir un tercero.
 */
export const NIVEL_COCINA = ["basic", "normal", "pro"];

/** En qué punto de la alimentación está el bebé. */
export const ETAPA_BEBE = ["cremas", "mixto", "solidos"];

/** Todos comen lo mismo o menús separados. */
export const MODELO_MENU = ["same", "separate"];

/** De dónde sale un dato de la ficha (registro «sobre»). */
export const ORIGEN_DATO = ["dicho", "supuesto", "visto", "derivado", "por_defecto", "delegado", "no_quiere_decirlo"];

/**
 * De dónde sale el «ninguna» de las alergias de una persona (#229). `dicha`:
 * lo dijo alguien (o lo marcó la app); `por_silencio`: Lola preguntó avisando
 * («si no me dices nada, entiendo que ninguna») y no contestaron a eso. Solo
 * se guarda `por_silencio` (member.alergiasOrigen); sin el campo, es dicha.
 * `dicha` lo usa la línea de log `bot_alergias` (api/_bot/silencio.js).
 */
export const ORIGEN_ALERGIAS = ["dicha", "por_silencio"];

/** A qué se refiere un «sobre» o un cambio: qué lo originó. */
export const REF_TIPO = ["menu", "mensaje", "pantalla", "senal"];

/** Quién puede ver un dato de la ficha. Se guarda pero aún no filtra nada (todo visible). */
export const VISIBILIDAD = ["casa", "titulares", "la_persona_y_tutores"];

/** Sexo de una persona: campo nuevo de la ficha v18, solo para calorías y nunca se pregunta. */
export const SEXO = ["mujer", "hombre", "sin_dato"];

/** Con qué frecuencia vive alguien en casa (custodia): campo nuevo de la ficha v18, nunca se pregunta. */
export const PATRON_SEMANAS = ["siempre", "alternas"];

// ── Los del registro de fallos del bot (#211). No se guardan en ninguna tabla:
// van en la línea de log `bot_fallo` (api/_bot/avisar.js) y los cuenta
// `npm run fallos` (scripts/bot-fallos.mjs). Cerrados para poder agruparlos.

/**
 * Por qué falló algo: lo deduce `motivoDe` (api/_bot/avisar.js) del error.
 * `telegram` y `modelo` dicen de qué servicio vino; el resto, qué le pasó a la
 * base (o a la red hasta ella). `otro` es lo que no se sabe clasificar.
 */
export const MOTIVOS_FALLO = [
  "red", "tiempo", "sin_sesion", "permiso", "no_existe", "conflicto",
  "datos_invalidos", "limite", "servidor", "telegram", "modelo", "otro",
];

/**
 * Dónde falló: el primer argumento de cada `seguirCon` y `fallaCon` del bot.
 * Un sitio nuevo se añade aquí; api/_bot/avisar.test.js falla si se usa uno
 * que no está.
 */
export const SITIOS_FALLO = [
  // api/_bot/agente.js
  "agente_casa", "agente_dueno", "agente_idioma", "agente_papel", "agente_segunda_semana",
  // api/bot/telegram.js
  "aclarar_via_rapida", "alta_adjunto", "apuntar_falta_via_rapida", "aviso_de_espera",
  "aviso_del_enrutador", "aviso_del_modo", "borrarcuenta_identidad", "borrarcuenta_nacida_aqui",
  "bot_telegram_aviso", "boton_nacida_aqui", "boton_quitar", "boton_responder",
  "eleccion_via_rapida", "entregar_casa", "entregar_pintar", "escribiendo", "fallo_dueno",
  "grupo_casa", "grupo_nombre_del_bot", "grupo_voz", "idioma", "invitacion",
  "invitacion_cuentas", "lola", "lola_cancelada", "limite", "papel", "reconocer", "ruta",
  "ruta_dueno", "ultima_de_lola", "uso", "vivo_borrar_aviso", "vivo_editar", "vivo_enviar",
  // api/bot/entrar.js
  "bot_entrar",
  // el resto de api/_bot/
  "borrar_tanda", "compartir_llave", "cuentas_hogar", "cuentas_json", "cuentas_nacida_aqui",
  "db_usuario", "embudo_dueno", "ficharpc_casa", "generar_borrar_menu_a_medias",
  "generar_describir", "generar_despensa", "generar_recetas_propias",
  "idempotencia_guardar_resultado", "idempotencia_soltar_la_llave", "invitacion_unirse",
  "menu_describir", "menu_foto_de_la_receta", "pintar_recetas", "pista_adelanto",
  "recetas_busqueda", "recetas_subir_foto", "recordatorios_reclamar", "silencio_apuntar", "silencio_cerrar", "telegram_json",
  "traducir_memoria", "turno_casa", "turnos_soltar_candado", "uso_limite", "vispera_casa",
  "voz_json",
];

// ── Los del vigía y el canario de Lola (#267). No van a ninguna tabla: van en
// las líneas `vigia_aviso` y `canario` del log (scripts/vigia.mjs,
// api/bot/canario.js), para contar cuántos avisos hubo y de qué.

/**
 * Qué aviso manda el vigía al grupo de avisos. `incidente_*`: una regla de
 * scripts/lib/vigia-config.mjs se pasó (o volvió a su sitio); `vigia_parado`:
 * hubo un hueco sin pasadas; `resumen_diario`: las cifras del día;
 * `vigia_falla` y `vigia_vuelve`: la propia pasada rompió o vuelve a ir (los
 * manda el workflow, .github/workflows/vigia-lola.yml); `vigia_sin_estado`:
 * empezó sin el estado de la pasada anterior (primera vez o caché perdida).
 */
export const TIPOS_AVISO_VIGIA = ["incidente_abierto", "incidente_resuelto", "resumen_diario", "vigia_parado", "vigia_falla", "vigia_vuelve", "vigia_sin_estado"];

/**
 * Qué comprueba el canario (api/bot/canario.js). `canario` es el propio
 * endpoint, visto desde el vigía; `logs`, la lectura de logs del vigía.
 */
export const CHEQUEOS_CANARIO = ["canario", "webhook_guardia", "webhook_vivo", "webhook_info", "base", "via_rapida", "modelo", "logs"];

/**
 * Por qué falla un chequeo del canario cuando no es un error con motivo de
 * MOTIVOS_FALLO: lo que devolvió no es lo esperado.
 */
export const MOTIVOS_CANARIO = ["respuesta_inesperada", "respuesta_vacia", "escribio", "lento", "webhook_otra_url", "webhook_atascado", "webhook_con_errores", "sin_configurar"];

// ── Los del mapa de módulos (ops/MODULOS.json, #157). No van a ninguna tabla:
// los lee el panel de la factoría (#158) y ops/modulos.test.js.

/**
 * Cuánto está hecho un módulo. La definición y el criterio objetivo de cada
 * grado viven UNA vez, en `vocabularios.grados_desarrollo` de ops/MODULOS.json;
 * ops/modulos.test.js comprueba que las claves de allí son esta lista.
 */
export const GRADOS_DESARROLLO = ["idea", "en_marcha", "usable", "estable"];

/** De quién es un módulo: la app, Lola, o lo que usan los dos. */
export const AMBITOS_MODULO = ["app", "lola", "compartido"];

/** Si una métrica de uso ya se mide hoy o sería posible medirla. */
export const ESTADOS_METRICA = ["medida", "posible"];

/** Por qué una tabla no tiene puerta (fichero único) en un lado, app o servidor (definiciones en ops/MODULOS.json). */
export const MOTIVOS_SIN_PUERTA = ["no_la_usa", "por_rpc", "por_trigger", "fuera_del_dueno", "en_desuso"];

/**
 * Qué pasó con las alergias en la línea de log `bot_alergias`
 * (api/_bot/silencio.js): `apuntada`, el «ninguna» que apunta el código tras
 * la pregunta con aviso; `recordada`, el recordatorio del primer menú.
 */
export const ACCIONES_ALERGIAS = ["apuntada", "recordada"];

/**
 * El mapa nombre → lista. Es lo que referencia `registro_campo.vocabulario`
 * (la ficha): guarda el nombre, nunca una copia de los valores.
 */
export const VOCABULARIOS = Object.freeze({
  dias: DIAS,
  envases: ENVASES,
  usos_receta: USOS_RECETA,
  carpetas_fijas: CARPETAS_FIJAS,
  aparatos: APARATOS,
  tipos_grupo: TIPOS_GRUPO,
  canales: CANALES,
  idiomas: IDIOMAS,
  comidas: COMIDAS,
  estructura_platos: ESTRUCTURA_PLATOS,
  donde_come: DONDE_COME,
  ritmo_cocina: RITMO_COCINA,
  nivel_cocina: NIVEL_COCINA,
  etapa_bebe: ETAPA_BEBE,
  modelo_menu: MODELO_MENU,
  origen_dato: ORIGEN_DATO,
  origen_alergias: ORIGEN_ALERGIAS,
  ref_tipo: REF_TIPO,
  visibilidad: VISIBILIDAD,
  sexo: SEXO,
  patron_semanas: PATRON_SEMANAS,
  motivos_fallo: MOTIVOS_FALLO,
  sitios_fallo: SITIOS_FALLO,
  tipos_aviso_vigia: TIPOS_AVISO_VIGIA,
  chequeos_canario: CHEQUEOS_CANARIO,
  motivos_canario: MOTIVOS_CANARIO,
  acciones_alergias: ACCIONES_ALERGIAS,
  grados_desarrollo: GRADOS_DESARROLLO,
  ambitos_modulo: AMBITOS_MODULO,
  estados_metrica: ESTADOS_METRICA,
  motivos_sin_puerta: MOTIVOS_SIN_PUERTA,
});

/** La lista de un vocabulario por su nombre, o null si no existe. */
export const vocabulario = (nombre) => VOCABULARIOS[nombre] ?? null;
