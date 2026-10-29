// El presupuesto semanal de la casa, en UN sitio (#958; Pablo, 29 oct 2026).
//
// El dato vive en household_state.data: `hasBudget` (si hay tope) y `budget`
// (€ por semana). Lo escriben el asistente de la app (Onboarding.jsx) y Lola
// (ajustar_compra, api/_bot/ajustes.js). Lo LEE solo este módulo
// (presupuestoSemanal): el motor, la respuesta de Lola, la ficha del bot y la
// lista de la compra de la app pasan por aquí, para que no haya dos lecturas
// que digan cosas distintas.
//
// Qué hace el presupuesto, y nada más:
//  1. El solver (lib/solver.js, `topeRacion`) prefiere platos cuyo € por
//     ración cabe en el tope. Es una preferencia: el reparto de la semana
//     (pescado, legumbre…) sigue mandando por encima.
//  2. Al acabar, la semana se estima (estimarSemana) y se dice si cabe, si no
//     cabe o si no se puede saber (veredicto). Nunca en silencio.
//  3. La lista de la compra de la app pone su total (envases enteros) al lado
//     del presupuesto.
//
// El número de la semana es el modo 'granel' de lib/coste.js: lo que se COME
// a precio por kilo de Mercadona. No es el ticket: el ticket cuenta envases
// enteros y lo que falta en la despensa, y eso lo dice la lista de la compra
// (lib/listPricing.js). Por eso los dos números no coinciden y no deben.
//
// Lo que no tiene precio NO cuenta como 0 €. Un plato con todas sus líneas
// con precio es «con precio»; si le falta alguna, «incompleto» (su número es
// un mínimo); si no tiene fila, «sin precio». La suma es un MÍNIMO de la
// semana: si ese mínimo ya pasa del presupuesto, no cabe seguro; si no lo
// pasa pero hay mucho sin saber, el veredicto es «incierto», no «cabe».

import { costeReceta } from "./coste.js";

// Vocabulario cerrado del veredicto (presupuesto.test.js).
export const VEREDICTOS = Object.freeze(["cabe", "no_cabe", "incierto"]);

// Para decir «cabe», al menos esta parte de las raciones de la semana tiene
// que tener su precio entero. Por debajo, lo que falta podría ser lo caro.
export const PARTE_CONOCIDA_MINIMA = 0.8;

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const euros = (v) => Math.round(v * 100) / 100;

/**
 * El presupuesto de la casa en € por semana, o null si no hay.
 * @param {object} data household_state.data
 * @returns {number|null}
 */
export function presupuestoSemanal(data) {
  if (!data?.hasBudget) return null;
  const b = num(data.budget);
  return b != null && b > 0 ? b : null;
}

/**
 * El tope de € por ración que el solver usa como preferencia: el presupuesto
 * repartido entre las raciones de comida y cena de la semana. Las raciones de
 * desayunos, meriendas y postres no entran (no los elige el solver), así que
 * el tope es algo generoso; el veredicto de después sí las cuenta todas.
 */
export function topePorRacion(presupuesto, raciones) {
  const p = num(presupuesto);
  const r = num(raciones);
  return p != null && p > 0 && r != null && r > 0 ? p / r : null;
}

// «grupo__carnes_007» → «carnes_007»: el plan lleva el id con prefijo de grupo.
const idDeCatalogo = (id) => (String(id).includes("__") ? String(id).split("__").slice(1).join("__") : String(id));

/**
 * El € por ración de un plato del catálogo (modo granel) y si está completo.
 * @returns {{ porRacion: number, completo: boolean } | null} null: sin precio.
 */
export function precioDePlato(recipeId) {
  if (!recipeId) return null;
  const c = costeReceta({ id: idDeCatalogo(recipeId) }, { modo: "granel" });
  if (!c || c.porRacion == null) return null;
  return { porRacion: c.porRacion, completo: c.cobertura != null && c.cobertura >= 1 };
}

/**
 * El coste estimado de una semana del plan, a granel.
 * @param {object} plan `{ _warnings, [grupo]: { "Lun-Comida": hueco } }`
 * @param {{ recetas?: object[] }} [o] las recetas del menú, para ver si un
 *   plato lleva guarnición o salsa añadida (su precio no está en la tabla).
 * @returns {{ euros: number, raciones: number, conPrecio: number,
 *   incompletas: number, sinPrecio: number, platosSinPrecio: string[] }}
 *   Las tres cuentas son RACIONES. `euros` es un mínimo (ver arriba).
 */
export function estimarSemana(plan, { recetas = [] } = {}) {
  const porId = new Map((recetas ?? []).filter((r) => r?.id).map((r) => [r.id, r]));
  let total = 0;
  let raciones = 0;
  let conPrecio = 0;
  let incompletas = 0;
  let sinPrecio = 0;
  const platosSinPrecio = new Set();
  for (const [gid, huecos] of Object.entries(plan ?? {})) {
    if (gid.startsWith("_") || !huecos || typeof huecos !== "object") continue;
    for (const h of Object.values(huecos)) {
      if (!h || typeof h !== "object") continue;
      // Lo del congelador o la nevera ya está hecho y pagado.
      if (h.fromFreezer || h.fromFridge) continue;
      const n = num(h.raciones) || num(h.eaters) || 0;
      if (!(n > 0)) continue;
      for (const id of [h.firstRecipeId, h.recipeId]) {
        if (!id) continue;
        raciones += n;
        const p = precioDePlato(id);
        const receta = porId.get(id);
        const anadido = !!(receta?.garnishId || receta?.sauceId);
        if (!p) {
          sinPrecio += n;
          platosSinPrecio.add(receta?.name ?? idDeCatalogo(id));
          continue;
        }
        total += p.porRacion * n;
        if (p.completo && !anadido) conPrecio += n;
        else incompletas += n;
      }
    }
  }
  return { euros: euros(total), raciones, conPrecio, incompletas, sinPrecio, platosSinPrecio: [...platosSinPrecio] };
}

/**
 * @param {number|null} presupuesto
 * @param {ReturnType<typeof estimarSemana>} est
 * @returns {"cabe"|"no_cabe"|"incierto"|null} null sin presupuesto o sin platos.
 */
export function veredicto(presupuesto, est) {
  if (presupuesto == null || !est || !(est.raciones > 0)) return null;
  // El mínimo ya se pasa: no cabe, falte lo que falte.
  if (est.euros > presupuesto) return "no_cabe";
  return est.conPrecio / est.raciones >= PARTE_CONOCIDA_MINIMA ? "cabe" : "incierto";
}

const fmt = (v) => `${Math.round(v)} €`;

/**
 * La frase para la persona (Lola y la app la dicen tal cual). null si no hay
 * presupuesto o no hay platos.
 */
export function frasePresupuesto(presupuesto, est) {
  const v = veredicto(presupuesto, est);
  if (!v) return null;
  const sinSaber = est.raciones - est.conPrecio;
  const parte = sinSaber > 0
    ? ` (el ${Math.max(1, Math.round((sinSaber / est.raciones) * 100))} % de las raciones lleva algo sin precio)`
    : "";
  const base = `La comida de la semana sale por ${sinSaber > 0 ? "al menos" : "unos"} ${fmt(est.euros)} a precio de Mercadona por kilo${parte}`;
  if (v === "no_cabe") return `${base}: no cabe en el presupuesto de ${fmt(presupuesto)}.`;
  if (v === "incierto") return `${base}: con tanto sin precio no puedo asegurar que quepa en el presupuesto de ${fmt(presupuesto)}.`;
  return `${base}: cabe en el presupuesto de ${fmt(presupuesto)}.`;
}
