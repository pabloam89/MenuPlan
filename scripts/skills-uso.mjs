// npm run skills-uso: cuántas veces se abrió cada skill esta semana y quién tocó
// un dominio sin abrir la suya (#397). Lee los transcripts de Claude Code de
// ESTE PC (detalle y límites en scripts/lib/usoSkills.mjs); no toca ningún hook.
//
//   npm run skills-uso                  la tabla de uso, las skills sin uso y los dominios sin skill
//   npm run skills-uso -- --lineas      además, una línea contable por apertura y por dominio sin skill
//   npm run skills-uso -- --json        todo, para máquinas
//   npm run skills-uso -- --dias 14     otra ventana (por defecto, 7 días)
//
// La misma medición entra en `npm run planos` (plano 2, nivel 4: cifra_umbral
// `skills_sin_uso_semana` y `dominio_sin_skill_semana`).

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

import { VENTANA_DIAS, VIAS, medirUso } from "./lib/usoSkills.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const iDias = args.indexOf("--dias");
const dias = iDias >= 0 ? Number(args[iDias + 1]) : VENTANA_DIAS;
if (!Number.isInteger(dias) || dias < 1 || dias > 30) {
  console.error("--dias va de 1 a 30 (Claude Code borra los transcripts de más de 30 días).");
  process.exit(2);
}

/** La carpeta principal del repo (de ella sale el nombre de las carpetas de transcripts). */
function carpetaPrincipal(raiz) {
  try {
    return dirname(execFileSync("git", ["-C", raiz, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    return raiz; // a propósito: fuera de git se usa la carpeta del script; en el peor caso no encuentra transcripts y lo dice
  }
}

const m = medirUso(RAIZ, { principal: carpetaPrincipal(RAIZ), dias });
if (!m) {
  console.log(`Sin transcripts de este repo en los últimos ${dias} días en este PC: sin comprobar.`);
  process.exit(0);
}
if (args.includes("--json")) {
  console.log(JSON.stringify(m, null, 2));
  process.exit(0);
}

console.log(`Uso de skills desde ${m.desde.slice(0, 10)} (${dias} días), solo sesiones de este PC: ${m.sesiones} transcripts, ${m.conActividad} con alguna skill o dominio.\n`);
const ancho = Math.max(...Object.keys(m.uso).map((s) => s.length));
console.log(`${"skill".padEnd(ancho)}  ${VIAS.map((v) => v.padStart(11)).join(" ")}  total`);
for (const [skill, u] of Object.entries(m.uso)) console.log(`${skill.padEnd(ancho)}  ${VIAS.map((v) => String(u[v]).padStart(11)).join(" ")}  ${String(u.total).padStart(5)}`);
console.log(`\nSin uso deliberado (sin herramienta, lectura ni orden): ${m.sinUso.length ? m.sinUso.join(", ") : "ninguna"}.`);
console.log(`Dominios tocados sin abrir antes su skill: ${m.sinSkill.length}.`);
const porSkill = {};
for (const t of m.sinSkill) porSkill[`${t.skill} (${t.como})`] = (porSkill[`${t.skill} (${t.como})`] ?? 0) + 1;
for (const [k, n] of Object.entries(porSkill).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
if (args.includes("--lineas")) {
  console.log("");
  for (const l of m.lineas) console.log(l);
}
