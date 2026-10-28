/**
 * EL DICCIONARIO: cómo se dice cada cosa que se puede pedir (#939, fase 3).
 *
 * Una entrada es un rasgo que se pide (un grupo como «pescado», una técnica,
 * una textura, una proteína o una base) con un valor, y todas las formas de
 * decirlo. Las formas vienen de tres sitios y cada una lleva el suyo:
 *
 *   a_mano     src/data/sinonimos.json, lo que no sale de ningún árbol
 *              («de cuchara», «para el táper», «que pique»)
 *   taxonomia  src/data/derived/sinonimosTaxonomia.json: los nombres de los
 *              alimentos y sus ingredientes, colgados de la proteína o la base
 *              que les da el árbol («fusilli» → pasta, «merluza» → pescado blanco)
 *   aprendido  src/data/sinonimosAprendidos.json: las que confirma el bucle
 *              de aprendizaje (npm run diccionario -- aprender)
 *
 * Y cada rasgo apunta al eje del registro (src/data/axisRegistry.js) que lo
 * responde: es el cableado entre lo que se dice y lo que la receta guarda, y
 * su test falla si un rasgo apunta a un eje que no existe.
 *
 * Puro y sin red: lo usan el buscador (rasgosBusqueda.js) y la vía rápida del
 * enrutador (api/_bot/router.js) en cada mensaje.
 */

import sinonimos from "../data/sinonimos.json" with { type: "json" };
import deTaxonomia from "../data/derived/sinonimosTaxonomia.json" with { type: "json" };
import aprendidos from "../data/sinonimosAprendidos.json" with { type: "json" };

export const ORIGENES_FORMA = ["a_mano", "taxonomia", "aprendido"];

/**
 * Qué eje del registro responde a cada rasgo. `grupo` abarca varios ejes a la
 * vez (proteína y base): sus valores los dice GRUPO_VALORES.
 */
export const EJE_DEL_RASGO = {
  grupo: null,
  proteinaPrincipal: "proteinaPrincipal",
  basePrincipal: "basePrincipal",
  tecnica: "tecnica",
  connotacion: "connotacion",
  textura: "textura",
  picante: "picante",
  sabor: "saborDominante",
  calorias: "calorias",
  coste: "coste",
  dificultad: "dificultad",
  taper: "transportabilidad",
  ninos: "aptoNinos",
  congelar: "congelabilidad",
  hierro: "sabor",
  // Un ingrediente concreto: se lee en la composición del plato (eje 1).
  alimento: "composicion",
};

/** Cada grupo que se pide y los valores de la receta que abarca, por eje. */
export const GRUPO_VALORES = {
  pescado_azul: { proteinaPrincipal: ["pescado_azul"] },
  marisco: { proteinaPrincipal: ["marisco"] },
  pescado: { proteinaPrincipal: ["pescado_blanco", "pescado_azul", "marisco"] },
  carne_roja: { proteinaPrincipal: ["ternera", "cordero", "caza"] },
  pollo: { proteinaPrincipal: ["pollo"] },
  carne: { proteinaPrincipal: ["pollo", "pavo", "pato", "cerdo", "ternera", "cordero", "caza"] },
  huevo: { proteinaPrincipal: ["huevo"] },
  legumbre: { proteinaPrincipal: ["legumbre"], basePrincipal: ["legumbre"] },
  pasta: { basePrincipal: ["pasta"] },
  arroz: { basePrincipal: ["arroz"] },
  // Los grupos secundarios (eje 48, `mainIngredients`): solo sus formas a mano.
  // Las del árbol no, a propósito: «sin verdura» no puede quitar todo lo que
  // lleva ajo o cebolla. Lo concreto va por el rasgo `alimento`.
  verdura: { gruposSecundarios: ["verdura"] },
  lacteo: { gruposSecundarios: ["lacteo"] },
  seta: { gruposSecundarios: ["seta"] },
  fruta: { gruposSecundarios: ["fruta"] },
  frutos_secos: { gruposSecundarios: ["frutos_secos"] },
};

/**
 * Al pedir, el grupo más concreto gana: «pescado azul» no es además «pescado».
 * Y es la única forma en que dos grupos comparten formas: «salmón» es de los
 * dos, «pollo» de pollo y de carne (lo vigila diccionario.test.js).
 */
export const MAS_CONCRETO = { pescado_azul: ["pescado"], carne_roja: ["carne"], pollo: ["carne"], marisco: ["pescado"] };

const clave = (rasgo, valor) => `${rasgo}|${valor}`;

/** rasgo|valor → { rasgo, valor, formas: Map<texto, origen> }, en el orden de los ficheros. */
const ENTRADAS = new Map();
function poner(rasgo, valor, formas, origen) {
  const k = clave(rasgo, valor);
  const e = ENTRADAS.get(k) ?? { rasgo, valor, formas: new Map() };
  for (const f of formas) if (!e.formas.has(f)) e.formas.set(f, origen);
  ENTRADAS.set(k, e);
}
for (const { rasgo, valor, formas } of sinonimos.rasgos) poner(rasgo, valor, formas, "a_mano");
for (const { eje, valor, formas } of deTaxonomia) poner(eje, valor, formas, "taxonomia");
// Un grupo también se dice con las formas de los valores que abarca.
for (const [grupo, porEje] of Object.entries(GRUPO_VALORES)) {
  for (const [eje, valores] of Object.entries(porEje)) {
    for (const v of valores) poner("grupo", grupo, [...(ENTRADAS.get(clave(eje, v))?.formas.keys() ?? [])], "taxonomia");
  }
}
for (const { rasgo, valor, forma } of aprendidos.formas) poner(rasgo, valor, [forma], "aprendido");

export const entradas = () => [...ENTRADAS.values()];

/** Las formas de un rasgo y valor, con su origen. */
export const formasDe = (rasgo, valor) =>
  [...(ENTRADAS.get(clave(rasgo, valor))?.formas ?? [])].map(([texto, origen]) => ({ texto, origen }));

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
const PATRONES = new Map();

/**
 * La expresión que reconoce un rasgo y valor en un texto ya sin tildes y en
 * minúscula. Con frontera de palabra: «pollo» no es «repollo». Lo más largo
 * primero, para que «pescado azul» gane a «pescado».
 */
export function patron(rasgo, valor) {
  const k = clave(rasgo, valor);
  if (!PATRONES.has(k)) {
    const formas = [...(ENTRADAS.get(k)?.formas.keys() ?? [])].sort((a, b) => b.length - a.length);
    PATRONES.set(k, formas.length ? new RegExp(`\\b(${formas.map(escapar).join("|")})\\b`) : /(?!)/);
  }
  return PATRONES.get(k);
}

/** Los valores de un rasgo, en el orden de los ficheros. */
export const valoresDe = (rasgo) => entradas().filter((e) => e.rasgo === rasgo).map((e) => e.valor);

export const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Todo lo que el diccionario reconoce en una frase.
 * @returns {{ rasgo: string, valor: string|boolean, forma: string, origen: string }[]}
 */
export function resolver(frase) {
  const t = ` ${sinTildes(frase).replace(/[¿?¡!.,;:()"«»]/g, " ").replace(/\s+/g, " ")} `;
  const out = [];
  for (const e of ENTRADAS.values()) {
    const m = t.match(patron(e.rasgo, e.valor));
    if (m) out.push({ rasgo: e.rasgo, valor: e.valor, forma: m[1], origen: e.formas.get(m[1]) ?? "a_mano" });
  }
  return out;
}
