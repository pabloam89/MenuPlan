/**
 * Desayuno, merienda y postre: las comidas de fuera del menú de comida y cena
 * (`data.extraMeals`), con sus valores en un solo sitio. Las pinta el asistente
 * de la app (Onboarding.jsx, con su foto y su etiqueta), las apunta Lola
 * (ajustar_extras) y las lee el motor (aiPlanner.js, postres.js).
 *
 *  - desayuno: off · variado (uno distinto cada día) · findes (igual entre
 *    semana, otro el finde) · igual (siempre el mismo).
 *  - merienda (solo si hay niños): off · semana (los 7 días) · laborables (L–V).
 *  - postre: off · comida · cena · ambas.
 *  - postreTipo: inmediato (sin cocinar) · cazo (cremas) · horno (horneados).
 *  - postreInmediato (si es sin cocinar): fruta · yogur · mix (alterna).
 *
 * Las franjas con sobre (plan fichas con estado, trozo 19; migración 0132): desayuno, merienda y postre no se
 * guardan en el documento, sino en un dato por franja con ámbito día (un sobre por día que la tiene: desayunoDias,
 * meriendaDias, postreDias) y desayunoRepite. `data.extraMeals` es su vista, en la forma que leen la app, Lola y el
 * motor: extrasConFranjas la monta al leer la casa y franjasParaGuardar saca de ella las franjas al guardar. En el
 * documento solo quedan postreTipo y postreInmediato. Sin la 0132 (la casa no trae las franjas), todo sigue en el
 * documento, como antes.
 */
import { POSTRE_TIPOS, POSTRE_INMEDIATO_KINDS } from "./postres.js";
import { DIAS, REPITES_DESAYUNO, POSTRES_EN } from "./vocabularios.js";

const OFF = "off";

export const EXTRAS = Object.freeze({
  desayuno: [OFF, ...REPITES_DESAYUNO],
  merienda: [OFF, "semana", "laborables"],
  postre: [OFF, ...POSTRES_EN],
  postreTipo: POSTRE_TIPOS.map((t) => t.id),
  postreInmediato: POSTRE_INMEDIATO_KINDS.map((k) => k.id),
});

/** Lo de una casa nueva: nada fuera de comida y cena. */
export const EXTRAS_POR_DEFECTO = Object.freeze({ desayuno: OFF, merienda: OFF, postre: OFF, postreTipo: "inmediato", postreInmediato: "mix" });

/** `extraMeals` con los cambios que estén en su lista; lo demás, como estaba. */
export function conExtras(extraMeals, cambios = {}) {
  const out = { ...EXTRAS_POR_DEFECTO, ...(extraMeals ?? {}) };
  for (const [k, v] of Object.entries(cambios)) if (EXTRAS[k]?.includes(v)) out[k] = v;
  return out;
}

/** Los datos con sobre de las franjas (registroFicha.js, 0132): los de cada día, por franja, y cómo se repite el desayuno. */
export const CAMPOS_FRANJAS = Object.freeze(["desayunoDias", "desayunoRepite", "meriendaDias", "postreDias"]);
/** Las tres de extraMeals que son la vista de las franjas; las otras dos siguen en el documento. */
const DE_LAS_FRANJAS = Object.freeze(["desayuno", "merienda", "postre"]);
const LABORABLES = DIAS.slice(0, 5);

/** Una vista que las franjas dicen y extraMeals no sabe decir (unos días sueltos): no se adivina, se dice. */
export class FranjasSinVista extends Error {
  constructor(motivo) {
    super(`las franjas no caben en extraMeals: ${motivo}`);
    this.name = "FranjasSinVista";
  }
}

const cada = (dias, valor) => Object.fromEntries(dias.map((d) => [d, valor]));
const diasCon = (mapa) => DIAS.filter((d) => mapa?.[d] != null && mapa[d] !== false);
const mismos = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * Pura. Las franjas de una vista de extraMeals: los días de cada una (rutina.js: un mapa por día, sin los que no la
 * tienen) y cómo se repite el desayuno. Con el desayuno apagado, desayunoRepite se queda como estaba (`antes`).
 */
export function franjasDeExtras(extraMeals, antes = {}) {
  const e = conExtras(extraMeals);
  return {
    desayunoDias: e.desayuno === OFF ? {} : cada(DIAS, true),
    desayunoRepite: e.desayuno === OFF ? antes.desayunoRepite ?? null : e.desayuno,
    meriendaDias: e.merienda === OFF ? {} : cada(e.merienda === "laborables" ? LABORABLES : DIAS, true),
    postreDias: e.postre === OFF ? {} : cada(DIAS, e.postre),
  };
}

/**
 * Pura. La vista (desayuno, merienda y postre de extraMeals) de las franjas. Lanza FranjasSinVista con unos días que
 * sus valores no saben decir (un postre solo el finde): el día que se puedan decir, se dirá aquí.
 */
export function extrasDeFranjas(f) {
  const desayuno = diasCon(f.desayunoDias);
  const merienda = diasCon(f.meriendaDias);
  const postre = diasCon(f.postreDias);
  const postreEn = [...new Set(postre.map((d) => f.postreDias[d]))];
  if (desayuno.length && desayuno.length !== DIAS.length) throw new FranjasSinVista(`desayuno solo ${desayuno.join(", ")}`);
  if (merienda.length && !mismos(merienda, DIAS) && !mismos(merienda, LABORABLES)) throw new FranjasSinVista(`merienda solo ${merienda.join(", ")}`);
  if (postre.length && (postre.length !== DIAS.length || postreEn.length !== 1)) throw new FranjasSinVista(`postre ${postre.map((d) => `${d} ${f.postreDias[d]}`).join(", ")}`);
  return {
    desayuno: desayuno.length ? f.desayunoRepite ?? REPITES_DESAYUNO[0] : OFF,
    merienda: !merienda.length ? OFF : merienda.length === DIAS.length ? "semana" : "laborables",
    postre: postre.length ? postreEn[0] : OFF,
  };
}

/** Pura. ¿Trae `data` las franjas con sobre (la casa las leyó de ficha_casa)? Sin la 0132, no: siguen en el documento. */
export const conFranjas = (data) => CAMPOS_FRANJAS.every((c) => Object.hasOwn(data ?? {}, c));

/** Pura. extraMeals sin la vista de las franjas: lo que de él va al documento. */
const soloDelDocumento = (extraMeals) => Object.fromEntries(Object.entries(extraMeals ?? {}).filter(([k]) => !DE_LAS_FRANJAS.includes(k)));

/** Pura. La casa leída con extraMeals como vista de sus franjas (lo que el documento guarde de ellas no se lee). Sin franjas, como estaba. */
export function extrasConFranjas(data) {
  if (!conFranjas(data)) return data;
  return { ...data, extraMeals: { ...soloDelDocumento(data.extraMeals), ...extrasDeFranjas(data) } };
}

/**
 * Pura. La casa para guardar: si la vista cambió respecto a sus franjas (alguien tocó extraMeals), las franjas salen
 * de la vista; si no, quedan como se leyeron. extraMeals, sin la vista: no va al documento (y sin nada más, no va).
 * Sin franjas, o sin extraMeals (un escritor que no lo trae), como estaba.
 */
export function franjasParaGuardar(data) {
  if (!conFranjas(data) || !data.extraMeals) return data;
  const vista = extrasDeFranjas(data);
  const e = conExtras(data.extraMeals);
  const cambia = DE_LAS_FRANJAS.some((k) => e[k] !== vista[k]);
  const { extraMeals, ...resto } = { ...data, ...(cambia ? franjasDeExtras(e, data) : {}) };
  const delDocumento = soloDelDocumento(extraMeals);
  return Object.keys(delDocumento).length ? { ...resto, extraMeals: delDocumento } : resto;
}
