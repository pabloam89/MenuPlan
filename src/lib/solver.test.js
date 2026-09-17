import { describe, expect, it } from "vitest";
import { resolverMenu, candidatosDeHueco, REGLAS_RELAJABLES } from "./solver.js";
import { buildGroupContext } from "./aiPlanner.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { validateMenu, splitAchievableFreqs, FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { repartoAFreqs, repartoPorDefecto, presupuestoDeTopes } from "./reparto.js";

/**
 * El solver contra el catálogo REAL, no contra recetas de mentira.
 *
 * Lo que tiene que demostrar es una sola cosa, y es la que hoy falla el 100 %
 * de las veces: que el menú que sale pasa `validateMenu` sin una violación.
 */
const casa = (extra = {}) => ({
  members: [{ id: "m1", age: 38 }, { id: "m2", age: 40 }],
  groups: [{ id: "g1", label: "Adultos", memberIds: ["m1", "m2"] }],
  meals: ["Comida", "Cena"],
  schedule: {},
  slotType: {},
  cookLevel: "normal",
  timeWeekday: 45,
  timeWeekend: 60,
  // Los freqs que tiene una casa real por defecto (normalizeData). Sin esto
  // buildGroupContext cae en DEFAULT_FREQS, que suma 14 topes para 21 huecos y
  // NO tiene solucion (ver C2): el primer intento de esta suite se colgo ahi.
  freqs: { legumbres: 2, verdura: 3, pescado: 2 },
  ...extra,
});

function resolverPara(data, opciones = {}) {
  const group = data.groups[0];
  const ctx = buildGroupContext(data, group);
  const { recipes: pool, error } = filterRecipes(ctx.filterOpts);
  if (error) throw new Error(error);
  const { achievable } = splitAchievableFreqs(pool, ctx.config.freqs);
  const res = resolverMenu(ctx.slots, pool, {
    healthProfiles: ctx.config.healthProfiles,
    freqs: achievable,
    // Solo el tope de NODOS, que es determinista. El de milisegundos existe
    // para el usuario que espera; en la suite, con veinte ficheros en
    // paralelo, cortaba la búsqueda en sitios distintos cada vez.
    maxMs: 120000,
    ...opciones,
  });
  return { ...res, ctx, pool, achievable };
}

describe("el solver produce menús VÁLIDOS, que es lo que hoy no pasa nunca", () => {
  it("una semana normal sale entera y sin una sola violación", () => {
    const { asignaciones, completo, ctx, pool, achievable } = resolverPara(casa());
    expect(completo).toBe(true);
    expect(asignaciones).toHaveLength(ctx.slots.length);

    const { valid, violations } = validateMenu(
      asignaciones, pool, ctx.slots, ctx.config.healthProfiles, achievable, {},
    );
    expect(violations.map((v) => `${v.rule} @ ${v.slotId}`)).toEqual([]);
    expect(valid).toBe(true);
  });

  it("una casa nueva de verdad: reparto por defecto, topes con holgura, objetivo exacto", () => {
    // Lo que produce App.jsx para quien no ha tocado nada: los topes llevan
    // HOLGURA_TOPES (sin ella no hay solución: los platos gastan 1,4 topes de
    // media) y el objetivo es el reparto exacto sobre los 21 huecos.
    const data = casa({ freqs: undefined });
    const ctx = buildGroupContext(data, data.groups[0]);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    const topes = repartoAFreqs(repartoPorDefecto(), { presupuesto: presupuestoDeTopes(ctx.slots.length) });
    const objetivo = repartoAFreqs(repartoPorDefecto(), { presupuesto: ctx.slots.length });
    const { achievable } = splitAchievableFreqs(pool, topes);
    const res = resolverMenu(ctx.slots, pool, { freqs: achievable, objetivo });

    expect(res.completo).toBe(true);
    const { violations } = validateMenu(res.asignaciones, pool, ctx.slots, [], achievable, {});
    expect(violations.map((v) => v.rule)).toEqual([]);

    // Y el objetivo GUÍA de verdad: la holgura de los topes no se convierte en
    // siete carnes. Ninguna familia se pasa del objetivo en más de dos platos.
    const porId = Object.fromEntries(pool.map((r) => [r.id, r]));
    const cuenta = {};
    for (const a of res.asignaciones) {
      for (const [f, m] of Object.entries(FREQ_KEY_MATCHERS)) if (m(porId[a.recipeId])) cuenta[f] = (cuenta[f] ?? 0) + 1;
    }
    for (const f of Object.keys(objetivo)) {
      expect(cuenta[f] ?? 0, `${f}: ${JSON.stringify(cuenta)} vs objetivo ${JSON.stringify(objetivo)}`)
        .toBeLessThanOrEqual(objetivo[f] + 2);
    }
  });

  it("una casa con prisa y cocina básica: lo que cabe sale válido, y lo que no cabe se dice", () => {
    const r = resolverPara(casa({ timeWeekday: 25, timeWeekend: 30, cookLevel: "basic" }));
    // Aquí el solver destapó una regla, no un bug: todos los primeros que
    // caben en 25 minutos son platos de montaje (ensalada de bote…) y la regla
    // 2b los prohíbe fuera de una cena rápida. Esos huecos se quedan sin
    // candidatos, y el solver lo dice en vez de esconderlo — es el primer
    // caso real de la pantalla de ajuste.
    // Quedan CUATRO primeros para siete huecos, y chocan entre sí: no hay
    // semana entera con todas las reglas, y la búsqueda lo demuestra en
    // dieciséis nodos.
    expect(r.completo).toBe(false);
    expect(r.sinCombinacion.length).toBeGreaterThan(0);
    // Pero todo lo demás se coloca: cada segundo y cada cena tienen plato.
    const sinPlato = r.ctx.slots
      .map((s) => s.slotId)
      .filter((id) => !r.asignaciones.some((a) => a.slotId === id));
    expect(sinPlato.filter((id) => !id.endsWith("_comida_1"))).toEqual([]);
    // Y todo lo que falta está explicado, y solo eso.
    expect([...sinPlato].sort()).toEqual([...r.sinCandidatos, ...r.sinCombinacion].sort());
    // Lo que se colocó relajando la orientación (fase 3) viene con nombre, y
    // fuera de esos huecos no hay ni una violación.
    const relajados = new Set(r.relajados);
    const { violations } = validateMenu(
      r.asignaciones, r.pool, r.ctx.slots, r.ctx.config.healthProfiles, r.achievable, {},
    );
    const inesperadas = violations.filter(
      (v) => v.rule !== "slot_faltante" && !(relajados.has(v.slotId) && REGLAS_RELAJABLES.has(v.rule)),
    );
    expect(inesperadas.map((v) => `${v.rule}@${v.slotId}`)).toEqual([]);
    // 1,7 s solo; con la suite entera en paralelo pasa de los 5 s por defecto.
  }, 30000);

  it("con alergias y una semana partida", () => {
    const fuera = {};
    for (const d of ["Jue", "Vie", "Sáb", "Dom"]) {
      for (const m of ["m1", "m2"]) { fuera[`${m}|${d}|Comida`] = "fuera"; fuera[`${m}|${d}|Cena`] = "fuera"; }
    }
    const { asignaciones, completo, ctx, pool, achievable } = resolverPara(casa({
      members: [{ id: "m1", age: 38, allergies: ["Gluten"] }, { id: "m2", age: 40 }],
      schedule: fuera,
    }));
    expect(completo).toBe(true);
    expect(asignaciones.length).toBe(ctx.slots.length);
    const { violations } = validateMenu(
      asignaciones, pool, ctx.slots, ctx.config.healthProfiles, achievable, {},
    );
    expect(violations.map((v) => v.rule)).toEqual([]);
  });
});

describe("determinista, y con variedad que se elige en vez de sufrirse", () => {
  it("la misma semilla da exactamente el mismo menú", () => {
    const a = resolverPara(casa(), { semilla: 7 }).asignaciones;
    const b = resolverPara(casa(), { semilla: 7 }).asignaciones;
    expect(a).toEqual(b);
  });

  it("una semilla distinta da un menú distinto", () => {
    // Hoy esto lo da la temperatura del modelo: azar que no se controla ni se
    // reproduce. Con semilla es el mismo efecto, pero fijable en un test.
    const a = resolverPara(casa(), { semilla: 1 }).asignaciones.map((s) => s.recipeId);
    const b = resolverPara(casa(), { semilla: 99 }).asignaciones.map((s) => s.recipeId);
    expect(a).not.toEqual(b);
  });

  it("nunca repite un plato en la semana", () => {
    const ids = resolverPara(casa()).asignaciones.map((s) => s.recipeId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("candidatosDeHueco: el dato que necesita la pantalla de ajuste", () => {
  it("dice cuántos platos caben en un hueco concreto", () => {
    const data = casa();
    const ctx = buildGroupContext(data, data.groups[0]);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    const cena = ctx.slots.find((s) => s.mealType === "cena");
    expect(candidatosDeHueco(pool, cena).length).toBeGreaterThan(0);
  });

  it("y cuántos ganarías subiendo el tiempo: eso es la pantalla", () => {
    const data = casa();
    const ctx = buildGroupContext(data, data.groups[0]);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    const cena = ctx.slots.find((s) => s.mealType === "cena");
    const apretado = candidatosDeHueco(pool, { ...cena, maxTime: 15 }).length;
    const holgado = candidatosDeHueco(pool, { ...cena, maxTime: 30 }).length;
    expect(holgado).toBeGreaterThan(apretado);
  });

  it("un hueco imposible da cero, sin romper", () => {
    const data = casa();
    const ctx = buildGroupContext(data, data.groups[0]);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    expect(candidatosDeHueco(pool, { ...ctx.slots[0], maxTime: 1 })).toEqual([]);
  });
});
