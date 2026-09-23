/**
 * ¿LA FICHA DESCRIBE EL ALIMENTO CRUDO O YA COCINADO?
 *
 * `dimensiones.procesado` lleva escrito desde que se diseñó qué significa —«NO
 * es la técnica con la que lo cocina la receta: es el estado en el que BEDCA
 * lo analizó, y por eso cambia los números. Lenteja seca: 24 g de proteína/100
 * g. Lenteja cocida: 9,5»— y está a `null` en 318 de las 377 fichas a las que
 * les aplica. El campo existe, el enum existe, la doctrina existe: falta el
 * dato.
 *
 * ── Por qué hace falta ANTES de tocar la retención ─────────────────────────
 *
 * Un hervido pierde folato y el crudo no, así que las kcal y los micros del
 * catálogo están inflados en los platos que se cuecen. La corrección son
 * factores de retención por técnica. Pero aplicar un factor a una ficha que YA
 * viene cocida descuenta la pérdida dos veces: las lentejas cocidas de CIQUAL
 * ya perdieron su folato en el laboratorio. Sin saber el estado de la ficha,
 * la corrección haría más daño que el error que corrige. Este operador es el
 * prerrequisito duro, no un adorno previo.
 *
 * ── La escalera, la misma que `factorHidratacion` ──────────────────────────
 *
 *   1. lo declarado a mano          nunca se pisa, ni cuando el nombre discrepa
 *   2. la familia                   si `procesado` no le aplica, es `no_aplica`
 *   3. el nombre de la fuente       «boiled», «raw», «canned»…
 *   4. las kcal, como testigo       solo en lo que hidrata, y solo para
 *                                   CONTRADECIR al nombre o para hablar cuando
 *                                   el nombre calla
 *   5. no decidir, y decir por qué
 *
 * ── La trampa que este fichero tuvo que esquivar ───────────────────────────
 *
 * «Hazelnut, grilled» y «Peanut, grilled, salted» no son avellanas a la
 * plancha: son avellanas TOSTADAS. La misma palabra inglesa nombra dos cosas
 * distintas según lo que se esté cocinando, así que la palabra propone y la
 * familia dispone. Es la enésima versión del substring sin frontera, y por eso
 * ninguna regla de aquí mira solo el texto.
 *
 * Y la contraria, que también estaba: «Dried pasta, raw» lleva las dos
 * palabras y no se contradice — es pasta seca Y cruda. `seco` es `estado`, no
 * `procesado`, y confundirlos habría marcado media despensa como cocinada.
 */

import { FAMILIA_DIMENSIONES } from "../../data/alimentoSchema.js";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Palabra de la fuente → valor de `PROCESADOS`.
 *
 * Solo entran las que nombran una TRANSFORMACIÓN. Quedan fuera a propósito:
 *   - «dried / seche»   es `estado: seco`, y una pasta seca sigue cruda.
 *   - «in brine / salmuera»  es `medio`, y lo que le pasa a una aceituna de
 *     mesa (sosa, fermentación, salmuera) no cabe en una palabra: sin decidir.
 *   - «pasteurized»     no cambia el estado culinario.
 */
const PALABRAS = [
  [/\b(raw|cru|crue|crus|crudo|cruda|fresh|frais|fresco|fresca)\b/, "crudo"],
  [/\bboiled\b|\bbouilli\b|boiled\/cooked in water/, "hervido"],
  [/\b(cooked|cuit|cuite|steamed|cocido|cocida)\b/, "cocido"],
  [/\b(canned|conserve)\b/, "cocido"],
  [/\b(grilled|grille)\b/, "plancha"],
  [/\b(roasted|roti)\b/, "asado"],
  [/\b(fried|frit|frita|frito)\b/, "frito"],
  [/\b(smoked|fume|ahumado|ahumada)\b/, "ahumado"],
  [/\b(cured|curado|curada)\b|salt-cured/, "curado"],
  [/\b(toasted|toste|tostado|tostada)\b/, "tostado"],
  [/\b(fermented|fermente)\b/, "fermentado"],
  [/\binfusion\b/, "infusion"],
];

/**
 * Familias donde el calor seco de una tabla es TOSTAR, no asar ni marcar a la
 * plancha. Un fruto seco «grilled» está tostado; una ternera «grilled», no.
 */
const SE_TUESTAN = new Set(["fruto_seco", "cereal", "pan", "semilla"]);

/** Lo que hidrata, y por tanto delata su estado en las kcal. */
const HIDRATAN = new Set(["legumbre", "cereal", "arroz", "pasta"]);

/**
 * Familias donde el alimento nombrado a secas es el alimento fresco.
 *
 * Fuera quedan las que llegan ya hechas y cuyo nombre no dice nada del estado:
 * `compuesto` (un alioli), `pan`, `queso`, `embutido`, `lacteo_fermentado`,
 * `especia`. Ahí la convención de la tabla no aplica porque no hay un «crudo»
 * que declarar.
 */
const SIMPLES = new Set([
  "carne_ave", "carne_roja", "carne_cerdo", "carne_caza", "casqueria",
  "pescado_blanco", "pescado_azul", "marisco", "cefalopodo", "huevo",
  "verdura_hoja", "verdura_fruto", "verdura_raiz", "verdura_bulbo",
  "verdura_col", "seta", "fruta", "legumbre", "alga",
]);

/**
 * Lo que convierte un nombre en algo más que el alimento. Una coma abre una
 * lista de precisiones («Tuna, plain, canned») y un «en/al/con» nombra un
 * medio o una preparación («Atún en aceite de oliva»). En los dos casos la
 * ficha está diciendo algo que esta regla no sabe leer, así que se aparta.
 */
const CALIFICADO = /,| en | al | con | a la /;

// Mismas bandas que `factorHidratacion`, y salen de medir el catálogo: las
// fichas que dicen «cocido» caen entre 112 y 147 kcal/100 g y las que dicen
// «seca/cruda» entre 265 y 399. El hueco de en medio no se contesta.
const KCAL_SECO = 250;
const KCAL_COCIDO = 150;

/**
 * @param {object} alimento  una fila de alimentos.json
 * @returns {{valor: string|null, via: string, duda: string|null}}
 *   `valor` es un miembro de `PROCESADOS`, `"no_aplica"`, o `null` cuando no
 *   se puede decidir — y entonces `duda` dice qué falta.
 */
export function procesadoDe(alimento) {
  if (!alimento) return { valor: null, via: "SIN DECIDIR", duda: "no hay ficha" };

  const yaEsta = alimento.dimensiones?.procesado;
  if (yaEsta) return { valor: yaEsta, via: "declarado", duda: null };

  const dims = FAMILIA_DIMENSIONES[alimento.familia];
  if (dims && !dims.includes("procesado")) {
    return { valor: "no_aplica", via: "la familia no tiene ese eje", duda: null };
  }

  const ficha = norm(alimento.fuenteNombre);
  let porNombre = null;
  for (const [re, valor] of PALABRAS) {
    if (!re.test(ficha)) continue;
    porNombre = valor;
    break;
  }
  // La palabra propone, la familia dispone: ver «Hazelnut, grilled» arriba.
  if ((porNombre === "plancha" || porNombre === "asado") && SE_TUESTAN.has(alimento.familia)) {
    porNombre = "tostado";
  }

  // El testigo numérico solo habla de lo que hidrata, y solo distingue dos
  // estados: crudo/seco frente a cocido. No sabe si el cocido fue un hervido o
  // un estofado, así que nunca ASCIENDE a un valor fino — solo confirma,
  // contradice, o dice «hervido» como el cocido más común de una fécula.
  const kcal = alimento.nutricion?.kcal100g;
  const hidrata = HIDRATAN.has(alimento.familia);
  const porNumero = !hidrata || kcal == null ? null
    : kcal >= KCAL_SECO ? "crudo"
      : kcal <= KCAL_COCIDO ? "cocido" : null;

  if (porNombre && porNumero) {
    const nombreDiceCocido = porNombre !== "crudo";
    const numeroDiceCocido = porNumero === "cocido";
    if (nombreDiceCocido !== numeroDiceCocido) {
      return {
        valor: null,
        via: "SIN DECIDIR",
        duda: `la ficha «${alimento.fuenteNombre}» dice ${porNombre} y sus ${Math.round(kcal)} kcal dicen ${porNumero}`,
      };
    }
    // Coinciden: manda el nombre, que es más fino («hervido», no «cocido»).
    return { valor: porNombre, via: "ficha (nombre, kcal de acuerdo)", duda: null };
  }

  if (porNombre) return { valor: porNombre, via: "ficha (nombre)", duda: null };
  if (porNumero) return { valor: porNumero, via: "ficha (kcal)", duda: null };

  // EL PELDAÑO FLOJO, y va marcado como tal.
  //
  // Las tres tablas nombran el alimento a secas cuando lo analizan fresco y
  // DECLARAN el proceso cuando lo hay: en este catálogo conviven «Salmón» y
  // «Salmón ahumado», «Boquerón» y «Anchoas en aceite vegetal», «Bacon, crudo»
  // y «Pork trotters salt-cured». Un nombre sin calificativo es, por esa
  // convención, el alimento crudo.
  //
  // Se aplica SOLO a familias de alimento simple. Un «Alioli» también es un
  // nombre sin calificativo y no está crudo: en un compuesto, en un pan o en
  // un queso la pregunta no se contesta mirando el nombre. Y basta una coma o
  // un «en/al/con» para que la ficha esté diciendo algo más y la regla se
  // aparte — por eso «Atún en aceite de oliva isabel» no entra.
  //
  // Sale con `via` propia a propósito: quien quiera evidencia explícita puede
  // exigir «ficha (nombre)» y dejar esto fuera. No es lo mismo saberlo que
  // deducirlo de cómo escribe la tabla.
  if (SIMPLES.has(alimento.familia) && ficha && !CALIFICADO.test(ficha)) {
    return { valor: "crudo", via: "convención de la tabla", duda: null };
  }

  return {
    valor: null,
    via: "SIN DECIDIR",
    duda: `ni la ficha «${alimento.fuenteNombre ?? "—"}» ni sus ${kcal == null ? "?" : Math.round(kcal)} kcal declaran el estado`,
  };
}

/**
 * ¿Esta ficha ya perdió sus nutrientes en el laboratorio?
 *
 * La pregunta que le hará el factor de retención, y la única de este módulo
 * que tiene una respuesta de tres valores a propósito: `true` (viene cocida,
 * NO se le aplica retención), `false` (viene cruda, la receta la cocinará) y
 * `null` (no se sabe, y entonces tampoco se aplica — pero por prudencia, no
 * por conocimiento, y quien lo lea puede contarlo aparte).
 *
 * @returns {{cocinada: boolean|null, via: string, duda: string|null}}
 */
export function vieneCocinada(alimento) {
  const { valor, via, duda } = procesadoDe(alimento);
  if (valor === null) return { cocinada: null, via, duda };
  if (valor === "no_aplica") return { cocinada: false, via, duda: null };
  return { cocinada: valor !== "crudo", via, duda };
}
