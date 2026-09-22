/**
 * mark-bases-aparte.mjs
 *
 * Declara en `basesAparte` las preparaciones NO feculentas que un plato puede
 * aprovechar ya hechas: caldo, salsa de tomate, verdura asada, pesto y bechamel.
 *
 * ── Por qué estas cinco ───────────────────────────────────────────────────
 * Salieron de medir el catálogo estrella: caldo lo llevan 142 platos y salsa
 * de tomate 103, más que ninguna base de fécula. Y son del tipo que de verdad
 * ahorra trabajo de MANOS, como el sofrito, no del que solo ahorra reloj: una
 * salsa de tomate son 40 minutos de los que 20 son tuyos.
 *
 * La verdura asada y el pesto tienen mucha menos cobertura (7 y 6 platos), y
 * entran igual porque son las dos que pedimos ampliar con platos nuevos: la
 * base tiene que existir antes que los platos que tiran de ella.
 *
 * ── El criterio, y por qué es más laxo que el de `baseMode` ────────────────
 * El mismo razonamiento que en mark-sofrito.mjs: el riesgo va al revés.
 * Precocer el arroz de un risotto arruina la cena; tener un bote de salsa de
 * tomate y no usarlo no estropea nada, como mucho te sobra. Así que aquí basta
 * con una señal razonable.
 *
 * Se exigen DOS cosas, el ingrediente Y el paso, porque cada una por separado
 * falla: hay tomate triturado que solo moja una marinada, y hay pasos que
 * dicen "al horno" refiriéndose a la carne y no a la verdura.
 *
 * NO marca las recetas `type: "base"` (una base no se aprovecha a sí misma) ni
 * los platos de bebés, que llevan su propia lógica de caldo sin sal.
 *
 * Idempotente: no pisa lo que ya esté escrito, solo añade lo que falte.
 *
 *   node scripts/mark-bases-aparte.mjs [--dry] [--solo=caldo]
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const DRY = process.argv.includes("--dry");
const SOLO = process.argv.find((a) => a.startsWith("--solo="))?.slice(7) ?? null;

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Cada base: qué ingrediente la delata y qué paso confirma que el plato la
 * COCINA (y no que la lleva de adorno). `ids` mira `ingredientId`, que es el
 * enlace canónico; el texto del paso es la segunda condición.
 */
const CRITERIOS = {
  // El caldo es el caso fácil: nadie hace caldo dentro del plato. Si la receta
  // lo lleva, se hizo antes, en casa o en un brik. Basta el ingrediente.
  caldo: {
    ids: /^caldo-de-(pollo|verduras|carne|pescado|marisco)$/,
    paso: /\bcaldo\b|\bfondo\b/,
  },
  // Tomate YA EN CONSERVA. El tomate fresco no vale: rallarlo para un refrito
  // de dos minutos no es una salsa que merezca un bote.
  //
  // El verbo tiene que estar PEGADO al tomate, igual que mark-sofrito ata
  // pochar a la cebolla. Sin eso entraban los guisos largos: un "Estofado de
  // ternera" colaba porque sofríe la cebolla, pero ahí el tomate se cocina
  // DENTRO con la carne durante hora y media, y tener un bote hecho no te
  // quita ningún paso — te cambia un ingrediente por otro.
  salsa_tomate: {
    ids: /^tomate-(frito|triturado|concentrado)$/,
    paso: /tomate[^.]{0,70}(salsa|reduc|espes|sofre|chup-?chup|a fuego (lento|suave|medio))|(salsa|reduc|espes)[^.]{0,70}tomate/,
    // Y no si el plato ya declara sofrito. Nuestra receta de sofrito LLEVA
    // tomate (400 g de los 1.400 que rinde), asi que en un guiso el tomate ya
    // esta contado ahi. Declarar las dos seria pedir dos tandas para el mismo
    // trabajo, y ademas el etiquetado tendria que repartir un mismo paso entre
    // dos bases, que es justo lo que el criterio prohibe.
    noCon: ["sofrito"],
  },
  // Dos verduras de bandeja o más, y un paso que las meta al horno. Con una
  // sola no es una bandeja, es un acompañamiento.
  //
  // Sin `\b` final detrás del verbo: "hornea\b" NO casa con "hornear", que es
  // como lo escriben casi todas las recetas. Con el límite puesto, la
  // "Ensalada de cuscús con verduras asadas" —que asa su propia bandeja, o sea
  // el caso perfecto— se quedaba fuera.
  verdura_asada: {
    ids: /^(calabacin|berenjena|pimiento-rojo|pimiento-verde|cebolla-morada|calabaza|zanahoria|brocoli|coliflor)$/,
    minIngredientes: 2,
    paso: /(asar|asad|hornea|al horno)[^.]{0,80}(verdura|calabaci|berenjena|pimiento|cebolla|calabaza|zanahoria|brocoli|coliflor)|(verdura|calabaci|berenjena|pimiento|calabaza)[^.]{0,80}(asar|asad|hornea|al horno)/,
  },
  // La bechamel, igual que el pesto: o la compras (ingrediente "Bechamel") o la
  // haces, y hacerla es siempre el mismo trio — mantequilla, harina y leche. La
  // segunda señal es la que importa, porque esos platos sí tienen pasos que
  // llevarse: fundir, tostar la harina y ligar son seis o siete minutos de
  // varilla en los que no puedes hacer otra cosa.
  bechamel: {
    senales: [
      { ids: /^bechamel$/ },
      { ids: /^(mantequilla|harina|leche)$/, minIngredientes: 3 },
    ],
    paso: /bechamel|roux/,
  },
  // El pesto o lo compras o lo haces, y las dos formas valen: si lo compras,
  // el ingrediente es "Pesto"; si lo haces, son albahaca y piñones juntos y en
  // la batidora. La segunda señal es la que importa, porque esos platos SÍ
  // tienen pasos que llevarse —triturar el pesto— y con solo mirar el
  // ingrediente "Pesto" se perdían justo ellos (Trofie al pesto genovés,
  // Pasta al pesto).
  pesto: {
    senales: [
      { ids: /^pesto$/ },
      { ids: /^(albahaca|pinones)$/, minIngredientes: 2 },
    ],
    paso: /\bpesto\b/,
    // Pero no el pesto ROJO, que es otra cosa: lleva tomate seco de cuerpo en
    // vez de albahaca. Un bote del verde no le sirve, le cambia el plato.
    noPaso: /pesto rojo|pesto de tomate/,
  },
};

const claves = Object.keys(CRITERIOS).filter((c) => !SOLO || c === SOLO);
const cuenta = Object.fromEntries(claves.map((c) => [c, 0]));
const ejemplos = Object.fromEntries(claves.map((c) => [c, []]));
const tocadas = new Set();

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const path = join(RECIPES_DIR, file);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  let tocado = false;

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    // Ni las bases ni las SALSAS. Una salsa ya es, por definición, algo que se
    // hace aparte: nunca ocupa un hueco del menú, así que contarla como
    // consumidora de una tanda infla las raciones de una olla que nadie va a
    // comerse. Y el caso que lo dejó claro fue circular: la receta "Bechamel"
    // acabó declarando que aprovecha... bechamel ya hecha.
    if (r.type === "base" || r.type === "salsa" || r.category === "bebes") continue;

    const pasos = norm([...(r.steps ?? []), ...(r.stepsRich ?? []).map((s) => s.text)].join(" · "));
    const nuevas = [];

    for (const clave of claves) {
      if ((r.basesAparte ?? []).includes(clave)) continue;
      const criterio = CRITERIOS[clave];
      const { paso, noCon } = criterio;
      // Dos bases que se pisan no se declaran juntas: ver `noCon`.
      if (noCon && (r.basesAparte ?? []).some((c) => noCon.includes(c))) continue;
      // Una base puede delatarse por más de un juego de ingredientes: comprada
      // o hecha en casa. Basta con que se cumpla UNA de las señales.
      const senales = criterio.senales
        ?? [{ ids: criterio.ids, minIngredientes: criterio.minIngredientes }];
      const hay = senales.some(({ ids, minIngredientes = 1 }) =>
        (r.ingredients ?? []).filter((ing) => ids.test(String(ing.ingredientId ?? ""))).length
          >= minIngredientes);
      if (!hay) continue;
      if (!paso.test(pasos)) continue;
      if (criterio.noPaso?.test(`${norm(r.name)} · ${pasos}`)) continue;
      nuevas.push(clave);
    }
    if (nuevas.length === 0) continue;

    // Se escribe justo detrás de baseMode/mainBase para que los tres ejes de
    // base se lean juntos en el JSON, igual que hace mark-sofrito.
    //
    // Ojo al orden, que aquí hubo un bug que costó ver: si la receta ya traía
    // `basesAparte` y venía DESPUÉS de `baseMode`, se escribía la lista buena
    // al llegar a baseMode y el propio bucle la pisaba con la vieja al llegar
    // a basesAparte. El script no era idempotente y perdía 42 marcas en
    // silencio. Por eso la clave se salta en el copiado y se pone una vez.
    const finales = [...(r.basesAparte ?? []), ...nuevas];
    const out = {};
    let puesto = false;
    for (const [k, v] of Object.entries(r)) {
      if (k === "basesAparte") continue;
      out[k] = v;
      if (!puesto && (k === "baseMode" || (k === "mainBase" && !("baseMode" in r)))) {
        out.basesAparte = finales;
        puesto = true;
      }
    }
    if (!puesto) out.basesAparte = finales;

    recipes[i] = out;
    tocado = true;
    tocadas.add(r.id);
    for (const c of nuevas) {
      cuenta[c] += 1;
      if (ejemplos[c].length < 6) ejemplos[c].push(r.name);
    }
  }

  if (tocado && !DRY) writeFileSync(path, `${JSON.stringify(recipes, null, 2)}\n`, "utf8");
}

for (const c of claves) {
  console.log(`${String(cuenta[c]).padStart(4)} platos → ${c}`);
  for (const n of ejemplos[c]) console.log(`       ${n}`);
}
console.log(`\n${tocadas.size} recetas tocadas${DRY ? " (dry run, no se ha escrito nada)" : ""}.`);
if (!DRY && tocadas.size > 0) {
  console.log("\nAhora hay que etiquetar QUÉ paso cocina cada base nueva:");
  console.log("  node scripts/enrich-recipe-steps.mjs --bases --force --ids-file=<lista>");
}
