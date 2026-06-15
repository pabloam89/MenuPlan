export const COOK_TIME_DEFAULTS = {
  mode: "shared",
  weekday: { Comida: 30, Cena: 30 },
  weekend: { Comida: 60, Cena: 60 },
};

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

export function writeCookTimeShared(data, period, value) {
  return writeCookTimePeriod(data, period, { Comida: value, Cena: value });
}
