/**
 * FORMATO y TEMPERATURA de un plato — los ejes 6 y 7 del registro.
 *
 * Son las dos preguntas que `category` escondía y que el documento señala con
 * un ejemplo que no se puede contestar sin ellas: entre nueve legumbres
 * conviven «Lentejas con verduras» (guiso caliente) y «Ensalada de garbanzos
 * con chorizo» (fría) con la MISMA firma en todos los ejes que existían.
 *
 * ── Por qué esto es un regex sobre el nombre, después de todo lo dicho ─────
 *
 * Porque aquí el nombre no es un atajo: es el dato. Un plato que se llama
 * «Sopa de cebolla» ES una sopa, y quien lo escribió lo estaba declarando. Es
 * lo contrario de `/^sal/` casando «salmón», donde la palabra era una
 * coincidencia de letras.
 *
 * Aun así se mide en vez de suponerse, y lo que no se puede leer NO SE INVENTA:
 *
 *   ABSTENCIÓN DELIBERADA EN `olla`. La técnica no dice el formato. Entre las
 *   172 recetas de olla sin señal en el nombre conviven «Brócoli al vapor en
 *   árbol» (plato seco) y «Ternera guisada con zanahorias» (guiso), y ninguna
 *   pista las separa. Se devuelve null y se marca, que es la respuesta.
 *
 * ── El ámbito, y la limitación que lleva escrita ──────────────────────────
 *
 * El registro declara `formato` de ámbito PARTE, porque «Lomo a la plancha con
 * ensalada» tiene un principal seco y una guarnición que es ensalada. Esto
 * devuelve el formato de la receta ENTERA, que es el de su parte principal, y
 * eso solo es completo mientras el plato tenga una sola parte. Cuando
 * `stepsRich[].part` suba del 17 % actual, esta función pasa a correr por
 * parte y el valor de receta queda como el de su principal.
 */

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * El nombre declara el formato. Orden de prueba: de lo más específico a lo
 * más general, porque «Crema de calabaza» es cremoso y no sopa aunque las dos
 * palabras describan algo líquido.
 */
const POR_NOMBRE = [
  ["ensalada", /\bensalada|\bensaladilla\b|\bsalpicon\b|\btabule\b/],
  ["cremoso", /\bcrema\b|\bcremas\b|\bpure\b|\bpures\b|\bvichyssoise\b|\bhummus\b|\bmousse\b|\bnatillas\b|\bporridge\b|\bpapilla\b|\bbabaganush\b|\bmuhammara\b/],
  ["sopa", /\bsopa\b|\bcaldo\b|\bconsome\b|\bgazpacho\b|\bsalmorejo\b|\bajoblanco\b|\bbisque\b|\bbullabesa\b|\bsuquet\b|\bvelout|\bminestrone\b/],
  // «guisada» faltaba en la primera versión y se llevaba por delante a «Ternera
  // guisada», «Carne guisada» y a media docena más que el nombre declaraba.
  ["guiso", /\bguiso\b|\bguisad|\bpotaje\b|\bestofad|\bcocido\b|\bfabada\b|\bmarmitako\b|\bcallos\b|\bpepitoria\b|\ben salsa\b|\bal vino\b|\ba la vizcaina\b|\bcazuela\b|\bcaldos[oa]\b|\bragu\b|\bcurry\b|\bchilindron\b|\bescabech/],
];

/**
 * Sin señal en el nombre, la técnica solo sirve para DESCARTAR líquido.
 *
 * Una plancha, un horno o una sartén no dejan salsa libre salvo que el nombre
 * lo diga, y si lo dijera ya habría casado arriba. La olla no está: ahí es
 * donde viven a la vez el vapor y el guiso.
 */
const TECNICA_SECA = new Set(["plancha", "horno", "sarten", "crudo"]);

/**
 * @param {{name?: string, tecnica?: string}} receta
 * @returns {{valor: string|null, via: string, duda: string|null}}
 */
/**
 * LA CABEZA DEL NOMBRE, que es lo único que habla del plato.
 *
 * Un nombre de receta enumera: primero lo que es, luego con qué va. Y si se
 * busca el formato en el nombre entero, lo que se encuentra es el de la
 * GUARNICIÓN. Medido sobre una muestra de 30, cuatro errores y los cuatro
 * iguales:
 *
 *   «Costillas glaseadas CON PURÉ de boniato»   → cremoso   (el puré acompaña)
 *   «Salmón a la plancha CON PURÉ de boniato»   → cremoso
 *   «Atún a la plancha CON ENSALADA de tomate»  → ensalada  (el atún es seco)
 *   «Croquetas DE COCIDO de la abuela»          → guiso     (el cocido rellena)
 *
 * Es el problema del ámbito PARTE asomando en el operador: el nombre sí trae
 * los dos formatos, y coger el segundo es peor que no coger ninguno.
 *
 * Así que se corta por « con » —lo que viene después acompaña— y por el primer
 * « de » —lo que viene después es de qué está hecho, no qué es—. Lo que queda
 * es el sustantivo del plato. «Tagliatelle al ragú» sobrevive entero porque
 * «al» describe cómo se hace, no qué lo acompaña.
 */
function cabeza(nombre) {
  return nombre.split(/ con | de /)[0];
}

export function formatoDe(receta) {
  const n = cabeza(norm(receta?.name));
  for (const [valor, re] of POR_NOMBRE) {
    if (re.test(n)) return { valor, via: "lo dice la cabeza del nombre", duda: null };
  }
  if (TECNICA_SECA.has(receta?.tecnica)) {
    return { valor: "plato_seco", via: `técnica ${receta.tecnica}: no deja salsa libre`, duda: null };
  }
  return {
    valor: null,
    via: "SIN DECIDIR",
    duda: receta?.tecnica === "olla"
      ? `«${receta?.name}» se hace en olla y el nombre no dice si es guiso o no: en olla conviven el vapor y el estofado`
      : `«${receta?.name}» no tiene técnica ni señal en el nombre`,
  };
}

/** Lo que se sirve frío, dicho por el nombre. */
const NOMBRE_FRIO = /\bgazpacho\b|\bsalmorejo\b|\bajoblanco\b|\bvichyssoise\b|\bceviche\b|\btartar\b|\bcarpaccio\b|\bahumad|\bsorbete\b|\bhelad|\bsalmorejo\b|\bescabech|\bmarinad|\bcurad|\bgravlax\b/;
const NOMBRE_TEMPLADO = /\btemplad/;

/**
 * @param {{name?: string, tecnica?: string}} receta
 * @returns {{valor: string|null, via: string, duda: string|null}}
 */
export function temperaturaDe(receta, formato = null) {
  const n = norm(receta?.name);
  // Una ensalada NO se sirve caliente. 44 del catálogo se cocinan —se hierve la
  // patata de la campera, se asan los garbanzos— y la técnica las mandaba a
  // «caliente». Templada es lo más que llega una ensalada.
  if (formato === "ensalada") {
    return receta?.tecnica && receta.tecnica !== "crudo"
      ? { valor: "templado", via: "ensalada con algo cocinado dentro", duda: null }
      : { valor: "frio", via: "ensalada cruda", duda: null };
  }
  // El nombre manda sobre la técnica: un escabeche se cocina y se come frío.
  if (NOMBRE_TEMPLADO.test(n)) return { valor: "templado", via: "lo dice el nombre", duda: null };
  if (NOMBRE_FRIO.test(n)) return { valor: "frio", via: "lo dice el nombre", duda: null };
  if (receta?.tecnica === "crudo") return { valor: "frio", via: "técnica cruda", duda: null };
  if (receta?.tecnica) return { valor: "caliente", via: `técnica ${receta.tecnica}`, duda: null };
  return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» no tiene técnica y el nombre no dice temperatura` };
}
