import { describe, it, expect } from "vitest";
import {
  TOTAL, PRESUPUESTO, normalizar, repartoPorDefecto, mover,
  repartoAFreqs, freqsAReparto, freqsEfectivos, rutaDeReparto,
  repartoVisible, repartoConFreq,
} from "./reparto.js";
import { DEFAULT_FREQS } from "./aiPlanner.js";
import { FAMILIAS } from "./notepadFields.js";

const suma = (r) => FAMILIAS.reduce((a, f) => a + r[f], 0);

describe("no tocar nada genera el menú de siempre", () => {
  // La propiedad que sostiene todo el eje: si esto se rompe, un cambio de
  // redondeo habría movido en silencio el menú de todo el mundo.
  it("el reparto por defecto proyecta exactamente a DEFAULT_FREQS", () => {
    expect(repartoAFreqs(repartoPorDefecto())).toEqual(DEFAULT_FREQS);
  });

  it("y el camino de vuelta desde DEFAULT_FREQS da el mismo reparto", () => {
    expect(freqsAReparto(DEFAULT_FREQS)).toEqual(repartoPorDefecto());
  });

  it("unos freqs sin guardar caen al default", () => {
    expect(repartoAFreqs(freqsAReparto(undefined))).toEqual(DEFAULT_FREQS);
  });

  it("el presupuesto es la suma de los máximos de siempre, no los 21 huecos", () => {
    expect(PRESUPUESTO).toBe(14);
  });
});

describe("la suma siempre es 100", () => {
  it("en el default", () => {
    expect(suma(repartoPorDefecto())).toBe(TOTAL);
  });

  it("con pesos cualesquiera", () => {
    for (const bruto of [
      { carne: 1 },
      { carne: 7, pescado: 3, verdura: 1 },
      { carne: 1, pescado: 1, legumbres: 1, pasta_arroz: 1, huevos: 1, verdura: 1 },
      { carne: 0.5, pescado: 0.5, legumbres: 0.5, pasta_arroz: 0.5, huevos: 0.5, verdura: 0.5 },
    ]) {
      expect(suma(normalizar(bruto))).toBe(TOTAL);
    }
  });

  it("tras cualquier movimiento, en cualquier familia, a cualquier valor", () => {
    let r = repartoPorDefecto();
    for (const f of FAMILIAS) {
      for (const v of [0, 1, 17, 50, 83, 99, 100]) {
        r = mover(r, f, v);
        expect(suma(r)).toBe(TOTAL);
        expect(Object.values(r).every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
      }
    }
  });

  it("valores fuera de rango se recortan en vez de romper la suma", () => {
    expect(suma(mover(repartoPorDefecto(), "carne", -40))).toBe(TOTAL);
    expect(suma(mover(repartoPorDefecto(), "carne", 900))).toBe(TOTAL);
    expect(mover(repartoPorDefecto(), "carne", -40).carne).toBe(0);
  });

  it("basura de entrada no propaga NaN", () => {
    const r = normalizar({ carne: "tres", pescado: null, legumbres: NaN, verdura: 5 });
    expect(suma(r)).toBe(TOTAL);
    expect(r.verdura).toBe(TOTAL);
  });
});

describe("quitar de uno pone en otro", () => {
  it("el valor que pide el usuario se respeta tal cual", () => {
    const r = mover(repartoPorDefecto(), "pescado", 40);
    expect(r.pescado).toBe(40);
  });

  it("lo que se quita sale sobre todo de quien más tenía", () => {
    // Con el default, carne y verdura pesan 22 y el resto 14. Subir pescado
    // tiene que morder más de la carne que de los huevos: a partes iguales el
    // gesto se siente aleatorio.
    const antes = repartoPorDefecto();
    const despues = mover(antes, "pescado", antes.pescado + 12);
    expect(antes.carne - despues.carne).toBeGreaterThan(antes.huevos - despues.huevos);
  });

  it("bajar una familia devuelve a las demás", () => {
    const antes = repartoPorDefecto();
    const despues = mover(antes, "carne", 0);
    expect(despues.carne).toBe(0);
    for (const f of FAMILIAS.filter((x) => x !== "carne")) {
      expect(despues[f]).toBeGreaterThanOrEqual(antes[f]);
    }
  });

  it("mover al valor que ya tenía no cambia nada", () => {
    const antes = repartoPorDefecto();
    expect(mover(antes, "carne", antes.carne)).toEqual(antes);
  });

  it("una familia que no existe no toca el reparto", () => {
    const antes = repartoPorDefecto();
    expect(mover(antes, "sushi", 50)).toEqual(antes);
  });
});

describe("los topes reales de un slider", () => {
  it("una familia al 100 deja el resto a cero", () => {
    const r = mover(repartoPorDefecto(), "verdura", 100);
    expect(r.verdura).toBe(100);
    for (const f of FAMILIAS.filter((x) => x !== "verdura")) expect(r[f]).toBe(0);
  });

  it("desde el 100, bajar reparte a partes iguales porque no hay pesos", () => {
    const solo = mover(repartoPorDefecto(), "verdura", 100);
    const r = mover(solo, "verdura", 50);
    expect(r.verdura).toBe(50);
    expect(suma(r)).toBe(TOTAL);
    // Las cinco restantes se llevan 50 entre todas, sin que ninguna se quede
    // fuera del reparto.
    expect(FAMILIAS.filter((f) => f !== "verdura").every((f) => r[f] > 0)).toBe(true);
  });

  it("la que ya está al 100 no puede subir más: no hay de dónde sacar", () => {
    const solo = mover(repartoPorDefecto(), "verdura", 100);
    expect(mover(solo, "verdura", 100)).toEqual(solo);
  });

  it("pero otra familia sí puede morder de la que está al 100", () => {
    // El tope de un slider no es 100: es 100 menos lo que las demás no pueden
    // ceder. Con verdura al 100, todo lo que pida carne sale de verdura.
    const solo = mover(repartoPorDefecto(), "verdura", 100);
    const r = mover(solo, "carne", 30);
    expect(r.carne).toBe(30);
    expect(r.verdura).toBe(70);
    expect(suma(r)).toBe(TOTAL);
  });
});

describe("bajar a máximos para el motor", () => {
  it("nunca pasa de 7: un tope mayor dejaría de limitar", () => {
    const r = mover(repartoPorDefecto(), "carne", 100);
    expect(repartoAFreqs(r, { presupuesto: 21 }).carne).toBe(7);
  });

  it("nunca baja de 0", () => {
    const freqs = repartoAFreqs(mover(repartoPorDefecto(), "carne", 100));
    expect(Object.values(freqs).every((v) => v >= 0)).toBe(true);
  });

  it("emite las seis familias que el prompt del planner sabe leer", () => {
    expect(Object.keys(repartoAFreqs(repartoPorDefecto())).sort()).toEqual([...FAMILIAS].sort());
  });

  it("un presupuesto mayor sube los topes proporcionalmente", () => {
    const base = repartoAFreqs(repartoPorDefecto(), { presupuesto: 14 });
    const ancho = repartoAFreqs(repartoPorDefecto(), { presupuesto: 21 });
    expect(ancho.carne).toBeGreaterThan(base.carne);
  });
});

describe("cuando los dos ejes están escritos, manda quien lo pidió a mano", () => {
  it("sin reparto, los freqs pasan tal cual: una casa vieja no nota nada", () => {
    expect(freqsEfectivos({ freqs: { pescado: 4 } })).toEqual({ pescado: 4 });
    expect(freqsEfectivos({ freqs: DEFAULT_FREQS, reparto: {} })).toEqual(DEFAULT_FREQS);
    expect(freqsEfectivos()).toEqual({});
  });

  it("sin freqs, manda el reparto entero", () => {
    expect(freqsEfectivos({ reparto: repartoPorDefecto() })).toEqual(DEFAULT_FREQS);
  });

  it("un freq pedido a mano sobrevive a mover otro slider", () => {
    // El caso que motiva la política: alguien pidió "pescado tres veces" hace
    // dos semanas. Subir la carne con el slider no puede borrárselo, porque el
    // reparto se mueve ENTERO cada vez que se toca una sola familia.
    const r = mover(repartoPorDefecto(), "carne", 60);
    const efectivos = freqsEfectivos({ freqs: { pescado: 3 }, reparto: r });
    expect(efectivos.pescado).toBe(3);
    expect(efectivos.carne).toBe(repartoAFreqs(r).carne);
  });

  it("las familias que nadie pidió las pone el reparto", () => {
    const r = mover(repartoPorDefecto(), "verdura", 50);
    const efectivos = freqsEfectivos({ freqs: { pescado: 3 }, reparto: r });
    expect(Object.keys(efectivos).sort()).toEqual([...FAMILIAS].sort());
    expect(efectivos.verdura).toBe(repartoAFreqs(r).verdura);
  });

  it("un freq a cero también manda: es una decisión, no un hueco", () => {
    const efectivos = freqsEfectivos({ freqs: { carne: 0 }, reparto: repartoPorDefecto() });
    expect(efectivos.carne).toBe(0);
  });
});

describe("el slider tiene una sola fuente y no salta bajo el dedo", () => {
  it("con reparto escrito, se pinta ese y punto", () => {
    // Sin fundir los dos ejes al pintar: fundirlos obligaba a pasar por
    // enteros de 0 a 7 y volver, y un slider al 5 % volvía como 8 %.
    const r = mover(repartoPorDefecto(), "verdura", 5);
    expect(repartoVisible({ reparto: r, freqs: DEFAULT_FREQS })).toEqual(r);
    expect(repartoVisible({ reparto: r }).verdura).toBe(5);
  });

  it("sin reparto, una casa del wizard viejo ve SUS números", () => {
    const freqs = { ...DEFAULT_FREQS, pescado: 5, carne: 1 };
    const visible = repartoVisible({ freqs });
    expect(visible.pescado).toBeGreaterThan(visible.carne);
    expect(suma(visible)).toBe(TOTAL);
  });

  it("sin nada escrito, el default", () => {
    expect(repartoVisible()).toEqual(repartoPorDefecto());
    expect(repartoVisible({})).toEqual(repartoPorDefecto());
    expect(repartoVisible({ freqs: {}, reparto: {} })).toEqual(repartoPorDefecto());
  });

  it("unos freqs a medias no ponen a cero al resto de la semana", () => {
    // El panel escribe solo las familias que el usuario nombró: "más pescado"
    // toca una de seis. Sin rellenar el resto con el default, una frase sobre
    // el pescado dejaba la semana sin legumbres, sin pasta y sin verdura.
    const visible = repartoVisible({ freqs: { pescado: 4 } });
    for (const f of FAMILIAS) expect(visible[f]).toBeGreaterThan(0);
    expect(suma(visible)).toBe(TOTAL);
    expect(visible.pescado).toBeGreaterThan(repartoPorDefecto().pescado);
  });

  it("y lo que sí viene escrito manda sobre el default", () => {
    const visible = repartoVisible({ freqs: { carne: 0 } });
    expect(visible.carne).toBe(0);
    expect(suma(visible)).toBe(TOTAL);
  });
});

describe("pedirlo por voz mueve el slider", () => {
  // El gesto entero de la pantalla. El panel habla en veces por semana —como
  // habla la gente— y el slider en porcentajes; la traducción se hace al
  // APLICAR el ajuste, así que el reparto guardado ya lleva el cambio dentro.
  it("«pescado cinco veces» sube el pescado", () => {
    const antes = repartoPorDefecto();
    const despues = repartoConFreq(antes, "pescado", 5);
    expect(despues.pescado).toBeGreaterThan(antes.pescado);
    expect(repartoAFreqs(despues).pescado).toBe(5);
  });

  it("y las demás se recolocan solas, porque la suma es fija", () => {
    const antes = repartoPorDefecto();
    const despues = repartoConFreq(antes, "pescado", 6);
    expect(suma(despues)).toBe(TOTAL);
    expect(despues.carne).toBeLessThan(antes.carne);
  });

  it("«nunca carne» la deja a cero sin romper la suma", () => {
    const despues = repartoConFreq(repartoPorDefecto(), "carne", 0);
    expect(despues.carne).toBe(0);
    expect(suma(despues)).toBe(TOTAL);
  });

  it("una familia inventada no toca nada", () => {
    const antes = repartoPorDefecto();
    expect(repartoConFreq(antes, "sushi", 3)).toEqual(antes);
  });

  it("un número absurdo se recorta al dominio real de un freq", () => {
    const despues = repartoConFreq(repartoPorDefecto(), "carne", 99);
    expect(repartoAFreqs(despues).carne).toBe(7);
    expect(suma(despues)).toBe(TOTAL);
  });
});

describe("vive en la libreta como todo lo demás", () => {
  it("la ruta tiene el formato de notepadFields", () => {
    expect(rutaDeReparto("pescado")).toBe("reparto.pescado");
  });
});
