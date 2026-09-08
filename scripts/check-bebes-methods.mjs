/**
 * check-bebes-methods.mjs — audita los `methods[]` de las recetas de bebé.
 *
 * `methods[].prepSummary` no es una nota interna: se pinta en la ficha y lo lee
 * alguien que está cocinando para un bebé de ocho meses. Lo genera un modelo, y
 * el prompt genérico del que salen todos los demás electrodomésticos del
 * catálogo dice "eres un chef experto en cocina española" — con eso, un
 * "salpimentar al gusto" entra sin que nadie lo pare.
 *
 * Este script es ese freno. Comprueba tres cosas:
 *   1. Palabras prohibidas: sal, azúcar, miel y compañía.
 *   2. Vocabulario de textura de adulto: crujiente, al dente, bien dorado.
 *      A esta edad se cocina de más a propósito.
 *   3. Frases cortadas a media palabra (el recorte a 280 caracteres).
 *
 * Uso: node scripts/check-bebes-methods.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BEBES = join(__dirname, "..", "src", "data", "recipes", "bebes.json");

const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// "sin sal" es lo contrario de un problema, así que se borra ANTES de buscar
// "sal". Igual con "sin azúcar" y "sin sazonar". Sin esta pasada, la receta
// mejor escrita del fichero es la que más avisos daría.
const PERMITIDO = /\bsin (sal|azucar|azucares|miel|sazonar|salar)\b/g;

const PROHIBIDAS = [
  [/\bsal\b|\bsalpimentar\b|\bsazonar\b|\bsalar\b/, "sal"],
  [/\bazucar\b|\bazucares\b|\bendulzar\b/, "azúcar"],
  [/\bmiel\b/, "miel"],
  [/pastilla de caldo|caldo de brik|caldo concentrado/, "caldo industrial"],
  [/queso rallado|queso curado|queso semicurado|parmesano/, "queso curado o rallado"],
];

const TEXTURA_ADULTO = [
  [/\bcrujiente\b|\bcrujientes\b/, "crujiente"],
  [/\bal dente\b/, "al dente"],
  [/\bbien dorad|\bmuy dorad|\bdorado intenso/, "bien dorado"],
  [/\btostado\b|\btostada\b/, "tostado"],
];

const recetas = JSON.parse(readFileSync(BEBES, "utf8"));
const avisos = [];
let conMethods = 0, totalMethods = 0;

for (const r of recetas) {
  if (!r.methods?.length) continue;
  conMethods++;
  for (const m of r.methods) {
    totalMethods++;
    const crudo = String(m.prepSummary ?? "");
    const texto = sinTildes(crudo).replace(PERMITIDO, " ");

    for (const [re, etiqueta] of PROHIBIDAS) {
      if (re.test(texto)) avisos.push([`${r.id} [${m.appliance}]`, `PROHIBIDO: ${etiqueta}`, crudo]);
    }
    for (const [re, etiqueta] of TEXTURA_ADULTO) {
      if (re.test(texto)) avisos.push([`${r.id} [${m.appliance}]`, `textura de adulto: ${etiqueta}`, crudo]);
    }
    if (crudo.length >= 250 && !/[.!?…]$/.test(crudo.trim())) {
      avisos.push([`${r.id} [${m.appliance}]`, "frase cortada a media palabra", crudo]);
    }
    if (!crudo.trim()) avisos.push([`${r.id} [${m.appliance}]`, "prepSummary vacío", ""]);
  }
}

console.log(`bebes.json: ${conMethods}/${recetas.length} recetas con methods, ${totalMethods} métodos en total`);

if (avisos.length === 0) {
  console.log("\n✓ Sin avisos: ni sal, ni azúcar, ni texturas de adulto, ni frases cortadas.");
  process.exit(0);
}

console.log(`\n❌ ${avisos.length} aviso/s:\n`);
for (const [donde, que, texto] of avisos) {
  console.log(`  ${donde}  ${que}`);
  if (texto) console.log(`     «${texto.slice(0, 150)}${texto.length > 150 ? "…" : ""}»`);
}
process.exit(1);
