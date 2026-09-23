/**
 * Los ejes que ya estaban en el catálogo sin que nadie los hubiera sacado.
 *
 * El registro (src/data/axisRegistry.js) declara 49 ejes y 33 no existen como
 * campo. Pero no todos cuestan lo mismo: de esos 33 hay un grupo cuya materia
 * prima YA está al 92-100 % —los macros de la receta, `stepsRich[].kind`, la
 * taxonomía del alimento— y lo único que falta es la función que la lee.
 *
 * Este módulo son esas funciones. NO escriben campos en los JSON, y eso es
 * deliberado: un campo derivado que se materializa es un campo que se
 * desincroniza de su operador en cuanto alguien toca una receta y no regenera
 * —es la historia de `mainBase`, y el catálogo ya la pagó—. Aquí se calcula al
 * preguntar, como `healthFlags`, y la única verdad es la fuente.
 *
 * REGLA DE LA CASA, la misma que en `formato.js`: cuando el dato no alcanza
 * para decidir, se devuelve `null` y se dice por qué. Un eje que contesta
 * siempre no es un eje al 100 %, es un eje que miente en la cola.
 */

import { composicionDe, ejeProteina, ejeHidrato } from "./composicion.js";
import { ESCALA_POR_TECNICA } from "../../data/recipeSchema.js";
import alimentos from "../../data/alimentos.json";
import alimentoPorIngrediente from "../../data/alimentoPorIngrediente.json";

const porId = new Map(alimentos.map((a) => [a.id, a]));
const alimentoDe = (ingredientId) =>
  porId.get(alimentoPorIngrediente[ingredientId] ?? ingredientId) ?? null;

const clasesDe = (receta) =>
  (receta?.ingredients ?? [])
    .map((l) => alimentoDe(l.ingredientId)?.taxonomia)
    .filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// Eje 24 · Tiempo activo vs tiempo de calendario
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los minutos con las MANOS PUESTAS, que no son los del reloj.
 *
 * `time` dice cuánto tarda el plato de principio a fin, y para un guiso de
 * cuatro horas eso es una cifra que asusta y que además es falsa como medida
 * de esfuerzo: las cuatro horas son cuatro horas en las que no estás en la
 * cocina. La pregunta que la gente hace de verdad —«¿cuánto me va a llevar
 * ESTO?»— la contesta este eje y no `time`.
 *
 * Cuenta `prep`, `activo` y `emplatado`. Los dos primeros son obvios; el
 * emplatado son manos aunque sean dos minutos.
 *
 * NO cuenta `pasivo` ni `espera`, que son precisamente lo que `time` infla, ni
 * `opcional`, que por definición puede no hacerse.
 *
 * Y NO CUENTA `paralelo`, aunque la primera versión sí lo hacía. `paralelo` no
 * quiere decir «trabajo simultáneo» sino «esto pasa a la vez que lo otro», y lo
 * que más veces pasa a la vez es un horno precalentándose solo: en el «Tumbet
 * mallorquín» son 10 de los 58 minutos que salían. Un precalentado no son manos.
 *
 * ── LO QUE ESTE NÚMERO NO ES ──────────────────────────────────────────────
 * Es la SUMA DEL TRABAJO, no los minutos que estarás de pie. En 87 recetas
 * supera el `time` declarado, y no porque `time` mienta: es que una receta
 * solapa —mientras se fríe la berenjena se escurre la patata— y los dos pasos
 * suman sus minutos por separado aunque ocurran a la vez.
 *
 * Sirve para comparar dos platos, que es para lo que se pregunta. Para saber
 * cuánto tiempo real ocupa harían falta las dependencias entre pasos, y el
 * catálogo no las tiene: `paralelo` marca simultaneidad pero también lo llevan
 * los precalentados, así que no distingue lo que habría que distinguir.
 *
 * @returns {{valor: number|null, via: string, duda: string|null}}
 */
const MANOS_PUESTAS = new Set(["prep", "activo", "emplatado"]);

export function tiempoActivoDe(receta) {
  const pasos = receta?.stepsRich ?? [];
  if (!pasos.length) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» no tiene pasos ricos` };
  }
  // Un paso sin minutos no se puede sumar, y suponerle cero lo haría
  // desaparecer del total en silencio. Si falta más de un 20 % de los pasos, el
  // número resultante no describe la receta.
  const conMinutos = pasos.filter((s) => s?.minutes != null);
  if (conMinutos.length < pasos.length * 0.8) {
    return {
      valor: null,
      via: "SIN DECIDIR",
      duda: `«${receta?.name}»: solo ${conMinutos.length} de ${pasos.length} pasos declaran minutos`,
    };
  }
  const activo = conMinutos
    .filter((s) => MANOS_PUESTAS.has(s.kind))
    .reduce((a, s) => a + s.minutes, 0);
  return { valor: activo, via: "suma de los pasos con las manos puestas", duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 20 · Apto vigilia  ·  Eje 19 · Restricción religiosa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VIGILIA: sin carne. El pescado sí, y ese es justo el matiz que lo hace un eje
 * y no un sinónimo de vegetariano.
 *
 * Cuelga de `taxonomia.clase`, que está al 100 % en los 396 alimentos, así que
 * se puede contestar del catálogo entero. Las clases que lo rompen son
 * `mamifero`, `ave` y `viscera` — y `viscera` está porque unos callos son
 * carne aunque el árbol los cuelgue aparte.
 *
 * El caldo de carne cuenta: un caldo de pollo no es vigilia por mucho que el
 * pollo ya no esté en el plato.
 */
const CLASES_CARNE = new Set(["mamifero", "ave", "viscera"]);

export function aptoVigiliaDe(receta) {
  const t = clasesDe(receta);
  const lineas = (receta?.ingredients ?? []).length;
  if (!lineas) return { valor: null, via: "SIN DECIDIR", duda: "sin ingredientes" };
  // Si no se resuelve la taxonomía de casi todas las líneas, la respuesta
  // «no lleva carne» puede ser solo «no vi la carne».
  if (t.length < lineas * 0.9) {
    return {
      valor: null,
      via: "SIN DECIDIR",
      duda: `«${receta?.name}»: solo ${t.length} de ${lineas} líneas resuelven su alimento`,
    };
  }
  const carne = t.find((x) => CLASES_CARNE.has(x.clase));
  return carne
    ? { valor: false, via: `lleva ${carne.clase} (${carne.especie ?? "sin especie"})`, duda: null }
    : { valor: true, via: "ninguna línea es mamífero, ave ni víscera", duda: null };
}

/**
 * SIN CERDO. Se deriva; halal y kosher NO, y conviene que quede escrito.
 *
 * El eje 19 del registro se llama «Halal / kosher / sin cerdo / sin alcohol», y
 * de esas cuatro solo dos salen del catálogo. Halal y kosher no son una lista
 * de ingredientes: son cómo se sacrificó el animal y cómo se separó la vajilla,
 * y eso no está en ningún dato de este repo ni puede estarlo. Derivarlos de
 * «no lleva cerdo» sería dar por apto lo que no lo es, en un eje donde
 * equivocarse es faltar al respeto a alguien.
 */
const ESPECIES_CERDO = new Set(["cerdo", "jabali"]);

/**
 * EL EMBUTIDO ES CERDO AUNQUE EL ÁRBOL NO LO DIGA, y esto costó un test.
 *
 * La taxonomía cuelga el chorizo, el bacon, el jamón y el fuet de
 * `subclase: "embutido"` con `especie: "chorizo"`, `"bacon"`… — o sea que su
 * especie es el producto, no el animal. Buscar `especie === "cerdo"` daba «sin
 * cerdo» a un plato con chorizo, que es el falso negativo más caro posible en
 * un eje que existe para que alguien no se coma lo que no quiere comer.
 *
 * La excepción es la misma que ya reconoce `ejeProteina` en composicion.js: el
 * pastrami es ternera. Se nombra aquí en vez de importarse porque aquella
 * función devuelve el eje de la proteína, no el animal, y son preguntas
 * distintas que casualmente comparten una respuesta.
 */
const EMBUTIDOS_NO_CERDO = new Set(["pastrami", "cecina", "pavo"]);

export function sinCerdoDe(receta) {
  const t = clasesDe(receta);
  const lineas = (receta?.ingredients ?? []).length;
  if (!lineas || t.length < lineas * 0.9) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}»: taxonomía incompleta` };
  }
  const cerdo = t.find((x) =>
    ESPECIES_CERDO.has(x.especie) ||
    x.subclase === "carne_cerdo" ||
    (x.subclase === "embutido" && !EMBUTIDOS_NO_CERDO.has(x.especie)));
  return cerdo
    ? { valor: false, via: `lleva ${cerdo.especie ?? cerdo.subclase}`, duda: null }
    : { valor: true, via: "ninguna línea es cerdo, jabalí ni embutido de cerdo", duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 11 · Completitud — ¿es comida entera?
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Si el plato se sostiene solo, o pide algo al lado.
 *
 * Sale del vector de composición, que está al 100 %: un plato es completo
 * cuando trae PROTEÍNA, HIDRATO y VERDURA. No es una opinión nutricional, es la
 * misma tríada con la que el planificador arma un menú, y por eso el eje
 * contesta a «¿esto es una cena?» sin preguntarle a nadie.
 *
 * `verdura` se cuenta por masa y no por presencia: dos hojas de perejil no
 * hacen completo un plato. El umbral son 40 g por ración, que es lo que ocupa
 * una guarnición de verdura de verdad frente a un aliño.
 */
const VERDURA_MINIMA_G = 40;

export function completitudDe(receta) {
  const v = composicionDe(receta);
  if (!v || !(v.masaTotal > 0)) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» no tiene vector` };
  }
  const raciones = receta?.baseServings || 2;
  const tiene = { proteina: v.proteina.size > 0, hidrato: v.hidrato.size > 0, verdura: false };

  for (const linea of receta?.ingredients ?? []) {
    const t = alimentoDe(linea.ingredientId)?.taxonomia;
    if (!t) continue;
    if (t.clase !== "hortaliza" && t.clase !== "hongo" && t.clase !== "alga") continue;
    if (ejeProteina(t) || ejeHidrato(t)) continue; // la patata es hidrato, no verdura
    const g = (linea.unit === "g" || linea.unit === "ml" ? linea.amount : 0) / raciones;
    if (g >= VERDURA_MINIMA_G) { tiene.verdura = true; break; }
  }

  const faltan = Object.entries(tiene).filter(([, v2]) => !v2).map(([k]) => k);
  return faltan.length
    ? { valor: false, via: `le falta ${faltan.join(" y ")}`, duda: null }
    : { valor: true, via: "trae proteína, hidrato y verdura", duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 3 · Densidad nutricional
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuánto alimenta cada 100 g, y cuánta proteína trae cada 100 kcal.
 *
 * Los dos números salen de campos al 100 %: `kcal` y los macros de la receta,
 * divididos por la masa servida. El segundo es el que de verdad separa platos
 * —un plato puede ser denso en calorías y pobre en proteína, y eso es
 * exactamente lo que alguien quiere saber cuando pregunta «algo que llene»—.
 */
export function densidadDe(receta) {
  const v = composicionDe(receta);
  const masa = v?.masaTotal;
  if (!(masa > 0) || !(receta?.kcal > 0)) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» sin masa o sin kcal` };
  }
  const raciones = receta.baseServings || 2;
  const kcalTotales = receta.kcal * raciones;
  return {
    valor: {
      kcal100g: +(100 * kcalTotales / masa).toFixed(1),
      proteinaPor100kcal: receta.protein_g != null
        ? +(100 * receta.protein_g / receta.kcal).toFixed(2)
        : null,
    },
    via: "kcal y macros de la receta sobre la masa servida",
    duda: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 10 · Carga / saciedad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuánto llena, que no es cuánto engorda.
 *
 * Lo que sacia no son las calorías: son la PROTEÍNA y la FIBRA, y el volumen.
 * Un plato de 600 kcal de pasta con nata deja con hambre a las dos horas y uno
 * de 400 con legumbre y verdura no, y esa diferencia es la que alguien busca
 * cuando dice «algo que llene» o «algo ligero».
 *
 * Sale de `protein_g` y `fiber_g` por ración, que están en 910 de 1.033. No se
 * inventa una fórmula de saciedad —hay media docena publicadas y ninguna es
 * consenso—: se devuelven los dos gramajes y los gramos servidos, y quien
 * pregunte decide. Un índice compuesto aquí sería inventarse autoridad.
 */
export function cargaDe(receta) {
  if (receta?.protein_g == null || receta?.fiber_g == null) {
    return {
      valor: null,
      via: "SIN DECIDIR",
      duda: `«${receta?.name}» no declara proteína o fibra por ración`,
    };
  }
  const v = composicionDe(receta);
  const raciones = receta.baseServings || 2;
  const gramosRacion = v?.masaTotal > 0 ? Math.round(v.masaTotal / raciones) : null;
  return {
    valor: {
      proteina_g: receta.protein_g,
      fibra_g: receta.fiber_g,
      gramos: gramosRacion,
      // Los dos que de verdad separan platos, por cada 100 kcal.
      proteinaPor100kcal: receta.kcal > 0 ? +(100 * receta.protein_g / receta.kcal).toFixed(2) : null,
      fibraPor100kcal: receta.kcal > 0 ? +(100 * receta.fiber_g / receta.kcal).toFixed(2) : null,
    },
    via: "proteína y fibra por ración sobre las kcal",
    duda: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 25 · Esfuerzo mental / número de componentes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuántas cosas hay que llevar a la vez en la cabeza.
 *
 * No es la dificultad —`difficulty` ya existe y la cura una persona— ni el
 * tiempo. Es la carga de atención: una receta de quince pasos con tres
 * componentes que se cruzan cansa más que una de veinte pasos en línea, aunque
 * las dos pongan «normal».
 *
 * Tres señales, todas de campos que ya están: cuántos INGREDIENTES hay que
 * tener controlados, cuántos PASOS, y cuántas PARTES distintas se cocinan a la
 * vez. La tercera es la que más pesa y la que menos cobertura tiene (`part` al
 * 24 %), así que se devuelve aparte en vez de mezclarse en un número: con una
 * sola cifra no se sabría si un 7 viene de muchos pasos o de tres cacerolas.
 */
export function esfuerzoDe(receta) {
  const pasos = receta?.stepsRich ?? [];
  const ingredientes = (receta?.ingredients ?? []).length;
  if (!pasos.length || !ingredientes) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» sin pasos o sin ingredientes` };
  }
  const partes = new Set(pasos.map((s) => s?.part).filter(Boolean));
  return {
    valor: {
      ingredientes,
      pasos: pasos.length,
      // null y no 0: que no haya `part` no quiere decir un solo componente,
      // quiere decir que nadie lo miró. Es la diferencia que el catálogo pagó
      // cara en recipeParts, contando 442 recetas juzgadas como sin mirar.
      componentes: partes.size || null,
      // Los pasos que se cruzan con otros: lo que obliga a vigilar dos cosas.
      simultaneos: pasos.filter((s) => s?.kind === "paralelo").length,
    },
    via: "ingredientes, pasos, partes y pasos simultáneos",
    duda: partes.size ? null : `«${receta?.name}» no tiene \`part\`: los componentes no se saben`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 26 · Conflicto de recursos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qué OCUPA el plato mientras se hace, para saber si dos platos se estorban.
 *
 * El conflicto no es una propiedad de una receta: es de un par. Lo que sí es
 * de la receta es el recurso que reserva, y eso es lo que devuelve esto — quien
 * arme un menú compara.
 *
 * Sale de `tecnica`, que está al 88,3 %, y NO de los marcadores `{{@Aparato}}`
 * aunque parecieran el sitio natural: están en el 42,9 % de las recetas y son
 * casi todos «Sartén» (386 de 515). Con esa distribución no distinguen nada, y
 * un eje derivado de ellos habría dicho «fuego» a casi todo con cara de
 * medido.
 *
 * `requiredAppliance` y `methods` NO entran: el primero dice qué hace falta
 * TENER y el segundo son alternativas que el usuario aún no ha elegido.
 * Ninguna de las dos contesta qué se ocupa mientras cocinas la versión base.
 */
const RECURSO_POR_TECNICA = {
  horno: "horno",
  olla: "fuego",
  sarten: "fuego",
  plancha: "fuego",
  crudo: "ninguno",
};

export function recursoDe(receta) {
  const r = RECURSO_POR_TECNICA[receta?.tecnica];
  if (!r) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» no declara técnica` };
  }
  return { valor: r, via: `técnica ${receta.tecnica}`, duda: null };
}

/** Si dos platos pelean por el mismo sitio. `null` si de alguno no se sabe. */
export function seEstorban(a, b) {
  const ra = recursoDe(a).valor;
  const rb = recursoDe(b).valor;
  if (!ra || !rb) return null;
  if (ra === "ninguno" || rb === "ninguno") return false;
  return ra === rb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 47 · Lleva masa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Si el plato tiene una MASA como estructura: empanada, pizza, lasaña, hojaldre.
 *
 * Es ortogonal a todo lo demás y por eso salió del enum de `formato` (§6 del
 * documento): la empanada es masa sin montaje, el pan tumaca es montaje sin
 * masa, y la lasaña es las dos cosas.
 *
 * ── POR ID, NO POR NOMBRE, y aquí la diferencia se ve a simple vista ──────
 *
 * El regex `/\bmasas?\b|\bharinas?\b|.../` sobre el nombre casa diez
 * ingredientes del catálogo, y TRES de ellos no son masa:
 *
 *   pan-rallado      es un rebozado; va por fuera, no es la estructura
 *   semola-de-trigo  es grano, se come en cuscús
 *   harina           espesar una salsa con una cucharada no hace un plato
 *                    de masa, y es el 90 % de sus usos
 *
 * Con la frontera de palabra bien puesta y todo. La lección que el repo repite
 * —`^sal` casando «Salmón», `\bvino\b` casando «Vinagre de vino»— es que el
 * nombre no dice el rol: el rol lo dice el id, que es una decisión tomada.
 */
const IDS_MASA = new Set([
  "masa-de-pizza", "masa-quebrada", "hojaldre", "vol-au-vent",
  "obleas", "canelones", "placas-de-cannelones", "lasana",
]);

/**
 * LA MASA QUE SE AMASA NO TIENE ID, y con la lista de arriba sola se escapaban
 * ocho platos que son masa de principio a fin: la pizza casera, el calzone, la
 * coca de recapte y tres empanadas. No compran la masa, la hacen.
 *
 * `harina + levadura` es esa firma, y es limpia: son 17 recetas y las 17
 * amasan —pizza, empanada, naan, gofres, buñuelos, bizcochos—. La harina sola
 * no vale, porque su uso mayoritario es espesar una salsa; la levadura al lado
 * es lo que dice que esa harina va a ser una estructura.
 *
 * Los «Filetes empanados» siguen fuera con razón: llevan harina y pan rallado,
 * pero eso es un rebozado que va POR FUERA. Y «Mini quiche sin masa» también,
 * porque lo dice su propio nombre.
 */
const esHarina = (id) => /^harina/.test(id ?? "");
const esLevadura = (id) => /^levadura/.test(id ?? "");

export function llevaMasaDe(receta) {
  const lineas = receta?.ingredients ?? [];
  if (!lineas.length) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» sin ingredientes` };
  }
  const masa = lineas.find((l) => IDS_MASA.has(l.ingredientId));
  if (masa) return { valor: true, via: `lleva ${masa.name}`, duda: null };
  if (lineas.some((l) => esHarina(l.ingredientId)) && lineas.some((l) => esLevadura(l.ingredientId))) {
    return { valor: true, via: "harina y levadura: la masa se amasa aquí", duda: null };
  }
  return { valor: false, via: "ninguna línea es una masa", duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 42 · Escalabilidad real
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Si el plato aguanta cocinar para ocho, que no es lo mismo que multiplicar la
 * receta por cuatro.
 *
 * Un guiso escala: el doble de ingredientes en la misma olla y el mismo rato.
 * Doce filetes a la plancha NO escalan: son tres tandas, y la tercera se come
 * fría mientras se hace la cuarta. La diferencia no está en los ingredientes,
 * está en si el RECIPIENTE limita.
 *
 * La tabla vive en `recipeSchema.js`, al lado de `effectiveRecipeTime`, que es
 * su lector: dos copias que contesten lo mismo son dos copias que se
 * contradicen. Sale de `tecnica`, que es donde vive esa limitación:
 *
 *   olla, horno   escalan — cabe más en la misma cazuela o bandeja
 *   crudo         escala — no hay recipiente que limite
 *   sarten        POR TANDAS — una sartén da para cuatro raciones
 *   plancha       POR TANDAS, y peor: la plancha se hace de uno en uno
 *
 * «Por tandas» no es «no se puede»: es que el tiempo crece con los comensales
 * en vez de quedarse igual, y eso es justo lo que alguien necesita saber antes
 * de invitar a gente.
 */
export function escalabilidadDe(receta) {
  const e = ESCALA_POR_TECNICA[receta?.tecnica];
  if (!e) return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» no declara técnica` };
  return { valor: e, via: `técnica ${receta.tecnica}`, duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 43 · Robustez ante el descuido
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Si el plato perdona que te despistes.
 *
 * Un guiso aguanta que te vayas diez minutos; un risotto no, y unas vieiras a
 * la plancha menos todavía. Lo que lo decide no es la dificultad —que ya la
 * cura una persona— sino si hay tramos donde no puedes soltar la cuchara.
 *
 * Se mide con la RACHA más larga de MINUTOS activos seguidos, y lo de los
 * minutos no es un detalle: contando PASOS, las «Lentejas con verduras» salían
 * frágiles. Un guiso tiene seis pasos activos encadenados —picar, sofreír,
 * añadir, rehogar— que son doce minutos en total y luego hora y media de olla
 * sola. Seis pasos suena a mucho; doce minutos, a nada. El número de pasos mide
 * cómo escribió la receta quien la escribió, no cuánto te ata.
 *
 *   ≤10 min   robusto   el sofrito y poco más; luego se cocina solo
 *   11-20     atento    hay un tramo largo en el que estás
 *   >20       frágil    más de veinte minutos seguidos sin soltar
 *
 * La racha y no el total, porque cuarenta minutos activos partidos por esperas
 * son ratos cortos, y veinte seguidos son veinte seguidos. Es la diferencia
 * entre cocinar con un niño alrededor y no poder.
 */
export function robustezDe(receta) {
  const pasos = receta?.stepsRich ?? [];
  if (!pasos.length) {
    return { valor: null, via: "SIN DECIDIR", duda: `«${receta?.name}» no tiene pasos ricos` };
  }
  let racha = 0;
  let maxima = 0;
  for (const s of pasos) {
    racha = s?.kind === "activo" ? racha + (s.minutes ?? 0) : 0;
    if (racha > maxima) maxima = racha;
  }
  const valor = maxima > 20 ? "fragil" : maxima > 10 ? "atento" : "robusto";
  return { valor, via: `${maxima} min activos seguidos sin poder soltar`, duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 40 · Perecibilidad y orden en la semana
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NO es si el plato entra en el menú: es CUÁNDO.
 *
 * Es el único eje de posición de la lista. El pescado fresco comprado el lunes
 * no se cocina el viernes, y eso no descarta la receta — la coloca. Un
 * planificador que no lo sepa arma menús correctos e imposibles de comprar.
 *
 * Sale de la clase del alimento, que está al 100 %:
 *
 *   pez, marisco, cefalopodo   → 2 días   (228 recetas del catálogo)
 *   carne fresca, lácteo       → 4 días
 *   el resto                   → sin límite
 *
 * Los días son de la COMPRA, no de la receta, y por eso el eje es del plato
 * aunque el dato sea del ingrediente: lo que se planifica es el plato.
 *
 * El congelado y la conserva NO cuentan, y por eso se mira `fraccionServida` no
 * — se mira el nombre de la línea. Un «Atún en conserva» es pez y aguanta un
 * año; tratarlo como pescado fresco adelantaría platos sin motivo.
 */
const DIAS_POR_CLASE = { pez: 2, marisco: 2, cefalopodo: 2, mamifero: 4, ave: 4, viscera: 2, lacteo: 4 };
const LINEA_ESTABLE = /\bconserva\b|\ben lata\b|\blata\b|\bcongelad|\bahumad|\bcurad|\bsalaz|\bencurtid|\bseco\b|\bsecos\b|\bdeshidratad/i;

export function perecibilidadDe(receta) {
  const lineas = receta?.ingredients ?? [];
  if (!lineas.length) return { valor: null, via: "SIN DECIDIR", duda: "sin ingredientes" };
  let dias = null;
  let culpable = null;
  for (const l of lineas) {
    if (LINEA_ESTABLE.test(l.name ?? "")) continue;
    const t = alimentoDe(l.ingredientId)?.taxonomia;
    const d = DIAS_POR_CLASE[t?.clase];
    if (d != null && (dias == null || d < dias)) { dias = d; culpable = l.name; }
  }
  return dias == null
    ? { valor: { dias: null, estable: true }, via: "nada fresco que caduque pronto", duda: null }
    : { valor: { dias, estable: false }, via: `${culpable} manda: ${dias} días desde la compra`, duda: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eje 31 · Se come con las manos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Si se come sin cubiertos, que decide más de lo que parece: una cena de manos
 * es otra cosa —delante de la tele, en el sofá, con niños— y es una petición
 * que la gente hace con esas palabras.
 *
 * Sale del NOMBRE, y aquí el nombre es el dato y no un atajo: un plato que se
 * llama «Bocadillo» se come con las manos, lo diga quien lo diga. Es el mismo
 * criterio que `formato`.
 *
 * SOLO EN LA CABEZA DEL NOMBRE, que es la lección de `formato` otra vez. Unas
 * «Alubias pintas CON COSTILLAS» salían de manos porque la palabra «costillas»
 * aparece — pero ahí la costilla está dentro del guiso y se come con cuchara.
 * Lo que se come con las manos es lo que el plato ES, no lo que lleva dentro,
 * así que se corta por « con » igual que en `formatoDe`.
 *
 * Y con una excepción más que el nombre no ve: `formato` cremoso, sopa o guiso
 * manda sobre él. La palabra abre la puerta; el formato la cierra.
 */
const NOMBRE_DE_MANOS = /\bbocadillo|\bsandwich\b|\bsándwich\b|\btostas?\b|\btacos?\b|\bburrito|\bwrap\b|\bhamburguesa|\bpizza\b|\bempanadilla|\bcroquetas?\b|\bnugget|\balitas?\b|\bcostillas?\b|\bbrocheta|\bpinchos?\b|\bfalafel\b|\bbuñuelos?\b|\bsamosa|\bquesadilla|\bbastones\b|\bnachos\b|\btortitas?\b|\bgofres?\b|\bcrepes?\b|\bmini\b/i;
const FORMATO_DE_CUCHARA = new Set(["cremoso", "sopa", "guiso"]);

export function conLasManosDe(receta, formato = null) {
  const nombre = receta?.name ?? "";
  if (!nombre) return { valor: null, via: "SIN DECIDIR", duda: "sin nombre" };
  // La cabeza: lo que el plato ES, antes de « con » y de « de ».
  const cabeza = nombre.split(/ con | de /)[0];
  if (!NOMBRE_DE_MANOS.test(cabeza)) {
    return { valor: false, via: "el nombre no dice que se coma con las manos", duda: null };
  }
  if (FORMATO_DE_CUCHARA.has(formato)) {
    return { valor: false, via: `se llama así pero su formato es ${formato}: va con cuchara`, duda: null };
  }
  return { valor: true, via: "lo dice el nombre", duda: null };
}
