/**
 * NOVA: CUÁNTO SE HA TOCADO UN ALIMENTO ANTES DE LLEGAR A LA COCINA.
 *
 * La clasificación de Monteiro (Universidad de São Paulo) agrupa los alimentos
 * por GRADO Y PROPÓSITO del procesado industrial, no por sus nutrientes. Es lo
 * que distingue un tomate de un tomate frito de bote sin mirarles las
 * calorías, y es el eje 5 del registro — que llevaba en «silencioso» con
 * cobertura 0 y una nota que decía que saldría gratis de `dimensiones.procesado`.
 *
 * No salía gratis. `procesado` dice CÓMO se cocinó (hervido, frito, crudo) y
 * NOVA pregunta otra cosa: quién lo hizo y para qué. Una patata hervida en casa
 * y un puré de patata deshidratado tienen el mismo `procesado` y no son el
 * mismo grupo. Lo que sí hacía falta era el resto de la ficha: `rol`,
 * `familia` y `dimensiones.estado`.
 *
 * ── Los cuatro grupos ──────────────────────────────────────────────────────
 *
 *   1  Sin procesar o mínimamente procesado. La parte comestible de una planta
 *      o un animal, y lo que se le hace para conservarla o hacerla comestible
 *      sin añadirle nada: lavar, pelar, congelar, secar, moler, pasteurizar.
 *      Una lenteja seca, una merluza, un huevo, la leche, el café molido.
 *
 *   2  Ingrediente culinario. No se come solo: se usa para cocinar los del
 *      grupo 1. Aceite, manteca, azúcar, sal, vinagre, miel.
 *
 *   3  Procesado. Grupo 1 + grupo 2, y poco más: pan, queso, conserva,
 *      encurtido, jamón. Reconocible como el alimento del que viene.
 *
 *   4  Ultraprocesado. Formulación industrial con ingredientes que no se usan
 *      en una cocina —aislados de proteína, aromas, emulgentes, colorantes— y
 *      normalmente ya no se parece a nada. Refresco, salsa de bote, caldo en
 *      pastilla, bollería, snack.
 *
 * ── DÓNDE ESTE FICHERO SE PARA, Y ES PRONTO ────────────────────────────────
 *
 * La frontera entre el 3 y el 4 la decide LA LISTA DE INGREDIENTES del
 * producto: si lleva aditivos cosméticos —los que están ahí para que parezca
 * comida, no para conservarla— es 4. Esa lista no está en el catálogo y no se
 * puede adivinar desde la composición: un pan de masa madre y un pan de molde
 * con veinte ingredientes tienen los mismos gramos de todo.
 *
 * Así que aquí solo se declara lo que la ficha permite sostener, que resulta
 * ser casi todo el 1 y todo el 2, y se devuelve `null` con su duda en la
 * frontera 3/4 salvo donde el propio nombre del producto la resuelve. Un NOVA
 * a medias que se presentara completo sería peor que no tenerlo: el 4 es
 * justamente el grupo por el que alguien preguntaría.
 *
 * ── Y una advertencia sobre lo que NOVA no es ──────────────────────────────
 *
 * NOVA no ordena de sano a insano. El aceite de oliva es grupo 2 y el pan
 * integral es grupo 3; un refresco light es 4 con cero calorías. Mide
 * procesado, y el procesado correlaciona con problemas de dieta pero no ES el
 * problema. Cualquier frase que salga de aquí tiene que decir «procesado», no
 * «malo».
 */

import alimentos from "../../data/alimentos.json";

/**
 * GRUPO 2 — ingredientes culinarios. Se reconocen por el `rol` que ya declara
 * la ficha, más la sal y los vinagres, que tienen rol de condimento y de
 * compuesto respectivamente pero son ingrediente culinario de manual.
 */
const ROLES_G2 = new Set(["grasa"]);
const IDS_G2 = new Set([
  "sal", "sal-gruesa", "azucar", "azucar-glas", "azucar-moreno", "miel",
  "sirope-de-arce", "vinagre", "vinagre-balsamico", "vinagre-de-jerez",
  "vinagre-de-manzana", "harina", "harina-integral", "maicena", "levadura",
  // La mantequilla es grasa de cocinar, igual que el aceite. Su familia
  // (`nata_mantequilla`) mezcla dos cosas distintas —la nata se come y la
  // mantequilla se usa para cocinar—, así que aquí va por id.
  "mantequilla",
]);

/**
 * GRUPO 3 — procesados. Grupo 1 conservado o curado con grupo 2, y todavía
 * reconocible. El encurtido y la conserva salen de la propia ficha; el queso y
 * el pan, de la familia.
 */
const ROLES_G3 = new Set(["encurtido"]);
const FAMILIAS_G3 = new Set(["queso"]);
/**
 * Procesados de toda la vida: fruta o leche con azúcar, tomate en conserva y
 * fermentados tradicionales. Todos son grupo 1 más grupo 2 y siguen
 * pareciéndose a lo que eran; ninguno necesita una fábrica que formule nada.
 */
const IDS_G3 = new Set([
  "mermelada", "cacao",
  "tomate-frito", "tomate-triturado", "tomate-concentrado",
  "miso", "gochujang", "salsa-soja", "harissa", "tinta-de-calamar",
]);

/**
 * LA CONSERVA NO SE PUEDE LEER DE `dimensiones.estado`, que está a `null` en
 * 382 de las 396 fichas. Se lee del nombre de la fuente, que es donde las
 * tablas sí lo dicen: «Tuna, plain, canned, drained», «Olives, green, in
 * brine», «Atún en aceite vegetal».
 *
 * Lo encontró un test: `atun-lata` salía grupo 1 —pescado— porque su `estado`
 * no dice conserva y la regla solo miraba ahí.
 */
const FUENTE_CONSERVA = /\b(canned|conserve|in brine)\b|en aceite|en salmuera|en conserva/i;

/**
 * Grupo 1 que su familia no acierta a decir. El café molido es la semilla
 * tostada y nada más, pero su familia es `compuesto` —donde vive también el
 * ketchup— porque ahí se metió lo que no encajaba en otro sitio.
 */
const IDS_G1 = new Set(["cafe-espresso", "nata"]);

/**
 * GRUPO 4 — ultraprocesados que el nombre del producto ya resuelve, sin
 * necesidad de su lista de ingredientes.
 *
 * LA REGLA PARA ENTRAR AQUÍ: que el producto NO EXISTA fuera de una fábrica.
 * Nadie hace kétchup, surimi ni nachos en una cocina. Lo que sí se puede hacer
 * en casa —alioli, mayonesa, bechamel, pesto, una salsa césar, un caldo— se va
 * a la duda aunque también se venda hecho, porque la ficha no dice cuál de las
 * dos cosas es y resolverlo a favor del peor caso sería inventar.
 *
 * LOS CALDOS ESTABAN AQUÍ Y ERA UN ERROR, y lo delató el propio dato: la «Sopa
 * de cocido con fideos finos» salía con el 88 % de su masa ultraprocesada. Un
 * caldo de cocido es lo más casero que hay, y los había clasificado como
 * pastilla mientras al alioli le daba el beneficio de la duda — la misma
 * pregunta contestada de dos maneras en el mismo fichero. Ahora los cinco
 * caldos van a la duda, con los demás.
 */
const IDS_G4 = new Set([
  "ketchup", "salsa-worcestershire", "sriracha", "tabasco",
  // El nombre de la ficha DICE que es de bote: ahí no hay duda que dar.
  "gazpacho-de-bote",
  "chocolate", "nocilla", "leche-condensada", "nata-montada-spray",
  "galletas-maria", "bizcocho-de-soletilla", "muffin-ingle", "nachos",
  "surimi",
]);

/**
 * Las familias cuyo miembro típico es comida de verdad sin tocar. Se listan en
 * positivo —en vez de excluir— para que una familia nueva caiga por defecto en
 * «no lo sé» y no en «grupo 1», que es el error que abarataría el eje entero.
 */
const FAMILIAS_G1 = new Set([
  "carne_ave", "carne_roja", "carne_cerdo", "carne_caza", "casqueria",
  "pescado_blanco", "pescado_azul", "marisco", "cefalopodo", "huevo",
  "verdura_hoja", "verdura_fruto", "verdura_raiz", "verdura_bulbo",
  "verdura_col", "tuberculo", "seta", "fruta", "fruto_seco", "legumbre",
  "cereal", "arroz", "alga", "leche", "aromatica", "especia", "mineral",
  // LA PASTA SECA ES GRUPO 1, y la primera versión de este fichero la dejó
  // sin clasificar por prudencia mal puesta: sémola de trigo duro y agua, sin
  // nada más, es el ejemplo que la propia clasificación usa para el grupo 1
  // («pasta, made from flour and water»). Lo que sube de grupo es la pasta
  // rellena o la instantánea, no la que se cuece veinte minutos.
  "pasta",
  // Y EL YOGUR NATURAL TAMBIÉN. Leche fermentada sin añadir nada es grupo 1;
  // el que sube a 4 es el de sabores, con azúcar y aromas. El catálogo solo
  // tiene el natural y el kéfir.
  "lacteo_fermentado",
]);

/**
 * Lo que convierte un grupo 1 en grupo 3: dejar de ser el alimento fresco para
 * ser el alimento conservado con sal, aceite o azúcar.
 */
const ESTADOS_G3 = new Set(["conserva", "fiambre"]);
const PROCESADOS_G3 = new Set(["curado", "ahumado", "fermentado"]);

/**
 * @param {object} alimento  una fila de alimentos.json
 * @returns {{valor: 1|2|3|4|null, via: string, duda: string|null}}
 */
export function novaDe(alimento) {
  if (!alimento) return { valor: null, via: "SIN DECIDIR", duda: "no hay ficha" };

  const { id, familia, rol } = alimento;
  const estado = alimento.dimensiones?.estado;
  const procesado = alimento.dimensiones?.procesado;

  // Lo nombrado manda sobre lo derivado, en los dos extremos.
  if (IDS_G4.has(id)) return { valor: 4, via: "producto de fábrica", duda: null };
  if (IDS_G2.has(id)) return { valor: 2, via: "ingrediente culinario", duda: null };
  if (ROLES_G2.has(rol)) return { valor: 2, via: `rol ${rol}`, duda: null };

  if (IDS_G3.has(id)) return { valor: 3, via: "producto procesado", duda: null };
  if (ROLES_G3.has(rol)) return { valor: 3, via: `rol ${rol}`, duda: null };
  if (FAMILIAS_G3.has(familia)) return { valor: 3, via: `familia ${familia}`, duda: null };
  if (IDS_G1.has(id)) return { valor: 1, via: "mínimamente procesado", duda: null };

  // EL ROL VA ANTES QUE LA FAMILIA, y lo encontró un test: el pesto tiene
  // `familia: verdura_hoja` —por la albahaca— así que caía como grupo 1. Una
  // salsa no es su ingrediente principal, y la familia de estas fichas nombra
  // de qué están hechas, no qué son.
  if (rol === "salsa") {
    return {
      valor: null,
      via: "SIN DECIDIR",
      duda: "una salsa puede ser de cocina o de bote, y la ficha no lo dice",
    };
  }

  // Un alimento simple que se conservó o se curó deja de ser grupo 1.
  if (FAMILIAS_G1.has(familia)) {
    if (ESTADOS_G3.has(estado)) return { valor: 3, via: `estado ${estado}`, duda: null };
    if (PROCESADOS_G3.has(procesado)) return { valor: 3, via: `procesado ${procesado}`, duda: null };
    if (FUENTE_CONSERVA.test(alimento.fuenteNombre ?? "")) {
      return { valor: 3, via: "la fuente dice conserva", duda: null };
    }
    return { valor: 1, via: `familia ${familia}`, duda: null };
  }

  // ── Lo que no se puede decidir, y por qué ────────────────────────────────
  //
  // `embutido` es el caso de libro de la frontera 3/4: un jamón curado es 3 y
  // una salchicha con nitritos y aromas es 4, y la ficha no trae la lista de
  // ingredientes que los separa. `pan` igual: una barra es 3 y un pan de molde
  // con veinte ingredientes es 4. `compuesto` incluye salsas de cocina y
  // salsas de bote con el mismo aspecto.
  //
  // Se devuelve la HORQUILLA en la duda en vez de un grupo inventado: quien
  // pregunte sabe que está entre dos y cuáles, que es más de lo que sabía.
  const HORQUILLA = {
    embutido: "3 o 4 según lleve o no aditivos: un jamón curado es 3, una salchicha industrial es 4",
    pan: "3 o 4 según la lista de ingredientes: una barra es 3, un pan de molde formulado es 4",
    compuesto: "3 o 4 según sea de cocina o de bote, y la ficha no lo dice",
    lacteo_fermentado: "1 o 4 según lleve azúcar y aromas: un yogur natural es 1, uno de sabores es 4",
    pasta: "1 o 3 según sea sémola y agua o lleve añadidos",
  };
  if (HORQUILLA[familia]) {
    return { valor: null, via: "SIN DECIDIR", duda: HORQUILLA[familia] };
  }

  return {
    valor: null,
    via: "SIN DECIDIR",
    duda: `la familia ${familia ?? "—"} no tiene regla NOVA`,
  };
}

/**
 * De qué está hecho un plato, en fracción de masa por grupo NOVA.
 *
 * ES MÁS ÚTIL QUE UNA ETIQUETA ÚNICA, y por eso el operador de plato devuelve
 * un reparto y no un número. Decir que un plato «es NOVA 3» porque lleva una
 * cucharada de tomate frito sobre 400 g de verdura fresca sería falso en la
 * práctica; decir que es 92 % grupo 1 y 5 % grupo 3 describe el plato.
 *
 * @param {Array<{id: string, gramos: number}>} lineas  masa ya resuelta por
 *   ración, tal y como la calcula `computeRecipeNutrition` — con merma, con el
 *   tope del aceite y sin la costra de sal. NO se recalcula aquí: un tercer
 *   carril de masa es el modo en que este repo se rompe.
 */
export function repartoNova(lineas) {
  const masa = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let sinClasificar = 0;
  let total = 0;
  for (const { id, gramos } of lineas ?? []) {
    if (!(gramos > 0)) continue;
    total += gramos;
    const { valor } = novaPorId(id);
    if (valor == null) sinClasificar += gramos;
    else masa[valor] += gramos;
  }
  if (total === 0) return { reparto: null, sinClasificar: 1, via: "SIN DECIDIR", duda: "el plato no tiene masa" };

  const frac = (g) => Math.round((g / total) * 1000) / 1000;
  return {
    reparto: { 1: frac(masa[1]), 2: frac(masa[2]), 3: frac(masa[3]), 4: frac(masa[4]) },
    sinClasificar: frac(sinClasificar),
    via: "masa por grupo",
    // Si más de un tercio del plato no se sabe clasificar, el reparto describe
    // más el hueco que la comida, y quien lo lea tiene que saberlo.
    duda: sinClasificar / total > 0.33
      ? `el ${Math.round((sinClasificar / total) * 100)} % de la masa no tiene grupo NOVA`
      : null,
  };
}

/** Lo mismo por id, memoizado: `repartoNova` pregunta una vez por línea. */
const PorId = new Map(alimentos.map((a) => [a.id, a]));
const memo = new Map();

export function novaPorId(id) {
  if (!id) return { valor: null, via: "SIN DECIDIR", duda: "sin id de alimento" };
  if (memo.has(id)) return memo.get(id);
  const r = novaDe(PorId.get(id) ?? null);
  memo.set(id, r);
  return r;
}

export const IDS_NOMBRADOS = { g1: [...IDS_G1], g2: [...IDS_G2], g3: [...IDS_G3], g4: [...IDS_G4] };