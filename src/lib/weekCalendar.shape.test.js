import { describe, it, expect } from "vitest";
import { getWeekDatesByMenuWeek } from "./weekCalendar.js";

describe("getWeekDatesByMenuWeek: forma de `dates`", () => {
  it("devuelve un objeto por nombre de día, NO un array", () => {
    // El bug de publicar menús: App.jsx leía dates[0] y dates.length para
    // sacar week_start/week_end. Aquí queda fijado por qué eso da null.
    const { dates, activeDays } = getWeekDatesByMenuWeek({ offset: 0, startDayIdx: 0 });
    expect(Array.isArray(dates)).toBe(false);
    expect(dates[0]).toBeUndefined();
    expect(dates.length).toBeUndefined();
    // La forma correcta de sacar el primer y el último día de la semana:
    expect(dates[activeDays[0]]).toBeInstanceOf(Date);
    expect(dates[activeDays[activeDays.length - 1]]).toBeInstanceOf(Date);
  });
});
