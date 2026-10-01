import { describe, it, expect } from "vitest";
import { fechasDe } from "./cuando.js";

// 2026: el 30 sep es miércoles, el 3 oct sábado, el 4 oct domingo.
const MIERCOLES = "2026-09-30";
const SABADO = "2026-10-03";
const DOMINGO = "2026-10-04";
const MARTES = "2026-09-29";

describe("de «cuándo» a fechas", () => {
  it("hoy, mañana y pasado", () => {
    expect(fechasDe({ cuando: "hoy" }, MIERCOLES)).toEqual(["2026-09-30"]);
    expect(fechasDe({ cuando: "manana" }, MIERCOLES)).toEqual(["2026-10-01"]);
    expect(fechasDe({ cuando: "pasado_manana" }, MIERCOLES)).toEqual(["2026-10-02"]);
  });

  it("el finde: un miércoles, este sábado y domingo; un sábado, los dos; un domingo, hoy", () => {
    expect(fechasDe({ cuando: "finde" }, MIERCOLES)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(fechasDe({ cuando: "finde" }, SABADO)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(fechasDe({ cuando: "finde" }, DOMINGO)).toEqual(["2026-10-04"]);
  });

  it("el finde que viene: entre semana es este; en finde, el siguiente", () => {
    expect(fechasDe({ cuando: "finde_que_viene" }, MIERCOLES)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(fechasDe({ cuando: "finde_que_viene" }, SABADO)).toEqual(["2026-10-10", "2026-10-11"]);
  });

  it("un día: el lunes un martes es el siguiente; el miércoles un miércoles, hoy", () => {
    expect(fechasDe({ cuando: "dia", dia: "lunes" }, MARTES)).toEqual(["2026-10-05"]);
    expect(fechasDe({ cuando: "dia", dia: "el miércoles" }, MIERCOLES)).toEqual(["2026-09-30"]);
    expect(fechasDe({ cuando: "dia", dia: "Sáb" }, MIERCOLES)).toEqual(["2026-10-03"]);
    expect(fechasDe({ cuando: "dia", dia: "mañana" }, MIERCOLES)).toEqual(["2026-10-01"]);
  });

  it("esta semana, de hoy al domingo; la que viene, del lunes siguiente al domingo", () => {
    expect(fechasDe({ cuando: "esta_semana" }, MIERCOLES)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(fechasDe({ cuando: "semana_que_viene" }, MIERCOLES)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(fechasDe({ cuando: "semana_que_viene" }, DOMINGO)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  });

  it("de lunes a miércoles: un jueves, los de la semana que viene; un lunes, desde hoy", () => {
    expect(fechasDe({ cuando: "rango", dia: "lunes", hasta: "miércoles" }, "2026-10-01")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(fechasDe({ cuando: "rango", dia: "lunes", hasta: "miércoles" }, "2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(fechasDe({ cuando: "rango", dia: "viernes", hasta: "domingo" }, MIERCOLES)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("lo que no se entiende, null", () => {
    expect(fechasDe({ cuando: "dia", dia: "el día de la marmota" }, MIERCOLES)).toBe(null);
    expect(fechasDe({ cuando: "algún día" }, MIERCOLES)).toBe(null);
    expect(fechasDe({}, MIERCOLES)).toBe(null);
  });
});
