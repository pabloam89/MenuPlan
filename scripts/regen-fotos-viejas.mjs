/**
 * regen-fotos-viejas.mjs
 *
 * Vuelve a generar las fotos de una lista de recetas con el prompt ACTUAL.
 *
 * Existe por un fallo concreto: `scripts/lib/combos.mjs` se quedó con el fondo
 * de pizarra negra de la primera hornada mientras `gen-all-photos.mjs` pasaba
 * al mármol cálido. Como `regen-one-dish.mjs` tira del primero, toda foto
 * generada de una en una salía del estilo viejo sin que nada lo dijera — y solo
 * se nota al verla al lado de las demás en el menú.
 *
 * No hay forma de saber desde el JSON con qué prompt se generó una foto, así
 * que la lista se pasa a mano:
 *
 *   node scripts/regen-fotos-viejas.mjs --ids-file=<ruta>            # ensayo
 *   node --env-file=.env.local scripts/regen-fotos-viejas.mjs --ids-file=<ruta> --si
 *
 * Cada foto sube al mismo sitio y sube el `?v=` del manifest, así que el CDN
 * sirve la nueva. Es reanudable: si se corta, se relanza con la misma lista.
 */
import { execFileSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { join, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const CONFIRMA = process.argv.includes("--si");
const idsArg = process.argv.find((a) => a.startsWith("--ids-file="))?.slice(11);

// Las que salen del HORNO se fotografían en bandeja, no en bol. Misma lista que
// en gen-fotos-pendientes.mjs.
const DE_BANDEJA = new Set(["bases_007", "bases_011", "bases_014"]);

if (!idsArg) {
  console.error("Falta --ids-file=<ruta> con un id por línea.");
  process.exit(1);
}

const ids = readFileSync(isAbsolute(idsArg) ? idsArg : join(ROOT, idsArg), "utf8")
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const porId = new Map();
for (const file of readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"))) {
  for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"))) {
    porId.set(r.id, r);
  }
}

const pendientes = [];
const desconocidos = [];
for (const id of ids) {
  const r = porId.get(id);
  if (r) pendientes.push(r);
  else desconocidos.push(id);
}

for (const r of pendientes) console.log(`· ${r.id} — ${r.name}${DE_BANDEJA.has(r.id) ? "  [bandeja]" : ""}`);
if (desconocidos.length > 0) {
  console.error(`\n⚠️  ${desconocidos.length} id(s) que no están en el catálogo: ${desconocidos.join(", ")}`);
}
console.log(`\n${pendientes.length} receta(s) a regenerar.`);

if (!CONFIRMA) {
  console.log("Ensayo: no se ha llamado a la API ni se ha subido nada.");
  console.log(`Para hacerlo:  node --env-file=.env.local scripts/regen-fotos-viejas.mjs --ids-file=${idsArg} --si`);
  process.exit(0);
}

let ok = 0;
let fallidas = 0;
for (const r of pendientes) {
  try {
    execFileSync(
      process.execPath,
      [
        "--env-file=.env.local", join(__dirname, "regen-one-dish.mjs"), r.id, r.name,
        ...(DE_BANDEJA.has(r.id) ? ["--bandeja"] : []),
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
    ok += 1;
  } catch {
    fallidas += 1;
    console.error(`✗ ${r.id} — ${r.name}`);
  }
}

console.log(`\n${ok} regeneradas, ${fallidas} fallidas de ${pendientes.length}.`);
