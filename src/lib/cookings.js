/**
 * Cocinadas: "hoy he hecho esto", con foto.
 *
 * ── Por qué existe este objeto y no basta la receta ────────────────────
 * Una receta es permanente, estructurada y copiable; vive en el catálogo y no
 * caduca. Una cocinada es un EVENTO sobre esa receta: esta vez, esta foto,
 * esta mesa. La misma receta acumula cocinadas — y ahí está lo que ninguna
 * app de fotos puede hacer, porque en un álbum dos fotos de lentejas no saben
 * que son la misma cosa.
 *
 * De esa separación salen las dos velocidades del producto:
 *   · el río de cocinadas corre rápido y admite borradores;
 *   · el catálogo crece despacio y solo acepta fichas terminadas.
 *
 * ── La regla que impide que esto sea Instagram ─────────────────────────
 * Una cocinada NO PUEDE existir sin una receta debajo (`recipeId` es
 * obligatorio). En Instagram la unidad es el post y no hay nada debajo, y por
 * eso puedes subir lo que quieras. Aquí siempre hay un objeto detrás de la
 * foto, así que cada foto del feed es una puerta a algo que te puedes copiar
 * a tu semana. El ancla es estructural, no una norma de estilo — y por eso
 * encima se le puede meter toda la vida que se quiera sin miedo.
 *
 * ── Y por qué el ancla no es un peaje ──────────────────────────────────
 * Si vincular obligara a rellenar el asistente de 7 pasos, nadie publicaría
 * una improvisación de un martes a las 21:40. Por eso existe el BORRADOR
 * (`draft: true`): nombre + foto + categoría, y ya. Sigue habiendo objeto
 * debajo, pero se escribe en tres segundos. El asistente pasa a ser una
 * mejora, no una puerta — y quien tira de esa mejora es la gente que te pide
 * la receta, no un formulario en el peor momento.
 *
 * ── Este fichero no guarda nada ────────────────────────────────────────
 * Solo la forma del objeto y las funciones puras que la manipulan. Leer y
 * escribir es cosa de `cookingsSync.js`, contra la tabla `cookings` de
 * 0050_cookings.sql. Estuvo un rato en localStorage mientras se diseñaba la
 * pantalla, y eso tenía una trampa que no se ve al probarlo solo: lo que
 * publicabas no lo veía nadie más. Una función social que no sale de tu
 * navegador no es una función social.
 */

/**
 * Cuánto dura una cocinada EN LA FILA. Caduca de verdad, y por eso el anillo
 * de historias por fin es honesto: lo que caduca es el evento, no el
 * contenido — la foto se queda para siempre en la historia de la receta.
 */
export const ROW_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * El adhesivo que se pega sobre la foto.
 *
 * ── La gente escribe lo que le da la gana ──────────────────────────────
 * Esto llego despues de tres intentos malos. Primero iconos de linea (parecia
 * un formulario), luego emoji de colores (parecia cualquier interfaz generada
 * de este ano), luego un tampon de tinta. Los tres compartian el mismo error
 * de fondo: yo elegia las cinco frases que se podian decir.
 *
 * En las redes donde la gente publica de verdad, escribe lo que quiere y mete
 * los emoji que quiere desde su teclado. Asi que el adhesivo es TEXTO LIBRE.
 *
 * ── Y aun asi no se pierde el dato ─────────────────────────────────────
 * Los cinco de siempre siguen ahi como ATAJOS: si tocas uno, te rellena el
 * texto y ademas deja escrito su `id`. O sea, quien tira del camino rapido
 * genera dato estructurado (se puede seguir preguntando "las que repite todo
 * el mundo") y quien quiere escribir "a Vera le ha encantado 🤩" lo escribe.
 * Lo mejor de los dos, sin obligar a nadie.
 *
 * El adhesivo se guarda como { text, id, x, y }: `text` es lo que se pinta,
 * `id` puede venir vacio, y x/y es DONDE lo dejo su autor — dos personas con
 * la misma frase no producen la misma imagen.
 */
export const SEALS = [
  { id: "repetimos", label: "Repetimos 🔁" },
  { id: "primera", label: "Primera vez ✨" },
  { id: "sin_rechistar", label: "Sin rechistar 😋" },
  { id: "regular", label: "Salió regular 😅" },
  { id: "de_familia", label: "Receta de familia ❤️" },
];

/**
 * Los colores del adhesivo. Cinco, y los elige quien publica.
 *
 * El blanco va primero porque funciona sobre cualquier foto; los demas estan
 * ahi para que la publicacion sea tuya. Que la paleta la cierre el producto y
 * la eleccion la haga la persona es justo el reparto que buscabamos: nadie
 * puede sacar un fucsia que rompa el feed, pero tampoco se publica todo igual.
 */
export const STICKER_COLORS = [
  // Fila 1 — el teal de la casa primero, que es el color por defecto.
  { id: "teal", bg: "#0f766e", fg: "#ffffff" },
  { id: "verde", bg: "#2d5a3d", fg: "#ffffff" },
  { id: "menta", bg: "#4cba6e", fg: "#0d2b17" },
  { id: "blanco", bg: "rgba(255,255,255,.94)", fg: "#142f1d" },
  { id: "tinta", bg: "rgba(18,28,21,.88)", fg: "#ffffff" },
  // Fila 2 — los cálidos y los fríos de la paleta de categorías.
  { id: "teja", bg: "#cf7833", fg: "#ffffff" },
  { id: "sol", bg: "#f0c419", fg: "#3a2c00" },
  { id: "rosa", bg: "#d56b9a", fg: "#ffffff" },
  { id: "azul", bg: "#4a6fd4", fg: "#ffffff" },
  { id: "morado", bg: "#8a6cc4", fg: "#ffffff" },
];

/** El color guardado, o el blanco. Las cocinadas viejas no traen ninguno. */
export const sealColor = (seal) =>
  STICKER_COLORS.find((c) => c.id === (typeof seal === "object" ? seal?.color : null)) ?? STICKER_COLORS[0];

export const sealId = (seal) => (typeof seal === "string" ? seal : seal?.id ?? null);

/** Lo que se pinta encima de la foto: lo que escribio, o la etiqueta del atajo. */
export const sealText = (seal) => {
  if (typeof seal === "string") return SEALS.find((s) => s.id === seal)?.label ?? null;
  return seal?.text ?? SEALS.find((s) => s.id === seal?.id)?.label ?? null;
};

export const sealById = (seal) => {
  const id = sealId(seal);
  return id ? SEALS.find((s) => s.id === id) ?? null : null;
};

/** Donde cae el adhesivo, en % del lienzo. Sin posicion, abajo a la izquierda. */
export const sealPos = (seal) => ({
  x: typeof seal === "object" && seal?.x != null ? seal.x : 8,
  y: typeof seal === "object" && seal?.y != null ? seal.y : 9,
  // Por que lado se ancla: es lo que impide que una frase larga soltada a la
  // derecha se salga del marco. Ver pointToPct en CookingComposer.
  anchor: typeof seal === "object" && seal?.anchor === "right" ? "right" : "left",
});

/** Las que siguen vivas en la fila. Lo viejo no desaparece: sale de la fila. */
export function isFresh(cooking, now = Date.now()) {
  return now - new Date(cooking.createdAt).getTime() < ROW_TTL_MS;
}

/**
 * La fila de "Hoy cocinan", agrupada POR PERSONA: cada uno ocupa un hueco y
 * dentro puede llevar varias. Si cada cocinada fuera su propio hueco, quien
 * cocina tres veces al día se comería la fila entera.
 */
export function groupForRow(cookings, now = Date.now()) {
  const fresh = cookings.filter((c) => isFresh(c, now));
  const byOwner = new Map();
  for (const c of fresh) {
    if (!byOwner.has(c.ownerId)) byOwner.set(c.ownerId, []);
    byOwner.get(c.ownerId).push(c);
  }
  return [...byOwner.entries()].map(([ownerId, items]) => ({
    ownerId,
    items: items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    latest: items.reduce((m, c) => (c.createdAt > m.createdAt ? c : m), items[0]),
  }));
}

/** ¿He publicado yo hoy? Es lo que decide el anillo de mi hueco. */
export function hasPublishedToday(cookings, ownerId = "me") {
  const today = new Date().toDateString();
  return cookings.some((c) => c.ownerId === ownerId && new Date(c.createdAt).toDateString() === today);
}
