#!/usr/bin/env node
/**
 * Las cifras del plan «fichas con estado» (trozo 38; qué se mide, en
 * scripts/lib/cifrasModelo.js). Solo lee: el repo, la base con el usuario de
 * lectura en una transacción `read only` (conLectura) y la última pasada del
 * banco de frases. `--json` para el panel; `--sin-base` sin abrir la base.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CIFRAS, medirCifras, tablaDeCifras } from "./lib/cifrasModelo.js";
import { diaMadrid, ahoraEnMadrid } from "./lib/hora.mjs";
import { leerJsonl } from "./lib/evals.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const sinBase = process.argv.includes("--sin-base");
const enJson = process.argv.includes("--json");

/** git grep -E sobre unas carpetas, sin ficheros de test (el `grep -v test` de los trozos). */
function gitGrep(opcion, patron, rutas) {
  try {
    return execFileSync("git", ["grep", opcion, "-E", patron, "--", ...rutas], { cwd: raiz, encoding: "utf8" })
      .split("\n").filter((l) => l && !/test/.test(l.split(":")[0]));
  } catch (e) {
    // git grep sale con 1 cuando no encuentra nada: eso es un 0 de verdad. Cualquier otra salida, se lanza.
    if (e.status === 1 && !e.stderr?.length) return [];
    throw e;
  }
}

// Lo que ya calculan otros scripts se pide a sus módulos (cargados solo si una cifra los usa).
let inventario = null;
let capacidades = null;
const ctx = {
  existe: (ruta) => existsSync(join(raiz, ruta)),
  leer: (ruta) => readFileSync(join(raiz, ruta), "utf8"),
  ficherosCon: (patron, rutas) => gitGrep("-l", patron, rutas),
  lineasCon: (patron, rutas) => gitGrep("-c", patron, rutas).reduce((s, l) => s + Number(l.split(":").at(-1)), 0),
  inventario: async () => {
    inventario ??= (await (await import("./lib/inventarioFicha.mjs")).inventario(raiz)).cifras;
    return inventario;
  },
  capacidades: async () => {
    if (!capacidades) {
      const { mapaDeDatos, cifrasDeDatos, CAPACIDADES, esHueco } = await import("../src/lib/capacidades.js");
      capacidades = { huecos: CAPACIDADES.filter(esHueco).length, ...cifrasDeDatos(mapaDeDatos()) };
    }
    return capacidades;
  },
  pasadas: () => leerJsonl(join(raiz, ".evals-out", "pasadas.jsonl")),
  consultar: () => {
    throw new Error("la base no está abierta");
  },
};

async function medir() {
  if (sinBase) return medirCifras(CIFRAS, ctx, { sinBase });
  const { leerEnv } = await import("./lib/env.mjs");
  const { conLectura } = await import("./lib/rolLectura.mjs");
  return conLectura(leerEnv, (consultar) => medirCifras(CIFRAS, { ...ctx, consultar }));
}

const filas = await medir();
const fecha = diaMadrid();
if (enJson) console.log(JSON.stringify({ fecha, hora: ahoraEnMadrid(), con_base: !sinBase, cifras: filas }, null, 1));
else console.log(tablaDeCifras(filas, { fecha: `${ahoraEnMadrid()}${sinBase ? ", sin la base" : ""}` }));
