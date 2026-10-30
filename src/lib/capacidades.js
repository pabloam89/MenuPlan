/**
 * El mapa de capacidades (#939, fase 4): todo lo que una familia puede hacer,
 * una ficha por acción, con dónde se hace en Lola y dónde en la app. La meta
 * (Pablo, 28 oct 2026) es la máxima sincronía: lo encendido se puede hacer en
 * los dos lados, salvo lo que es de uno solo a propósito.
 *
 * Columnas, en vocabulario cerrado:
 *  - parte: la del registro de la ficha (MODULOS de registroFicha.js).
 *  - verbo (VERBOS) y sobre (la entidad de registroFicha.js ENTIDADES, o
 *    "charla" para lo que es de la conversación con Lola).
 *  - app: { pantalla (PANTALLAS), apagada?: motivo } o null. `apagada` es que
 *    el código está pero no se llega (el frontal del bot, un interruptor).
 *  - datos: claves de registroFicha.js (las de la persona, «members.x»).
 *  - salud: toca alergias o salud (Lola lo contrasta en el supervisor).
 *  - aProposito: por qué está en un solo lado a propósito; sin él, un lado
 *    vacío es un hueco que el inventario cuenta.
 *
 * Lo que sale de otro sitio y aquí no se escribe, para que no haya una copia
 * que se desfase:
 *  - lola: las herramientas de Lola que lo hacen, de su ficha en
 *    api/_bot/agente.js (`capacidades`; plan de fichas, trozo 23).
 *  - el estado (los dos, solo app, solo Lola, apagada), de `lola` y `app`
 *    (estadoDe).
 *
 * El inventario de la app lo hizo un recorrido de las pantallas el 28 oct
 * 2026 con FRONTAL_BOT encendido. Lo que se toca solo para mirar (plegar un
 * pasillo, cambiar de vista) no es una capacidad.
 */
// Dos FICHAS distintas: las de las herramientas (agente.js) y las de datos
// (vocabularios.js). Aquí solo la de las herramientas, con su nombre.
import { FICHAS as FICHAS_HERRAMIENTAS } from "../../api/_bot/agente.js";

export const VERBOS = ["ver", "anadir", "cambiar", "quitar", "marcar", "generar", "guardar", "compartir", "recordar", "deshacer", "conectar"];
export const SOBRE = ["casa", "persona", "grupo", "regla", "menu", "despensa", "compra", "receta", "charla"];
export const ESTADOS_CAPACIDAD = ["los_dos", "solo_app", "solo_lola", "apagada"];

/** Las pantallas de la app, con su fichero (el test comprueba que existe). */
export const PANTALLAS = Object.freeze({
  entrada: "src/App.jsx",
  inicio: "src/screens/Dashboard.jsx",
  familia: "src/screens/Onboarding.jsx",
  perfil: "src/screens/HomeProfileScreen.jsx",
  hogares: "src/screens/HouseholdsScreen.jsx",
  menu: "src/screens/Menu.jsx",
  mandos: "src/lib/wizardRegistry.js",
  menus_guardados: "src/screens/MenusScreen.jsx",
  pdf: "src/components/MenuPdfExportModal.jsx",
  recetas: "src/screens/RecipesScreen.jsx",
  catalogo: "src/screens/CatalogBrowserSheet.jsx",
  crear_receta: "src/screens/RecipePlanner.jsx",
  compra: "src/screens/Shopping.jsx",
  en_casa: "src/screens/Pantry.jsx",
  tickets: "src/screens/PantryReceiptFlow.jsx",
  estadisticas: "src/screens/Analytics.jsx",
  asistente: "src/screens/Onboarding.jsx",
  pizarra: "src/screens/PizarraControles.jsx",
});

// Motivos de lo que está en el código y no se llega.
const ASISTENTE = "el asistente de Inicio no sale con FRONTAL_BOT (Dashboard.jsx)";
const SIN_ENTRADA = "ningún botón lleva aquí";
const EN_CASA_LECTURA = "En casa va dentro de Compra en solo lectura";
// Decisiones de Pablo del 28 oct 2026.
const DESPENSA_DESDE_COMPRA = "en la app, la despensa cambia solo desde la lista de la compra (Pablo, 28 oct 2026)";
const SE_PREGUNTA_EN_LOLA = "se pregunta en Lola; la app lo enseña en la lista de la compra (Pablo, 28 oct 2026)";
const SIN_TICKETS = "tickets y gasto, mejor no (Pablo, 28 oct 2026)";

const app = (pantalla, apagada = null) => ({ pantalla, ...(apagada ? { apagada } : {}) });
const c = (id, accion, parte, verbo, sobre, o = {}) => ({
  id, accion, parte, verbo, sobre, app: null, datos: [], salud: false, aProposito: null, ...o,
});

/** Lola, de las fichas de sus herramientas. */
const conLola = (cap) => Object.freeze({ ...cap, lola: [...FICHAS_HERRAMIENTAS].filter(([, f]) => f.capacidades.includes(cap.id)).map(([n]) => n) });

const MAPA = [
  // ── Casa: quién es quién, su salud y la cuenta ──
  c("ver_casa", "ver quién vive en casa, con sus alergias y gustos", "casa", "ver", "persona", { app: app("familia"), datos: ["members"] }),
  c("anadir_persona", "añadir a alguien que vive y come en casa", "casa", "anadir", "persona", { app: app("familia"), datos: ["members"] }),
  c("quitar_persona", "quitar a alguien de la casa", "casa", "quitar", "persona", { app: app("familia"), datos: ["members"] }),
  c("nombre_persona", "corregir el nombre de una persona", "casa", "cambiar", "persona", { app: app("familia"), datos: ["members.name"] }),
  c("peso_altura", "decir el peso y la altura de una persona", "casa", "cambiar", "persona", { datos: ["members.pesoKg", "members.alturaCm"], salud: true }),
  c("aspecto_persona", "elegir el personaje, la foto y el color de una persona", "casa", "cambiar", "persona", { app: app("familia"), datos: ["members.avatarKey", "members.color"], aProposito: "es de pintar la app" }),
  c("alergias", "añadir o quitar alergias de una persona o de toda la casa", "casa", "cambiar", "persona", { app: app("familia"), datos: ["members.allergies", "allergiesReviewed"], salud: true }),
  c("alergia_otra", "apuntar una alergia que no está en la lista", "casa", "anadir", "persona", { app: app("familia"), datos: ["customAllergies"], salud: true }),
  c("salud", "marcar intolerancias, problemas de salud o un estado temporal", "casa", "cambiar", "persona", { app: app("familia"), datos: ["members.intolerances", "members.healthProfiles", "members.dietaryStates"], salud: true }),
  c("menu_dieta_blanda", "aceptar un menú aparte para quien está a dieta blanda", "casa", "cambiar", "grupo", { app: app("familia"), datos: ["groups"], salud: true }),
  c("quien_soy", "decir cuál de la familia eres tú", "casa", "cambiar", "persona", { app: app("perfil"), datos: ["accountMemberIdByUser"], aProposito: "Lola ya sabe quién escribe por su cuenta de Telegram" }),
  c("foto_perfil", "cambiar la foto de perfil", "casa", "cambiar", "casa", { app: app("perfil"), datos: ["profilePhoto"], aProposito: "es de pintar la app" }),
  c("entrar", "entrar con Google o Apple, o sin cuenta", "casa", "conectar", "casa", { app: app("entrada"), aProposito: "Lola entra por su chat" }),
  c("conectar_lola", "conectar la casa con el chat de Lola", "casa", "conectar", "casa", { app: app("inicio"), aProposito: "se hace desde la app hacia Lola" }),
  c("cuenta", "cerrar sesión o eliminar la cuenta", "casa", "quitar", "casa", { app: app("perfil"), aProposito: "la cuenta es de la app" }),
  c("reiniciar_menu", "reiniciar el menú de la casa", "casa", "quitar", "menu", { app: app("inicio"), datos: ["schedule", "activeMenuId"] }),
  c("hogares", "cambiar de hogar, invitar, unirse o quitar a alguien del hogar", "casa", "conectar", "casa", { app: app("hogares"), aProposito: "las invitaciones son de la cuenta, en la app" }),
  c("vaciar_hogar", "vaciar el hogar (menú, compra y despensa)", "casa", "quitar", "casa", { app: app("hogares"), aProposito: "borra mucho de golpe: solo en la app, con confirmación" }),

  // ── Menú: generarlo, verlo y cambiarlo ──
  c("generar_menu", "generar o rehacer el menú de una semana", "menu", "generar", "menu", { app: app("menu"), datos: ["menus", "activeMenuId"] }),
  c("asistente_menu", "montar el menú respondiendo el asistente paso a paso", "menu", "generar", "menu", { app: app("asistente", ASISTENTE), aProposito: "el asistente es solo de la app (Pablo, 28 oct 2026); en Lola se hace hablando" }),
  c("regenerar_dia", "rehacer un día del menú", "menu", "generar", "menu", { app: app("menu") }),
  c("ver_menu", "ver el menú de un día, una semana o un grupo", "menu", "ver", "menu", { app: app("menu"), datos: ["menuWeek"] }),
  c("cambiar_plato", "cambiar un plato por otro", "menu", "cambiar", "menu", { app: app("menu") }),
  c("elegir_plato", "elegir a mano el plato de un hueco, con sugerencias", "menu", "cambiar", "menu", { app: app("menu") }),
  c("mover_plato", "mover o duplicar un plato a otro hueco", "menu", "cambiar", "menu", { app: app("menu") }),
  c("quitar_plato", "quitar un plato de un hueco", "menu", "quitar", "menu", { app: app("menu") }),
  c("primero_segundo", "partir una comida en primero y segundo, o dejarla en plato único", "menu", "cambiar", "menu", { app: app("menu"), datos: ["slotType", "mealStructure", "mealStructureCena"] }),
  c("invitados", "sumar gente de fuera a una comida", "menu", "anadir", "regla", { app: app("menu"), datos: ["reglas"] }),
  c("fuera_de_casa", "decir que alguien no come en casa unos días", "menu", "cambiar", "regla", { datos: ["reglas", "schedule"] }),
  c("horario", "decir quién come dónde cada día de la semana", "menu", "cambiar", "casa", { app: app("asistente", ASISTENTE), datos: ["schedule"] }),
  c("modelo_menu", "decir quién come con quién (un menú o varios)", "menu", "cambiar", "grupo", { app: app("asistente", ASISTENTE), datos: ["menuModel", "groups"] }),
  c("semanas", "elegir para cuándo es el menú: días y semanas", "menu", "cambiar", "menu", { app: app("asistente", ASISTENTE), datos: ["menuWeekOffsets", "menuWeekDays", "menuVarietyPref"] }),
  c("extras", "elegir desayunos, meriendas y postres", "menu", "cambiar", "casa", { app: app("asistente", ASISTENTE), datos: ["extraMeals", "meals"] }),
  c("menu_peques", "decir cómo comen los peques: cena, mediodía, finde y qué no repiten del cole", "menu", "cambiar", "grupo", { app: app("mandos"), datos: ["kidDinnerConfig"] }),
  c("cuanto_de_cada", "decir cuánto de cada cosa (carne, pescado, legumbre…)", "menu", "cambiar", "casa", { app: app("mandos"), datos: ["notepad", "freqs"] }),
  c("gustos", "decir lo que gusta y lo que no, para siempre o unos días", "menu", "cambiar", "casa", { datos: ["notepad"] }),
  c("cocinas", "pedir cocinas de fuera (italiana, mexicana…)", "menu", "cambiar", "casa", { app: app("mandos"), datos: ["notepad"] }),
  c("desmentir_supuesto", "corregir algo que Lola dio por supuesto", "menu", "quitar", "casa", { datos: ["notepad"], aProposito: "los supuestos los apunta Lola al hablar" }),
  c("ver_ajustes", "ver cómo está configurada la casa", "menu", "ver", "casa", { app: app("mandos") }),
  c("nivel_cocina", "decir qué tal se cocina y cuánto tiempo hay", "menu", "cambiar", "casa", { app: app("mandos"), datos: ["cookLevel", "cookTime"] }),
  c("aparatos", "marcar los aparatos de cocina que hay", "menu", "cambiar", "casa", { app: app("mandos"), datos: ["kitchenTools"] }),
  c("aparato_otro", "apuntar un aparato que no está en la lista", "menu", "anadir", "casa", { app: app("mandos"), datos: ["customKitchenTools"] }),
  c("tanda", "pedir batch cooking: qué dejar hecho y cuándo", "menu", "cambiar", "casa", { app: app("asistente", ASISTENTE), datos: ["tanda", "tandaMinutos"] }),
  c("cocinado", "marcar un plato como cocinado", "menu", "marcar", "menu", { app: app("menu"), datos: ["cookedDishes", "cookedDeltas"] }),
  c("de_la_nevera", "sacar raciones de la nevera o del congelador para un plato", "menu", "cambiar", "menu", { app: app("menu") }),
  c("aparato_del_plato", "elegir con qué aparato se hace un plato", "menu", "cambiar", "menu", { app: app("menu") }),
  c("activar_menu", "activar o desactivar el menú", "menu", "marcar", "menu", { app: app("menu"), datos: ["activeMenuId"] }),
  c("menus_guardados", "ver, reutilizar, marcar o borrar menús guardados", "menu", "guardar", "menu", { app: app("menus_guardados"), datos: ["menus"] }),
  c("menu_favorito", "guardar el menú en favoritos", "menu", "guardar", "menu", { app: app("menu"), datos: ["menus"] }),
  c("compartir_semana", "mandar la semana a otra persona", "menu", "compartir", "menu", { app: app("menu") }),
  c("pdf", "descargar el menú en PDF", "menu", "compartir", "menu", { app: app("pdf"), aProposito: "un PDF es de la app" }),
  c("pizarra", "montar un menú en blanco hueco a hueco", "menu", "generar", "menu", { app: app("pizarra", "VITE_PIZARRA apagada") }),
  c("aviso_vispera", "recibir la víspera lo que hay que preparar", "menu", "recordar", "menu", { aProposito: "un aviso llega por el chat" }),
  c("deshacer", "deshacer el último cambio", "menu", "deshacer", "menu"),

  // ── Cole ──
  c("guardar_cole", "meter el menú del comedor del cole", "cole", "guardar", "casa", { app: app("asistente", ASISTENTE), datos: ["schoolMenus"] }),
  c("ver_cole", "ver el menú del cole", "cole", "ver", "casa", { app: app("pdf"), datos: ["schoolMenus"] }),

  // ── Recetas ──
  c("buscar_receta", "buscar y filtrar recetas del catálogo", "recetas", "ver", "receta", { app: app("catalogo") }),
  c("ver_receta", "ver los ingredientes y pasos de una receta", "recetas", "ver", "receta", { app: app("menu") }),
  c("crear_receta", "crear una receta propia (con su foto)", "recetas", "guardar", "receta", { app: app("crear_receta"), datos: ["userRecipes"] }),
  c("editar_receta", "editar una receta propia", "recetas", "cambiar", "receta", { app: app("crear_receta"), datos: ["userRecipes"] }),
  c("borrar_receta", "borrar una receta propia", "recetas", "quitar", "receta", { app: app("catalogo"), datos: ["userRecipes"] }),
  c("favorita", "guardar una receta en favoritas", "recetas", "guardar", "receta", { app: app("catalogo"), datos: ["recipeVotes"] }),
  c("carpetas", "crear o borrar carpetas de recetas", "recetas", "guardar", "receta", { app: app("catalogo"), datos: ["recipeFolders"] }),
  c("en_carpeta", "guardar una receta en una carpeta", "recetas", "guardar", "receta", { app: app("catalogo"), datos: ["recipeCollections"] }),
  c("recuperar_descartada", "recuperar una receta descartada", "recetas", "quitar", "receta", { app: app("catalogo"), datos: ["discards"] }),
  c("compartir_receta", "mandar una receta a otra persona", "recetas", "compartir", "receta", { app: app("menu") }),

  // ── Compra y precios ──
  c("ver_compra", "ver lo que falta por comprar", "compra", "ver", "compra", { app: app("compra") }),
  c("marcar_compra", "marcar algo como comprado, o devolverlo a pendiente", "compra", "marcar", "compra", { app: app("compra") }),
  c("anadir_compra", "añadir a la lista algo que no sale del menú", "compra", "anadir", "compra"),
  c("cantidad_compra", "cambiar la cantidad de un producto", "compra", "cambiar", "compra", { app: app("compra") }),
  c("quitar_compra", "quitar productos de la lista, o todo lo añadido a mano", "compra", "quitar", "compra", { app: app("compra") }),
  c("compartir_compra", "mandar la lista a otra persona", "compra", "compartir", "compra", { app: app("compra") }),
  c("elegir_super", "elegir el súper", "compra", "cambiar", "compra", { app: app("asistente", ASISTENTE), datos: ["supermarkets"], aProposito: SE_PREGUNTA_EN_LOLA }),
  // Qué hace (lib/presupuesto.js, #958): al generar, el solver prefiere lo que
  // cabe y se dice si la semana cabe; la lista de Mercadona de la app pone el
  // presupuesto al lado de su total.
  c("presupuesto", "poner un presupuesto semanal: al generar, el menú prefiere lo que cabe y dice si cabe; en la app, la lista de Mercadona lo compara con su total", "compra", "cambiar", "compra", { app: app("asistente", ASISTENTE), datos: ["hasBudget", "budget"], aProposito: SE_PREGUNTA_EN_LOLA }),
  c("precio_estimado", "ver lo que costará la compra en el súper", "compra", "ver", "compra", { app: app("compra"), datos: ["priceObs"] }),
  c("tickets", "subir un ticket o apuntar un gasto", "compra", "anadir", "compra", { app: app("tickets", SIN_ENTRADA), datos: ["receipts", "priceObs", "priceAliases"], aProposito: SIN_TICKETS }),
  c("gasto", "ver lo gastado y los tickets", "compra", "ver", "compra", { app: app("estadisticas", SIN_ENTRADA), datos: ["receipts"], aProposito: SIN_TICKETS }),

  // ── Despensa ──
  c("ver_despensa", "ver lo que hay en casa", "despensa", "ver", "despensa", { app: app("en_casa") }),
  c("anadir_despensa", "apuntar comida en casa (a mano, por foto o por ticket)", "despensa", "anadir", "despensa", { app: app("en_casa", EN_CASA_LECTURA), aProposito: DESPENSA_DESDE_COMPRA }),
  c("cambiar_despensa", "cambiar la cantidad o el sitio de algo en casa", "despensa", "cambiar", "despensa", { app: app("en_casa", EN_CASA_LECTURA), aProposito: DESPENSA_DESDE_COMPRA }),
  c("cuando_gastado", "decidir cuándo se da algo por gastado", "despensa", "cambiar", "despensa", { app: app("compra"), datos: ["pantryPrefs"] }),
  c("aprovechar_casa", "decir si el menú aprovecha lo que hay en casa", "despensa", "cambiar", "despensa", { app: app("asistente", ASISTENTE), datos: ["pantryMode"] }),

  // ── La charla con Lola ──
  c("tareas", "apuntar, corregir o cerrar algo pendiente", "casa", "recordar", "charla", { aProposito: "es la memoria de la charla" }),
  c("recordatorios", "programar, ver o cancelar un recordatorio", "casa", "recordar", "charla", { aProposito: "un recordatorio llega por el chat" }),
  c("empezar_de_nuevo", "empezar una charla nueva", "casa", "deshacer", "charla", { aProposito: "es de la charla" }),
];

export const CAPACIDADES = Object.freeze(MAPA.map(conLola));

/** El estado de una capacidad, de dónde se puede hacer. */
export function estadoDe(cap) {
  const enLola = cap.lola.length > 0;
  const enApp = Boolean(cap.app && !cap.app.apagada);
  if (enLola && enApp) return "los_dos";
  if (enApp) return "solo_app";
  if (enLola) return "solo_lola";
  return "apagada";
}

/** Un lado vacío sin motivo es un hueco de sincronía. */
export const esHueco = (cap) => estadoDe(cap) !== "los_dos" && !cap.aProposito;
