/**
 * La etapa del bebé: cremas, sólidos o mixto.
 *
 * ── Por qué se pregunta en vez de calcularse ──────────────────────────────
 * La edad parece el dato obvio y es un proxy malo. `stages.js` define bebé como
 * 0 a 2 años, así que un niño de 22 meses y uno de 6 caían en el mismo cajón y
 * comían los mismos 19 purés. Y afinar por meses tampoco arregla nada: entre
 * dos bebés de nueve meses hay uno que traga trozos y otro que no, y eso no lo
 * dice el calendario — lo sabe su madre.
 *
 * Es la misma trampa que describe el documento del motor: no preguntes por un
 * comportamiento observable ("¿qué edad tiene?"), pregunta por la VARIABLE
 * ("¿qué textura come?"). De paso se evita depender de que el miembro se diera
 * de alta con fecha de nacimiento, que no siempre pasa.
 *
 * ── Por qué mixto es el valor por defecto ─────────────────────────────────
 * Es la respuesta más frecuente de la vida real: casi todos los bebés que
 * importan aquí están en transición. Y es la única opción que no se equivoca
 * del todo si nadie contesta — con "cremas" le negarías sólidos a quien ya los
 * come, y con "sólidos" le ofrecerías trozos a quien todavía no puede.
 */

/** Las tres etapas, en el orden en que se viven. */
export const ETAPAS_BEBE = ["cremas", "mixto", "solidos"];

export const ETAPA_BEBE_DEFAULT = "mixto";

export const ETAPA_BEBE_INFO = {
  cremas: {
    id: "cremas",
    label: "Solo cremas y purés",
    desc: "Todo triturado fino",
    img: "/avatares/cards/bebe/cremas.png",
  },
  mixto: {
    id: "mixto",
    label: "Un poco de cada",
    desc: "Purés y algún trozo blando",
    img: "/avatares/cards/bebe/mixto.png",
  },
  solidos: {
    id: "solidos",
    label: "Ya come sólidos",
    desc: "Trozos que coge con la mano",
    img: "/avatares/cards/bebe/solidos.png",
  },
};

/** La etapa de esta casa, con su default. */
export function etapaBebeDe(data) {
  const v = data?.etapaBebe;
  return ETAPAS_BEBE.includes(v) ? v : ETAPA_BEBE_DEFAULT;
}

/**
 * Qué etapas de receta valen para esta casa.
 *
 * "mixto" abre las dos, y ese es justo el sentido de que sea el default: no se
 * queda a medias entre las dos listas, se queda con las dos enteras.
 */
export function etapasServibles(data) {
  const etapa = etapaBebeDe(data);
  if (etapa === "cremas") return ["cremas"];
  if (etapa === "solidos") return ["solidos"];
  return ["cremas", "solidos"];
}

/**
 * ¿Sirve esta receta de bebé para esta casa?
 *
 * Una receta sin `etapaBebe` cuenta como crema: las 19 que había cuando esto se
 * escribió lo eran (18 purés y un revuelto), así que ese es el supuesto que no
 * rompe nada de lo que ya funcionaba.
 */
export function recetaBebeSirve(recipe, data) {
  if (recipe?.category !== "bebes") return false;
  return etapasServibles(data).includes(recipe.etapaBebe ?? "cremas");
}
