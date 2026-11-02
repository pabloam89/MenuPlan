import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import { entradaDelMotor, esEntrada, comoEntrada, VERSION_ENTRADA } from "./entradaMotor.js";
import { generateMenuWithAI } from "./aiPlanner.js";
import { PESO_SESGO } from "./sesgos.js";
import { PESO_RECIENTE, PESO_PRESUPUESTO } from "./solver.js";

// La entrada del motor (trozo 30 de #1037): la casa de una semana compilada una
// vez en el problema que lee el motor.

const pareja = {
  members: [{ id: "m1", name: "A", age: 38 }, { id: "m2", name: "B", age: 40 }],
  allergiesReviewed: true,
  groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
  meals: ["Comida", "Cena"],
  // Mié a mediodía B come fuera: ese hueco es para uno.
  schedule: { "m2|Mié|Comida": "fuera" },
  cookTime: { mode: "split", weekday: { Comida: 30, Cena: 20 }, weekend: { Comida: 90, Cena: 45 } },
  freqs: { legumbres: 2, verdura: 3, pescado: 2 },
  sesgos: { tecnica: { horno: 1 } },
  favoritos: ["queso"],
};

describe("entradaDelMotor: la casa compilada", () => {
  it("trae los huecos día × comida × grupo × plato, con quién come en cada uno", () => {
    const e = entradaDelMotor(pareja);
    const lunes = e.huecos.filter((h) => h.dia === "Lun");
    expect(lunes.map((h) => [h.grupo, h.comida, h.plato, h.comensales])).toEqual([
      ["g1", "Comida", "primero", 2],
      ["g1", "Comida", "segundo", 2],
      ["g1", "Cena", "cena", 2],
    ]);
    expect(e.huecos.filter((h) => h.dia === "Mié" && h.comida === "Comida").map((h) => h.comensales)).toEqual([1, 1]);
  });

  it("guarda los minutos de cocina por día y comida, y cada hueco lleva los suyos", () => {
    const e = entradaDelMotor(pareja);
    expect(e.tiempo.Lun).toEqual({ Comida: 30, Cena: 20 });
    expect(e.tiempo.Sáb).toEqual({ Comida: 90, Cena: 45 });
    const tope = (slotId) => e.contexto.g1.slots.find((s) => s.slotId === slotId).maxTime;
    expect([tope("lun_comida_1"), tope("lun_cena"), tope("sab_comida_1"), tope("sab_cena")]).toEqual([30, 20, 90, 45]);
  });

  it("dice cada objetivo con el peso con que lo cuenta el motor y el dato del que sale", () => {
    const e = entradaDelMotor({ ...pareja, presupuesto: 80 });
    const { sesgos, favoritos, recientes, presupuesto } = e.objetivos;
    expect([sesgos.valor, sesgos.peso, sesgos.origen]).toEqual([pareja.sesgos, PESO_SESGO, "sesgos"]);
    expect([favoritos.valor, favoritos.peso, favoritos.origen]).toEqual([["queso"], PESO_SESGO, "favoritos"]);
    expect([recientes.peso, recientes.origen, Object.keys(recientes.valor)]).toEqual([PESO_RECIENTE, "menus", ["g1"]]);
    expect([presupuesto.valor, presupuesto.peso, presupuesto.origen]).toEqual([80, PESO_PRESUPUESTO, "presupuesto"]);
  });

  it("lleva su versión, se congela y solo es entrada lo que sale de ella", () => {
    const e = entradaDelMotor(pareja, { hoy: "2026-11-02" });
    expect([e.version, e.hoy, Object.isFrozen(e)]).toEqual([VERSION_ENTRADA, "2026-11-02", true]);
    expect(esEntrada(e)).toBe(true);
    expect(esEntrada({ ...e })).toBe(false);
    expect(comoEntrada(e)).toBe(e);
  });
});

describe("paridad: la casa en crudo y su entrada dan el mismo menú", () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-02T10:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  // Math.random con semilla: el sorteo de desayunos y postres, reproducible.
  const conSemilla = (semilla) => {
    let s = semilla >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  };
  const generar = async (x) => {
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    vi.spyOn(Math, "random").mockImplementation(conSemilla(7));
    const res = await generateMenuWithAI(x);
    vi.restoreAllMocks();
    return res;
  };

  it("misma casa y misma semilla, por `data` y por `entradaDelMotor(data)`", async () => {
    const casa = { ...pareja, extraMeals: { desayuno: "variado", postre: "cena" }, slotType: { "Jue|Cena": "rapida" } };
    const porData = await generar(structuredClone(casa));
    const porEntrada = await generar(entradaDelMotor(structuredClone(casa)));
    expect(porEntrada).toEqual(porData);
    expect(Object.keys(porData.plan.g1).length).toBeGreaterThan(10);
  }, 120000);
});
