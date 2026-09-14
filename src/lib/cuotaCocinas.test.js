import { describe, it, expect } from "vitest";
import { ajustarCuota, contarCocinas, loQueFalta } from "./cuotaCocinas.js";
import { topeDe } from "./cocinaTopes.js";

const CATALOGO = {
  esp1: { id: "esp1", mainProtein: "pollo" },
  esp2: { id: "esp2", mainProtein: "cerdo" },
  esp3: { id: "esp3", mainProtein: "legumbre" },
  per1: { id: "per1", cocina: "peruana", mainProtein: "pescado" },
  per2: { id: "per2", cocina: "peruana", mainProtein: "pescado" },
  per3: { id: "per3", cocina: "peruana", mainProtein: "pollo" },
  mex1: { id: "mex1", cocina: "mexicana", mainProtein: "cerdo" },
  mex2: { id: "mex2", cocina: "mexicana", mainProtein: "pollo" },
};
const recetaDe = (id) => CATALOGO[id] ?? null;
const pool = Object.values(CATALOGO);

const menu = (...ids) => ids.map((id, i) => ({ slotId: `d${i}_comida_1`, recipeId: id }));

describe("contar lo que hay", () => {
  it("solo cuenta lo que lleva cocina; lo neutro no es de nadie", () => {
    expect(contarCocinas(menu("esp1", "per1", "esp2", "mex1"), recetaDe))
      .toEqual({ peruana: 1, mexicana: 1 });
  });
});

describe("lo que falta", () => {
  it("es la diferencia, y solo si falta", () => {
    // Mexicana y no peruana: el tope sale del catálogo REAL, y el de peruana
    // es hoy tan bajo que taparía la resta que se quiere probar aquí.
    expect(loQueFalta({ mexicana: 2 }, { mexicana: 0 })).toEqual({ mexicana: 2 });
    expect(loQueFalta({ mexicana: 2 }, { mexicana: 2 })).toEqual({});
  });

  it("si sobra, no se quita nada", () => {
    // Pediste "al menos dos" y salieron tres: quitarte un plato que te gustó
    // para cuadrar un número sería peor que pasarse.
    expect(loQueFalta({ mexicana: 2 }, { mexicana: 3 })).toEqual({});
  });

  it("nunca pide más de lo que el catálogo puede servir", () => {
    // Pedir cinco peruanos cuando el catálogo da menos no se arregla poniendo
    // cinco: se arregla poniendo los que hay y diciéndolo.
    const falta = loQueFalta({ peruana: 5 }, { peruana: 0 });
    expect(falta.peruana).toBe(topeDe("peruana"));
  });

  it("italiana no entra: no es un añadido", () => {
    expect(loQueFalta({ italiana: 3 }, { italiana: 0 })).toEqual({});
  });
});

describe("ajustar el menú", () => {
  it("mete lo que falta ocupando huecos neutros", () => {
    const { asignaciones, colocados } = ajustarCuota(menu("esp1", "esp2", "esp3"), {
      pedido: { peruana: 1 },
      recetaDe,
      candidatos: pool,
    });
    expect(colocados).toEqual({ peruana: 1 });
    expect(contarCocinas(asignaciones, recetaDe).peruana).toBe(1);
    expect(asignaciones).toHaveLength(3);
  });

  it("no toca otro plato extranjero para cumplir una cuota ajena", () => {
    // Cambiar el mexicano por un peruano cumpliría peruana rompiendo mexicana.
    const { asignaciones } = ajustarCuota(menu("mex1", "esp1"), {
      pedido: { peruana: 1 },
      recetaDe,
      candidatos: pool,
    });
    expect(asignaciones.find((a) => a.slotId === "d0_comida_1").recipeId).toBe("mex1");
    expect(contarCocinas(asignaciones, recetaDe)).toEqual({ mexicana: 1, peruana: 1 });
  });

  it("respeta los huecos bloqueados (platos fijados, huecos forzados)", () => {
    const { asignaciones, sinSitio } = ajustarCuota(menu("esp1", "esp2"), {
      pedido: { peruana: 1 },
      recetaDe,
      candidatos: pool,
      bloqueado: () => true,
    });
    expect(asignaciones.map((a) => a.recipeId)).toEqual(["esp1", "esp2"]);
    expect(sinSitio).toEqual({ peruana: 1 });
  });

  it("no repite plato ni proteína dentro de la cocina que mete", () => {
    // per1 y per2 son los dos pescado: dos ceviches seguidos cumplen el número
    // y no cumplen la promesa. Debe coger per1 y per3 (pescado + pollo).
    const { asignaciones, colocados } = ajustarCuota(menu("esp1", "esp2", "esp3"), {
      // Mexicana: su tope real da para dos, el de peruana no. Aquí se prueba la
      // regla de proteína, no el tope.
      pedido: { mexicana: 2 },
      recetaDe,
      candidatos: pool,
    });
    const puestos = asignaciones.map((a) => a.recipeId).filter((id) => recetaDe(id)?.cocina === "mexicana");
    const proteinas = puestos.map((id) => recetaDe(id).mainProtein);
    expect(new Set(puestos).size).toBe(puestos.length);
    expect(new Set(proteinas).size).toBe(proteinas.length);
    expect(colocados.mexicana).toBe(puestos.length);
  });

  it("dice lo que no cupo en vez de callarse", () => {
    // Un solo hueco neutro (esp1) para dos platos mexicanos pedidos: el otro
    // hueco lo ocupa un peruano, y a un extranjero no se le toca.
    const { sinSitio, colocados } = ajustarCuota(menu("esp1", "per1"), {
      pedido: { mexicana: 2 },
      recetaDe,
      candidatos: pool,
    });
    expect(colocados.mexicana).toBe(1);
    expect(sinSitio.mexicana).toBe(1);
  });

  it("si ya está cumplido, no mueve nada", () => {
    const entrada = menu("per1", "esp1");
    const { asignaciones, colocados } = ajustarCuota(entrada, {
      pedido: { peruana: 1 },
      recetaDe,
      candidatos: pool,
    });
    expect(asignaciones.map((a) => a.recipeId)).toEqual(["per1", "esp1"]);
    expect(colocados).toEqual({});
  });

  it("sin pedido, es una función que no hace nada", () => {
    const entrada = menu("esp1", "esp2");
    const { asignaciones } = ajustarCuota(entrada, { pedido: null, recetaDe, candidatos: pool });
    expect(asignaciones.map((a) => a.recipeId)).toEqual(["esp1", "esp2"]);
  });
});
