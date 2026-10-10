/**
 * Higiene de una skill (#411, fondo #408): la lista de sus defectos, cada uno con
 * su arreglo. Gratis: no llama a ningún modelo (eso es `skills-prueba`).
 *
 *   npm run higiene-skills -- vercel          → los defectos de esa skill
 *   npm run higiene-skills -- --todas         → el informe de todas, con la cifra
 *   npm run higiene-skills -- vercel --json   → lo mismo en JSON
 *
 * Usa los controles de `scripts/lib/skills.mjs` y `skillsForja.mjs` sin la lista
 * de excepciones, y añade lo que el test de forma no ve (`scripts/lib/higieneSkills.mjs`).
 * Una línea por skill, para contarla:
 *   higiene skill: <s> faltas: a avisos: b solape: 0.12 con: <otra>
 * Salida: 0 sin faltas (los avisos no fallan), 1 con alguna falta, 2 entrada mala.
 */
import { RAIZ, nombresDeSkills } from "./lib/skills.mjs";
import { cargarSkill } from "./lib/skills.mjs";
import { higieneDeSkill, lineaDeResumen, solapeMaximo, ctxHigiene } from "./lib/higieneSkills.mjs";

const argv = process.argv.slice(2);
const todas = nombresDeSkills();
const pedidas = argv.includes("--todas") ? todas : argv.filter((a) => !a.startsWith("--"));
const JSON_ = argv.includes("--json");

if (!pedidas.length) {
  console.error(`Di qué skill: npm run higiene-skills -- <skill> (o --todas). Hay: ${todas.join(", ")}`);
  process.exit(2);
}
const desconocidas = pedidas.filter((s) => !todas.includes(s));
if (desconocidas.length) {
  console.error(`No existen: ${desconocidas.join(", ")}`);
  process.exit(2);
}

const hoy = new Date();
const informe = pedidas.map((nombre) => {
  const skill = cargarSkill(nombre, RAIZ);
  const ctx = ctxHigiene(nombre, RAIZ, hoy);
  return { nombre, defectos: higieneDeSkill(skill, ctx), solape: solapeMaximo(skill, ctx.catalogo) };
});

if (JSON_) {
  console.log(JSON.stringify(informe, null, 2));
} else {
  for (const r of informe) {
    console.log(lineaDeResumen(r.nombre, r.defectos, r.solape));
    for (const d of r.defectos) console.log(`  ${d.gravedad} ${d.codigo}: ${d.detalle}\n    arreglo: ${d.arreglo}`);
  }
  const faltas = informe.reduce((n, r) => n + r.defectos.filter((d) => d.gravedad === "falta").length, 0);
  const avisos = informe.reduce((n, r) => n + r.defectos.filter((d) => d.gravedad === "aviso").length, 0);
  const limpias = informe.filter((r) => !r.defectos.length).length;
  console.log(`Higiene: ${informe.length} skills, ${limpias} sin defectos, ${faltas} faltas y ${avisos} avisos.`);
}
process.exit(informe.some((r) => r.defectos.some((d) => d.gravedad === "falta")) ? 1 : 0);
