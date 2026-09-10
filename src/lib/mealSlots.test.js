import { describe, it, expect } from "vitest";
import {
  KINDS, POOLS_OFF_MENU, FRANJAS_POR_DEFECTO,
  esComida, franjasActivas, huecosDeFranja, slotIdDelMotor,
  motivoSinMotor, validarFranjas, franjaDeEtiqueta, etiquetasActivas,
} from "./mealSlots.js";
import { getDayMeals } from "./planner.js";

/** Una casa con comida y cena, sin extras: el default de la app. */
const CASA_BASE = { meals: ["Comida", "Cena"] };

describe("la config por defecto no cambia nada", () => {
  // La prueba que de verdad importa: mientras nadie edite la config, la
  // pantalla nueva tiene que pintar exactamente las mismas franjas que
  // `getDayMeals`. Si divergieran, el usuario vería un desayuno en una
  // pantalla y no en la otra sin haber tocado nada.
  it("coincide con getDayMeals en una casa sin extras", () => {
    expect(etiquetasActivas(CASA_BASE)).toEqual(getDayMeals(CASA_BASE));
  });

  it("coincide con getDayMeals con desayuno, merienda y postre puestos", () => {
    const data = {
      meals: ["Comida", "Cena"],
      extraMeals: { desayuno: "variado", merienda: "semana", postre: "comida" },
    };
    expect(etiquetasActivas(data)).toEqual(getDayMeals(data));
    expect(etiquetasActivas(data)).toEqual(["Desayuno", "Comida", "Merienda", "Cena", "Postre"]);
  });

  it("coincide con getDayMeals cuando solo hay comida", () => {
    const data = { meals: ["Comida"] };
    expect(etiquetasActivas(data)).toEqual(getDayMeals(data));
  });

  it("los slotIds que produce son los tres del motor de hoy", () => {
    const huecos = franjasActivas(CASA_BASE).flatMap((f) => huecosDeFranja(f));
    expect(huecos.map((h) => slotIdDelMotor(h, "lun"))).toEqual([
      "lun_comida_1", "lun_comida_2", "lun_cena",
    ]);
  });
});

describe("una franja se abre en huecos según la estructura del día", () => {
  const comida = franjaDeEtiqueta("Comida");

  it("primero y segundo por defecto, con el tiempo repartido 40/60", () => {
    const huecos = huecosDeFranja(comida);
    expect(huecos.map((h) => h.kind)).toEqual(["primero", "segundo"]);
    expect(KINDS.primero.cuotaTiempo + KINDS.segundo.cuotaTiempo).toBeCloseTo(1);
  });

  it("plato único colapsa la comida en un solo hueco, sin segundo", () => {
    const huecos = huecosDeFranja(comida, { estructura: "unico" });
    expect(huecos).toHaveLength(1);
    expect(huecos[0].kind).toBe("unico");
    expect(huecos[0].preferType).toBe("plato_unico");
    // Y ese hueco va al slot _1: el _2 no existe ese día.
    expect(slotIdDelMotor(huecos[0], "mar")).toBe("mar_comida_1");
  });

  it("el valor viejo 1_plato sigue valiendo, porque está guardado en data", () => {
    expect(huecosDeFranja(comida, { estructura: "1_plato" })[0].kind).toBe("unico");
  });

  it("rápida colapsa igual que único pero NO significa lo mismo", () => {
    // Misma forma de slot, distinto preferType: el prompt trata "un plato que
    // ES la comida entera" y "no da tiempo a dos" de forma distinta.
    const rapida = huecosDeFranja(comida, { rapida: true })[0];
    const unico = huecosDeFranja(comida, { estructura: "unico" })[0];
    expect(rapida.kind).toBe(unico.kind);
    expect(rapida.preferType).toBe("comida_rapida");
    expect(unico.preferType).toBe("plato_unico");
  });

  it("una cena rápida se marca, una normal no", () => {
    const cena = franjaDeEtiqueta("Cena");
    expect(huecosDeFranja(cena)[0].preferType).toBe(null);
    expect(huecosDeFranja(cena, { rapida: true })[0].preferType).toBe("cena_rapida");
  });

  it("solo la comida se abre en dos", () => {
    for (const f of FRANJAS_POR_DEFECTO.filter((x) => !esComida(x))) {
      expect(huecosDeFranja(f)).toHaveLength(1);
    }
  });
});

describe("el aire de verdad está en las franjas off-menu", () => {
  // No pasan por el modelo ni por el vocabulario de slotIds: se resuelven de
  // un pool con planKey "${día}-${Etiqueta}". Por eso una franja ligera nueva
  // funciona hoy, sin tocar el motor.
  const recena = { id: "recena", label: "Recena", kind: "ligero", pool: "postres", flag: "extraMeals", orden: 60 };

  it("una franja ligera nueva es planificable si tiene pool", () => {
    expect(motivoSinMotor(recena)).toBe(null);
    expect(validarFranjas([...FRANJAS_POR_DEFECTO, recena])).toEqual([]);
  });

  it("sin pool del catálogo, lo dice en vez de aparecer vacía", () => {
    const sinPool = { ...recena, pool: "cenitas" };
    expect(motivoSinMotor(sinPool)).toContain("necesita un pool");
    expect(validarFranjas([sinPool])).toHaveLength(1);
  });

  it("no produce slotId, porque no lo usa", () => {
    expect(slotIdDelMotor(huecosDeFranja(recena)[0], "lun")).toBe(null);
  });

  it("los pools declarados existen en el catálogo off-menu", () => {
    for (const f of FRANJAS_POR_DEFECTO.filter((x) => x.kind === "ligero")) {
      expect(POOLS_OFF_MENU).toContain(f.pool);
    }
  });
});

describe("el cupo de slotIds del motor, dicho en voz alta", () => {
  // El motor de hoy solo entiende tres formas de slotId por día. Una cuarta
  // franja "ia" no tiene dónde aterrizar, y el síntoma sería un hueco vacío
  // sin explicación. Vale más reportarlo.
  it("dos franjas de cena se pisan, y se avisa", () => {
    const segunda = { id: "recena", label: "Recena", kind: "cena", flag: "meals", orden: 60 };
    const problemas = validarFranjas([...FRANJAS_POR_DEFECTO, segunda]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("mismo hueco del motor");
    expect(problemas[0]).toContain("cena");
  });

  it("un kind inventado no cuela", () => {
    const raro = { id: "brunch", label: "Brunch", kind: "brunch", flag: "meals", orden: 15 };
    expect(motivoSinMotor(raro)).toContain("no es un arquetipo");
  });

  it("una franja repetida se reporta", () => {
    const problemas = validarFranjas([...FRANJAS_POR_DEFECTO, franjaDeEtiqueta("Cena")]);
    expect(problemas.some((p) => p.includes("repetida"))).toBe(true);
  });

  it("la config por defecto está limpia", () => {
    expect(validarFranjas()).toEqual([]);
  });
});

describe("bordes", () => {
  it("una franja inexistente no revienta", () => {
    expect(huecosDeFranja(null)).toEqual([]);
    expect(motivoSinMotor(null)).toBe("no existe");
    expect(franjaDeEtiqueta("Ágape")).toBe(null);
  });

  it("un hueco sin kind conocido no inventa slotId", () => {
    expect(slotIdDelMotor({ kind: "brunch" }, "lun")).toBe(null);
    expect(slotIdDelMotor(undefined, "lun")).toBe(null);
  });

  it("las franjas salen ordenadas por el día, no por el orden del array", () => {
    const desordenadas = [...FRANJAS_POR_DEFECTO].reverse();
    const data = { meals: ["Comida", "Cena"], extraMeals: { desayuno: "variado" } };
    expect(etiquetasActivas(data, desordenadas)).toEqual(["Desayuno", "Comida", "Cena"]);
  });
});
