// npm run skills-encargo: qué skills hay que abrir para un encargo (#397).
// Sale del mapa .claude/dominios-skills.json, nunca a mano: lo usa /orquestar
// para el brief de cada agente y el `revisor` para comprobar que se abrieron.
//
//   npm run skills-encargo -- supabase/migrations/0099_x.sql vercel.json
//   npm run skills-encargo -- --diff                 los ficheros de esta rama frente a origin/staging
//   npm run skills-encargo -- --comando "node scripts/apply-migration.mjs 0099_x" <ficheros…>
//   npm run skills-encargo -- --agente datos <ficheros…>   dice cuáles ya trae precargadas
//
// La última línea es la que va al brief: `SKILLS A ABRIR: a, b` (o «ninguna»).

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { cargarMapa } from "../.claude/hooks/dominios.mjs";
import { precargadasDe, skillsDelEncargo } from "./lib/usoSkills.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const ficheros = [];
const comandos = [];
let agente = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--comando") comandos.push(args[++i] ?? "");
  else if (a === "--agente") agente = args[++i] ?? null;
  else if (a === "--diff") {
    const salida = execFileSync("git", ["-C", RAIZ, "diff", "--name-only", "origin/staging...HEAD"], { encoding: "utf8" });
    ficheros.push(...salida.split(/\r?\n/).filter(Boolean));
  } else ficheros.push(a);
}

const mapa = cargarMapa(RAIZ);
if (!mapa) {
  console.error("No puedo leer .claude/dominios-skills.json: sin mapa no sé qué skills tocan.");
  process.exit(2);
}
const precargadas = precargadasDe(RAIZ, agente);
const lista = skillsDelEncargo({ ficheros, comandos, mapa, precargadas });
for (const s of lista) {
  const por = s.motivo === "ruta" ? `ruta (${s.ficheros.slice(0, 3).join(", ")}${s.ficheros.length > 3 ? ` y ${s.ficheros.length - 3} más` : ""})` : "comando";
  console.log(`skill: ${s.skill} motivo: ${por}${s.precargada ? ` precargada: ${agente}` : ""}`);
}
const abrir = lista.filter((s) => !s.precargada).map((s) => s.skill);
const ya = lista.filter((s) => s.precargada).map((s) => s.skill);
console.log(`SKILLS A ABRIR: ${abrir.length ? abrir.join(", ") : "ninguna"}${ya.length ? ` (ya precargadas en ${agente}: ${ya.join(", ")})` : ""}`);
