import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { aplicarExtras, aplicarSemana } from "./ajustes.js";
import { diasDeLaSemana } from "./interprete.js";

const diasDichos = (dias) => diasDeLaSemana(dias).dias;
import { EXTRAS } from "../../src/lib/extras.js";
import { ESTADO } from "./resultado.js";
import { resolveModeData } from "../../src/lib/prepararGeneracion.js";

// Lo que el asistente de la app pregunta y Lola no podía decir (#939):
// desayuno, merienda y postre, y qué días y cuánta variedad lleva el menú.
const conNino = { members: [{ id: "a", name: "Ana", age: 40 }, { id: "b", name: "Leo", age: 6 }] };

describe("ajustar_extras", () => {
  it("guarda solo valores de su lista y deja lo demás como estaba", () => {
    const r = aplicarExtras({ ...conNino, extraMeals: { postre: "cena" } }, { desayuno: "variado", merienda: "laborables", postreTipo: "pastel" });
    expect(r.data.extraMeals).toMatchObject({ desayuno: "variado", merienda: "laborables", postre: "cena", postreTipo: "inmediato" });
    expect(r.texto).toMatch(/desayuno variado.*merienda de lunes a viernes/);
  });

  it("avisa si piden merienda y no hay niños, que es para quien se planifica", () => {
    const r = aplicarExtras({ members: [{ id: "a", age: 40 }] }, { merienda: "semana" });
    expect(r.texto).toMatch(/solo se planifica para los niños/);
  });

  it("nada válido, nada que guardar", () => {
    expect(aplicarExtras(conNino, { desayuno: "a veces" }).data).toBeUndefined();
  });

  it("el modo básico ya no apaga lo que la casa ha pedido", () => {
    const d = resolveModeData({ expertMode: false, extraMeals: { desayuno: "variado", postre: "ambas" }, menuVarietyPref: "relaxed" });
    expect(d.extraMeals).toMatchObject({ desayuno: "variado", postre: "ambas" });
    expect(d.menuVarietyPref).toBe("relaxed");
  });

  it("las opciones del asistente de la app son las de la lista", () => {
    const app = readFileSync(new URL("../../src/screens/Onboarding.jsx", import.meta.url), "utf8");
    const idsDe = (nombre) => [...app.slice(app.indexOf(`const ${nombre} = [`), app.indexOf("];", app.indexOf(`const ${nombre} = [`))).matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
    for (const id of idsDe("DESAYUNO_OPTS")) expect(EXTRAS.desayuno).toContain(id);
    for (const id of idsDe("MERIENDA_OPTS")) expect(EXTRAS.merienda).toContain(id);
  });
});

describe("ajustar_semana", () => {
  it("los días dichos, como en ajustar_horario", () => {
    expect(diasDichos(["entre semana"])).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie"]);
    // En el orden de la semana (el intérprete, #958).
    expect(diasDichos(["finde", "lunes"])).toEqual(["Lun", "Sáb", "Dom"]);
  });

  it("deja la semana con esos días y recalcula lo que deriva de ellos", () => {
    const r = aplicarSemana({ menuWeekOffsets: [0] }, { semana: "siguiente", dias: ["entre semana"] }, { hoyIdx: 0 });
    const dias = Object.values(r.data.menuWeekDays);
    expect(dias).toContainEqual(["Lun", "Mar", "Mié", "Jue", "Vie"]);
    expect(r.data.menuWeekOffsets).toContain(1);
    expect(r.texto).toMatch(/la semana que viene: lunes/);
  });

  // #958: con ningún día entendido contestaba «Guardado (esta semana: )».
  it("un día que no se entiende no se tira callado: nada guardado, y dicho", () => {
    const r = aplicarSemana({ menuWeekOffsets: [0] }, { dias: ["el puente"] }, { hoyIdx: 0 });
    expect(r.data).toBeUndefined();
    expect(r.texto).not.toMatch(/Guardado/);
    expect(r.resultado.estado).toBe(ESTADO.NADA);
    expect(r.resultado.sinHacer).toEqual([{ que: "el puente", motivo: "no sé qué días son: que los diga uno a uno" }]);
  });

  it("con un día sin entender no deja la semana a medias", () => {
    const r = aplicarSemana({ menuWeekOffsets: [0] }, { dias: ["lunes", "el puente"] }, { hoyIdx: 0 });
    expect(r.data).toBeUndefined();
    expect(r.resultado.sinHacer.map((s) => s.que)).toEqual(["el puente", "lunes"]);
  });

  it("lo guardado sale en el recibo", () => {
    const r = aplicarSemana({ menuWeekOffsets: [0] }, { semana: "siguiente", dias: ["entre semana"] }, { hoyIdx: 0 });
    expect(r.resultado.estado).toBe(ESTADO.HECHO);
    expect(r.resultado.hecho).toEqual(["la semana que viene: lunes, martes, miércoles, jueves, viernes"]);
  });

  it("la variedad, de su lista", () => {
    expect(aplicarSemana({}, { variedad: "moderate" }).data.menuVarietyPref).toBe("moderate");
    expect(aplicarSemana({}, { variedad: "muchísima" }).data).toBeUndefined();
  });
});
