#!/usr/bin/env node
/**
 * ¿Por qué falla el bot? Cuenta las líneas `bot_fallo` (api/_bot/avisar.js,
 * #211) por motivo y por sitio.
 *
 *   npm run fallos                    último día, producción, leído de Vercel
 *   npm run fallos -- --dias 7        los últimos 7 días
 *   npm run fallos -- --entorno preview   staging; en producción puede no haber tráfico reciente
 *   npm run fallos -- --tandas 400   más tandas de 50 si el rango tiene mucho
 *   npm run fallos -- --fichero logs.jsonl   un export que ya tienes
 *
 * De Vercel lo lee con su CLI (`vercel logs`, que tiene que estar instalada y
 * con sesión: `vercel login`), filtrando por el texto «bot_fallo». La CLI da
 * como mucho 50 peticiones por llamada: el script pide tandas hacia atrás con
 * --until hasta cubrir el rango, y la salida dice qué entorno y qué rango ha
 * cubierto de verdad. A mano, una tanda:
 *
 *   vercel logs --project homenu --scope menuplan --environment production \
 *     --since 24h --query bot_fallo --json --limit 50 > logs.jsonl
 *
 * Ese mismo comando sirve para sacar el fichero a mano y pasarlo con
 * --fichero (o por la entrada estándar: `… | npm run fallos -- --fichero -`).
 * Los logs de Vercel duran poco según el plan: lo que no está ahí, no se
 * puede contar.
 *
 * Solo lee: no toca la base ni Vercel.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MOTIVOS_FALLO, SITIOS_FALLO } from "../src/lib/vocabularios.js";

const PROYECTO = "homenu";
const EQUIPO = "menuplan";
const MARCA = '"evento":"bot_fallo"';

/** El objeto de un trozo de JSON, o null si no lo es. */
function intentar(trozo) {
  try {
    return JSON.parse(trozo);
  } catch {
    return null; // a propósito: aún no cierra; quien llama prueba con la llave siguiente y cuenta los ilegibles
  }
}

/** Las líneas bot_fallo que hay dentro de un texto (una línea JSON de Vercel o una línea suelta). */
function deTexto(texto, out) {
  let i = texto.indexOf(MARCA);
  while (i >= 0) {
    const desde = texto.lastIndexOf("{", i);
    // El primer «}» que cierra un JSON válido (el texto de un «otro» puede llevar llaves).
    let leido = null;
    for (let hasta = texto.indexOf("}", i), n = 0; hasta > desde && desde >= 0 && n < 20 && !leido; hasta = texto.indexOf("}", hasta + 1), n++) {
      leido = intentar(texto.slice(desde, hasta + 1));
    }
    if (leido) out.push(leido);
    else out.ilegibles = (out.ilegibles ?? 0) + 1;
    i = texto.indexOf(MARCA, i + MARCA.length);
  }
}

/** Todas las cadenas de un objeto de log de Vercel, sin repetir el mensaje y sus `logs`. */
function cadenasDe(obj) {
  if (typeof obj === "string") return [obj];
  if (!obj || typeof obj !== "object") return [];
  // Una petición de `vercel logs --json`: sus líneas van en `logs`; si no
  // trae, en `message`. No los dos, para no contar dos veces la misma.
  if (Array.isArray(obj.logs) && obj.logs.length) return obj.logs.flatMap(cadenasDe);
  if (typeof obj.message === "string" && obj.message) return [obj.message];
  return Object.values(obj).flatMap(cadenasDe);
}

/**
 * Los fallos de un export de logs: JSON Lines de `vercel logs --json`, un
 * array JSON o texto plano con una línea por log.
 * @returns {{ donde: string, motivo: string, codigo: string|null, grave: boolean, texto?: string }[]}
 */
export function fallosDe(contenido) {
  const out = [];
  const texto = String(contenido ?? "");
  let entero = null;
  if (/^\s*\[/.test(texto)) entero = intentar(texto); // si no es un array entero, línea a línea
  const piezas = Array.isArray(entero) ? entero : texto.split(/\r?\n/).filter((l) => l.trim());
  for (const pieza of piezas) {
    let obj = pieza;
    if (typeof pieza === "string" && pieza.trim().startsWith("{") && !pieza.includes(`{${MARCA}`)) {
      obj = intentar(pieza) ?? pieza; // si no es JSON, se busca la marca en el texto
    }
    const antes = out.length;
    for (const c of cadenasDe(obj)) deTexto(c, out);
    // Cuándo: el de la petición de Vercel, o la fecha ISO con que empieza una
    // línea suelta. El vigía (scripts/vigia.mjs) cuenta por ventanas de tiempo.
    const ts = cuandoDe(obj);
    if (ts != null) for (let k = antes; k < out.length; k++) out[k].ts ??= ts;
  }
  return Object.assign(out.filter((f) => f?.evento === "bot_fallo"), { ilegibles: out.ilegibles ?? 0 });
}

/** El instante (ms) de una petición de Vercel o de una línea que empieza por una fecha ISO; null si no lo lleva. */
function cuandoDe(obj) {
  if (typeof obj?.timestamp === "number") return obj.timestamp;
  const iso = typeof obj === "string" ? obj.match(/^\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z)/)?.[1] : null;
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Cuenta por motivo, por sitio y por sitio y motivo. */
export function contar(fallos) {
  const porMotivo = {};
  const porSitio = {};
  const otros = {};
  let graves = 0;
  for (const f of fallos) {
    porMotivo[f.motivo] = (porMotivo[f.motivo] ?? 0) + 1;
    const s = (porSitio[f.donde] ??= { total: 0, motivos: {} });
    s.total++;
    s.motivos[f.motivo] = (s.motivos[f.motivo] ?? 0) + 1;
    if (f.grave) graves++;
    if (f.motivo === "otro" && f.texto) otros[f.texto] = (otros[f.texto] ?? 0) + 1;
  }
  const fuera = {
    motivos: Object.keys(porMotivo).filter((m) => !MOTIVOS_FALLO.includes(m)),
    sitios: Object.keys(porSitio).filter((s) => !SITIOS_FALLO.includes(s)),
  };
  return { total: fallos.length, graves, porMotivo, porSitio, otros, fuera };
}

const ordenar = (obj, valor = (v) => v) => Object.entries(obj).sort((a, b) => valor(b[1]) - valor(a[1]));

export function informe(c, { titulo = "" } = {}) {
  const l = [`Fallos del bot: ${c.total} (${c.graves} graves)${titulo ? ` · ${titulo}` : ""}`];
  if (!c.total) return l.join("\n");
  l.push("", "Por motivo:");
  for (const [m, n] of ordenar(c.porMotivo)) l.push(`  ${m.padEnd(16)} ${String(n).padStart(5)}`);
  l.push("", "Por sitio:");
  for (const [s, v] of ordenar(c.porSitio, (x) => x.total)) {
    const detalle = ordenar(v.motivos).map(([m, n]) => `${m} ${n}`).join(", ");
    l.push(`  ${s.padEnd(32)} ${String(v.total).padStart(5)}  (${detalle})`);
  }
  const otros = ordenar(c.otros).slice(0, 10);
  if (otros.length) {
    l.push("", "Sin clasificar (motivo «otro»), los más repetidos:");
    for (const [t, n] of otros) l.push(`  ${String(n).padStart(5)}  ${t}`);
  }
  if (c.fuera.motivos.length || c.fuera.sitios.length) {
    l.push("", `Fuera de la lista: motivos ${c.fuera.motivos.join(", ") || "—"}; sitios ${c.fuera.sitios.join(", ") || "—"}`);
  }
  return l.join("\n");
}

function argumentos(argv) {
  const a = { dias: 1, entorno: "production", fichero: null, maxTandas: 200 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dias") a.dias = Number(argv[++i]);
    else if (k === "--entorno") a.entorno = argv[++i];
    else if (k === "--fichero") a.fichero = argv[++i];
    else if (k === "--tandas") a.maxTandas = Number(argv[++i]);
    else throw new Error(`No conozco «${k}». Mira la cabecera de scripts/bot-fallos.mjs.`);
  }
  if (!(a.dias > 0 && a.dias <= 30)) throw new Error("--dias va de 1 a 30");
  if (!(Number.isInteger(a.maxTandas) && a.maxTandas > 0)) throw new Error("--tandas es un número entero");
  if (!["production", "preview"].includes(a.entorno)) throw new Error("--entorno es production o preview");
  return a;
}

// `vercel logs` devuelve como mucho 50 peticiones por llamada, pidas las que
// pidas (comprobado el 8 oct 2026 con la CLI 62.1.0).
const TANDA = 50;

/**
 * Una tanda de `vercel logs` entre dos instantes (ms), en JSON Lines. Con
 * VERCEL_TOKEN en el entorno (el vigía, en GitHub Actions) entra con él; si
 * no, con la sesión de `vercel login`.
 */
export function tandaDeVercel(entorno) {
  return ({ desde, hasta }) => {
    const args = ["logs", "--project", PROYECTO, "--scope", EQUIPO, "--environment", entorno,
      "--since", new Date(desde).toISOString(), "--until", new Date(hasta).toISOString(),
      "--query", "bot_fallo", "--json", "--limit", String(TANDA)];
    // Como argumento y nunca impreso: en Actions el log es público. En Windows
    // va por la shell (vercel.cmd), así que allí mejor `vercel login`.
    if (process.env.VERCEL_TOKEN) args.push("--token", process.env.VERCEL_TOKEN);
    // En Windows la CLI es vercel.cmd: hace falta la shell. Los argumentos son fijos, fechas ISO o números ya comprobados.
    const opciones = { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 };
    const r = process.platform === "win32"
      ? spawnSync(`vercel ${args.join(" ")}`, { ...opciones, shell: true })
      : spawnSync("vercel", args, opciones);
    if (r.error || r.status !== 0) {
      throw new Error(`vercel logs no ha ido (${r.error?.message ?? `salida ${r.status}`}). ¿Está instalada la CLI y con sesión (vercel login)?\n${String(r.stderr ?? "").slice(0, 500)}`);
    }
    return r.stdout;
  };
}

/**
 * Pide tandas hacia atrás: cada una acaba (--until) en la petición más vieja
 * de la anterior, hasta llegar a `desde` o a una tanda que no se llena.
 * @param {(r: { desde: number, hasta: number }) => string} pedirTanda
 * @returns {{ contenido: string, peticiones: number, tandas: number, completo: boolean, cubreDesde: number, hasta: number }}
 */
export function paginar(pedirTanda, { desde, hasta, tanda = TANDA, maxTandas = 200 }) {
  const vistas = new Set();
  const lineas = [];
  let cursor = hasta;
  let tandas = 0;
  let completo = false;
  while (tandas < maxTandas) {
    tandas++;
    const filas = String(pedirTanda({ desde, hasta: cursor }) ?? "").split(/\r?\n/).filter((l) => l.trim());
    let nuevas = 0;
    let masVieja = cursor;
    for (const l of filas) {
      const p = intentar(l);
      const id = p?.id ?? l;
      if (typeof p?.timestamp === "number") masVieja = Math.min(masVieja, p.timestamp);
      if (vistas.has(id)) continue;
      vistas.add(id);
      lineas.push(l);
      nuevas++;
    }
    // Se acabó: la tanda no se llenó, no trajo nada nuevo o ya llega al principio.
    if (filas.length < tanda || !nuevas || masVieja <= desde) { completo = true; cursor = desde; break; }
    // La más vieja entra otra vez (puede haber más en el mismo milisegundo); el id la quita.
    cursor = masVieja;
  }
  return { contenido: lineas.join("\n"), peticiones: lineas.length, tandas, completo, cubreDesde: Math.max(cursor, desde), hasta };
}

const fecha = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

async function main() {
  const a = argumentos(process.argv.slice(2));
  if (a.fichero) {
    const fallos = fallosDe(a.fichero === "-" ? readFileSync(0, "utf8") : readFileSync(a.fichero, "utf8"));
    console.log(informe(contar(fallos), { titulo: `fichero ${a.fichero}` }));
    if (fallos.ilegibles) console.warn(`\n(${fallos.ilegibles} líneas bot_fallo cortadas o ilegibles, sin contar)`);
    return;
  }
  const hasta = Date.now();
  const desde = hasta - a.dias * 24 * 3600 * 1000;
  const r = paginar(tandaDeVercel(a.entorno), { desde, hasta, maxTandas: a.maxTandas });
  const fallos = fallosDe(r.contenido);
  // Qué se ha mirado de verdad: el entorno, el rango cubierto y cuántas peticiones.
  const titulo = `${a.entorno}, de ${fecha(r.cubreDesde)} a ${fecha(hasta)} · ${r.peticiones} peticiones en ${r.tandas} tanda(s)`;
  console.log(informe(contar(fallos), { titulo }));
  if (fallos.ilegibles) console.warn(`\n(${fallos.ilegibles} líneas bot_fallo cortadas o ilegibles, sin contar)`);
  if (!r.completo) {
    console.warn(`\nOjo: no llega al principio del rango pedido (${fecha(desde)}): se ha parado en ${a.maxTandas} tandas. Sube --tandas o baja --dias.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
