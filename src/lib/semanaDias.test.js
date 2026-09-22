import { describe, it, expect } from "vitest";
import {
  buildCalendarWeeks,
  diasPorDefecto,
  diasDeSemana,
  aplicarDiasDeSemana,
  conDiaMarcado,
  conSemanaCompleta,
} from "./semanaDias.js";
import { DAYS } from "./planner.js";
import { mondayISOForOffset } from "./weekCalendar.js";

const VENTANA = { allOffsets: [0, 1, 2, 3], todayIdx: 2 }; // hoy es miércoles

describe("los días por defecto de una semana", () => {
  it("la semana de hoy empieza hoy", () => {
    expect(diasPorDefecto(0, 2)).toEqual(["Mié", "Jue", "Vie", "Sáb", "Dom"]);
  });

  it("las siguientes van enteras", () => {
    expect(diasPorDefecto(1, 2)).toEqual(DAYS);
  });
});

describe("leer los días de una semana", () => {
  it("lo explícito manda, y va por el lunes de esa semana", () => {
    const data = { menuWeekDays: { [mondayISOForOffset(1)]: ["Lun", "Mar"] } };
    expect(diasDeSemana(data, 1, 2)).toEqual(["Lun", "Mar"]);
  });

  it("una semana sin tocar cae al criterio legado de menuWeekOffsets", () => {
    const data = { menuWeekOffsets: [0] };
    expect(diasDeSemana(data, 0, 2)).toEqual(diasPorDefecto(0, 2));
    expect(diasDeSemana(data, 1, 2)).toEqual([]);
  });

  it("sin nada guardado, solo la semana de hoy tiene días", () => {
    expect(diasDeSemana({}, 0, 2).length).toBeGreaterThan(0);
    expect(diasDeSemana({}, 2, 2)).toEqual([]);
  });
});

describe("escribir días recalcula SIEMPRE los dos derivados", () => {
  it("añadir una segunda semana la mete en menuWeekOffsets", () => {
    const base = { menuWeekOffsets: [0] };
    const next = aplicarDiasDeSemana(base, 1, ["Lun", "Mar"], VENTANA);
    expect(next.menuWeekOffsets).toEqual([0, 1]);
    expect(next.menuWeekDays[mondayISOForOffset(1)]).toEqual(["Lun", "Mar"]);
  });

  it("la semana ancla es la primera con días, y fija el día de arranque", () => {
    const base = { menuWeekOffsets: [0] };
    // Se vacía la semana 0 y solo queda la 2: el ancla pasa a ser la 2.
    const conDos = aplicarDiasDeSemana(base, 2, ["Jue", "Vie"], VENTANA);
    const sinCero = aplicarDiasDeSemana(conDos, 0, [], VENTANA);
    expect(sinCero.menuWeekOffsets).toEqual([2]);
    expect(sinCero.menuWeek).toEqual({ offset: 2, startDayIdx: 0 });
  });

  it("en la semana de hoy el arranque es el primer día marcado", () => {
    const next = aplicarDiasDeSemana({}, 0, ["Vie", "Sáb"], VENTANA);
    expect(next.menuWeek).toEqual({ offset: 0, startDayIdx: DAYS.indexOf("Vie") });
  });

  it("no deja el menú sin un solo día: vaciar la última semana no hace nada", () => {
    const base = aplicarDiasDeSemana({}, 0, ["Vie"], VENTANA);
    expect(aplicarDiasDeSemana(base, 0, [], VENTANA)).toBe(base);
  });

  it("los días salen en orden L-D aunque se marquen desordenados", () => {
    let d = aplicarDiasDeSemana({}, 1, [], VENTANA);
    d = conDiaMarcado(d, 1, "Vie", true, VENTANA);
    d = conDiaMarcado(d, 1, "Lun", true, VENTANA);
    d = conDiaMarcado(d, 1, "Mié", true, VENTANA);
    expect(d.menuWeekDays[mondayISOForOffset(1)]).toEqual(["Lun", "Mié", "Vie"]);
  });

  it("borra la clave numérica vieja al reescribir esa semana", () => {
    const base = { menuWeekDays: { 1: ["Lun"] }, menuWeekOffsets: [0, 1] };
    const next = aplicarDiasDeSemana(base, 1, ["Mar"], VENTANA);
    expect(next.menuWeekDays[1]).toBeUndefined();
    expect(next.menuWeekDays[mondayISOForOffset(1)]).toEqual(["Mar"]);
  });
});

describe("atajos de la UI", () => {
  it("marcar un día suelto no toca las demás semanas", () => {
    const base = aplicarDiasDeSemana({}, 0, ["Jue", "Vie"], VENTANA);
    const next = conDiaMarcado(base, 0, "Jue", false, VENTANA);
    expect(next.menuWeekDays[mondayISOForOffset(0)]).toEqual(["Vie"]);
  });

  it("la semana completa alterna entre llena y vacía", () => {
    const llena = conSemanaCompleta({ menuWeekOffsets: [0] }, 1, VENTANA);
    expect(llena.menuWeekDays[mondayISOForOffset(1)]).toEqual(DAYS);
    const vacia = conSemanaCompleta(llena, 1, VENTANA);
    expect(vacia.menuWeekDays[mondayISOForOffset(1)]).toBeUndefined();
    expect(vacia.menuWeekOffsets).toEqual([0]);
  });
});

describe("el calendario que se dibuja", () => {
  it("son semanas consecutivas de lunes a domingo", () => {
    const weeks = buildCalendarWeeks(4);
    expect(weeks).toHaveLength(4);
    expect(weeks.map((w) => w.offset)).toEqual([0, 1, 2, 3]);
    for (const w of weeks) {
      expect(w.days).toHaveLength(7);
      expect(w.monday.getDay()).toBe(1);
    }
    const dias = (weeks[1].monday - weeks[0].monday) / 86400000;
    expect(Math.round(dias)).toBe(7);
  });
});
