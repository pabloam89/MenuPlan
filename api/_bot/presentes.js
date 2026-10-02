/**
 * Quién NO come en casa en una comida concreta de una fecha concreta.
 *
 * El menú hecho no se toca cuando falta solo una parte de un grupo (menu.js
 * apuntarAusencia: el plato se queda para los demás), así que lo que se pinta
 * tiene que restar a los ausentes. Si no, el día salía «Nat, Pablo y Isa»
 * mientras Lola decía «Pablo come fuera» (staging, 2 oct 2026).
 *
 * Dos fuentes, las mismas que usa el motor:
 *   · las reglas `presente: fuera` (ausencias puntuales, con vigencia);
 *   · el horario de siempre, `data.schedule["miembro|Día|Comida"]`. «tupper»
 *     no cuenta como fuera: se come lo de casa.
 * Pura, para el test.
 */

const NO_COME_EN_CASA = new Set(["fuera", "cole", "off"]);

function aplica(regla, fecha, dia, comida) {
  if (regla?.efecto?.tipo !== "presente" || regla.efecto.valor !== "fuera") return false;
  const { desde, hasta } = regla.vigencia ?? {};
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  const { dias, comidas } = regla.ambito ?? {};
  if (dias?.length && !dias.includes(dia)) return false;
  if (comidas?.length && !comidas.includes(comida)) return false;
  const s = regla.salvedad;
  if (s && (s.dias ?? [dia]).includes(dia) && (s.comidas ?? [comida]).includes(comida)) return false;
  return true;
}

/**
 * @param {object} data  state.data de la casa
 * @param {string} fecha ISO
 * @param {string} dia   «Lun»…«Dom»
 * @param {string} comida «Comida», «Cena»…
 * @returns {Set<string>} ids de los miembros que no comen en casa
 */
export function fueraEn(data, fecha, dia, comida) {
  const miembros = data?.members ?? [];
  const fuera = new Set();
  for (const p of miembros) {
    if (NO_COME_EN_CASA.has(data?.schedule?.[`${p.id}|${dia}|${comida}`])) fuera.add(p.id);
  }
  for (const r of data?.reglas ?? []) {
    if (!aplica(r, fecha, dia, comida)) continue;
    const { tipo, ref } = r.sujeto ?? {};
    if (tipo === "casa") for (const p of miembros) fuera.add(p.id);
    else if (tipo === "miembro" && ref) fuera.add(ref);
    else if (tipo === "grupo" && ref) {
      for (const id of (data.groups ?? []).find((g) => g.id === ref)?.memberIds ?? []) fuera.add(id);
    }
  }
  return fuera;
}
