/**
 * La taxonomía de un alimento: reino / clase / subclase / especie / variedad.
 *
 * QUÉ NO ES. No es el formato. El formato ya existe y se llama `dimensiones`
 * —corte, estado, medio, procesado, presentación, origen— y describe CÓMO
 * llega el alimento. La taxonomía describe QUÉ ES.
 *
 * PARA QUÉ SIRVE, que es la pregunta que la justifica. El catálogo tiene dos
 * ejes de identidad y NO ENCAJAN UNO DENTRO DEL OTRO:
 *
 *   familia (ingrediente)   `carne_ave` colapsa pollo, pavo, pato y codorniz
 *   MAIN_PROTEINS (receta)  distingue `pollo` de `pavo`
 *
 *   familia                 separa `pescado_azul` de `pescado_blanco`
 *   MAIN_PROTEINS           también, pero mete atún, salmón y sardina juntos
 *
 * O sea que la receta es más fina en aves y más gruesa en pescados que el
 * ingrediente. Sin un peldaño común, los dos ejes no se pueden comparar, y hoy
 * NADIE puede detectar una receta que declare `mainProtein: pollo` y lleve
 * solo pavo. `especie` es ese peldaño.
 *
 * DE DÓNDE SALE, SIN DATOS NUEVOS. `reino` y `clase` se deducen de la familia
 * con una tabla, y la `especie` la da el propio léxico de familia.mjs: la
 * palabra que hizo casar la familia ES el nombre de la especie. «Pechuga de
 * pavo» casa `carne_ave` por la palabra «pavo», y esa palabra es la especie.
 * No hace falta un segundo diccionario, y por construcción no puede
 * desincronizarse del primero.
 */

/** familia → [reino, clase]. Determinista, sin excepciones. */
export const REINO_CLASE = {
  carne_ave: ["animal", "ave"],
  carne_roja: ["animal", "mamifero"],
  carne_cerdo: ["animal", "mamifero"],
  carne_caza: ["animal", "mamifero"],
  casqueria: ["animal", "viscera"],
  embutido: ["animal", "mamifero"],
  pescado_blanco: ["animal", "pez"],
  pescado_azul: ["animal", "pez"],
  marisco: ["animal", "marisco"],
  cefalopodo: ["animal", "cefalopodo"],
  huevo: ["animal", "ave"],
  leche: ["animal", "lacteo"],
  queso: ["animal", "lacteo"],
  lacteo_fermentado: ["animal", "lacteo"],
  nata_mantequilla: ["animal", "lacteo"],
  verdura_hoja: ["vegetal", "hortaliza"],
  verdura_fruto: ["vegetal", "hortaliza"],
  verdura_raiz: ["vegetal", "hortaliza"],
  verdura_bulbo: ["vegetal", "hortaliza"],
  verdura_col: ["vegetal", "hortaliza"],
  tuberculo: ["vegetal", "hortaliza"],
  legumbre: ["vegetal", "legumbre"],
  fruta: ["vegetal", "fruta"],
  fruto_seco: ["vegetal", "fruto_seco"],
  especia: ["vegetal", "aromatica"],
  cereal: ["vegetal", "cereal"],
  pasta: ["vegetal", "cereal"],
  arroz: ["vegetal", "cereal"],
  pan: ["vegetal", "cereal"],
  endulzante: ["vegetal", "azucar"],
  alga: ["alga", "alga"],
  seta: ["fungi", "hongo"],
  mineral: ["mineral", "mineral"],
  compuesto: ["compuesto", "compuesto"],
};

/**
 * Las claves del léxico que NO nombran una especie sino una forma o un corte.
 * «Pechuga» dice de dónde sale el trozo, no de qué animal: si se tomara como
 * especie, «Pechuga de pavo» y «Pechuga de pollo» quedarían como la misma.
 */
const NO_SON_ESPECIE = new Set([
  "pechuga", "contramuslo", "alita", "muslo", "solomillo", "lomo", "chuleta",
  "costilla", "jarrete", "carrillada", "carrillera", "morcillo", "redondo",
  "entrecot", "chuleton", "escalopin", "entraña", "mechar", "magro", "presa",
  "pluma", "secreto", "iberico", "panceta", "tocino", "fiambre", "hoja",
  "brote", "semilla", "pipa",
  "copo", "placa", "lamina", "masa", "salsa", "caldo", "fondo", "fumet",
]);

/**
 * Sinónimos de especie: distintos nombres del mismo animal según la edad o el
 * sexo, que en la cocina son el mismo alimento. Sin esto, «Rabo de toro» y
 * «Filetes de ternera» salían como especies distintas siendo la misma res.
 */
const SINONIMO = { toro: "ternera", buey: "ternera", vaca: "ternera", cabrito: "cordero" };

/**
 * Cuando el nombre entero es un corte y no nombra al animal —«Presa ibérica»,
 * «Secreto», «Carrillada»—, la especie la pone la familia. Solo para las
 * familias donde no hay duda: `carne_cerdo` es cerdo y punto. `carne_ave` no
 * está porque puede ser pollo, pavo, pato o codorniz, y ahí inventar sería
 * peor que dejarlo vacío.
 */
const ESPECIE_POR_FAMILIA = {
  carne_cerdo: "cerdo",
  huevo: "huevo",
  leche: "leche",
};

/**
 * Cuando la palabra que casó no sirve como especie, se busca otra del nombre
 * que sí: «Pechuga de pavo» → pavo. Se prueban las claves de la MISMA familia,
 * que es donde están las especies de ese grupo, y si tampoco hay, se recurre
 * a la especie implícita de la familia.
 */
function especieDe(nombreStems, claveQueCaso, clavesDeLaFamilia, familia) {
  const limpia = (c) => (c ? (SINONIMO[c] ?? c) : null);
  if (claveQueCaso && !NO_SON_ESPECIE.has(claveQueCaso)) return limpia(claveQueCaso);
  const otra = clavesDeLaFamilia.find((c) => !NO_SON_ESPECIE.has(c) && nombreStems.has(c));
  if (otra) return limpia(otra);
  // El nombre no menciona al animal: si la familia lo determina, vale.
  return ESPECIE_POR_FAMILIA[familia] ?? null;
}

/**
 * @param {{familia: string|null, clave?: string}} derivado  salida de deriveFamilia
 * @param {Set<string>} nombreStems  raíces del nombre del ingrediente
 * @param {Array<[string, string[]]>} lexico  LEXICO de familia.mjs
 * @returns {{reino:string, clase:string, subclase:string, especie:string|null, variedad:string|null} | null}
 */
export function deriveTaxonomia(derivado, nombreStems, lexico) {
  const familia = derivado?.familia;
  if (!familia) return null;
  const rc = REINO_CLASE[familia];
  if (!rc) return null;
  const clavesDeLaFamilia = lexico.find(([f]) => f === familia)?.[1] ?? [];
  return {
    reino: rc[0],
    clase: rc[1],
    subclase: familia,
    especie: especieDe(nombreStems, derivado.clave, clavesDeLaFamilia, familia),
    // La variedad (ibérico, arbóreo, virgen extra) se deja para cuando alguien
    // la necesite: hoy no hay consumidor y declararla vacía ya la hace visible.
    variedad: null,
  };
}
