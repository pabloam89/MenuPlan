import { describe, expect, it } from "vitest";
import {
  VEREDICTOS, ESTADOS_PRESUPUESTO, PARTE_CONOCIDA_MINIMA, leerPresupuesto, presupuestoSemanal, topePorRacion,
  precioDePlato, precioAlto, estimarSemana, veredicto, frasePresupuesto, COBERTURA_SUELO, listaFrenteAPresupuesto,
} from "./presupuesto.js";
import recipeCoste from "../data/derived/recipeCoste.json" with { type: "json" };

// Ids reales de la tabla: uno con todas sus líneas con precio y otro al que
// le falta alguna. Así el test no se rompe cuando cambian los precios.
const filas = Object.entries(recipeCoste.recetas).filter(([, f]) => f.porRacion != null);
const [COMPLETA, fCompleta] = filas.find(([, f]) => f.cobertura >= 1);
const [INCOMPLETA, fIncompleta] = filas.find(([, f]) => f.cobertura < 1);

const plan = (huecos, gid = "g1") => ({ _warnings: ["x"], [gid]: huecos });
const casa = (budget, hasBudget = true) => ({ hasBudget, budget });

describe("leerPresupuesto: la lectura de hasBudget y budget para enseñarlo o hacer cuentas", () => {
  it("sin el interruptor no hay presupuesto, aunque quede el número", () => {
    expect(leerPresupuesto({ hasBudget: false, budget: 80 })).toEqual({ estado: "sin", euros: null });
    expect(leerPresupuesto({ budget: 80 }).estado).toBe("sin");
    expect(leerPresupuesto(null).estado).toBe("sin");
  });
  it("con él, el número", () => {
    expect(leerPresupuesto(casa(80))).toEqual({ estado: "activo", euros: 80 });
    expect(presupuestoSemanal(casa("95"))).toBe(95);
  });
  it("el tope por ración reparte el presupuesto entre las raciones; sin las dos cifras, no hay tope", () => {
    expect(topePorRacion(84, 28)).toBe(3);
    expect(topePorRacion(null, 28)).toBeNull();
    expect(topePorRacion(84, 0)).toBeNull();
  });
  it("con el interruptor y sin cifra válida es «sin_cifra», no «sin»: no se calla", () => {
    for (const b of [0, -5, "mucho", null, undefined]) expect(leerPresupuesto(casa(b)).estado, String(b)).toBe("sin_cifra");
    expect(presupuestoSemanal(casa("mucho"))).toBeNull();
    expect(ESTADOS_PRESUPUESTO).toEqual(["sin", "activo", "sin_cifra"]);
  });
});

describe("estimarSemana: lo que no tiene precio no cuenta como 0 €", () => {
  it("suma € por ración × raciones, con el id con prefijo de grupo", () => {
    const est = estimarSemana(plan({ "Lun-Cena": { recipeId: `g1__${COMPLETA}`, raciones: 2 } }));
    expect(est.euros).toBeCloseTo(fCompleta.porRacion * 2, 2);
    expect(est).toMatchObject({ raciones: 2, conPrecio: 2, incompletas: 0, sinPrecio: 0, huecosSinRaciones: 0 });
  });
  it("un plato al que le falta alguna línea cuenta, pero como incompleto, y el alto lo sube por lo que falta", () => {
    const est = estimarSemana(plan({ "Lun-Cena": { recipeId: INCOMPLETA, eaters: 3 } }));
    expect(est.euros).toBeCloseTo(fIncompleta.porRacion * 3, 2);
    expect(est.eurosAlto).toBeCloseTo(precioAlto(precioDePlato(INCOMPLETA)) * 3, 1);
    expect(est.eurosAlto).toBeGreaterThan(est.euros);
    expect(COBERTURA_SUELO).toBe(0.5);
    expect(precioAlto({ porRacion: 3, cobertura: 0.75, completo: false })).toBe(4);
    expect(precioAlto({ porRacion: 3, cobertura: 0.2, completo: false })).toBe(6);
    expect(est).toMatchObject({ conPrecio: 0, incompletas: 3 });
    expect(precioDePlato(INCOMPLETA)).toMatchObject({ completo: false, cobertura: fIncompleta.cobertura });
  });
  it("un plato sin fila (receta de la familia) suma 0 € pero queda contado y con nombre", () => {
    const est = estimarSemana(
      plan({ "Lun-Cena": { recipeId: "user_123", raciones: 2 }, "Mar-Cena": { recipeId: COMPLETA, raciones: 2 } }),
      { recetas: [{ id: "user_123", name: "Tortilla de la abuela" }] },
    );
    expect(est).toMatchObject({ raciones: 4, conPrecio: 2, sinPrecio: 2, platosSinPrecio: ["Tortilla de la abuela"] });
  });
  it("primero y segundo cuentan los dos; lo del congelador ya está pagado", () => {
    const est = estimarSemana(plan({
      "Lun-Comida": { firstRecipeId: COMPLETA, recipeId: COMPLETA, raciones: 2 },
      "Mar-Comida": { recipeId: COMPLETA, raciones: 2, fromFreezer: true },
    }));
    expect(est.raciones).toBe(4);
  });
  it("un hueco con plato y sin comensales no se pierde: queda contado", () => {
    const est = estimarSemana(plan({ "Lun-Cena": { recipeId: COMPLETA, raciones: 2 }, "Mar-Cena": { recipeId: COMPLETA } }));
    expect(est).toMatchObject({ raciones: 2, huecosSinRaciones: 1 });
    expect(veredicto(1000, est)).toBe("incierto");
  });
  it("con guarnición añadida, el plato pasa a incompleto (su precio no está en la tabla)", () => {
    const est = estimarSemana(plan({ "Lun-Cena": { recipeId: COMPLETA, raciones: 2 } }), { recetas: [{ id: COMPLETA, garnishId: "g_arroz" }] });
    expect(est).toMatchObject({ conPrecio: 0, incompletas: 2 });
  });
});

describe("veredicto y frase: vocabulario cerrado y honesto", () => {
  const est = (o) => ({ euros: 50, eurosAlto: 50, raciones: 10, conPrecio: 10, incompletas: 0, sinPrecio: 0, platosSinPrecio: [], huecosSinRaciones: 0, ...o });
  it("solo dice uno de VEREDICTOS, o null sin presupuesto", () => {
    expect(VEREDICTOS).toEqual(["cabe", "no_cabe", "incierto"]);
    expect(veredicto(null, est())).toBeNull();
    expect(veredicto(80, est({ raciones: 0 }))).toBeNull();
  });
  it("el mínimo ya pasa: no cabe, aunque falten precios", () => {
    expect(veredicto(40, est({ conPrecio: 2, sinPrecio: 8 }))).toBe("no_cabe");
  });
  it("no pasa, pero mucho sin ningún precio, o el alto se pasa: incierto, nunca «cabe»", () => {
    const conocidas = Math.floor(10 * PARTE_CONOCIDA_MINIMA) - 1;
    expect(veredicto(80, est({ conPrecio: conocidas, sinPrecio: 10 - conocidas }))).toBe("incierto");
    expect(veredicto(60, est({ conPrecio: 4, incompletas: 6, eurosAlto: 70 }))).toBe("incierto");
    expect(veredicto(80, est({ conPrecio: 4, incompletas: 6, eurosAlto: 70 }))).toBe("cabe");
    expect(veredicto(80, est())).toBe("cabe");
  });
  it("la frase dice el número, el presupuesto y lo que falta", () => {
    expect(frasePresupuesto(casa(80), est())).toBe("La comida de la semana sale por unos 50 € a precio de Mercadona por kilo: cabe en el presupuesto de 80 €.");
    expect(frasePresupuesto(casa(80), est({ conPrecio: 4, incompletas: 6, eurosAlto: 70 }))).toBe("La comida de la semana sale por entre 50 y 70 € a precio de Mercadona por kilo: cabe en el presupuesto de 80 €.");
    expect(frasePresupuesto(casa(40), est({ conPrecio: 7, sinPrecio: 3 }))).toMatch(/al menos 50 €.*30 %.*no cabe en el presupuesto de 40 €/);
  });
  it("sin presupuesto, nada; con el interruptor y sin cifra, o sin platos, se dice", () => {
    expect(frasePresupuesto(casa(80, false), est())).toBeNull();
    expect(frasePresupuesto(casa("mucho"), est())).toMatch(/sin una cifra válida/);
    expect(frasePresupuesto(casa(80), est({ raciones: 0, conPrecio: 0 }))).toMatch(/no hay platos que pueda contar/);
  });
});

describe("listaFrenteAPresupuesto: la lista de la compra frente al presupuesto (#958)", () => {
  const est = (total, matched, count) => ({ total, matched, count });
  it("lo que no tiene precio se cuenta aparte y no deja decir «cabe»", () => {
    expect(listaFrenteAPresupuesto(casa(80), est(60, 18, 20))).toEqual({ presupuesto: 80, total: 60, sinPrecio: 2, veredicto: "incierto" });
    expect(listaFrenteAPresupuesto(casa(80), est(60, 20, 20)).veredicto).toBe("cabe");
  });
  it("si el total con precio ya se pasa, no cabe, falte lo que falte", () => {
    expect(listaFrenteAPresupuesto(casa(50), est(61, 15, 20)).veredicto).toBe("no_cabe");
  });
  it("el presupuesto es por semana: con dos semanas en la lista, el doble", () => {
    expect(listaFrenteAPresupuesto(casa(50), est(90, 20, 20), 2)).toMatchObject({ presupuesto: 100, veredicto: "cabe" });
  });
  it("sin presupuesto, solo lo que no tiene precio; sin estimación, nada", () => {
    expect(listaFrenteAPresupuesto(casa(80, false), est(60, 18, 20))).toEqual({ presupuesto: null, total: 60, sinPrecio: 2, veredicto: null });
    expect(listaFrenteAPresupuesto(casa(80), null)).toBeNull();
  });
  it("su veredicto es del mismo vocabulario que el de la semana", () => {
    for (const [t, m] of [[60, 18], [60, 20], [90, 20]]) expect(VEREDICTOS).toContain(listaFrenteAPresupuesto(casa(80), est(t, m, 20)).veredicto);
  });
});
