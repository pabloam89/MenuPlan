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

/**
 * La clase, cuando la familia NO puede darla.
 *
 * `REINO_CLASE` decía «determinista, sin excepciones» y casi lo es: una
 * familia fija la clase. Casi, porque `carne_caza` mezcla dos —el jabalí y el
 * conejo son mamíferos y la perdiz es un ave— y la tabla por familia la
 * clasificaba a las tres de mamífero.
 *
 * No es cosmético: la clase es de lo que cuelga el eje «apto vigilia», que se
 * deriva de «no hay carne de mamífero ni ave». Una perdiz mal clasificada no
 * rompe nada hoy porque ese eje aún no existe; el día que exista, la habría
 * dejado pasar como pescado.
 *
 * La lista es CORTA a propósito. Una excepción por especie es barata; una
 * segunda tabla completa que se desincronice de la primera no lo es.
 */
const CLASE_POR_ESPECIE = {
  perdiz: "ave",
  codorniz: "ave",
};

/** familia → [reino, clase]. Determinista salvo lo de arriba. */
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
  // La casquería entera es corte: un callo y una manita dicen QUÉ pieza es,
  // nunca de quién. Con estas como especie, «Callos de ternera» y «Manitas de
  // cerdo» eran dos alimentos sin animal, y el eje de la proteína no podía
  // derivar ninguno de los dos. El animal lo pone HEREDA_ESPECIE_DE.
  "callo", "higado", "molleja", "riñon", "seso", "morro", "manita", "oreja",
  "unto", "tuetano",
  // «Trigo» es el grano, no la forma en que se come, y por eso es al cereal
  // lo que «pechuga» al ave: la harina, la sémola, el cuscús, el bulgur, el
  // pan y la pasta son todos trigo, y tomarlo como especie los hace uno solo.
  // En concreto dejaba «Sémola de trigo» como `trigo` —el léxico prueba
  // «trigo» antes que «semola»— y así la sémola no era cuscús para la regla
  // de variedad, aunque el cuscús sea sémola cocida al vapor.
  "trigo",
]);

/**
 * Sinónimos de especie: distintos nombres del mismo alimento. En los animales
 * son la edad o el sexo —sin esto, «Rabo de toro» y «Filetes de ternera»
 * salían como especies distintas siendo la misma res—, y en el trigo es la
 * forma: el cuscús ES sémola de trigo duro cocida al vapor, así que una crema
 * con sémola y otra con cuscús repiten el mismo hidrato y la regla de
 * variedad tiene que verlo.
 */
const SINONIMO = {
  toro: "ternera", buey: "ternera", vaca: "ternera", cabrito: "cordero",
  semola: "cuscu",
};

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
 * Familias cuyas claves son CORTES y no animales, y que por tanto tienen que
 * ir a buscar la especie a las familias de carne.
 *
 * La casquería es toda ella cortes —callo, manita, oreja, hígado, unto— así
 * que su especie salía siempre vacía aunque el nombre dijera el animal a
 * gritos: «Callos de ternera limpios», «Manitas de cerdo». Sin especie, unos
 * callos y unas manitas eran el mismo alimento para cualquier regla que mire
 * el árbol, y ninguno de los dos era ternera ni cerdo.
 */
const HEREDA_ESPECIE_DE = {
  casqueria: ["carne_roja", "carne_cerdo", "carne_ave"],
};

/**
 * Cuando la palabra que casó no sirve como especie, se busca otra del nombre
 * que sí: «Pechuga de pavo» → pavo. Se prueban las claves de la MISMA familia,
 * que es donde están las especies de ese grupo, y si tampoco hay, se recurre
 * a la especie implícita de la familia.
 */
function especieDe(nombreStems, claveQueCaso, clavesDeLaFamilia, familia, lexico) {
  const limpia = (c) => (c ? (SINONIMO[c] ?? c) : null);
  if (claveQueCaso && !NO_SON_ESPECIE.has(claveQueCaso)) return limpia(claveQueCaso);
  const otra = clavesDeLaFamilia.find((c) => !NO_SON_ESPECIE.has(c) && nombreStems.has(c));
  if (otra) return limpia(otra);
  // Una familia de cortes va a buscar el animal a las familias de carne.
  for (const prestada of HEREDA_ESPECIE_DE[familia] ?? []) {
    const claves = lexico.find(([f]) => f === prestada)?.[1] ?? [];
    const hit = claves.find((c) => !NO_SON_ESPECIE.has(c) && nombreStems.has(c));
    if (hit) return limpia(hit);
  }
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
  const especie = especieDe(nombreStems, derivado.clave, clavesDeLaFamilia, familia, lexico);
  return {
    reino: rc[0],
    clase: CLASE_POR_ESPECIE[especie] ?? rc[1],
    subclase: familia,
    especie: especieDe(nombreStems, derivado.clave, clavesDeLaFamilia, familia, lexico),
    // La variedad (ibérico, arbóreo, virgen extra) se deja para cuando alguien
    // la necesite: hoy no hay consumidor y declararla vacía ya la hace visible.
    variedad: null,
  };
}
