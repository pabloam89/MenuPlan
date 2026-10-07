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

/** A qué se refiere un «sobre» o un cambio: qué lo originó. */
export const REF_TIPO = ["menu", "mensaje", "pantalla", "senal"];

/** Quién puede ver un dato de la ficha. */
export const VISIBILIDAD = ["casa", "adultos", "titulares", "la_persona_y_tutores"];

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
  ref_tipo: REF_TIPO,
  visibilidad: VISIBILIDAD,
});

/** La lista de un vocabulario por su nombre, o null si no existe. */
export const vocabulario = (nombre) => VOCABULARIOS[nombre] ?? null;
