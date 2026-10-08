/**
 * Los días de la semana y las claves de hueco, en un solo sitio.
 *
 * La clave canónica de un día es la de vocabularios.js (`DIAS`: «Lun»…«Dom»,
 * en NFC; la misma que el CHECK de 0086 y que `DAYS` de planner.js). Antes la
 * lista estaba copiada en una docena de sitios, con slugs («lun»), nombres
 * largos, letras, versiones que empiezan en domingo y quince maneras de sacar
 * el día de una fecha. Aquí van todas las formas, derivadas de `DIAS`; las
 * copias que quedan están congeladas en dias.guard.test.js y solo pueden bajar.
 *
 * Semana de lunes a domingo: índice 0 = lunes … 6 = domingo.
 *
 * Sin dependencias pesadas: lo importan la app, el motor y el bot (api/,
 * directo, sin cargar core.mjs).
 */
import { DIAS, COMIDAS } from "./vocabularios.js";
import { huecoPlan } from "./ids.js";

export { DIAS, COMIDAS, huecoPlan };

/** De lunes a viernes. */
export const DIAS_LABORABLES = Object.freeze(DIAS.slice(0, 5));
/** Sábado y domingo. */
export const DIAS_FINDE = Object.freeze(DIAS.slice(5));

/** Nombre entero de cada día, en el orden de DIAS. */
export const NOMBRES_DIA = Object.freeze(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
/** Una letra por día (el miércoles es la X), en el orden de DIAS. */
export const LETRAS_DIA = Object.freeze(["L", "M", "X", "J", "V", "S", "D"]);
/** El día en los ids del motor («lun_comida_1»): minúsculas y sin tildes. */
export const SLUGS_DIA = Object.freeze(DIAS.map((d) => d.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()));

const porDia = (lista) => Object.freeze(Object.fromEntries(DIAS.map((d, i) => [d, lista[i]])));
/** «Mié» → «Miércoles». */
export const DIA_LARGO = porDia(NOMBRES_DIA);
/** «Mié» → «miércoles». */
export const DIA_LARGO_MINUSCULAS = porDia(NOMBRES_DIA.map((n) => n.toLowerCase()));
/** «Mié» → «X». */
export const DIA_LETRA = porDia(LETRAS_DIA);
/** «Mié» → «mie». */
export const DIA_SLUG = porDia(SLUGS_DIA);

// ── De una fecha a su día ───────────────────────────────────────────────────

/** 0 = lunes … 6 = domingo, con la hora local (getDay). */
export const indiceDeFecha = (fecha) => (fecha.getDay() + 6) % 7;
/** 0 = lunes … 6 = domingo, en UTC (getUTCDay). */
export const indiceDeFechaUTC = (fecha) => (fecha.getUTCDay() + 6) % 7;
/** De «AAAA-MM-DD»: se lee a mediodía UTC, así no lo mueve ningún huso. */
export const indiceDeISO = (iso) => indiceDeFechaUTC(new Date(`${iso}T12:00:00Z`));
/** El día («Jue») de una fecha, con la hora local. */
export const diaDeFecha = (fecha) => DIAS[indiceDeFecha(fecha)];
/** El día («Jue») de una fecha, en UTC. */
export const diaDeFechaUTC = (fecha) => DIAS[indiceDeFechaUTC(fecha)];
/** El día («Jue») de una fecha «AAAA-MM-DD». */
export const diaDeISO = (iso) => DIAS[indiceDeISO(iso)];

// ── Entre formas del día ────────────────────────────────────────────────────

/** «Mié» → 2; -1 si no es un día. */
export const indiceDeDia = (dia) => DIAS.indexOf(dia);
/** 2 → «Mié»; null si se sale de la semana. */
export const diaDeIndice = (i) => DIAS[i] ?? null;
/** «Mié» → «mie»; null si no es un día. */
export const slugDeDia = (dia) => DIA_SLUG[dia] ?? null;
/** «mie» → «Mié»; null si no es un slug. */
export const diaDeSlug = (slug) => {
  const i = SLUGS_DIA.indexOf(slug);
  return i < 0 ? null : DIAS[i];
};
/** «Mié» → «Miércoles» (o «miércoles»); lo que no es un día sale tal cual. */
export const nombreDia = (dia, { minusculas = false } = {}) => {
  const n = DIA_LARGO[dia];
  if (!n) return dia;
  return minusculas ? DIA_LARGO_MINUSCULAS[dia] : n;
};
/** De lunes a viernes. */
export const esLaborable = (dia) => DIAS_LABORABLES.includes(dia);

// ── Comida del plan ↔ mealType del motor ────────────────────────────────────

/**
 * «Cena» → «cena»; cualquier otra → «comida». El motor de comida y cena solo
 * conoce esos dos tipos (las comidas extra van por otro lado).
 */
export const tipoDeComida = (comida) => (String(comida ?? "").toLowerCase() === "cena" ? "cena" : "comida");
/** «cena» → «Cena»; cualquier otro → «Comida». */
export const comidaDeTipo = (tipo) => (tipo === "cena" ? "Cena" : "Comida");

// ── Hueco del motor: «lun_comida_1», «lun_cena» ─────────────────────────────

/**
 * El id de un hueco en el motor: `<slug>_<tipo>[_<posición>]`. La posición es
 * «1» (primero) o «2» (segundo); la cena de un plato no lleva. Ni los slugs ni
 * los tipos llevan «_».
 */
export const huecoMotor = Object.freeze({
  formatear: (dia, tipo, posicion = null) =>
    `${DIA_SLUG[dia] ?? dia}_${tipo}${posicion == null || posicion === "" ? "" : `_${posicion}`}`,
  leer: (x) => {
    const [slug, tipo, posicion] = String(x ?? "").split("_");
    const dia = diaDeSlug(slug);
    if (!dia || !tipo) return null;
    return { dia, slug, tipo, posicion: posicion ?? null };
  },
  /** «jue_cena_1» → «Jue-Cena» (la clave del plan); null si no se lee. */
  aPlan: (x) => {
    const h = huecoMotor.leer(x);
    return h ? huecoPlan.formatear(h.dia, comidaDeTipo(h.tipo)) : null;
  },
});
