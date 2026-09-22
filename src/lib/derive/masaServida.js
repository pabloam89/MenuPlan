/**
 * De lo que se COMPRA a lo que llega al PLATO, y el factor es de la LÍNEA.
 *
 * Una receta pide gramos de lo que se compra. Entre esa cifra y lo que se
 * come hay dos ajustes, y hasta ahora los dos se aplicaban por identidad del
 * ingrediente: la fracción comestible (lo que se tira) y la hidratación (el
 * agua que absorbe al cocerse). Aplicar el factor del ingrediente medio da la
 * respuesta correcta para el ingrediente medio y la equivocada para la línea
 * concreta, que es la única que existe:
 *
 *   «Mejillones»            merman un 70 % por la concha
 *   «Mejillones (sin concha)»  no merman nada — y perdían la concha otra vez
 *
 * Medido sobre el catálogo el 22 sep 2026: 18 líneas restaban la merma dos
 * veces, entre 21 y 46 kcal por ración cada una. Los chipirones limpios, los
 * contramuslos deshuesados, la rosada en lomos, el zumo de lima.
 *
 * ── Los cuatro peldaños, y el cuarto es no contestar ───────────────────────
 *
 *   1. LA LÍNEA. El estado va en el nombre (D27). Si la receta pide
 *      «Garbanzos cocidos» o «Pollo asado desmenuzado», manda la receta.
 *   2. EL ESTADO declarado del alimento (`dimensiones.estado`).
 *   3. LA FICHA, y aquí está lo que hacía falta: su nombre dice el estado
 *      («boiled/cooked in water», «seca, cruda») y las KCAL lo comprueban.
 *      El nombre identifica y el número comprueba, como en todo el pipeline.
 *   4. Si el nombre y el número se contradicen, NO SE DECIDE: se marca. Así
 *      salió que `judia-blanca` se llamaba «cocidas» y traía 322,9 kcal, que
 *      es composición de alubia seca.
 */
import fraccionComestibleJson from "../../data/fraccionComestible.json";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// La fracción comestible
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Entero» gana a todo lo demás. Una «Lubina ENTERA limpia» viene eviscerada y
 * escamada pero conserva cabeza y espina, que son la mitad del peso — y su
 * 0,55 está curado para ese nombre exacto (lo dice su motivo). Cancelarlo ahí
 * doblaría la ración de golpe.
 */
const LINEA_ENTERA = /\benter[oa]s?\b|\b(en )?rodajas?\b|\bcon cabeza\b|\bcon espinas?\b|\bcon concha\b|\bcon cascara\b|\bcon caparazon\b|\bmedallon/;

/**
 * El nombre declara que el descarte ya se hizo, sin ambigüedad posible.
 *
 * ── El orden de las palabras, que costó nueve platos ───────────────────────
 *
 * Esto decía `\ben lomos\b` y `\ben filetes\b`, y el catálogo escribe las dos
 * cosas en los dos órdenes: «Merluza EN LOMOS» y «LOMOS DE merluza», «Rosada
 * en lomos» y «Filetes de lenguado». El regex solo conocía uno, así que a
 * nueve líneas de pescado ya fileteado se les volvía a quitar la cabeza y la
 * espina — entre 16 y 77 kcal por ración, en platos que se llaman «Filetes de
 * lenguado a la plancha» y «Lomos de rodaballo»:
 *
 *   Filetes de lenguado   320 g × 0,55 → 176 g
 *   Lomos de rodaballo    350 g × 0,55 → 193 g
 *   Filetes de merluza    400 g × 0,70 → 280 g
 *
 * El parche anterior —el de las 18 líneas del 22 de septiembre— no cerró el
 * agujero: cerró los nombres que empezaban por «en».
 *
 * Por eso ahora se busca la PALABRA y no la construcción: `\blomos?\b` casa
 * las dos formas y además el singular, que tampoco estaba («Lomo de atún
 * fresco»). No hay falso positivo temible: un «Lomo de cerdo» también es
 * despiece, y `\b` impide que «solomillo» entre por la puerta de atrás.
 *
 * `medallon` va en cambio con los ENTEROS y no aquí, y es la excepción que
 * confirma la regla: un medallón de rape se corta ATRAVESANDO la cola, con la
 * espina central dentro. Es un corte, no un despiece.
 */
const LINEA_DESPIEZADA =
  /\bsin concha\b|\bdesmenuzad|\bdesmigad|\bzumo\b|\bpelad[oa]s?\b|\bdesvainad|\bsin piel\b|\bsin espinas?\b|\bsin hueso\b|\bsin pepitas\b|\bdeshuesad|\blomos?\b|\bfilete|\bcarne de\b|\bkokotxas?\b|\banillas\b|\barilos?\b/;

/**
 * «Limpio» a secas es la palabra que más aparece y la que más engaña. En un
 * cefalópodo significa lo que parece —sin pluma ni vísceras, que es
 * exactamente su merma—; en un pescado puede ser solo eviscerado y la cabeza
 * sigue ahí. Con el pescado el modelo no decide: resta y lo marca.
 */
const LINEA_LIMPIA = /\blimpi[oa]s?\b/;
const LIMPIO_ES_LITERAL = /^(calamar|chipiron|sepia|pulpo)/;

/**
 * Las clases donde tirar algo es la NORMA y no la excepción.
 *
 * Un pez viene con cabeza y espina, un marisco con caparazón, un cefalópodo
 * con pluma y vísceras. Si uno de estos no trae fracción declarada, lo que
 * pasa es que nadie la ha mirado — no que se coma entero.
 *
 * Las aves y los mamíferos NO están: su catálogo es de despieces («Pechuga de
 * pollo», «Solomillo», «Carne picada») y ahí la ausencia sí suele significar
 * que no se tira nada. Meterlos daría 400 líneas de ruido y el aviso dejaría
 * de leerse, que es la forma habitual de matar un aviso.
 */
const MERMA_ES_LA_NORMA = new Set(["marisco", "cefalopodo", "pez"]);

/**
 * @param {string} nombreLinea  el nombre con el que la receta pide el ingrediente
 * @param {string|null|undefined} ingredientId
 * @param {object|null} [alimento]  la fila de alimentos.json, para saber si la
 *   ausencia de fracción es una decisión o un hueco. Sin ella no se avisa.
 * @returns {{factor: number, via: string, duda: string|null}}
 */
export function fraccionServida(nombreLinea, ingredientId, alimento = null) {
  const fc = fraccionComestibleJson[ingredientId]?.valor;

  // «Nadie lo ha declarado» devolvía exactamente lo mismo que «no se tira
  // nada»: factor 1 y el mismo `via`. Es el patrón que ya costó caro en la
  // nutrición —un `fuenteId` sin `via` parecía trazado y no lo estaba— y aquí
  // esconde 33 líneas de gamba y 9 de rape que sí traen caparazón y espina.
  //
  // No se inventa un número: el factor sigue siendo 1. Lo que cambia es que
  // deja de fingir que alguien lo decidió.
  if (fc == null) {
    const n = norm(nombreLinea);
    const clase = alimento?.taxonomia?.clase;
    const yaLimpia = LINEA_DESPIEZADA.test(n) || LIMPIO_ES_LITERAL.test(norm(ingredientId));
    if (MERMA_ES_LA_NORMA.has(clase) && !yaLimpia) {
      return {
        factor: 1,
        via: "SIN DECIDIR",
        duda: `«${nombreLinea}» (${ingredientId}) es ${clase} y nadie ha declarado su fracción comestible: `
          + "se cuenta entero, que es lo que pasa cuando el hueco se lee como un cero",
      };
    }
    return { factor: 1, via: "sin fracción declarada", duda: null };
  }
  if (fc >= 1) return { factor: 1, via: "no se tira nada", duda: null };

  const n = norm(nombreLinea);
  if (LINEA_ENTERA.test(n)) return { factor: fc, via: "la línea dice ENTERO", duda: null };
  if (LINEA_DESPIEZADA.test(n)) return { factor: 1, via: "la línea dice que ya viene despiezado", duda: null };

  if (LINEA_LIMPIA.test(n)) {
    if (LIMPIO_ES_LITERAL.test(norm(ingredientId))) {
      return { factor: 1, via: "«limpio» en cefalópodo: viene listo", duda: null };
    }
    return {
      factor: fc,
      via: "SIN DECIDIR",
      duda: `«${nombreLinea}» dice limpio y el alimento merma ×${fc}: en un pescado «limpio» puede ser solo eviscerado`,
    };
  }
  return { factor: fc, via: "merma del alimento", duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// El aceite de freír
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De todo el aceite que una receta lista, cuánto acaba DENTRO de la comida.
 *
 * Una fritura no se come su aceite: se calienta, se fríe y se tira. Contarlo
 * entero daba números imposibles y no en pocos casos —«Fritura de pescado
 * variado» listaba 367 g de aceite para dos raciones y salía a 2.062 kcal por
 * plato, cinco veces lo declarado; con el tope sale a 632—.
 *
 * El 6 % no es un número redondo elegido a ojo: sale del propio catálogo, y lo
 * midió antes scripts/audit-catalog.mjs. En «Patatas fritas caseras», de las
 * 500 kcal declaradas menos las 288 de la patata quedan 212 kcal de aceite,
 * que son 24 g, que son el 6 % del peso del sólido.
 *
 * Solo los aceites LÍQUIDOS de cocinar. La mantequilla y la manteca no entran:
 * en este catálogo no se fríe con ellas y su grasa sí se come.
 *
 * Y el tope no es un recorte, es un mínimo: un chorro para sofreír ya está por
 * debajo del 6 % del sólido y pasa entero.
 *
 * ── Por qué vive aquí y no en ingredients.js ───────────────────────────────
 *
 * Porque había DOS. Este módulo dice «de lo que se compra a lo que llega al
 * plato», y el aceite de freír es exactamente eso, así que su sitio es este.
 * Estaban escritos con la misma constante y significados opuestos:
 *
 *   ingredients.js  Math.min(brutos, 0,06 × sólido)   un TOPE
 *   composicion.js  cruda *= 0,06                     una MULTIPLICACIÓN
 *
 * En una ensalada con 20 ml de aliño y 300 g de sólido el primero deja pasar
 * los 18 g enteros —el aliño se come— y el segundo dejaba 1,1 g. El vector se
 * comía el aceite de aliñar 16 veces por debajo.
 *
 * ── Y el tope es de la RECETA, no de la línea ──────────────────────────────
 *
 * Aplicado línea a línea, una receta con dos aceites absorbía dos veces el
 * 6 %. «Chuletón a la parrilla con patatas fritas» lleva 300 ml de girasol
 * para freír y 150 ml de oliva suave para el alioli: el sólido no absorbe el
 * 12 % de su peso. Son 19 recetas del catálogo con más de una línea de aceite.
 */
export const ACEITE_ABSORBIDO = 0.06;

/** Los aceites líquidos de cocinar, por id. Nunca por nombre: «Anchoas en aceite» no lo es. */
export const ES_ACEITE_DE_FREIR = /^aceite-/;

/**
 * ¿SE FRÍE EN ESTA RECETA? Porque el tope solo vale si el aceite se queda.
 *
 * El 6 % describe lo que un alimento ABSORBE de un baño de aceite que después
 * se tira. Aplicado a ciegas, borra el ingrediente principal de todo plato
 * donde el aceite ES el plato:
 *
 *   Alioli              138 g de aceite → factor 0,007 →   6 kcal por ración
 *   Mayonesa casera     184 g           → 0,024         →  31 kcal
 *   Vinagreta clásica    55 g           → 0,036         →   9 kcal
 *   Puerros confitados con vinagreta (ESTRELLA) → 75 kcal frente a 355
 *
 * Y lo hacía en silencio: `coverage` daba 1,00 y las macros cuadraban con
 * Atwater, porque el aceite desaparecía del numerador Y del denominador.
 *
 * Así que se pregunta al texto, que es donde está escrito. Medido sobre las
 * 207 recetas que llevaban recorte: 99 dicen freír y 108 no, y esas 108 son
 * exactamente los aliolis, las vinagretas, los mojos, los chimichurris, los
 * pesto, los pil-pil, los escabeches y el aglio e olio. La señal separa
 * limpiamente las dos cosas.
 *
 * NO incluye «confitar». Un confitado se come con su aceite —el bacalao lo
 * lleva dentro, los puerros se sirven con él— y absorbe mucho más del 6 %.
 * Tratarlo como una fritura era la mitad del daño en las recetas estrella.
 *
 * Cuando no hay señal, NO SE RECORTA. Sobreestimar por no descontar es un
 * error que se ve y va en una dirección conocida; inventar una pérdida del
 * 94 % no se ve y hace publicar un alioli de 6 kcal.
 */
/**
 * El «abundante» del MARCADOR cuenta tanto como el del texto. Los buñuelos
 * escriben «Calentar {{Aceite de oliva|abundante}} en una sartén honda a
 * 175 °C» y ahí la palabra que declara el baño viaja dentro del marcador, no
 * en la frase: sin esta alternativa salían sin recorte y publicaban 1.432 kcal
 * por ración.
 */
const SE_FRIE =
  /\bfre[ií]r\b|\bfrit[oa]s?\b|\bfriendo\b|\bfreidora\b|\bsumergir\b|\baceite abundante\b|\ben abundante aceite\b|aceite[^|}]*\|\s*abundante|\bpapel absorbente\b/i;

/**
 * @param {{name?: string, steps?: string[], stepsRich?: {text?: string}[]}} receta
 * @returns {boolean}
 */
export function seFrie(receta) {
  if (!receta) return false;
  const texto = [
    receta.name ?? "",
    ...(receta.steps ?? []),
    ...(receta.stepsRich ?? []).map((s) => s?.text ?? ""),
  ].join(" ");
  return SE_FRIE.test(texto);
}

/**
 * El tope de aceite de TODA la receta, repartido entre sus líneas de aceite.
 *
 * Devuelve el factor que hay que aplicar a cada línea de aceite, de 0 a 1. Se
 * reparte a prorrata porque si la receta lista dos aceites distintos no hay
 * forma de saber cuál se absorbió: lo único honrado es repartir.
 *
 * @param {number} aceiteBruto  la suma de TODAS las líneas de aceite, en gramos
 * @param {number} solidoGramos la masa servida de todo lo que NO es aceite
 * @param {boolean} hayFritura  si la receta declara que se fríe (ver `seFrie`)
 * @returns {number} factor de 0 a 1 a aplicar a cada línea de aceite
 */
export function factorAceite(aceiteBruto, solidoGramos, hayFritura) {
  if (!(aceiteBruto > 0)) return 1;
  // Sin fritura el aceite se sirve entero: es aliño, emulsión o confitado.
  if (!hayFritura) return 1;
  return Math.min(1, (ACEITE_ABSORBIDO * solidoGramos) / aceiteBruto);
}

// ─────────────────────────────────────────────────────────────────────────────
// La hidratación
// ─────────────────────────────────────────────────────────────────────────────
//
// NO la usa `computeRecipeNutrition`, que multiplica la ficha por los gramos
// pedidos y por tanto asume que el peso y la ficha hablan del mismo estado.
// La usa el vector de composición, que necesita masa SERVIDA para repartirla
// entre nodos. Vive aquí porque es la misma idea y el mismo error si se aplica
// por identidad.

/** Lo que absorbe agua al cocerse, y cuánto. */
export function factorDeClase(taxonomia) {
  const t = taxonomia;
  if (!t) return 1;
  if (t.clase === "legumbre" && !["tofu", "miso", "gochujang", "falafel"].includes(t.especie)) return 2.4;
  if (t.subclase === "arroz") return 2.5;
  if (t.subclase === "pasta") return 2.2;
  if (t.especie === "cuscu") return 2.6;
  if (t.especie === "quinoa") return 2.8;
  if (t.especie === "avena") return 2.5;
  return 1;
}

const LINEA_COCIDA = /\bcocid[oa]s?\b|\bconserva\b|\bcongelad[oa]s?\b|\bde bote\b|\ben lata\b|\bprecocid|\bhervid|\bal dente\b/;
const LINEA_SECA = /\bsec[oa]s?\b|\bcrud[oa]s?\b|\ben remojo\b|\bdeshidratad/;
const ESTADO_CON_AGUA = ["fresco", "congelado", "conserva", "precocinado", "remojado", "fiambre"];
const FICHA_COCIDA = /boiled|cooked|cocid|hervid/;
const FICHA_CRUDA = /\bcrud|\braw\b|\bsec[ao]\b|dried|\bdry\b|mature seeds/;

/**
 * Las dos bandas salen de MEDIR el catálogo, no de redondear: las fichas que
 * dicen «cocido» caen entre 112 y 147 kcal/100 g y las que dicen «seca/cruda»
 * entre 265 y 399. En medio no hay ninguna, y por eso el hueco 150-250 es el
 * sitio honrado para no contestar — ahí cayó «Canelones» con 191 kcal, que no
 * es un canelón cocido (nadie vende placas cocidas) sino una ficha sospechosa.
 */
const KCAL_SECO = 250;
const KCAL_COCIDO = 150;

/**
 * @param {string} nombreLinea
 * @param {object|null} alimento  la fila de alimentos.json
 * @returns {{factor: number, via: string, duda: string|null}}
 */
export function factorHidratacion(nombreLinea, alimento) {
  const base = factorDeClase(alimento?.taxonomia);
  if (base === 1) return { factor: 1, via: "no absorbe agua", duda: null };

  const n = norm(nombreLinea);
  if (LINEA_COCIDA.test(n)) return { factor: 1, via: "lo dice la línea", duda: null };
  if (LINEA_SECA.test(n)) return { factor: base, via: "lo dice la línea", duda: null };

  const estado = alimento?.dimensiones?.estado;
  if (ESTADO_CON_AGUA.includes(estado)) return { factor: 1, via: "estado declarado", duda: null };
  if (estado === "seco") return { factor: base, via: "estado declarado", duda: null };

  const ficha = norm(alimento?.fuenteNombre);
  const kcal = alimento?.nutricion?.kcal100g;
  const porNombre = FICHA_COCIDA.test(ficha) ? "cocido" : FICHA_CRUDA.test(ficha) ? "seco" : null;
  const porNumero = kcal == null ? null
    : kcal >= KCAL_SECO ? "seco"
      : kcal <= KCAL_COCIDO ? "cocido" : null;

  if (porNombre && porNumero && porNombre !== porNumero) {
    return {
      factor: 1,
      via: "SIN DECIDIR",
      duda: `la ficha «${alimento.fuenteNombre}» dice ${porNombre} y sus ${Math.round(kcal)} kcal dicen ${porNumero}`,
    };
  }
  const veredicto = porNombre ?? porNumero;
  if (veredicto === "cocido") return { factor: 1, via: porNombre ? "ficha (nombre)" : "ficha (kcal)", duda: null };
  if (veredicto === "seco") return { factor: base, via: porNombre ? "ficha (nombre)" : "ficha (kcal)", duda: null };

  return {
    factor: 1,
    via: "SIN DECIDIR",
    duda: `ni la ficha «${alimento?.fuenteNombre ?? "—"}» ni sus ${kcal == null ? "?" : Math.round(kcal)} kcal dicen el estado`,
  };
}
