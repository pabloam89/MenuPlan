// #931: el lunes 26, con un menú que solo cubría el domingo 25, Lola contestó
// «Hoy, 25 de octubre, de comida tenéis judías». Ahora el estado del menú es
// un vocabulario cerrado que leen la ficha y la vía rápida, y «no hay menú»
// lo dice el código, sin modelo.
import { describe, it, expect } from "vitest";
import { ESTADOS_MENU, estadoDelMenu, lineaEstadoMenu } from "./estadoMenu.js";
import { sinMenuPara } from "./rapido.js";

const SOLO_EL_DOMINGO_25 = [{ weekStart: "2026-10-25", weekEnd: "2026-10-25" }];
const DEL_26_AL_1 = [{ weekStart: "2026-10-26", weekEnd: "2026-11-01" }];

describe("estadoDelMenu: si hay menú para un día, en valores cerrados", () => {
  it("el caso real: lunes 26 con un menú que acabó el domingo 25 → ya_paso", () => {
    expect(estadoDelMenu(SOLO_EL_DOMINGO_25, "2026-10-26")).toEqual({ dia: "2026-10-26", estado: "ya_paso", ultimoDia: "2026-10-25", proximoDia: null });
  });
  it("dentro de la semana → si; antes de que empiece → despues; sin menús → ninguno", () => {
    expect(estadoDelMenu(DEL_26_AL_1, "2026-10-28").estado).toBe("si");
    expect(estadoDelMenu(DEL_26_AL_1, "2026-10-24")).toMatchObject({ estado: "despues", proximoDia: "2026-10-26" });
    expect(estadoDelMenu([], "2026-10-26").estado).toBe("ninguno");
  });
  it("solo devuelve valores del vocabulario", () => {
    for (const [s, d] of [[SOLO_EL_DOMINGO_25, "2026-10-26"], [DEL_26_AL_1, "2026-10-28"], [DEL_26_AL_1, "2026-10-01"], [[], "2026-10-26"]]) {
      expect(ESTADOS_MENU).toContain(estadoDelMenu(s, d).estado);
    }
  });
  it("la línea de la ficha lleva los cuatro campos con nombre fijo", () => {
    expect(lineaEstadoMenu(estadoDelMenu(SOLO_EL_DOMINGO_25, "2026-10-26"))).toBe(
      "ESTADO DEL MENÚ (manda sobre la charla): hoy=2026-10-26 · menu_hoy=ya_paso · ultimo_dia_con_menu=2026-10-25 · proximo_dia_con_menu=ninguno",
    );
  });
});

describe("sinMenuPara: la vía rápida dice «no hay menú» sin modelo", () => {
  it("el caso real: «¿qué tengo para comer?» el lunes 26", () => {
    const r = sinMenuPara(SOLO_EL_DOMINGO_25, ["2026-10-26"], "2026-10-26");
    expect(r.texto).toBe("Para hoy no hay menú. El último que teníais acababa el domingo 25 de octubre.\n\n¿Te preparo el menú de esta semana?\n[[Prepárame el menú de esta semana]]\n[[Ahora no]]");
    expect(r.texto).not.toMatch(/25 de octubre, de comida|tenéis:/);
  });
  it("sin botón de la app: no hay nada que ver (#935)", () => {
    expect(sinMenuPara(SOLO_EL_DOMINGO_25, ["2026-10-26"], "2026-10-26").ir).toBeNull();
  });
  it("un día de la semana que viene ofrece esa semana; más allá, no ofrece nada", () => {
    expect(sinMenuPara([], ["2026-11-03"], "2026-10-26").texto).toMatch(/de la semana que viene\?/);
    expect(sinMenuPara([], ["2026-11-20"], "2026-10-26").texto).not.toMatch(/Prepárame/);
  });
  it("si el menú empieza más tarde, dice cuándo y no ofrece generar", () => {
    const r = sinMenuPara(DEL_26_AL_1, ["2026-10-24"], "2026-10-24");
    expect(r.texto).toBe("Para hoy no hay menú. El menú empieza el lunes 26 de octubre.");
  });
  it("varios días: «Del … al …»", () => {
    expect(sinMenuPara([], ["2026-10-31", "2026-11-01"], "2026-10-26").texto).toMatch(/^Del 31 de octubre al 1 de noviembre no hay menú\. Todavía no tenéis ninguno\./);
  });
});
