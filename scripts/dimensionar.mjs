#!/usr/bin/env node
/**
 * npm run dimensionar (#641, fondo #639): el alcance, la complejidad, los agentes, el paralelo y el brief de un encargo.
 *
 *   npm run dimensionar -- 641                      el encargo #641: su bloque `encargo` da subtipo, ficheros previstos y causa
 *   npm run dimensionar -- 641 --diff               lo mismo con el diff real de la rama frente a origin/staging, y avisa si hay que redimensionar
 *   npm run dimensionar -- --ficheros a,b --tipo <tipo> --causa <causa>
 *   npm run dimensionar -- --diff --subtipo <id de subtipo>
 *   opciones: --subtipo <id> | --tipo <tipo de ops/tipos-de-encargo.json>   --causa <causa>   --banderas a,b
 *             --objetivo "<texto>"   --rama <rama>   --tarea <id de la tarea del constructor>   --json   --brief <agente> [--fase n]   --briefs
 *
 * Por defecto imprime líneas `campo: valor`. `--json` imprime el plan entero. `--brief <agente>` imprime el brief de ese agente (las
 * nueve piezas de /orquestar, sección 4) y `--briefs` el de todos. Lógica en scripts/lib/dimensionado.mjs. Sale 1 si algo no existe
 * (subtipo, tipo, causa, bandera o encargo) y dice cuáles hay; nunca inventa un plan.
 */
import { execFileSync } from "node:child_process";
import { ghConRenovacion } from "./lib/ghConRenovacion.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { leerDiff } from "./lib/avisosPr.mjs";
import { briefDe, dimensionar, redimensionar, textoDe } from "./lib/dimensionado.mjs";
import { leerEncargo } from "./lib/fondos.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "pabloam89/MenuPlan";

function opciones(argv) {
  const o = { json: false, diff: false, briefs: false, brief: null, fase: null, numero: null, ficheros: null };
  const valor = (i, nombre) => {
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`${nombre} necesita un valor`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--diff") o.diff = true;
    else if (a === "--briefs") o.briefs = true;
    else if (["--brief", "--fase", "--ficheros", "--subtipo", "--tipo", "--causa", "--banderas", "--objetivo", "--rama", "--tarea"].includes(a)) o[a.slice(2)] = valor(i++, a);
    else if (/^#?\d{1,8}$/.test(a)) o.numero = Number(a.replace("#", ""));
    else throw new Error(`no entiendo «${a.slice(0, 40)}». Uso: npm run dimensionar -- <n.º de encargo | --ficheros a,b | --diff> [opciones] (la cabecera de scripts/dimensionar.mjs las lista)`);
  }
  return o;
}

const lista = (t) => String(t ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** El encargo de GitHub (REST, con la sesión de `gh`): título y bloque `encargo`. */
function leerIssue(n) {
  const crudo = ghConRenovacion(["api", `repos/${REPO}/issues/${n}`], { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const issue = JSON.parse(crudo);
  if (issue.pull_request) throw new Error(`#${n} es un PR, no un encargo`);
  const { presente, ficha } = leerEncargo(issue.body ?? "");
  if (!presente) throw new Error(`#${n} no trae el bloque «encargo» (plantilla en docs/ops/ENCARGO.md)`);
  return { titulo: issue.title, ficha };
}

/** Los ficheros del diff de la rama frente a origin/staging, con sus líneas (añadidas más quitadas), como las cuenta el CI. */
function diffDeLaRama() {
  const git = (...a) => execFileSync("git", ["-C", RAIZ, ...a], { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  const rama = git("diff", "-U0", "origin/staging...HEAD");
  const porRuta = new Map(leerDiff(rama).map((f) => [f.ruta, f.anadidas.length + f.quitadas.length]));
  // Lo sin commitear y lo nuevo también es de la rama: se suma para que `--diff` antes del commit no salga vacío.
  const sucio = git("status", "--porcelain", "-uall").split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "").split(" -> ").at(-1));
  // `-uall` expande las carpetas sin seguimiento; de un fichero nuevo se cuentan sus líneas (todas son añadidas).
  for (const r of sucio) {
    if (porRuta.has(r)) continue;
    let lines = null;
    try { lines = readFileSync(join(RAIZ, r), "utf8").split("\n").length - 1; } catch { /* a propósito: un fichero borrado o ilegible se queda sin líneas y la medida lo marca como mínimo */ }
    porRuta.set(r, lines);
  }
  return [...porRuta].map(([ruta, lines]) => ({ ruta, lines }));
}

function main() {
  const o = opciones(process.argv.slice(2));
  let entrada = { fuente: "ficheros", ficheros: [] };
  let previsto = null;
  if (o.numero) {
    const { titulo, ficha } = leerIssue(o.numero);
    entrada = {
      fuente: "encargo", numero: o.numero, titulo, objetivo: titulo, ficheros: lista(ficha.ficheros), subtipo: ficha.subtype ?? undefined,
      tipo: ficha.subtype ? undefined : ficha.assignment_type ?? undefined, declarada: ficha.complexity ?? undefined,
      hecho_cuando: ficha.hecho_cuando ?? undefined, verificacion: ficha.verificacion ?? undefined,
    };
  }
  if (o.ficheros !== null) entrada = { ...entrada, fuente: o.numero ? entrada.fuente : "ficheros", ficheros: lista(o.ficheros) };
  const override = { subtipo: o.subtipo, tipo: o.tipo, causa: o.causa, objetivo: o.objetivo, rama: o.rama, tarea: o.tarea };
  for (const [k, v] of Object.entries(override)) if (v !== null && v !== undefined) entrada[k] = v;
  if (o.subtipo) delete entrada.tipo;
  entrada.banderas = lista(o.banderas);
  if (o.diff) {
    if (o.numero) previsto = dimensionar(entrada);
    entrada = { ...entrada, fuente: "diff", ficheros: diffDeLaRama() };
  } else if (!o.numero && o.ficheros === null) {
    throw new Error("dime qué dimensionar: un n.º de encargo, --ficheros a,b o --diff");
  }
  const plan = dimensionar(entrada);
  const redim = previsto ? redimensionar(previsto, plan) : null;

  if (o.brief || o.briefs) {
    const agentes = o.briefs ? [...new Set(plan.fases.flatMap((f) => f.agentes.map((a) => a.agente)))] : [o.brief];
    console.log(agentes.map((a) => briefDe(plan, a, { fase: o.fase ? Number(o.fase) : undefined })).join("\n\n---\n\n"));
  } else if (o.json) console.log(JSON.stringify({ ...plan, redimensionar: redim }, null, 2));
  else console.log(textoDe(plan, redim));
}

try {
  main();
} catch (e) {
  console.error(`dimensionar: ${e.message}`);
  process.exit(1);
}
