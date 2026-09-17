import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { generateGroupMenu, buildGroupContext, createPlannerStats } from "./aiPlanner.js";
import { validateMenu, splitAchievableFreqs, FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { casaAleatoria, crossWeekAleatorio } from "./casasAleatorias.js";
import { resolverMenu, REGLAS_RELAJABLES, familiasDe } from "./solver.js";

/**
 * Banco de resistencia del solver: N casas aleatorias por `generateGroupMenu`
 * ENTERO (solver + todos los enforcers de después), midiendo lo que importa:
 * si sale semana, si lo que sale pasa `validateMenu`, cuánto tarda, y si lo
 * que no cabe queda explicado.
 *
 *   STRESS=1 STRESS_N=1000 npx vitest run src/lib/solver.stress
 *
 * Escribe el detalle en STRESS_OUT (por defecto ./stress.json, ignorado por
 * git) y un resumen por consola.
 */
const N = Number(process.env.STRESS_N ?? 1000);
const SALIDA = process.env.STRESS_OUT ?? "stress.json";

const pct = (xs, p) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export async function medirUnidad(data, group, crossWeek, { format = "compact" } = {}) {
  const stats = createPlannerStats();
  const fila = { semilla: data._semilla, dureza: data._dureza, group: group.id, weekCount: crossWeek?.weekCount ?? 1 };
  const t = Date.now();
  try {
    const res = await generateGroupMenu(data, group, undefined, [], crossWeek, undefined, "prefer", { stats, format });
    fila.wallMs = Date.now() - t;
    const ctx = buildGroupContext(data, group);
    fila.bebe = !!ctx.isBabyGroup;
    fila.slots = ctx.slots.length;
    fila.asignados = res.slotAssignments.length;
    fila.motor = stats.motor;
    fila.nodos = stats.solverNodos;
    fila.solverMs = stats.solverMs;
    fila.completo = stats.solverCompleto;
    fila.llmCalls = stats.llmCalls;
    fila.llmMs = stats.llmMs;
    fila.tokens = stats.inputTokens + stats.outputTokens;
    fila.invalidFirstPass = stats.invalidFirstPass;
    fila.fallbackUsed = stats.fallbackUsed;

    const { achievable } = splitAchievableFreqs(res.filteredPool, ctx.config.freqs);
    const { violations } = validateMenu(
      res.slotAssignments, res.filteredPool, res.slotsContext, ctx.config.healthProfiles, achievable, {},
    );
    const relajados = new Set(res.relajados ?? []);
    const porIdPool = Object.fromEntries(res.filteredPool.map((r) => [r.id, r]));
    const familiasRelajadas = new Set();
    for (const a of res.slotAssignments) if (relajados.has(a.slotId)) for (const f of familiasDe(porIdPool[a.recipeId] ?? {})) familiasRelajadas.add(f);
    const porRegla = {};
    for (const v of violations) {
      // Lo relajado a propósito no es una violación inesperada: se cuenta aparte.
      if (relajados.has(v.slotId) && REGLAS_RELAJABLES.has(v.rule)) continue;
      if (v.rule === "freq_max_exceeded" && familiasRelajadas.has(v.targetKey)) continue;
      if (v.rule === "comida_sin_segundo" && (res.vacios ?? []).includes(`${v.slotId.split("_")[0]}_comida_2`)) continue;
      porRegla[v.rule] = (porRegla[v.rule] ?? 0) + 1;
    }
    fila.violaciones = porRegla;
    fila.relajados = relajados.size;
    fila.vaciosExplicados = (res.vacios ?? []).length;
    fila.huecos = porRegla.slot_faltante ?? 0;
    fila.otras = Object.entries(porRegla).filter(([r]) => r !== "slot_faltante").reduce((a, [, n]) => a + n, 0);
    fila.repetidos = res.slotAssignments.length - new Set(res.slotAssignments.map((s) => s.recipeId)).size;

    const objetivo = ctx.config.objetivo ?? {};
    const porId = Object.fromEntries(res.filteredPool.map((r) => [r.id, r]));
    const cuenta = {};
    for (const a of res.slotAssignments) {
      const rec = porId[a.recipeId];
      if (!rec) continue;
      for (const [f, m] of Object.entries(FREQ_KEY_MATCHERS)) if (m(rec)) cuenta[f] = (cuenta[f] ?? 0) + 1;
    }
    fila.cuenta = cuenta;
    fila.objetivo = objetivo;
    fila.excesoMax = Math.max(0, ...Object.keys(objetivo).map((f) => (cuenta[f] ?? 0) - objetivo[f]));
    fila.warnings = res.warnings.length;
    fila.avisos = res.warnings.map((w) => w.replace(/^[^:]+: /, "").slice(0, 90));
  } catch (err) {
    const msg = String(err?.message ?? err);
    // "Solo quedan N recetas tras filtrar" es una salida legítima de la app
    // (filterRecipes se niega a planificar con menos de 15): no es un fallo
    // del motor, es una casa que el catálogo no cubre. Se cuenta aparte.
    if (msg.startsWith("Solo quedan")) fila.poolInsuficiente = true;
    else fila.error = msg.slice(0, 200);
    fila.wallMs = Date.now() - t;
  }
  return fila;
}

export function resumir(filas) {
  const ok = filas.filter((f) => !f.error && !f.bebe && !f.poolInsuficiente);
  const num = (k) => ok.map((f) => f[k] ?? 0);
  const porDureza = {};
  for (const d of [0, 1, 2]) {
    const xs = ok.filter((f) => f.dureza === d);
    porDureza[d] = {
      n: xs.length,
      completas: xs.filter((f) => f.huecos === 0).length,
      conHuecos: xs.filter((f) => f.huecos > 0).length,
      huecosMedios: xs.length ? +(xs.reduce((a, f) => a + f.huecos, 0) / xs.length).toFixed(2) : 0,
      wallMsP50: pct(xs.map((f) => f.wallMs), 50),
      wallMsP95: pct(xs.map((f) => f.wallMs), 95),
    };
  }
  const reglas = {};
  for (const f of ok) for (const [r, n] of Object.entries(f.violaciones ?? {})) if (r !== "slot_faltante") reglas[r] = (reglas[r] ?? 0) + n;
  const avisos = {};
  for (const f of ok) for (const a of f.avisos ?? []) { const k = a.replace(/\d+/g, "#").replace(/"[^"]*"/g, "“…”").replace(/\([^)]*\)/g, "(…)").slice(0, 70); avisos[k] = (avisos[k] ?? 0) + 1; }
  return {
    unidades: filas.length,
    errores: filas.filter((f) => f.error).length,
    erroresEjemplo: [...new Set(filas.filter((f) => f.error).map((f) => f.error))].slice(0, 5),
    bebes: filas.filter((f) => f.bebe).length,
    poolInsuficiente: filas.filter((f) => f.poolInsuficiente).length,
    medidas: ok.length,
    semanaEntera: ok.filter((f) => f.huecos === 0).length,
    conHuecos: ok.filter((f) => f.huecos > 0).length,
    huecosTotales: ok.reduce((a, f) => a + f.huecos, 0),
    slotsTotales: ok.reduce((a, f) => a + f.slots, 0),
    conOtrasViolaciones: ok.filter((f) => f.otras > 0).length,
    otrasPorRegla: reglas,
    conRepetidos: ok.filter((f) => f.repetidos > 0).length,
    conRelajados: ok.filter((f) => f.relajados > 0).length,
    slotsRelajados: ok.reduce((a, f) => a + (f.relajados ?? 0), 0),
    huecosExplicados: ok.reduce((a, f) => a + (f.vaciosExplicados ?? 0), 0),
    excesoMax: { 0: ok.filter((f) => f.excesoMax === 0).length, 1: ok.filter((f) => f.excesoMax === 1).length, 2: ok.filter((f) => f.excesoMax === 2).length, "3+": ok.filter((f) => f.excesoMax >= 3).length },
    wallMs: { p50: pct(num("wallMs"), 50), p95: pct(num("wallMs"), 95), max: Math.max(0, ...num("wallMs")) },
    solverMs: { p50: pct(num("solverMs"), 50), p95: pct(num("solverMs"), 95), max: Math.max(0, ...num("solverMs")) },
    nodos: { p50: pct(num("nodos"), 50), p95: pct(num("nodos"), 95), max: Math.max(0, ...num("nodos")) },
    solverCompleto: ok.filter((f) => f.completo === true).length,
    llm: { calls: ok.reduce((a, f) => a + (f.llmCalls ?? 0), 0), ms: ok.reduce((a, f) => a + (f.llmMs ?? 0), 0), tokens: ok.reduce((a, f) => a + (f.tokens ?? 0), 0), invalidFirstPass: ok.reduce((a, f) => a + (f.invalidFirstPass ?? 0), 0), fallbackUsed: ok.reduce((a, f) => a + (f.fallbackUsed ?? 0), 0) },
    porDureza,
    avisosFrecuentes: Object.entries(avisos).sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

describe.skipIf(!process.env.STRESS)("resistencia del solver", () => {
  it(`${N} casas aleatorias por generateGroupMenu entero`, async () => {
    globalThis.localStorage = { getItem: (k) => (k === "mp_motor" ? "solver" : null) };
    const filas = [];
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const data = casaAleatoria(1000 + i);
      const crossWeek = crossWeekAleatorio(1000 + i);
      for (const group of data.groups) filas.push({ i, ...(await medirUnidad(data, group, crossWeek)) });
      if ((i + 1) % 100 === 0) console.log(`… ${i + 1}/${N} casas, ${Math.round((Date.now() - t0) / 1000)} s`);
    }
    const resumen = resumir(filas);
    resumen.totalSeg = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(SALIDA, JSON.stringify({ resumen, filas }, null, 1));
    console.log("RESUMEN " + JSON.stringify(resumen, null, 1));
    expect(resumen.errores).toBe(0);
  }, 6 * 3_600_000);

  it("determinista de verdad: misma casa y semilla, mismo menú, 50 veces", () => {
    let iguales = 0;
    for (let i = 0; i < 50; i++) {
      const data = casaAleatoria(5000 + i);
      const group = data.groups[0];
      const ctx = buildGroupContext(data, group);
      const { recipes: pool, error } = filterRecipes(ctx.filterOpts);
      if (error || ctx.isBabyGroup) continue;
      const { achievable } = splitAchievableFreqs(pool, ctx.config.freqs);
      const opts = { healthProfiles: ctx.config.healthProfiles, freqs: achievable, objetivo: ctx.config.objetivo, semilla: 42, maxMs: 60000 };
      const a = resolverMenu(ctx.slots, pool, opts).asignaciones;
      const b = resolverMenu(ctx.slots, pool, opts).asignaciones;
      expect(a).toEqual(b);
      iguales += 1;
    }
    console.log(`DETERMINISMO ${iguales} casas idénticas dos veces`);
    expect(iguales).toBeGreaterThan(30);
  }, 600_000);
});
