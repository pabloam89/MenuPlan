import { describe, it, expect } from "vitest";
import {
  DIAS,
  DIAS_LABORABLES,
  DIAS_FINDE,
  NOMBRES_DIA,
  DIA_LARGO,
  DIA_LARGO_MINUSCULAS,
  LETRAS_DIA,
  DIA_LETRA,
  SLUGS_DIA,
  DIA_SLUG,
  indiceDeFecha,
  indiceDeFechaUTC,
  indiceDeISO,
  diaDeFecha,
  diaDeISO,
  diaDeFechaUTC,
  indiceDeDia,
  diaDeIndice,
  slugDeDia,
  diaDeSlug,
  nombreDia,
  esLaborable,
  tipoDeComida,
  comidaDeTipo,
  huecoPlan,
  huecoMotor,
} from "./dias.js";
import { DIAS as DIAS_VOCAB } from "./vocabularios.js";
import { DAYS } from "./planner.js";

describe("dias.js: las listas", () => {
  it("DIAS es la de vocabularios.js (la misma, no una copia)", () => {
    expect(DIAS).toBe(DIAS_VOCAB);
    expect(DAYS).toBe(DIAS_VOCAB);
  });

  it("laborables y finde parten la semana", () => {
    expect(DIAS_LABORABLES).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie"]);
    expect(DIAS_FINDE).toEqual(["Sáb", "Dom"]);
    expect(esLaborable("Vie")).toBe(true);
    expect(esLaborable("Sáb")).toBe(false);
    expect(esLaborable("lunes")).toBe(false);
  });

  it("nombres, letras y slugs van en el orden de DIAS", () => {
    expect(NOMBRES_DIA).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
    expect(LETRAS_DIA).toEqual(["L", "M", "X", "J", "V", "S", "D"]);
    expect(SLUGS_DIA).toEqual(["lun", "mar", "mie", "jue", "vie", "sab", "dom"]);
    expect(DIA_LARGO["Mié"]).toBe("Miércoles");
    expect(DIA_LETRA["Mié"]).toBe("X");
    expect(DIA_SLUG["Sáb"]).toBe("sab");
    expect(DIA_LARGO_MINUSCULAS["Sáb"]).toBe("sábado");
  });

  it("todo en NFC, como se guarda", () => {
    for (const s of [...DIAS, ...NOMBRES_DIA]) expect(s).toBe(s.normalize("NFC"));
  });
});

describe("dias.js: de fecha a día (lunes = 0)", () => {
  it("indiceDeFecha usa la hora local", () => {
    expect(indiceDeFecha(new Date(2026, 9, 5))).toBe(0); // lunes 5 oct 2026
    expect(indiceDeFecha(new Date(2026, 9, 11, 23, 59))).toBe(6); // domingo
    expect(diaDeFecha(new Date(2026, 9, 8))).toBe("Jue");
  });

  it("indiceDeFechaUTC y las fechas ISO usan UTC", () => {
    expect(indiceDeFechaUTC(new Date(Date.UTC(2026, 9, 4, 12)))).toBe(6); // domingo
    expect(indiceDeISO("2026-10-05")).toBe(0);
    expect(indiceDeISO("2026-10-11")).toBe(6);
    expect(diaDeISO("2026-10-08")).toBe("Jue");
    expect(diaDeISO("2026-10-10")).toBe("Sáb");
    expect(diaDeFechaUTC(new Date(Date.UTC(2026, 9, 4, 23, 30)))).toBe("Dom");
  });
});

describe("dias.js: día ↔ índice, slug y nombre", () => {
  it("índice", () => {
    expect(indiceDeDia("Lun")).toBe(0);
    expect(indiceDeDia("Dom")).toBe(6);
    expect(indiceDeDia("Lunes")).toBe(-1);
    expect(diaDeIndice(2)).toBe("Mié");
    expect(diaDeIndice(7)).toBe(null);
  });

  it("slug ida y vuelta", () => {
    for (const d of DIAS) expect(diaDeSlug(slugDeDia(d))).toBe(d);
    expect(slugDeDia("Lunes")).toBe(null);
    expect(diaDeSlug("mié")).toBe(null);
  });

  it("nombre largo, con o sin mayúscula; lo desconocido sale tal cual", () => {
    expect(nombreDia("Mié")).toBe("Miércoles");
    expect(nombreDia("Sáb", { minusculas: true })).toBe("sábado");
    expect(nombreDia("Otro")).toBe("Otro");
  });
});

describe("dias.js: comida ↔ mealType del motor", () => {
  it("el motor solo planifica comida y cena", () => {
    expect(tipoDeComida("Comida")).toBe("comida");
    expect(tipoDeComida("Cena")).toBe("cena");
    expect(tipoDeComida("cena")).toBe("cena");
    expect(comidaDeTipo("cena")).toBe("Cena");
    expect(comidaDeTipo("comida")).toBe("Comida");
  });
});

describe("dias.js: claves de hueco", () => {
  it("huecoPlan es el de ids.js: «Lun-Comida»", () => {
    expect(huecoPlan.formatear("Lun", "Comida")).toBe("Lun-Comida");
    expect(huecoPlan.leer("Mié-Cena")).toEqual({ dia: "Mié", comida: "Cena" });
  });

  it("huecoMotor: «lun_comida_1», «lun_cena»", () => {
    expect(huecoMotor.formatear("Lun", "comida", 1)).toBe("lun_comida_1");
    expect(huecoMotor.formatear("Mié", "cena")).toBe("mie_cena");
    expect(huecoMotor.formatear("Sáb", "cena", "2")).toBe("sab_cena_2");
    expect(huecoMotor.leer("mie_comida_2")).toEqual({ dia: "Mié", slug: "mie", tipo: "comida", posicion: "2" });
    expect(huecoMotor.leer("dom_cena")).toEqual({ dia: "Dom", slug: "dom", tipo: "cena", posicion: null });
    expect(huecoMotor.leer("xyz_cena")).toBe(null);
    expect(huecoMotor.leer("")).toBe(null);
    expect(huecoMotor.leer(null)).toBe(null);
  });

  it("huecoMotor ida y vuelta, y de motor a plan", () => {
    for (const d of DIAS) {
      for (const [t, p] of [["comida", "1"], ["comida", "2"], ["cena", null], ["cena", "1"]]) {
        const h = huecoMotor.leer(huecoMotor.formatear(d, t, p));
        expect(h).toEqual({ dia: d, slug: slugDeDia(d), tipo: t, posicion: p });
      }
    }
    expect(huecoMotor.aPlan("jue_cena_1")).toBe("Jue-Cena");
    expect(huecoMotor.aPlan("lun_comida_2")).toBe("Lun-Comida");
    expect(huecoMotor.aPlan("nada")).toBe(null);
  });
});
