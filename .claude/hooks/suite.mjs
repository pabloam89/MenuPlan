/**
 * suite.mjs — ¿esta orden lanza la suite entera de tests? (#284, caso #283)
 *
 * La suite entera carga el catálogo en cada worker (varios GB de RAM) y tarda
 * minutos; con varias sesiones a la vez dejaba el PC de Pablo sin respuesta. La
 * corre el CI de cada PR, gratis (repo público). En local se lanzan los tests de
 * lo que se toca: `npm run vecinos` o `npx vitest run <ficheros>`.
 *
 * Se mira la orden real, no el texto suelto (fondo #174): el cuerpo de un heredoc,
 * el mensaje de un commit o el cuerpo de un PR que NOMBRAN `npm test` no cuentan
 * (`sinTextos`), ni un `echo` o un `grep` con el texto entre comillas: solo cuenta
 * si `npm`, `npx`, `vitest` o `node …/vitest.mjs` van al principio de un tramo.
 *
 * Suite entera = sin ningún fichero ni filtro de fichero. `-t <patrón>` NO es
 * filtro: vitest carga igualmente todos los ficheros para buscar el nombre.
 * Filtran: un argumento suelto (fichero, carpeta o trozo de ruta), `--changed`,
 * `--related`, `--dir`, `--project` y `--shard`.
 *
 * La salida, cuando de verdad hace falta (tocar algo transversal: package.json,
 * vite.config.js, scripts/lib/, los hooks): `MENUPLAN_SUITE_ENTERA=1` delante, en
 * Bash `MENUPLAN_SUITE_ENTERA=1 npm test`, en PowerShell
 * `$env:MENUPLAN_SUITE_ENTERA=1; npm test`.
 *
 * Filtro de buena fe, no barrera: una variable intermedia, un script escrito en un
 * fichero o `node -e` que lance vitest se lo saltan.
 */
import { sinEnvoltorio, sinTextos, trozos } from "./credenciales.mjs";

/** La variable de la salida explícita. */
export const SALIDA_SUITE = "MENUPLAN_SUITE_ENTERA";
const SALIDA = new RegExp(String.raw`(?:^|[\s;&|(])(?:export\s+|\$env:)?${SALIDA_SUITE}\s*=\s*["']?1["']?(?=[\s;&|)]|$)`, "i");

// Opciones de vitest que llevan valor detrás (`--reporter dot`): el valor no es un filtro.
const CON_VALOR = new Set([
  "-t", "--testNamePattern", "--reporter", "--outputFile", "-c", "--config", "-r", "--root", "--pool",
  "--maxWorkers", "--minWorkers", "--testTimeout", "--hookTimeout", "--teardownTimeout", "--environment",
  "--mode", "--exclude", "--retry", "--bail", "--silent", "--sequence.seed", "--coverage.reporter", "--color",
]);
// Opciones que sí acotan qué ficheros se cargan.
const ACOTAN = /^--(?:changed|related|dir|project|shard)(?:=|$)/;
// Subórdenes de vitest que corren la suite; sin suborden, también (sin terminal no hay modo vigía).
const SUBORDEN_SUITE = new Set(["run", "watch", "dev"]);

const ES_NPM = /^(?:\S*[\\/])?npm(?:\.cmd)?$/i;
const ES_NPX = /^(?:\S*[\\/])?npx(?:\.cmd)?$/i;
const ES_VITEST = /^(?:\S*[\\/])?vitest(?:@\S+)?(?:\.cmd|\.mjs)?$/i;
const ES_NODE = /^(?:\S*[\\/])?node(?:\.exe)?$/i;
const ES_SHELL = /^(?:\S*[\\/])?(?:ba|z|da|k)?sh(?:\.exe)?$|^(?:pwsh|powershell|cmd)(?:\.exe)?$/i;
const REDIRECCION = /^(?:\d|&)?>>?(?:&\d)?$|^(?:\d|&)?>>?.+|^<.*/;

/** Palabras de un tramo, con las comillas quitadas y sin redirecciones (`2>&1`, `> f`). */
function palabras(texto) {
  const t = [...String(texto).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const fuera = [];
  for (let i = 0; i < t.length; i++) {
    if (REDIRECCION.test(t[i])) {
      // `>` o `2>` sueltos se llevan el fichero de detrás; `2>&1` o `>f` no.
      if (/^(?:\d|&)?>>?$|^<$/.test(t[i])) i++;
      continue;
    }
    fuera.push(t[i]);
  }
  return fuera;
}

/** ¿Los argumentos que recibe vitest dejan la suite entera? */
function argumentosSinFiltro(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") continue;
    if (ACOTAN.test(a)) return false;
    if (a.startsWith("-")) {
      if (!a.includes("=") && CON_VALOR.has(a)) i++;
      continue;
    }
    return false; // un fichero, una carpeta o un trozo de ruta
  }
  return true;
}

/** Tras `vitest`: la suborden (si la hay) y sus argumentos. */
function vitestSinFiltro(resto) {
  const [primera, ...demas] = resto;
  if (primera && !primera.startsWith("-")) return SUBORDEN_SUITE.has(primera) ? argumentosSinFiltro(demas) : false;
  return argumentosSinFiltro(resto);
}

/** ¿Este tramo (una orden sola) lanza la suite entera? */
function tramoEsSuite(texto, profundidad = 0) {
  let p = palabras(sinEnvoltorio(String(texto).trim().replace(/^[({!&\s]+|[)}\s]+$/g, "")));
  // Delante puede haber asignaciones, `env`, `timeout 600`, `nohup`, `time`, `command` o `call`.
  for (;;) {
    const w = p[0] ?? "";
    if (/^\w+=/.test(w) || /^(?:nohup|time|command|exec|call)$/i.test(w)) p = p.slice(1);
    else if (/^env$/i.test(w)) {
      p = p.slice(1);
      while (/^-/.test(p[0] ?? "")) p = p.slice(/^(?:-u|--unset|-C|--chdir)$/.test(p[0]) ? 2 : 1);
    } else if (/^timeout$/i.test(w)) {
      p = p.slice(1);
      while (/^-/.test(p[0] ?? "")) p = p.slice(/^(?:-s|--signal|-k|--kill-after)$/.test(p[0]) ? 2 : 1);
      p = p.slice(1); // la duración
    } else break;
  }
  const [orden, ...resto] = p;
  if (!orden) return false;
  // `bash -c "npm test"`, `pwsh -Command "…"`, `cmd /c …`: se mira lo de dentro.
  if (ES_SHELL.test(orden) && profundidad < 2) {
    const i = resto.findIndex((a) => /^(?:-c|-Command|\/c)$/i.test(a));
    return i >= 0 && resto[i + 1] !== undefined ? esSuiteEntera(resto.slice(i + 1).join(" "), profundidad + 1) : false;
  }
  if (ES_VITEST.test(orden)) return vitestSinFiltro(resto);
  if (ES_NODE.test(orden)) return ES_VITEST.test(resto[0] ?? "") ? vitestSinFiltro(resto.slice(1)) : false;
  if (ES_NPX.test(orden) || (ES_NPM.test(orden) && /^(?:exec|x)$/.test(resto[0] ?? ""))) {
    const tras = ES_NPX.test(orden) ? resto : resto.slice(1);
    let i = 0;
    while (i < tras.length && tras[i].startsWith("-")) i += /^(?:-p|--package)$/.test(tras[i]) ? 2 : 1;
    if (tras[i] === "--") i++;
    return ES_VITEST.test(tras[i] ?? "") ? vitestSinFiltro(tras.slice(i + 1)) : false;
  }
  if (ES_NPM.test(orden)) {
    let i = 0;
    while (i < resto.length && resto[i].startsWith("-")) i += /^(?:--prefix|-C|--workspace|-w)$/.test(resto[i]) ? 2 : 1;
    const sub = resto[i];
    // `npm test` es `vitest run` (package.json): sus argumentos van a vitest.
    if (/^(?:test|t|tst)$/.test(sub ?? "")) return argumentosSinFiltro(resto.slice(i + 1));
    if (/^(?:run|run-script|rum|urn)$/.test(sub ?? "") && resto[i + 1] === "test") return argumentosSinFiltro(resto.slice(i + 2));
  }
  return false;
}

/** ¿El comando lanza la suite entera sin la salida explícita? */
export function esSuiteEntera(cmd, profundidad = 0) {
  const limpio = sinTextos(String(cmd));
  if (SALIDA.test(limpio)) return false;
  return trozos(limpio).some((t) => tramoEsSuite(t.texto, profundidad));
}
