// La preparación de un menú ANTES de llamar al motor, compartida por la app
// (regenerateMenu en App.jsx) y por el bot de Telegram (api/_bot/generar.js).
//
// Vivía dentro de regenerateMenu. Se sacó aquí el 30 sep 2026 para que el bot
// genere EXACTAMENTE lo mismo que la app: si cada uno preparara la semana a su
// manera (reglas, cena de los niños, reparto), el mismo hogar tendría menús
// distintos según desde dónde lo pidiera. Código movido tal cual, sin cambios
// de comportamiento; solo `hoy` entra como parámetro en vez de leer el reloj.

import { COOK_TIME_DEFAULTS } from "./cookTime.js";
import { weekEntry } from "./menuArchive.js";
import { schoolMenusForWeekIndex } from "./schoolMenu.js";
import { proyectarReglas } from "./reglas.js";
import { deriveKidDinnerMatchesAdultLunch } from "./kidsMenu.js";
import { weeklySlotBudget } from "./planner.js";
import { freqsEfectivos, presupuestoDeTopes } from "./reparto.js";

// Devuelve una copia de `data` con los ajustes del modo básico forzados.
// En modo avanzado (expertMode) devuelve `data` tal cual.
export function resolveModeData(data) {
  if (!data || data.expertMode) return data;
  // Cenas rápidas viven en data.slotType como entradas "…|Cena": "rapida".
  // En básico se descartan las que vienen de la configuración del onboarding,
  // PERO se respetan las elegidas a mano desde el menú (data.manualSlotType),
  // porque son una decisión explícita del usuario para ese hueco concreto.
  const slotType = data.slotType ?? {};
  const manualSlotType = data.manualSlotType ?? {};
  const cleanedSlotType = {};
  for (const [k, v] of Object.entries(slotType)) {
    if (v !== "rapida" || manualSlotType[k]) cleanedSlotType[k] = v;
  }
  // Tiempo de cocina compartido (comida = cena) en básico.
  const ct = data.cookTime?.weekday ? data.cookTime : COOK_TIME_DEFAULTS;
  const syncBlock = (b) => {
    const v = Math.max(b?.Comida ?? 30, b?.Cena ?? 30);
    return { Comida: v, Cena: v };
  };
  return {
    ...data,
    // Solo comidas y cenas: sin desayuno, merienda ni postre.
    extraMeals: { desayuno: "off", merienda: "off", postre: "off", postreTipo: "inmediato", postreInmediato: "mix" },
    // Sin cenas rápidas.
    slotType: cleanedSlotType,
    // Nivel de cocina normal... salvo que lo hayas elegido tu desde la fila de
    // mandos del menu (`cookLevelManual`, ver el mando "Esfuerzo" en
    // lib/wizardRegistry.js). Mismo trato que `manualSlotType` aqui arriba: el
    // modo basico simplifica lo que NO has contestado, no lo que acabas de
    // decidir. Sin esto el mando se pintaba y no cambiaba el menu.
    cookLevel: data.cookLevelManual ? (data.cookLevel ?? "normal") : "normal",
    // La despensa NO se toca aquí, y es un cambio respecto a antes: el modo
    // básico forzaba `pantryMode: "off"`, o sea que a casi todo el mundo —el
    // básico es el defecto— la despensa no le contaba para nada.
    //
    // Se cae por lo mismo que se cayó la opción "Que no cuente": nadie rellena
    // el inventario para que luego no cuente. Y arrastraba un daño que no se
    // veía: los platos YA COCINADOS (tuppers de nevera y congelador) salen de
    // la misma lista que los ingredientes (ver frozenDishes/fridgeDishes en
    // lib/aiPlanner.js), así que apagarla no solo quitaba el sesgo — dejaba de
    // ofrecerte un táper que caduca en tres días.
    //
    // Ahora el modo de despensa es de quien lo elige, no del modo básico, y
    // manda igual sobre ingredientes y sobre platos hechos: quien sube algo
    // quiere que entre en el menú, y lo que se gradúa es cuánto pesa.
    // Multisemana: cosas distintas cada semana (sin repetir platos).
    menuVarietyPref: "strict",
    // Estilo de comida: equilibrado, sin diferenciar por grupo.
    mealStyleByGroup: {},
    // Estructura de plato única para todos (la global elegida en «¿Qué comidas
    // quieres organizar?»); ignora overrides por grupo del modo avanzado.
    mealStructureByGroup: {},
    // Igual que la de la comida: en básico la estructura de cena es una sola
    // para toda la casa, sin overrides por grupo.
    mealStructureCenaByGroup: {},
    // Tiempo de cocina igual para comida y cena.
    cookTime: { mode: "shared", weekday: syncBlock(ct.weekday), weekend: syncBlock(ct.weekend) },
    // pantryPrefs NO se fuerza: "cuándo damos por gastado lo de casa" se
    // pregunta también en sencillo, así que forzarlo aquí sería preguntar y
    // luego ignorar la respuesta.
  };
}

/**
 * Los datos de UNA semana listos para generateMenuWithAI, y su variedad
 * entre semanas. `working` ya viene por resolveModeData.
 */
export function prepararSemana(working, {
  groups, offset, w, startDayIdx, days, activeDays, startISO, endISO,
  weekOffsets, sameForAllWeeks, varietyPref, weekCount, hoy,
}) {
  const weekSchedule = sameForAllWeeks || offset === weekOffsets[0]
    ? working.schedule
    : (weekEntry(working.menuWeekOverrides, offset) ?? working.schedule);
  // Each generated week pulls its own school week (positional mapping:
  // 1st menú week → 1st selected school week, …, cycling when there are
  // fewer school weeks than menú weeks). Passed as a plain single-week
  // { shared, byMember } so every getSchoolDish(data.schoolMenus, …) call
  // downstream reads the right week without any signature change.
  const weekData = {
    ...working,
    groups,
    schedule: weekSchedule,
    menuWeek: { offset, startDayIdx, days },
    schoolMenus: schoolMenusForWeekIndex(working.schoolMenus, w),
  };

  // ── Las reglas, justo antes de generar ──────────────────────────
  // Una regla ("el miércoles viene mi hermano", "Lucía no cena en casa
  // hasta el día 20") se convierte aquí en un delta sobre `data.*` que
  // el motor ya entiende: un invitado es una PERSONA temporal con su
  // horario, no un número suelto, así que a partir de este punto
  // `eatersForSlot` lo cuenta, el plato escala y la compra sube — sin
  // que nada de aguas abajo sepa que existen las reglas.
  //
  // El delta se consume UNA vez y se tira: no se persiste jamás. Es lo
  // que impide que se acumule gente fantasma en la casa.
  //
  // `activeDays` y NO `days`: son cosas distintas y weekMeta trae las
  // dos. `days` son los días que el usuario eligió; `activeDays` los
  // que esta semana tiene de verdad. Pasar el otro haría que una regla
  // "los sábados" se aplicara en una semana que empieza en miércoles.
  const { delta: deltaReglas, avisos: avisosReglas } = proyectarReglas(
    weekData.reglas,
    weekData,
    { hoy, semana: { inicioISO: startISO, finISO: endISO, dias: activeDays } },
  );
  if (avisosReglas.length > 0) {
    // Todavía sin sitio en la UI. Se registran para no perderlos en
    // silencio: un aviso es "te he entendido y esto NO lo he hecho", y
    // callarlo es peor que no entender.
    console.warn("[reglas] avisos sin pintar:", avisosReglas);
  }
  Object.assign(weekData, deltaReglas);

  // DESPUÉS del delta, no antes: se calcula sobre el horario, y un
  // `presente` sobre un niño en Cena lo deja obsoleto — el flag diría
  // "la cena del niño copia la comida del adulto" para un niño que esa
  // noche no está en casa.
  weekData.kidDinnerMatchesAdultLunch = deriveKidDinnerMatchesAdultLunch(weekData);

  // ── El reparto, bajado a topes con los huecos REALES ─────────────
  // El reparto se guarda en PORCENTAJES (suma 100) justo para no depender
  // del número de huecos, pero al bajarlo a `freqs` se multiplicaba por
  // una constante de 14. Una semana normal de primero+segundo+cena tiene
  // 21 huecos, así que siete se quedaban sin cuota — y como 470 de las 471
  // recetas servibles cuentan para alguna clave, no hay huecos libres que
  // absorban la diferencia: son siete violaciones garantizadas de la regla
  // 11, cada una con su reintento al modelo y su reparación.
  //
  // Se hace AQUÍ y no en el motor porque el número correcto depende del
  // grupo y de la semana —los niños que comen en el cole tres días tienen
  // menos huecos que los adultos, y una semana partida menos que una
  // entera— y este es el único punto que conoce las dos cosas. `aiPlanner`
  // sigue leyendo `data.freqsByGroup` como siempre, sin saber que la
  // libreta existe.
  //
  // Un `freqsByGroup` ya escrito NO se toca: es el estilo de comida de ese
  // grupo concreto, una decisión más específica que el reparto de la casa.
  if (working.reparto && Object.keys(working.reparto).length > 0) {
    const porGrupo = { ...(weekData.freqsByGroup ?? {}) };
    const objetivoPorGrupo = {};
    for (const g of groups) {
      const huecos = weeklySlotBudget(weekData, g).total;
      const ejes = { freqs: working.freqsPedidos ?? {}, reparto: working.reparto };
      // El OBJETIVO es el reparto exacto sobre los huecos: a dónde va el
      // solver. Los TOPES llevan holgura (HOLGURA_TOPES): hasta dónde
      // puede. Sin holgura los topes no tienen solución, y sin objetivo
      // la holgura se convertiría en siete carnes. Ver lib/reparto.js.
      objetivoPorGrupo[g.id] = freqsEfectivos(ejes, { presupuesto: huecos });
      if (porGrupo[g.id]) continue;
      porGrupo[g.id] = freqsEfectivos(ejes, { presupuesto: presupuestoDeTopes(huecos) });
    }
    weekData.freqsByGroup = porGrupo;
    weekData.objetivoByGroup = objetivoPorGrupo;
  }
  const crossWeek = varietyPref === "relaxed" || weekCount <= 1
    ? null
    : { weekIndex: w, weekCount, varietyPref };
  return { weekData, crossWeek, weekSchedule };
}
