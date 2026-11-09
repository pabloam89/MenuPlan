/**
 * El trabajador de Comprar: corre en el servidor, mira cada poco si hay encargos y rellena las listas, de una en una.
 * Skill `mercadona`. Lee tres variables, y no tiene acceso a la base: solo ve lo que le da api/mercadona.js.
 *
 *   MERCADONA_API               https://…/api/mercadona
 *   MERCADONA_TRABAJADOR_TOKEN  el token que solo vale en ese endpoint
 *   MERCADONA_CLAVE_PRIVADA     la clave que abre las sesiones, base64 de PKCS8; solo vive en este servidor
 *
 *   node scripts/mercadona-trabajador.mjs --claves fichero   crea las claves: guarda la privada y escribe la pública
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { abrir, ALGORITMO_CLAVE } from "../src/lib/mercadonaSello.js";
import { esperaTrasFallos, unaVuelta } from "./lib/mercadonaTrabajador.mjs";

const CADA_MS = 20_000;
const TOPE_ESPERA_MS = 5 * 60 * 1000;
const ENTRE_ENCARGOS_MS = 5000;
const TIEMPO_API_MS = 30_000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (texto) => console.log(`${new Date().toISOString()} ${texto}`);
const aBase64 = (bytes) => Buffer.from(bytes).toString("base64");

function requerida(nombre) {
  const v = process.env[nombre];
  if (!v) throw new Error(`falta ${nombre}`);
  return v;
}

async function crearClaves(fichero) {
  if (fs.existsSync(fichero)) throw new Error(`${fichero} ya existe: rotar la clave deja fuera las cuentas conectadas`);
  const par = await crypto.subtle.generateKey(
    { ...ALGORITMO_CLAVE, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["wrapKey", "unwrapKey"],
  );
  fs.writeFileSync(fichero, aBase64(await crypto.subtle.exportKey("pkcs8", par.privateKey)), { mode: 0o600 });
  console.log(aBase64(await crypto.subtle.exportKey("spki", par.publicKey)));
}

function clienteApi(url, token) {
  const pedir = async (cuerpo) => {
    const r = await fetch(`${url}?trabajador=1`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIEMPO_API_MS),
    });
    if (!r.ok) throw new Error(`api: HTTP ${r.status}`);
    return r.json();
  };
  return {
    tomar: async () => (await pedir({ accion: "tomar" })).siguiente,
    tomarReserva: async () => (await pedir({ accion: "tomar_reserva" })).siguiente,
    cerrar: (id, resultado) => pedir({ accion: "cerrar", id, resultado }),
  };
}

/** La única pieza que sabe de qué navegador se trata: pasar a uno en la nube es cambiar esta función. */
async function abrirNavegador(estado) {
  const navegador = await chromium.launch({ headless: true, chromiumSandbox: false });
  const contexto = await navegador.newContext({ storageState: estado });
  return { pagina: await contexto.newPage(), cerrar: () => navegador.close() };
}

async function main() {
  const fichero = process.argv[process.argv.indexOf("--claves") + 1];
  if (process.argv.includes("--claves")) return crearClaves(fichero);

  const api = clienteApi(requerida("MERCADONA_API"), requerida("MERCADONA_TRABAJADOR_TOKEN"));
  const der = Buffer.from(requerida("MERCADONA_CLAVE_PRIVADA"), "base64");
  const privada = await crypto.subtle.importKey("pkcs8", der, ALGORITMO_CLAVE, false, ["unwrapKey"]);
  const abrirSesion = (sello) => abrir(sello, privada);

  log("en marcha");
  let fallos = 0;
  for (;;) {
    try {
      const habiaTrabajo = await unaVuelta({ api, log, abrirSesion, abrirNavegador });
      fallos = 0;
      await dormir(habiaTrabajo ? ENTRE_ENCARGOS_MS : CADA_MS);
    } catch (e) {
      fallos += 1;
      log(`api: ${e.message}`);
      await dormir(esperaTrasFallos(fallos, CADA_MS, TOPE_ESPERA_MS));
    }
  }
}

main().catch((e) => {
  console.error(`trabajador: ${e.message}`);
  process.exitCode = 1;
});
