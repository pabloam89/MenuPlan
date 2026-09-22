/**
 * Platos a medio hacer: partir una receta en el día de la tanda y el día que toca.
 *
 * Es el hermano de `lib/bases.js` y no lo mismo. Una base es un INGREDIENTE que
 * sirve para varios platos: una olla de arroz, una bandeja de verdura asada. Un
 * plato a medio hacer es un plato CONCRETO cuya parte lenta se puede dejar
 * hecha: las croquetas formadas y empanadas, la lasaña montada, las empanadillas
 * cerradas. El domingo se hace todo menos el último acto, y el martes solo se
 * fríe o se mete al horno.
 *
 * Por qué no vale `freezable` para esto. `freezable` dice "cocínalo entero y
 * congélalo", y para un guiso es la respuesta correcta: unas albóndigas en salsa
 * salen mejor así y partirlas no ahorra nada. Pero lo rebozado, lo hojaldrado y
 * lo gratinado se arruinan cocinados dos veces, y justamente son los platos que
 * más trabajo dan. Para esos el ahorro no está en cocinar antes: está en dejar
 * el trabajo hecho y cocinar en el momento.
 *
 * El corte se guarda como un índice (`adelanto.hasta`) y no como dos listas de
 * pasos, para que no haya dos copias de la receta que se puedan descuadrar
 * cuando alguien edite un paso. Los minutos tampoco se guardan: se suman de
 * aquí, porque cada paso ya trae los suyos.
 */

/**
 * El suelo por debajo del cual adelantar un plato no compensa.
 *
 * Diez minutos de manos, y no quince, porque lo que se compra no son solo los
 * minutos: es sacar del martes un reposo de masa o un enfriado de nevera, que
 * no cuestan manos pero obligan a empezar una hora antes. El falafel adelanta
 * doce minutos y aun así se lleva por delante los quince de reposo.
 *
 * Por debajo de diez ya no queda nada: el viaje a la cocina, sacar el bol y
 * fregarlo cuestan más que el paso que te ahorras.
 */
export const MANOS_MINIMAS_DE_ADELANTO = 10;

/** Manos, no reloj: el mismo criterio que `lib/bases.js` usa para las tandas. */
function manos(pasos) {
  let total = 0;
  for (const paso of pasos) {
    if (paso?.kind === "activo" || paso?.kind === "prep") {
      total += Number(paso?.minutes) || 0;
    }
  }
  return total;
}

function reloj(pasos) {
  let total = 0;
  for (const paso of pasos) total += Number(paso?.minutes) || 0;
  return total;
}

const PRECALENTAR = /precalentar el horno|calentar el horno/i;
const AL_HORNO = /hornear|gratinar|al horno|grill/i;

export function tieneAdelanto(receta) {
  return Boolean(receta?.adelanto && receta?.stepsRich?.length);
}

/**
 * Parte la receta en los dos días.
 *
 * El precalentado del horno es el único paso que se mueve de lado. Vive al
 * principio de casi todas las recetas de horno, así que cae del lado del
 * adelanto por pura posición, y eso daría una instrucción absurda —"precalienta
 * el horno el domingo"— y encima se la quitaría al jueves, que es cuando hace
 * falta. Así que se saca del adelanto y se pone delante del remate si el remate
 * usa el horno.
 */
export function partirReceta(receta) {
  if (!tieneAdelanto(receta)) return null;
  const pasos = receta.stepsRich;
  const corte = receta.adelanto.hasta;

  const cabeza = pasos.slice(0, corte + 1);
  const cola = pasos.slice(corte + 1);

  const precalentados = cabeza.filter((p) => PRECALENTAR.test(p?.text ?? ""));
  const antes = cabeza.filter((p) => !precalentados.includes(p));
  const remataAlHorno = cola.some((p) => AL_HORNO.test(p?.text ?? ""));
  const despues = remataAlHorno && precalentados.length
    ? [precalentados[0], ...cola]
    : cola;

  return {
    antes,
    despues,
    guarda: receta.adelanto.guarda,
    dias: receta.adelanto.dias,
    manosAntes: manos(antes),
    manosDespues: manos(despues),
    relojDespues: reloj(despues),
  };
}

/**
 * Lo que este plato le quita al día que toca, en minutos de manos.
 *
 * Es el número que decide si merece la pena ofrecerlo en la tanda, y el que la
 * pantalla enseña. Se mide en manos y no en reloj porque el reloj del martes no
 * baja tanto —la lasaña sigue treinta minutos en el horno— pero durante esos
 * treinta minutos no estás delante, y eso es justo lo que se compra.
 */
export function ahorroDelDia(receta) {
  const partido = partirReceta(receta);
  return partido ? partido.manosAntes : 0;
}
