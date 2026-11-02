// Señales que olvidan (plan fichas con estado, trozo 15): de las filas de senal a las preferencias vistas.
import { describe, it, expect } from "vitest";
import { vistasDeSenales, valoresDelPlato, senalesDeCambio, senalesDePlato, senalesDeLaApp, MAX_SENALES_APP, UMBRAL_APRENDIDO } from "./senales.js";
import { apunteDeFila, valorIdDelEje } from "./preferencias.js";
import { CAMPOS_POR_ID } from "./notepadFields.js";
import { sesgoScoreBoost } from "./sesgos.js";
import { catalogToFrontendRecipe } from "./aiPlanner.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { MOTIVO_CAMBIO } from "./rastro.js";

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

describe("senales: lo que cuenta un cambio de plato", () => {
  it("los valores de un plato son justo los que su sesgo sube (sesgoScoreBoost), en todo el catálogo tal como lo da el motor", () => {
    const distintos = [];
    let suben = 0;
    for (const r of recipeCatalog.map((c) => catalogToFrontendRecipe(c, 2))) {
      const tiene = new Set(valoresDelPlato(r).map((x) => `${x.eje}|${valorIdDelEje(x.valor)}`));
      for (const campo of ["base", "tecnica", "salsa"]) {
        const { eje, dominio } = CAMPOS_POR_ID[campo];
        for (const v of dominio) {
          const sube = sesgoScoreBoost(r, { [campo]: { [v]: 1 } }) > 0;
          suben += sube;
          if (tiene.has(`${eje}|${v}`) !== sube) distintos.push(`${r.id} ${campo}.${v}`);
        }
      }
      // La cocina la mira la puerta de cocinas (r.cocina), no el sesgo.
      expect(tiene.has(`cocina|${r.cocina}`), r.id).toBe(CAMPOS_POR_ID.cocina.dominio.includes(r.cocina));
    }
    expect(distintos).toEqual([]);
    expect(suben).toBeGreaterThan(200);
  });

  const sale = { mainBase: "arroz", tecnica: "horno", llevaSalsa: true };
  const entra = { mainBase: "pasta", tecnica: "horno", cocina: "italiana" };

  it("lo que sale baja y, si lo eligió alguien de la casa, lo que entra sube; lo que tienen los dos se anula", () => {
    expect(senalesDeCambio({ sale, entra, motivo: MOTIVO_CAMBIO.PEDIDO })).toEqual([
      { eje: "basePrincipal", valor: "arroz", delta: -1 },
      { eje: "llevaSalsa", valor: true, delta: -1 },
      { eje: "basePrincipal", valor: "pasta", delta: 1 },
      { eje: "cocina", valor: "italiana", delta: 1 },
    ]);
    expect(senalesDeCambio({ sale: null, entra, motivo: MOTIVO_CAMBIO.ELECCION })).toHaveLength(3);
  });

  it("si el que entra lo eligió el motor («cámbialo», «elige tú»), solo baja lo que sale", () => {
    for (const motivo of [MOTIVO_CAMBIO.OTRO, MOTIVO_CAMBIO.ELIGE_TU]) {
      expect(senalesDeCambio({ sale, entra, motivo }).map((x) => x.delta), motivo).toEqual([-1, -1, -1]);
    }
  });

  it("un valor que el campo no tiene en su dominio no cuenta (una técnica o una cocina que no existen)", () => {
    expect(valoresDelPlato({ tecnica: "a_la_brasa", cocina: "marciana", mainBase: "arroz" })).toEqual([{ eje: "basePrincipal", valor: "arroz" }]);
  });

  it("un motivo que no es de MOTIVO_CAMBIO lanza", () => {
    expect(() => senalesDeCambio({ sale, entra, motivo: "porque_si" })).toThrow(/MOTIVO_CAMBIO/);
  });
});

describe("senales: lo que manda la app", () => {
  it("un voto o un descarte: el mismo delta para cada valor del plato", () => {
    expect(senalesDePlato({ mainBase: "arroz", tecnica: "horno" }, -1)).toEqual([
      { eje: "basePrincipal", valor: "arroz", delta: -1 }, { eje: "tecnica", valor: "horno", delta: -1 },
    ]);
    expect(senalesDePlato(null, 1)).toEqual([]);
  });

  it("lo que manda la app se comprueba entero: eje que aprende, valor de su dominio con su tipo, +1 o −1, y un tope", () => {
    const buenas = senalesDeCambio({ sale: { mainBase: "arroz", llevaSalsa: true }, entra: { cocina: "india" }, motivo: MOTIVO_CAMBIO.MANUAL });
    expect(senalesDeLaApp(buenas)).toEqual(buenas);
    const malas = [
      [], "no", Array.from({ length: MAX_SENALES_APP + 1 }, () => buenas[0]),
      [{ eje: "subtipoIngrediente", valor: "queso", delta: 1 }], [{ eje: "cocina", valor: "marciana", delta: 1 }],
      [{ eje: "llevaSalsa", valor: "si", delta: 1 }], [{ eje: "tecnica", valor: "horno", delta: 5 }], [null],
    ];
    for (const m of malas) expect(() => senalesDeLaApp(m), JSON.stringify(m)?.slice(0, 80)).toThrow();
  });
});
