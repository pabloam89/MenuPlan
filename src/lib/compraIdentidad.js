/**
 * Cada artículo de la compra tiene una identidad: su nombre normalizado
 * (`ingredientStem`, el mismo con el que la lista junta ingredientes). Sin
 * ella, «apunta leche» dos veces dejaba dos «leche», y tachar preguntaba
 * siempre «¿cuál?: leche, leche» sin tachar nunca ninguna (#958, clase D).
 *
 * Tres usos, una sola regla:
 *   · añadir: lo que ya está no se duplica (si estaba tachado, vuelve);
 *   · tachar: varios con la MISMA identidad son una sola cosa y se tachan todos
 *     (las listas guardadas ya traen duplicados: 163 en 26 de 66 semanas el
 *     29 oct 2026);
 *   · rehacer: las marcas de «comprado» y «en casa» pasan a la lista nueva por
 *     ingrediente y unidad, como hace la app al generar (App.jsx, setShopping).
 * Puro: sin base ni red.
 */
import { ingredientStem, normalizeIngredientKey } from "./ingredientCategories.js";

/** La identidad de un artículo por su nombre: «Leches» y «leche» son lo mismo. */
export const claveArticulo = (nombre) => ingredientStem(String(nombre ?? ""));

/** Si todos los artículos son el mismo (misma identidad), y hay alguno. */
export function sonElMismo(items) {
  const claves = new Set((items ?? []).map((it) => claveArticulo(it?.name)));
  return claves.size === 1 && !claves.has("");
}

/**
 * Añade a mano `nombres` a `items` sin duplicar. Devuelve la lista nueva y qué
 * pasó con cada nombre: `anadidos` (nuevos), `yaEstaban` (pendientes ya) y
 * `devueltos` (estaban tachados o «en casa»: vuelven a pedirse). No muta.
 * @param {object[]} items
 * @param {string[]} nombres
 * @param {() => string} [sello] sufijo del id (por defecto, la hora)
 */
export function anadirArticulos(items, nombres, sello = () => Date.now().toString(36)) {
  const lista = (items ?? []).map((it) => ({ ...it }));
  const res = { items: lista, anadidos: [], yaEstaban: [], devueltos: [] };
  for (const p of nombres ?? []) {
    const name = String(p ?? "").trim();
    const clave = claveArticulo(name);
    if (!name || !clave) continue;
    const iguales = lista.filter((it) => claveArticulo(it.name) === clave);
    if (iguales.length) {
      const pendiente = iguales.find((it) => !it.have && !it.atHome && !it.fromPantry);
      if (pendiente) res.yaEstaban.push(pendiente.name);
      else {
        Object.assign(iguales[0], { have: false, atHome: false, fromPantry: false });
        res.devueltos.push(iguales[0].name);
      }
      continue;
    }
    lista.push({
      id: `manual:${clave.replace(/\s+/g, "-")}:${sello()}`,
      name, category: "Otros", unit: "", qty: null, displayQty: "",
      sources: [], have: false, atHome: false, manual: true, adapted: false,
    });
    res.anadidos.push(name);
  }
  return res;
}

// La clave con la que la lista junta ingredientes: la de cada fila nueva es su
// `id` (buildShoppingList lo hace así); la de una vieja, de su nombre y unidad.
const claveConUnidad = (it) => normalizeIngredientKey(it?.name ?? "", it?.unit ?? "ud");

/**
 * La lista `nuevos` con las marcas de `viejos` del mismo ingrediente y unidad:
 * rehacer la semana, cambiar un plato o los comensales no puede desmarcar lo
 * que ya se compró. Solo pasa lo marcado (true); lo demás se queda como venga
 * en la nueva. La usan Lola (generar.js) y la app (App.jsx), que antes tenía
 * cinco copias de esta regla.
 */
export function conMarcas(nuevos, viejos) {
  const marcas = new Map();
  for (const it of viejos ?? []) {
    if (!it?.have && !it?.atHome) continue;
    const k = claveConUnidad(it);
    const m = marcas.get(k) ?? { have: false, atHome: false };
    marcas.set(k, { have: m.have || Boolean(it.have), atHome: m.atHome || Boolean(it.atHome) });
  }
  if (!marcas.size) return nuevos ?? [];
  return (nuevos ?? []).map((it) => {
    const m = marcas.get(it?.id ?? claveConUnidad(it));
    return m ? { ...it, have: Boolean(it.have) || m.have, atHome: Boolean(it.atHome) || m.atHome } : it;
  });
}
