/**
 * Los tres caminos de preguntas antes del menú, una sola lista para la app y Lola.
 *
 * Nacieron en el asistente de la app (src/screens/ScopePickerScreen.jsx, sept.
 * 2026): hoy «Solo los días», «Unas preguntas» y «A fondo». Desde noviembre de 2026 Lola
 * ofrece los mismos tres al preparar el menú (el trato de cada cuenta propone uno
 * y los otros quedan a un toque), así que la lista vive aquí y no en una pantalla:
 * si mañana se añade un tema, sale en los dos a la vez.
 *
 * Aquí va lo que es igual en los dos lados: qué temas hay, qué datos del registro
 * (src/lib/registroCampos.js) contesta cada uno y qué temas abre cada camino. Lo
 * propio de cada lado se queda en su sitio: los pasos de pantalla y las imágenes,
 * en ScopePickerScreen; cómo lo pregunta Lola, en su manual.
 *
 * Sin JSX ni imports de pantalla: lo importa también el bot (api/_bot).
 */

/** Ids de los temas, en el orden en que se preguntan. */
export const TEMA = Object.freeze({
  SEMANA: "semana",
  COMPRA: "compra",
  HORARIO: "horario",
  COLE: "cole",
  NINOS: "ninos",
  ESTILO: "estilo",
  ESTRUCTURA: "estructura",
  EXTRAS: "extras",
  DESPENSA: "despensa",
  COCINA: "cocina",
  ELECTROS: "electros",
  TIEMPOS: "tiempos",
  BATCH: "batch",
});

/**
 * Los temas. `campos`: los datos del registro que contesta; vacío cuando el tema
 * aún no tiene campo en el registro (se guarda por otro camino: preferencias,
 * menú del cole, presupuesto). `soloNinos`: solo aplica con niños en casa.
 */
export const TEMAS = Object.freeze([
  { id: TEMA.SEMANA, titulo: "¿Para qué días quieres el menú?", campos: ["menuWeekDays"] },
  { id: TEMA.COMPRA, titulo: "¿Cuánto quieres gastarte en la compra?", campos: ["supermarkets", "wantsPriceEstimates"] },
  { id: TEMA.HORARIO, titulo: "¿Qué días coméis en casa?", campos: ["schedule", "meals"] },
  { id: TEMA.COLE, titulo: "¿Tienes el menú del cole de tus hijos?", campos: ["colegio"], soloNinos: true },
  { id: TEMA.NINOS, titulo: "¿Comen tus hijos igual que vosotros?", campos: ["menuModel", "etapaBebe"], soloNinos: true },
  { id: TEMA.ESTILO, titulo: "¿Qué estilo de comida preferís?", campos: [] },
  { id: TEMA.ESTRUCTURA, titulo: "¿Cuántos platos por comida?", campos: ["mealStructure", "mealStructureCena"] },
  { id: TEMA.EXTRAS, titulo: "¿Queréis desayunos?", campos: ["meals"] },
  { id: TEMA.DESPENSA, titulo: "¿Queréis usar lo que hay en casa?", campos: ["pantryMode"] },
  { id: TEMA.COCINA, titulo: "¿Cuánto os gusta cocinar?", campos: ["cookLevel"] },
  { id: TEMA.ELECTROS, titulo: "¿Qué tenéis en la cocina?", campos: ["kitchenTools"] },
  { id: TEMA.TIEMPOS, titulo: "¿Cuánto tiempo tenéis para cocinar?", campos: [] },
  { id: TEMA.BATCH, titulo: "¿Cocináis en tandas?", campos: ["tandaMinutos", "diaTanda"] },
].map(Object.freeze));

/** Ids de los caminos. */
export const CAMINO = Object.freeze({ BASICO: "basico", MEDIO: "medio", AVANZADO: "avanzado" });

/**
 * Los tres caminos. `temas`: los que abre cada uno (el resto se queda con su
 * valor por defecto sin preguntar). `experto`: con él apagado el asistente de la
 * app simplifica algunos pasos (ver ScopePickerScreen). `minutos`: lo que se
 * tarda, que es como se presentan («por tiempo y no por nivel»). `ejemplo`: lo que
 * alguien contestaría en ese camino, para que se entienda qué se le va a pedir.
 * `enChat`: el resumen corto de Lola, una línea de móvil detrás del botón (el
 * `resumen` es el subtítulo de la pantalla de la app; trozo 60 de #1037).
 * El `titulo` es el botón: dice qué pasa al elegirlo, no un nivel abstracto (en
 * Telegram «Lo básico / A tu gusto / Al detalle» no se entendía, 4 nov 2026).
 *
 * El `cole` va en los tres: si los niños comen en el comedor, cuadrar las cenas
 * con lo de allí es lo que hace que el menú no repita (se cae solo sin niños).
 */
export const CAMINOS = Object.freeze([
  {
    id: CAMINO.BASICO,
    titulo: "Solo los días",
    minutos: 1,
    resumen: "Me dices qué días coméis en casa y del resto me encargo yo.",
    ejemplo: "de lunes a viernes, solo cenas",
    enChat: "me dices cuándo coméis en casa",
    temas: [TEMA.COLE, TEMA.SEMANA, TEMA.HORARIO],
    experto: false,
  },
  {
    id: CAMINO.MEDIO,
    titulo: "Unas preguntas",
    minutos: 3,
    resumen: "Los días y, además, cómo os gusta comer y cómo cocináis.",
    ejemplo: "menos fritos, y tengo airfryer",
    enChat: "además, gustos y cómo cocináis",
    temas: [TEMA.SEMANA, TEMA.HORARIO, TEMA.NINOS, TEMA.COLE, TEMA.ESTILO, TEMA.ESTRUCTURA, TEMA.COCINA, TEMA.ELECTROS],
    experto: true,
  },
  {
    id: CAMINO.AVANZADO,
    titulo: "A fondo",
    minutos: 5,
    resumen: "Repasamos todo: el cole, el presupuesto, los tiempos y los aparatos.",
    ejemplo: "60 € a la semana, y cocino en tandas el domingo",
    enChat: "también presupuesto, cole y tiempos",
    temas: TEMAS.map((t) => t.id),
    experto: true,
  },
].map(Object.freeze));

/**
 * Pura. Los temas que abre un camino en esta casa: sin niños, fuera los que solo
 * aplican con niños. Un camino desconocido lanza: devolver «ningún tema» se
 * leería como «no hay nada que preguntar».
 */
export function temasDelCamino(caminoId, { hayNinos = false } = {}) {
  const camino = CAMINOS.find((c) => c.id === caminoId);
  if (!camino) throw new Error(`Camino desconocido: ${caminoId}`);
  const aplica = new Set(TEMAS.filter((t) => hayNinos || !t.soloNinos).map((t) => t.id));
  return camino.temas.filter((id) => aplica.has(id));
}
