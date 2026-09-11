/**
 * Los sesgos de la libreta, aplicados al scorer determinista.
 *
 * ── Qué arregla ───────────────────────────────────────────────────────────
 * `proyectar()` (lib/notepad.js) lleva meses devolviendo `sesgos` —tecnica,
 * salsa, base— y `favoritos`, y NADIE los leía: el wizard los pintaba y ahí
 * se quedaban. Un usuario podía pedir "más horno" o "platos con salsa" y el
 * menú salía igual. De los tres, solo `cocina` había llegado al motor, y por
 * un camino propio (`data.cocinas`, una puerta de entrada opt-in en
 * filterRecipes).
 *
 * ── Por qué un BOOST y no una puerta ──────────────────────────────────────
 * `cocina` es puerta porque el catálogo lo pide: ausente = española, y una
 * cocina extranjera a cero no debe entrar. Los sesgos de aquí son otra cosa:
 * su `unidad` en notepadFields.js es literalmente "sesgo", y un sesgo mueve
 * la balanza, no cierra la puerta. Si "más horno" excluyera todo lo que no es
 * horno, el pool se vaciaría en dos toques — que es justo el riesgo que
 * cocinaTopes.js existe para evitar en el eje de cocinas.
 *
 * ── El valor que llega ────────────────────────────────────────────────────
 * `sesgos[campo][valor]` es un número: `1` = más, `-1` = menos, `0` = neutro
 * (panelParser.js:207; el toggle del wizard alterna 0 ↔ 1). Solo se mueven los
 * platos que CASAN con el sesgo, hacia arriba o hacia abajo según el signo;
 * los que no casan no se tocan. Así "menos horno" baja los de horno sin subir
 * artificialmente el resto.
 *
 * ── La escala ─────────────────────────────────────────────────────────────
 * PESO = 12, en la misma escala que el resto del scorer de lib/planner.js:
 * una familia de `freqs` por cubrir suma 14 por hueco pendiente, la proteína
 * del cole resta 22, un plato fijado a mano suma 85. Un sesgo tiene que
 * pesar menos que una frecuencia pedida con número y mucho menos que un plato
 * fijado: es una preferencia, no una instrucción.
 *
 * El motor sigue sin saber que la libreta existe: esto recibe la PROYECCIÓN
 * (`data.sesgos`, `data.favoritos`), que se escribe en el mismo seam que
 * `data.freqs` y `data.cocinas` (components/wizard/useWizardMenu.jsx#guardar).
 */

export const PESO_SESGO = 12;

/** Normaliza el valor de un sesgo a -1 / 0 / 1. */
function signo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n > 0 ? 1 : -1;
}

/**
 * Cuánto sube o baja `recipe` por los sesgos de la casa.
 *
 * @param {object} recipe            receta del catálogo (o hidratada)
 * @param {object|null} sesgos       `proyectar(notepad).sesgos`
 * @param {string[]} [favoritos]     `proyectar(notepad).favoritos`, nombres en minúsculas
 * @returns {number}
 */
export function sesgoScoreBoost(recipe, sesgos, favoritos = []) {
  if (!recipe) return 0;
  let boost = 0;

  // tecnica: {horno: 1, crudo: -1}. Casa si la técnica dominante del plato es
  // la del sesgo.
  for (const [tecnica, valor] of Object.entries(sesgos?.tecnica ?? {})) {
    const s = signo(valor);
    if (s && recipe.tecnica === tecnica) boost += s * PESO_SESGO;
  }

  // base: {arroz: 1, patatas: -1}. Casa por `mainBase`, que es lo que el
  // catálogo declara (y desde D1 manda sobre el regex para el hidrato).
  for (const [base, valor] of Object.entries(sesgos?.base ?? {})) {
    const s = signo(valor);
    if (s && recipe.mainBase === base) boost += s * PESO_SESGO;
  }

  // salsa: el dominio es {si, no}, así que la polaridad pedida es
  // sign(si) − sign(no): +1 quiere salsa, −1 no la quiere. Casan los platos
  // que la TRAEN (`llevaSalsa`, 172 recetas): con +1 suben, con −1 bajan. Los
  // que no la llevan no se tocan, igual que en los demás ejes.
  const polaridad = signo(sesgos?.salsa?.si) - signo(sesgos?.salsa?.no);
  if (polaridad && recipe.llevaSalsa === true) boost += Math.sign(polaridad) * PESO_SESGO;

  // favoritos: nombres de ingrediente tal cual los dijo el usuario, en
  // minúsculas ("queso", "aguacate"). Casa si algún ingrediente del plato lo
  // contiene. Sube una sola vez por plato aunque case con varios: "más queso"
  // no debe convertir una tabla de quesos en el mejor plato de la semana.
  if (favoritos?.length) {
    const nombres = (recipe.ingredients ?? []).map((i) => String(i?.name ?? "").toLowerCase());
    const casa = favoritos.some((fav) => {
      const f = String(fav ?? "").toLowerCase().trim();
      return f && nombres.some((n) => n.includes(f));
    });
    if (casa) boost += PESO_SESGO;
  }

  // `esfuerzo` (facil / rapido / elaborado) se queda fuera A PROPÓSITO: no
  // hay un campo del plato que lo represente sin ambigüedad —`difficulty` y
  // `time` se cruzan, y `effort` es otra cosa (postres)—, y mapearlo a ojo
  // aquí sería inventar la regla en el sitio equivocado. Cuando el modelo
  // tenga un eje de esfuerzo de verdad, se añade una línea.

  return boost;
}

/**
 * El pool ordenado por sesgo, de más a menos, SIN romper el orden previo.
 *
 * Es estable a propósito: `filterRecipes` ya deja el pool con un orden que
 * significa algo (favoritos delante, etc.), y aiPlanner elige "el primero que
 * pasa" tanto en el fallback como en las sustituciones. Un sort estable por
 * boost descendente pone delante lo que la casa ha pedido y, entre iguales
 * —que son casi todos, con boost 0— conserva exactamente el orden de antes.
 *
 * Sin sesgos ni favoritos devuelve EL MISMO array (no una copia): cero coste y
 * cero cambio de comportamiento para quien no ha tocado el wizard, que es la
 * garantía que hace seguro enchufar esto en el camino caliente.
 *
 * @template T
 * @param {T[]} pool
 * @param {object|null} sesgos
 * @param {string[]} [favoritos]
 * @returns {T[]}
 */
export function ordenarPorSesgo(pool, sesgos, favoritos = []) {
  if (!Array.isArray(pool) || pool.length < 2) return pool;
  const haySesgos = sesgos && Object.values(sesgos).some((eje) => eje && Object.values(eje).some((v) => Number(v)));
  const hayFavoritos = Array.isArray(favoritos) && favoritos.some((f) => String(f ?? "").trim());
  if (!haySesgos && !hayFavoritos) return pool;

  // Se calcula una vez por receta y se ordena por índice: el boost es
  // determinista, y así el sort no recomputa nada ni depende de que el motor
  // de JS sea estable (lo es desde ES2019, pero el índice lo garantiza igual).
  const puntuado = pool.map((recipe, i) => ({ recipe, i, boost: sesgoScoreBoost(recipe, sesgos, favoritos) }));
  puntuado.sort((a, b) => b.boost - a.boost || a.i - b.i);
  return puntuado.map((p) => p.recipe);
}

/**
 * El escalón de mayor sesgo, para quien elige AL AZAR.
 *
 * `ordenarPorSesgo` sirve cuando se coge "el primero que pasa" (el fallback).
 * Pero el "Cambiar" de un plato (aiPlanner#pickCatalogReplacement) sortea
 * entre los candidatos a propósito —es lo que da variedad—, y ahí ordenar no
 * cambia nada. Lo que sí encaja es el patrón que esa función ya usa con los
 * subtipos y con el cole: quedarse con el subconjunto preferido y sortear
 * DENTRO de él, cayendo al pool entero si el subconjunto se vaciara.
 *
 * "Preferido" = el escalón de boost más alto. Con "más horno", el sorteo es
 * entre los de horno; con "menos horno", entre los que no lo son (los de
 * horno quedan en −12, por debajo del 0 de los demás). Sigue siendo una
 * preferencia y no un filtro: si TODOS los candidatos son de horno y el
 * usuario pidió menos, el escalón más alto son ellos y se sortea igual.
 *
 * Sin sesgos ni favoritos, o con todos los candidatos al mismo boost,
 * devuelve EL MISMO array: cero cambio para quien no ha tocado el wizard.
 *
 * @template T
 * @param {T[]} candidates
 * @param {object|null} sesgos
 * @param {string[]} [favoritos]
 * @returns {T[]}
 */
export function preferirPorSesgo(candidates, sesgos, favoritos = []) {
  if (!Array.isArray(candidates) || candidates.length < 2) return candidates;
  const boosts = candidates.map((r) => sesgoScoreBoost(r, sesgos, favoritos));
  const max = Math.max(...boosts);
  const min = Math.min(...boosts);
  if (max === min) return candidates;
  return candidates.filter((_, i) => boosts[i] === max);
}
