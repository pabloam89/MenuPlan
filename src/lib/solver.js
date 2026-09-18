/**
 * El solver: asignar recetas a huecos sin romper ninguna regla, sin modelo.
 *
 * ── Por qué ───────────────────────────────────────────────────────────────
 * Medido en producción: de 19 unidades de planificación con telemetría, 19
 * fallaron la validación a la primera y 19 acabaron en `applyFallback`. El
 * 100 %. Ningún menú que haya visto un usuario lo escribió el modelo: los
 * escribe el reparador determinista, después de ~31 s y ~50 llamadas.
 *
 * O sea que la reparación determinista ya es, de hecho, el motor — solo que
 * llega tarde, partiendo de una propuesta que se descarta entera, y trabajando
 * a la contra: recibe un menú roto y lo parchea hueco a hueco. Esto hace lo
 * mismo pero al derecho: construye el menú ya válido.
 *
 * ── La decisión de diseño que lo sostiene ─────────────────────────────────
 * `validateMenu` es la ÚNICA fuente de verdad de las reglas, también aquí.
 *
 * La tentación era reimplementar las 24 reglas como comprobaciones
 * incrementales (más rápido: mirar solo el hueco que acabas de tocar). Sería
 * repetir exactamente el error que llevamos toda la auditoría persiguiendo —
 * la misma regla escrita dos veces, divergiendo en silencio, como el prompt y
 * el validador. Así que el solver llama a `validateMenu` sobre la asignación
 * PARCIAL en cada paso. Cuesta ~1 ms por nodo y una semana con solución se
 * resuelve en unos cientos o pocos miles de nodos: uno o dos segundos frente a
 * los 31 de ahora.
 *
 * Si algún día hace falta la versión incremental, el camino es escribirla y
 * TESTEAR que coincide con `validateMenu` sobre asignaciones aleatorias — no
 * sustituirla a ojo.
 *
 * ── Lo que el solver ha enseñado ya, antes de estar en producción ─────────
 * Un buscador exhaustivo no puede mentir: si no hay solución, no la encuentra,
 * y eso destapa configuraciones que el modelo "cumplía" a ojo y el fallback
 * parcheaba en silencio. Tres, hasta ahora:
 *   · DEFAULT_FREQS (suma 14 sobre 21 huecos) no tiene solución. Era C2.
 *   · Sumar los topes a EXACTAMENTE los huecos tampoco: los platos gastan 1,4
 *     topes de media. De ahí HOLGURA_TOPES en lib/reparto.js.
 *   · Contar los topes por `aporte` en vez de por identidad convertía
 *     "verdura: 3" en "evita la verdura". Se deshizo (ver validateMenu).
 *
 * ── Determinista de verdad ────────────────────────────────────────────────
 * Misma entrada, misma salida, siempre. La variedad no sale del azar del
 * modelo (que no se controla ni se reproduce) sino de tres sitios que sí:
 *   · dentro de la semana, de las propias reglas (no repetir plato, proteína,
 *     base…), que aquí se cumplen POR CONSTRUCCIÓN y no a posteriori;
 *   · entre semanas, de `poolForWeek`, que ya reparte el pool por cubos;
 *   · y de una semilla explícita, para que dos menús distintos no salgan
 *     iguales y el mismo menú sí se pueda reproducir en un test.
 */

import { validateMenu, slotAcceptsRole, FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { recipeMatchesPreferType } from "../utils/filterRecipes.js";
import { isMontaje } from "../data/recipeSchema.js";
import { esAnadido, topeDe } from "./cocinaTopes.js";
import { esCasqueria } from "./casqueria.js";

/**
 * ¿Está encendido? Apagado por defecto: el motor de siempre no cambia hasta
 * que alguien lo pida. Dos formas de pedirlo, las dos sin tocar código:
 *   · `VITE_MOTOR=solver` en el entorno del despliegue (todo staging a la vez);
 *   · `localStorage.setItem("mp_motor", "solver")` en un navegador concreto,
 *     para probarlo en producción sin afectar a nadie más.
 */
export function solverActivo() {
  try {
    if (typeof localStorage !== "undefined") {
      const local = localStorage.getItem("mp_motor");
      if (local === "solver") return true;
      if (local === "modelo") return false;
    }
  } catch {
    // Safari en privado lanza al leer localStorage; no es motivo para decidir nada.
  }
  // EXACTAMENTE `import.meta.env.VITE_MOTOR`: es lo que vite.config.js
  // sustituye en el build con `define`. La primera versión leía
  // `import.meta.env?.VITE_MOTOR`, y con el `?.` Vite no reconoce la expresión,
  // así que en el build de staging salía undefined y el solver nunca llegó a
  // ejecutarse: la primera generación real siguió por el modelo.
  try {
    return import.meta.env.VITE_MOTOR === "solver";
  } catch {
    return false;
  }
}

/** Violaciones que NO significan nada mientras el menú está a medias. */
const IGNORAR_EN_PARCIAL = new Set([
  // Obvio: faltan los huecos que aún no se han tocado.
  "slot_faltante",
  // Es la única regla de MÍNIMO (ver 11b): con el menú a medias siempre falta
  // algo. Se comprueba al final, no durante.
  "base_pedida_insuficiente",
  // También de mínimo en la práctica: un día con solo el primero puesto aún no
  // tiene segundo, y eso no es un error, es que no ha llegado su turno.
  "comida_sin_segundo",
]);

/**
 * Los candidatos de un hueco: lo que puede ir ahí mirando SOLO el plato y el
 * hueco, sin depender de qué haya en los demás.
 *
 * Son las reglas unarias de `validateMenu`. Aplicadas aquí dejan de poder
 * violarse: un plato que las rompa nunca llega a estar sobre la mesa, así que
 * no hay que detectarlo ni repararlo después.
 *
 * Exportada aparte del solver porque vale por sí sola: es lo que necesita la
 * pantalla de ajuste para decir "el martes no hay ningún segundo de 15 minutos,
 * sube a 20 y tienes 34".
 */
export function candidatosDeHueco(pool, slot) {
  return pool.filter((r) => {
    if (slot.maxTime && r.time > slot.maxTime) return false;
    if (slot.mode === "tupper" && !r.tupperFriendly) return false;
    if (!slotAcceptsRole(r, {
      mealType: slot.mealType,
      position: slot.position,
      preferType: slot.preferType,
    })) return false;
    if (slot.preferType && !recipeMatchesPreferType(r, slot.preferType, slot.eaters)) return false;
    // Nada de legumbres en cena (regla 2), que es unaria aunque viva entre las
    // de variedad.
    if (slot.mealType === "cena" && (r.category === "legumbres" || r.mainProtein === "legumbre")) {
      return false;
    }
    // Un plato de montaje (sándwich, tosta, tabla, ensalada de bote) no es una
    // COMIDA: ahí sigue vetado salvo que el hueco se marcara como rápido. Pero
    // de CENA sí, si el catálogo dice que puede serlo.
    //
    // Antes estaba vetado en todas partes, y eso dejaba fuera de una cena
    // normal a 43 platos del recetario estrella que llevan "cena" en su
    // `mealRole` — carpaccio, wrap de pollo, quesadillas, sándwich club, poke
    // bowl, ensalada de aguacate y gambas. Justo las cenas rápidas buenas. Con
    // ellas fuera, el motor tiraba una y otra vez de tortilla.
    //
    // La decisión de si un plato puede ser cena ya está tomada en su ficha;
    // esto era una segunda reja por encima que la contradecía.
    if (isMontaje(r) && slot.preferType !== "cena_rapida" && slot.mealType !== "cena") return false;
    // Casquería solo en fin de semana, y platos de ocasión tampoco entre
    // semana. Las dos viven en `validateMenu` (reglas 3e-bis y 3f), pero son
    // unarias: puestas aquí, un hígado encebollado NO llega siquiera a
    // probarse un miércoles, en vez de probarse y rebotar en cada nodo.
    const finde = slot.daySlug === "sab" || slot.daySlug === "dom";
    if (!finde && (esCasqueria(r) || r.occasion === "especial")) return false;
    return true;
  });
}

/** djb2 con semilla: barajado reproducible. */
function hash(texto, semilla) {
  let h = semilla >>> 0;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Las familias (claves de freqs) que consume un plato. */
export function familiasDe(r) {
  const out = [];
  for (const [familia, matcher] of Object.entries(FREQ_KEY_MATCHERS)) {
    if (matcher(r)) out.push(familia);
  }
  return out;
}

/**
 * Resuelve el menú de un grupo.
 *
 * @param {object[]} slots        `ctx.slots` de buildGroupContext
 * @param {object[]} pool         el pool ya filtrado (y ya ordenado por sesgos)
 * @param {object}   opciones
 * @param {string[]} [opciones.healthProfiles]
 * @param {object}   [opciones.freqs]          topes semanales alcanzables (máximos)
 * @param {object}   [opciones.objetivo]       cuántos platos de cada familia
 *                                             QUEREMOS (el reparto exacto);
 *                                             guía la elección, no la limita
 * @param {object}   [opciones.basesPedidas]   tandas alcanzables
 * @param {object}   [opciones.cocinas]        cocina → platos por semana que
 *                                             pidió la casa (mando de Cocina);
 *                                             guía la elección, como el objetivo
 * @param {number}   [opciones.semilla]        para reproducir un resultado
 * @param {number}   [opciones.maxNodos]       tope de nodos antes de rendirse
 * @param {number}   [opciones.maxMs]          tope de tiempo antes de rendirse
 * @returns {{ asignaciones: {slotId,recipeId}[], completo: boolean,
 *            sinCandidatos: string[], sinCombinacion: string[],
 *            relajados: string[], nodos: number, ms: number }}
 *
 * ── Cómo elige, que es donde vive la calidad ──────────────────────────────
 * El solver coge el primer candidato que no rompe nada, así que el ORDEN de
 * los candidatos es todo el gusto del menú. En cada hueco se ordenan por:
 *   1. lo lejos que la familia del plato está de su objetivo: un plato de una
 *      familia que aún no ha llegado a lo que pide el reparto va antes que uno
 *      de una familia que ya se pasó. Esto es lo que hace que un tope holgado
 *      (HOLGURA_TOPES) no se traduzca en siete carnes: el tope dice hasta
 *      dónde se PUEDE, el objetivo dice a dónde se VA;
 *   2. el orden del pool, que `ordenarPorSesgo` ya dejó puesto (sesgos de la
 *      casa, favoritas, despensa);
 *   3. un desempate con semilla, para que dos menús de la misma casa no salgan
 *      calcados y el mismo menú sí se pueda reproducir.
 *
 * ── Los dos topes ─────────────────────────────────────────────────────────
 * Un problema SIN solución hace que la búsqueda recorra el árbol entero antes
 * de rendirse, y eso a ~0,5 ms por nodo son minutos. Con solución converge en
 * cientos de nodos (p50 medido: 519 en 1.200 unidades aleatorias), así que
 * el presupuesto es corto a propósito: lo que no sale en 2.500 nodos casi
 * nunca sale, y cada segundo de búsqueda inútil lo paga quien espera con la
 * app abierta. Si se agota, devuelve el parcial más
 * profundo que vio, que es válido en todo lo que tiene puesto: mejor 17 huecos
 * buenos que ninguno. La primera versión devolvía CERO en ese caso, porque al
 * rendirse la recursión deshacía sus asignaciones al subir — correcto para
 * seguir buscando, lo peor posible como resultado final.
 */
export function resolverMenu(slots, pool, {
  healthProfiles = [], freqs = {}, objetivo = null, basesPedidas = {}, cocinas = null,
  semilla = 1, maxNodos = 2500, maxMs = 2000,
} = {}) {
  const dominios = new Map();
  const sinCandidatos = [];
  for (const slot of slots) {
    const cands = candidatosDeHueco(pool, slot);
    if (cands.length === 0) sinCandidatos.push(slot.slotId);
    dominios.set(slot.slotId, cands);
  }

  // El hueco MÁS APRETADO primero. Es práctica estándar de CSP y además produce
  // mejores menús: el martes de 15 minutos elige antes de que el domingo se
  // haya llevado lo bueno. Los que no tienen candidatos se dejan fuera desde el
  // principio en vez de bloquear la búsqueda entera: son un dato para la
  // pantalla de ajuste, no un fallo del solver.
  const porTamano = slots
    .filter((s) => (dominios.get(s.slotId) ?? []).length > 0)
    .sort((a, b) => dominios.get(a.slotId).length - dominios.get(b.slotId).length);

  // El primero y el segundo de un mismo día se resuelven JUNTOS. Están atados
  // por tres reglas de pareja —el peso de la comida (7b), el tiempo total
  // (7c) y las dos ensaladas (3d)— y si se deciden lejos el uno del otro, el
  // choque aparece veinte huecos después y hay que deshacer media semana para
  // arreglarlo. Medido al ampliar el tiempo del primero: la búsqueda pasó de
  // doscientos nodos a agotar el presupuesto de dos mil quinientos.
  const orden = [];
  const puesto = new Set();
  for (const s of porTamano) {
    if (puesto.has(s.slotId)) continue;
    orden.push(s);
    puesto.add(s.slotId);
    if (s.position !== "primero" && s.position !== "segundo") continue;
    const parejaId = `${s.daySlug}_comida_${s.position === "primero" ? "2" : "1"}`;
    const pareja = porTamano.find((o) => o.slotId === parejaId);
    if (pareja && !puesto.has(pareja.slotId)) {
      orden.push(pareja);
      puesto.add(pareja.slotId);
    }
  }

  const familias = new Map(pool.map((r) => [r.id, familiasDe(r)]));
  const indice = new Map(pool.map((r, i) => [r.id, i]));
  const cuenta = {};
  const meta = objetivo ?? freqs;

  // La cuota de cocinas (mando de Cocina): cuántos platos de cada cocina
  // añadida quiere la casa, recortado al tope de esa cocina. Mismo cálculo que
  // lib/cuotaCocinas.js, que es quien lo hacía a posteriori (y sin validar).
  const cuotaCocinas = {};
  for (const [cocina, n] of Object.entries(cocinas ?? {})) {
    if (!esAnadido(cocina)) continue;
    const q = Math.min(Number(n) || 0, topeDe(cocina));
    if (q > 0) cuotaCocinas[cocina] = q;
  }
  const cuentaCocina = {};

  // ── La puntuación: lo único que decide cuál de los cien platos válidos sale
  //
  // El solver coge el primer candidato que no rompe nada, así que este orden
  // ES la calidad del menú. Cinco términos, de más a menos mandón. Los tres
  // primeros son de PRODUCTO (lo que la casa pidió), el cuarto es el sesgo de
  // la casa y el quinto es el azar reproducible.

  // 1. Pasarse del tope. Va primero y con mucho peso: un plato que revienta
  //    una cuota se prueba solo si no queda nada mejor.
  const exceso = (r) => {
    let e = 0;
    for (const f of familias.get(r.id)) {
      const tope = meta[f];
      if (tope === undefined) continue;
      e += Math.max(0, (cuenta[f] ?? 0) + 1 - tope);
    }
    return e;
  };

  // 2. Lo que FALTA para llegar al objetivo. Es el término que hace que el
  //    estilo de comida se note: sin él, los topes solo saben decir "no más
  //    pasta", nunca "aún no ha salido ninguna". Y como casi ningún menú llega
  //    a los topes, un estilo con pasta_arroz 3 producía exactamente el mismo
  //    menú que uno con 1 — que es justo lo que se veía al cambiar de estilo.
  //    Cuenta lo LEJOS que está la familia de su objetivo, así que la primera
  //    pasta tira más que la tercera.
  const deficit = (r) => {
    let d = 0;
    for (const f of familias.get(r.id)) {
      const quiero = objetivo?.[f];
      if (quiero === undefined) continue;
      d += Math.max(0, quiero - (cuenta[f] ?? 0));
    }
    return d;
  };

  // 3. Una cocina que la casa pidió y aún no ha salido.
  const cocinaPendiente = (r) =>
    r.cocina && cuotaCocinas[r.cocina] !== undefined && (cuentaCocina[r.cocina] ?? 0) < cuotaCocinas[r.cocina];

  // 4. El tiempo, solo donde significa algo: un PRIMERO es un plato de
  //    entrada, y entre dos que valen es mejor el corto — deja sitio al
  //    segundo dentro del presupuesto de la comida (regla 7c). Sin esto el
  //    solver elegía primeros de 40 minutos y luego se pasaba media búsqueda
  //    deshaciéndolos: medido, comidas de 45-49 minutos para un presupuesto
  //    de 30, y tres mil nodos en vez de doscientos.
  const costeTiempo = (r, slot) => {
    if (slot.position !== "primero" || !slot.mealBudget) return 0;
    return Math.min(1, (r.time ?? 0) / slot.mealBudget);
  };

  // 5. El desempate: el orden del pool (que `ordenarPorSesgo` ya dejó puesto
  //    con los sesgos de la casa, favoritas y despensa) mezclado con ruido de
  //    la semilla. Las dos magnitudes son comparables A PROPÓSITO: con el
  //    ruido en ±20 posiciones sobre un pool de 300, el sesgo ganaba siempre y
  //    dos semillas distintas daban prácticamente el mismo menú — "repite
  //    siempre los mismos platos". Ahora un plato del puesto 200 con suerte
  //    puede adelantar a uno del 20, y el sesgo sigue notándose porque pesa el
  //    doble que el ruido.
  const RUIDO = Math.max(30, pool.length);
  const ordenados = (slot) =>
    [...dominios.get(slot.slotId)]
      .map((r) => ({
        r,
        clave: exceso(r) * 1e6
          - deficit(r) * 1e4
          - (cocinaPendiente(r) ? 5e3 : 0)
          + costeTiempo(r, slot) * 1e3
          + indice.get(r.id) * 2
          + (hash(r.id + slot.slotId, semilla) % RUIDO),
      }))
      .sort((a, b) => a.clave - b.clave)
      .map((x) => x.r);

  const contexto = slots;
  const asignadas = [];
  const usados = new Set();
  let nodos = 0;
  const t0 = Date.now();
  let mejor = [];
  const agotado = () => nodos >= maxNodos || Date.now() - t0 >= maxMs;

  /** ¿Rompe algo lo que llevamos puesto? Lo decide `validateMenu`, no yo. */
  const parcialValida = () => {
    const { violations } = validateMenu(
      asignadas, pool, contexto, healthProfiles, freqs, basesPedidas,
    );
    return !violations.some((v) => !IGNORAR_EN_PARCIAL.has(v.rule));
  };

  const poner = (slot, receta) => {
    asignadas.push({ slotId: slot.slotId, recipeId: receta.id });
    usados.add(receta.id);
    for (const f of familias.get(receta.id)) cuenta[f] = (cuenta[f] ?? 0) + 1;
    if (receta.cocina) cuentaCocina[receta.cocina] = (cuentaCocina[receta.cocina] ?? 0) + 1;
  };
  const quitar = (receta) => {
    asignadas.pop();
    usados.delete(receta.id);
    for (const f of familias.get(receta.id)) cuenta[f] -= 1;
    if (receta.cocina) cuentaCocina[receta.cocina] -= 1;
  };

  const buscar = (i) => {
    if (i >= orden.length) return true;
    if (agotado()) return false;
    const slot = orden[i];
    for (const receta of ordenados(slot)) {
      if (usados.has(receta.id)) continue; // regla 6, por construcción
      nodos += 1;
      if (agotado()) return false;
      poner(slot, receta);
      if (parcialValida()) {
        if (asignadas.length > mejor.length) mejor = [...asignadas];
        if (buscar(i + 1)) return true;
      }
      quitar(receta);
    }
    return false;
  };

  let completo = buscar(0);
  let sinCombinacion = [];

  // ── Fase 2: sin semana entera, todo lo demás ──────────────────────────────
  // La búsqueda no ha encontrado solución completa: o no existe (una casa con
  // 25 minutos entre semana tiene cuatro primeros posibles para siete huecos,
  // y encima chocan entre sí), o se agotó el presupuesto. El parcial más
  // profundo de la fase 1 es engañoso: como los huecos apretados van primero,
  // se queda atascado en ellos y deja vacía la semana entera. Así que se pasa
  // hueco a hueco, cogiendo el primer plato que no rompa nada y SALTANDO el
  // hueco cuando ninguno vale. Lo saltado se devuelve con nombre: es el dato
  // de la pantalla de ajuste, no un fallo que esconder.
  //
  // Es la misma búsqueda con una rama más —"dejar este hueco vacío"— que se
  // prueba la última, y con poda: una rama que ya ha saltado tantos huecos
  // como la mejor solución vista no puede mejorarla. La primera pasada
  // completa es la voraz (primer plato que vale, hueco a hueco); las
  // siguientes, si queda presupuesto, van quitando saltos. Un solo hueco sin
  // salida a mitad de semana (la cena del miércoles sin proteína posible
  // porque el martes ya gastó la que quedaba) se arregla así, y con la voraz a
  // secas se quedaba vacío.
  if (!completo) {
    asignadas.length = 0;
    usados.clear();
    for (const f of Object.keys(cuenta)) cuenta[f] = 0;
    for (const c of Object.keys(cuentaCocina)) cuentaCocina[c] = 0;
    // Presupuesto propio: si la fase 1 se agotó demostrando que no hay semana
    // entera, esta no puede quedarse sin turno.
    const t1 = Date.now();
    const nodos1 = nodos;
    const agotado2 = () =>
      nodos - nodos1 >= Math.max(800, maxNodos / 2) || Date.now() - t1 >= Math.max(800, maxMs / 2);

    const saltados = [];
    let mejorSaltos = Infinity;
    const buscar2 = (i) => {
      if (saltados.length >= mejorSaltos) return;
      if (i >= orden.length) {
        mejorSaltos = saltados.length;
        mejor = [...asignadas];
        sinCombinacion = [...saltados];
        return;
      }
      if (agotado2()) return;
      const slot = orden[i];
      for (const receta of ordenados(slot)) {
        if (usados.has(receta.id)) continue;
        nodos += 1;
        if (agotado2()) return;
        poner(slot, receta);
        if (parcialValida()) buscar2(i + 1);
        quitar(receta);
        if (mejorSaltos === 0) return;
      }
      saltados.push(slot.slotId);
      buscar2(i + 1);
      saltados.pop();
    };
    buscar2(0);
    // Con suerte, la segunda pasada encuentra lo que la primera no pudo dentro
    // de su presupuesto.
    completo = mejorSaltos === 0 && sinCandidatos.length === 0;
  }

  // ── Fase 3: relleno, y si hace falta, relajando lo que ya era orientación ─
  // Dos pasadas sobre los huecos que siguen vacíos, partiendo del mejor
  // parcial:
  //   1. estricta: un plato que cabe con TODAS las reglas. La poda de la fase
  //      2 puede haberse rendido antes de probarlo (medido: 42 candidatos que
  //      cabían en huecos que se quedaron vacíos);
  //   2. relajada: se ignoran SOLO los perfiles de salud y los topes
  //      semanales (REGLAS_RELAJABLES). Son las dos reglas que el prompt del
  //      modelo describe como preferencia —"ORIENTACIÓN, nunca exclusión",
  //      "nunca dejes un hueco sin cubrir por cumplir un perfil"— y que el
  //      validador trata como duras. Medido sobre 26 unidades aleatorias:
  //      bloquean 207 y 164 candidatos, y sin ellas se cierran 17 semanas
  //      enteras en vez de 10. Todo lo demás (alergias, roles, proteína
  //      consecutiva, peso de la comida…) sigue siendo inamovible.
  // Lo relajado se devuelve con nombre, para avisar al usuario y para que la
  // revalidación de después no lo "repare" con el fallback.
  const relajados = [];
  if (!completo) {
    const porId = new Map(pool.map((r) => [r.id, r]));
    const slotPorId = new Map(slots.map((s) => [s.slotId, s]));
    asignadas.length = 0;
    usados.clear();
    for (const f of Object.keys(cuenta)) cuenta[f] = 0;
    for (const c of Object.keys(cuentaCocina)) cuentaCocina[c] = 0;
    for (const a of mejor) poner(slotPorId.get(a.slotId), porId.get(a.recipeId));

    const vacios = () => orden.filter((s) => !asignadas.some((a) => a.slotId === s.slotId));
    const rellenar = (valida) => {
      for (const slot of vacios()) {
        for (const receta of ordenados(slot)) {
          if (usados.has(receta.id)) continue;
          nodos += 1;
          poner(slot, receta);
          if (valida()) break;
          quitar(receta);
        }
      }
    };
    rellenar(parcialValida);
    const estrictos = new Set(asignadas.map((a) => a.slotId));
    const relajadaValida = () => {
      const { violations } = validateMenu(asignadas, pool, contexto, [], {}, basesPedidas);
      return !violations.some((v) => !IGNORAR_EN_PARCIAL.has(v.rule));
    };
    rellenar(relajadaValida);
    for (const a of asignadas) if (!estrictos.has(a.slotId)) relajados.push(a.slotId);

    mejor = [...asignadas];
    sinCombinacion = vacios().map((s) => s.slotId);
    completo = sinCombinacion.length === 0 && sinCandidatos.length === 0;
  }

  return {
    asignaciones: completo ? [...asignadas] : mejor,
    completo,
    // Huecos en los que ningún plato encaja por sí solo (tiempo, rol, tupper…).
    sinCandidatos,
    // Huecos con candidatos, pero ninguno compatible con el resto de la semana
    // ni siquiera relajando REGLAS_RELAJABLES.
    sinCombinacion,
    // Huecos colocados saltándose el tope semanal o el perfil de salud.
    relajados,
    // Cocina → platos que la casa pidió y no han cabido.
    cocinasSinSitio: Object.fromEntries(
      Object.entries(cuotaCocinas)
        .map(([c, q]) => [c, q - (cuentaCocina[c] ?? 0)])
        .filter(([, falta]) => falta > 0),
    ),
    nodos,
    ms: Date.now() - t0,
  };
}

/**
 * Las reglas que la fase 3 puede saltarse para no dejar un hueco vacío. Son
 * exactamente las que el prompt del planner llama orientación. La
 * revalidación de generateGroupMenu las ignora en los huecos `relajados`.
 */
export const REGLAS_RELAJABLES = new Set(["health_profile_conflict", "freq_max_exceeded"]);
