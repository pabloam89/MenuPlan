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
