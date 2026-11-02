// Señales que olvidan (plan fichas con estado, trozo 15): de las filas de senal a las preferencias vistas.
import { describe, it, expect } from "vitest";
import { vistasDeSenales, UMBRAL_APRENDIDO } from "./senales.js";
import { apunteDeFila } from "./preferencias.js";

const senal = (eje, valor, peso, extra = {}) => ({ user_id: null, eje, valor, peso, ...extra });
// Una preferencia como la devuelve preferencias_de_casa: la que el sistema aprendió (vista, canal sistema).
const aprendida = (eje, valor, operador, extra = {}) => ({
  id: `p-${eje}-${valor}-${operador}`, persona_id: null, grupo_id: null, plan_id: null, nivel: "plato", eje, medida: "valor",
  operador, valor, cantidad: 1, fuerza: "bajo", dias: null, comidas: null, semanas: null, desde: null, hasta: null,
  origen: "visto", canal: "sistema", rechazada_at: null, confirmado_at: null, updated_at: "2026-11-02T08:00:00Z", ...extra,
});

describe("senales: lo que pasa el umbral se aprende como preferencia vista", () => {
  it("una señal de la casa por encima del umbral pide una preferencia vista, blanda, que la libreta lee como sesgo visto", () => {
    const [fila, ...resto] = vistasDeSenales([senal("tecnica", "horno", UMBRAL_APRENDIDO)], []);
    expect(resto).toEqual([]);
    expect(fila).toMatchObject({ nivel: "plato", eje: "tecnica", medida: "valor", operador: "mas", valor: "horno", cantidad: 1, fuerza: "bajo", origen: "visto", grupo_id: null });
    // Lo que el motor y Lola leen de esa fila, una vez guardada.
    expect(apunteDeFila({ ...aprendida("tecnica", "horno", "mas"), ...fila })).toEqual(["tecnica.horno", expect.objectContaining({ valor: 1, fuente: "visto" })]);
  });

  it("negativa, «menos»; por debajo del umbral, nada; y en un eje sí/no, el valor sí", () => {
    expect(vistasDeSenales([senal("cocina", "china", -UMBRAL_APRENDIDO - 0.5)], [])).toEqual([expect.objectContaining({ operador: "menos", valor: "china", cantidad: 1 })]);
    expect(vistasDeSenales([senal("cocina", "china", UMBRAL_APRENDIDO - 0.01), senal("cocina", "india", "-2.99")], [])).toEqual([]);
    expect(vistasDeSenales([senal("llevaSalsa", true, "4.2")], [])).toEqual([expect.objectContaining({ eje: "llevaSalsa", valor: true, operador: "mas" })]);
  });

  it("solo aprende de la casa y en los campos que aprenden: ni las señales de una cuenta (el Trato) ni otros ejes", () => {
    expect(vistasDeSenales([senal("tecnica", "horno", 9, { user_id: "u1" }), senal("subtipoIngrediente", "queso", 9), senal("composicion", "pescado", 9)], [])).toEqual([]);
  });

  it("un peso que no es un número falla en alto: no se lee como cero", () => {
    expect(() => vistasDeSenales([senal("tecnica", "horno", "mucho")], [])).toThrow(/peso ilegible/);
  });
});

describe("senales: lo aprendido se retira cuando deja de verse", () => {
  it("si ya está aprendida y la señal sigue arriba, no se pide nada (cada pasada puede repetirse)", () => {
    expect(vistasDeSenales([senal("tecnica", "horno", 5)], [aprendida("tecnica", "horno", "mas")])).toEqual([]);
  });

  it("si la señal bajó del umbral (el olvido de la noche) o ya no está, se borra como visto", () => {
    const pref = aprendida("tecnica", "horno", "mas");
    expect(vistasDeSenales([senal("tecnica", "horno", 2.9)], [pref])).toEqual([{ id: pref.id, borrar: true, origen: "visto" }]);
    expect(vistasDeSenales([], [pref])).toEqual([{ id: pref.id, borrar: true, origen: "visto" }]);
  });

  it("si la señal cambia de sentido, se borra la de antes y se aprende la otra", () => {
    const pref = aprendida("cocina", "india", "mas");
    expect(vistasDeSenales([senal("cocina", "india", -4)], [pref])).toEqual([
      { id: pref.id, borrar: true, origen: "visto" },
      expect.objectContaining({ eje: "cocina", valor: "india", operador: "menos", origen: "visto" }),
    ]);
  });
});

describe("senales: lo que dice la familia manda", () => {
  it("con algo dicho, de Lola o de una regla sobre el mismo eje y valor, no se aprende nada y lo aprendido se retira", () => {
    const aprendidaVieja = aprendida("tecnica", "horno", "mas");
    const dichas = [
      aprendida("tecnica", "horno", "menos", { id: "d1", origen: "dicho", canal: "telegram" }),
      aprendida("tecnica", "horno", "mas", { id: "d2", origen: "visto", canal: "telegram" }),
      aprendida("tecnica", "horno", "menos", { id: "d3", origen: "dicho", canal: "app", dias: ["Lun"] }),
    ];
    for (const d of dichas) {
      expect(vistasDeSenales([senal("tecnica", "horno", 8)], [d]), d.id).toEqual([]);
      expect(vistasDeSenales([senal("tecnica", "horno", 8)], [aprendidaVieja, d]), d.id).toEqual([{ id: aprendidaVieja.id, borrar: true, origen: "visto" }]);
    }
  });

  it("lo aprendido que la familia rechazó no se toca ni se vuelve a aprender", () => {
    const rechazada = aprendida("tecnica", "horno", "mas", { rechazada_at: "2026-11-01T10:00:00Z" });
    expect(vistasDeSenales([senal("tecnica", "horno", 8)], [rechazada])).toEqual([]);
    expect(vistasDeSenales([], [rechazada])).toEqual([]);
  });

  it("nunca pide borrar nada que no sea una aprendida (visto, del sistema, de la casa entera)", () => {
    const ajenas = [
      aprendida("tecnica", "horno", "mas", { id: "a1", origen: "dicho" }),
      aprendida("tecnica", "frito", "mas", { id: "a2", canal: "telegram" }),
      aprendida("tecnica", "vapor", "mas", { id: "a3", grupo_id: "g1" }),
      aprendida("cocina", "china", "mas", { id: "a4", persona_id: "p1" }),
    ];
    expect(vistasDeSenales([], ajenas)).toEqual([]);
  });
});
