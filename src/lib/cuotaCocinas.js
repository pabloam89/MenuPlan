/**
 * "Quiero dos platos peruanos esta semana": contarlos y, si faltan, ponerlos.
 *
 * ── Por qué no basta con la puerta ni con el prompt ───────────────────────
 * Son dos mecanismos y hacen dos trabajos distintos:
 *
 *   · La puerta (`cocinas` en utils/filterRecipes.js) saca del pool lo que
 *     está a cero. Es lo que hace que "No" signifique no — pero una puerta no
 *     puede FORZAR que algo entre: quita candidatos, no coloca platos.
 *   · La cuota va en el prompt del planner, con el resto de INSTRUCCIÓN
 *     ADICIONAL. Pide los platos, y el modelo los pone… casi siempre.
 *
 * "Casi siempre" es exactamente el problema que tenía este eje antes: el mando
 * se pintaba, se guardaba, y el menú salía igual. Un control que cumple cuatro
 * de cada cinco veces no se lee como "a veces falla", se lee como que no hace
 * nada. Así que después de generar se cuenta, y si falta se coloca.
 *
 * ── Qué se permite tocar ──────────────────────────────────────────────────
 * Solo huecos con plato NEUTRO —sin `cocina`, o sea el fondo de armario
 * español, que es de lo que sobra: 554 de 711 recetas servibles—. Nunca un
 * plato fijado por el usuario, nunca un hueco forzado, y nunca otro plato
 * extranjero: cambiar un mexicano por un peruano cumpliría la cuota de peruana
 * rompiendo la de mexicana.
 *
 * Y nunca por debajo del tope de la cocina (ver cocinaTopes.js): pedir cinco
 * peruanos cuando el catálogo solo da uno sin repetir proteína no se resuelve
 * poniendo cinco, se resuelve poniendo uno y diciéndolo.
 */

import { esAnadido, topeDe } from "./cocinaTopes.js";

/** Cuántos platos de cada cocina hay colocados ahora mismo. */
export function contarCocinas(asignaciones, recetaDe) {
  const cuenta = {};
  for (const a of asignaciones ?? []) {
    const cocina = recetaDe(a?.recipeId)?.cocina;
    if (cocina) cuenta[cocina] = (cuenta[cocina] ?? 0) + 1;
  }
  return cuenta;
}

/**
 * Lo que hay que colocar todavía, cocina por cocina, ya recortado a lo que el
 * catálogo puede dar. Devuelve solo lo que falta: si sobra, no se quita nada
 * —el usuario pidió "al menos", y quitar un plato que le gustó para cumplir un
 * número sería peor que pasarse.
 */
export function loQueFalta(pedido, colocado) {
  const falta = {};
  for (const [cocina, n] of Object.entries(pedido ?? {})) {
    if (!esAnadido(cocina)) continue;
    const objetivo = Math.min(Number(n) || 0, topeDe(cocina));
    const hay = colocado?.[cocina] ?? 0;
    if (objetivo > hay) falta[cocina] = objetivo - hay;
  }
  return falta;
}

/**
 * Ajusta el menú para acercarse a la cuota pedida.
 *
 * @param asignaciones  [{ slotId, recipeId, ... }]
 * @param pedido        { peruana: 2, ... } — lo que pidió la casa
 * @param recetaDe      (recipeId) => receta, para leer `cocina` y `mainProtein`
 * @param candidatos    pool ya filtrado, de donde salen los sustitutos
 * @param bloqueado     (slotId, recipeId) => true si ese hueco no se toca
 * @returns { asignaciones, colocados, sinSitio }
 */
export function ajustarCuota(asignaciones, { pedido, recetaDe, candidatos = [], bloqueado = () => false }) {
  const resultado = (asignaciones ?? []).map((a) => ({ ...a }));
  const falta = loQueFalta(pedido, contarCocinas(resultado, recetaDe));
  if (Object.keys(falta).length === 0) {
    return { asignaciones: resultado, colocados: {}, sinSitio: {} };
  }

  const yaPuestos = new Set(resultado.map((a) => a.recipeId));
  const colocados = {};
  const sinSitio = {};

  for (const [cocina, cuantos] of Object.entries(falta)) {
    // Sin repetir plato ni proteína DENTRO de la cocina que se está metiendo:
    // dos ceviches seguidos cumplen el número y no cumplen la promesa.
    const proteinasUsadas = new Set();
    const disponibles = candidatos.filter((r) => r?.cocina === cocina && !yaPuestos.has(r.id));

    let puestos = 0;
    for (let i = 0; i < cuantos; i++) {
      const hueco = resultado.find((a) => {
        if (bloqueado(a.slotId, a.recipeId)) return false;
        // Solo se sacrifica un plato neutro: el fondo de armario español es de
        // lo que sobra, y tocar otro extranjero rompería su propia cuota.
        return !recetaDe(a.recipeId)?.cocina;
      });
      if (!hueco) break;

      const sustituto = disponibles.find(
        (r) => !yaPuestos.has(r.id) && !proteinasUsadas.has(r.mainProtein ?? "none"),
      );
      if (!sustituto) break;

      hueco.recipeId = sustituto.id;
      hueco.cuotaCocina = cocina;
      yaPuestos.add(sustituto.id);
      proteinasUsadas.add(sustituto.mainProtein ?? "none");
      puestos++;
    }

    if (puestos > 0) colocados[cocina] = puestos;
    if (puestos < cuantos) sinSitio[cocina] = cuantos - puestos;
  }

  return { asignaciones: resultado, colocados, sinSitio };
}
