/**
 * El registro de franjas: qué huecos tiene un día, como DATOS.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Hoy las franjas ya salen de datos para PINTAR (`getDayMeals` en planner.js
 * las deriva de `data.meals` + `data.extraMeals`), pero sobre un vocabulario
 * cerrado de cinco etiquetas escritas a mano en cinco sitios distintos:
 * MEAL_META y MEAL_STYLE en Menu.jsx, MEAL_ICON en Onboarding.jsx,
 * ALL_DAY_MEALS y EXTRA_MEAL_LABELS en planner.js. Añadir una franja no era
 * una fila: eran cinco ediciones y un `switch` nuevo en cada renderer.
 *
 * ── Dónde está el aire, y dónde NO ────────────────────────────────────────
 * La flexibilidad vive en CUÁNTAS franjas hay y cómo se llaman, nunca en qué
 * significan. El modelo no inventa huecos: recibe la lista ya construida y
 * solo elige receta del catálogo para cada uno. Lo que rompería un hueco
 * inventado no es el modelo — son las reglas: las de validateMenu.js están
 * escritas en el vocabulario de comida_1 / comida_2 / cena ("nunca dos platos
 * de cuchara el mismo día", "la cena más ligera que la comida", "si la comida
 * llevó carne, la cena va de pescado").
 *
 * Por eso cada franja declara un `kind` —un arquetipo de hueco con semántica
 * ya escrita— y hereda sus reglas enteras. Una franja nueva ("Recena",
 * "Brunch") dice a cuál se parece y el motor no se entera de que es nueva. Lo
 * que este módulo NO puede dar es un `kind` nuevo con reglas nuevas: eso es
 * escribir reglas, y se hace en validateMenu.js.
 *
 * ── Los dos motores ───────────────────────────────────────────────────────
 * No todas las franjas se planifican igual, y la diferencia manda:
 *
 *   motor "ia"       comida y cena. Pasan por el planner, que las recibe como
 *                    slots con `slotId`. El vocabulario de slotId es CERRADO
 *                    (`${día}_comida_1|_comida_2|_cena`, ver el parser en
 *                    aiPlanner.js), así que aquí caben como mucho tres huecos
 *                    de esas tres formas por día. Una cuarta franja "ia" no
 *                    tiene dónde aterrizar: `slotIdDelMotor` devuelve null y
 *                    `validarFranjas` la reporta, en vez de tirarla en
 *                    silencio y dejar un hueco vacío sin explicación.
 *
 *   motor "off-menu" desayuno, merienda, postre. NO pasan por el modelo: se
 *                    resuelven de un pool determinista con `planKey`
 *                    "${día}-${Etiqueta}" (planExtraMealsForGroup), que no usa
 *                    el vocabulario de slotIds para nada. Por eso aquí el aire
 *                    es real y sin asteriscos: añadir una franja off-menu
 *                    nueva funciona hoy, solo necesita un pool.
 */

import { getMeals, getExtraMeals } from "./planner.js";

/**
 * Los arquetipos de hueco. Cinco, y no se añaden desde una config: cada uno
 * arrastra reglas que viven en otro fichero, así que inventar un kind sin
 * escribirlas sería prometer algo que el motor no cumple.
 *
 * `slotIdSuffix` es el contrato con aiPlanner: la única forma de slotId que
 * ese kind sabe producir. `position` es el campo homónimo del slot, que el
 * prompt del planner usa para decidir el mealRole exigible.
 */
export const KINDS = {
  primero: {
    id: "primero",
    motor: "ia",
    slotIdSuffix: "comida_1",
    position: "primero",
    mealRole: "primero",
    // El slider de tiempo lo lee el usuario como presupuesto de la comida
    // ENTERA, no por plato: el primero se lleva el 40%. Mismo reparto que
    // aiPlanner, y aquí para que un renderer pueda enseñarlo sin recalcularlo.
    cuotaTiempo: 0.4,
    etiqueta: "Primero",
  },
  segundo: {
    id: "segundo",
    motor: "ia",
    slotIdSuffix: "comida_2",
    position: "segundo",
    mealRole: "segundo",
    cuotaTiempo: 0.6,
    etiqueta: "Segundo",
  },
  unico: {
    id: "unico",
    motor: "ia",
    // Un plato único ocupa la comida entera: va en el slot _1 y el _2 no
    // existe ese día. No es "un primero más contundente".
    slotIdSuffix: "comida_1",
    position: "plato_unico",
    mealRole: "plato_unico",
    cuotaTiempo: 1,
    etiqueta: "Plato único",
  },
  cena: {
    id: "cena",
    motor: "ia",
    slotIdSuffix: "cena",
    position: null,
    mealRole: "cena",
    cuotaTiempo: 1,
    etiqueta: "Cena",
  },
  ligero: {
    id: "ligero",
    motor: "off-menu",
    slotIdSuffix: null,
    position: null,
    // Un pool aparte, aislado de comida/cena en filterRecipes igual que bebés.
    mealRole: null,
    cuotaTiempo: null,
    etiqueta: "Ligero",
  },
};

/** Los pools off-menu que existen hoy en el catálogo (ver recipeSchema.js). */
export const POOLS_OFF_MENU = ["desayunos", "meriendas", "postres"];

/**
 * La config por defecto: reproduce EXACTAMENTE las franjas de hoy, en el orden
 * natural del día que ya usa `getDayMeals`. Mientras nadie la edite, el menú
 * generado es idéntico al de antes de que este fichero existiera.
 *
 * `flag` es dónde vive el on/off de esa franja en `data`, porque hoy están en
 * dos sitios distintos y por buenas razones: `data.meals` infla el presupuesto
 * de slots del modelo, `data.extraMeals` no. La franja lo declara en vez de
 * que cada renderer tenga que acordarse.
 */
export const FRANJAS_POR_DEFECTO = [
  {
    id: "desayuno",
    label: "Desayuno",
    kind: "ligero",
    pool: "desayunos",
    flag: "extraMeals",
    orden: 10,
  },
  {
    id: "comida",
    label: "Comida",
    kind: "comida",
    flag: "meals",
    orden: 20,
  },
  {
    id: "merienda",
    label: "Merienda",
    kind: "ligero",
    pool: "meriendas",
    flag: "extraMeals",
    orden: 30,
  },
  {
    id: "cena",
    label: "Cena",
    kind: "cena",
    flag: "meals",
    orden: 40,
  },
  {
    id: "postre",
    label: "Postre",
    kind: "ligero",
    pool: "postres",
    flag: "extraMeals",
    orden: 50,
  },
];

/**
 * `kind: "comida"` es el único que no es un arquetipo de hueco sino de FRANJA:
 * se abre en uno o dos huecos según la estructura del día. Se resuelve en
 * `huecosDeFranja`, así que no está en KINDS — meterlo ahí obligaría a que
 * todo consumidor de KINDS supiera que uno de ellos no tiene slotIdSuffix.
 */
const KIND_COMIDA = "comida";

/** ¿Es una franja de mediodía (la que se abre en primero + segundo)? */
export function esComida(franja) {
  return franja?.kind === KIND_COMIDA;
}

/**
 * Las franjas activas para esta casa, ordenadas. Lee los mismos flags que
 * `getDayMeals` para que la pantalla nueva y la vieja coincidan siempre: si
 * divergieran, el usuario vería un desayuno en una y no en la otra sin que
 * nadie hubiera tocado nada.
 */
export function franjasActivas(data, franjas = FRANJAS_POR_DEFECTO) {
  const principales = new Set(getMeals(data));
  const extras = new Set(getExtraMeals(data));
  return [...franjas]
    .filter((f) => (f.flag === "meals" ? principales.has(f.label) : extras.has(f.label)))
    .sort((a, b) => a.orden - b.orden);
}

/**
 * En qué huecos se abre una franja para un día concreto.
 *
 * `estructura` y `rapida` son las dos excepciones que ya maneja aiPlanner: la
 * primera es la preferencia de la casa (`data.mealStructure`, o el override
 * por grupo), la segunda es la marca a mano de ese día
 * (`data.slotType["Lun|Comida"]`). Se pasan como argumento en vez de leerse de
 * `data` aquí porque el override por grupo lo resuelve quien llama, que es el
 * único que sabe de qué grupo está hablando.
 */
export function huecosDeFranja(franja, { estructura = "primero_segundo", rapida = false } = {}) {
  if (!franja) return [];

  if (esComida(franja)) {
    // Rápida y plato único colapsan la comida en un solo hueco, pero por
    // motivos distintos: "unico" porque el plato ES la comida entera, "rapida"
    // porque no da tiempo a dos. Comparten forma de slot y no significado, así
    // que el preferType los separa para el prompt.
    if (estructura === "unico" || estructura === "1_plato") {
      return [{ kind: "unico", franja: franja.id, preferType: "plato_unico" }];
    }
    if (rapida) {
      return [{ kind: "unico", franja: franja.id, preferType: "comida_rapida" }];
    }
    return [
      { kind: "primero", franja: franja.id, preferType: null },
      { kind: "segundo", franja: franja.id, preferType: null },
    ];
  }

  if (franja.kind === "cena") {
    return [{ kind: "cena", franja: franja.id, preferType: rapida ? "cena_rapida" : null }];
  }

  return [{ kind: franja.kind, franja: franja.id, preferType: null, pool: franja.pool ?? null }];
}

/**
 * El slotId que el motor entiende para este hueco, o null si no hay ninguno.
 *
 * Null NO es un error del que llama: es la respuesta honesta a "el motor de
 * hoy no sabe planificar esto". Dos casos, y conviene no confundirlos —
 * `motivoSinMotor` los distingue:
 *   · un hueco off-menu, que no usa slotIds y se planifica por otro camino;
 *   · un cuarto hueco "ia" en un día que ya gastó las tres formas de slotId.
 */
export function slotIdDelMotor(hueco, daySlug) {
  const kind = KINDS[hueco?.kind];
  if (!kind || kind.motor !== "ia" || !kind.slotIdSuffix) return null;
  return `${daySlug}_${kind.slotIdSuffix}`;
}

/**
 * Por qué una franja no llega al motor, o null si sí llega. Pensado para
 * pintarse en la UI: una franja que no se planifica tiene que decirlo en su
 * card, no aparecer vacía como si la generación hubiera fallado.
 */
export function motivoSinMotor(franja) {
  if (!franja) return "no existe";
  if (franja.kind === "ligero") {
    if (!POOLS_OFF_MENU.includes(franja.pool)) {
      return `necesita un pool del catálogo (${POOLS_OFF_MENU.join(", ")})`;
    }
    return null;
  }
  if (esComida(franja) || KINDS[franja.kind]?.motor === "ia") return null;
  return `"${franja.kind}" no es un arquetipo de hueco conocido`;
}

/**
 * Revisa una config entera y devuelve los problemas, en español y listos para
 * enseñarse. Vacío = la config es planificable tal cual.
 *
 * El chequeo que de verdad importa es el del cupo de slotIds: dos franjas "ia"
 * que producen el mismo `slotIdSuffix` se pisarían la una a la otra dentro del
 * planner, y el síntoma sería un hueco que aparece vacío sin motivo. Vale más
 * decirlo aquí.
 */
export function validarFranjas(franjas = FRANJAS_POR_DEFECTO) {
  const problemas = [];
  const vistos = new Set();
  const sufijos = new Map();

  for (const f of franjas) {
    if (vistos.has(f.id)) problemas.push(`La franja "${f.id}" está repetida.`);
    vistos.add(f.id);

    const motivo = motivoSinMotor(f);
    if (motivo) problemas.push(`«${f.label}» no se puede planificar: ${motivo}.`);

    for (const hueco of huecosDeFranja(f)) {
      const kind = KINDS[hueco.kind];
      if (!kind || kind.motor !== "ia") continue;
      const previa = sufijos.get(kind.slotIdSuffix);
      if (previa && previa !== f.id) {
        problemas.push(
          `«${f.label}» y «${franjas.find((x) => x.id === previa)?.label ?? previa}» ` +
            `caen en el mismo hueco del motor (${kind.slotIdSuffix}): solo se planificará una.`,
        );
      } else {
        sufijos.set(kind.slotIdSuffix, f.id);
      }
    }
  }

  return problemas;
}

/** La franja de una etiqueta ("Comida"), para puentear con el código de hoy. */
export function franjaDeEtiqueta(label, franjas = FRANJAS_POR_DEFECTO) {
  return franjas.find((f) => f.label === label) ?? null;
}

/** Las etiquetas activas, en orden — el equivalente de `getDayMeals(data)`. */
export function etiquetasActivas(data, franjas = FRANJAS_POR_DEFECTO) {
  return franjasActivas(data, franjas).map((f) => f.label);
}
