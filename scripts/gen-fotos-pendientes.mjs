/**
 * gen-fotos-pendientes.mjs
 *
 * Genera la foto de TODAS las recetas del catálogo que no tienen una, usando el
 * mismo pipeline de siempre (regen-one-dish.mjs: Gemini → Vercel Blob →
 * manifest). Existe porque un plato sin foto es un plato muerto: `estrella`
 * exige foto (lo comprueba validate-catalog) y el generador solo propone
 * estrellas, así que una receta nueva no se enseña hasta que pasa por aquí.
 *
 * ── Por qué en dos pasos y no automático ───────────────────────────────────
 * Cuesta dinero y sube ficheros a un almacén público, así que hace falta
 * pedirlo a mano. Primero el ensayo, que dice a quién le falta y no llama a
 * nadie:
 *
 *   node scripts/gen-fotos-pendientes.mjs
 *   node --env-file=.env.local scripts/gen-fotos-pendientes.mjs --si
 *
 * Si la cuenta de AI Studio se queda sin crédito devuelve un 429 diciéndolo con
 * todas las letras ("prepayment credits are depleted"). No es un fallo del
 * script: hay que recargar en https://ai.studio/projects y volver a lanzarlo.
 * Es reanudable — salta lo que ya tiene foto—, así que se puede relanzar tal
 * cual las veces que haga falta.
 */
import { execFileSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const MANIFEST = join(ROOT, "src", "assets", "dishes", "dishImages.json");
const CONFIRMA = process.argv.includes("--si");

/**
 * Lo que sale del HORNO y no de una olla, y por tanto se fotografía en bandeja.
 *
 * Solo dos. `patatas` NO está, aunque a primera vista lo parezca: nuestra base
 * son "Patatas cocidas", enteras con piel en agua, y una bandeja de patatas
 * doradas contaría otra receta — el mismo tipo de mentira que la foto que
 * enseña una guarnición que el plato no lleva.
 */
const DE_BANDEJA = new Set(["bases_007", "bases_011", "bases_014"]);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const conFoto = new Set(Object.keys(manifest).filter((k) => !k.includes("+")));

const pendientes = [];
for (const file of readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"))) {
  for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"))) {
    // Las BASES sí llevan foto desde que se enseñan en el menú: son recetas
    // como las demás, con su dificultad, su tiempo y su ficha, y la pestaña de
    // batch cooking las pinta con las mismas tarjetas que los platos. La
    // ilustración de dibujo se queda donde estaba, en el selector del wizard.
    //
    // Las salsas siguen fuera porque no se enseñan en ninguna parte: nada
    // apunta a ellas (`sauceId` está a cero en todo el catálogo).
    if (r.type === "salsa") continue;
    if (conFoto.has(r.id)) continue;
    pendientes.push(r);
  }
}

if (pendientes.length === 0) {
  console.log("Todas las recetas del catálogo tienen foto.");
  process.exit(0);
}

for (const r of pendientes) console.log(`· ${r.id} — ${r.name}`);
console.log(`\n${pendientes.length} receta(s) sin foto.`);

if (!CONFIRMA) {
  console.log("Ensayo: no se ha llamado a la API ni se ha subido nada.");
  console.log("Para generarlas:  node --env-file=.env.local scripts/gen-fotos-pendientes.mjs --si");
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

console.log(`\n${ok} generadas, ${fallidas} fallidas de ${pendientes.length}.`);
if (ok > 0) {
  console.log("Ahora se pueden marcar como `estrella`: sin eso el generador no las propone.");
}
