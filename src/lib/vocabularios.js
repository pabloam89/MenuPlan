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
});

/** La lista de un vocabulario por su nombre, o null si no existe. */
export const vocabulario = (nombre) => VOCABULARIOS[nombre] ?? null;
