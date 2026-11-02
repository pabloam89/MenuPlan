import { afterEach, describe, expect, it, vi } from "vitest";

import {
  preferenciasDelMotor, casaCon, pesoDe, delGrupo, cumplimientoDelGrupo, resumenCumplimiento, textoDe,
  ESTADOS_CUMPLIMIENTO, MOTIVOS_INCUMPLIMIENTO, PESO_FUERZA, FACTOR_ORIGEN, CAMPOS_DEL_MOTOR,
} from "./cumplimiento.js";
import { FUENTES } from "./notepad.js";
import { FUERZAS_PREFERENCIA } from "./vocabularios.js";
import { PESO_RECIENTE, PESO_PRESUPUESTO, PESO_ORDEN_POOL, ruidoDe } from "./solver.js";
import { entradaDelMotor } from "./entradaMotor.js";
import { generateMenuWithAI } from "./aiPlanner.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

// Las preferencias que pesa el motor y el informe (trozo 31 de #1037), con lo que entrega el motor, no el JSON.
const RECETAS = recipeCatalog;
const apunte = (valor, extra = {}) => ({ valor, origen: "texto", ...extra });

// La libreta de una casa: lo dicho, lo visto, lo supuesto, lo delegado y lo caducado, con su vista ya proyectada.
const casa = {
  notepad: {
    v: 1,
    campos: {
      "tecnica.horno": apunte(1),
      "base.arroz": apunte(-1, { fuente: "visto", apuntado: "2026-10-30" }),
      "favoritos.queso": apunte(true, { fuente: "supuesto", apuntado: "2026-10-30" }),
      "freqs.pescado": apunte(2),
      "freqs.carne.@ninos": apunte(0, { fuente: "supuesto", apuntado: "2026-10-30" }),
      "freqs.huevos": apunte(3, { delegado: true }),
      "freqs.legumbres": apunte(1, { hasta: "2026-10-01" }),
    },
  },
  sesgos: { tecnica: { horno: 1 }, base: { arroz: -1 }, salsa: { si: 0, no: 1 } },
  favoritos: ["queso"],
  cocinas: { mexicana: 2, japonesa: 0, italiana: 1 },
};

describe("preferenciasDelMotor: cada preferencia con su operador, su fuerza y su origen", () => {
  const prefs = preferenciasDelMotor(casa, { hoy: "2026-11-02" });
  const por = Object.fromEntries(prefs.map((p) => [p.id, p]));

  it("los sesgos ordenan (más / menos); su origen sale de la libreta y una regla, sin apunte, es dicha", () => {
    expect([por["tecnica.horno"].operador, por["tecnica.horno"].origen, por["tecnica.horno"].fuerza]).toEqual(["mas", "dicho", "medio"]);
    expect([por["base.arroz"].operador, por["base.arroz"].origen, por["base.arroz"].fuerza]).toEqual(["menos", "visto", "bajo"]);
    // «no» a la salsa es menos platos con salsa, como en sesgos.js; un sesgo a cero no es nada.
    expect([por["salsa.no"].operador, por["salsa.no"].origen, por["salsa.si"]]).toEqual(["menos", "dicho", undefined]);
    expect([por["favoritos.queso"].operador, por["favoritos.queso"].origen]).toEqual(["mas", "supuesto"]);
  });

  it("la cuota de cocinas es un mínimo; una cocina a cero, o una de siempre (sin cuota), no es nada", () => {
    expect([por["cocina.mexicana"].operador, por["cocina.mexicana"].cantidad]).toEqual(["al_menos", 2]);
    expect([por["cocina.japonesa"], por["cocina.italiana"]]).toEqual([undefined, undefined]);
  });

  it("un tope dicho es obligatorio; uno supuesto pesa poco y nunca es cero; lo delegado y lo caducado no están", () => {
    expect([por["freqs.pescado"].operador, por["freqs.pescado"].cantidad, por["freqs.pescado"].fuerza]).toEqual(["como_mucho", 2, "obligatoria"]);
    expect([por["freqs.carne.@ninos"].cantidad, por["freqs.carne.@ninos"].fuerza, por["freqs.carne.@ninos"].ambito]).toEqual([1, "bajo", "ninos"]);
    expect([por["freqs.huevos"], por["freqs.legumbres"]]).toEqual([undefined, undefined]);
  });

  it("un tope de los niños no vale para los adultos", () => {
    const ids = (tipo) => delGrupo(prefs, { id: "g", tipo }).map((p) => p.id);
    expect(ids("ninos")).toContain("freqs.carne.@ninos");
    expect(ids("adultos")).not.toContain("freqs.carne.@ninos");
    expect(ids("adultos")).toContain("freqs.pescado");
  });

  it("entradaDelMotor las lleva, leídas con su fecha", () => {
    const e = entradaDelMotor({ ...casa, members: [{ id: "m1", age: 40 }], groups: [{ id: "g1", label: "Familia", memberIds: ["m1"] }], schedule: {} }, { hoy: "2026-11-02" });
    expect(e.preferencias.map((p) => p.id)).toEqual(prefs.map((p) => p.id));
    expect(Object.isFrozen(e.preferencias)).toBe(true);
  });
});

describe("pesoDe: lo dicho pesa más que lo visto y que lo supuesto, y cada escalón más que el de abajo", () => {
  const p = (fuerza, origen) => pesoDe({ fuerza, origen });
  it("por origen y por fuerza", () => {
    expect(p("medio", "dicho")).toBeGreaterThan(p("medio", "visto"));
    expect(p("medio", "visto")).toBeGreaterThan(p("medio", "supuesto"));
    expect(p("alto", "dicho")).toBeGreaterThan(p("medio", "dicho"));
    expect(p("medio", "dicho")).toBeGreaterThan(p("bajo", "dicho"));
    expect(p("obligatoria", "dicho")).toBe(Infinity);
  });
  it("un gusto dicho pesa más que el orden del pool y el ruido juntos (con el catálogo entero de pool), y menos que lo reciente y el presupuesto", () => {
    expect(p("medio", "dicho")).toBeGreaterThan(RECETAS.length * PESO_ORDEN_POOL + ruidoDe(RECETAS.length));
    expect(p("alto", "dicho")).toBeLessThan(Math.min(PESO_RECIENTE, PESO_PRESUPUESTO));
  });
  it("las listas cuadran: cada escalón es una fuerza de la 0109, cada origen una fuente de la libreta, cada clase se dice", () => {
    expect(Object.keys(PESO_FUERZA).filter((f) => !FUERZAS_PREFERENCIA.includes(f))).toEqual([]);
    expect(Object.keys(FACTOR_ORIGEN)).toEqual(FUENTES);
    for (const campo of CAMPOS_DEL_MOTOR) expect(textoDe({ campo, valor: "pescado", operador: "mas" })).toMatch(/^más \S/);
  });
});

describe("cumplimientoDelGrupo: cumplida, parcial o no, y por qué", () => {
  const horno = RECETAS.filter((r) => r.tecnica === "horno");
  const otras = RECETAS.filter((r) => r.tecnica && r.tecnica !== "horno");
  const pool = [...horno.slice(0, 10), ...otras.slice(0, 30)];
  const menu = (recetas) => recetas.map((r, i) => ({ slotId: `h${i}`, recipeId: r.id }));
  const pref = (extra) => ({ id: "x", campo: "tecnica", valor: "horno", origen: "dicho", fuerza: "medio", cantidad: null, ...extra });
  const estado = (p, recetas, enPool = pool) => cumplimientoDelGrupo([p], menu(recetas), enPool).preferencias[0];

  it("«más horno»: cumplida si sale más de lo que daría el azar, parcial si sale poco, no si no sale", () => {
    // En el pool, 10 de 40 al horno: el azar da 1,5 de 6 platos.
    expect(estado(pref({ operador: "mas" }), [...horno.slice(0, 3), ...otras.slice(0, 3)]).estado).toBe("cumplida");
    expect(estado(pref({ operador: "mas" }), [horno[0], ...otras.slice(0, 5)]).estado).toBe("parcial");
    expect(estado(pref({ operador: "mas" }), otras.slice(0, 6))).toMatchObject({ estado: "no", motivo: "pesaba_menos", veces: 0 });
    // Sin ningún plato posible que la cumpla, el motivo es ese.
    expect(estado(pref({ operador: "mas" }), otras.slice(0, 6), otras.slice(0, 30))).toMatchObject({ estado: "no", motivo: "sin_candidatos" });
  });

  it("«menos horno», «al menos» y «como mucho», por la cuenta", () => {
    expect(estado(pref({ operador: "menos" }), otras.slice(0, 6)).estado).toBe("cumplida");
    expect(estado(pref({ operador: "menos" }), [...horno.slice(0, 3), ...otras.slice(0, 3)]).estado).toBe("no");
    expect(estado(pref({ operador: "al_menos", cantidad: 2 }), [horno[0], ...otras.slice(0, 5)]).estado).toBe("parcial");
    expect(estado(pref({ operador: "al_menos", cantidad: 2 }), horno.slice(0, 2)).estado).toBe("cumplida");
    expect(estado(pref({ operador: "como_mucho", cantidad: 2 }), horno.slice(0, 3)).estado).toBe("no");
    expect(estado(pref({ operador: "como_mucho", cantidad: 3 }), horno.slice(0, 3)).estado).toBe("cumplida");
  });

  it("por hueco, las preferencias que pidieron el plato que salió; cada estado y motivo, de su lista", () => {
    const { porHueco } = cumplimientoDelGrupo([pref({ operador: "mas" }), pref({ id: "y", operador: "menos" })], menu([horno[0], otras[0]]), pool);
    expect(porHueco).toEqual({ h0: ["x"] });
    const filas = cumplimientoDelGrupo(preferenciasDelMotor(casa), menu(RECETAS.slice(0, 14)), RECETAS.slice(0, 200)).preferencias;
    expect(filas.every((f) => ESTADOS_CUMPLIMIENTO.includes(f.estado) && (f.motivo === null || MOTIVOS_INCUMPLIMIENTO.includes(f.motivo)))).toBe(true);
  });

  it("casaCon mira lo mismo que el sesgo (la salsa, con o sin) y la familia", () => {
    const salsa = RECETAS.find((r) => r.llevaSalsa === true);
    const sinSalsa = RECETAS.find((r) => r.llevaSalsa !== true);
    const pescado = RECETAS.find((r) => r.category === "pescados");
    expect([casaCon({ campo: "salsa", valor: "no" }, salsa), casaCon({ campo: "salsa", valor: "si" }, sinSalsa)]).toEqual([true, false]);
    expect([casaCon({ campo: "freqs", valor: "pescado" }, pescado), casaCon({ campo: "freqs", valor: "carne" }, pescado)]).toEqual([true, false]);
  });
});

describe("resumenCumplimiento: la cifra del plan y lo que se le dice a la familia", () => {
  const fila = (id, origen, estado, extra = {}) => ({ id, campo: "tecnica", valor: "horno", operador: "mas", cantidad: null, origen, estado, ...extra });
  it("cuenta solo lo dicho, dice una vez cada dicha que no se cumple, y sin dichas no hay %", () => {
    const r = resumenCumplimiento([fila("a", "dicho", "cumplida"), fila("b", "dicho", "no"), fila("b", "dicho", "no"),
      fila("c", "dicho", "parcial", { campo: "freqs", valor: "pescado", operador: "como_mucho", cantidad: 2 }), fila("d", "visto", "no", { campo: "base", valor: "arroz" })]);
    expect([r.dichas, r.cumplidas, r.pct]).toEqual([4, 1, 25]);
    expect(r.incumplidas).toEqual(["más cosas al horno"]);
    expect(resumenCumplimiento([]).pct).toBeNull();
    expect(textoDe({ campo: "freqs", valor: "pescado", operador: "como_mucho", cantidad: 2 })).toBe("como mucho 2 de pescado");
  });
});

describe("generateMenuWithAI devuelve el informe de la semana", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("por grupo, cada preferencia que le toca, y por hueco las que pesaron", async () => {
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    const data = {
      ...casa, members: [{ id: "m1", age: 38 }, { id: "m2", age: 40 }], allergiesReviewed: true, groups: [{ id: "g1", label: "Familia", memberIds: ["m1", "m2"] }],
      meals: ["Comida", "Cena"], schedule: {}, timeWeekday: 45, timeWeekend: 60, freqs: { legumbres: 2, verdura: 3, pescado: 2 },
    };
    const { cumplimiento } = await generateMenuWithAI(entradaDelMotor(data, { hoy: "2026-11-02" }));
    const ids = cumplimiento.preferencias.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["tecnica.horno", "freqs.pescado", "cocina.mexicana"]));
    expect(ids).not.toContain("freqs.carne.@ninos");
    expect(cumplimiento.preferencias.every((f) => f.grupo === "g1")).toBe(true);
    expect(Object.keys(cumplimiento.porHueco)).toEqual(["g1"]);
  }, 60000);
});
