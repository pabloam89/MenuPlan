/**
 * Lo AUTOMATIZABLE de la forja de skills (#409, fondo #408): los controles de
 * `.claude/skills/forja-de-skills/` que se pueden comprobar sin una persona ni
 * un modelo. Los llama `scripts/lib/skills.mjs` (regla `forja` del nivel 1) y
 * los ve fallar `.claude/skills.test.js`.
 *
 * Lo que NO está aquí a propósito (juzga el `revisor` o `npm run skills-prueba`):
 * si cada párrafo justifica su coste, si la libertad es la adecuada, si los
 * ejemplos son canónicos, el menú «o … o …» sin valor por defecto, el A/B con y
 * sin skill, la varianza entre ejecuciones y si la descripción dispara. Cada
 * control, con su fuente, su comprobación y su error contrario, está en
 * `.claude/skills/forja-de-skills/referencias/criterios.md`.
 *
 * Los controles son funciones puras (texto o lista de skills → faltas con un
 * `codigo` de CODIGOS_FORJA, para poder contarlas).
 */

/** Códigos de las faltas de la forja (vocabulario cerrado). Cada uno, con su porqué en `referencias/defectos.md`. */
export const CODIGOS_FORJA = ["casos-negativos", "fechas", "sin-parada", "ejemplos", "solape"];

/**
 * Límites del estándar abierto de skills (agentskills.io) y de las guías de
 * Anthropic: la descripción de 1.024 caracteres y SKILL.md de 500 líneas. Los
 * límites de la casa (`MAX_DESCRIPCION`, `MAX_LINEAS`) son más estrictos; un test
 * comprueba que siguen por debajo de estos.
 */
export const LIMITE_DESCRIPCION_ESTANDAR = 1024;
export const LIMITE_LINEAS_ESTANDAR = 500;

/** Casos de frontera mínimos (peticiones parecidas que NO son de la skill). Las guías piden la mitad de las consultas negativas; tres es el suelo asumible. */
export const MIN_FRONTERA_FORJA = 3;
/** Ejemplos como mucho por sección de ejemplos: pocos y canónicos. */
export const MAX_EJEMPLOS = 3;
/**
 * Solape léxico máximo entre dos descripciones (Jaccard de palabras de 5 letras
 * o más, antes de «No para:»). Medido el 10 oct 2026 con las 11 skills: el par
 * más cercano (causa-raiz y plan-de-arreglo, vecinas a propósito) da 0,19. Es una
 * heurística (inferida, sin fuente): detecta dos skills que reclaman la misma
 * petición, no demuestra que no solapen; eso lo mide `skills-prueba`.
 */
export const MAX_SOLAPE = 0.25;

/**
 * Lo que las skills de hoy incumplen (skill → códigos). SOLO PUEDE BAJAR, como
 * TRAGADOS_CONOCIDOS de `scripts/sinErroresTragados.test.js`: una falta nueva
 * falla el test, una arreglada también hasta que se quita de aquí. Se vacía en
 * #410 y #411; no se añade nada, se arregla la skill.
 */
export const EXCEPCIONES_FORJA = {
  "1password": ["casos-negativos", "fechas"],
  "alta-de-secreto": ["fechas"],
  "causa-raiz": ["casos-negativos"],
  github: ["casos-negativos", "fechas"],
  hetzner: ["casos-negativos", "fechas"],
  issues: ["casos-negativos", "fechas"],
  "plan-de-arreglo": ["casos-negativos"],
  supabase: ["casos-negativos", "fechas"],
  tailscale: ["casos-negativos", "fechas"],
  telegram: ["casos-negativos", "fechas"],
  vercel: ["casos-negativos", "fechas"],
};
/** Cuántas hay el 10 oct 2026 (suma de códigos): el test no deja que suba. */
export const EXCEPCIONES_INICIALES = 19;

const falta = (codigo, detalle) => ({ regla: "forja", codigo, detalle });

const PROSA_FECHADA = [
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2} (?:de )?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]* (?:de )?20\d\d\b/i,
];
/** Secciones donde una fecha es lo correcto: son un registro. */
const SECCIONES_CON_FECHA = ["Lo que falló y por qué", "Registro de cambios", "Fuentes y comprobación"];
// Una frase de cierre al principio de una línea o dentro de una negrita; una palabra suelta («parar», «parada») en mitad de un párrafo no cuenta.
const FRASES_DE_PARADA = "Sale bien si|Sale:|Para por criterio|Hecho cuando|Debe salir";
const CRITERIO_DE_PARADA = new RegExp(String.raw`^[ \t]*(?:(?:[-*]|\d+\.)[ \t]+)?\**(?:${FRASES_DE_PARADA})|\*\*[^*\n]*(?:${FRASES_DE_PARADA})`, "im");
const SECCIONES_DE_EJEMPLOS = ["Ejemplo resuelto", "Ejemplos calibrados", "Bien y mal"];

/** Un texto sin sus trozos de código entre comillas invertidas: una versión de API (`2023-06-01`) no es una fecha que caduque. */
const sinCodigo = (texto) => texto.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");

/** Las secciones `## Título` de un cuerpo: [{ titulo, texto }]. */
function secciones(cuerpo) {
  const partes = cuerpo.split(/^## (.+)$/m);
  const fuera = [];
  for (let i = 1; i < partes.length; i += 2) fuera.push({ titulo: partes[i].trim(), texto: partes[i + 1] ?? "" });
  return fuera;
}

/** Casos de frontera (cargan otra skill o «ninguna») de un casos.json válido. */
function casosNegativos(casos, nombre) {
  const lista = Array.isArray(casos?.casos) ? casos.casos : [];
  return lista.filter((c) => c?.skill !== nombre).length;
}

/**
 * Los controles de una skill sola. `cuerpo` es el de `parsearSkill`; `tipo`, el
 * de su metadata. Devuelve [] si cumple todo.
 */
export function faltasForja({ nombre, cuerpo, tipo, casos }) {
  const f = [];

  if (casos && !casos.error && casosNegativos(casos, nombre) < MIN_FRONTERA_FORJA) {
    f.push(falta("casos-negativos", `${casosNegativos(casos, nombre)} casos de frontera; hacen falta ${MIN_FRONTERA_FORJA} (peticiones parecidas que son de otra skill o de ninguna)`));
  }

  const secs = secciones(cuerpo);
  const fechadas = secs.filter((s) => !SECCIONES_CON_FECHA.includes(s.titulo) && PROSA_FECHADA.some((p) => p.test(sinCodigo(s.texto)))).map((s) => s.titulo);
  if (fechadas.length) f.push(falta("fechas", `fechas en el cuerpo (se quedan viejas): «${fechadas.join("», «")}». Las fechas van a «Lo que falló y por qué», «Registro de cambios» o «Fuentes y comprobación»`));

  // Una herramienta ya tiene «Debe salir» en cada fila (regla `formato`); los demás tipos, en «Método».
  if (tipo !== "herramienta") {
    const metodo = secs.find((s) => s.titulo === "Método")?.texto ?? "";
    if (!CRITERIO_DE_PARADA.test(metodo)) f.push(falta("sin-parada", "«Método» no dice cuándo se acaba ni qué se ve cuando sale bien («Sale bien si», «Debe salir», «Hecho cuando», «Parar si»)"));
  }

  for (const s of secs.filter((x) => SECCIONES_DE_EJEMPLOS.includes(x.titulo))) {
    // Un ejemplo es un «### Ejemplo»; sus subapartados («#### Entrada», «#### Salida») y lo que haya en un bloque de código no cuentan.
    const n = (sinCodigo(s.texto).match(/^### Ejemplo\b/gm) ?? []).length;
    if (n > MAX_EJEMPLOS) f.push(falta("ejemplos", `«${s.titulo}» tiene ${n} ejemplos; como mucho ${MAX_EJEMPLOS}, canónicos`));
  }
  return f;
}

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palabras de 5 letras o más de lo que dice la descripción antes de «No para:». */
export function palabrasDeDescripcion(descripcion) {
  const antes = String(descripcion ?? "").split("No para:")[0];
  return new Set(sinTildes(antes.toLowerCase()).match(/[a-z0-9]{5,}/g) ?? []);
}

/** Solape de dos descripciones, de 0 a 1 (Jaccard). */
export function solape(a, b) {
  const pa = palabrasDeDescripcion(a);
  const pb = palabrasDeDescripcion(b);
  const comunes = [...pa].filter((x) => pb.has(x)).length;
  const union = pa.size + pb.size - comunes;
  return union === 0 ? 0 : comunes / union;
}

/**
 * Pares de skills con descripciones demasiado parecidas.
 * Entrada: [{ nombre, descripcion }]. Salida: faltas con `skills: [a, b]`.
 */
export function faltasDeSolape(catalogo) {
  const f = [];
  for (let i = 0; i < catalogo.length; i++) {
    for (let j = i + 1; j < catalogo.length; j++) {
      const s = solape(catalogo[i].descripcion, catalogo[j].descripcion);
      if (s > MAX_SOLAPE) f.push({ ...falta("solape", `${catalogo[i].nombre} y ${catalogo[j].nombre} solapan ${s.toFixed(2)} (límite ${MAX_SOLAPE}): ¿cuál de las dos reclama la petición?`), skills: [catalogo[i].nombre, catalogo[j].nombre] });
    }
  }
  return f;
}

/** Quita de unas faltas las que la lista de excepciones deja pasar. */
export function sinExcepciones(faltas, nombre, excepciones = EXCEPCIONES_FORJA) {
  const dejadas = excepciones[nombre] ?? [];
  return faltas.filter((x) => x.regla !== "forja" || !dejadas.includes(x.codigo));
}
