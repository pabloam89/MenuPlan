/**
 * mark-base-mode.mjs
 *
 * Marca `baseMode` ("aparte" | "dentro") en los platos que declaran
 * `mainBase`. Es la distinción de la que depende todo el batch cooking y la
 * única que `mainBase` no daba: dice QUÉ fécula lleva el plato, no si esa
 * fécula se puede tener ya hecha del domingo.
 *
 * ── Qué se automatiza y qué NO ─────────────────────────────────────────────
 * El nombre del plato decide bien en los extremos —un risotto es un risotto y
 * una ensalada de arroz es una ensalada— y no decide nada en el medio. Así que
 * este script marca solo lo inequívoco y DEJA SIN MARCAR el resto, que sale
 * listado al final para revisarlo a mano.
 *
 * Eso es deliberado y el esquema lo respalda: ausente ≠ "dentro". El generador
 * de sesiones ignora lo que no está marcado (ver lib/bases.js), así que una
 * receta sin revisar nunca acaba proponiendo una tanda que arruinaría el plato.
 * El riesgo de equivocarse es asimétrico: marcar "aparte" un risotto estropea
 * la cena, no marcarlo solo deja de ahorrar tiempo.
 *
 * Idempotente, y NO pisa lo ya marcado a mano — solo escribe donde no había
 * nada. Para reclasificar algo revisado, se edita el JSON.
 *
 * Usage:  node scripts/mark-base-mode.mjs [--dry]
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const DRY = process.argv.includes("--dry");

/**
 * Reglas por base: lista ORDENADA de [regex sobre el nombre, modo]. Gana la
 * primera que casa, y si no casa ninguna se aplica `porDefecto` — o se deja
 * sin marcar, si esa base no tiene uno.
 *
 * El orden importa y es donde vive el criterio: en `arroz` las excepciones van
 * antes que la regla general ("Arroz blanco con tomate frito" empieza por
 * "Arroz con" pero es arroz hervido de toda la vida), y en `patatas` va antes
 * lo que se cocina dentro, porque "Croquetas al horno" lleva "al horno" y no
 * por eso la patata es aparte.
 */
const REGLAS = {
  // Regla general del castellano de cocina, y sale sorprendentemente bien:
  // "Arroz con X" es un arroz —el grano se hace en el plato, absorbiendo su
  // caldo—; "X con arroz" es un plato acompañado de arroz blanco hervido.
  // Las excepciones van primero.
  arroz: {
    reglas: [
      // Empiezan por "Arroz" pero el grano se hierve solo y se junta al final.
      [/blanco|a la cubana|con tomate frito|tres delicias|chaufa|arroz frito|salteado/i, "aparte"],
      // Curry o guiso con su arroz al lado. El arroz nunca toca la salsa hasta
      // el plato, así que una olla del domingo sirve a los cuatro.
      [/tikka|korma|masala|aj[ií] de gallina|lomo saltado|seco de res|agridulce|jazm[ií]n|basmati/i, "aparte"],
      [/ensalada|bowl|relleno|rellena|guarnici|pur[eé]|papilla|bolitas|estilo cubano/i, "aparte"],
      // "Lentejas con arroz", "Calamares en su tinta con arroz": el arroz es
      // el acompañamiento, no el plato.
      [/con arroz/i, "aparte"],
      // Y ahora sí, la regla general: el grano se cocina dentro.
      [/^arroz (con|de|a la|al)|risotto|paella|meloso|caldoso|arroz negro|a banda|biryani|bogavante/i, "dentro"],
    ],
  },
  // La pasta italiana se hierve aparte POR DEFINICIÓN, así que aquí el caso
  // normal es "aparte" y lo que se lista son las excepciones: lo que se hidrata
  // dentro de un horno (lasaña, canelones) o de un caldo (sopas, fideos).
  pasta: {
    reglas: [
      [/lasa|cannelon|canelon|sopa|caldo|fideu|fideos|al horno|gratinad|one-pot|pastel|a la cazuela/i, "dentro"],
    ],
    porDefecto: "aparte",
  },
  // La patata de un guiso se cocina en su salsa y toma su sabor; la cocida, la
  // asada y la frita son un bloque que se junta al final. Aquí no hay defecto:
  // el catálogo reparte de verdad entre los dos casos.
  patatas: {
    reglas: [
      [/tortilla|guis|estofad|marmitako|caldereta|a la riojana|a la importancia|pur[eé]|papilla|crema |croquet|pastel|muffin|frittata|alb[oó]ndiga|bastones|caldo|sopa|suquet|vichyssoise|aloo|dauphinois/i, "dentro"],
      // En todo plato de huevos con patatas, la patata se fríe por su cuenta.
      [/huevos|rotos|estrellados|paja/i, "aparte"],
      [/asad|al horno|frit|panader|cocid|ensaladilla|vapor|revolcon|bravas|ensalada|campera|ni[cç]oise|causa|huancaína|huancaina|hasselback|duquesa|gnocchi|feira|brasa|romesco|timbal|rellenas|rellenos/i, "aparte"],
      // Los tres que el nombre no resolvía. Comprobados paso a paso: en los
      // dos guisos la patata se cuece en SU olla y se tritura para hacer la
      // cama de puré del emplatado (nunca entra en la salsa), y en el tumbet
      // se fríe en rodajas, se escurre y se reserva antes de montar la
      // bandeja. En los tres, la patata es un bloque separable.
      [/^ossobuco|^rabo de toro|^tumbet/i, "aparte"],
    ],
  },
  // La legumbre COCIDA es la base, y es lo que compra medio país en bote: el
  // guiso se monta encima. Por eso aquí el reparto va al revés que en el arroz
  // y "aparte" es el caso normal, no la excepción.
  //
  // El falafel es la excepción de verdad: se hace con garbanzo REMOJADO en
  // crudo, y con garbanzo cocido se deshace en la sartén.
  legumbre: {
    reglas: [[/falafel/i, "dentro"]],
    porDefecto: "aparte",
  },
  // Se cuecen, se enfrían y se usan. No hay caso "dentro" en este catálogo.
  quinoa: { reglas: [], porDefecto: "aparte" },
  cuscus: { reglas: [], porDefecto: "aparte" },
  boniato: { reglas: [], porDefecto: "aparte" },
  // La avena siempre se hidrata DENTRO de lo que sea (papilla, tortita,
  // muffin). No hay tanda de avena que guardar.
  avena: { reglas: [], porDefecto: "dentro" },
  // Y el pan, menos todavía: aquí "pan" significa que el plato lleva pan
  // (Wellington, hamburguesa, tosta), no que haya una base que hornear el
  // domingo. Es el motivo de que `pan` siga en MAIN_BASES sin ser batcheable:
  // lo dice este campo, no una excepción escrita en el motor.
  pan: { reglas: [], porDefecto: "dentro" },
};

let marcadas = 0;
const sinDecidir = [];
const conteo = {};

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const path = join(RECIPES_DIR, file);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  let tocado = false;

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    if (!r.mainBase || r.type === "base") continue;
    if (r.baseMode) { conteo[r.baseMode] = (conteo[r.baseMode] ?? 0) + 1; continue; }

    const regla = REGLAS[r.mainBase];
    if (!regla) continue;

    let modo = null;
    for (const [re, m] of regla.reglas) {
      if (re.test(r.name)) { modo = m; break; }
    }
    modo ??= regla.porDefecto ?? null;

    if (!modo) {
      sinDecidir.push(`${r.mainBase.padEnd(9)} ${r.name}`);
      continue;
    }

    // Insertado justo detrás de mainBase, que es donde se lee.
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = v;
      if (k === "mainBase") out.baseMode = modo;
    }
    recipes[i] = out;
    conteo[modo] = (conteo[modo] ?? 0) + 1;
    marcadas++;
    tocado = true;
  }

  if (tocado && !DRY) writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
}

console.log(`${marcadas} recetas marcadas${DRY ? " (dry run)" : ""}.`);
console.log(`  aparte: ${conteo.aparte ?? 0}   dentro: ${conteo.dentro ?? 0}`);
console.log(`\nSIN DECIDIR — ${sinDecidir.length} para revisar a mano:`);
for (const l of sinDecidir.sort()) console.log("  " + l);
