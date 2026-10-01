/**
 * Lo que una regla quita SOLO de ciertos huecos: «los lunes, sin carne»,
 * «entre semana, nada de fritos», «los viernes por la noche, sin pescado».
 *
 * Hasta ahora un «excluir» con días se aplicaba a la semana entera (más
 * estricto de lo pedido, con aviso: ver reglas.js). Ahora reglas.js lo
 * proyecta por hueco en `data.excluirPorHueco` («Lun|Comida» → lista),
 * aiPlanner lo cuelga de cada hueco y la regla `excluido_en_hueco` de
 * validateMenu lo comprueba, la reparación no se lo salta y el solver poda con
 * ella. Mismo camino que la cena rápida.
 *
 * Cada cosa de la lista es uno de estos tres:
 *   «grupo:carne»     un grupo (carne, pescado, marisco, pollo, huevo…), por
 *                     proteína principal e ingredientes, no por carpeta: hay
 *                     platos de carne fuera de la carpeta «Carnes»
 *                     (rasgosBusqueda.js GRUPOS).
 *   «tecnica:sarten»  una técnica del catálogo (horno, plancha, sarten, olla, crudo).
 *   «coliflor»        un ingrediente, con frontera de palabra: «pollo» no es «repollo».
 */

import { GRUPOS, sinTildes } from "./rasgosBusqueda.js";

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ¿Es un valor que se sabe aplicar? Para validar antes de guardar una regla. */
export function itemValido(item) {
  const s = String(item ?? "").trim();
  if (!s) return false;
  if (s.startsWith("grupo:")) return Boolean(GRUPOS[s.slice(6)]);
  if (s.startsWith("tecnica:")) return ["horno", "plancha", "sarten", "olla", "crudo"].includes(s.slice(8));
  return !s.includes(":");
}

/** Lo primero de la lista con lo que choca el plato, o null. */
export function chocaConHueco(receta, items = []) {
  if (!receta || !items?.length) return null;
  let ingredientes = null;
  for (const item of items) {
    const s = String(item);
    if (s.startsWith("grupo:")) {
      if (GRUPOS[s.slice(6)]?.es(receta)) return s;
    } else if (s.startsWith("tecnica:")) {
      if (receta.tecnica === s.slice(8)) return s;
    } else {
      ingredientes ??= (receta.ingredients ?? []).map((i) => sinTildes(i?.name));
      const re = new RegExp(`\\b${escapar(sinTildes(s))}`);
      if (ingredientes.some((n) => re.test(n))) return s;
    }
  }
  return null;
}

/** Cómo se dice en un aviso: «carne», «fritos», «coliflor». */
export function textoDeItem(item) {
  const s = String(item);
  if (s.startsWith("grupo:")) return s.slice(6).replace("_", " ");
  if (s.startsWith("tecnica:")) return { sarten: "fritos", horno: "horno", plancha: "plancha", olla: "guisos", crudo: "crudo" }[s.slice(8)] ?? s.slice(8);
  return s;
}
