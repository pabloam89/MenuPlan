/**
 * Las formas de decir cada proteína y cada base, sacadas del árbol de
 * alimentos (#939, fase 3).
 *
 * La receta apunta a sus ingredientes, el ingrediente a su alimento y el
 * alimento a su taxonomía (clase → subclase → especie). `ejeProteina` y
 * `ejeHidrato` (composicion.js) ya traducen esa taxonomía al vocabulario de
 * `mainProtein` y de la base. Con eso, cada alimento presta sus nombres: el
 * suyo, su especie y los de los ingredientes que lo usan, con sus alias. Así
 * «fusilli» es pasta y «merluza» pescado blanco sin escribirlo a mano.
 *
 * Lo genera scripts/build-sinonimos.mjs en derived/sinonimosTaxonomia.json;
 * el test vuelve a calcularlo y falla si el fichero se ha quedado viejo.
 */

import { ejeProteina, ejeHidrato } from "./ejesTaxonomia.js";
import { MAIN_BASES, MAIN_PROTEINS } from "../../data/recipeSchema.js";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

/** El plural llano: «lenteja» → «lentejas», «limón» → «limones». */
const plural = (f) => (/[aeiou]$/.test(f) ? `${f}s` : /[sx]$/.test(f) ? f : `${f}es`);

/**
 * Formas que NO se toman del árbol, con su porqué: son palabras corrientes
 * que dirían otra cosa («algo bonito»), o demasiado genéricas para decidir
 * una proteína o una base. Vocabulario cerrado: cada una con su motivo.
 */
export const NO_SON_FORMAS = {
  bonito: "adjetivo: «algo bonito para los invitados»",
  gallo: "también el animal y la expresión; el pescado se pide como «gallo pescado» rara vez",
  rape: "corta y rara; se queda en la lista a mano si hace falta",
  carne: "genérica: es un grupo, no una proteína",
  pescado: "genérica: es un grupo, no una proteína",
  cereal: "genérica",
  pan: "el pan no es una base que se pida así",
  caldo: "un caldo de pollo no es pollo",
  foie: "el foie es de pato u oca; el árbol lo cuelga de embutido",
  "foie gras": "el foie es de pato u oca; el árbol lo cuelga de embutido",
  "carne picada": "se compra mezcla de ternera y cerdo: no decide una proteína",
  gochujang: "es una pasta picante de soja, no una legumbre que se pida",
  "carne de cocido": "mezcla: no decide una proteína",
  soja: "«salsa de soja» no es pedir legumbre",
  "soja fresca": "«salsa de soja» no es pedir legumbre",
  miso: "«sopa de miso» no es pedir legumbre",
  "miso blanco": "«sopa de miso» no es pedir legumbre",
  manteca: "una grasa, no una proteína que se pida",
  "guindilla picante": "es a la vez ají y guindilla: con «guindilla» basta",
};

// Una forma para reconocer lo que dice la gente: corta (hasta tres palabras),
// sin cifras y en castellano. Los nombres de las fuentes de nutrición vienen
// en inglés («chick pea boiled»), y las descripciones largas llevan marcas.
const MAX_PALABRAS = 3;
const EN_INGLES = /\b(raw|cooked|boiled|meat|skin|and|dried|fresh|dry|with|without|beef|chicken|wild|white|mature|seeds|bean|beans|pea|rice|lamb|cheek|leg|wing|breast|steak|stuffed|prepacked|enriched|unsalted|semolina|durum|wheat|albacore|mackerel|anglerfish|seabream|meagre|cod|quail|boar|cuttlefish|clam|crab|crustaceans|lentil|haricot|chick|egg|calf|foot|oxtail|shank|sirloin|round|rib|ribs|plate|variety|liver|lean|separable|trimmed|grades|broiled|choice|eye|cured|slim|sausage|chipolata|style|tuna)\b/;
// Una preparación no es el alimento: «salsa de soja» no pide legumbre ni
// «caldo de pollo» pide pollo.
const PREPARACION = /^(salsa|caldo|fondo|sopa|crema|pure|aceite|harina|polvo|zumo|pasta de|tinta|cabezas|cascaras|hueso)\b/;
// Lo que dice cómo se compra, no qué es: se quita del final.
const DE_COMPRA = new Set("limpio limpia limpios limpias fresco fresca frescos frescas cocido cocida cocidos cocidas pelado pelada pelados peladas congelado congelada congelados congeladas entero entera enteros enteras crudo cruda crudos crudas seco seca secos secas desalado desalada troceado troceada troceados deshuesado deshuesados desmigado en lomos en trozos en rodajas de bote".split(" "));
const vale = (f) => f.split(" ").length <= MAX_PALABRAS && !/\d/.test(f) && !EN_INGLES.test(f);

/** La base de un alimento, en el vocabulario de MAIN_BASES. */
function baseDe(t) {
  if (!t) return null;
  if (MAIN_BASES.includes(t.especie)) return t.especie;   // boniato
  if (t.clase === "legumbre") return MAIN_BASES.includes("legumbre") ? "legumbre" : null;
  const h = ejeHidrato(t);
  return MAIN_BASES.includes(h) ? h : null;
}

/**
 * @param {{ alimentos: object[], ingredientes: object[], alimentoPorIngrediente: Record<string,string> }} fuentes
 * @returns {{ eje: "proteinaPrincipal"|"basePrincipal"|"alimento", valor: string, formas: string[] }[]}
 */
/**
 * Las clases del árbol cuyo alimento concreto se puede pedir o quitar
 * («con queso», «sin cebolla»). La proteína y la base van por su eje; el resto
 * (especias, compuestos, sal) no se pide así.
 */
export const CLASES_DE_ALIMENTO = ["hortaliza", "lacteo", "hongo", "fruta", "fruto_seco"];
// Subclases que se piden como un solo alimento: «sin queso» quita también la mozzarella.
const SUBCLASE_COMO_ALIMENTO = { queso: "queso", seta: "seta" };

export function formasDeTaxonomia({ alimentos, ingredientes, alimentoPorIngrediente }) {
  const ingPorAlimento = new Map();
  for (const ing of ingredientes) {
    const a = alimentoPorIngrediente[ing.id] ?? ing.id;
    ingPorAlimento.set(a, [...(ingPorAlimento.get(a) ?? []), ing]);
  }
  const porEntrada = new Map();
  const poner = (eje, valor, nombres) => {
    const k = `${eje}|${valor}`;
    const set = porEntrada.get(k) ?? new Set();
    for (const n of nombres) {
      const f = norm(n);
      if (!f || f.length < 3 || NO_SON_FORMAS[f] || !vale(f) || PREPARACION.test(f)) continue;
      // «chipirones limpios» también es «chipirones»: fuera lo que dice cómo se compra.
      const nucleo = f.split(" ").filter((p, i, ps) => !(i > 0 && ps.slice(i).every((q) => DE_COMPRA.has(q)))).join(" ");
      for (const x of new Set([f, nucleo])) {
        if (x.length < 3 || NO_SON_FORMAS[x]) continue;
        set.add(x);
        // Solo la última palabra va en plural: «pechuga de pollo» → «pechugas de pollo» no.
        if (!x.includes(" ")) set.add(plural(x));
      }
    }
    porEntrada.set(k, set);
  };
  for (const a of alimentos) {
    const t = a.taxonomia;
    const nombres = [a.nombre, t?.especie, ...(ingPorAlimento.get(a.id) ?? []).flatMap((i) => [i.name, ...(i.aliases ?? [])])];
    const p = ejeProteina(t);
    if (MAIN_PROTEINS.includes(p)) poner("proteinaPrincipal", p, nombres);
    const b = baseDe(t);
    if (b) poner("basePrincipal", b, nombres);
    // Sin especie no hay alimento que pedir («aceite», «hojas verdes»).
    if (CLASES_DE_ALIMENTO.includes(t?.clase) && t.especie) poner("alimento", SUBCLASE_COMO_ALIMENTO[t.subclase] ?? t.especie, nombres);
  }
  return [...porEntrada.entries()]
    .map(([k, set]) => { const [eje, valor] = k.split("|"); return { eje, valor, formas: [...set].sort() }; })
    .sort((a, b) => `${a.eje}|${a.valor}`.localeCompare(`${b.eje}|${b.valor}`));
}
