export const COOK_TIME_DEFAULTS = {
  mode: "shared",
  weekday: { Comida: 30, Cena: 30 },
  weekend: { Comida: 60, Cena: 60 },
};

// Qualitative "cooking pace" levels shown in the editor instead of a raw slider
// (people never dial an exact number — time is variable). Each maps to a per-slot
// minute budget the planner already understands through maxCookTime, so nothing
// downstream changes. Minutes are distinct so the selected chip can be inferred
// back from stored minutes (keeps back-compat with the old slider + imports).
export const COOK_LEVELS = [
  { id: "con_prisa",  label: "Con prisa",       sub: "Voy con el tiempo justo",    minutes: 20 },
  { id: "normal",     label: "Normal",          sub: "Sencillo pero decente",      minutes: 35 },
  { id: "con_tiempo", label: "Con tiempo",      sub: "Tengo un rato para cocinar", minutes: 75 },
  { id: "depende",    label: "Depende del día", sub: "Unos días sí y otros no",    minutes: 55 },
];

export function cookLevelMinutes(id) {
  return (COOK_LEVELS.find((l) => l.id === id) ?? COOK_LEVELS[1]).minutes;
}

/** Nearest level to a stored minute budget (for highlighting the active chip). */
export function cookLevelForMinutes(minutes) {
  let bestId = COOK_LEVELS[1].id;
  let bestDist = Infinity;
  for (const l of COOK_LEVELS) {
    const d = Math.abs(l.minutes - (minutes ?? 0));
    if (d < bestDist) { bestDist = d; bestId = l.id; }
  }
  return bestId;
}

// Fallback day counts when the real schedule isn't available (5 weekdays,
// 2 weekend days). The editor passes the real per-meal counts derived from the
// schedule so weekly totals match what the family actually cooks.
export const COOK_PERIOD_DAYS = { weekday: 5, weekend: 2 };

export function daysInCookPeriod(period) {
  return COOK_PERIOD_DAYS[period] ?? 5;
}

/** Days that a given meal is cooked in a period (real schedule → fallback). */
function daysForMeal(period, meal, dayCounts) {
  const real = dayCounts?.[period]?.[meal];
  if (typeof real === "number") return real;
  return daysInCookPeriod(period);
}

/**
 * Weekly scale for a per-slot cook time:
 *  - shared: one slider covers every planned meal in the period → sum of the
 *    days each of those meals is cooked.
 *  - per-meal: just the days that specific meal is cooked.
 */
export function weekCookScale(period, mealTargets, { shared = false, meal, dayCounts } = {}) {
  const targets = mealTargets && mealTargets.length ? mealTargets : ["Comida"];
  if (shared) {
    return targets.reduce((sum, m) => sum + daysForMeal(period, m, dayCounts), 0);
  }
  return daysForMeal(period, meal ?? targets[0], dayCounts);
}

export function toDisplayCookMinutes(perSlotMinutes, period, mealTargets, unit, opts = {}) {
  if (unit !== "week") return perSlotMinutes;
  return perSlotMinutes * weekCookScale(period, mealTargets, opts);
}

export function fromDisplayCookMinutes(displayMinutes, period, mealTargets, unit, opts = {}) {
  if (unit !== "week") return displayMinutes;
  const scale = weekCookScale(period, mealTargets, opts) || 1;
  return Math.round(displayMinutes / scale);
}

export function displayCookBounds(min, max, period, mealTargets, unit, opts = {}) {
  if (unit !== "week") return { min, max };
  const scale = weekCookScale(period, mealTargets, opts);
  return { min: min * scale, max: max * scale };
}

/** Display label for cook-time sliders: under 60 min → "45 min"; 60+ → "1h" / "4h10" (optional "/sem"). */
export function formatCookDurationLabel(minutes, unit = "day") {
  const weekly = unit === "week";
  if (minutes < 60) {
    return weekly ? `${minutes} min/sem` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const core = mins > 0 ? `${hours}h${mins}` : `${hours}h`;
  return weekly ? `${core}/sem` : core;
}

export function migrateCookTime(data) {
  let weekday;
  let weekend;
  if (
    data?.cookTime?.weekday &&
    typeof data.cookTime.weekday.Comida === "number" &&
    typeof data.cookTime.weekday.Cena === "number"
  ) {
    weekday = {
      Comida: data.cookTime.weekday.Comida,
      Cena: data.cookTime.weekday.Cena,
    };
    weekend = {
      Comida: data.cookTime.weekend?.Comida ?? COOK_TIME_DEFAULTS.weekend.Comida,
      Cena: data.cookTime.weekend?.Cena ?? COOK_TIME_DEFAULTS.weekend.Cena,
    };
  } else {
    const wd = data?.timeWeekday ?? COOK_TIME_DEFAULTS.weekday.Comida;
    const we = data?.timeWeekend ?? COOK_TIME_DEFAULTS.weekend.Comida;
    weekday = { Comida: wd, Cena: wd };
    weekend = { Comida: we, Cena: we };
  }

  const inferredSplit = weekday.Comida !== weekday.Cena || weekend.Comida !== weekend.Cena;
  const mode =
    data?.cookTime?.mode === "split" || data?.cookTime?.mode === "shared"
      ? data.cookTime.mode
      : inferredSplit
        ? "split"
        : "shared";

  return { mode, weekday, weekend };
}

/** Max minutes for a slot (Comida / Cena / Desayuno → Comida budget). */
export function maxCookTime(data, { isWeekend, meal }) {
  const block = isWeekend ? migrateCookTime(data).weekend : migrateCookTime(data).weekday;
  if (meal === "Cena") return block.Cena;
  return block.Comida;
}

export function maxCookTimeFilter(data) {
  const ct = migrateCookTime(data);
  return Math.max(
    ct.weekday.Comida,
    ct.weekday.Cena,
    ct.weekend.Comida,
    ct.weekend.Cena,
  );
}

export function formatCookTimeSummary(data) {
  const ct = migrateCookTime(data);
  const fmtBlock = (block, label) => {
    if (block.Comida === block.Cena) return `${block.Comida} min ${label}`;
    return `${block.Comida} min comida · ${block.Cena} min cena (${label})`;
  };
  return `${fmtBlock(ct.weekday, "L-V")} · ${fmtBlock(ct.weekend, "finde")}`;
}

export function writeCookTimePeriod(data, period, patch) {
  const cur = migrateCookTime(data);
  return {
    ...data,
    cookTime: {
      ...cur,
      [period]: { ...cur[period], ...patch },
    },
  };
}

export function writeCookTimeMode(data, mode) {
  const cur = migrateCookTime(data);
  if (mode === cur.mode) return data;

  if (mode === "shared") {
    const sync = (block) => {
      const v = Math.max(block.Comida, block.Cena);
      return { Comida: v, Cena: v };
    };
    return {
      ...data,
      cookTime: {
        mode: "shared",
        weekday: sync(cur.weekday),
        weekend: sync(cur.weekend),
      },
    };
  }

  return { ...data, cookTime: { ...cur, mode: "split" } };
}

/**
 * Cocinar cada día o cocinar en tanda — el reparto del tiempo en la semana.
 *
 * Es OTRO eje que el ritmo: el ritmo dice cuánto rato tienes por comida, y
 * esto cómo lo repartes. Por eso "con prisa entre semana Y cocino el domingo"
 * se puede decir: son dos respuestas, no una.
 *
 * Se guarda EXPLÍCITO y no se deduce de los minutos. Deducirlo de la asimetría
 * ("el finde tiene el doble que el diario") parecía elegante y estaba mal: el
 * valor por defecto de la app ya es 30 y 60, justo el doble, así que cualquiera
 * que no hubiera tocado nada habría salido marcado "en tanda" sin pedirlo.
 *
 * Y hace algo de verdad, no es una etiqueta: abre el presupuesto del fin de
 * semana sin tocar el de diario, y eso lo lee el planner por `maxCookTime` — un
 * domingo de 90 minutos admite un guiso que un martes de 20 no.
 */
export function writeCookTimeTanda(data, tanda) {
  const ct = migrateCookTime(data);
  const diario = ct.weekday?.Comida ?? COOK_TIME_DEFAULTS.weekday.Comida;
  const finde = tanda ? Math.max(90, diario * 3) : diario;
  return {
    ...data,
    cookTime: {
      ...ct,
      tanda: Boolean(tanda),
      weekend: { Comida: finde, Cena: finde },
    },
  };
}

/**
 * ¿Ha dicho esta casa que cocina en tanda? `undefined` = todavía no lo ha dicho.
 *
 * Es una DECLARACIÓN, y desde que la pantalla de tandas vive aparte (2026-09-21)
 * eso es todo lo que es: abre el presupuesto del finde y decide si se ve la
 * pantalla. Quien quiera saber si hay tandas de verdad en juego tiene que
 * preguntar por lo pedido — ver `hayTandasPedidas`.
 */
export function cocinaEnTanda(data) {
  return data?.cookTime?.tanda;
}

/**
 * ¿Hay alguna tanda PEDIDA? La pregunta que le importa al menú.
 *
 * Marcar "batch cooking" y no pedir nada deja una casa que, sobre el papel,
 * cocina en tanda pero no tiene nada hecho el martes: el icono de tanda en el
 * menú y el "¿tienes el sofrito hecho?" de la ficha hablaban entonces de ollas
 * que nadie iba a cocinar. Y al revés: quien pidió sofrito ×3 tiene ese sofrito
 * hecho, haya tocado o no la card del modo.
 *
 * Lee las PROYECCIONES de la libreta (`tanda` y `tandaPlatos`), que es donde
 * `BasesPreferidas` deja lo pedido en el mismo gesto de pedirlo. La libreta
 * sigue siendo la fuente; esto solo la consulta.
 */
export function hayTandasPedidas(data) {
  const pedido = (mapa) => Object.values(mapa ?? {}).some((n) => Number(n) > 0);
  return pedido(data?.tanda) || pedido(data?.tandaPlatos);
}

export function writeCookTimeShared(data, period, value) {
  return writeCookTimePeriod(data, period, { Comida: value, Cena: value });
}

/**
 * El presupuesto de la sesión de tandas, en MINUTOS DE MANOS.
 *
 * De manos y no de reloj porque el domingo se solapa: mientras el caldo hierve
 * cuarenta minutos puedes estar picando otra cosa. Lo que no se puede solapar
 * es estar delante, así que eso es lo único que se suma. Ver el comentario de
 * `manosDeMetodo` en lib/bases.js, que es quien calcula las manos de cada base
 * según el aparato que la casa dijo tener.
 *
 * El recorrido del deslizador va de media hora a cuatro, de media en media.
 * Media hora es el escalón porque es como se habla de esto —"tengo un par de
 * horas"— y porque por debajo no cabe ni una tanda: el sofrito son 25 minutos
 * de manos. Y cuatro arriba porque a partir de ahí ya no es un domingo, es un
 * proyecto.
 */
export const TANDA_MIN = 30;
export const TANDA_MAX = 240;
export const TANDA_PASO = 30;
export const TANDA_POR_DEFECTO = 60;

/** Los minutos de manos que esta casa quiere dedicar a la tanda. */
export function minutosDeTanda(data) {
  const guardado = Number(data?.tandaMinutos);
  if (!Number.isFinite(guardado) || guardado <= 0) return TANDA_POR_DEFECTO;
  return Math.min(TANDA_MAX, Math.max(TANDA_MIN, guardado));
}

/**
 * Minutos dichos como los diría una persona: "1 h 30", no "90 min".
 *
 * Por debajo de la hora se quedan en minutos, que es como se piensan; a partir
 * de ahí manda la hora y los minutos van detrás solo si los hay.
 */
export function enHoras(minutos) {
  const m = Math.max(0, Math.round(Number(minutos) || 0));
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto}`;
}

/**
 * Los minutos redondeados a cinco, para no prometer una precisión que no hay.
 *
 * El gasto de una tanda sale de sumar los minutos de cada paso de cada receta,
 * y eso da números como 81. Escribir "1 h 21" dice que alguien lo ha medido, y
 * nadie lo ha medido: son estimaciones de una tabla de métodos, y además tu
 * cocina no es la de la tabla. "1 h 20" dice lo mismo y no miente.
 *
 * A cinco y no a la media hora porque el deslizador de al lado ya va de media
 * en media: si los dos redondearan igual, la barra de lo gastado daría saltos
 * de treinta minutos y parecería rota.
 */
export function aLoGrueso(minutos) {
  return Math.round((Number(minutos) || 0) / 5) * 5;
}
