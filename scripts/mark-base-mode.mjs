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
// Rehacer una base concreta, PISANDO lo que ya tenga. Existe porque el
// criterio de `legumbre` estaba mal (ver sus reglas) y sin esto la unica
// forma de corregir 60 recetas era a mano. Se pide por su nombre a proposito:
// un `--force` global volveria a pisar lo revisado a mano de las otras bases,
// que es justo lo que este script promete no hacer.
//   node scripts/mark-base-mode.mjs --rehacer=legumbre
const REHACER = (process.argv.find((a) => a.startsWith("--rehacer=")) ?? "").split("=")[1] || null;

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
  // La legumbre era el agujero grande: `porDefecto: "aparte"` con una sola
  // excepción (falafel) marcaba el cocido madrileño, la fabada, los potajes y
  // los judiones como si el garbanzo se cociera aparte. En un cocido el
  // garbanzo cuece DENTRO del caldo con la carne durante horas: eso ES el
  // plato, y tener garbanzos hechos del domingo no te da un cocido, te da
  // garbanzos y un caldo que no los ha visto.
  //
  // El test mecánico es el mismo que el de las salsas: ¿la legumbre ha cocido
  // en el caldo del plato? Si el acompañamiento pide cocción larga (chorizo,
  // morcilla, costilla, carne, bacalao) el guiso se hace entero y la legumbre
  // se empapa → DENTRO. Si el acompañamiento es rápido (espinacas, tomate, un
  // huevo encima) la legumbre entra ya cocida y solo se saltea → APARTE, que
  // es justo como se cocina con bote.
  legumbre: {
    reglas: [
      // Se hace CON la legumbre cruda o en remojo: no hay tanda que reutilizar.
      [/falafel/i, "dentro"],
      // Lenteja roja: se deshace dentro del plato, es el espesante.
      [/lenteja(s)? roja/i, "dentro"],
      // Lo que se construye a partir de legumbre YA cocida, sin excepción.
      [/hummus|ensalada|pur[eé]|hamburguesa|tortita|bocadito|bolita|crujiente|frito|fritos|saltead|papilla/i, "aparte"],
      // Ropa vieja: se hace CON las sobras de un cocido, o sea con el garbanzo
      // ya cocido. El nombre lleva "cocido" pero es el caso contrario.
      [/ropa vieja/i, "aparte"],
      // Cremas: se trituran, y se trituran legumbres YA cocidas.
      [/^crema de|crema de (garbanzo|lenteja|alubia|jud[ií]a)/i, "aparte"],
      // Buñuelo: como el falafel, se hace con garbanzo crudo en remojo.
      [/bu[ñn]uelo/i, "dentro"],
      // El plato es de OTRA cosa y la legumbre acompaña: entra ya cocida.
      [/^jud[ií]as verdes/i, "aparte"],
      // Acompañamiento RAPIDO: la legumbre entra ya cocida y solo se saltea.
      // Es el caso del bote, y es como se cocina de verdad entre semana.
      [/con (espinacas|tomate|setas|jud[ií]as verdes|piñones)|a la andaluza|con curry y espinacas/i, "aparte"],
      // Los nombres que son guiso por definición.
      [/potaje|puchero|cocido|fabada|judiones|frijoles|estofad|guisad|a la riojana|a la jardinera|al curry|curry (rojo|verde)/i, "dentro"],
      // "X con Y" donde Y pide cocción larga: el guiso se hace entero.
      [/alubiada|con (chorizo|morcilla|salchich|costilla|butifarra|panceta|tocino|jam[oó]n|ternera|pollo|bacalao|calamares|pulpo|almejas|langostinos|compango|verduras|calabaza|boletus|castañas|manzana)/i, "dentro"],
    ],
    // Lo que no casa nada se queda SIN MARCAR a propósito: el riesgo es
    // asimétrico y una legumbre sin revisar no debe proponer tanda.
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
    const rehaciendo = REHACER && r.mainBase === REHACER;
    if (r.baseMode && !rehaciendo) { conteo[r.baseMode] = (conteo[r.baseMode] ?? 0) + 1; continue; }

    const regla = REGLAS[r.mainBase];
    if (!regla) continue;

    let modo = null;
    for (const [re, m] of regla.reglas) {
      if (re.test(r.name)) { modo = m; break; }
    }
    modo ??= regla.porDefecto ?? null;

    if (!modo) {
      sinDecidir.push(`${r.mainBase.padEnd(9)} ${r.name}`);
      // Al rehacer, "ninguna regla casa" tiene que BORRAR la marca vieja: si
      // no, la que estaba mal sobrevive a la correccion sin que nadie lo vea.
      if (rehaciendo && r.baseMode) { delete r.baseMode; tocado = true; marcadas++; }
      continue;
    }

    // Insertado justo detrás de mainBase, que es donde se lee.
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "baseMode") continue; // se reescribe junto a mainBase
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
