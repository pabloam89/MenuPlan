// La Rutina con ámbito (trozo 13): de los sobres por hueco de ficha_casa a los mapas de data, y de un cambio de
// esos mapas a los datos de la operación, con una sola regla de clave para todos los campos con ámbito.
import { describe, it, expect } from "vitest";
import { rutinaDeFichas, datosDeCambio, claveEnData, huecoDeClave, CAMPOS_CON_AMBITO, familiaDeData } from "./rutina.js";
import { DatoInvalido } from "./escribirDato.js";
import { slotKey } from "./planner.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";

const P = "a1b2c3d4-0000-4000-8000-000000000001";
const G = "g-peques";
/** Un elemento de «fichas» de ficha_casa (0116): la base de un campo con ámbito, o un sobre de un hueco. */
const base = (campo, persona = null) => ({ campo, sujeto: { tipo: persona ? "persona" : "casa", id: persona }, ambito: null, estado: "vacio", valor: null, origen: null });
const hueco = (campo, ambito, valor, persona = null) => ({ ...base(campo, persona), ambito, estado: "dicho", valor, origen: "dicho" });

describe("rutinaDeFichas: los sobres por hueco, en la forma de data", () => {
  it("quién come dónde: un hueco dicho por persona, día y comida, con la clave de slotKey; lo no dicho no sale", () => {
    const r = rutinaDeFichas([
      base("schedule", P), hueco("schedule", { dia: "Lun", comida: "Comida" }, "fuera", P), hueco("schedule", { dia: "Mar", comida: "Cena" }, "cole", P),
    ]);
    expect(r.schedule).toEqual({ [slotKey(P, "Lun", "Comida")]: "fuera", [slotKey(P, "Mar", "Cena")]: "cole" });
  });

  it("cada campo con su ámbito: el hueco por día y comida, la semana por su lunes y el grupo por su id", () => {
    const r = rutinaDeFichas([
      base("slotType"), hueco("slotType", { dia: "Vie", comida: "Cena" }, "rapida"),
      base("menuWeekDays"), hueco("menuWeekDays", { semana: "2026-11-02" }, ["Lun", "Mar"]),
      base("mealStructureByGroup"), hueco("mealStructureByGroup", { grupo_id: G }, "1_plato"),
    ]);
    expect(r).toEqual({ slotType: { "Vie|Cena": "rapida" }, menuWeekDays: { "2026-11-02": ["Lun", "Mar"] }, mealStructureByGroup: { [G]: "1_plato" } });
  });

  it("la base dice que el campo está aunque nadie haya dicho nada; un hueco vaciado (valor null) no sale", () => {
    const r = rutinaDeFichas([base("schedule", P), hueco("schedule", { dia: "Lun", comida: "Comida" }, null, P)]);
    expect(r).toEqual({ schedule: {} });
  });

  it("plan B: sin el campo en la ficha, o con elementos sin «ambito» (la 0116 sin aplicar), no sale y sigue en el documento", () => {
    expect(rutinaDeFichas([])).toEqual({});
    const antesDeLa0116 = { campo: "schedule", sujeto: { tipo: "persona", id: P }, estado: "dicho", valor: "fuera", origen: "dicho" };
    expect(rutinaDeFichas([antesDeLa0116, hueco("slotType", { dia: "Lun", comida: "Comida" }, "unico")])).toEqual({ slotType: { "Lun|Comida": "unico" } });
  });

  it("un ámbito que no es el del campo lanza: un horario mal leído no es un horario vacío", () => {
    expect(() => rutinaDeFichas([hueco("schedule", { dia: "Lun" }, "fuera", P)])).toThrow(/va por dia, comida/);
    expect(() => rutinaDeFichas([hueco("slotType", { dia: "Lun", comida: "Comida", semana: "2026-11-02" }, "unico")])).toThrow(/va por dia, comida/);
  });

  it("lo que no tiene ámbito no lo toca", () => {
    expect(rutinaDeFichas([{ campo: "meals", sujeto: { tipo: "casa", id: null }, ambito: null, estado: "dicho", valor: ["Cena"], origen: "dicho" }])).toEqual({});
  });
});

describe("datosDeCambio: de un cambio del mapa, un dato por hueco que cambia", () => {
  it("lo cambiado y lo quitado, cada uno con su hueco; lo que sigue igual no va", () => {
    const antes = { [slotKey(P, "Lun", "Comida")]: "fuera", [slotKey(P, "Mar", "Comida")]: "cole", [slotKey(P, "Mié", "Cena")]: "tupper" };
    const despues = { [slotKey(P, "Lun", "Comida")]: "casa", [slotKey(P, "Mié", "Cena")]: "tupper" };
    expect(datosDeCambio("schedule", antes, despues, { origen: "dicho" })).toEqual([
      { campo: "schedule", persona_id: P, dia: "Lun", comida: "Comida", valor: "casa", origen: "dicho" },
      { campo: "schedule", persona_id: P, dia: "Mar", comida: "Comida", valor: null, origen: "dicho" },
    ]);
  });

  it("lo escrito se lee igual: el mapa de después sale de los sobres de sus datos", () => {
    const despues = { "Lun|Comida": "unico", "Vie|Cena": "rapida" };
    const datos = datosDeCambio("slotType", {}, despues, { origen: "dicho" });
    const { campo: _c, persona_id: _p, valor, origen, ...ambito } = datos[0];
    expect(Object.keys(ambito)).toEqual(["dia", "comida"]);
    const comoFicha = datos.map(({ campo, persona_id, valor: v, origen: _o, ...a }) => hueco(campo, a, v, persona_id));
    expect(rutinaDeFichas([base("slotType"), ...comoFicha]).slotType).toEqual(despues);
    expect([valor, origen]).toEqual(["unico", "dicho"]);
  });

  it("una clave o un valor que no cuadran con el registro no se proponen", () => {
    expect(() => datosDeCambio("schedule", {}, { [`${P}|Lunes|Comida`]: "casa" }, { origen: "dicho" })).toThrow(DatoInvalido);
    expect(() => datosDeCambio("schedule", {}, { [`${P}|Lun`]: "casa" }, { origen: "dicho" })).toThrow(DatoInvalido);
    expect(() => datosDeCambio("schedule", {}, { [slotKey(P, "Lun", "Comida")]: "en_la_luna" }, { origen: "dicho" })).toThrow(DatoInvalido);
    // La semana va por su lunes: el 3 de noviembre de 2026 es martes.
    expect(() => datosDeCambio("menuWeekDays", {}, { "2026-11-03": ["Mar"] }, { origen: "dicho" })).toThrow(/lunes/);
    expect(() => datosDeCambio("meals", {}, { x: ["Cena"] }, { origen: "dicho" })).toThrow(DatoInvalido);
  });
});

describe("una regla de clave para todos los campos con ámbito", () => {
  it("los campos con ámbito salen del registro, y la clave de cada uno vuelve a su hueco", () => {
    expect(Object.keys(CAMPOS_CON_AMBITO).length).toBeGreaterThan(0);
    for (const [campo, dims] of Object.entries(CAMPOS_CON_AMBITO)) {
      expect(dims, campo).toEqual(REGISTRO_CAMPOS[campo].ambito);
      const h = { ...(REGISTRO_CAMPOS[campo].por === "persona" ? { persona_id: P } : {}), grupo_id: G, semana: "2026-11-02", dia: "Jue", comida: "Comida" };
      const clave = claveEnData(campo, h);
      expect(claveEnData(campo, huecoDeClave(campo, clave)), campo).toBe(clave);
    }
  });
});

describe("datosDeCambio con la familia que queda", () => {
  const familia = { personas: [P], grupos: [] };
  it("quitar los huecos de una persona o un grupo que ya no están no se escribe (su sobre se fue con ellos)", () => {
    expect(datosDeCambio("schedule", { [`${P}|Lun|Comida`]: "fuera", "ida|Lun|Comida": "cole" }, {}, { origen: "dicho", familia }))
      .toEqual([{ campo: "schedule", persona_id: P, dia: "Lun", comida: "Comida", valor: null, origen: "dicho" }]);
    expect(datosDeCambio("mealStructureByGroup", { [G]: "1_plato" }, {}, { origen: "dicho", familia })).toEqual([]);
  });
  it("un hueco con valor de quien no está sí sale: la base lo rechaza, no se tira en silencio", () => {
    expect(datosDeCambio("schedule", {}, { "ida|Lun|Comida": "cole" }, { origen: "dicho", familia })).toHaveLength(1);
  });
  it("familiaDeData: los ids de members y groups", () => {
    expect(familiaDeData({ members: [{ id: 1 }], groups: [{ id: G }] })).toEqual({ personas: ["1"], grupos: [G] });
    expect(familiaDeData({})).toEqual({ personas: [], grupos: [] });
  });
});
