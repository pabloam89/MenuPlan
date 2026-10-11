/**
 * Cumplimiento del flujo y salud de las skills (#341). Sin secretos y sin coste:
 * solo lee GitHub (`gh api graphql`, con el token del workflow) y el repo.
 *
 *   npm run cumplimiento                      → las líneas de los indicadores y de las skills
 *   npm run cumplimiento -- --informe f.md    → además, el informe en Markdown (lo publica flujo-semanal.yml)
 *   npm run cumplimiento -- --local           → suma la poda: skills sin uso según el registro local de la fábrica (#340)
 *   npm run cumplimiento -- --issues f.json   → issues ya leídos (forma de CONSULTA_FLUJO, lista de nodos) en vez de la red
 *   npm run cumplimiento -- --skills-pr lista → CI: higiene y ensayo gratis de las skills que toca el PR (1 si hay una falta)
 *   npm run cumplimiento -- --historial f.txt → informes anteriores (texto con sus líneas `indicador:`), del más antiguo al
 *                                               más reciente: cada cifra sale con su margen de ruido (#480)
 *
 * Además, la línea del glosario (#481): excepciones por bajar y candidatos a término sin juzgar; y las
 * criterios de las skills (#457): una línea `criterios skill: …` por skill con la cifra de criterios
 * vigilados por un control y de juicio, y sus huecos en líneas `skill: x criterio: y estado: z`.
 *
 * Cada cifra va con su vigilante (ops/metricas.json, #480) y con su margen: ¿sale la de hoy del
 * ruido de las semanas de antes? (scripts/lib/ruido.mjs). Con pocas semanas, «sin datos suficientes».
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
import {
  CONSULTA_FLUJO, CONTRAPESOS, INDICADORES, desdeGraphql, lineaDeContrapeso, lineaDeIndicador, lineasDeUso, medirContrapesos, medirIndicadores, seriesDeHistorial, usoDeSkills,
} from "./lib/cumplimiento.mjs";
import { criteriosDelRepo, lineaDeCifras, lineaDelConjunto, lineasDeCriterios, sumarCifras } from "./lib/juiciosSkills.mjs";
import { estadoDelGlosario, lineaDelGlosario } from "./lib/glosarioCandidatos.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { leerMetricas } from "./lib/metricas.mjs";
import { lineaDeRuido, salDelMargen, textoDeRuido } from "./lib/ruido.mjs";
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

/**
 * Cada cifra del informe con su margen y su vigilante (#480). `cifras`: { id: valor } de hoy;
 * `series`: { id: [antes…] } (null = no se dio historial: todas «sin datos suficientes»);
 * `registro`: ops/metricas.json. → [{ id, valor, ruido, vigilante: { id, valor, emisor } | null }]
 */
export function antesYDespues({ cifras, series = null, registro }) {
  const porId = new Map((registro?.metricas ?? []).map((m) => [m.id, m]));
  return Object.entries(cifras).map(([id, valor]) => {
    const v = porId.get(porId.get(id)?.vigilante);
    return {
      id,
      valor,
      ruido: salDelMargen(series?.[id] ?? [], valor),
      vigilante: v ? { id: v.id, valor: Object.hasOwn(cifras, v.id) ? cifras[v.id] : null, aqui: Object.hasOwn(cifras, v.id), emisor: v.emisor } : null,
    };
  });
}

/** La tabla de antes y después para una persona: la cifra, su vigilante al lado y su margen. */
function tablaAntesYDespues(filas) {
  const n = (x) => (x === null || x === undefined ? "-" : String(x));
  const L = ["| cifra | hoy | vigilante | margen respecto a las semanas de antes |", "|---|---|---|---|"];
  for (const f of filas) {
    const v = f.vigilante;
    const vig = !v ? "SIN VIGILANTE (falta en ops/metricas.json)" : v.aqui ? `\`${v.id}\` = ${n(v.valor)}` : `\`${v.id}\` (se mide en \`${v.emisor}\`)`;
    L.push(`| \`${f.id}\` | ${n(f.valor)} | ${vig} | ${textoDeRuido(f.ruido)} |`);
  }
  return L;
}

/** El informe en Markdown. Solo números, vocabulario y números de issue: el repo es público. */
export function informe({ indicadores, salud, uso = null, glosario = null, criterios = null, contrapesos = [], margen = null, hoy }) {
  const dispara = [...indicadores, ...salud.indicadores].filter((m) => m.estado === "dispara");
  const sinDatos = indicadores.some((m) => m.estado === "sin_datos");
  const L = [];
  L.push(`## Flujo y skills: informe semanal (${hoy})`, "");
  L.push(dispara.length
    ? `**${dispara.length} indicador${dispara.length > 1 ? "es" : ""} fuera de umbral.** Para registrarlo como caso: \`npm run issues -- --nuevo "…" --tipo caso …\` (busca los parecidos y no duplica); no se abre nada solo.`
    : "Ningún indicador fuera de umbral.");
  if (sinDatos) L.push("", "_La API de GitHub no respondió: los indicadores del flujo salen «sin_datos», no «ok»._");
  const pocos = (margen ?? []).filter((f) => f.ruido.veredicto === "sin_datos_suficientes").length;
  if (pocos) L.push("", `_Sin datos suficientes en ${pocos} de ${margen.length} cifras: con menos semanas de antes que el mínimo, una subida o una bajada no se distingue del ruido. Con ellas no se dice «mejoró»._`);
  L.push("", "### Cumplimiento del flujo", "", "```");
  for (const m of indicadores) L.push(lineaDeIndicador(m));
  L.push("```", "", "Qué mide cada uno (disparan con más de su umbral):", "");
  for (const [id, d] of Object.entries(INDICADORES)) L.push(`- \`${id}\`: ${d.que}.`);
  if (contrapesos.length) {
    L.push("", "Contrapesos (sin umbral: vigilan a los indicadores, para que bajar uno no sea hacer trampa):", "", "```");
    for (const c of contrapesos) L.push(lineaDeContrapeso(c));
    L.push("```", "");
    for (const [id, d] of Object.entries(CONTRAPESOS)) L.push(`- \`${id}\`: ${d.que}.`);
  }
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
  if (criterios) {
    L.push("", "### Criterios de las skills", "", lineaDelConjunto(criterios.length, sumarCifras(criterios.map((f) => f.cifras))), "");
    L.push("Una línea por skill y, debajo, lo que no cumple (`no_cumple`). Los de juicio pendientes se cuentan en `juicio`, por motivo; los rellena una persona o un agente en `ops/juicios-skills/<skill>.json` con su evidencia (`npm run higiene-skills -- <skill>` los lista).", "", "```");
    for (const f of criterios) {
      L.push(lineaDeCifras(f.nombre, f.cifras));
      for (const l of lineasDeCriterios(f.nombre, f.filas, { estados: ["no_cumple"] })) L.push(`  ${l}`);
    }
    L.push("```");
  }
  if (glosario) {
    L.push("", "### Glosario", "", "```", lineaDelGlosario(glosario), "```", "");
    L.push("Excepciones que ya se pueden bajar y candidatos a término sin juzgar: los repasa un agente con `npm run glosario -- --medir` y `npm run glosario -- --candidatos` (método: `.claude/skills/higiene-de-skills/referencias/glosario.md`).");
  }
  if (uso) L.push("", "### Poda (registro local de la fábrica)", "", "```", ...lineasDeUso(uso), "```");
  if (margen) {
    L.push("", "### Antes y después, cada cifra con su vigilante", "");
    L.push("Una cifra que se persigue deja de medir: al lado va la que la vigila (`ops/metricas.json`). «Sube» o «baja de verdad» solo si sale de los límites de control (media de las semanas de antes ± 3 sigmas); dentro, es ruido.", "");
    L.push(...tablaAntesYDespues(margen), "", "```", ...margen.map((f) => lineaDeRuido(f.id, f.valor, f.ruido)), "```");
  }
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
  for (const n of ["--informe", "--issues", "--skills-pr", "--historial"]) {
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
  let glosario = null;
  try {
    glosario = estadoDelGlosario(RAIZ);
    console.log(lineaDelGlosario(glosario));
  } catch (e) {
    // a propósito: un glosario roto lo para su test en el CI; aquí el informe sale sin esa sección y lo dice
    console.error(`glosario: no se ha podido medir (${e.message})`);
  }
  // Los criterios de las skills (#457): un fallo aquí es de código y lo para su test en el CI; no se esconde.
  const criterios = criteriosDelRepo(RAIZ, hoy);
  for (const f of criterios) console.log(lineaDeCifras(f.nombre, f.cifras));
  if (uso) for (const l of lineasDeUso(uso)) console.log(l);

  // Contrapesos, margen de ruido y vigilantes (#480). Sin historial, todas salen «sin datos suficientes».
  const contrapesos = medirContrapesos(nodos?.map(desdeGraphql) ?? null, { hoy });
  for (const c of contrapesos) console.log(lineaDeContrapeso(c));
  let series = null;
  if (opcion("--historial")) {
    try {
      series = seriesDeHistorial(readFileSync(opcion("--historial"), "utf8"));
    } catch (e) {
      // a propósito: sin historial legible el informe sale igual, con «sin datos suficientes» en cada cifra, y lo dice aquí
      console.error(`historial: no se ha podido leer (${e.message}); cada cifra sale «sin datos suficientes».`);
    }
  }
  const cifras = Object.fromEntries([
    ...[...indicadores, ...salud.indicadores].map((m) => [m.indicador, m.valor]),
    ...contrapesos.map((c) => [c.contrapeso, c.valor]),
  ]);
  const margen = antesYDespues({ cifras, series, registro: leerMetricas(RAIZ) });
  for (const f of margen) console.log(lineaDeRuido(f.id, f.valor, f.ruido));
  if (opcion("--informe")) writeFileSync(opcion("--informe"), `${informe({ indicadores, salud, uso, glosario, criterios, contrapesos, margen, hoy: diaMadrid(hoy) })}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await main(process.argv.slice(2)));
}
