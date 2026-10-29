/**
 * Los vocabularios cerrados del modelo de datos, en un solo sitio.
 *
 * Cada lista vive AQUÍ y los módulos que la usan la importan de aquí (no al
 * revés): así la app, el bot (vía botCore), los CHECK de las migraciones y el
 * `dominio` de registro_campo (la ficha) hablan de la misma lista. Un test
 * compara el CHECK de lista vigente de cada columna de las migraciones con su
 * lista de aquí (src/lib/vocabularios.test.js).
 *
 * Un valor no se borra ni se reutiliza (#497): si deja de ofrecerse, se quita
 * de la lista y se retira en ops/vocabularios-vida.json con su `pasa_a`
 * (`producto.<nombre>`); el CHECK lo sigue admitiendo, porque hay filas de
 * familias guardadas con él. Un valor nuevo o retirado se ancla con
 * `npm run glosario -- --vocabularios --escribir`.
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
import { COMIDAS_PLANIFICABLES } from "./comidas.js";

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

/**
 * Un canal o un idioma concreto por su nombre (CANAL.TELEGRAM, IDIOMA.EN), sacado de su
 * lista y no copiado: así un escritor fija el suyo sin un literal suelto (#549). Si el valor
 * se retira de la lista, su nombre desaparece de aquí, y vocabularios.test.js falla en cada
 * `CANAL.X` o `IDIOMA.X` del código que ya no existe.
 */
const porNombre = (lista) => Object.freeze(Object.fromEntries(lista.map((v) => [v.toUpperCase(), v])));
export const CANAL = porNombre(CANALES);
export const IDIOMA = porNombre(IDIOMAS);

// ── Los de la ficha de la casa (auditoría de tipos de menuplan-1e, 7 oct 2026).
// Tal como se guardan hoy en producción: pasar a una forma canónica (minúscula,
// sin tildes) es un paso aparte, con alias, nunca reescribiendo lo guardado.

/** Comidas del día (claves del plan «Lun-Comida», meals). */
// Las que el motor planifica (el aperitivo aún no): salen de comidas.js (#939).
export const COMIDAS = COMIDAS_PLANIFICABLES;

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

/** Por dónde llegó un dato de la ficha (sobre.canal, 0097): los canales del bot, la app y el sistema. */
export const CANALES_DATO = ["app", ...CANALES, "sistema"];

/**
 * Cuánto se tira de golpe al regenerar (receta_descartes.alcance, 0102): un plato
 * suelto, un día o la semana. Tirar uno suelto es una señal más fuerte que tirar veinte.
 */
export const ALCANCES_DESCARTE = ["plato", "dia", "menu"];

/** A qué se refiere un «sobre» o un cambio: qué lo originó. */
export const REF_TIPO = ["menu", "mensaje", "pantalla", "senal"];

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
  "recetas_busqueda", "recetas_subir_foto", "recordatorios_reclamar", "recordatorios_soltar", "silencio_apuntar", "silencio_cerrar", "telegram_json",
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

/** Por qué una tabla no tiene puerta (fichero único) en un lado, app o servidor: no la usa, la toca por RPC o por trigger, la tocan fuera de su dueño o está en desuso. */
export const MOTIVOS_SIN_PUERTA = ["no_la_usa", "por_rpc", "por_trigger", "fuera_del_dueno", "en_desuso"];

/**
 * Qué pasó con las alergias en la línea de log `bot_alergias`
 * (api/_bot/silencio.js): `apuntada`, el «ninguna» que apunta el código tras
 * la pregunta con aviso; `recordada`, el recordatorio del primer menú.
 */
export const ACCIONES_ALERGIAS = ["apuntada", "recordada"];

/**
 * Por qué el tope diario de IA (api/_guard.js, dailyBudget) no deja pasar, en
 * la línea de log `tope_diario`: `tope_alcanzado`, ya se gastó lo del día;
 * `sin_redis` y `error_redis`, no se puede contar y el tope falla cerrado.
 */
export const MOTIVOS_TOPE_DIARIO = ["tope_alcanzado", "sin_redis", "error_redis"];

/**
 * Qué hizo la escritura con un valor en la línea de log `vocabulario_escritura` (paraEscribir,
 * más abajo, #539): `quitado`, un retirado sin sucesor que no se escribe.
 */
export const ACCIONES_ESCRITURA = ["quitado"];

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
  alcances_descarte: ALCANCES_DESCARTE,
  canales_dato: CANALES_DATO,
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
  motivos_tope_diario: MOTIVOS_TOPE_DIARIO,
  acciones_escritura: ACCIONES_ESCRITURA,
});

/** La lista de un vocabulario por su nombre, o null si no existe. */
export const vocabulario = (nombre) => VOCABULARIOS[nombre] ?? null;

/**
 * Los valores retirados de cada vocabulario, con su sucesor: { nombre: { valor: pasa_a } }
 * (pasa_a null: retirado sin sucesor). Es la única fuente desde #878 (antes era la proyección
 * de ops/vocabularios-vida.json): al retirar un valor se apunta aquí, y el test de paridad de
 * src/lib/vocabularios.test.js exige que el CHECK de su columna lo siga admitiendo (#539).
 */
export const RETIRADOS = Object.freeze({});

/** Un valor que no se puede escribir porque no es de su vocabulario (ni vivo ni retirado): el CHECK lo rechazaría. */
export class FueraDeVocabulario extends Error {
  constructor(nombre, valor) {
    super(`«${valor}» no es un valor de ${nombre}, ni vivo ni retirado`);
    this.name = "FueraDeVocabulario";
    this.vocabulario = nombre;
    this.valor = valor;
  }
}

/**
 * La línea de log de un retirado sin sucesor que no se escribe, con la forma de las líneas de
 * evento del bot (JSON en una línea, como `bot_alergias`), para poder contarla:
 * {"evento":"vocabulario_escritura","vocabulario":"envases","valor":"tetra","accion":"quitado"}.
 */
export const avisarQuitado = (nombre, valor) =>
  console.warn(JSON.stringify({ evento: "vocabulario_escritura", vocabulario: nombre, valor: String(valor), accion: ACCIONES_ESCRITURA[0] }));

/**
 * Las dos funciones con las que todo módulo dueño escribe una columna de vocabulario
 * (PRINCIPIOS §4 y §15, #539). El CHECK admite los retirados (filas viejas de familias), así
 * que la base no impide volver a escribirlos: lo impide pasar por aquí.
 *   - paraEscribir(nombre, valor): el valor si está vivo; su `pasa_a` si está retirado. Un
 *     retirado sin sucesor no se escribe: da null (columna opcional) y deja la línea
 *     `vocabulario_escritura` con accion `quitado`. Un valor desconocido lanza
 *     FueraDeVocabulario: el CHECK también lo rechazaría, y tiene que fallar claro.
 *     null/undefined pasan tal cual.
 *   - listaParaEscribir(nombre, valores): lo mismo para una columna array; el retirado sin
 *     sucesor se quita de la lista (con su línea), un desconocido lanza, y sin repetidos (dos
 *     retirados pueden ir al mismo sucesor, o uno al que ya estaba).
 * `crearEscritor` existe para probarlo con un registro de prueba (vocabularios.test.js).
 */
export function crearEscritor(vocabularios = VOCABULARIOS, retirados = RETIRADOS, avisar = avisarQuitado) {
  const paraEscribir = (nombre, valor) => {
    const lista = vocabularios[nombre];
    if (!lista) throw new Error(`no existe el vocabulario «${nombre}»`);
    if (valor == null || lista.includes(valor)) return valor;
    const deEse = retirados[nombre] ?? {};
    if (!Object.prototype.hasOwnProperty.call(deEse, valor)) throw new FueraDeVocabulario(nombre, valor);
    if (deEse[valor] != null) return deEse[valor];
    avisar(nombre, valor);
    return null;
  };
  const listaParaEscribir = (nombre, valores) => {
    if (valores == null) return valores;
    const out = [];
    for (const v of valores) {
      if (v == null) continue;
      const w = paraEscribir(nombre, v);
      if (w != null && !out.includes(w)) out.push(w);
    }
    return out;
  };
  return { paraEscribir, listaParaEscribir };
}

export const { paraEscribir, listaParaEscribir } = crearEscritor();
