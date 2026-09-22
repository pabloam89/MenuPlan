import { describe, expect, it } from "vitest";
import { resolverMenu, candidatosDeHueco } from "./solver.js";
import { buildGroupContext, DEFAULT_FREQS } from "./aiPlanner.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { splitAchievableFreqs, validateMenu } from "../utils/validateMenu.js";
import { repartoAFreqs, repartoPorDefecto, presupuestoDeTopes } from "./reparto.js";

// Benchmark, no test de correccion: cuanto cuesta un solve y con que freqs
// existe siquiera una solucion. Tres configuraciones, de la imposible a la
// que produce C2.
const casa = {
  members: [{ id: "m1", age: 38 }, { id: "m2", age: 40 }],
  groups: [{ id: "g1", label: "Adultos", memberIds: ["m1", "m2"] }],
  meals: ["Comida", "Cena"], schedule: {}, slotType: {},
  cookLevel: "normal", timeWeekday: 45, timeWeekend: 60,
};

// Solo bajo demanda: tarda ~30 s y no es un test de correccion.
//   BENCH=1 npx vitest run src/lib/solver.bench
describe.skipIf(!process.env.BENCH)("bench", () => {
  it("tres freqs: la imposible, la de normalizeData y la de C2", () => {
    const ctx = buildGroupContext(casa, casa.groups[0]);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    const tam = ctx.slots.map((s) => candidatosDeHueco(pool, s).length);
    console.log(`POOL ${pool.length} SLOTS ${ctx.slots.length} dominios min=${Math.min(...tam)} max=${Math.max(...tam)}`);

    const exacto = repartoAFreqs(repartoPorDefecto(), { presupuesto: ctx.slots.length });
    const casos = {
      "DEFAULT_FREQS (suma 14, la de C2 rota)": DEFAULT_FREQS,
      "normalizeData default {leg2,verd3,pesc2}": { legumbres: 2, verdura: 3, pescado: 2 },
      "reparto -> 21 huecos exactos (sin holgura: no hay solucion)": exacto,
      "reparto -> presupuestoDeTopes(21) con objetivo exacto (lo que produce App.jsx)":
        repartoAFreqs(repartoPorDefecto(), { presupuesto: presupuestoDeTopes(ctx.slots.length) }),
    };
    for (const [nombre, freqsRaw] of Object.entries(casos)) {
      const { achievable } = splitAchievableFreqs(pool, freqsRaw);
      const suma = Object.values(achievable).reduce((a, b) => a + b, 0);
      const objetivo = nombre.includes("objetivo") ? exacto : null;
      const r = resolverMenu(ctx.slots, pool, { freqs: achievable, objetivo, maxNodos: 5000, maxMs: 15000 });
      const v = r.completo
        ? validateMenu(r.asignaciones, pool, ctx.slots, [], achievable, {}).violations.length
        : "-";
      console.log(`[${nombre}] suma_topes=${suma} -> completo=${r.completo} asignados=${r.asignaciones.length}/21 nodos=${r.nodos} ms=${r.ms} violaciones_final=${v}`);
    }
    expect(true).toBe(true);
  }, 120000);
});
