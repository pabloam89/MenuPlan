/**
 * LAS DIEZ REGLAS DE «NO REPETIR X EN UNA VENTANA», declaradas en vez de
 * escritas diez veces.
 *
 * ── Qué se ha visto al leerlas juntas ─────────────────────────────────────
 *
 * Diez de las 28 reglas de `validateMenu` son la misma regla con dos
 * parámetros distintos: QUÉ atributo se compara y EN QUÉ ventana. Cada una
 * tenía su bucle, su acumulador y su `violations.push`, unas 350 líneas para
 * diez celdas de una matriz de 6 extractores × 6 ventanas.
 *
 * El coste de tenerlas sueltas no era la longitud: era que cambiar el
 * extractor de una —poner el eje `formato` donde hay un `/^ensalada/`— o
 * añadir la undécima significaba escribir otro bucle. Declaradas, lo primero
 * es editar una celda y lo segundo es añadir una fila.
 *
 * ── Lo que este fichero NO hace ───────────────────────────────────────────
 *
 * No cambia ni una decisión. Es una traducción: las mismas comparaciones, las
 * mismas ventanas, los mismos mensajes y los mismos `slotId`. Las excepciones
 * caras que cada regla lleva dentro —que la cadena de principales SAQUE los
 * primeros de comida, que la de ensaladas sea asimétrica, que la proteína
 * `none` no cuente— siguen estando, porque cada una salió de un reporte real
 * y borrarlas al abstraer sería el peor resultado posible.
 *
 * Los 133 tests de validateMenu.test.js son la red.
 */

/**
 * Todo extractor devuelve un CONJUNTO, aunque la regla compare un solo valor
 * o una bandera. Así «comparten algo» es siempre la misma operación —
 * intersección no vacía— y las diez reglas caben en un motor.
 *
 *   valor    `mainProtein`, `carbType`, `dishFamily`  → conjunto de uno
 *   bandera  frito, cuchara                           → conjunto de uno o vacío
 *   conjunto proteinTokens, proteinGroups             → tal cual
 *
 * `null`, `undefined` y `"none"` no entran nunca: son «no tiene», y dos
 * platos sin proteína no repiten proteína.
 */
export const deValor = (fn) => (r) => {
  const v = fn(r);
  return v == null || v === "none" ? new Set() : new Set([v]);
};

export const deBandera = (fn, etiqueta) => (r) => (fn(r) ? new Set([etiqueta]) : new Set());

export const deConjunto = (fn) => (r) => fn(r) ?? new Set();

/** Lo que dos platos comparten, o `null`. */
export function compartido(extractor, a, b) {
  const sa = extractor(a);
  if (sa.size === 0) return null;
  for (const v of extractor(b)) if (sa.has(v)) return v;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Las ventanas: qué pares de huecos se comparan
// ─────────────────────────────────────────────────────────────────────────────
//
// Cada una devuelve los pares [antes, despues] que la regla tiene que mirar.
// El `slotId` de la violación es SIEMPRE el del segundo: el que llega después
// es el que se cambia, y así lo hacían las diez por separado.

/**
 * La cadena cronológica de platos principales. `mainMealsOf` deja fuera los
 * primeros de comida A PROPÓSITO, para que una sopa de entrada no bloquee una
 * cena que no tiene nada que ver — y las reglas `_en_comida` y `_en_dia`
 * existen justo para cubrir el hueco que esa relajación abre.
 */
export const cadena = (ctx) => {
  const pares = [];
  for (let i = 1; i < ctx.mainMeals.length; i++) {
    pares.push([ctx.mainMeals[i - 1], ctx.mainMeals[i]]);
  }
  return pares;
};

/** Primero y segundo de la MISMA franja, sea comida o cena de dos platos. */
export const parFranja = (ctx) =>
  Object.values(ctx.parejasPorDia)
    .filter((p) => p["1"] && p["2"])
    .map((p) => [p["1"], p["2"]]);

/** Primero y segundo de una COMIDA, que no es lo mismo: excluye la cena. */
export const parComida = (ctx) =>
  Object.values(ctx.comidaByDay)
    .filter((p) => p["1"] && p["2"])
    .map((p) => [p["1"], p["2"]]);

/** El primero de la comida contra las cenas del mismo día. */
export const primeroVsCenas = (ctx) => {
  const pares = [];
  for (const [daySlug, posiciones] of Object.entries(ctx.comidaByDay)) {
    const primero = posiciones["1"];
    if (!primero) continue;
    for (const m of ctx.mealOrder) {
      if (m.daySlug === daySlug && m.mealType === "cena") pares.push([primero, m]);
    }
  }
  return pares;
};

/** Cada hueco contra los ANTERIORES del mismo día. */
export const mismoDia = (ctx) => {
  const pares = [];
  const porDia = new Map();
  for (const m of ctx.mealOrder) {
    const previos = porDia.get(m.daySlug) ?? [];
    for (const p of previos) pares.push([p, m]);
    previos.push(m);
    porDia.set(m.daySlug, previos);
  }
  return pares;
};

/** El día de hoy (los anteriores) más el día de ayer entero. */
export const diaYAnterior = (ctx) => {
  const pares = [];
  const porDia = new Map();
  for (const m of ctx.mealOrder) {
    if (m.dayIdx < 0) continue;
    if (!porDia.has(m.dayIdx)) porDia.set(m.dayIdx, []);
    porDia.get(m.dayIdx).push(m);
  }
  for (const dayIdx of [...porDia.keys()].sort((a, b) => a - b)) {
    const hoy = porDia.get(dayIdx);
    const ayer = porDia.get(dayIdx - 1) ?? [];
    for (let i = 0; i < hoy.length; i++) {
      for (const p of [...ayer, ...hoy.slice(0, i)]) pares.push([p, hoy[i]]);
    }
  }
  return pares;
};

/**
 * Cenas de días CONSECUTIVOS. La cadena de principales nunca las ve como
 * pares: dentro de un día el enlace es comida → cena, así que la comida del
 * día siguiente siempre se mete en medio, por muchas noches seguidas que se
 * repita lo mismo.
 */
export const cenasAdyacentes = (ctx, regla) => {
  // SOLO CUENTA LA CENA QUE TIENE VALOR, y esto no es un detalle: con una cena
  // de dos platos, si la primera lleva base y la segunda no, la del día es la
  // primera. Guardar la última sin mirar dejaría el día mudo y una pasta el
  // lunes y otra el martes pasarían sin que nadie las viera.
  const porDia = {};
  for (const m of ctx.mealOrder) {
    if (m.mealType !== "cena") continue;
    const r = ctx.poolById[m.recipeId];
    if (!r) continue;
    if (regla?.extractor && regla.extractor(r).size === 0) continue;
    porDia[m.daySlug] = m;
  }
  const pares = [];
  for (let i = 1; i < ctx.DAY_ORDER.length; i++) {
    const antes = porDia[ctx.DAY_ORDER[i - 1]];
    const despues = porDia[ctx.DAY_ORDER[i]];
    if (antes && despues) pares.push([antes, despues]);
  }
  return pares;
};

/**
 * El motor. Recorre los pares de la ventana, pregunta al extractor y emite una
 * violación por cada par que comparte algo.
 *
 * `soloUnaPorSlot` reproduce el comportamiento de las reglas que llevaban un
 * Map de «ya visto» (`guarnicion_repetida`, `dos_cuchara_mismo_dia`,
 * `mismo_plato_seguido`): un hueco se marca UNA vez aunque choque con dos
 * anteriores, y contra el primero que encontró.
 */
export function evaluarNoRepetir(reglas, ctx) {
  const violations = [];
  for (const regla of reglas) {
    const pares = regla.ventana(ctx, regla);
    const yaMarcados = new Set();
    for (const [antes, despues] of pares) {
      if (regla.soloUnaPorSlot && yaMarcados.has(despues.slotId)) continue;
      const ra = ctx.poolById[antes.recipeId];
      const rb = ctx.poolById[despues.recipeId];
      if (!ra || !rb) continue;
      const valor = regla.comparador
        ? regla.comparador(ra, rb)
        : compartido(regla.extractor, ra, rb);
      if (valor == null || valor === false) continue;
      yaMarcados.add(despues.slotId);
      violations.push({
        rule: regla.rule,
        slotId: despues.slotId,
        message: regla.mensaje({ ra, rb, antes, despues, valor }),
      });
    }
  }
  return violations;
}
