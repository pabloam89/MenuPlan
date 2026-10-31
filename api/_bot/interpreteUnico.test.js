// Un solo intérprete de fechas y personas (trozo 27 de #1037).
//
// La guardia de interprete.guard.test.js caza los analizadores escritos a
// mano (regex de días, nombres comparados a mano). Esta caza lo que se le
// escapaba: juntar piezas del intérprete en una regla propia fuera de él.
// Así eran `diaDe` y `resolverDia` (menu.js), que decidían entre el día de la
// semana y la fecha, o entre esta semana y la próxima, con su lógica; y
// `resolverPersona` (estadoCasa.js), que redactaba su propia pregunta cuando
// no encontraba a alguien. Ahora esas reglas viven en interprete.js
// (`diaDe`, `fechaDelMenu`, `dudaDePersona`) y fuera solo se llaman.
//
//   1. Días: ningún fichero fuera del intérprete usa a la vez `diaDeSemana`
//      (¿es un día de la semana?) y `fechaDe`/`fechaConMenu` (¿qué fecha
//      es?): eso es decidir entre los dos, y lo decide `diaDe` o `fechaDelMenu`.
//   2. Personas: ningún fichero fuera del intérprete mira las `candidatas` de
//      `buscarPersona` para redactar la duda: la pregunta sale de `dudaDePersona`.

import { describe, it, expect, vi } from "vitest";
import { recuento } from "./interprete.guard.test.js";
import { resolverDia } from "./menu.js";
import { resolverPersona } from "./estadoCasa.js";
import { diaDe, fechaDelMenu, dudaDePersona } from "./interprete.js";

const usa = (re) => Object.keys(recuento(re));

describe("un solo intérprete: fuera de interprete.js no se juntan sus piezas en una regla propia", () => {
  it("días: nadie decide entre «día de la semana» y «fecha» por su cuenta", () => {
    const diaSemana = new Set(usa(/\bdiaDeSemana\(/));
    const fecha = usa(/\b(fechaDe|fechaConMenu)\(/);
    expect(fecha.filter((f) => diaSemana.has(f)), "Usa diaDe o fechaDelMenu de interprete.js").toEqual([]);
  });

  it("personas: nadie redacta su propia duda con las candidatas de buscarPersona", () => {
    expect(usa(/\w\??\.candidatas\b/),"La pregunta sale de dudaDePersona (interprete.js)").toEqual([]);
  });
});

describe("los tres que entendían por su cuenta, ahora llaman al intérprete", () => {
  // Miércoles 30 sep 2026; el menú tiene esta semana y la siguiente.
  const hoy = "2026-09-30";
  const semanas = [{ weekStart: "2026-09-28", weekEnd: "2026-10-04" }, { weekStart: "2026-10-05", weekEnd: "2026-10-11" }];
  const tiene = (f) => semanas.some((w) => w.weekStart <= f && f <= w.weekEnd);

  it("diaDe vive en el intérprete: el día de la semana, o el de una fecha", () => {
    expect(diaDe("el jueves", { hoy })).toBe("Jue");
    expect(diaDe("mañana", { hoy })).toBe("Jue");
    expect(diaDe("marzo", { hoy })).toBe(null);
  });

  it("resolverDia da la fecha de fechaDelMenu, para leer y para escribir", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T21:30:00Z"));
    try {
      const casa = { semanas: semanas.map((w) => ({ ...w, plan: {}, shopping: {} })) };
      for (const [texto, semana, escribe] of [["lunes", null, false], ["lunes", "esta", false], ["viernes", "siguiente", false], ["jueves", null, true], ["hoy", null, true]]) {
        const r = fechaDelMenu(texto, tiene, { hoy, semana, escribe });
        expect(resolverDia(casa, texto, semana, { escribe }).fecha, `${texto} ${semana} ${escribe}`).toBe(r.fecha);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("fechaDelMenu: para leer vale un día de esta semana que ya pasó; para escribir, no", () => {
    expect(fechaDelMenu("lunes", tiene, { hoy, semana: "esta" })).toEqual({ fecha: "2026-09-28" });
    expect(fechaDelMenu("lunes", tiene, { hoy })).toEqual({ fecha: "2026-10-05" });
    expect(fechaDelMenu("lunes", (f) => f < "2026-10-01", { hoy })).toEqual({ fecha: "2026-09-28" });
    expect(fechaDelMenu("lunes", (f) => f < "2026-10-01", { hoy, escribe: true })).toHaveProperty("duda");
  });

  it("resolverPersona pregunta con las palabras del intérprete", () => {
    const data = { members: [{ id: "a", name: "Ana López" }, { id: "b", name: "Ana Ruiz" }] };
    expect(resolverPersona(data, "Ana").error).toBe(dudaDePersona(data, "Ana"));
    expect(resolverPersona(data, "Mario").error).toBe(dudaDePersona(data, "Mario"));
    expect(resolverPersona(data, "ana ruiz").persona).toEqual({ id: "b", nombre: "Ana Ruiz" });
  });
});
