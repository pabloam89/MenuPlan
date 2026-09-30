/**
 * EL CONTEXTO DE LA PETICIÓN — el eje 39, que no faltaba: estaba disperso.
 *
 * Es el único eje de los 49 que NO describe un plato ni un alimento, sino la
 * situación desde la que alguien pide de comer. «Es martes, somos cuatro, hay
 * niños y no tengo ganas» no es una propiedad de ninguna receta: es el marco
 * que hace buena o mala a cada una.
 *
 * ── Por qué es un eje y no una lista de parámetros ────────────────────────
 *
 * Porque ya se recoge TODO, y en ningún sitio se llama contexto. `filterRecipes`
 * declara quince argumentos sueltos —`hasKids`, `maxTime`, `cookLevel`,
 * `eaters`, `kitchenTools`, `pantryIngredients`…— y cada consumidor los vuelve
 * a pasar uno a uno. Eso funciona mientras solo haya un consumidor. En cuanto
 * llegue el modo chat habrá dos, y quince parámetros que viajan sueltos entre
 * dos sitios se desincronizan: uno añade `etapasBebe` y el otro no se entera.
 *
 * Así que esto no CURA nada ni pide un dato nuevo. Le pone nombre a lo que ya
 * se sabe, lo interpreta una vez —«20 minutos» pasa a ser `prisa: "mucha"`— y
 * deja un objeto que se puede enseñar, registrar y leer entero.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 *
 * No decide nada. No filtra, no puntúa y no habla con el catálogo: traduce la
 * petición a un vocabulario y se calla. Quien elige sigue siendo el motor.
 */

/**
 * El reloj que el usuario declara, dicho en palabras.
 *
 * Los cortes salen de `COOK_TIME_DEFAULTS`, que ya usa la app: 30 minutos entre
 * semana y 60 el fin de semana. Por debajo del diario hay prisa de verdad; por
 * encima del de finde, no hay ninguna.
 */
function prisaDe(maxTime) {
  if (maxTime == null) return null;
  if (maxTime <= 20) return "mucha";
  if (maxTime <= 35) return "normal";
  if (maxTime <= 60) return "poca";
  return "ninguna";
}

/**
 * Cuántas manos y cuánta paciencia. `cookLevel` ya tiene tres valores y este
 * eje los respeta en vez de inventarse otros: `basic` solo acepta `facil`,
 * `normal` añade `normal`, y `pro` no descarta nada.
 */
const GANAS_POR_NIVEL = { basic: "pocas", normal: "normales", pro: "muchas" };

/**
 * El momento de la semana, que cambia qué es razonable pedir.
 *
 * No es un dato del usuario: es el día que el menú va a ocupar, y la app ya lo
 * sabe porque construye la semana. Se recoge aquí porque una misma petición
 * significa cosas distintas un martes y un sábado, y hoy esa diferencia vive
 * suelta en `validateMenu` como `WEEKDAY_SLUGS`.
 */
const FINDE = new Set(["sabado", "domingo"]);

/**
 * @param {object} opts  lo que la app ya recoge, tal cual
 * @returns {{valor: object, via: string, duda: string|null}}
 */
export function contextoDe({
  maxTime = null,
  cookLevel = null,
  eaters = null,
  hasKids = false,
  isBabyGroup = false,
  dia = null,
  kitchenTools = [],
  pantryIngredients = [],
} = {}) {
  const prisa = prisaDe(maxTime);
  const momento = dia ? (FINDE.has(dia) ? "finde" : "entre_semana") : null;

  // Lo que falta se dice, no se rellena con un valor por defecto que luego
  // alguien lea como si el usuario lo hubiera contestado.
  const huecos = [];
  if (prisa === null) huecos.push("maxTime");
  if (!cookLevel) huecos.push("cookLevel");
  if (eaters == null) huecos.push("eaters");
  if (!momento) huecos.push("dia");

  return {
    valor: {
      prisa,
      ganas: GANAS_POR_NIVEL[cookLevel] ?? null,
      comensales: eaters,
      conNinos: Boolean(hasKids),
      esBebe: Boolean(isBabyGroup),
      momento,
      // Dos señales que ya se recogen y que nadie llamaba contexto: con qué
      // cocina y qué tiene en casa. La segunda solo como cuánto, no qué:
      // la lista entera es del pedido, no de la situación.
      trastos: kitchenTools.length,
      despensa: pantryIngredients.length,
    },
    via: "lo que la app ya recoge, traducido a vocabulario",
    duda: huecos.length ? `sin declarar: ${huecos.join(", ")}` : null,
  };
}

/**
 * Si la petición admite un plato de ocasión.
 *
 * `occasion: "especial"` existe en 52 recetas y `validateMenu` ya las castiga
 * entre semana (`plato_ocasion_entre_semana`). Esa regla es exactamente este
 * eje, escrita dentro del validador: aquí se saca para que se pueda preguntar
 * antes de armar el menú, y no solo reprochar después.
 */
export function admiteOcasion(contexto) {
  const c = contexto?.valor ?? contexto;
  if (!c?.momento) return null;
  return c.momento === "finde";
}
