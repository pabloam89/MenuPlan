/**
 * Las bases: cocinar una vez para toda la semana — lógica pura, sin React.
 *
 * ── Qué es una base ────────────────────────────────────────────────────────
 * Algo que se cocina UNA VEZ y alimenta a varios platos: una olla de arroz,
 * una de legumbre, una bandeja de boniato. Está a caballo entre el ingrediente
 * y la receta —hay que cocinarla, pero nadie cena un táper de arroz— y por eso
 * vive en el catálogo con `type: "base"`, exactamente igual que las salsas.
 *
 * ── La pieza que lo hace posible: baseMode ─────────────────────────────────
 * `mainBase` ya decía QUÉ fécula lleva un plato, pero no si esa fécula se
 * puede tener hecha de antes, que es lo único que aquí importa:
 *
 *   · el arroz de un bowl o de unas judías con arroz se hierve aparte y se
 *     junta al final     → baseMode "aparte" → una olla sirve a varios platos
 *   · el arroz de un risotto o de una paella se cocina DENTRO absorbiendo su
 *     caldo             → baseMode "dentro"  → precocinarlo arruina el plato
 *
 * Ausente NO es lo mismo que "dentro": es "sin revisar todavía", y aquí se
 * trata como "no". El riesgo es asimétrico —proponer una tanda para un risotto
 * estropea la cena, no proponerla solo deja de ahorrar tiempo—, así que la
 * duda siempre cae del lado de no proponer.
 *
 * ── Por qué el tiempo no se multiplica ─────────────────────────────────────
 * Es la razón entera de que esto merezca la pena: una olla de garbanzos tarda
 * 55 min tanto para 2 raciones como para 16. El tiempo de una base es AFÍN
 * (`minutosFijos` + raciones × `minutosPorRacion`), no proporcional — hasta
 * `capacidadMax`, que es donde deja de caber en la olla y hace falta otra
 * tanda. Sin ese tope el modelo prometería cocinar para 40 en el mismo cazo.
 */

import basesCatalog from "../data/recipes/bases.json";
import { catalogIdOfPlanRecipe } from "./freezer.js";

/** Todas las bases del catálogo. */
export const BASES = basesCatalog;

/**
 * clave → receta de base. La clave es `baseKey` y, si no lo trae, `mainBase`:
 * las siete de fécula se buscan por su hidrato desde siempre, y las que no son
 * fécula (el sofrito) traen `baseKey` propio para no tener que colarse en
 * MAIN_BASES, que es el eje del hidrato y no el de "qué se puede batchear".
 */
const BASE_POR_CLAVE = new Map(BASES.map((b) => [b.baseKey ?? b.mainBase, b]));

/**
 * TODAS las bases que un plato puede aprovechar ya hechas. Son dos caminos
 * distintos y un plato puede recorrer los dos — un salteado de arroz con
 * sofrito aprovecha las dos cosas:
 *
 *   1. su fécula, si está marcada `baseMode: "aparte"`
 *   2. lo que declare en `basesAparte` (sofrito y compañía)
 *
 * @returns {object[]} sin repetir, vacío si el plato no aprovecha ninguna.
 */
export function basesDeReceta(receta) {
  const out = [];
  // Lo que no está marcado "aparte" no entra: ver la nota sobre el riesgo
  // asimétrico en la cabecera.
  if (receta?.mainBase && receta.baseMode === "aparte") {
    const b = BASE_POR_CLAVE.get(receta.mainBase);
    if (b) out.push(b);
  }
  for (const clave of receta?.basesAparte ?? []) {
    const b = BASE_POR_CLAVE.get(clave);
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

/**
 * La base de FÉCULA de una receta, o null. Se queda con este nombre y este
 * significado porque es lo que preguntan la ficha y el generador: "¿este plato
 * lleva arroz que pueda tener hecho?". Para la sesión de batch cooking hace
 * falta `basesDeReceta`, que además ve el sofrito.
 */
export function baseDeReceta(receta) {
  if (!receta?.mainBase) return null;
  if (receta.baseMode !== "aparte") return null;
  return BASE_POR_CLAVE.get(receta.mainBase) ?? null;
}

/** ¿Este plato aprovecha alguna base ya cocinada? */
export function usaBase(receta) {
  return basesDeReceta(receta).length > 0;
}

/**
 * Cuántas tandas hacen falta para esta base, cuánto tardan, y cuánto se ahorra
 * frente a cocinarla plato a plato.
 *
 * `raciones` es un ARRAY con las raciones de cada plato ([4, 4, 2] = tres
 * platos), no un total. La distinción no es cosmética: es de dónde sale el
 * ahorro. Cocinar 12 raciones de una vez son 12 raciones en una olla; hacerlo
 * suelto son TRES ollas de 4, no doce de una — cada plato paga los
 * `minutosFijos` una vez, no una por comensal. Comparar contra doce ollas
 * inflaba el ahorro cinco veces y habría puesto un número mentiroso delante
 * del usuario.
 *
 * Se acepta también un número suelto por comodidad, y entonces significa "un
 * solo plato con n raciones" — que da ahorro CERO, y es correcto: cocinar la
 * base de un único plato no es batch cooking, es cocinar.
 *
 * Dentro de una tanda el tiempo es afín (hervir es hervir, da igual la
 * cantidad); pasada `capacidadMax` hace falta otra olla y esos fijos se pagan
 * ENTEROS otra vez, porque nadie tiene dos ollas grandes hirviendo a la vez.
 *
 * @param {object} base
 * @param {number|number[]} raciones
 * @returns {{ tandas: number, minutos: number, minutosSueltos: number, ahorro: number }}
 */
/**
 * Qué parte del tiempo de una base es TUYA — estar delante picando o
 * removiendo— y qué parte es la olla sola.
 *
 * Es la corrección más importante de todo esto, porque el número que
 * enseñábamos medía lo que no duele. Medido sobre las propias bases:
 *
 *   pasta     20 min de reloj →   3 de estar delante
 *   arroz     29                →   8
 *   patatas   45                →   9
 *   legumbre  549               →  19   (el resto es remojo y hervor)
 *
 * Una semana entera de tandas ahorra ~66 minutos de reloj y ~6 de atención.
 * "No tengo tiempo" nunca significó que el reloj corriera: significa que no
 * puedes estar ahí. Por eso las listas de batch cooking de verdad están
 * llenas de sofritos y bandejas de verdura y no de ollas de arroz.
 *
 * Se deriva de los pasos de la propia base (`kind`), no de un campo nuevo a
 * mano: el dato ya existe en las 985 recetas con `stepsRich`.
 * @returns {number} entre 0 y 1; 1 si la base no tiene pasos que mirar.
 */
export function fraccionActiva(base) {
  const pasos = base?.stepsRich ?? [];
  let activos = 0;
  let total = 0;
  for (const paso of pasos) {
    const min = Number(paso?.minutes) || 0;
    total += min;
    // `prep` cuenta como activo: picar es lo que mas cansa de una base.
    if (paso?.kind === "activo" || paso?.kind === "prep") activos += min;
  }
  return total > 0 ? activos / total : 1;
}

export function tiempoDeBase(base, raciones) {
  const porPlato = (Array.isArray(raciones) ? raciones : [raciones])
    .map((n) => Math.max(0, Math.floor(Number(n) || 0)))
    .filter((n) => n > 0);
  const total = porPlato.reduce((s, n) => s + n, 0);
  if (!base || total === 0) return { tandas: 0, minutos: 0, minutosSueltos: 0, ahorro: 0 };

  const fijos = Number(base.minutosFijos) || Number(base.time) || 0;
  const porRacion = Number(base.minutosPorRacion) || 0;
  const capacidad = Math.max(1, Number(base.capacidadMax) || total);

  /** Minutos de cocinar `n` raciones de golpe, partiendo en tandas si no caben. */
  const minutosDe = (n) => {
    const tandas = Math.ceil(n / capacidad);
    let minutos = 0;
    let restantes = n;
    for (let i = 0; i < tandas; i++) {
      const enEsta = Math.min(capacidad, restantes);
      minutos += fijos + enEsta * porRacion;
      restantes -= enEsta;
    }
    return minutos;
  };

  const minutos = minutosDe(total);
  // Suelto: cada plato con su propia olla. Los fijos se pagan una vez POR
  // PLATO, y ahí está el ahorro de verdad.
  const minutosSueltos = porPlato.reduce((s, n) => s + minutosDe(n), 0);

  const ahorro = Math.max(0, Math.round(minutosSueltos - minutos));
  const activa = fraccionActiva(base);
  return {
    tandas: Math.ceil(total / capacidad),
    minutos: Math.round(minutos),
    minutosSueltos: Math.round(minutosSueltos),
    ahorro,
    // Los dos, y el que se le enseña al usuario es `ahorroActivo`. `ahorro`
    // se queda porque también significa algo: es ESPERA que te quitas de
    // encima un martes (no cenas mas tarde por esperar al arroz). Pero no es
    // "tienes una hora mas", y enseñarlo como si lo fuera era mentir.
    ahorroActivo: Math.round(ahorro * activa),
    minutosActivos: Math.round(Math.round(minutos) * activa),
  };
}

/**
 * La clave con la que se busca una base: `baseKey` si lo trae (el sofrito), y
 * si no su `mainBase` (las siete de fécula). Es la misma que escriben los
 * pasos en `stepsRich[i].base` y la que lleva `basesAparte`.
 */
export const claveDeBase = (base) => base?.baseKey ?? base?.mainBase ?? null;

/** Las claves de todas las bases que este plato puede aprovechar ya hechas. */
export const clavesDeReceta = (receta) => basesDeReceta(receta).map(claveDeBase).filter(Boolean);

/**
 * Qué queda por hacer de un plato cuando sus bases ya están cocinadas.
 *
 * Es la otra mitad del batch cooking, y la que faltaba. `tiempoDeBase` mide lo
 * que cuesta la OLLA del domingo; esto mide lo que cuesta la CENA del martes,
 * que es el número por el que alguien decide si esto le sirve: "con el sofrito
 * hecho, son ocho minutos".
 *
 * Se apoya en `stepsRich[i].base`, que marca los pasos que desaparecen porque
 * su trabajo ya está hecho. Un paso sin marcar se queda, siempre: la duda cae
 * del lado de prometer menos, igual que en `baseMode`.
 *
 * @param {object} receta
 * @param {Iterable<string>} [clavesListas] qué bases se dan por hechas. Por
 *   defecto, TODAS las que el plato declara suyas.
 * @returns {{minutos, minutosActivos, minutosQuitados, pasos, pasosQuitados, etiquetado}}
 *   `etiquetado` distingue "no ahorra nada" de "nadie lo ha mirado todavía":
 *   sin él, un plato sin repasar parecía un plato que no ahorra.
 */
/**
 * Lo que cuesta volver a poner en marcha un táper de la nevera.
 *
 * Un táper no se usa tal cual: el arroz se seca y pide un chorrito de agua, el
 * sofrito quiere un minuto de sartén, y el boniato pierde el tostado si lo
 * pasas por el microondas. Sale de los pasos `reactivacion` de la propia base.
 *
 * @returns {{minutos: number, minutosActivos: number}}
 */
export function costeDeReactivar(base) {
  let minutos = 0;
  let minutosActivos = 0;
  for (const paso of base?.reactivacion ?? []) {
    const min = Number(paso?.minutes) || 0;
    minutos += min;
    if (paso?.kind === "activo" || paso?.kind === "prep") minutosActivos += min;
  }
  return { minutos, minutosActivos };
}

export function montajeTrasBases(receta, clavesListas) {
  const pasos = receta?.stepsRich ?? [];
  // Solo se acepta una LISTA. Un `esMontajeRapido` pasado a `.filter()` recibe
  // el índice como segundo argumento, y un 0 ahí reventaba el Set; peor aún, un
  // 1 habría pasado como "ninguna base lista" sin decir nada. Lo que no sea
  // lista se trata como "no me has dicho nada", que es el valor por defecto.
  const dadas = Array.isArray(clavesListas) ? clavesListas : null;
  const listas = new Set(dadas ?? clavesDeReceta(receta));

  let minutos = 0;
  let minutosActivos = 0;
  let minutosQuitados = 0;
  let pasosQuitados = 0;
  /** Solo se reactiva la base que de verdad se ha llevado algún paso. */
  const reactivadas = new Set();

  for (const paso of pasos) {
    const min = Number(paso?.minutes) || 0;
    if (paso?.base && listas.has(paso.base)) {
      pasosQuitados += 1;
      minutosQuitados += min;
      reactivadas.add(paso.base);
      continue;
    }
    minutos += min;
    // Mismo criterio que fraccionActiva: `prep` es tuyo, picar también cansa.
    if (paso?.kind === "activo" || paso?.kind === "prep") minutosActivos += min;
  }

  // Cada táper se reactiva por separado, aunque acaben en la misma sartén.
  // Cobrar de más aquí es el lado seguro: la promesa del martes se queda corta
  // en lugar de pasarse, que es la misma dirección que toma `baseMode` con la
  // duda. Antes esto valía CERO y el plato se daba por empezado.
  let minutosReactivar = 0;
  let minutosActivosReactivar = 0;
  for (const clave of reactivadas) {
    const c = costeDeReactivar(BASE_POR_CLAVE.get(clave));
    minutosReactivar += c.minutos;
    minutosActivosReactivar += c.minutosActivos;
  }

  return {
    minutos: minutos + minutosReactivar,
    minutosActivos: minutosActivos + minutosActivosReactivar,
    minutosQuitados,
    // Lo que de verdad te quitas: los minutos de la olla MENOS lo que cuesta
    // volver a ponerla en marcha. Es el número honesto de los dos.
    minutosNetos: Math.max(0, minutosQuitados - minutosReactivar),
    minutosReactivar,
    pasos: pasos.length - pasosQuitados,
    pasosQuitados,
    reactivadas: [...reactivadas],
    etiquetado: pasos.some((p) => Boolean(p?.base)),
  };
}

/**
 * Los dos topes de un día de diario. Son DOS porque una cena se cae por dos
 * motivos distintos, y una tanda arregla uno u otro según la base:
 *
 *   manos → minutos en los que tienes que estar delante. Lo que arregla el
 *           sofrito: pochar cebolla son 30 minutos y los 30 son tuyos.
 *   reloj → minutos desde que entras en la cocina hasta que se come. Lo que
 *           arregla el arroz: los 18 minutos de olla no te cansan, pero a las
 *           nueve de la noche con hambre son los que deciden si cocinas o
 *           pides algo.
 *
 * Medir solo las manos dejó fuera lo segundo y hacía parecer inútiles las
 * féculas: por manos, 28 platos dependen de una tanda; contando también el
 * reloj son 67. Un arroz baja de 50 minutos de reloj a 31, y eso no es una
 * comodidad, es la diferencia entre cenar eso o no cenar eso.
 *
 * 45 y no 30 en el reloj: un plato puede tener el horno encendido media hora
 * mientras pones la mesa. Lo que no cabe un martes es empezar a las nueve.
 */
export const MINUTOS_DE_MONTAJE = 15;
export const MINUTOS_DE_DIARIO = 45;

/**
 * ¿Este plato cabe un día de diario teniendo sus bases hechas?
 *
 * Pide los DOS topes. Un guiso de hora y media sin apenas trabajo no es una
 * cena de martes por muy poco que te ate, y un salteado de cinco minutos que
 * te tiene diez de pie picando, tampoco.
 *
 * Devuelve false para lo que nadie ha etiquetado todavía. No es un descuido:
 * es la diferencia entre "sabemos que cabe" y "no lo sabemos", y la segunda no
 * se puede enseñar como promesa.
 */
export function esMontajeRapido(receta, clavesListas) {
  const m = montajeTrasBases(receta, clavesListas);
  return m.etiquetado
    && m.minutosActivos <= MINUTOS_DE_MONTAJE
    && m.minutos <= MINUTOS_DE_DIARIO;
}

/**
 * Lo que gana un plato por tener sus bases hechas, en los dos ejes, y si eso
 * le hace pasar de no caber un martes a caber.
 *
 * Es lo que hay que enseñar: no "ahorras 19 minutos" a secas, sino "de 50
 * minutos a 31" — y, cuando cruza, que hoy esto es posible y sin la tanda no
 * lo era.
 */
export function loQueGana(receta, clavesListas) {
  const sinNada = montajeTrasBases(receta, []);
  const conTodo = montajeTrasBases(receta, Array.isArray(clavesListas) ? clavesListas : undefined);
  return {
    relojAntes: sinNada.minutos,
    relojDespues: conTodo.minutos,
    manosAntes: sinNada.minutosActivos,
    manosDespues: conTodo.minutosActivos,
    // Cruzar es el suceso que de verdad importa: el plato pasa de imposible a
    // posible. Ahorrar cinco minutos a un plato que ya cabía no cambia nada.
    cruzaPorReloj: sinNada.minutos > MINUTOS_DE_DIARIO && conTodo.minutos <= MINUTOS_DE_DIARIO,
    cruzaPorManos: sinNada.minutosActivos > MINUTOS_DE_MONTAJE
      && conTodo.minutosActivos <= MINUTOS_DE_MONTAJE,
    etiquetado: conTodo.etiquetado,
  };
}

/**
 * Hasta cuántos platos de cada base puede dar la semana. El tope del deslizador.
 *
 * Son DOS límites distintos y el que manda es el menor:
 *
 *   absoluto   — cuántos platos con esa base hay en el recetario, repartidos
 *                entre las semanas que se generan de una vez. En un menú de
 *                cuatro semanas cada una recibe su propio cuarto del catálogo
 *                (ver `poolForWeek`), así que el cuscús, con seis platos en
 *                todo el catálogo, da para uno por semana y no para cinco.
 *   compartido — los huecos que quedan libres después de lo que ya se ha
 *                pedido de las demás. Si llenas la semana de quinoa, deja de
 *                caber tanto arroz; en la semana siguiente vuelve a caber,
 *                porque el presupuesto es de CADA semana, no del menú entero.
 *
 * Lo compartido es conservador a propósito: un mismo plato puede servir a dos
 * bases a la vez —una pasta con verduras asadas cuenta para las dos— así que
 * sumar lo pedido sobrestima los huecos necesarios. Preferimos quedarnos cortos:
 * pasarse significa prometer una tanda que luego se cae con un aviso.
 *
 * @param {number} disponibles platos del pool con esa base
 * @param {{semanas?: number, huecosLibres?: number}} opts
 */
export function topeDeBase(disponibles, {
  semanas = 1, huecosLibres = null, objetivos = null,
} = {}) {
  const porSemana = Math.floor((Number(disponibles) || 0) / Math.max(1, semanas));
  const topes = [porSemana, MAX_POR_SEMANA];
  if (huecosLibres != null) topes.push(huecosLibres);

  // Y los OBJETIVOS SEMANALES, que van al revés: son máximos.
  //
  // Cuatro bases consumen uno —pasta y pesto el de pasta_arroz, legumbre el de
  // legumbres, verdura asada el de verdura— y son dos mandos que se pueden
  // contradecir: pedir 3 de legumbre con el tope de legumbres en 2. Antes no
  // reventaba (la reparación respeta el máximo siempre) pero el usuario
  // recibía un aviso en vez de no poder pedirlo.
  //
  // Lo que cabe es: los platos de esta base que NO cuentan para ese objetivo,
  // más el propio tope. De los 31 platos de legumbre, 2 no cuentan para
  // `legumbres`, así que con el tope en 2 el límite real son 4.
  //
  // Una simplificación conocida: si DOS bases consumen el mismo objetivo
  // (pasta y pesto), cada una ve el tope entero y entre las dos pueden
  // pasarse. Corregirlo bien pide saber qué plato concreto va a cada hueco,
  // que es justo lo que aún no se sabe al mover un deslizador.
  for (const { tope, sinContar } of objetivos ?? []) {
    if (!(tope >= 0)) continue;
    topes.push(Math.floor((Number(sinContar) || 0) / Math.max(1, semanas)) + tope);
  }

  return Math.max(0, Math.min(...topes));
}

/**
 * Cuántos platos con cada base pide la casa esta semana.
 *
 * Sale del mismo sitio donde el selector del wizard escribe: el eje `base` de
 * la libreta. El valor ya no es un 0/1 sino CUÁNTOS huecos quieres de esa base
 * —entre 1 y MAX_POR_SEMANA—, y eso convierte una preferencia en una peticion
 * comprobable: "ponme dos de sofrito" se puede cumplir o no, y "me gusta el
 * sofrito" no.
 *
 * El sesgo de `lib/sesgos.js` sigue funcionando igual porque lee el SIGNO, no
 * el número: cualquier valor positivo empuja lo mismo.
 *
 * @returns {Record<string, number>} clave de base → huecos pedidos
 */
export function basesPedidas(sesgos) {
  const out = {};
  for (const [clave, valor] of Object.entries(sesgos?.base ?? {})) {
    const n = Math.round(Number(valor) || 0);
    // Cualquier positivo vale como "encendida", pero lo que se pide nunca baja
    // del mínimo que hace tanda: un 1 guardado por una versión vieja del
    // selector se lee como los dos que de verdad sirven.
    if (n > 0) out[clave] = Math.min(Math.max(n, MIN_POR_SEMANA), MAX_POR_SEMANA);
  }
  return out;
}

/**
 * El recorrido del deslizador: de 2 a 5 platos por semana con la misma base.
 *
 * Empieza en DOS y no en uno porque uno no es una tanda: ese plato lo cocinas
 * ese día y no hay nada que partir. Por eso encender una base ya la pone en
 * dos, y el deslizador solo sube desde ahí.
 *
 * Y para en cinco porque a partir de ahí la semana empieza a saber a lo mismo,
 * que es justo lo que el menú existe para evitar.
 */
export const MIN_POR_SEMANA = 2;
export const MAX_POR_SEMANA = 5;

/** Lo que trae el deslizador al encender una base: el mínimo que hace tanda. */
export const POR_DEFECTO_POR_SEMANA = MIN_POR_SEMANA;

/**
 * Cuántos platos tienen que compartir una base para que valga la pena sacarla
 * como tanda aparte.
 *
 * Dos, y no uno: cocinar el arroz de un solo plato no es batch cooking, es
 * cocinar. Proponerlo como "sesión" sería vender como ahorro lo que ya hacías.
 */
export const MIN_PLATOS_POR_BASE = 2;

/**
 * La sesión de batch cooking de una semana: qué bases cocinar, cuántas
 * raciones de cada una, cuánto se tarda y a qué huecos alimenta cada una.
 *
 * @param {object} plan        menuPlan[groupId]["<dia>-<comida>"] = {recipeId, eaters, ...}
 * @param {Map|object} recetasPorId  catálogo indexado por id
 * @param {{dias?: string[], comidas?: string[]}} opts  vocabulario de huecos
 * @returns {{ bases: Array, minutosTotales: number, ahorroTotal: number }}
 *   ordenado por ahorro descendente: lo que más tiempo devuelve, primero.
 */
export function sesionDeBases(plan, recetasPorId, opts = {}) {
  const dias = opts.dias ?? [];
  const comidas = opts.comidas ?? [];
  const claves = dias.flatMap((d) => comidas.map((c) => `${d}-${c}`));
  const get = (id) => (recetasPorId instanceof Map ? recetasPorId.get(id) : recetasPorId?.[id]);

  /** @type {Map<string, {base: object, raciones: number, huecos: Array}>} */
  const porBase = new Map();

  for (const groupId of Object.keys(plan ?? {})) {
    if (groupId.startsWith("_")) continue;
    const slots = plan[groupId];
    if (!slots) continue;

    for (const clave of claves) {
      const slot = slots[clave];
      if (!slot) continue;
      // Un hueco puede llevar primero y segundo: los dos pueden tener base.
      for (const rid of [slot.firstRecipeId, slot.recipeId]) {
        if (!rid) continue;
        const receta = get(catalogIdOfPlanRecipe(rid));
        const eaters = Math.max(1, Number(slot.eaters) || 1);
        // Un plato puede alimentar varias tandas a la vez: su fécula y su
        // sofrito. Contarlo en una sola dejaba la mitad del ahorro fuera.
        for (const base of basesDeReceta(receta)) {
          const entrada = porBase.get(base.id) ?? { base, raciones: 0, huecos: [] };
          entrada.raciones += eaters;
          entrada.huecos.push({ groupId, clave, recipeId: rid, nombre: receta.name, raciones: eaters });
          porBase.set(base.id, entrada);
        }
      }
    }
  }

  const bases = [];
  for (const entrada of porBase.values()) {
    if (entrada.huecos.length < MIN_PLATOS_POR_BASE) continue;
    // Las raciones van plato a plato, no sumadas: es lo que hace que el ahorro
    // se compare contra "una olla por plato" y no contra "una olla por ración".
    const t = tiempoDeBase(entrada.base, entrada.huecos.map((h) => h.raciones));
    bases.push({ ...entrada, ...t });
  }
  // Se ordena por el ahorro ACTIVO, no por el de reloj: lo que mas arriba
  // aparece tiene que ser lo que mas trabajo te quita, no lo que mas tiempo
  // pasa en el fuego. Con el orden viejo, una olla de legumbre (549 min de
  // reloj, 19 tuyos) tapaba a cualquier cosa que de verdad ahorrara manos.
  bases.sort((a, b) => b.ahorroActivo - a.ahorroActivo || b.ahorro - a.ahorro || b.raciones - a.raciones);

  return {
    bases,
    minutosTotales: bases.reduce((s, b) => s + b.minutos, 0),
    minutosActivosTotales: bases.reduce((s, b) => s + b.minutosActivos, 0),
    ahorroTotal: bases.reduce((s, b) => s + b.ahorro, 0),
    ahorroActivoTotal: bases.reduce((s, b) => s + b.ahorroActivo, 0),
  };
}

/**
 * Cuántos platos distintos del catálogo comparten cada base. Es el dato que
 * necesita el generador para SESGAR hacia platos que comparten olla — el eje
 * nuevo del que hablaba el batch cooking, y que no pelea con la variedad:
 * la variedad se mide en platos, el ahorro se mide en bases. Diez platos
 * distintos con tres bases no rompen ninguna regla de validateMenu.js.
 */
export function coberturaDeBases(recetas) {
  const conteo = new Map();
  for (const r of recetas ?? []) {
    for (const base of basesDeReceta(r)) {
      conteo.set(base.id, (conteo.get(base.id) ?? 0) + 1);
    }
  }
  return conteo;
}
