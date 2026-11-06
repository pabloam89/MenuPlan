import { describe, it, expect } from "vitest";
import { sellarCambios, sobreDelMotor, porQueElPlato, QUIEN_PUSO } from "./sobreHueco.js";
import { textoDe } from "./cumplimiento.js";
import { semanaVivaPorGuardar } from "./menuArchive.js";
import { CANAL_DATO, CANALES_DATO } from "./vocabularios.js";

const delMotor = sobreDelMotor("2026-11-02", ["base.pescado"]);
const aMano = { canal: CANAL_DATO.APP, cuando: "2026-11-03T10:00:00.000Z", quien: "u1" };
const viejo = {
  _warnings: [],
  g1: {
    "Lun-Comida": { recipeId: "merluza", sobre: delMotor },
    "Lun-Cena": { recipeId: "tortilla", sobre: delMotor },
  },
};

describe("el sobre de cada hueco (trozo 18)", () => {
  it("un plato cambiado lleva quién, cuándo y por dónde; el que no cambió conserva el suyo", () => {
    // La app cambia el plato copiando el hueco: arrastra el sobre del motor, que ya no vale.
    const nuevo = { ...viejo, g1: { ...viejo.g1, "Lun-Cena": { ...viejo.g1["Lun-Cena"], recipeId: "crema" } } };
    const sellado = sellarCambios(viejo, nuevo, aMano);
    expect(sellado.g1["Lun-Cena"].sobre).toEqual(aMano);
    expect(sellado.g1["Lun-Comida"].sobre).toBe(delMotor);
    expect(sellado._warnings).toBe(viejo._warnings);
  });

  it("un hueco nuevo también; el que trae su propio sobre (el motor al generar) no se pisa", () => {
    const otro = sobreDelMotor("2026-11-03", []);
    const nuevo = { g1: { ...viejo.g1, "Mar-Comida": { recipeId: "lentejas" }, "Lun-Cena": { recipeId: "crema", sobre: otro } } };
    const sellado = sellarCambios(viejo, nuevo, aMano);
    expect(sellado.g1["Mar-Comida"].sobre).toEqual(aMano);
    expect(sellado.g1["Lun-Cena"].sobre).toBe(otro);
  });

  it("el sobre viejo copiado (el plan vuelve de la base sin compartir objetos) tampoco vale para el plato nuevo", () => {
    const deLaBase = structuredClone(viejo);
    const nuevo = { g1: { ...deLaBase.g1, "Lun-Cena": { ...deLaBase.g1["Lun-Cena"], recipeId: "crema" } } };
    expect(sellarCambios(viejo, nuevo, aMano).g1["Lun-Cena"].sobre).toEqual(aMano);
  });

  it("sin cambios devuelve el mismo plan: quien compara no entra en bucle", () => {
    expect(sellarCambios(viejo, viejo, aMano)).toBe(viejo);
    const sellado = sellarCambios(viejo, { g1: { ...viejo.g1, "Lun-Cena": { recipeId: "crema" } } }, aMano);
    expect(sellarCambios(sellado, sellado, { ...aMano, cuando: "otra hora" })).toBe(sellado);
  });

  it("el motor sin preferencias que pidan el plato no deja motivo vacío", () => {
    expect(sobreDelMotor("2026-11-02", [])).toEqual({ canal: CANAL_DATO.SISTEMA, cuando: "2026-11-02" });
  });

  it("al guardar la semana de la app, el plato cambiado sale sellado y la vuelta siguiente no guarda nada", () => {
    const menus = { m: { id: "m", weeks: { "2026-11-02": { offset: 0, startISO: "2026-11-02", endISO: "2026-11-08", plan: viejo, shopping: { items: [] } } } } };
    const editado = { ...viejo, g1: { ...viejo.g1, "Lun-Cena": { ...viejo.g1["Lun-Cena"], recipeId: "crema" } } };
    const r = semanaVivaPorGuardar(menus, "m", 0, editado, { items: [] }, aMano);
    expect(r.week.plan.g1["Lun-Cena"].sobre).toEqual(aMano);
    expect(semanaVivaPorGuardar(r.menus, "m", 0, r.week.plan, { items: [] }, { ...aMano, cuando: "luego" })).toBeNull();
  });

  it("por qué está un plato: quién, cuándo y, si fue el motor, lo que lo pidió", () => {
    const prefs = [{ id: "base.pescado", campo: "base", valor: "pescado", operador: "mas", cantidad: null }];
    expect(porQueElPlato({ sobre: delMotor }, prefs, textoDe)).toBe("Lo puso el menú automático (2026-11-02). Lo pidió lo que hay apuntado en la casa: más pescado.");
    expect(porQueElPlato({ sobre: sobreDelMotor("2026-11-02", []) }, prefs, textoDe)).toMatch(/Ninguna preferencia de la casa lo pedía/);
    expect(porQueElPlato({ sobre: delMotor }, [], textoDe)).toMatch(/una preferencia que ya no está/);
    expect(porQueElPlato({ sobre: aMano }, prefs, textoDe)).toBe("Lo puso alguien de casa, a mano en la app (2026-11-03).");
    expect(porQueElPlato({ recipeId: "x" }, prefs, textoDe)).toMatch(/No está apuntado quién lo puso/);
  });

  it("hay quién lo puso para cada canal", () => {
    expect(Object.keys(QUIEN_PUSO).sort()).toEqual([...CANALES_DATO].sort());
  });
});
