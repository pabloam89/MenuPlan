// Una sola definición de bebé / niño / adolescente / adulto (etapaDe), y la app
// y el bot diciendo lo mismo sobre la misma persona.
//
// Antes había nueve: la app cortaba el bebé en ≤ 2 años y el bot en < 2; el bot
// ignoraba «ya come como un niño» (notBaby); «Amigo/a» iba al menú de los niños
// con 40 años; sin edad, una persona era a la vez niña y adulta para el horario
// del bot, y para la app tenía 30 años aunque su papel fuera «Bebé».
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as stages from "./stages.js";
import { memberIsBaby, tierForMember, hasChildMember, hasBabyMember } from "./groups.js";
import { esBebe as esBebeFicha } from "../../api/_bot/ficha.js";
import { esBebe as esBebeMenu, esMayor as esMayorMenu } from "../../api/_bot/menu.js";
import { personasDeEdad } from "../../api/_bot/ajustes.js";

const HOY = "2026-10-08T10:00:00Z";
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(HOY)); });
afterAll(() => { vi.useRealTimers(); });

// [descripción, persona, etapa esperada]
const CASOS = [
  ["0 años", { age: 0, homeRole: "Bebé" }, "bebe"],
  ["0 años escrito como texto", { age: "0", homeRole: "Bebé" }, "bebe"],
  ["1 año", { age: 1, homeRole: "Bebé" }, "bebe"],
  ["2 años", { age: 2, homeRole: "Bebé" }, "bebe"],
  ["2 años con papel de hijo", { age: 2, homeRole: "Hijo/a" }, "bebe"],
  ["3 años", { age: 3, homeRole: "Hijo/a" }, "nino"],
  ["3 años con papel de bebé", { age: 3, homeRole: "Bebé" }, "nino"],
  ["11 años", { age: 11, homeRole: "Hijo/a" }, "nino"],
  ["12 años", { age: 12, homeRole: "Hijo/a" }, "adolescente"],
  ["17 años", { age: 17, homeRole: "Hijo/a" }, "adolescente"],
  ["18 años", { age: 18, homeRole: "Hijo/a" }, "adulto"],
  ["40 años", { age: 40, homeRole: "Papá" }, "adulto"],
  ["1 año, ya come como un niño", { age: 1, homeRole: "Bebé", notBaby: true }, "nino"],
  ["sin edad, ya come como un niño", { homeRole: "Bebé", notBaby: true }, "nino"],
  ["Amigo/a de 40", { age: 40, homeRole: "Amigo/a" }, "adulto"],
  ["Amigo/a de 8", { age: 8, homeRole: "Amigo/a" }, "nino"],
  ["sin edad: Bebé", { homeRole: "Bebé" }, "bebe"],
  ["sin edad: bebé escrito a mano", { homeRole: "bebé" }, "bebe"],
  ["sin edad: Hijo/a", { homeRole: "Hijo/a" }, "nino"],
  ["sin edad: Adulto", { homeRole: "Adulto" }, "adulto"],
  ["sin edad: Papá", { homeRole: "Papá" }, "adulto"],
  ["sin edad: Mamá", { homeRole: "Mamá" }, "adulto"],
  ["sin edad: Abuelo/a", { homeRole: "Abuelo/a" }, "adulto"],
  ["sin edad: Amigo/a", { homeRole: "Amigo/a" }, "desconocida"],
  ["sin edad: Otro", { homeRole: "Otro" }, "desconocida"],
  ["sin edad ni papel", {}, "desconocida"],
  // Fecha de nacimiento: cumple 2 mañana → aún tiene 1.
  ["nacido el 9-10-2024", { useBirthDate: true, birthDate: "2024-10-09", age: 30 }, "bebe"],
  ["nacido el 8-10-2023 (cumple 3 hoy)", { useBirthDate: true, birthDate: "2023-10-08", homeRole: "Bebé" }, "nino"],
  ["fecha guardada pero sin usar", { useBirthDate: false, birthDate: "2025-01-01", age: 40 }, "adulto"],
  ["fecha inválida: manda la edad", { useBirthDate: true, birthDate: "no", age: 1 }, "bebe"],
];

const TIER = { bebe: "baby", nino: "child", adolescente: "child", adulto: "adult", desconocida: "adult" };
const MENOR = new Set(["bebe", "nino", "adolescente"]);

describe("etapaDe", () => {
  it.each(CASOS)("%s → %s", (_, persona, etapa) => {
    expect(stages.etapaDe?.(persona)?.etapa).toBe(etapa);
  });

  it("dice de dónde sale: fecha, edad, papel o nada", () => {
    expect(stages.etapaDe?.({ useBirthDate: true, birthDate: "2024-10-09" })).toEqual({ etapa: "bebe", edad: 1, fuente: "fechaNacimiento" });
    expect(stages.etapaDe?.({ age: 8 })).toEqual({ etapa: "nino", edad: 8, fuente: "edad" });
    expect(stages.etapaDe?.({ homeRole: "Bebé" })).toEqual({ etapa: "bebe", edad: null, fuente: "papel" });
    expect(stages.etapaDe?.({ homeRole: "Amigo/a" })).toEqual({ etapa: "desconocida", edad: null, fuente: "ninguna" });
  });

  it("cuenta desde el `hoy` que le den, no desde el reloj", () => {
    const vega = { useBirthDate: true, birthDate: "2023-10-08" };
    expect(stages.etapaDe?.(vega, { hoy: "2026-10-07" })?.etapa).toBe("bebe");
    expect(stages.etapaDe?.(vega, { hoy: new Date("2026-10-08T12:00:00Z") })?.etapa).toBe("nino");
  });

  it("los cortes salen de STAGES, la tabla de la app", () => {
    expect(stages.etapaDe?.({ age: stages.STAGES.baby.range[1] })?.etapa).toBe("bebe");
    expect(stages.etapaDe?.({ age: stages.STAGES.infantil.range[0] })?.etapa).toBe("nino");
    expect(stages.etapaDe?.({ age: stages.STAGES.secundaria.range[0] })?.etapa).toBe("adolescente");
    expect(stages.etapaDe?.({ age: stages.STAGES.adulto.range[0] })?.etapa).toBe("adulto");
  });
});

describe("la app y el bot dicen lo mismo de cada persona", () => {
  it.each(CASOS)("%s", (_, persona, etapa) => {
    const m = { id: "x", name: "X", ...persona };
    const bebe = etapa === "bebe";
    expect({
      memberIsBaby: memberIsBaby(m),
      hasBabyMember: hasBabyMember([m]),
      fichaEsBebe: esBebeFicha(m),
      menuEsBebe: esBebeMenu(m),
      tier: tierForMember(m),
      hasChildMember: hasChildMember([m]),
      menuEsMayor: esMayorMenu(m),
      horarioNinos: personasDeEdad([m], "ninos").length === 1,
      horarioAdultos: personasDeEdad([m], "adultos").length === 1,
    }).toEqual({
      memberIsBaby: bebe,
      hasBabyMember: bebe,
      fichaEsBebe: bebe,
      menuEsBebe: bebe,
      tier: TIER[etapa],
      hasChildMember: TIER[etapa] === "child",
      menuEsMayor: TIER[etapa] === "adult",
      horarioNinos: MENOR.has(etapa),
      horarioAdultos: !MENOR.has(etapa),
    });
  });

  it("nadie cae en dos grupos a la vez (ni en ninguno)", () => {
    for (const [, persona] of CASOS) {
      const m = { id: "x", name: "X", ...persona };
      const enHorario = ["ninos", "adultos"].filter((q) => personasDeEdad([m], q).length);
      expect(enHorario).toHaveLength(1);
      const enMenu = [esBebeMenu(m), esMayorMenu(m), !esBebeMenu(m) && !esMayorMenu(m)].filter(Boolean);
      expect(enMenu).toHaveLength(1);
    }
  });
});
