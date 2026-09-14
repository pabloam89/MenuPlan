import { describe, it, expect } from "vitest";
import {
  BASES,
  MIN_PLATOS_POR_BASE,
  baseDeReceta,
  coberturaDeBases,
  sesionDeBases,
  tiempoDeBase,
  usaBase,
} from "./bases.js";
import { MAIN_BASES, RecipeSchema } from "../data/recipeSchema.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

const plato = (extra = {}) => ({ id: "x", name: "X", ...extra });

describe("el catálogo de bases", () => {
  it("valida entero contra RecipeSchema", () => {
    for (const b of BASES) {
      const res = RecipeSchema.safeParse(b);
      expect(res.success, `${b.id}: ${res.error?.issues?.[0]?.message}`).toBe(true);
    }
  });

  it("no repite mainBase — es la clave del emparejamiento", () => {
    const vistos = BASES.map((b) => b.mainBase);
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  it("solo declara mainBase del vocabulario cerrado", () => {
    for (const b of BASES) expect(MAIN_BASES).toContain(b.mainBase);
  });

  it("ninguna base ocupa un hueco de menú", () => {
    for (const b of BASES) {
      expect(b.type).toBe("base");
      expect(b.mealRole).toEqual(["base"]);
    }
  });
});

describe("baseDeReceta", () => {
  it("empareja por mainBase cuando la base va aparte", () => {
    const b = baseDeReceta(plato({ mainBase: "arroz", baseMode: "aparte" }));
    expect(b?.mainBase).toBe("arroz");
    expect(usaBase(plato({ mainBase: "arroz", baseMode: "aparte" }))).toBe(true);
  });

  it("no empareja un plato cuya base se cocina dentro", () => {
    // Un risotto con el arroz precocinado deja de ser un risotto.
    expect(baseDeReceta(plato({ mainBase: "arroz", baseMode: "dentro" }))).toBeNull();
  });

  it("trata la ausencia de baseMode como 'no', no como 'dentro'", () => {
    // Sin revisar ≠ decidido. El riesgo es asimétrico: mejor no ahorrar que
    // arruinar el plato.
    expect(baseDeReceta(plato({ mainBase: "arroz" }))).toBeNull();
  });

  it("devuelve null sin mainBase, y no revienta con basura", () => {
    expect(baseDeReceta(plato({ baseMode: "aparte" }))).toBeNull();
    expect(baseDeReceta(null)).toBeNull();
    expect(baseDeReceta(undefined)).toBeNull();
  });

  it("no da base a `pan` ni a `avena` — no hay tanda que cocinar", () => {
    expect(baseDeReceta(plato({ mainBase: "pan", baseMode: "aparte" }))).toBeNull();
    expect(baseDeReceta(plato({ mainBase: "avena", baseMode: "aparte" }))).toBeNull();
  });
});

describe("tiempoDeBase — el tiempo es afín, no proporcional", () => {
  const legumbre = BASES.find((b) => b.mainBase === "legumbre");

  it("una olla de legumbre tarda casi lo mismo para 2 que para 8", () => {
    const dos = tiempoDeBase(legumbre, 2);
    const ocho = tiempoDeBase(legumbre, 8);
    expect(dos.tandas).toBe(1);
    expect(ocho.tandas).toBe(1);
    // Cuadruplicar las raciones no cuadruplica el tiempo: lo sube un pelín.
    expect(ocho.minutos - dos.minutos).toBeLessThan(dos.minutos * 0.25);
  });

  it("el ahorro compara contra una olla POR PLATO, no por ración", () => {
    // Tres platos de 2 raciones: suelto son 3 ollas, no 6.
    const { minutos, minutosSueltos, ahorro } = tiempoDeBase(legumbre, [2, 2, 2]);
    expect(ahorro).toBe(minutosSueltos - minutos);
    expect(ahorro).toBeGreaterThan(0);
    // Tres ollas ⇒ tres veces los fijos, ni una más.
    expect(minutosSueltos).toBeLessThanOrEqual(3 * (legumbre.minutosFijos + 2 * legumbre.minutosPorRacion));
  });

  it("un solo plato no ahorra nada: eso es cocinar, no batch cooking", () => {
    const t = tiempoDeBase(legumbre, [4]);
    expect(t.ahorro).toBe(0);
    expect(t.minutosSueltos).toBe(t.minutos);
    // Y un número suelto significa exactamente eso: un plato.
    expect(tiempoDeBase(legumbre, 4)).toEqual(t);
  });

  it("pasada la capacidad hace falta otra tanda y el tiempo se suma entero", () => {
    const dentro = tiempoDeBase(legumbre, legumbre.capacidadMax);
    const fuera = tiempoDeBase(legumbre, legumbre.capacidadMax + 1);
    expect(fuera.tandas).toBe(2);
    expect(fuera.minutos).toBeGreaterThan(dentro.minutos + legumbre.minutosFijos - 1);
  });

  it("cero raciones no es una tanda de cero minutos: es ninguna tanda", () => {
    expect(tiempoDeBase(legumbre, 0)).toEqual({ tandas: 0, minutos: 0, minutosSueltos: 0, ahorro: 0 });
    expect(tiempoDeBase(null, 4).tandas).toBe(0);
  });
});

describe("sesionDeBases", () => {
  const recetas = {
    r_bowl: { id: "r_bowl", name: "Bowl", mainBase: "arroz", baseMode: "aparte" },
    r_judias: { id: "r_judias", name: "Judías con arroz", mainBase: "arroz", baseMode: "aparte" },
    r_risotto: { id: "r_risotto", name: "Risotto", mainBase: "arroz", baseMode: "dentro" },
    r_ensalada: { id: "r_ensalada", name: "Ensalada de patata", mainBase: "patatas", baseMode: "aparte" },
  };
  const opts = { dias: ["lunes", "martes", "miercoles"], comidas: ["comida"] };

  it("junta los platos que comparten base y suma sus raciones", () => {
    const plan = {
      g1: {
        "lunes-comida": { recipeId: "r_bowl", eaters: 2 },
        "martes-comida": { recipeId: "r_judias", eaters: 3 },
      },
    };
    const { bases } = sesionDeBases(plan, recetas, opts);
    expect(bases).toHaveLength(1);
    expect(bases[0].base.mainBase).toBe("arroz");
    expect(bases[0].raciones).toBe(5);
    expect(bases[0].huecos.map((h) => h.nombre)).toEqual(["Bowl", "Judías con arroz"]);
  });

  it("deja fuera el risotto aunque sea del mismo mainBase", () => {
    const plan = {
      g1: {
        "lunes-comida": { recipeId: "r_bowl", eaters: 2 },
        "martes-comida": { recipeId: "r_judias", eaters: 2 },
        "miercoles-comida": { recipeId: "r_risotto", eaters: 4 },
      },
    };
    const { bases } = sesionDeBases(plan, recetas, opts);
    expect(bases[0].raciones).toBe(4);
    expect(bases[0].huecos).toHaveLength(2);
  });

  it("no propone una base que solo usa un plato: eso no es batch cooking", () => {
    const plan = { g1: { "lunes-comida": { recipeId: "r_ensalada", eaters: 4 } } };
    expect(sesionDeBases(plan, recetas, opts).bases).toHaveLength(0);
    expect(MIN_PLATOS_POR_BASE).toBe(2);
  });

  it("ve el primero y el segundo del mismo hueco", () => {
    const plan = {
      g1: { "lunes-comida": { firstRecipeId: "r_bowl", recipeId: "r_judias", eaters: 2 } },
    };
    const { bases } = sesionDeBases(plan, recetas, opts);
    expect(bases[0].raciones).toBe(4);
  });

  it("resuelve los ids prefijados por grupo de los menús multi-grupo", () => {
    const plan = {
      g1: {
        "lunes-comida": { recipeId: "g1__r_bowl", eaters: 2 },
        "martes-comida": { recipeId: "g1__r_judias", eaters: 2 },
      },
    };
    expect(sesionDeBases(plan, recetas, opts).bases[0].raciones).toBe(4);
  });

  it("ignora las claves internas del plan (las que empiezan por _)", () => {
    const plan = {
      _meta: { "lunes-comida": { recipeId: "r_bowl", eaters: 9 } },
      g1: {
        "lunes-comida": { recipeId: "r_bowl", eaters: 2 },
        "martes-comida": { recipeId: "r_judias", eaters: 2 },
      },
    };
    expect(sesionDeBases(plan, recetas, opts).bases[0].raciones).toBe(4);
  });

  it("ordena por ahorro y suma los totales", () => {
    const plan = {
      g1: {
        "lunes-comida": { recipeId: "r_bowl", eaters: 4 },
        "martes-comida": { recipeId: "r_judias", eaters: 4 },
        "miercoles-comida": { recipeId: "r_ensalada", eaters: 2 },
      },
      g2: { "lunes-comida": { recipeId: "r_ensalada", eaters: 2 } },
    };
    const s = sesionDeBases(plan, recetas, opts);
    expect(s.bases).toHaveLength(2);
    expect(s.bases[0].ahorro).toBeGreaterThanOrEqual(s.bases[1].ahorro);
    expect(s.minutosTotales).toBe(s.bases.reduce((n, b) => n + b.minutos, 0));
    expect(s.ahorroTotal).toBe(s.bases.reduce((n, b) => n + b.ahorro, 0));
  });

  it("un plan vacío no es un error", () => {
    expect(sesionDeBases({}, recetas, opts)).toEqual({ bases: [], minutosTotales: 0, ahorroTotal: 0 });
    expect(sesionDeBases(null, recetas, opts).bases).toEqual([]);
  });
});

describe("coberturaDeBases sobre el catálogo real", () => {
  it("toda base del catálogo tiene platos de verdad que la aprovechan", () => {
    const cobertura = coberturaDeBases(recipeCatalog);
    for (const b of BASES) {
      expect(cobertura.get(b.id) ?? 0, `${b.name} no la usa ningún plato`).toBeGreaterThanOrEqual(
        MIN_PLATOS_POR_BASE,
      );
    }
  });
});
