/**
 * Cumplimiento del flujo y salud de las skills (#341). Sin secretos y sin coste:
 * solo lee GitHub (`gh api graphql`, con el token del workflow) y el repo.
 *
 *   npm run cumplimiento                      → las líneas de los indicadores y de las skills
 *   npm run cumplimiento -- --informe f.md    → además, el informe en Markdown (lo publica flujo-semanal.yml)
 *   npm run cumplimiento -- --local           → suma la poda: skills sin uso según el registro local de la fábrica (#340)
 *   npm run cumplimiento -- --issues f.json   → issues ya leídos (forma de CONSULTA_FLUJO, lista de nodos) en vez de la red
 *   npm run cumplimiento -- --skills-pr lista → CI: higiene y ensayo gratis de las skills que toca el PR (1 si hay una falta)
 *
 * Salida: 0 (aunque un indicador dispare: lo cuenta el informe, no es un fallo de este
 * script), 1 solo en --skills-pr con faltas, 2 entrada mala. Los indicadores y sus umbrales:
 * scripts/lib/cumplimiento.mjs y scripts/lib/saludSkills.mjs.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dirFabrica } from "../.claude/hooks/eventos.mjs";
import { CONSULTA_FLUJO, INDICADORES, desdeGraphql, lineaDeIndicador, lineasDeUso, medirIndicadores, usoDeSkills } from "./lib/cumplimiento.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { INDICADORES_SKILLS, lineaDeIndicadorSkill, saludDeSkills } from "./lib/saludSkills.mjs";
import { RAIZ, nombresDeSkills, skillsTocadas } from "./lib/skills.mjs";
import { medirUso } from "./lib/usoSkills.mjs";

/** Todos los issues, por páginas de 100. Lanza si la API no responde (quien llama lo trata como «sin datos»). */
export function issuesDeGithub() {
  const out = [];
  let cursor = null;
  do {
    const args = ["api", "graphql", "-f", `query=${CONSULTA_FLUJO}`];
    if (cursor) args.push("-f", `cursor=${cursor}`);
    const pag = JSON.parse(execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 })).data.repository.issues;
    out.push(...pag.nodes);
    cursor = pag.pageInfo.hasNextPage ? pag.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

/** El informe en Markdown. Solo números, vocabulario y números de issue: el repo es público. */
export function informe({ indicadores, salud, uso = null, hoy }) {
  const dispara = [...indicadores, ...salud.indicadores].filter((m) => m.estado === "dispara");
  const sinDatos = indicadores.some((m) => m.estado === "sin_datos");
  const L = [];
  L.push(`## Flujo y skills: informe semanal (${hoy})`, "");
  L.push(dispara.length
    ? `**${dispara.length} indicador${dispara.length > 1 ? "es" : ""} fuera de umbral.** Para registrarlo como caso: \`npm run issues -- --nuevo "…" --tipo caso …\` (busca los parecidos y no duplica); no se abre nada solo.`
    : "Ningún indicador fuera de umbral.");
  if (sinDatos) L.push("", "_La API de GitHub no respondió: los indicadores del flujo salen «sin_datos», no «ok»._");
  L.push("", "### Cumplimiento del flujo", "", "```");
  for (const m of indicadores) L.push(lineaDeIndicador(m));
  L.push("```", "", "Qué mide cada uno (disparan con más de su umbral):", "");
  for (const [id, d] of Object.entries(INDICADORES)) L.push(`- \`${id}\`: ${d.que}.`);
  L.push("", "### Salud de las skills (sin coste: nivel 1, higiene y ensayo del nivel 2)", "", "```");
  for (const m of salud.indicadores) L.push(lineaDeIndicadorSkill(m));
  L.push("```", "", "Qué mide cada uno:", "");
  for (const [id, d] of Object.entries(INDICADORES_SKILLS)) L.push(`- \`${id}\`: ${d.que}.`);
  const faltas = salud.filas.reduce((n, f) => n + f.faltas, 0);
  const avisos = salud.filas.reduce((n, f) => n + f.avisos, 0);
  L.push("", `Higiene: ${salud.filas.length} skills, ${faltas} faltas y ${avisos} avisos.`, "", "| skill | faltas | avisos | caducidad | última pasada de pago |", "|---|---|---|---|---|");
  for (const f of salud.filas) {
    const p = f.pasada ? `${f.pasada.fecha} ${f.pasada.resultado}, disparo ${f.pasada.disparo}, comprobaciones ${f.pasada.comprobaciones}${f.pasada.desactualizada ? " (desactualizada)" : ""}` : "sin pasada";
    L.push(`| ${f.nombre} | ${f.faltas} | ${f.avisos} | ${f.caducidad}${f.dias === null ? "" : ` (${f.dias} d)`} | ${p} |`);
  }
  if (uso) L.push("", "### Poda (registro local de la fábrica)", "", "```", ...lineasDeUso(uso), "```");
  return L.join("\n");
}

/** El registro local de la fábrica (#340), o null si no existe. */
function leerRegistro(dir = dirFabrica()) {
  const ruta = join(dir, "eventos.jsonl");
  if (!existsSync(ruta)) return null;
  return readFileSync(ruta, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { /* a propósito: una línea corrupta no vale; se salta */ return []; }
  });
}

/** CI: higiene (falta = falla) y ensayo gratis del nivel 2 de las skills que toca el PR. */
function skillsDelPr(lista) {
  const ficheros = existsSync(lista) ? readFileSync(lista, "utf8").split(/\r?\n/).filter(Boolean) : [];
  const existentes = new Set(nombresDeSkills());
  const tocadas = skillsTocadas(ficheros).filter((s) => existentes.has(s));
  if (!tocadas.length) {
    console.log("Higiene de skills: el PR no toca ninguna.");
    return 0;
  }
  const salud = saludDeSkills();
  let malas = 0;
  for (const f of salud.filas.filter((x) => tocadas.includes(x.nombre))) {
    console.log(`higiene skill: ${f.nombre} faltas: ${f.faltas} avisos: ${f.avisos}`);
    if (f.faltas) malas++;
  }
  if (malas) console.log(`${malas} skill(s) con faltas: \`npm run higiene-skills -- <skill>\` da cada defecto con su arreglo.`);
  // Ensayo del nivel 2: valida los casos y dice lo que correría; no llama a ninguna API.
  const r = spawnSync(process.execPath, [join(RAIZ, "scripts/skills-prueba.mjs"), ...tocadas, "--ensayo"], { cwd: RAIZ, encoding: "utf8" });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return malas || r.status ? 1 : 0;
}

async function main(argv) {
  const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  for (const n of ["--informe", "--issues", "--skills-pr"]) {
    if (argv.includes(n) && !opcion(n)) { console.error(`${n} necesita un valor`); return 2; }
  }
  if (opcion("--skills-pr")) return skillsDelPr(opcion("--skills-pr"));

  let nodos = null;
  try {
    nodos = opcion("--issues") ? JSON.parse(readFileSync(opcion("--issues"), "utf8")) : issuesDeGithub();
  } catch (e) {
    console.error(`No se han podido leer los issues (${String(e.stderr ?? e.message).trim().split("\n")[0]}): los indicadores salen sin_datos.`);
  }
  const hoy = new Date();
  const indicadores = medirIndicadores(nodos?.map(desdeGraphql) ?? null, { hoy });
  const salud = saludDeSkills(RAIZ, hoy);
  let uso = null;
  if (argv.includes("--local")) {
    const reg = leerRegistro();
    // La cifra de la semana es la de `npm run skills-uso` (transcripts de este PC, la del plano 2); la poda de 90 días, del registro.
    let principal = RAIZ;
    try {
      principal = dirname(execFileSync("git", ["-C", RAIZ, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    } catch {
      // a propósito: fuera de git se usa la carpeta del script; en el peor caso no hay transcripts y la semana sale del registro
    }
    const medida = medirUso(RAIZ, { principal });
    uso = reg ? usoDeSkills(reg, nombresDeSkills(), hoy, medida?.sinUso ?? null) : null;
  }
  for (const m of indicadores) console.log(lineaDeIndicador(m));
  for (const m of salud.indicadores) console.log(lineaDeIndicadorSkill(m));
  if (uso) for (const l of lineasDeUso(uso)) console.log(l);
  if (opcion("--informe")) writeFileSync(opcion("--informe"), `${informe({ indicadores, salud, uso, hoy: diaMadrid(hoy) })}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await main(process.argv.slice(2)));
}
