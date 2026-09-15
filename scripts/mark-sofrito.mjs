/**
 * mark-sofrito.mjs
 *
 * Marca `basesAparte: ["sofrito"]` en los platos que empiezan pochando cebolla.
 *
 * ── Por qué el sofrito y no otra cosa ──────────────────────────────────────
 * Es la base más grande del catálogo con diferencia —lo lleva más de un tercio
 * del recetario estrella, más que las siete bases de fécula juntas— y, sobre
 * todo, es la que más TRABAJO ahorra. Una olla de arroz son 18 minutos de los
 * que 8 son tuyos; un sofrito son 30 y son los 30. Ver `fraccionActiva` en
 * lib/bases.js: el ahorro que importa es el de estar delante, no el del reloj.
 *
 * ── El criterio, y por qué puede ser más laxo que el de `baseMode` ─────────
 * El riesgo va al revés. Precocer el arroz de un risotto ARRUINA la cena, así
 * que allí la duda cae siempre del lado de no proponer. Tener sofrito hecho y
 * no usarlo no estropea nada: como mucho te sobra un bote. Así que aquí basta
 * con que el plato tenga cebolla y la poche al principio.
 *
 * Se exigen las dos cosas —el ingrediente Y el paso— porque una sola falla:
 * hay platos con cebolla cruda en ensalada, y hay pasos que dicen "sofreír" el
 * ajo solo, que no es un sofrito que se pueda guardar.
 *
 * NO marca las recetas `type: "base"` (el sofrito no se aprovecha a sí mismo)
 * ni los platos de bebés (sus purés llevan su propia lógica).
 *
 * Idempotente. No pisa un `basesAparte` escrito a mano: solo añade "sofrito"
 * si no está.
 *
 *   node scripts/mark-sofrito.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const DRY = process.argv.includes("--dry");

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// El paso tiene que POCHAR/SOFREÍR, y la cebolla tiene que estar cerca: "sofreír
// el ajo" solo no es un sofrito, y "cebolla" suelta tampoco (puede ser cruda).
const PASO_SOFRITO = /(sofre|pocha|poche|rehoga|refrei)[a-z]*[^.]{0,60}cebolla|cebolla[^.]{0,40}(sofre|pocha|poche|rehoga)/;
// Y una cebolla de verdad en la lista, no cebolleta ni cebolla en polvo.
const ES_CEBOLLA = /^cebolla( morada)?$/;

let marcadas = 0;
const ejemplos = [];

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const path = join(RECIPES_DIR, file);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  let tocado = false;

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    if (r.type === "base" || r.category === "bebes") continue;
    if ((r.basesAparte ?? []).includes("sofrito")) continue;

    const tieneCebolla = (r.ingredients ?? []).some((ing) => ES_CEBOLLA.test(norm(ing.name)));
    if (!tieneCebolla) continue;
    const pasos = norm([...(r.steps ?? []), ...(r.stepsRich ?? []).map((s) => s.text)].join(" · "));
    if (!PASO_SOFRITO.test(pasos)) continue;

    // El `continue` de basesAparte no es cosmetico: sin el, una receta que ya
    // trajera basesAparte DESPUES de baseMode se escribia bien al llegar a
    // baseMode y el propio bucle la pisaba con la lista vieja al llegar a
    // basesAparte, perdiendo la marca en silencio. Paso en mark-bases-aparte.
    const finales = [...(r.basesAparte ?? []), "sofrito"];
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "basesAparte") continue;
      out[k] = v;
      // Justo detrás de baseMode si lo hay, o de mainBase: los tres ejes de
      // base se leen juntos.
      if (k === "baseMode" || (k === "mainBase" && !("baseMode" in r))) {
        out.basesAparte = finales;
      }
    }
    if (!out.basesAparte) out.basesAparte = finales;
    recipes[i] = out;
    marcadas++;
    tocado = true;
    if (ejemplos.length < 10) ejemplos.push(r.name);
  }

  if (tocado && !DRY) writeFileSync(path, `${JSON.stringify(recipes, null, 2)}\n`, "utf8");
}

console.log(`${marcadas} platos marcados con sofrito${DRY ? " (dry run)" : ""}.`);
for (const n of ejemplos) console.log(`   ${n}`);
