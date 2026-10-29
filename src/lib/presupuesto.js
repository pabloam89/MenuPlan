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
// con precio es «con precio»; si le falta alguna, «incompleto»; si no tiene
// fila, «sin precio». De la semana salen dos números: el MÍNIMO (solo lo que
// tiene precio) y el ALTO, donde a cada incompleto se le sube el precio en
// proporción a las líneas que le faltan (3 € con el 75 % de las líneas son 4
// €; con menos de la mitad, el doble). Si el mínimo ya pasa del presupuesto,
// no cabe seguro. Solo se dice «cabe» si el alto cabe y casi todo tiene algo
// de precio; si no, «incierto».
//
// Medido el 29 oct 2026 (npm run medir:presupuesto): de los 743 platos
// estrella, 452 (60,8 %) tienen precio en todas sus líneas y 690 (92,9 %) en
// el 80 % o más. Lo que más falta es menor (cebolleta, cebolla morada, aceite
// de sésamo), por eso el alto se sube por líneas y no se da por perdido.

import { costeReceta } from "./coste.js";
import { recetaEnGrupo } from "./ids.js";

// Vocabulario cerrado del veredicto (presupuesto.test.js).
export const VEREDICTOS = Object.freeze(["cabe", "no_cabe", "incierto"]);

// Cómo está el presupuesto de la casa. `sin_cifra`: el interruptor está
// puesto pero `budget` no es un número positivo. No se aplica y SE DICE.
export const ESTADOS_PRESUPUESTO = Object.freeze(["sin", "activo", "sin_cifra"]);

// Para decir «cabe», al menos esta parte de las raciones de la semana tiene
// que tener algún precio (completo o incompleto). Por debajo, lo que no tiene
// ninguno podría ser lo caro.
export const PARTE_CONOCIDA_MINIMA = 0.8;

// El precio para ORDENAR y para el número alto de un plato incompleto: su
// precio subido en proporción a las líneas que le faltan, como mucho el doble.
// Lo usa también el solver (lib/solver.js).
export function precioAlto(p) {
  if (!p) return null;
  return p.completo ? p.porRacion : p.porRacion / Math.max(p.cobertura, 0.5);
}

const positivo = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const euros = (v) => Math.round(v * 100) / 100;

/**
 * @param {object} data household_state.data
 * @returns {{ estado: "sin"|"activo"|"sin_cifra", euros: number|null }}
 */
export function leerPresupuesto(data) {
  if (!data?.hasBudget) return { estado: "sin", euros: null };
  const b = positivo(data.budget);
  return b == null ? { estado: "sin_cifra", euros: null } : { estado: "activo", euros: b };
}

/** Los € por semana que se aplican, o null (sin presupuesto o sin cifra). */
export function presupuestoSemanal(data) {
  return leerPresupuesto(data).euros;
}

/**
 * El tope de € por ración que el solver usa como preferencia: el presupuesto
 * repartido entre las raciones de comida y cena de la semana. Las raciones de
 * desayunos, meriendas y postres no entran (no los elige el solver), así que
 * el tope es algo generoso; el veredicto de después sí las cuenta todas.
 */
export function topePorRacion(presupuesto, raciones) {
  const p = positivo(presupuesto);
  const r = positivo(raciones);
  return p != null && r != null ? p / r : null;
}

// «grupo__carnes_007» → «carnes_007»: el plan lleva el id con prefijo de grupo.
const idDeCatalogo = (id) => recetaEnGrupo.leer(id).receta;

/**
 * El € por ración de un plato del catálogo (modo granel), con la parte de sus
 * líneas que tiene precio.
 * @returns {{ porRacion: number, cobertura: number, completo: boolean } | null} null: sin precio.
 */
export function precioDePlato(recipeId) {
  if (!recipeId) return null;
  const c = costeReceta({ id: idDeCatalogo(recipeId) }, { modo: "granel" });
  if (!c || c.porRacion == null) return null;
  const cobertura = Number.isFinite(c.cobertura) ? c.cobertura : 0;
  return { porRacion: c.porRacion, cobertura, completo: cobertura >= 1 };
}

/**
 * El coste estimado de una semana del plan, a granel.
 * @param {object} plan `{ _warnings, [grupo]: { "Lun-Comida": hueco } }`
 * @param {{ recetas?: object[] }} [o] las recetas del menú, para ver si un
 *   plato lleva guarnición o salsa añadida (su precio no está en la tabla).
 * @returns {{ euros: number, eurosAlto: number, raciones: number, conPrecio: number,
 *   incompletas: number, sinPrecio: number, platosSinPrecio: string[],
 *   huecosSinRaciones: number }}
 *   Las tres cuentas son RACIONES. `euros` es el mínimo y `eurosAlto` el
 *   alto (ver arriba); lo sin precio no entra en ninguno de los dos.
 *   `huecosSinRaciones`: huecos con plato pero sin raciones ni comensales;
 *   no se pueden sumar, y por eso el veredicto no dirá «cabe».
 */
export function estimarSemana(plan, { recetas = [] } = {}) {
  const porId = new Map((recetas ?? []).filter((r) => r?.id).map((r) => [r.id, r]));
  let total = 0;
  let alto = 0;
  let raciones = 0;
  let conPrecio = 0;
  let incompletas = 0;
  let sinPrecio = 0;
  let huecosSinRaciones = 0;
  const platosSinPrecio = new Set();
  for (const [gid, huecos] of Object.entries(plan ?? {})) {
    if (gid.startsWith("_") || !huecos || typeof huecos !== "object") continue;
    for (const h of Object.values(huecos)) {
      if (!h || typeof h !== "object") continue;
      // Lo del congelador o la nevera ya está hecho y pagado.
      if (h.fromFreezer || h.fromFridge) continue;
      const n = positivo(h.raciones) ?? positivo(h.eaters);
      if (n == null) {
        if (h.recipeId || h.firstRecipeId) huecosSinRaciones++;
        continue;
      }
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
        // Con guarnición o salsa añadida, lo añadido no está en la tabla: el
        // alto lo cuenta como un plato al que le falta la mitad.
        alto += (anadido ? precioAlto({ ...p, completo: false, cobertura: Math.min(p.cobertura, 0.5) }) : precioAlto(p)) * n;
        if (p.completo && !anadido) conPrecio += n;
        else incompletas += n;
      }
    }
  }
  return { euros: euros(total), eurosAlto: euros(alto), raciones, conPrecio, incompletas, sinPrecio, platosSinPrecio: [...platosSinPrecio], huecosSinRaciones };
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
  if (est.huecosSinRaciones > 0) return "incierto";
  const conAlgo = (est.raciones - est.sinPrecio) / est.raciones;
  return est.eurosAlto <= presupuesto && conAlgo >= PARTE_CONOCIDA_MINIMA ? "cabe" : "incierto";
}

const fmt = (v) => `${Math.round(v)} €`;

/**
 * La frase para la persona (Lola y la app la dicen tal cual). Lee el
 * presupuesto de `data` (leerPresupuesto). null si la casa no tiene
 * presupuesto; con el interruptor puesto y sin cifra, lo dice.
 */
export function frasePresupuesto(data, est) {
  const { estado, euros: presupuesto } = leerPresupuesto(data);
  if (estado === "sin") return null;
  if (estado === "sin_cifra") return "El presupuesto está activado pero sin una cifra válida, así que no lo he tenido en cuenta: dime cuánto queréis gastar a la semana.";
  const v = veredicto(presupuesto, est);
  // Con presupuesto y sin un solo plato que contar, también se dice.
  if (!v) return `Tenéis un presupuesto de ${fmt(presupuesto)}, pero en esta semana no hay platos que pueda contar.`;
  const sinSaber = est.raciones - est.conPrecio;
  const parte = est.sinPrecio > 0
    ? ` (el ${Math.max(1, Math.round((est.sinPrecio / est.raciones) * 100))} % de las raciones no tiene precio)`
    : "";
  const huecos = est.huecosSinRaciones > 0 ? ` y ${est.huecosSinRaciones} comida(s) sin saber cuántos comen` : "";
  const cuanto = Math.round(est.eurosAlto) > Math.round(est.euros)
    ? `entre ${Math.round(est.euros)} y ${fmt(est.eurosAlto)}`
    : `${sinSaber > 0 || est.sinPrecio > 0 || huecos ? "al menos" : "unos"} ${fmt(est.euros)}`;
  const base = `La comida de la semana sale por ${cuanto} a precio de Mercadona por kilo${parte}${huecos}`;
  if (v === "no_cabe") return `${base}: no cabe en el presupuesto de ${fmt(presupuesto)}.`;
  if (v === "incierto") return `${base}: con lo que falta no puedo asegurar que quepa en el presupuesto de ${fmt(presupuesto)}.`;
  return `${base}: cabe en el presupuesto de ${fmt(presupuesto)}.`;
}
