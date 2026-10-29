/**
 * La despensa desde el chat: «tengo dos kilos de patatas», o la foto de un
 * ticket o de la nevera (el agente la lee y trae la lista).
 *
 * Escribe en `user_pantry` como `addPantryItems` de la app (src/lib/pantry.js):
 * nombre normalizado contra el catálogo (`normalizePantryInput`), unidades de
 * stock g/ml/ud, y si ya hay una fila del mismo alimento y el mismo estado de
 * congelado, SUMA en vez de duplicar (el índice único lo exige). La fila va a
 * nombre del dueño de la casa, que es de quien la app la lee.
 */

import { select, insert, update, eq } from "./db.js";
import { motor, normal } from "./menu.js";
import { duenoDe } from "./embudo.js";
import { resultado } from "./resultado.js";

// Lo que cabe en una llamada (el esquema de anadir_despensa dice lo mismo).
// Seis tickets son ~70 cosas: con 40 se cortaba la mitad sin decirlo (#958).
// Lo que pase de aquí no se tira: sale en el recibo como «sin hacer».
export const MAX_POR_VEZ = 150;
const TANDA_CONSULTA = 40;

/** kg y l a g y ml; lo demás, piezas. */
function aStock(cantidad, unidad) {
  const n = Number(cantidad) > 0 ? Number(cantidad) : 1;
  const u = String(unidad ?? "").toLowerCase();
  if (u === "kg") return { qty: n * 1000, unit: "g" };
  if (u === "l") return { qty: n * 1000, unit: "ml" };
  if (u === "g" || u === "ml") return { qty: n, unit: u };
  return { qty: n, unit: "ud" };
}

export async function verDespensa(householdId) {
  const m = await motor();
  const filas = await select("user_pantry", `household_id=${eq(householdId)}&order=created_at.asc`, m.COLUMNAS_DESPENSA);
  if (!filas.length) return "La despensa está vacía (o no se ha apuntado nada).";
  return filas.map(m.filaDeDespensa).map((p) => {
    const cant = p.itemType === "cooked_dish" ? `${p.portions ?? 1} raciones` : `${p.qty ?? ""} ${p.unit ?? ""}`.trim();
    return `- ${p.ingredientName}${cant ? ` — ${cant}` : ""}${p.frozen ? " (congelado)" : ""}`;
  }).join("\n");
}

/**
 * Cada cosa dicha, con su clave del catálogo. Si el nombre casa con VARIOS
 * alimentos («patatas fritas»: ¿de bolsa o de sartén?), no se elige uno a
 * ciegas: se guarda con el nombre tal cual lo escribieron y se dice la duda
 * (#958: dos tipos de patatas de bolsa acabaron sumadas al puré de patata).
 * Pura, con el motor de argumento, para el test.
 */
export function entradasDeDespensa(lista, m) {
  return lista.map((it) => {
    const nombre = String(it.nombre).trim();
    const n = m.normalizePantryInput(nombre)[0];
    const propio = normal(nombre);
    let normalized = n?.normalized;
    let duda = null;
    if (n?.ambiguous) {
      // Una de las candidatas es justo lo escrito: esa. Si no, tal cual.
      const igual = n.candidates.find((c) => normal(c.normalized) === propio);
      normalized = igual?.normalized ?? propio;
      if (!igual) duda = n.candidates.map((c) => c.label).filter(Boolean).slice(0, 3);
    }
    return { nombre, normalized: normalized || propio, frozen: Boolean(it.congelado), duda, ...aStock(it.cantidad, it.unidad) };
  });
}

/**
 * @param {{ nombre: string, cantidad?: number, unidad?: string, congelado?: boolean }[]} items
 * @param {"foto" | "texto"} origen
 * @returns {Promise<object|string>} un RESULTADO (resultado.js): lo apuntado y
 *   lo que no, con su porqué. Antes cortaba a 40 sin decirlo: de 66 cosas de
 *   seis tickets se guardaron 38 y Lola dijo «todo apuntado» (#958).
 */
export async function anadirDespensa(householdId, items, origen = "texto") {
  const dueno = await duenoDe(householdId);
  if (!dueno) return "No encuentro quién gestiona esta casa.";
  const m = await motor();
  const todas = (items ?? []).filter((it) => String(it?.nombre ?? "").trim());
  if (!todas.length) return "No hay nada que apuntar.";
  const lista = todas.slice(0, MAX_POR_VEZ);
  const sinHacer = todas.slice(MAX_POR_VEZ).map((it) => ({ que: String(it.nombre).trim(), motivo: `caben ${MAX_POR_VEZ} de una vez: que me mande el resto en otro mensaje` }));

  const entradas = entradasDeDespensa(lista, m);
  const claves = [...new Set(entradas.map((e) => e.normalized))];
  const existentes = [];
  // Por tandas: con cien claves la dirección de la consulta se haría enorme.
  for (let i = 0; i < claves.length; i += TANDA_CONSULTA) {
    const trozo = claves.slice(i, i + TANDA_CONSULTA);
    existentes.push(...await select(
      "user_pantry",
      `household_id=${eq(householdId)}&item_type=eq.ingredient&ingredient_normalized=in.(${trozo.map((k) => `"${k.replace(/"/g, "")}"`).map(encodeURIComponent).join(",")})`,
      "id,ingredient_normalized,qty,unit,frozen",
    ));
  }
  const clave = (n, f) => `${n}|${f ? 1 : 0}`;
  const porClave = new Map(existentes.map((r) => [clave(r.ingredient_normalized, r.frozen), r]));

  const nuevas = new Map();
  const sumadas = [];
  const hecho = [];
  for (const e of entradas) {
    const k = clave(e.normalized, e.frozen);
    const fila = porClave.get(k);
    if (fila) {
      const extra = fila.unit === e.unit ? e.qty : m.convertStockAmount(e.qty, e.unit, fila.unit, e.nombre);
      // g↔ml sin densidad: mejor no mezclar, y se dice.
      if (extra == null) { sinHacer.push({ que: e.nombre, motivo: "ya estaba apuntado en otra unidad y no sé sumarlo" }); continue; }
      fila.qty = (Number(fila.qty) || 0) + extra;
      sumadas.push(fila);
    } else if (nuevas.has(k)) {
      nuevas.get(k).qty += e.qty; // repetido en la misma foto
    } else {
      nuevas.set(k, {
        user_id: dueno, household_id: householdId,
        ingredient_name: e.nombre, ingredient_normalized: e.normalized,
        qty: e.qty, unit: e.unit, frozen: e.frozen, location: e.frozen ? "congelador" : null,
        item_type: "ingredient", source: origen === "foto" ? "photo" : "manual",
        ingredient_id: e.duda ? null : m.resolveIngredientId(e.nombre) ?? null,
      });
    }
    hecho.push(e.duda ? `${e.nombre} (tal cual: podía ser ${e.duda.join(" o ")})` : e.nombre);
  }

  if (nuevas.size) await insert("user_pantry", [...nuevas.values()]);
  for (const f of new Map(sumadas.map((f) => [f.id, f])).values()) {
    await update("user_pantry", `id=${eq(f.id)}`, { qty: f.qty });
  }
  const sumadasN = new Set(sumadas.map((f) => f.id)).size;
  return resultado({
    accion: "despensa", hecho, sinHacer,
    nota: `${nuevas.size} alimentos nuevos${sumadasN ? ` y ${sumadasN} sumados a lo que ya había` : ""}. La compra del próximo menú lo tiene en cuenta.`,
  });
}

