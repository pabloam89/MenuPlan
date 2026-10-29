/**
 * La despensa desde el chat: «tengo dos kilos de patatas», o la foto de un
 * ticket o de la nevera (el agente la lee y trae la lista).
 *
 * Escribe en `user_pantry` como `addPantryItems` de la app (src/lib/pantry.js):
 * nombre normalizado contra el catálogo (`normalizePantryInput`), unidades de
 * stock g/ml/ud, y si ya hay una fila del mismo alimento y el mismo estado de
 * congelado, SUMA en vez de duplicar (el índice único lo exige). La fila va a
 * nombre del dueño de la casa, que es de quien la app la lee.
 *
 * Con identidad (#958):
 *   · Las cantidades se suman en la MISMA unidad o convertidas; lo que no se
 *     puede convertir (g ↔ ml sin densidad, g ↔ ud sin peso por pieza) no se
 *     suma y se dice. Antes, «1 kg + 2 ud» de una misma foto daba 1002 g, y lo
 *     que no casaba con la fila de la base se saltaba en silencio.
 *   · Sumar es «la cantidad que leí + lo nuevo» solo si nadie la cambió entre
 *     medias (PATCH con la cantidad leída en el filtro); si cambió, se relee.
 *   · La misma lista dos veces seguidas (un doble «Sí») no suma dos veces.
 */

import { select, insert, update, eq } from "./db.js";
import { motor } from "./menu.js";
import { duenoDe } from "./embudo.js";
import { primeraVez, yaVista, esDuplicado } from "./entradas.js";
import { SIN_LEER } from "./avisar.js";
import { huella } from "./operacion.js";
import { CANAL } from "../../src/lib/vocabularios.js";
import { resultado } from "./resultado.js";

// Lo que cabe en una llamada; el esquema de anadir_despensa (agente.js) lo
// importa. Seis tickets son ~70 cosas: con 40 se cortaba el resto sin decirlo
// y Lola contestaba «todo apuntado» (#958). Lo que pase de aquí no se tira:
// sale en el recibo como «sin hacer».
export const MAX_POR_VEZ = 150;
// Cuántos nombres van en cada consulta de lo que ya hay: con 150 claves en una
// sola dirección la URL se haría de varios KB; 40 es lo que ya iba antes en
// una consulta.
export const TANDA_CONSULTA = 40;
const INTENTOS = 3;
// La misma lista en este rato es la misma orden repetida (un doble «Sí»).
export const VENTANA_REPETIDA_MS = 10 * 60 * 1000;

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

const clave = (n, f) => `${n}|${f ? 1 : 0}`;

/**
 * Qué hacer con cada entrada frente a lo que hay: filas nuevas, filas que
 * suman y lo que no se puede sumar (unidades que no se convierten). Pura.
 * @param {{ nombre: string, normalized: string, frozen: boolean, qty: number, unit: string }[]} entradas
 * @param {{ id: any, ingredient_normalized: string, qty: any, unit: string, frozen: boolean }[]} existentes
 * @param {(qty: number, de: string, a: string, nombre: string) => number|null} convertir
 */
export function planDespensa(entradas, existentes, convertir) {
  const porClave = new Map(existentes.map((r) => [clave(r.ingredient_normalized, r.frozen), { ...r, leida: r.qty, qty: Number(r.qty) || 0 }]));
  const nuevas = new Map();
  const sumadas = new Map();
  const sinSumar = [];
  for (const e of entradas) {
    const k = clave(e.normalized, e.frozen);
    const fila = porClave.get(k);
    const destino = fila ?? nuevas.get(k);
    if (!destino) {
      nuevas.set(k, { ...e });
      continue;
    }
    const extra = destino.unit === e.unit ? e.qty : convertir(e.qty, e.unit, destino.unit, e.nombre);
    if (extra == null) {
      sinSumar.push({ k, nombre: e.nombre, tiene: destino.unit, viene: e.unit });
      continue;
    }
    destino.qty += extra;
    if (fila) sumadas.set(fila.id, fila);
  }
  return { nuevas: [...nuevas.values()], sumadas: [...sumadas.values()], sinSumar };
}

const UNIDAD = { g: "gramos", ml: "mililitros", ud: "unidades" };

/**
 * @param {{ nombre: string, cantidad?: number, unidad?: string, congelado?: boolean }[]} items
 * @param {"foto" | "texto"} origen
 * @param {{ otraVez?: boolean }} [opciones]  otraVez: dicen que es OTRA compra igual
 */
export async function anadirDespensa(householdId, items, origen = "texto", { otraVez = false } = {}) {
  const dueno = await duenoDe(householdId);
  if (!dueno) return "No encuentro quién gestiona esta casa.";
  const m = await motor();
  const todas = (items ?? []).filter((it) => String(it?.nombre ?? "").trim());
  if (!todas.length) return "No hay nada que apuntar.";
  const lista = todas.slice(0, MAX_POR_VEZ);
  const sobran = todas.slice(MAX_POR_VEZ).map((it) => ({ que: String(it.nombre).trim(), motivo: `caben ${MAX_POR_VEZ} de una vez: mándame el resto en otro mensaje` }));

  const entradas = lista.map((it) => {
    const nombre = String(it.nombre).trim();
    const n = m.normalizePantryInput(nombre)[0];
    const normalized = n?.ambiguous ? n.candidates[0].normalized : n?.normalized;
    return { nombre, normalized: normalized || nombre.toLowerCase(), frozen: Boolean(it.congelado), ...aStock(it.cantidad, it.unidad) };
  });

  // La misma lista hace un momento: un doble «Sí» o un reintento. No suma
  // otra vez (antes duplicaba el stock). Por tramos de 10 min: se mira este y
  // el anterior.
  const firma = huella(entradas.map((e) => [e.normalized, e.frozen, e.qty, e.unit]).sort());
  const tramo = Math.floor(Date.now() / VENTANA_REPETIDA_MS);
  const llave = (t) => `despensa:${householdId}:${firma}:${t}`;
  if (!otraVez) {
    const vistas = [await yaVista(CANAL.TELEGRAM, llave(tramo)), await yaVista(CANAL.TELEGRAM, llave(tramo - 1))];
    if (vistas.includes(true)) {
      return "Eso ya lo apunté hace un momento (la misma lista): NO lo he sumado otra vez. Si de verdad es otra compra igual, que lo digan y vuelve a llamar con otra_vez = true.";
    }
    // Sin poder mirarlo no se suma a ciegas: un doble «Sí» duplicaría el stock.
    if (vistas.includes(SIN_LEER)) {
      return "NO GUARDADO: no he podido comprobar si esta lista ya estaba apuntada, y no la sumo a ciegas. Que lo pidan otra vez en un momento.";
    }
  }

  const claves = [...new Set(entradas.map((e) => e.normalized))];
  const filtro = (trozo) => `household_id=${eq(householdId)}&item_type=eq.ingredient&ingredient_normalized=in.(${trozo.map((k) => `"${k.replace(/"/g, "")}"`).map(encodeURIComponent).join(",")})`;
  const leerExistentes = async () => {
    const filas = [];
    for (let i = 0; i < claves.length; i += TANDA_CONSULTA) filas.push(...await select("user_pantry", filtro(claves.slice(i, i + TANDA_CONSULTA)), "id,ingredient_normalized,qty,unit,frozen"));
    return filas;
  };
  const hechas = { nuevas: [], sumadas: new Map(), sinSumar: [] };
  let pendientes = entradas;
  for (let i = 0; i < INTENTOS && pendientes.length; i++) {
    const plan = planDespensa(pendientes, await leerExistentes(), m.convertStockAmount);
    // Lo que hay que repetir porque otra escritura se cruzó: se relee y se suma.
    const repetir = new Set();
    if (plan.nuevas.length) {
      try {
        await insert("user_pantry", plan.nuevas.map((e) => ({
          user_id: dueno, household_id: householdId,
          ingredient_name: e.nombre, ingredient_normalized: e.normalized,
          qty: e.qty, unit: e.unit, frozen: e.frozen, location: e.frozen ? "congelador" : null,
          item_type: "ingredient", source: origen === "foto" ? "photo" : "manual",
          ingredient_id: m.resolveIngredientId(e.nombre) ?? null,
        })));
        hechas.nuevas.push(...plan.nuevas);
      } catch (e) {
        // Alguien metió la misma fila entre medias (el lote entero no entra).
        if (!esDuplicado(e)) throw e;
        for (const n of plan.nuevas) repetir.add(clave(n.normalized, n.frozen));
      }
    }
    // Solo si la cantidad sigue siendo la leída.
    for (const f of plan.sumadas) {
      const filas = await update("user_pantry", `id=${eq(f.id)}&qty=${f.leida == null ? "is.null" : eq(f.leida)}`, { qty: f.qty });
      if (filas?.length) hechas.sumadas.set(f.id, f);
      else repetir.add(clave(f.ingredient_normalized, f.frozen));
    }
    hechas.sinSumar.push(...plan.sinSumar.filter((s) => !repetir.has(s.k)));
    pendientes = pendientes.filter((e) => repetir.has(clave(e.normalized, e.frozen)));
  }
  if (hechas.nuevas.length || hechas.sumadas.size) await primeraVez(CANAL.TELEGRAM, llave(tramo));

  // El recibo (resultado.js, #958): cada cosa dicha, apuntada o no, con su porqué.
  const guardadas = new Set([...hechas.nuevas.map((e) => clave(e.normalized, e.frozen)), ...[...hechas.sumadas.values()].map((f) => clave(f.ingredient_normalized, f.frozen))]);
  const sinSumar = new Set(hechas.sinSumar.map((s) => `${s.k}|${s.nombre}`));
  const sinHacer = [
    ...hechas.sinSumar.map((s) => ({ que: s.nombre, motivo: `ya estaba en ${UNIDAD[s.tiene] ?? s.tiene} y viene en ${UNIDAD[s.viene] ?? s.viene}: dime cuánto en ${UNIDAD[s.tiene] ?? s.tiene}` })),
    ...pendientes.map((e) => ({ que: e.nombre, motivo: "otros cambios en la despensa a la vez: mírala antes de repetirlo" })),
    ...sobran,
  ];
  const hecho = entradas.filter((e) => {
    const k = clave(e.normalized, e.frozen);
    return guardadas.has(k) && !sinSumar.has(`${k}|${e.nombre}`) && !pendientes.includes(e);
  }).map((e) => e.nombre);
  return resultado({
    accion: "despensa", hecho, sinHacer,
    nota: `${hechas.nuevas.length} alimentos nuevos${hechas.sumadas.size ? ` y ${hechas.sumadas.size} sumados a lo que ya había` : ""}. La compra del próximo menú lo tiene en cuenta.`,
  });
}
