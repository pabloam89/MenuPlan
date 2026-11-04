#!/usr/bin/env node
/**
 * Los intentos de conectar un chat con una casa (bot_enlaces, 0126; #1238). Solo lee.
 *
 *   node scripts/bot-enlaces.mjs            los últimos 30 días
 *   node scripts/bot-enlaces.mjs --dias 7
 *
 * Cuenta cada intento por camino y por resultado (los dos de su lista cerrada, src/lib/vocabularios.js); las
 * cuentas que intentan enlazar desde más de una casa (el síntoma de #1238: la app en una casa y Lola en otra); y las
 * cuentas que se quedaron fuera: rechazadas al menos una vez y sin ningún enlace hecho después. Es la cifra que
 * #1238 quiere en 0. Sin ids en la salida: solo cifras (el repo es público).
 *
 * Mismas barreras que scripts/consulta.mjs: el usuario de solo lectura y una transacción read only.
 */
import pg from "pg";
import { pathToFileURL } from "node:url";
import { leerEnv } from "./lib/env.mjs";
import { conexionDeConsulta, motivoUsuarioIncorrecto } from "./lib/rolLectura.mjs";
import { CAMINOS_ENLACE, RESULTADOS_ENLACE, ENLAZADOS } from "../src/lib/vocabularios.js";

/** Los días sin --dias. */
export const DIAS_POR_DEFECTO = 30;

/** Los días pedidos: sin --dias, DIAS_POR_DEFECTO; un valor que no es un entero positivo es un error, no 30 en silencio. */
export function leerDias(argv) {
  const i = argv.indexOf("--dias");
  if (i < 0) return DIAS_POR_DEFECTO;
  const dias = Number(argv[i + 1]);
  if (!Number.isInteger(dias) || dias < 1) throw new Error(`--dias tiene que ser un entero positivo; llegó «${argv[i + 1] ?? ""}»`);
  return dias;
}

/**
 * Pura, para el test. `filas`: [{ camino, resultado, cuenta, casa, en (ms) }], en cualquier orden.
 * @returns {{ intentos: number, porCamino: object, porResultado: object, variasCasas: number, fuera: number }}
 *   `variasCasas`: cuentas con intentos para más de una casa;
 *   `porCamino` y `porResultado` traen todos los valores de su lista (0 si no salió); `fuera`: cuentas con un rechazo
 *   y ningún enlace hecho después de él.
 */
export function contar(filas) {
  const ceros = (lista) => Object.fromEntries(lista.map((v) => [v, 0]));
  const porCamino = ceros(CAMINOS_ENLACE);
  const porResultado = ceros(RESULTADOS_ENLACE);
  const ultimo = new Map();
  const casas = new Map();
  for (const f of [...filas].sort((a, b) => a.en - b.en)) {
    if (!(f.camino in porCamino)) throw new Error(`camino fuera de la lista: «${f.camino}»`);
    if (!(f.resultado in porResultado)) throw new Error(`resultado fuera de la lista: «${f.resultado}»`);
    porCamino[f.camino]++;
    porResultado[f.resultado]++;
    if (f.cuenta) ultimo.set(f.cuenta, ENLAZADOS.has(f.resultado));
    if (f.cuenta && f.casa) casas.set(f.cuenta, (casas.get(f.cuenta) ?? new Set()).add(f.casa));
  }
  const fuera = [...ultimo.values()].filter((enlazada) => !enlazada).length;
  const variasCasas = [...casas.values()].filter((s) => s.size > 1).length;
  return { intentos: filas.length, porCamino, porResultado, variasCasas, fuera };
}

const lista = (o) => Object.entries(o).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "ninguno";

async function main() {
  const dias = leerDias(process.argv);
  const { url, aviso, rol } = conexionDeConsulta((k) => leerEnv(k), { admin: false });
  if (aviso) console.error(aviso);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: [quien] } = await client.query("select current_user as yo");
    const mal = motivoUsuarioIncorrecto(rol, quien.yo);
    if (mal) throw new Error(mal);
    await client.query("begin read only");
    await client.query("set local statement_timeout = '15s'");
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const { rows } = await client.query({
      text: "select camino_enlace, resultado_enlace, user_id, household_id, created_at from bot_enlaces where created_at > $1",
      values: [desde],
    });
    const c = contar(rows.map((r) => ({ camino: r.camino_enlace, resultado: r.resultado_enlace, cuenta: r.user_id, casa: r.household_id, en: Date.parse(r.created_at) })));
    console.log(`Últimos ${dias} días: ${c.intentos} intentos de enlazar un chat.`);
    console.log(`Por camino: ${lista(c.porCamino)}.`);
    console.log(`Por resultado: ${lista(c.porResultado)}.`);
    console.log(`Cuentas que intentan enlazar desde más de una casa: ${c.variasCasas}.`);
    console.log(`Cuentas que se quedaron fuera (rechazadas y sin enlazar después): ${c.fuera}.`);
  } finally {
    // Un rollback que falla se dice: la conexión se cierra igual.
    await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
