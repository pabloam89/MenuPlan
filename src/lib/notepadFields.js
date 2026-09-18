/**
 * El registro de campos de la libreta.
 *
 * Una pregunta es una FILA DE DATOS, no una pantalla. El motor que la lee es
 * pequeño; lo grande es esta tabla, y crecer una tabla no cuesta. Es lo que
 * sustituye a la cadena de `isStepHidden` con índices mágicos del wizard.
 *
 * ── Qué es esta lista para el panel de IA ─────────────────────────────────
 * Es su vocabulario Y sus límites a la vez. El parser solo puede emitir `id`s
 * de aquí, y el saludo del panel ("esto sé hacer") se compone leyendo esta
 * tabla — así que añadir una acción añade su ejemplo, y no hay documentación
 * que se quede vieja.
 *
 * ── Una sola casa ─────────────────────────────────────────────────────────
 * Todo eje vive en la libreta, tenga consumidor viejo o no. `data.freqs` y
 * `data.freqsByGroup` se calculan de ella con `proyectar()` (ver notepad.js),
 * así que no hay dos sitios donde escribir ni una regla que recordar sobre
 * cuál toca. `proyecta` dice, para cada fila, en qué parte de esa vista cae.
 *
 * ── Lo que deliberadamente NO está ────────────────────────────────────────
 * Nada con persona con nombre, fecha o textura. Todo eso necesita la zona de
 * REGLAS (sujeto + ámbito + vigencia + salvedad) que aún no existe, y meterlo
 * aquí a medias sería cumplir en silencio: el usuario diría "para mi hija" y
 * el sistema lo aplicaría a toda la casa sin avisar. Cae al cubo de "te he
 * entendido, todavía no sé hacerlo".
 *
 * Los GRUPOS (niños/adultos/bebés) sí están: no son personas, son un concepto
 * de primera clase que la app ya maneja (`freqsByGroup`, roleOf, kcalByGroup),
 * y además es como habla la gente — nadie dice "para Lucía", dice "los niños".
 */

import basesCatalog from "../data/recipes/bases.json";
import { COCINAS, MAIN_BASES, TECNICAS } from "../data/recipeSchema.js";
import { CLAVES_PLATO } from "./tandaFamiliasDefs.js";

/**
 * El dominio del eje `base`: las féculas más TODA base del catálogo que no lo
 * sea. Derivado, no escrito a mano, por la misma razón que MAIN_BASES dejó de
 * ser una lista suelta: una copia se queda atrás y nadie se entera.
 *
 * Y se quedó atrás. Decía `[...MAIN_BASES, "sofrito"]` cuando el catálogo ya
 * tenía trece bases: verdura asada, salsa de tomate, bechamel, pesto y caldo
 * estaban fuera del dominio, así que el panel no podía pedirlas ni aunque el
 * usuario las escribiera con todas las letras.
 */
const DOMINIO_BASES = [
  ...MAIN_BASES,
  ...basesCatalog.map((b) => b.baseKey).filter((k) => k && !MAIN_BASES.includes(k)),
];

/** Los tres verbos. No hay más: el pool cerrado es lo que hace fiable el panel. */
export const VERBOS = ["mas", "menos", "nunca"];

/** A quién aplica un ajuste. `todos` es el default y cubre el 90 %. */
export const AMBITOS = ["todos", "ninos", "adultos", "bebes"];

/** Comida o cena. No es una fecha: es un TIPO de hueco, y por eso sí entra. */
export const SERVICIOS = ["ambos", "comida", "cena"];

/**
 * Las familias de `freqs`, con el vocabulario EXACTO de DEFAULT_FREQS
 * (lib/aiPlanner.js). Inventar una clave aquí la dejaría sin consumidor.
 *
 * `pasta_arroz` es una sola clave, así que "más pasta" y "más arroz" NO se
 * distinguen por aquí — eso lo resuelve el grupo `base`, que mira `mainBase`.
 */
export const FAMILIAS = ["carne", "pescado", "legumbres", "pasta_arroz", "huevos", "verdura"];

export const CAMPOS = [
  {
    id: "freqs",
    grupo: "familia",
    etiqueta: "Cuánto de cada cosa",
    dominio: FAMILIAS,
    proyecta: "freqs",
    // Con ámbito de grupo cae en `freqsByGroup`, que aiPlanner ya consulta.
    unidad: "veces por semana",
    rango: [0, 7],
    ejemplo: "menos pescado",
  },
  {
    id: "reparto",
    grupo: "familia",
    etiqueta: "El reparto de la semana",
    dominio: FAMILIAS,
    proyecta: "reparto",
    // Suma fija: mover una familia mueve las demás (ver lib/reparto.js). Es el
    // eje que hacía falta para un slider de proporciones y que `freqs` no
    // podía ser: `freqs` son MÁXIMOS independientes, y el prompt del planner
    // lo repite tres veces. Cambiarles el significado habría obligado a
    // reescribir ese prompt y sus tests.
    unidad: "% de la semana",
    rango: [0, 100],
    // Sin `ejemplo` a propósito: el parser NO puede escribir aquí hoy. `n` de
    // AjusteSchema está acotado a 0..7 (veces por semana), así que un
    // porcentaje no cabe en el contrato del panel. Se toca con el slider; el
    // panel sigue hablando en veces por semana, que es como habla la gente.
    ejemplo: null,
    panel: false,
  },
  {
    id: "base",
    grupo: "base",
    etiqueta: "Pasta, arroz o patata",
    // Consume `mainBase` del catálogo (46 %). Es el único eje que separa la
    // pasta del arroz, que `freqs.pasta_arroz` mete en el mismo saco.
    // Importado, no copiado: este dominio era una lista escrita a mano que ya
    // había derivado del catálogo — le faltaba `boniato` y el campo era string
    // libre, así que los 8 platos con `patata` (en vez de `patatas`) caían
    // fuera del sesgo sin que nadie se enterara. Ahora MAIN_BASES es enum y
    // esta es la misma lista, no una copia que se pueda volver a quedar atrás.
    // MAIN_BASES son las féculas. `sofrito` se añade aparte porque NO lo es —
    // meterlo en el enum habría roto carbType y las reglas de variedad, que es
    // justo lo que ese enum existe para sujetar. Pero sí es una base: 178
    // platos del recetario estrella lo llevan, más que patatas, pasta y arroz
    // juntos, y es el único que ahorra TRABAJO de manos (30 minutos de picar y
    // pochar) en vez de tiempo de olla. `sesgos.js` lo casa por `basesAparte`.
    dominio: DOMINIO_BASES,
    proyecta: "sesgos",
    unidad: "sesgo",
    ejemplo: "echo de menos más pasta",
  },
  {
    id: "tanda",
    grupo: "base",
    etiqueta: "Lo que cocinas en tanda",
    // El MISMO dominio que `base`, y ahí está justo la razón de que sean dos
    // campos y no uno.
    //
    // Los dos se escribían en `base.*` queriendo decir cosas distintas: el
    // panel un SESGO (±1, "me apetece más pasta") y este selector una CUENTA
    // (2-5, "quiero tres platos con sofrito esta semana"). Y `basesPedidas`
    // leía el campo sin saber quién lo había escrito: veía un 1, lo subía a 2
    // con un `Math.max`, y una preferencia blanda se convertía en la regla 11b
    // — la única de MÍNIMO del validador, todo o nada, la primera que se repara
    // y cuya base el fallback tiene prohibido soltar.
    //
    // O sea: decías "echo de menos más pasta" y el motor entendía "dos platos
    // de pasta en tanda, obligatorio". Y pasaba con las catorce bases.
    dominio: DOMINIO_BASES,
    proyecta: "tanda",
    unidad: "platos por semana",
    rango: [2, 5],
    // Sin `ejemplo` a propósito, igual que `reparto`: el parser NO escribe aquí.
    // Una tanda es una petición comprobable con consecuencias duras, y se pide
    // con el selector, no de pasada en una frase.
    ejemplo: null,
    panel: false,
  },
  {
    id: "tandaPlatos",
    grupo: "base",
    etiqueta: "Los platos que dejas hechos o a medias",
    // Hermano de `tanda`, y aparte por el VOCABULARIO: aquel cuenta BASES
    // (arroz, sofrito) y este cuenta FAMILIAS DE PLATO (croquetas, cremas).
    // Meterlos en un campo obligaba a un dominio que mezclara ingredientes y
    // platos, y entonces "dos de pasta" no diría si es una olla de pasta para
    // repartir o dos raviolis que hay que formar el día de la tanda.
    //
    // Las dos patas nuevas sí caben en un solo campo, porque el id ya dice
    // cuál es: lib/tandaFamilias.js sabe si una familia se remata el día que
    // toca o si es una olla que dura varias noches. Un campo por pata habría
    // sido la misma tabla dos veces.
    dominio: CLAVES_PLATO,
    proyecta: "tandaPlatos",
    unidad: "veces por semana",
    rango: [1, 4],
    // Igual que `tanda`: el parser NO escribe aquí. Se pide con el selector,
    // porque es una petición con consecuencias, no un gusto de pasada.
    ejemplo: null,
    panel: false,
  },
  {
    id: "cocina",
    grupo: "cocina",
    etiqueta: "De dónde es el plato",
    // Consume `cocina`. Ausente = española, así que "española" no está en el
    // dominio: pedir más española es pedir menos de todo lo demás. La lista
    // es la del schema, no una copia: si allí entra una cocina, aquí se puede
    // pedir sin tocar nada.
    dominio: COCINAS,
    proyecta: "sesgos",
    unidad: "sesgo",
    ejemplo: "más comida mexicana",
  },
  {
    id: "tecnica",
    grupo: "estilo",
    etiqueta: "Cómo está hecho",
    dominio: TECNICAS,
    proyecta: "sesgos",
    unidad: "sesgo",
    ejemplo: "más cosas al horno",
  },
  {
    id: "salsa",
    grupo: "estilo",
    etiqueta: "Platos con salsa",
    // Consume `llevaSalsa` (172 recetas). Aquí NO se combinan platos con
    // salsas: pedir "más salsa" devuelve los platos que ya la traen escrita.
    dominio: ["si", "no"],
    proyecta: "sesgos",
    unidad: "sesgo",
    ejemplo: "más platos con salsa",
  },
  {
    id: "esfuerzo",
    grupo: "esfuerzo",
    etiqueta: "Lo que cuesta cocinarlo",
    dominio: ["facil", "rapido", "elaborado"],
    proyecta: "sesgos",
    unidad: "sesgo",
    ejemplo: "algo más rápido",
  },
  {
    id: "favoritos",
    grupo: "ingrediente",
    etiqueta: "Lo que os gusta mucho",
    // El espejo de `excluidos`, que solo sabia quitar. Sin esto, "quiero mas
    // queso en los platos" o "mas aguacate" no tenian donde escribirse: se
    // podia vetar un ingrediente pero no pedirlo, que es la mitad de lo que la
    // gente dice de verdad.
    dominio: null,
    proyecta: "favoritos",
    unidad: "lista",
    ejemplo: "más queso en los platos",
  },
  {
    id: "excluidos",
    grupo: "ingrediente",
    etiqueta: "Lo que no queréis ver",
    // Lista abierta: se resuelve contra ingredients.json, no contra un enum.
    // NUNCA recibe alergias — esas van a `data.allergies` por su propio
    // camino, con confirmación. Un alérgeno no puede entrar como preferencia.
    dominio: null,
    proyecta: "excluidos",
    unidad: "lista",
    ejemplo: "no me pongas cilantro",
  },
];

export const CAMPOS_POR_ID = Object.fromEntries(CAMPOS.map((c) => [c.id, c]));

/**
 * Las frases de ejemplo del saludo del panel. Salen de la propia tabla, así
 * que añadir un campo añade su ejemplo y nadie tiene que acordarse.
 */
export function ejemplosDelPanel() {
  return CAMPOS.map((c) => c.ejemplo).filter(Boolean);
}

/**
 * ¿Es un valor que el parser puede emitir para este campo? Es la puerta que
 * impide que una alucinación llegue a la pantalla: el modelo puede DECIR lo
 * que quiera, pero solo puede HACER lo que pase por aquí.
 */
export function valorValido(campoId, valor) {
  const campo = CAMPOS_POR_ID[campoId];
  if (!campo) return false;
  if (campo.dominio === null) return typeof valor === "string" && valor.length > 0;
  return campo.dominio.includes(valor);
}

/** La ruta de la libreta para un ajuste concreto. Es la clave de `campos`. */
export function rutaDe(campoId, valor, ambito = "todos", servicio = "ambos") {
  const partes = [campoId, valor];
  if (ambito !== "todos") partes.push(`@${ambito}`);
  if (servicio !== "ambos") partes.push(`#${servicio}`);
  return partes.join(".");
}
