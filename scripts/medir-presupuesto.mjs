/**
 * Mide el presupuesto semanal en el motor de verdad (#958): la cobertura de
 * precios del catálogo estrella y, para una casa de dos adultos, el coste y
 * el tiempo de generar la semana sin presupuesto, con 80 € y con 50 €.
 *
 *   npm run medir:presupuesto            (dos semillas)
 *
 * Va por api/_bot/core.mjs (el motor del bot, con el solver), que este
 * script vuelve a empaquetar: Node a secas no carga src/.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const b = spawnSync(process.execPath, [path.join(ROOT, "scripts/build-bot-core.mjs")], { stdio: "inherit" });
if (b.status !== 0) process.exit(b.status ?? 1);
const m = await import(`file:///${path.join(ROOT, "api/_bot/core.mjs").replace(/\\/g, "/")}`);

// 1. Cobertura: platos estrella con precio en todas sus líneas y en el 80 %.
const estrella = m.recipeCatalog.filter((r) => r.estrella === true);
const cob = estrella.map((r) => m.costeReceta(r, { modo: "granel" })?.cobertura ?? 0);
const pct = (n) => `${Math.round((n / estrella.length) * 1000) / 10} %`;
console.log(`estrella ${estrella.length} · todas las líneas con precio ${cob.filter((c) => c >= 1).length} (${pct(cob.filter((c) => c >= 1).length)}) · 80 % o más ${cob.filter((c) => c >= 0.8).length} (${pct(cob.filter((c) => c >= 0.8).length)})`);

// 2. Coste y tiempo de una semana, por el mismo camino que generar_menu.
const casa = (presupuesto) => m.resolveModeData({
  members: [{ id: "m1", name: "A", age: 38 }, { id: "m2", name: "B", age: 40 }],
  groups: [{ id: "g1", label: "Adultos", memberIds: ["m1", "m2"] }],
  meals: ["Comida", "Cena"], schedule: {}, slotType: {}, cookLevel: "normal",
  timeWeekday: 45, timeWeekend: 60, freqs: { legumbres: 2, verdura: 3, pescado: 2 }, allergiesReviewed: true,
  hasBudget: presupuesto != null, budget: presupuesto ?? 80,
});
const semillas = Number(process.argv[2]) || 2;
for (let s = 0; s < semillas; s++) {
  for (const presupuesto of [null, 80, 50]) {
    const data = casa(presupuesto);
    const t = Date.now();
    const { plan, recipes } = await m.generateMenuWithAI(data, {});
    const ms = Date.now() - t;
    const est = m.estimarSemana(plan, { recetas: recipes });
    console.log(`vuelta ${s + 1} · presupuesto ${presupuesto ?? "—"} · ${est.euros}–${est.eurosAlto} € · raciones ${est.raciones} (con precio ${est.conPrecio}, incompletas ${est.incompletas}, sin precio ${est.sinPrecio}) · veredicto ${m.veredicto(presupuesto, est) ?? "—"} · ${ms} ms`);
  }
}
