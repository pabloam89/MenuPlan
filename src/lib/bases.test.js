import { describe, it, expect } from "vitest";
import {
  BASES,
  MIN_PLATOS_POR_BASE,
  baseDeReceta,
  claveDeBase,
  clavesDeReceta,
  coberturaDeBases,
  MINUTOS_DE_DIARIO,
  MINUTOS_DE_MONTAJE,
  costeDeReactivar,
  esMontajeRapido,
  loQueGana,
  montajeTrasBases,
  fraccionActiva,
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

  it("no repite CLAVE — es por donde la encuentra el plato", () => {
    // Por `claveDeBase`, no por `mainBase` a secas: las bases que no son
    // fécula (sofrito, caldo, salsa de tomate…) no tienen mainBase, y
    // compararlas por ese campo hacía chocar a todas entre sí contra
    // `undefined`. Lo que no puede repetirse es la clave con la que un plato
    // las pide: dos bases con la misma clave y una de las dos es inalcanzable.
    const vistos = BASES.map(claveDeBase);
    expect(vistos.filter(Boolean)).toHaveLength(BASES.length);
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  // Una base se encuentra por su `mainBase` (las siete de fécula) o por su
  // `baseKey` (las que no son fécula, como el sofrito). Lo que no puede es no
  // tener ninguna de las dos: sería una base que ningún plato puede pedir.
  it("toda base tiene clave, y si es de fécula esa clave es del vocabulario cerrado", () => {
    for (const b of BASES) {
      expect(b.mainBase ?? b.baseKey, `${b.name} no tiene clave`).toBeTruthy();
      if (b.mainBase) expect(MAIN_BASES).toContain(b.mainBase);
    }
  });

  it("las claves no se repiten: dos bases con la misma clave se taparian", () => {
    const claves = BASES.map((b) => b.baseKey ?? b.mainBase);
    expect(new Set(claves).size).toBe(claves.length);
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
    expect(sesionDeBases({}, recetas, opts)).toEqual({
      bases: [], minutosTotales: 0, ahorroTotal: 0,
      minutosActivosTotales: 0, ahorroActivoTotal: 0,
    });
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

describe("tiempo activo: el numero que de verdad importa", () => {
  // El fallo que esto arregla: se le enseñaba al usuario un ahorro de ~66
  // minutos por semana que, medido en atención, eran 6. El resto era la olla
  // sola. Nadie dice "no tengo tiempo" porque el reloj corra.
  it("separa estar delante de que la olla hierva sola", () => {
    const base = {
      id: "b", minutosFijos: 60, minutosPorRacion: 0, capacidadMax: 20,
      stepsRich: [
        { text: "Picar.", minutes: 6, kind: "prep" },
        { text: "Hervir.", minutes: 54, kind: "pasivo" },
      ],
    };
    expect(fraccionActiva(base)).toBeCloseTo(0.1, 5);
    const t = tiempoDeBase(base, [4, 4]);
    // Dos platos, una sola olla: se ahorran los 60 fijos del segundo…
    expect(t.ahorro).toBe(60);
    // …pero solo 6 de ellos eran tuyos.
    expect(t.ahorroActivo).toBe(6);
  });

  it("una base que es todo trabajo de manos ahorra lo que dice", () => {
    // El sofrito: 20 minutos de picar y pochar, cero de espera. Aqui el
    // ahorro de reloj y el de atencion coinciden, y por eso es la base mas
    // valiosa aunque tarde menos que una olla de garbanzos.
    const sofrito = {
      id: "s", minutosFijos: 20, minutosPorRacion: 0, capacidadMax: 20,
      stepsRich: [{ text: "Picar y pochar.", minutes: 20, kind: "activo" }],
    };
    const t = tiempoDeBase(sofrito, [4, 4]);
    expect(t.ahorro).toBe(20);
    expect(t.ahorroActivo).toBe(20);
  });

  it("sin pasos que mirar no inventa: cuenta todo como activo", () => {
    expect(fraccionActiva({ id: "x" })).toBe(1);
    expect(fraccionActiva(null)).toBe(1);
  });

  it("las bases reales del catalogo ahorran mucho menos de lo que parecia", () => {
    // Guarda de regresion sobre el dato real: si alguien vuelve a poner el
    // ahorro de reloj delante del usuario, esto no lo pilla — pero si alguien
    // borra los `kind` de las bases, si.
    const pasta = BASES.find((b) => b.mainBase === "pasta");
    const legumbre = BASES.find((b) => b.mainBase === "legumbre");
    expect(fraccionActiva(pasta)).toBeLessThan(0.3);
    expect(fraccionActiva(legumbre)).toBeLessThan(0.1);
  });
});

describe("montajeTrasBases · lo que queda por hacer el martes", () => {
  // Un plato de libro: tres pasos de sofrito, uno que lo junta, uno de cocinar.
  const plato = {
    name: "Plato con sofrito",
    basesAparte: ["sofrito"],
    stepsRich: [
      { text: "Picar la cebolla.", minutes: 5, kind: "prep", base: "sofrito" },
      { text: "Pocharla a fuego suave.", minutes: 15, kind: "activo", base: "sofrito" },
      { text: "Añadir el tomate y reducir.", minutes: 10, kind: "pasivo", base: "sofrito" },
      { text: "Añadir el sofrito a la sartén con el pollo.", minutes: 2, kind: "activo" },
      { text: "Saltear el pollo.", minutes: 6, kind: "activo" },
      { text: "Servir.", minutes: 1, kind: "emplatado" },
    ],
  };

  // El sofrito de verdad cuesta 2 minutos de manos volver a ponerlo en marcha
  // (sacar el bote y darle un minuto de sarten), y esos 2 se cobran.
  const REACTIVAR_SOFRITO = costeDeReactivar(BASES.find((b) => b.baseKey === "sofrito"));

  it("quita los pasos de la base y deja el que la junta con el resto", () => {
    const m = montajeTrasBases(plato);
    expect(m.pasosQuitados).toBe(3);
    expect(m.minutosQuitados).toBe(30);
    // 2 + 6 + 1 de lo que queda, MAS lo que cuesta sacar el tupper y calentarlo.
    expect(m.minutos).toBe(9 + REACTIVAR_SOFRITO.minutos);
    expect(m.minutosActivos).toBe(8 + REACTIVAR_SOFRITO.minutosActivos);
    expect(m.etiquetado).toBe(true);
  });

  it("el ahorro neto descuenta lo que cuesta reactivar, que antes valia cero", () => {
    const m = montajeTrasBases(plato);
    expect(m.minutosQuitados).toBe(30);
    expect(m.minutosReactivar).toBe(REACTIVAR_SOFRITO.minutos);
    expect(m.minutosNetos).toBe(30 - REACTIVAR_SOFRITO.minutos);
  });

  it("solo se reactiva la base que de verdad se ha llevado algun paso", () => {
    // Declara arroz aparte, pero ningun paso es de arroz: no hay tupper de
    // arroz que sacar, y cobrarlo seria inventarse un coste.
    const m = montajeTrasBases({ ...plato, mainBase: "arroz", baseMode: "aparte" });
    expect(m.reactivadas).toEqual(["sofrito"]);
    expect(m.minutosReactivar).toBe(REACTIVAR_SOFRITO.minutos);
  });

  it("todas las bases del catalogo dicen como se reactivan", () => {
    // Sin esto el coste sale cero y la promesa del martes se queda corta. Lo
    // vigila tambien validate-catalog; aqui es el fusible del suite.
    const mudas = BASES.filter((b) => !b.reactivacion?.length);
    expect(mudas.map((b) => b.name)).toEqual([]);
  });

  it("reactivar el arroz es sobre todo esperar, no estar delante", () => {
    // El microondas trabaja solo: si alguien vuelve a marcar ese paso como
    // activo, el arroz pasa a "ahorrar" menos de lo que ahorra.
    const arroz = BASES.find((b) => b.mainBase === "arroz");
    const c = costeDeReactivar(arroz);
    expect(c.minutos).toBeGreaterThan(c.minutosActivos);
  });

  it("una base que NO se ha cocinado el domingo no se lleva nada (ni cuesta nada)", () => {
    const m = montajeTrasBases(plato, []);
    expect(m.pasosQuitados).toBe(0);
    expect(m.minutos).toBe(39);
    expect(m.minutosReactivar).toBe(0);
  });

  it("un plato sin etiquetar no es un plato que no ahorre: se sabe distinguir", () => {
    const sinEtiquetar = { ...plato, stepsRich: plato.stepsRich.map(({ base: _b, ...s }) => s) };
    const m = montajeTrasBases(sinEtiquetar);
    expect(m.etiquetado).toBe(false);
    expect(m.minutos).toBe(39);
    // Y por eso no se puede prometer que sea rápido, aunque lo fuera.
    expect(esMontajeRapido(sinEtiquetar)).toBe(false);
  });

  it("es de montaje rápido por los minutos TUYOS, no por los del reloj", () => {
    const alHorno = {
      basesAparte: ["patatas"],
      stepsRich: [
        { text: "Cocer las patatas.", minutes: 25, kind: "pasivo", base: "patatas" },
        { text: "Montar la fuente.", minutes: 5, kind: "activo" },
        { text: "Gratinar.", minutes: 20, kind: "pasivo" },
      ],
    };
    // 25 de reloj y 5 tuyos, mas lo que cueste sacar las patatas de la nevera.
    const r = costeDeReactivar(BASES.find((b) => b.mainBase === "patatas"));
    expect(montajeTrasBases(alHorno).minutos).toBe(25 + r.minutos);
    expect(montajeTrasBases(alHorno).minutosActivos).toBe(5 + r.minutosActivos);
    expect(esMontajeRapido(alHorno)).toBe(true);
  });

  it("un guiso de hora y media no es cena de martes por poco que te ate", () => {
    // El tope de MANOS solo no basta: esto son 8 minutos tuyos y 100 de reloj.
    const guiso = {
      basesAparte: ["sofrito"],
      stepsRich: [
        { text: "Pochar la cebolla.", minutes: 20, kind: "activo", base: "sofrito" },
        { text: "Sellar la carne.", minutes: 6, kind: "activo" },
        { text: "Guisar a fuego lento.", minutes: 100, kind: "pasivo" },
      ],
    };
    const m = montajeTrasBases(guiso);
    expect(m.minutosActivos).toBeLessThanOrEqual(MINUTOS_DE_MONTAJE);
    expect(m.minutos).toBeGreaterThan(MINUTOS_DE_DIARIO);
    expect(esMontajeRapido(guiso)).toBe(false);
  });

  it("loQueGana ve que un plato pasa de no caber a caber por el RELOJ", () => {
    // El caso del arroz: 8 minutos de manos antes y despues (no gana nada por
    // ese lado), pero la olla se lleva media hora de reloj.
    const conArroz = {
      mainBase: "arroz", baseMode: "aparte",
      stepsRich: [
        { text: "Cocer el arroz.", minutes: 30, kind: "pasivo", base: "arroz" },
        { text: "Saltear el pollo.", minutes: 8, kind: "activo" },
        { text: "Juntar y servir.", minutes: 20, kind: "pasivo" },
      ],
    };
    const g = loQueGana(conArroz);
    expect(g.relojAntes).toBe(58);
    expect(g.relojDespues).toBeLessThanOrEqual(MINUTOS_DE_DIARIO);
    expect(g.cruzaPorReloj).toBe(true);
    // Por manos no gana: cocer arroz no te ata. Y aun asi la tanda sirve.
    expect(g.cruzaPorManos).toBe(false);
  });

  it("pasarlo a .filter() no lo rompe: el indice no es una lista de bases", () => {
    // `[plato].filter(esMontajeRapido)` pasa (item, 0, array). Ese 0 reventaba
    // el Set, y un 1 habria pasado por "ninguna base lista" en silencio.
    expect(() => [plato].filter(esMontajeRapido)).not.toThrow();
    expect([plato].filter(esMontajeRapido)).toHaveLength(1);
  });

  it("clavesDeReceta ve la fécula aparte y lo de basesAparte, sin repetir", () => {
    expect(clavesDeReceta({ mainBase: "arroz", baseMode: "aparte", basesAparte: ["sofrito"] }))
      .toEqual(["arroz", "sofrito"]);
    // "dentro" no es una base aprovechable: un risotto no se precocina.
    expect(clavesDeReceta({ mainBase: "arroz", baseMode: "dentro" })).toEqual([]);
  });

  it("el catálogo real: ningun paso marca una base que su plato no declare", () => {
    // El mismo invariante que vigila validate-catalog, aquí como fusible del
    // test suite: un campo que nombra una base fantasma promete una tanda que
    // nadie va a cocinar.
    const huerfanos = [];
    for (const r of recipeCatalog) {
      const propias = new Set(clavesDeReceta(r));
      for (const paso of r.stepsRich ?? []) {
        if (paso.base && !propias.has(paso.base)) huerfanos.push(`${r.id}: ${paso.base}`);
      }
    }
    expect(huerfanos).toEqual([]);
  });
});
