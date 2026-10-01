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

export const CUANDOS = ["hoy", "manana", "pasado_manana", "dia", "finde", "finde_que_viene", "esta_semana", "semana_que_viene", "rango"];

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const LARGOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 0 = lunes … 6 = domingo */
export const indiceDia = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
export const diaDeFecha = (iso) => DIAS[indiceDia(iso)];

/** «jueves», «el jueves», «Jue», «mañana» → índice 0-6 del día de la semana, o null. */
function indiceDeNombre(texto, hoy) {
  const t = normal(texto).replace(/^(el|la|los|las)\s+/, "");
  if (!t) return null;
  if (t === "hoy") return indiceDia(hoy);
  if (t === "manana") return indiceDia(sumarDias(hoy, 1));
  const i = LARGOS.findIndex((d) => d === t || d.slice(0, 3) === t.slice(0, 3));
  return i === -1 ? null : i;
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
 * @param {{ cuando?: string, dia?: string, hasta?: string }} x  lo que sacó el enrutador
 * @param {string} hoy  ISO, con la fecha de España
 * @returns {string[] | null}  días ISO en orden, o null si no se entiende
 */
export function fechasDe({ cuando, dia, hasta } = {}, hoy) {
  const c = normal(cuando).replace(/\s+/g, "_");
  const domingoDe = (iso) => sumarDias(iso, 6 - indiceDia(iso));
  switch (c) {
    case "hoy": return [hoy];
    case "manana": return [sumarDias(hoy, 1)];
    case "pasado_manana": return [sumarDias(hoy, 2)];
    case "dia": {
      const i = indiceDeNombre(dia, hoy);
      return i == null ? null : [proximo(i, hoy)];
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
      const desde = proximo(i, hoy);
      const fin = sumarDias(desde, (j - i + 7) % 7);
      return entre(desde, fin);
    }
    default: return null;
  }
}
