// fabrica.mjs — qué cuesta la fábrica y si los presupuestos aciertan (#340, fase F de #334).
//
//   npm run fabrica                  tokens, minutos, coste estimado y agentes por fondo y por encargo
//   npm run fabrica -- --recalibrar  lo anterior y, por tipo de causa × alcance, presupuestado frente a real
//   npm run fabrica -- --json        lo mismo para máquinas
//   npm run fabrica -- --escribir    guarda el informe FUERA del repo (~/.claude/menuplan-fabrica/)
//
// Opciones: --proyectos <carpeta> (por defecto ~/.claude/projects), --prefijo <regex> (carpetas
// de proyecto que cuentan; por defecto MenuPlan), --desde AAAA-MM-DD, --sin-github (solo medir,
// sin unir con los issues). Solo lee: las transcripciones locales de Claude Code y los issues
// por `gh`. NO modifica ops/presupuestos.json: una propuesta la aplica una persona en
// /revision-issues. El informe son agregados numéricos: ni mensajes, ni prompts, ni rutas.
// Lógica y porqué de cada umbral: scripts/lib/fabrica.mjs; tests: scripts/fabrica.test.js.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HUECO_ACTIVO_MIN, agregarPorIssue, cobertura, extraer, inicioDe, leerLineas, listarTranscripciones, recalibrar, resumirPartes, textoInforme, unirConGithub,
} from "./lib/fabrica.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { CONSULTA, leerIssue } from "./lib/issues.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Dónde se guardan los informes y el registro de eventos de los hooks: fuera del repo y de OneDrive. */
export const CARPETA_FABRICA = join(homedir(), ".claude", "menuplan-fabrica");

/** ¿Está `ruta` dentro de `raiz`? Los informes con datos de uso no se escriben nunca en un fichero versionable. */
export function dentroDe(ruta, raiz) {
  const r = relative(resolve(raiz), resolve(ruta));
  return r === "" || (!r.startsWith("..") && !/^[a-zA-Z]:/.test(r) && !r.startsWith("/") && !r.startsWith("\\"));
}

function opcion(args, nombre) {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });

/** Todos los issues con padre e hijos, como `npm run issues` (la misma consulta y el mismo lector). */
function traerIssues() {
  const out = [];
  let cursor = null;
  do {
    const args = ["api", "graphql", "-f", `query=${CONSULTA}`];
    if (cursor) args.push("-f", `cursor=${cursor}`);
    const pag = JSON.parse(gh(...args)).data.repository.issues;
    out.push(...pag.nodes.map(leerIssue));
    cursor = pag.pageInfo.hasNextPage ? pag.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const base = resolve(opcion(args, "--proyectos") ?? join(homedir(), ".claude", "projects"));
  let prefijo;
  try {
    prefijo = new RegExp(opcion(args, "--prefijo") ?? "MenuPlan", "i");
  } catch {
    console.error("--prefijo no es una expresión regular válida.");
    process.exit(1);
  }
  const desdeTexto = opcion(args, "--desde");
  if (desdeTexto !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(desdeTexto)) {
    console.error("--desde tiene que ser una fecha AAAA-MM-DD.");
    process.exit(1);
  }
  const desde = desdeTexto ? Date.parse(`${desdeTexto}T00:00:00Z`) : 0;

  // Primero se extrae lo estructural de cada sesión (compacto) y se ordenan de la más antigua a la más
  // reciente: Claude Code copia el historial de la sesión madre a las retomadas y bifurcadas, y esa
  // copia no puede contar dos veces (resumirPartes, `vistos`).
  const extraidas = listarTranscripciones(base, prefijo)
    .map((t) => [t.principal, ...t.subagentes].map((r) => extraer(leerLineas(readFileSync(r, "utf8")), { desde })))
    .map((partes) => ({ partes, inicio: inicioDe(partes) }))
    .filter((x) => Number.isFinite(x.inicio))
    .sort((a, b) => a.inicio - b.inicio);
  const vistos = new Set();
  const sesiones = extraidas.map((x) => resumirPartes(x.partes, { vistos })).filter((s) => s.porIssue.size);
  const medidas = agregarPorIssue(sesiones);

  let issues = [];
  if (!args.includes("--sin-github")) {
    try {
      issues = traerIssues();
    } catch (e) {
      console.error(`No he podido leer los issues (${String(e.stderr ?? e.message).trim().split("\n")[0].slice(0, 120)}). Relanza con red, o con --sin-github para medir sin unirlos.`);
      process.exit(1);
    }
  }
  const union = unirConGithub(medidas, issues);
  const recal = recalibrar(union.fondos);
  const cob = cobertura({ sesiones: sesiones.length, union, recal });

  const recalibracion = args.includes("--recalibrar");
  const salida = args.includes("--json")
    ? `${JSON.stringify({ cobertura: cob, huecoMin: HUECO_ACTIVO_MIN, desde: desdeTexto ?? null, ...union, ...(recalibracion ? { recalibracion: recal } : {}) }, null, 2)}\n`
    : textoInforme({ cobertura: cob, union, recal, desde: desdeTexto ?? null, recalibracion });

  if (args.includes("--escribir")) {
    const destino = resolve(opcion(args, "--salida") ?? join(CARPETA_FABRICA, `informe-${diaMadrid()}.${args.includes("--json") ? "json" : "txt"}`));
    if (dentroDe(destino, RAIZ)) {
      console.error("El informe lleva datos de uso: no se escribe dentro del repo. Usa una ruta fuera de él (por defecto, ~/.claude/menuplan-fabrica/).");
      process.exit(1);
    }
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, salida);
    console.log("Informe escrito fuera del repo (carpeta menuplan-fabrica).");
  } else {
    process.stdout.write(salida);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
