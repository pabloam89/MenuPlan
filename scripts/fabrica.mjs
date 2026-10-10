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
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HUECO_ACTIVO_MIN, agregarPorIssue, cobertura, contarEventos, extraer, inicioDe, leerLineas, listarTranscripciones, recalibrar, resumirPartes, textoInforme, unirConGithub,
} from "./lib/fabrica.mjs";
import { dirFabrica } from "../.claude/hooks/eventos.mjs"; // una sola carpeta para el registro de eventos y los informes
import { diaMadrid } from "./lib/hora.mjs";
import { conCache, registrarGh } from "./lib/cuotaGh.mjs";
import { CONSULTA_FONDOS, CONSULTA_TODOS, conEsperaDeLimite, datosGithub, fondosTruncados, paginas, unirNodos } from "./lib/fabricaGh.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** ¿Está `ruta` dentro de `raiz`? Los informes con datos de uso no se escriben nunca en un fichero versionable. */
export function dentroDe(ruta, raiz) {
  const r = relative(resolve(raiz), resolve(ruta));
  return r === "" || (!r.startsWith("..") && !/^[a-zA-Z]:/.test(r) && !r.startsWith("/") && !r.startsWith("\\"));
}

/**
 * ¿Está `ruta` dentro de ALGÚN repo git (este u otro)? Se resuelve con realpath desde el ancestro
 * más cercano que existe (así un enlace no esconde el destino real) y se sube buscando un `.git`
 * (carpeta o fichero, el de un worktree). El informe lleva datos de uso: ningún repo es su sitio.
 */
export function dentroDeUnRepo(ruta) {
  let actual = resolve(ruta);
  const resto = [];
  while (!existsSync(actual) && actual !== parse(actual).root) {
    resto.unshift(actual.slice(dirname(actual).length + 1));
    actual = dirname(actual);
  }
  let real;
  try {
    real = join(realpathSync(actual), ...resto);
  } catch {
    return true; // a propósito: si no se puede resolver, mejor no escribir
  }
  for (let d = dirname(real); ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) return true;
    if (d === dirname(d)) return false;
  }
}

function opcion(args, nombre) {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

// Cada llamada deja su línea `gh: caller=fabrica api=…` y espera si GitHub limita (#424).
const gh = (...args) => {
  registrarGh("fabrica", args);
  return conEsperaDeLimite(() => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }), { aviso: (m) => console.error(m) });
};

const TTL_CACHE_MIN = 10; // el informe es diario: repetirlo en 10 min no pide nada nuevo

/** Los issues como `leerIssue()`, con dos consultas ligeras (~18 puntos en vez de ~320) y caché local. Dice si el dato es fresco o de caché. */
function traerIssues() {
  let minutosViejos = null;
  const crudos = conCache("fabrica-issues", {
    ttlMin: TTL_CACHE_MIN,
    viejoSiFalla: true,
    pedir: () => ({ todos: paginas(CONSULTA_TODOS, gh), fondos: paginas(CONSULTA_FONDOS, gh) }),
    aviso: (m, min) => { minutosViejos = min; console.error(m); },
  });
  const truncados = fondosTruncados(crudos.fondos);
  if (truncados.length) console.error(`Aviso: fondos con más hijos de los leídos: ${truncados.map((n) => "#" + n).join(", ")}`);
  return { issues: unirNodos(crudos.todos, crudos.fondos), datos: datosGithub(minutosViejos) };
}

/** Cuenta los eventos de los hooks (eventos.jsonl y su rotado). Solo lee; ausente o ilegible cuenta como vacío. */
function eventosLocales() {
  const dir = dirFabrica();
  const textos = ["eventos.anterior.jsonl", "eventos.jsonl"].map((f) => {
    try {
      return readFileSync(join(dir, f), "utf8");
    } catch {
      // a propósito: el registro aún no existe en un PC nuevo; sin eventos el informe sale con cero
      return "";
    }
  });
  return contarEventos(textos.join("\n"));
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
  let ilegibles = 0;
  // Un fichero que no se puede leer (permisos, borrado a medias) se cuenta y se sigue: nunca tumba el informe ni enseña su ruta.
  const leer = (r) => {
    try {
      return extraer(leerLineas(readFileSync(r, "utf8")), { desde });
    } catch {
      ilegibles += 1;
      return extraer([]);
    }
  };
  const extraidas = listarTranscripciones(base, prefijo)
    .map((t) => [t.principal, ...t.subagentes].map(leer))
    .map((partes) => ({ partes, inicio: inicioDe(partes) }))
    .filter((x) => Number.isFinite(x.inicio))
    .sort((a, b) => a.inicio - b.inicio);
  const vistos = new Set();
  const sesiones = extraidas.map((x) => resumirPartes(x.partes, { vistos })).filter((s) => s.porIssue.size);
  const medidas = agregarPorIssue(sesiones);

  let issues = [];
  let datos = args.includes("--sin-github") ? "sin-github" : "fresco";
  if (!args.includes("--sin-github")) {
    try {
      ({ issues, datos } = traerIssues());
    } catch (e) {
      console.error(`No he podido leer los issues (${String(e.stderr ?? e.message).trim().split("\n")[0].slice(0, 120)}). Relanza con red, o con --sin-github para medir sin unirlos.`);
      process.exit(1);
    }
  }
  const union = unirConGithub(medidas, issues);
  const recal = recalibrar(union.fondos);
  const eventos = eventosLocales();
  const cob = cobertura({ sesiones: sesiones.length, union, recal, ilegibles });

  const recalibracion = args.includes("--recalibrar");
  const salida = args.includes("--json")
    ? `${JSON.stringify({ datos_github: datos, cobertura: cob, huecoMin: HUECO_ACTIVO_MIN, desde: desdeTexto ?? null, eventos, ...union, ...(recalibracion ? { recalibracion: recal } : {}) }, null, 2)}\n`
    : textoInforme({ cobertura: cob, union, recal, desde: desdeTexto ?? null, recalibracion, eventos, datosGithub: datos });

  if (args.includes("--escribir")) {
    const destino = resolve(opcion(args, "--salida") ?? join(dirFabrica(), `informe-${diaMadrid()}.${args.includes("--json") ? "json" : "txt"}`));
    if (dentroDe(destino, RAIZ) || dentroDeUnRepo(destino)) {
      console.error("El informe lleva datos de uso: no se escribe dentro del repo ni de ningún otro repo git. Usa una ruta fuera de ellos (por defecto, ~/.claude/menuplan-fabrica/).");
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
