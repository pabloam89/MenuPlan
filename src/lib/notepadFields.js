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
 * ── `en`: dónde vive el valor ─────────────────────────────────────────────
 * La libreta NO guarda valores, guarda de dónde salieron (ver notepad.js). Por
 * eso cada fila dice dónde está el suyo:
 *
 *   "data.freqs"     ya existía en el estado de la app → la libreta acompaña
 *   "notepad"        eje nuevo, sin nada que duplicar → vive en la libreta
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
    en: "data.freqs",
    porGrupo: "data.freqsByGroup",   // ya existe: freqsByGroup[grupo][familia]
    unidad: "veces por semana",
    rango: [0, 7],
    ejemplo: "menos pescado",
  },
  {
    id: "base",
    grupo: "base",
    etiqueta: "Pasta, arroz o patata",
    // Consume `mainBase` del catálogo (46 %). Es el único eje que separa la
    // pasta del arroz, que `freqs.pasta_arroz` mete en el mismo saco.
    dominio: ["pasta", "arroz", "patatas", "legumbre", "quinoa", "cuscus", "pan", "avena"],
    en: "notepad",
    unidad: "sesgo",
    ejemplo: "echo de menos más pasta",
  },
  {
    id: "cocina",
    grupo: "cocina",
    etiqueta: "De dónde es el plato",
    // Consume `cocina`. Ausente = española, así que "española" no está en el
    // dominio: pedir más española es pedir menos de todo lo demás.
    dominio: ["italiana", "asiatica", "mexicana", "mediterranea", "francesa", "americana", "india", "peruana"],
    en: "notepad",
    unidad: "sesgo",
    ejemplo: "más comida mexicana",
  },
  {
    id: "tecnica",
    grupo: "estilo",
    etiqueta: "Cómo está hecho",
    dominio: ["horno", "plancha", "sarten", "olla", "crudo"],
    en: "notepad",
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
    en: "notepad",
    unidad: "sesgo",
    ejemplo: "más platos con salsa",
  },
  {
    id: "esfuerzo",
    grupo: "esfuerzo",
    etiqueta: "Lo que cuesta cocinarlo",
    dominio: ["facil", "rapido", "elaborado"],
    en: "notepad",
    unidad: "sesgo",
    ejemplo: "algo más rápido",
  },
  {
    id: "excluidos",
    grupo: "ingrediente",
    etiqueta: "Lo que no queréis ver",
    // Lista abierta: se resuelve contra ingredients.json, no contra un enum.
    // NUNCA recibe alergias — esas van a `data.allergies` por su propio
    // camino, con confirmación. Un alérgeno no puede entrar como preferencia.
    dominio: null,
    en: "notepad",
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
