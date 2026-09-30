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
import { motor } from "./menu.js";
import { duenoDe } from "./embudo.js";

const MAX_POR_VEZ = 40;

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
 * @param {{ nombre: string, cantidad?: number, unidad?: string, congelado?: boolean }[]} items
 * @param {"foto" | "texto"} origen
 */
export async function anadirDespensa(householdId, items, origen = "texto") {
  const dueno = await duenoDe(householdId);
  if (!dueno) return "No encuentro quién gestiona esta casa.";
  const m = await motor();
  const lista = (items ?? []).filter((it) => String(it?.nombre ?? "").trim()).slice(0, MAX_POR_VEZ);
  if (!lista.length) return "No hay nada que apuntar.";

  const entradas = lista.map((it) => {
    const nombre = String(it.nombre).trim();
    const n = m.normalizePantryInput(nombre)[0];
    const normalized = n?.ambiguous ? n.candidates[0].normalized : n?.normalized;
    return { nombre, normalized: normalized || nombre.toLowerCase(), frozen: Boolean(it.congelado), ...aStock(it.cantidad, it.unidad) };
  });

  const claves = [...new Set(entradas.map((e) => e.normalized))];
  const existentes = await select(
    "user_pantry",
    `household_id=${eq(householdId)}&item_type=eq.ingredient&ingredient_normalized=in.(${claves.map((k) => `"${k.replace(/"/g, "")}"`).map(encodeURIComponent).join(",")})`,
    "id,ingredient_normalized,qty,unit,frozen",
  );
  const clave = (n, f) => `${n}|${f ? 1 : 0}`;
  const porClave = new Map(existentes.map((r) => [clave(r.ingredient_normalized, r.frozen), r]));

  const nuevas = new Map();
  const sumadas = [];
  for (const e of entradas) {
    const k = clave(e.normalized, e.frozen);
    const fila = porClave.get(k);
    if (fila) {
      const extra = fila.unit === e.unit ? e.qty : m.convertStockAmount(e.qty, e.unit, fila.unit, e.nombre);
      if (extra == null) continue; // g↔ml sin densidad: mejor no mezclar
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
        ingredient_id: m.resolveIngredientId(e.nombre) ?? null,
      });
    }
  }

  if (nuevas.size) await insert("user_pantry", [...nuevas.values()]);
  for (const f of new Map(sumadas.map((f) => [f.id, f])).values()) {
    await update("user_pantry", `id=${eq(f.id)}`, { qty: f.qty });
  }
  const total = nuevas.size + new Set(sumadas.map((f) => f.id)).size;
  return `Despensa: ${nuevas.size} alimentos nuevos${sumadas.length ? ` y ${new Set(sumadas.map((f) => f.id)).size} sumados a lo que ya había` : ""} (${total} en total). La compra del próximo menú lo tiene en cuenta.`;
}
