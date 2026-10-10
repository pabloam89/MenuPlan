#!/usr/bin/env node
/**
 * boveda-pablo.mjs — configura la bóveda de sesiones (#328) con UN comando y
 * UNA aprobación en 1Password. Lo lanza Pablo desde una PowerShell aparte,
 * fuera de Claude Code, con la integración de la CLI encendida:
 *
 *   cd C:\dev\MenuPlan; node scripts/boveda-pablo.mjs
 *
 * En orden, y cada paso se salta si ya está hecho:
 *   1. la bóveda HoMenu-sesiones existe y la integración de la CLI responde;
 *   2. boveda-sesiones.mjs --si (copia las fichas; salta las que ya existen);
 *   3. service account «MenuPlan sesiones» → llavero (por tubería: el token no
 *      se imprime, no va a una variable del padre ni a disco);
 *   4. boveda-sesiones.mjs --comprobar;
 *   5. resumen en llano y lo único que queda a mano.
 *
 * Falla cerrado: si un paso falla, no sigue con los que dependen de él.
 * Se NIEGA a correr dentro de una sesión de Claude Code (un `!` hereda su
 * entorno): la aprobación de 1Password tiene que ser de Pablo, no de una sesión.
 *
 * MENUPLAN_OP_PABLO=1 solo se pone para el hijo que lo necesita (la copia) y,
 * dentro de este proceso, mientras dura una llamada de `opPorLaApp`; después se
 * restaura. El camino a la app de escritorio sigue siendo `opPorLaApp` de env.mjs.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BOVEDA_SESIONES, VAR_OP_PABLO, entornoOp, opPorLaApp, tokenServicio } from "./lib/env.mjs";
import { pareceToken } from "./llavero-op.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const NOMBRE_CUENTA = "MenuPlan sesiones";
export const CUENTA_VIEJA = "MenuPlan PC Pablo";

/** Variables que Claude Code pone en todo lo que lanza (también en un `!`). */
export const MARCAS_DE_SESION = ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT", "CLAUDE_PROJECT_DIR", "AI_AGENT"];
export const enSesionDeClaude = (env = process.env) => MARCAS_DE_SESION.filter((k) => env[k]);

/** Nunca sale un token por pantalla, ni en un mensaje de error de `op`. */
export const sinTokens = (t) => String(t ?? "").replace(/ops_\S+/g, "ops_…");
const primeraLinea = (t) => sinTokens(t).trim().split("\n")[0];

/** `opPorLaApp` con MENUPLAN_OP_PABLO=1 solo mientras dura la llamada. */
function opApp(args, opts) {
  const antes = process.env[VAR_OP_PABLO];
  process.env[VAR_OP_PABLO] = "1";
  try {
    return opPorLaApp(args, opts);
  } finally {
    if (antes === undefined) delete process.env[VAR_OP_PABLO]; else process.env[VAR_OP_PABLO] = antes;
  }
}

/** Los efectos reales; los tests los sustituyen. */
export const efectosReales = {
  env: process.env,
  log: (t) => console.log(t),
  opApp,
  /** `op` con la service account del llavero (la de las sesiones). */
  opServicio(args) {
    let env;
    try { env = entornoOp(); } catch (e) { return { status: 1, stdout: "", stderr: e.message }; }
    return spawnSync("op", args, { env, encoding: "utf8" });
  },
  hayTokenEnLlavero: () => Boolean(tokenServicio()),
  /** Un script hermano como proceso hijo; `quitar` borra variables de su entorno. */
  hijo(script, args, { conVarPablo }) {
    const env = { ...process.env };
    if (conVarPablo) env[VAR_OP_PABLO] = "1"; else delete env[VAR_OP_PABLO];
    const r = spawnSync(process.execPath, [join(AQUI, script), ...args], { env, encoding: "utf8" });
    return { status: r.status ?? 1, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  },
  /** El token entra por stdin a llavero-op.mjs; lo que vuelve es solo COINCIDEN o no. */
  guardarEnLlavero(token) {
    const r = spawnSync(process.execPath, [join(AQUI, "llavero-op.mjs")], { input: token, env: { ...process.env, [VAR_OP_PABLO]: "" }, encoding: "utf8" });
    return { status: r.status ?? 1, salida: sinTokens(`${r.stdout ?? ""}${r.stderr ?? ""}`) };
  },
};

const BIEN = "BIEN";
const MAL = "MAL";
const SALTADO = "YA ESTABA";

/** Paso 1: la bóveda existe y la integración de la CLI contesta. */
function paso1(fx) {
  const r = fx.opApp(["vault", "list", "--format", "json"]);
  if (r.error?.code === "ENOENT") return { estado: MAL, texto: "no encuentro `op`: instálalo con `winget install AgileBits.1Password.CLI` y abre otra PowerShell." };
  if (r.status !== 0) {
    return { estado: MAL, texto: `1Password no contesta (${primeraLinea(r.stderr)}). Abre la app de 1Password, desbloquéala y enciende Ajustes → Desarrollador → «Integrar con 1Password CLI». Luego repite este comando.` };
  }
  let nombres;
  try { nombres = JSON.parse(r.stdout).map((b) => b.name); } catch { return { estado: MAL, texto: "1Password contestó algo que no entiendo al listar las bóvedas." }; }
  if (!nombres.includes(BOVEDA_SESIONES)) {
    return { estado: MAL, texto: `no existe la bóveda «${BOVEDA_SESIONES}». Créala en la app de 1Password (Nueva bóveda, con guion) y repite este comando.` };
  }
  return { estado: BIEN, texto: `la bóveda «${BOVEDA_SESIONES}» existe y la integración de la CLI responde.` };
}

/** Paso 2: copiar las fichas (el propio script salta las que ya existen). */
function paso2(fx) {
  const r = fx.hijo("boveda-sesiones.mjs", ["--si"], { conVarPablo: true });
  const lineas = sinTokens(r.salida).split("\n").filter(Boolean);
  fx.log(lineas.map((l) => `    ${l}`).join("\n"));
  if (r.status !== 0) return { estado: MAL, texto: "la copia de fichas ha fallado en alguna (arriba, las líneas FALLA o NO COINCIDEN). Repite el comando: las ya copiadas se saltan." };
  const copiadas = lineas.filter((l) => /^copiada/.test(l)).length;
  const saltadas = lineas.filter((l) => /^salto/.test(l)).length;
  return { estado: copiadas ? BIEN : SALTADO, texto: `fichas copiadas: ${copiadas}, ya estaban: ${saltadas}.` };
}

/** ¿El token del llavero ya es el de sesiones (ve solo HoMenu-sesiones)? */
function llaveroYaEsDeSesiones(fx) {
  if (!fx.hayTokenEnLlavero()) return false;
  const v = fx.opServicio(["vault", "list", "--format", "json"]);
  if (v.status !== 0) return false;
  try {
    const nombres = JSON.parse(v.stdout).map((b) => b.name);
    return nombres.length === 1 && nombres[0] === BOVEDA_SESIONES;
  } catch { return false; }
}

/** Paso 3: service account nueva → llavero, sin que el token se vea. */
function paso3(fx) {
  if (llaveroYaEsDeSesiones(fx)) return { estado: SALTADO, texto: `el llavero ya tiene una cuenta que solo ve «${BOVEDA_SESIONES}»; no creo otra.` };
  const c = fx.opApp(["service-account", "create", NOMBRE_CUENTA, "--vault", `${BOVEDA_SESIONES}:read_items`, "--raw"]);
  // El token vive solo en esta variable local, hasta pasarlo por stdin.
  let token = String(c.stdout ?? "").trim();
  if (c.status !== 0 || !pareceToken(token)) {
    token = "";
    return { estado: MAL, texto: `no he podido crear la cuenta «${NOMBRE_CUENTA}» (${primeraLinea(c.stderr || c.stdout) || "sin detalle"}). No he guardado nada. Si ya existe una con ese nombre en 1Password.com, anúlala allí y repite.` };
  }
  const g = fx.guardarEnLlavero(token);
  token = "";
  if (g.status !== 0 || !/resultado: COINCIDEN/.test(g.salida)) {
    return { estado: MAL, texto: `la cuenta se creó pero NO queda bien guardada en el llavero (${primeraLinea(g.salida)}). Anúlala en 1Password.com y repite.` };
  }
  return { estado: BIEN, texto: `cuenta «${NOMBRE_CUENTA}» creada y guardada en el llavero (COINCIDEN).` };
}

/** Paso 4: la cuenta de sesiones lee lo suyo y no la URL de administrador. */
function paso4(fx) {
  const r = fx.hijo("boveda-sesiones.mjs", ["--comprobar"], { conVarPablo: false });
  const lineas = sinTokens(r.salida).split("\n").filter(Boolean);
  fx.log(lineas.map((l) => `    ${l}`).join("\n"));
  return r.status === 0
    ? { estado: BIEN, texto: "las sesiones leen lo suyo y no la URL de administrador." }
    : { estado: MAL, texto: "la comprobación ha dado MAL en alguna línea (arriba). No anules todavía la cuenta vieja." };
}

export const PASOS = [
  { id: 1, nombre: "bóveda e integración", corre: paso1 },
  { id: 2, nombre: "copiar las fichas", corre: paso2 },
  { id: 3, nombre: "cuenta de servicio al llavero", corre: paso3 },
  { id: 4, nombre: "comprobar", corre: paso4 },
];

/** Corre los pasos en orden y se para en el primero que falla. Devuelve el código de salida. */
export function ejecutar(fx = efectosReales) {
  const marcas = enSesionDeClaude(fx.env);
  if (marcas.length) {
    fx.log("Me niego a correr dentro de una sesión de Claude Code: la aprobación de 1Password tiene que ser tuya.");
    fx.log("Abre una PowerShell aparte (fuera de Claude Code), ve a C:\\dev\\MenuPlan y lanza: node scripts/boveda-pablo.mjs");
    return 2;
  }
  const resultados = [];
  for (const p of PASOS) {
    fx.log(`Paso ${p.id}: ${p.nombre}…`);
    let r;
    try { r = p.corre(fx); } catch (e) { r = { estado: MAL, texto: `error inesperado: ${primeraLinea(e.message)}` }; }
    resultados.push({ ...p, ...r });
    fx.log(`  ${r.estado}: ${r.texto}`);
    if (r.estado === MAL) break;
  }
  const mal = resultados.some((r) => r.estado === MAL);
  fx.log("");
  fx.log("Resumen");
  for (const r of resultados) fx.log(`  ${r.estado.padEnd(9)} ${r.id}. ${r.nombre}`);
  for (const p of PASOS.slice(resultados.length)) fx.log(`  SIN HACER ${p.id}. ${p.nombre}`);
  fx.log("");
  if (mal) {
    fx.log("Algo ha salido MAL: lee la línea del paso que falló, arréglalo y repite el mismo comando (lo hecho se salta).");
    return 1;
  }
  fx.log("Todo ha salido BIEN. Lo único que te queda a mano:");
  fx.log(`  1. En 1Password.com → Developer → Service accounts: anular «${CUENTA_VIEJA}».`);
  fx.log("  2. En la app de 1Password → Ajustes → Desarrollador: apagar «Integrar con 1Password CLI».");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(ejecutar());
}
