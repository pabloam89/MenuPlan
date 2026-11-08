/**
 * Lo mínimo que hay que saber de una casa antes de generarle un menú, y qué
 * falta (trozo 2 de specs/plan-fichas-con-estado.md, #1037; caso #1029).
 *
 * Decidido por Pablo el 30 oct 2026 (decisión B del plan, opción 1): si de
 * alguien no se sabe si tiene alergias, NO se genera; se pregunta primero.
 * Revierte lo del 8 oct (#107: se generaba esquivando los 14 alérgenos y se
 * preguntaba después): con los 14 fuera quedan ~27 recetas y la semana sale
 * con huecos vacíos. «Por silencio» (#229) sigue valiendo como revisado: la
 * casa a la que se preguntó con el aviso y no contestó sí genera.
 *
 * Qué es mínimo lo declara el registro de la ficha (registroFicha.js,
 * `minimo_para_generar`: quién come, alergias dichas y días; trozo 5). Aquí se
 * mira solo el de las alergias: «quién come» lo exige generar.js antes de
 * llegar aquí (sin personas no hay grupos) y los días siempre resuelven
 * (semanaDias.js cae a los de por defecto). Puro: sin base ni textos de Lola;
 * quien llama (api/_bot/generar.js) pone la frase.
 */
// De alergiasBase.js, no de alergias.js: esta la importa el bot y alergias.js arrastra el catálogo (y un .jsx).
import { pendientesDeAlergias } from "./alergiasBase.js";
import { DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";

/** Las claves del registro que son mínimo para generar («members.x» para las de la persona). */
const MINIMOS = [...Object.keys(DATOS_CASA).filter((k) => DATOS_CASA[k].minimo_para_generar), ...Object.keys(DATOS_PERSONA).filter((k) => DATOS_PERSONA[k].minimo_para_generar).map((k) => `members.${k}`)];

/**
 * Lo que puede faltar aquí, por su clave en el registro (generar.js compara contra esto, no contra el
 * literal). Si el registro dejara de declararlo mínimo, esto no carga: dos listas no pueden decir cosas distintas sin que se note.
 */
export const MINIMO = Object.freeze({ alergias: "members.allergies" });
for (const clave of Object.values(MINIMO)) if (!MINIMOS.includes(clave)) throw new Error(`«${clave}» no es mínimo para generar en el registro de la ficha`);

/**
 * @param {object} data La casa como la ve el motor (`members`, `allergiesReviewed`…).
 * @returns {{ minimo: string, personas: string[] }[]} Vacío si se puede generar.
 */
export function minimosQueFaltan(data) {
  const faltan = [];
  const sinAlergias = pendientesDeAlergias(data);
  if (sinAlergias.length) {
    faltan.push({ minimo: MINIMO.alergias, personas: sinAlergias.map((m) => m.name ?? m.nombre ?? "alguien de la casa") });
  }
  return faltan;
}
