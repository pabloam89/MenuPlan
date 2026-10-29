import { describe, it, expect } from "vitest";
import { fechasDe, fechaDe, fechasDeLista, fechaConMenu, diaDeSemana, diasDeLaSemana, buscarPersona, personasDe, dudaDePersona, cantidadDe, vecesDe, grupoDePersonas } from "./interprete.js";

// El lunes 26 de octubre de 2026; el jueves 29; el viernes 30.
const LUNES = "2026-10-26";
const JUEVES = "2026-10-29";
const VIERNES = "2026-10-30";
const f = (texto, hoy, op = {}) => fechasDe(texto, { hoy, ...op });

describe("fechasDe: lo que diría una persona (#958)", () => {
  it("hoy, mañana, pasado mañana, esta noche", () => {
    expect(f("hoy", LUNES).fechas).toEqual([LUNES]);
    expect(f("esta noche", LUNES).fechas).toEqual([LUNES]);
    expect(f("mañana", LUNES).fechas).toEqual(["2026-10-27"]);
    expect(f("pasado mañana", LUNES).fechas).toEqual(["2026-10-28"]);
  });

  it("un día suelto es el próximo, hoy incluido", () => {
    expect(f("el jueves", LUNES).fechas).toEqual([JUEVES]);
    expect(f("jueves", JUEVES).fechas).toEqual([JUEVES]);
    expect(f("el miércoles", JUEVES).fechas).toEqual(["2026-11-04"]);
  });

  it("«el viernes de la semana que viene» es el de la semana siguiente, no este (#958)", () => {
    expect(f("el viernes de la semana que viene", LUNES).fechas).toEqual(["2026-11-06"]);
    expect(f("el viernes de la que viene", LUNES).fechas).toEqual(["2026-11-06"]);
    expect(f("viernes de la próxima semana", LUNES).fechas).toEqual(["2026-11-06"]);
    expect(f("el viernes", LUNES, { semana: "siguiente" }).fechas).toEqual(["2026-11-06"]);
  });

  it("«el jueves que viene» es el próximo sin contar hoy", () => {
    expect(f("el jueves que viene", LUNES).fechas).toEqual([JUEVES]);
    expect(f("el jueves que viene", JUEVES).fechas).toEqual(["2026-11-05"]);
    expect(f("el próximo jueves", JUEVES).fechas).toEqual(["2026-11-05"]);
  });

  it("«este jueves» ya pasado se pregunta, no se coge", () => {
    expect(f("este jueves", VIERNES).duda).toMatch(/ya ha pasado/);
  });

  it("«el 15» es el próximo día 15 (#958: antes, «No entiendo el día»)", () => {
    expect(f("el 15", LUNES).fechas).toEqual(["2026-11-15"]);
    expect(f("el día 28", LUNES).fechas).toEqual(["2026-10-28"]);
    expect(f("el 26", LUNES).fechas).toEqual([LUNES]);
    expect(f("el 31", "2026-11-02").duda).toBeTruthy(); // no hay 31 de noviembre
  });

  it("fechas con mes y en ISO", () => {
    expect(f("15 de noviembre", LUNES).fechas).toEqual(["2026-11-15"]);
    expect(f("3 de enero", LUNES).fechas).toEqual(["2027-01-03"]);
    expect(f("15/11", LUNES).fechas).toEqual(["2026-11-15"]);
    expect(f("2026-11-15", LUNES).fechas).toEqual(["2026-11-15"]);
    expect(f("2026-10-01", LUNES).duda).toMatch(/pasado/);
  });

  it("«el jueves 5» comprueba que cae en jueves", () => {
    expect(f("el jueves 5", LUNES).fechas).toEqual(["2026-11-05"]);
    expect(f("el jueves 6", LUNES).duda).toMatch(/no jueves/);
  });

  it("el finde y los rangos", () => {
    expect(f("el finde", LUNES).fechas).toEqual(["2026-10-31", "2026-11-01"]);
    expect(f("el fin de semana", LUNES).fechas).toEqual(["2026-10-31", "2026-11-01"]);
    expect(f("el finde de la semana que viene", LUNES).fechas).toEqual(["2026-11-07", "2026-11-08"]);
    expect(f("entre semana", JUEVES).fechas).toEqual([JUEVES, VIERNES]);
    expect(f("de lunes a jueves", LUNES).fechas).toEqual([LUNES, "2026-10-27", "2026-10-28", JUEVES]);
    expect(f("de lunes a miércoles de la semana que viene", LUNES).fechas).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(f("del 3 al 5", LUNES).fechas).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(f("la semana que viene", LUNES).fechas).toHaveLength(7);
  });

  it("lo que no se entiende es una pregunta, nunca un día inventado", () => {
    expect(f("cuando pueda", LUNES).duda).toMatch(/No entiendo/);
    expect(f("marzo", LUNES).duda).toBeTruthy();
    expect(fechaDe("el finde", { hoy: LUNES }).duda).toMatch(/varios días/);
    expect(fechasDeLista(["hoy", "el finde"], { hoy: LUNES }).fechas).toEqual([LUNES, "2026-10-31", "2026-11-01"]);
  });

  it("fechaConMenu no cae a un día pasado (#958: «cambia el jueves» un viernes)", () => {
    const soloEsta = (iso) => iso >= LUNES && iso <= "2026-11-01";
    const r = fechaConMenu("el jueves", soloEsta, { hoy: VIERNES });
    expect(r.duda).toMatch(/ya pasó/);
    expect(fechaConMenu("el sábado", soloEsta, { hoy: VIERNES }).fecha).toBe("2026-10-31");
  });
});

describe("días de la semana para lo que se repite", () => {
  it("nombres, abreviaturas y nada de «marzo»", () => {
    expect(diaDeSemana("el martes")).toBe("Mar");
    expect(diaDeSemana("mié.")).toBe("Mié");
    expect(diaDeSemana("los sábados")).toBeNull();
    expect(diasDeLaSemana("los sábados").dias).toEqual(["Sáb"]);
    expect(diaDeSemana("marzo")).toBeNull();
  });
  it("entre semana, finde, rangos y lo que no se entiende", () => {
    expect(diasDeLaSemana(["entre semana"]).dias).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie"]);
    expect(diasDeLaSemana("de lunes a jueves").dias).toEqual(["Lun", "Mar", "Mié", "Jue"]);
    expect(diasDeLaSemana(["finde", "lunes"]).dias).toEqual(["Lun", "Sáb", "Dom"]);
    expect(diasDeLaSemana([]).dias).toHaveLength(7);
    expect(diasDeLaSemana(["cuando llueve"]).malos).toEqual(["cuando llueve"]);
  });
});

describe("personas", () => {
  const data = {
    members: [
      { id: "a", name: "Natalia", age: 40 },
      { id: "b", name: "Natxo", age: 42 },
      { id: "c", name: "Leo", age: 6 },
      { id: "d", name: "Vera", age: 1 },
    ],
    accountMemberIdByUser: { u1: "b" },
  };
  it("«Nat» con Natalia y Natxo no elige: pregunta (#958)", () => {
    const r = buscarPersona(data, "Nat");
    expect(r.persona).toBeNull();
    expect(r.candidatas.map((p) => p.id)).toEqual(["a", "b"]);
    expect(dudaDePersona(data, "Nat")).toMatch(/Natalia o a Natxo/);
  });
  it("«yo» es la persona que la cuenta marcó en la app, no el nombre de Telegram (#958)", () => {
    expect(buscarPersona(data, "yo", { userId: "u1", autor: "Natalia" }).persona.id).toBe("b");
    expect(buscarPersona(data, "yo", { userId: "otro", autor: "Leo García" }).persona.id).toBe("c");
    expect(buscarPersona(data, "yo", { userId: "otro" }).duda).toMatch(/Quién eres/);
  });
  it("grupos: «niños», «los peques», «todos»", () => {
    expect(grupoDePersonas("los peques")).toBe("ninos");
    expect(grupoDePersonas("niños")).toBe("ninos");
    expect(personasDe(data, ["los peques"]).personas.map((p) => p.id)).toEqual(["c", "d"]);
    expect(personasDe(data, ["todos"]).personas).toHaveLength(4);
    const r = personasDe(data, ["Leo y Nat"]);
    expect(r.personas.map((p) => p.id)).toEqual(["c"]);
    expect(r.dudas[0]).toMatch(/Natalia o a Natxo/);
  });
});

describe("cantidades", () => {
  it("«menos de dos» y compañía", () => {
    expect(cantidadDe("menos de dos")).toEqual({ op: "<", n: 2 });
    expect(cantidadDe("como mucho 3 veces a la semana")).toEqual({ op: "<=", n: 3 });
    expect(cantidadDe("al menos una vez")).toEqual({ op: ">=", n: 1 });
    expect(cantidadDe("más de dos")).toEqual({ op: ">", n: 2 });
    expect(cantidadDe("dos veces")).toEqual({ op: "=", n: 2 });
    expect(cantidadDe("nunca")).toEqual({ op: "=", n: 0 });
    expect(cantidadDe("bastante")).toBeNull();
  });
  it("a veces por semana", () => {
    expect(vecesDe(cantidadDe("menos de dos"))).toBe(1);
    expect(vecesDe(cantidadDe("más de 7"))).toBe(7);
  });
});
