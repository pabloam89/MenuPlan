/**
 * Higiene de una skill (#411, fondo #408): la lista de sus defectos, cada uno con
 * su arreglo, y su ficha de huecos (#457). Gratis: no llama a ningún modelo (eso es `skills-prueba`).
 *
 *   npm run higiene-skills -- vercel          → los defectos de esa skill y los huecos de su ficha
 *   npm run higiene-skills -- --todas         → el informe de todas, con la cifra
 *   npm run higiene-skills -- vercel --ficha  → la ficha entera (también lo que cumple)
 *   npm run higiene-skills -- vercel --json   → lo mismo en JSON
 *
 * Usa los controles de `scripts/lib/skills.mjs` y `skillsForja.mjs` sin la lista
 * de excepciones, y añade lo que el test de forma no ve (`scripts/lib/higieneSkills.mjs`).
 * La ficha (`scripts/lib/fichasSkills.mjs`) junta lo que calculan los controles con los
 * juicios guardados en `ops/fichas-skills/<skill>.json`. Líneas para contar:
 *   higiene skill: <s> faltas: a avisos: b solape: 0.12 con: <otra>
 *   fichas skill: <s> criterios: n vigilados: a de_juicio: b juzgados: c cumple: … no_cumple: … no_aplica: … juicio: …
 *     skill: <s> criterio: <id> estado: no_cumple|juicio nota: …   (los huecos; con --ficha, todas)
 * Salida: 0 sin faltas (los avisos y los huecos no fallan), 1 con alguna falta, 2 entrada mala.
 */
import { RAIZ, nombresDeSkills } from "./lib/skills.mjs";
import { cargarSkill } from "./lib/skills.mjs";
import { higieneDeSkill, lineaDeResumen, solapeMaximo, ctxHigiene } from "./lib/higieneSkills.mjs";
import { cifrasDeFicha, fichaDeSkill, leerFichas, lineaDeCifras, lineaDelConjunto, lineasDeFicha, senalesDelRepo, sumarCifras } from "./lib/fichasSkills.mjs";
import { ESTADOS_CON_NOTA, leerForja } from "./lib/forja.mjs";

const argv = process.argv.slice(2);
const todas = nombresDeSkills();
const pedidas = argv.includes("--todas") ? todas : argv.filter((a) => !a.startsWith("--"));
const JSON_ = argv.includes("--json");
const FICHA = argv.includes("--ficha");

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
const senales = senalesDelRepo(RAIZ, hoy);
const guardadas = leerFichas(RAIZ);
const forja = leerForja(RAIZ);
const informe = pedidas.map((nombre) => {
  const skill = cargarSkill(nombre, RAIZ);
  const ctx = ctxHigiene(nombre, RAIZ, hoy);
  const ficha = fichaDeSkill(nombre, senales[nombre], guardadas[nombre], forja);
  return { nombre, defectos: higieneDeSkill(skill, ctx), solape: solapeMaximo(skill, ctx.catalogo), ficha, cifras: cifrasDeFicha(ficha) };
});

if (JSON_) {
  console.log(JSON.stringify(informe, null, 2));
} else {
  for (const r of informe) {
    console.log(lineaDeResumen(r.nombre, r.defectos, r.solape));
    for (const d of r.defectos) console.log(`  ${d.gravedad} ${d.codigo}: ${d.detalle}\n    arreglo: ${d.arreglo}`);
    console.log(lineaDeCifras(r.nombre, r.cifras));
    for (const l of lineasDeFicha(r.nombre, r.ficha, FICHA ? {} : { estados: ESTADOS_CON_NOTA })) console.log(`  ${l}`);
  }
  const faltas = informe.reduce((n, r) => n + r.defectos.filter((d) => d.gravedad === "falta").length, 0);
  const avisos = informe.reduce((n, r) => n + r.defectos.filter((d) => d.gravedad === "aviso").length, 0);
  const limpias = informe.filter((r) => !r.defectos.length).length;
  console.log(`Higiene: ${informe.length} skills, ${limpias} sin defectos, ${faltas} faltas y ${avisos} avisos.`);
  console.log(lineaDelConjunto(informe.length, sumarCifras(informe.map((r) => r.cifras))));
}
process.exit(informe.some((r) => r.defectos.some((d) => d.gravedad === "falta")) ? 1 : 0);
