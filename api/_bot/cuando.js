/**
 * De «cuándo» a fechas reales: lo que saca el enrutador («el finde», «la
 * semana que viene», «de lunes a miércoles») convertido en días ISO con la
 * fecha de España. Pura (recibe `hoy`), para poder probar cada caso.
 *
 * Reglas, las que diría una persona:
 *   hoy / mañana / pasado mañana   lo que dicen
 *   un día («el jueves»)           el próximo jueves; si hoy es jueves, hoy
 *   el finde                       este sábado y domingo; el sábado, los dos;
 *                                  el domingo, solo hoy
 *   el finde que viene             entre semana, el mismo que «el finde»; en
 *                                  finde, el de la semana siguiente
 *   esta semana                    de hoy al domingo (lo pasado ya no interesa)
 *   la semana que viene            del lunes siguiente al domingo
 *   un rango («de lunes a miércoles»)  del primer día (como «un día») al
 *                                  segundo, sin pasar de 7 días
 */

import { DIAS, indiceDeISO, diaDeISO } from "../../src/lib/dias.js";
import { diaDeSemana, fechaDe, sumarDias, normal } from "./interprete.js";

export const CUANDOS = ["hoy", "manana", "pasado_manana", "dia", "finde", "finde_que_viene", "esta_semana", "semana_que_viene", "rango"];

export { sumarDias };
/** 0 = lunes … 6 = domingo */
export const indiceDia = indiceDeISO;
export const diaDeFecha = diaDeISO;

/** «jueves», «el jueves», «Jue», «mañana» → índice 0-6 del día de la semana, o null. Con el intérprete (#958). */
function indiceDeNombre(texto, hoy) {
  const d = diaDeSemana(texto);
  if (d) return DIAS.indexOf(d);
  const r = fechaDe(texto, { hoy });
  return r.fecha ? indiceDia(r.fecha) : null;
}

/** El próximo día con ese índice (hoy si es hoy). */
function proximo(indice, hoy) {
  const delta = (indice - indiceDia(hoy) + 7) % 7;
  return sumarDias(hoy, delta);
}

const entre = (desde, hasta) => {
  const out = [];
  for (let d = desde; d <= hasta && out.length < 14; d = sumarDias(d, 1)) out.push(d);
  return out;
};

/**
 * @param {{ cuando?: string, dia?: string, hasta?: string, semana?: "esta" | "siguiente" }} x
 *   lo que sacó el enrutador; con semana = siguiente, «el jueves» es el de la
 *   semana que viene aunque aún quede jueves en esta.
 * @param {string} hoy  ISO, con la fecha de España
 * @returns {string[] | null}  días ISO en orden, o null si no se entiende
 */
export function fechasDe({ cuando, dia, hasta, semana } = {}, hoy) {
  const c = normal(cuando).replace(/\s+/g, "_");
  const domingoDe = (iso) => sumarDias(iso, 6 - indiceDia(iso));
  switch (c) {
    case "hoy": return [hoy];
    case "manana": return [sumarDias(hoy, 1)];
    case "pasado_manana": return [sumarDias(hoy, 2)];
    case "dia": {
      const i = indiceDeNombre(dia, hoy);
      if (i == null) return null;
      if (semana === "siguiente") return [sumarDias(sumarDias(hoy, 7 - indiceDia(hoy)), i)];
      return [proximo(i, hoy)];
    }
    case "finde": {
      const i = indiceDia(hoy);
      if (i === 6) return [hoy];
      if (i === 5) return [hoy, sumarDias(hoy, 1)];
      const sabado = sumarDias(hoy, 5 - i);
      return [sabado, sumarDias(sabado, 1)];
    }
    case "finde_que_viene": {
      const i = indiceDia(hoy);
      const sabado = i >= 5 ? sumarDias(hoy, 12 - i) : sumarDias(hoy, 5 - i);
      return [sabado, sumarDias(sabado, 1)];
    }
    case "esta_semana": return entre(hoy, domingoDe(hoy));
    case "semana_que_viene": {
      const lunes = sumarDias(hoy, 7 - indiceDia(hoy));
      return entre(lunes, sumarDias(lunes, 6));
    }
    case "rango": {
      const i = indiceDeNombre(dia, hoy);
      const j = indiceDeNombre(hasta, hoy);
      if (i == null || j == null) return null;
      const desde = semana === "siguiente" ? sumarDias(sumarDias(hoy, 7 - indiceDia(hoy)), i) : proximo(i, hoy);
      const fin = sumarDias(desde, (j - i + 7) % 7);
      return entre(desde, fin);
    }
    default: return null;
  }
}
