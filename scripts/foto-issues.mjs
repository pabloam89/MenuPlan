#!/usr/bin/env node
/**
 * Genera la foto publicada de los issues (fondo #326; lógica en scripts/lib/fotoIssues.mjs).
 * Lo lanza el workflow `foto-issues.yml` con el GITHUB_TOKEN del propio workflow, que luego la sube
 * a la release `foto-issues`; en local sirve para probarla (`GH_TOKEN` de la App y `--salida` a una
 * carpeta temporal).
 *
 *   node scripts/foto-issues.mjs --previa <issues.json anterior> --salida <issues.json nuevo>
 *
 * Sin `--previa` (o si no se lee, o su versión no es la de este código) empieza desde cero: todos los
 * issues son nuevos y se leen por id dentro del cupo; lo que no cabe queda en `pendientes` y sigue en la
 * pasada siguiente (la foto sale con `completa: false` y los lectores van a la API mientras tanto).
 * Deja una línea `foto-issues modo: … puntos: … restantes: …` por ejecución; si GitHub falla, una
 * línea `foto-issues resultado: fallo motivo: …` y sale con 2 (los lectores tienen la API de respaldo).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { actualizarFoto } from "./lib/fotoIssues.mjs";
import { ghSync } from "./lib/cuotaGh.mjs";

const args = process.argv.slice(2);
const valor = (op) => (args.indexOf(op) >= 0 ? args[args.indexOf(op) + 1] : undefined);
const salida = valor("--salida");
const previaRuta = valor("--previa");
if (!salida) {
  console.error("Uso: node scripts/foto-issues.mjs [--previa <issues.json>] --salida <issues.json>");
  process.exit(1);
}

/** Una consulta GraphQL con sus variables: el texto de la respuesta (si trae `errors`, gh lanza con la respuesta en `.stdout`). */
function gh(consulta, vars = {}) {
  const a = ["api", "graphql", "-f", `query=${consulta}`];
  for (const [k, v] of Object.entries(vars)) {
    if (Array.isArray(v)) for (const x of v) a.push("-f", `${k}=${x}`);
    else a.push("-f", `${k}=${v}`);
  }
  return ghSync("foto-issues", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, maxBuffer: 100_000_000 });
}

let previa = null;
if (previaRuta && existsSync(previaRuta)) {
  try {
    previa = JSON.parse(readFileSync(previaRuta, "utf8"));
  } catch {
    console.warn("foto-issues aviso: la foto anterior no se lee; empiezo desde cero");
  }
}

try {
  const { foto, resumen } = actualizarFoto({ previa, gh });
  writeFileSync(salida, JSON.stringify(foto));
  const r = resumen;
  console.log(`foto-issues modo: ${r.modo} total: ${foto.total} completa: ${foto.completa ? "si" : "no"} listados: ${r.listados} nuevos: ${r.nuevos} cambiados: ${r.cambiados} de_padre: ${r.de_padre} vecinos: ${r.vecinos} rotados: ${r.rotados} borrados: ${r.borrados} pendientes: ${r.pendientes} puntos: ${r.puntos} restantes: ${r.restantes ?? "?"}`);
} catch (e) {
  console.error(`foto-issues resultado: fallo motivo: ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(2);
}
