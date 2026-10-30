import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// El motor planifica SOLO los días de la semana pedida (#1029, trozo 4 de #1037).
//
// Una semana de viernes a domingo (data.menuWeek = { offset: 0, startDayIdx: 4 })
// guardaba huecos de lunes a jueves: el recorte a los días pedidos solo se hacía
// al pintar. Aquí se prueba que los huecos, el presupuesto del reparto, las
// comidas extra y la copia niños←adultos respetan esos días.

import { buildGroupContext, generateMenuWithAI } from "./aiPlanner.js";
import { DAYS, diasActivosDe, weeklySlotBudget } from "./planner.js";
import { getWeekDatesByMenuWeek, getWeekDatesFromStartISO } from "./weekCalendar.js";

const VIERNES = { offset: 0, startDayIdx: 4, days: null };
const FINDE_LARGO = ["Vie", "Sáb", "Dom"];
const ENTRE_SEMANA = ["Lun", "Mar", "Mié", "Jue"];

const casa = (extra = {}) => {
  const group = { id: "g1", label: "Familia", memberIds: ["m1"] };
  return {
    group,
    data: { members: [{ id: "m1", age: 35 }], allergiesReviewed: true, groups: [group], schedule: {}, ...extra },
  };
};

const diasDeLosHuecos = (ctx) => [...new Set(ctx.slots.map((s) => s.day))];

describe("diasActivosDe", () => {
  it("sin menuWeek son los siete días, como siempre", () => {
    expect(diasActivosDe({})).toEqual([...DAYS]);
    expect(diasActivosDe(null)).toEqual([...DAYS]);
    expect(diasActivosDe({ menuWeek: null })).toEqual([...DAYS]);
  });

  it("en la semana en curso empieza en el día pedido", () => {
    expect(diasActivosDe({ menuWeek: VIERNES })).toEqual(FINDE_LARGO);
    expect(diasActivosDe({ menuWeek: { offset: 0, startDayIdx: 6 } })).toEqual(["Dom"]);
  });

  it("la semana que viene entera aunque hoy sea viernes, y los días sueltos mandan", () => {
    expect(diasActivosDe({ menuWeek: { offset: 1, startDayIdx: 4 } })).toEqual([...DAYS]);
    expect(diasActivosDe({ menuWeek: { offset: 0, startDayIdx: 4, days: ["Mar", "Lun"] } })).toEqual(["Lun", "Mar"]);
  });

  it("un inicio fuera de rango o un día desconocido se lanzan, en vez de planificar otra semana en silencio", () => {
    expect(() => diasActivosDe({ menuWeek: { offset: 0, startDayIdx: 7 } })).toThrow(/startDayIdx fuera de 0\.\.6: 7/);
    expect(() => diasActivosDe({ menuWeek: { offset: 0, startDayIdx: -1 } })).toThrow(TypeError);
    expect(() => diasActivosDe({ menuWeek: { offset: 0, startDayIdx: 4, days: ["vie", "Viernes"] } })).toThrow(/días desconocidos: vie, Viernes/);
    // Y quien pinta la semana lanza lo mismo: no hay una regla para pintar y otra para planificar.
    expect(() => getWeekDatesByMenuWeek({ offset: 0, startDayIdx: 7 })).toThrow(TypeError);
  });

  it("una tilde descompuesta (NFD, de una semana archivada antigua) es el mismo día, no uno desconocido", () => {
    const nfd = ["Mié", "Sáb"].map((d) => d.normalize("NFD"));
    expect(nfd[0]).not.toBe("Mié");
    expect(diasActivosDe({ menuWeek: { offset: 0, startDayIdx: 0, days: nfd } })).toEqual(["Mié", "Sáb"]);
    expect(getWeekDatesFromStartISO("2026-10-26", 0, nfd).activeDays).toEqual(["Mié", "Sáb"]);
  });

  it("dice lo mismo que getWeekDatesByMenuWeek, que es quien pinta la semana", () => {
    const semanas = [
      undefined, {}, VIERNES, { offset: 0, startDayIdx: 0 }, { offset: 0, startDayIdx: 6 },
      { offset: 1, startDayIdx: 3 }, { offset: 2 }, { offset: 0, startDayIdx: 2, days: ["Jue", "Sáb"] },
    ];
    for (const menuWeek of semanas) {
      expect(diasActivosDe({ menuWeek }), JSON.stringify(menuWeek)).toEqual(getWeekDatesByMenuWeek(menuWeek).activeDays);
    }
  });
});

describe("buildGroupContext: los huecos son solo de los días pedidos", () => {
  it("una semana de viernes solo crea huecos de Vie, Sáb y Dom", () => {
    const { group, data } = casa({ menuWeek: VIERNES });
    const ctx = buildGroupContext(data, group);
    expect(diasDeLosHuecos(ctx)).toEqual(FINDE_LARGO);
    expect(ctx.slots.length).toBeGreaterThan(0);
    for (const s of ctx.slots) expect(s.slotId).toMatch(/^(vie|sab|dom)_/);
  });

  it("sin menuWeek siguen saliendo los siete días", () => {
    const { group, data } = casa();
    expect(diasDeLosHuecos(buildGroupContext(data, group))).toEqual([...DAYS]);
  });

  it("un menú ad hoc de dos días en una semana de viernes dura Vie y Sáb, no un lunes que ya pasó", () => {
    const { data } = casa({ menuWeek: VIERNES });
    const adhoc = { id: "ga", label: "Dieta blanda", memberIds: ["m1"], adHoc: true, tipo: "adhoc", days: 2 };
    data.groups = [adhoc];
    expect(diasDeLosHuecos(buildGroupContext(data, adhoc))).toEqual(["Vie", "Sáb"]);
    // Y sin semana pedida, como hasta ahora: los dos primeros de la semana.
    delete data.menuWeek;
    expect(diasDeLosHuecos(buildGroupContext(data, adhoc))).toEqual(["Lun", "Mar"]);
  });
});

describe("weeklySlotBudget: el presupuesto del reparto cuenta solo los días pedidos", () => {
  it("una semana de viernes tiene tres días de comida y tres de cena", () => {
    const { group, data } = casa({ menuWeek: VIERNES });
    const viernes = weeklySlotBudget(data, group);
    expect(viernes.comidaDays).toBe(3);
    expect(viernes.cenaDays).toBe(3);
    // 3 comidas de dos platos + 3 cenas de uno, con la estructura por defecto.
    expect(viernes.total).toBe(3 * 2 + 3);
  });

  it("sin menuWeek son los siete días y el total guarda la proporción", () => {
    const { group, data } = casa();
    const entera = weeklySlotBudget(data, group);
    expect(entera.comidaDays).toBe(7);
    expect(entera.cenaDays).toBe(7);
    const viernes = weeklySlotBudget({ ...data, menuWeek: VIERNES }, group);
    expect(viernes.total).toBeLessThan(entera.total);
    expect(viernes.total * 7).toBe(entera.total * 3);
    // Lo que cuenta el presupuesto es lo que crea el motor, hueco a hueco.
    expect(buildGroupContext({ ...data, menuWeek: VIERNES }, group).slots.length).toBe(viernes.total);
  });
});

describe("generateMenuWithAI con el solver: el plan guardado no tiene días de más", () => {
  // Sin reloj ni azar: la semilla del solver sale de Date.now() y su tope de
  // tiempo compara con Date.now(); la rotación de las comidas extra, de
  // Math.random(). Con la fecha fija y el azar fijo el resultado es siempre el
  // mismo (lo que se afirma es la estructura del plan, no un plato concreto).
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-30T12:00:00Z")); });
  afterAll(() => vi.useRealTimers());
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("una semana de viernes con adultos, niños y comidas extra solo guarda Vie, Sáb y Dom", async () => {
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const adults = { id: "ga", label: "Adultos", memberIds: ["a1"] };
    const kids = { id: "gk", label: "Niños", memberIds: ["k1"] };
    const data = {
      members: [{ id: "a1", age: 40 }, { id: "k1", age: 8 }],
      allergiesReviewed: true, groups: [adults, kids], schedule: {},
      // Mediodía en familia (se copia de los adultos), cena aparte (se genera).
      kidDinnerConfig: { byMember: { k1: { weekdayLunch: "together", dinner: "different", weekend: "together" } } },
      extraMeals: { desayuno: "variado", merienda: "laborables", postre: "cena" },
      menuWeek: VIERNES,
    };
    const { plan } = await generateMenuWithAI(data);
    for (const [gid, huecos] of Object.entries(plan)) {
      if (gid.startsWith("_")) continue; // `_warnings` y demás metadatos del plan
      const claves = Object.keys(huecos).filter((k) => !k.startsWith("_"));
      expect(claves.length, gid).toBeGreaterThan(0);
      const fuera = claves.filter((k) => ENTRE_SEMANA.includes(k.split("-")[0]));
      expect(fuera, `${gid} guarda huecos de días que no se pidieron`).toEqual([]);
    }
    expect(plan.ga["Vie-Comida"]).toBeTruthy();
    expect(plan.ga["Dom-Cena"]).toBeTruthy();
    expect(plan.ga["Vie-Desayuno"]).toBeTruthy();
    expect(plan.ga["Vie-Postre"]).toBeTruthy();
    // La merienda de laborables en una semana de viernes es solo la del viernes.
    expect(plan.gk["Vie-Merienda"]).toBeTruthy();
    expect(plan.gk["Sáb-Merienda"]).toBeUndefined();
    // El niño copia la comida de los adultos del viernes, no la de un lunes inexistente.
    expect(plan.gk["Vie-Comida"]?.fromAdultLunch).toBe(true);
  }, 120000);
});
