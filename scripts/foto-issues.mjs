#!/usr/bin/env node
/**
 * Genera la foto publicada de los issues (fondo #326; lógica en scripts/lib/fotoIssues.mjs).
 * Lo lanza `.github/workflows/foto-issues.yml` con el GITHUB_TOKEN del propio workflow; en local
 * sirve para probarla (`GH_TOKEN` de la App y `--salida` a una carpeta temporal).
 *
 *   node scripts/foto-issues.mjs --previa <issues.json anterior> --salida <issues.json nuevo>
 *
 * Sin `--previa` (o si no se lee, o su versión no es la de este código) hace la lectura completa.
 * Deja una línea `foto-issues modo: … puntos: … restantes: …` por ejecución. Si faltan puntos para
 * una lectura completa (menos de PUNTOS_MIN_COMPLETA restantes) no la hace y sale con 2: mejor sin foto que dejar
 * sin cupo al resto del workflow, y los lectores tienen la API de respaldo.
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

/** Una consulta GraphQL con sus variables; devuelve `data` y lanza si GitHub devuelve errores. */
function gh(consulta, vars = {}) {
  const a = ["api", "graphql", "-f", `query=${consulta}`];
  for (const [k, v] of Object.entries(vars)) {
    if (Array.isArray(v)) for (const x of v) a.push("-f", `${k}=${x}`);
    else a.push("-f", `${k}=${v}`);
  }
  const r = JSON.parse(ghSync("foto-issues", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, maxBuffer: 100_000_000 }));
  if (r.errors?.length) throw new Error(`GraphQL: ${r.errors.map((e) => e?.message ?? "error").join("; ")}`);
  if (!r.data) throw new Error("GraphQL sin datos");
  return r.data;
}

let previa = null;
if (previaRuta && existsSync(previaRuta)) {
  try {
    previa = JSON.parse(readFileSync(previaRuta, "utf8"));
  } catch {
    console.warn("foto-issues aviso: la foto anterior no se lee; hago la lectura completa");
  }
}

try {
  const { foto, resumen } = actualizarFoto({ previa, gh });
  writeFileSync(salida, JSON.stringify(foto));
  console.log(`foto-issues modo: ${resumen.modo} total: ${foto.total} cambiados: ${resumen.cambiados} vecinos: ${resumen.vecinos} rotados: ${resumen.rotados} borrados: ${resumen.borrados} puntos: ${resumen.puntos} restantes: ${resumen.restantes ?? "?"}`);
} catch (e) {
  console.error(`foto-issues resultado: fallo motivo: ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(2);
}
