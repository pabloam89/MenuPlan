import { describe, expect, it } from "vitest";
import { ESTADO_EJE, ejesDeCasa } from "./ejesDeCasa.js";
import { estadosDeFichas } from "./estadoDeDato.js";
import { TEMAS } from "./caminos.js";
import { ETAPAS_BEBE } from "./babyStage.js";

const { SABIDO, SUPUESTO, FALTA, NO_APLICA } = ESTADO_EJE;
const delaCasa = (campo, estado, extra = {}) => ({ campo, sujeto: { tipo: "casa", id: null }, ambito: null, estado, valor: null, origen: null, ...extra });
const dePersona = (campo, id, estado, extra = {}) => ({ ...delaCasa(campo, estado, extra), sujeto: { tipo: "persona", id } });
const ficha = (...datos) => estadosDeFichas({ casa: datos });
const DICHO = { origen: "dicho", valor: "x", confirmado_at: "2026-11-01T10:00:00Z" };

describe("ejesDeCasa (trozo 64)", () => {
  it("sin ficha no se sabe qué falta: null, no todo vacío", () => {
    expect(ejesDeCasa({ estados: null })).toBeNull();
  });

  it("da un estado para cada eje de los temas", () => {
    const r = ejesDeCasa({ estados: ficha() });
    expect(Object.keys(r).sort()).toEqual([...new Set(TEMAS.flatMap((t) => t.ejes.map((e) => e.dato)))].sort());
  });

  it("del sobre: lo dicho se sabe, lo supuesto se dice y lo vacío o por defecto falta", () => {
    const r = ejesDeCasa({ estados: ficha(delaCasa("mealStructure", "dicho", DICHO), delaCasa("cookLevel", "supuesto", { origen: "supuesto", valor: "x" }), delaCasa("kitchenTools", "vacio"), delaCasa("pantryMode", "por_defecto", { origen: "por_defecto", valor: "x" })) });
    expect(r).toMatchObject({ mealStructure: SABIDO, cookLevel: SUPUESTO, kitchenTools: FALTA, pantryMode: FALTA });
  });

  it("un dato de persona falta si falta a alguien", () => {
    const estados = ficha(dePersona("colegio", "a", "dicho", DICHO), dePersona("colegio", "b", "vacio"));
    expect(ejesDeCasa({ estados, personas: ["a", "b"] }).colegio).toBe(FALTA);
    expect(ejesDeCasa({ estados, personas: ["a"] }).colegio).toBe(SABIDO);
  });

  it("sin personas, un dato de persona falta", () => {
    expect(ejesDeCasa({ estados: ficha(), personas: [] }).colegio).toBe(FALTA);
  });

  it("un hueco dicho cuenta aunque la base siga vacía", () => {
    const estados = ficha(delaCasa("menuWeekDays", "vacio"), delaCasa("menuWeekDays", "dicho", { ...DICHO, ambito: { semana: "2026-11-02" } }));
    expect(ejesDeCasa({ estados }).menuWeekDays).toBe(SABIDO);
  });

  it("de la libreta: con apuntes se sabe, todos supuestos se dice y sin apuntes falta", () => {
    const dicho = { valor: 1, origen: "texto", fuente: "dicho" };
    const supuesto = { valor: 1, origen: "default", fuente: "supuesto" };
    const r = ejesDeCasa({ estados: ficha(), data: { notepad: { campos: { "cocina.italiana": dicho, "base.pescado": supuesto } } } });
    expect(r).toMatchObject({ cocinas: SABIDO, sesgos: SUPUESTO, reparto: FALTA });
  });

  it("basta un supuesto para decirlo, venga del sobre o de la libreta", () => {
    const dicho = { valor: 1, origen: "texto", fuente: "dicho" };
    const supuesto = { valor: 1, origen: "default", fuente: "supuesto" };
    expect(ejesDeCasa({ estados: ficha(), data: { notepad: { campos: { "cocina.a": dicho, "cocina.b": supuesto } } } }).cocinas).toBe(SUPUESTO);
  });

  it("presupuesto: «sin presupuesto» es una respuesta; no decir nada, no", () => {
    expect(ejesDeCasa({ estados: ficha(), data: { presupuesto: null } }).presupuesto).toBe(SABIDO);
    expect(ejesDeCasa({ estados: ficha(), data: {} }).presupuesto).toBe(FALTA);
  });

  it("del documento: con valor se sabe; vacío, falta", () => {
    expect(ejesDeCasa({ estados: ficha(), data: { cookTime: { Lun: 30 } } }).cookTime).toBe(SABIDO);
    expect(ejesDeCasa({ estados: ficha(), data: { cookTime: {} } }).cookTime).toBe(FALTA);
  });

  it("la etapa del bebé solo cuenta con bebé", () => {
    expect(ejesDeCasa({ estados: ficha(), hayBebe: false }).etapaBebe).toBe(NO_APLICA);
    expect(ejesDeCasa({ estados: ficha(), hayBebe: true, data: {} }).etapaBebe).toBe(FALTA);
    expect(ejesDeCasa({ estados: ficha(), hayBebe: true, data: { etapaBebe: ETAPAS_BEBE[0] } }).etapaBebe).toBe(SABIDO);
    expect(ejesDeCasa({ estados: ficha(), hayBebe: true, data: { etapaBebe: "no_es_una_etapa" } }).etapaBebe).toBe(FALTA);
  });
});
