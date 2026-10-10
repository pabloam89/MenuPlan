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
export const CODIGOS_FORJA = ["casos-negativos", "fechas", "sin-parada", "ejemplos", "solape", "comando-suelto", "tabla", "cabeceras"];

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
  "1password": ["fechas"],
  github: ["fechas"],
  hetzner: ["fechas"],
  issues: ["fechas"],
  supabase: ["fechas"],
  telegram: ["fechas"],
  vercel: ["fechas"],
};
/** Cuántas quedan (suma de códigos); eran 19 el 10 oct 2026 y #410 quitó 12: los 10 de casos de frontera y 2 de fechas. El test no deja que suba. */
export const EXCEPCIONES_INICIALES = 7;

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

// ── Presentación (#410): lo mecánico de `referencias/presentacion.md` ────

/**
 * Un comando de la casa escrito en prosa, fuera de comillas invertidas y de
 * bloque. Heurística (criterio nuestro, sin fuente): solo los comandos que las
 * skills citan de verdad, para que una palabra suelta («git», «gh») no avise.
 */
const COMANDO_SUELTO = /\b(?:npm run [\w:-]+|npx [\w@-]+|node (?:scripts|\.claude)\/\S+|gh (?:pr|issue|run|api|workflow|secret|repo|variable) \w+|git (?:push|pull|fetch|merge|commit|checkout|worktree|rebase|stash|status|log|diff)\b|vercel (?:env|logs|login|pull)\b|op (?:item|read|vault|document) \w+|docker (?:compose|run|exec)\b|ssh \S+@)/;

/** Quita los bloques de código (con tres comillas) dejando sus saltos de línea, para no mover los números de línea. */
function sinBloques(texto) {
  let dentro = false;
  return texto.replace(/\r\n/g, "\n").split("\n").map((l) => {
    if (/^[ \t]*```/.test(l)) { dentro = !dentro; return ""; }
    return dentro ? "" : l;
  }).join("\n");
}

/** Quita también el código en línea, aunque se parta en dos líneas (sin cruzar un párrafo). */
const sinCodigoEnLinea = (t) => t.replace(/`[^`\n]*(?:\n(?![ \t]*\n)[^`\n]*)*`/g, (m) => m.replace(/[^\n]/g, ""));

/** Las celdas de una fila de tabla (el `\|` escapado no parte celdas). */
const celdasDe = (l) => l.trim().split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());

/**
 * Presentación de un texto de skill (su cuerpo o un fichero de capa), solo lo
 * que una máquina ve sin juzgar: un comando de la casa fuera de código, una tabla
 * con filas de distinto ancho o con celdas vacías, y cabeceras que saltan de
 * nivel (de `##` a `####`). Una falta por código y fichero, con las primeras
 * líneas donde pasa. `donde` solo nombra el fichero en el mensaje.
 */
export function faltasDePresentacion(texto, donde = "SKILL.md") {
  const sin = sinBloques(texto);
  const lineas = sin.split("\n");
  const hallazgos = { "comando-suelto": [], tabla: [], cabeceras: [] };
  let previo = 0;
  let tabla = null;
  lineas.forEach((l, i) => {
    const n = i + 1;
    const cab = l.match(/^(#{1,6}) \S/);
    if (cab) {
      if (previo && cab[1].length > previo + 1) hallazgos.cabeceras.push(`línea ${n}: de ${"#".repeat(previo)} a ${cab[1]}`);
      previo = cab[1].length;
    }
    if (/^[ \t]*\|/.test(l)) {
      const celdas = celdasDe(l);
      const separador = celdas.length > 0 && celdas.every((c) => /^:?-{3,}:?$/.test(c));
      if (!tabla) tabla = { ancho: celdas.length, inicio: n };
      else if (celdas.length !== tabla.ancho) hallazgos.tabla.push(`línea ${n}: ${celdas.length} columnas en una tabla de ${tabla.ancho} (¿un «|» sin escapar dentro de código?)`);
      if (!separador && celdas.some((c) => !c)) hallazgos.tabla.push(`línea ${n}: celda vacía`);
    } else tabla = null;
  });
  // Primero el código en línea (una URL pegada a una comilla se comería su pareja), luego comentarios y enlaces.
  const prosa = sinCodigoEnLinea(sin).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, "")).replace(/https?:\/\/\S+/g, "");
  prosa.split("\n").forEach((l, i) => {
    const m = l.match(COMANDO_SUELTO);
    if (m) hallazgos["comando-suelto"].push(`línea ${i + 1}: «${m[0]}»`);
  });
  const avisos = {
    "comando-suelto": "comando fuera de comillas invertidas o de bloque (se copia mal); ponlo en código",
    tabla: "tabla mal formada",
    cabeceras: "cabeceras que saltan de nivel",
  };
  return Object.entries(hallazgos).filter(([, v]) => v.length).map(([codigo, v]) => falta(codigo, `${donde}: ${avisos[codigo]}: ${v.slice(0, 3).join("; ")}${v.length > 3 ? ` (y ${v.length - 3} más)` : ""}`));
}

/**
 * Los controles de una skill sola. `cuerpo` es el de `parsearSkill`; `tipo`, el
 * de su metadata; `extra`, los ficheros .md de sus capas ({ruta: texto}). Devuelve
 * [] si cumple todo.
 */
export function faltasForja({ nombre, cuerpo, tipo, casos, extra = {} }) {
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

  f.push(...faltasDePresentacion(cuerpo, "SKILL.md"));
  for (const [ruta, texto] of Object.entries(extra)) if (ruta.endsWith(".md")) f.push(...faltasDePresentacion(texto, ruta));
  return f;
}

// ── El estándar de cada tipo de skill (#410) ─────────────────────────────

/** Vocabulario cerrado de las faltas del estándar por tipo (para contarlas). */
export const CODIGOS_ESTANDAR = ["tipo-sin-estandar", "apartado-ausente", "pocos-puntos", "sin-fuente", "ejemplo-sin-origen", "ejemplo-largo", "ejemplo-no-cuadra"];
/** Dónde vive el estándar en `.claude/PLANTILLA-SKILL.md`, y los apartados de cada tipo. */
export const SECCION_ESTANDARES = "El estándar de cada tipo";
export const APARTADO_BUENO = "Qué lo hace bueno";
export const APARTADO_ERRORES = "Errores típicos";
export const APARTADO_EJEMPLO = "Ejemplo mínimo";
/** Puntos como mínimo en «Qué lo hace bueno» y en «Errores típicos»; líneas del ejemplo. */
export const MIN_PUNTOS_ESTANDAR = 2;
export const LINEAS_EJEMPLO = { min: 3, max: 6 };
/** Cada punto lleva [F: fuente] (está en la fuente) o [I] (inferencia nuestra). */
const MARCA_FUENTE = /\[(?:F|I)(?:[:;,\s][^\]]*)?\]/;

/** Trozos de un texto que empiezan en una cabecera de ese nivel (`prefijo` es «## », «### »…), sin mirar dentro de los bloques de código. */
function partirPorCabecera(texto, prefijo) {
  const trozos = [];
  let dentro = false;
  for (const l of String(texto).split("\n")) {
    if (/^[ \t]*```/.test(l)) dentro = !dentro;
    if (!dentro && l.startsWith(prefijo)) trozos.push({ titulo: l.slice(prefijo.length), texto: "" });
    else if (trozos.length) trozos[trozos.length - 1].texto += `${l}\n`;
  }
  return trozos;
}

const faltaEstandar = (codigo, tipo, detalle) => ({ regla: "estandar", codigo, tipo, detalle: `${tipo}: ${detalle}` });
const sinEspacios = (s) => s.replace(/\s+/g, " ").trim();

/**
 * El estándar de cada tipo de skill, leído de la plantilla: para cada tipo, «Qué
 * lo hace bueno» y «Errores típicos» (dos puntos como mínimo, cada uno con su
 * marca [F] o [I]) y un «Ejemplo mínimo» de 3 a 6 líneas. El ejemplo es o
 * `Real: \`skill\`` (la skill existe, es de ese tipo y cada línea sale tal cual
 * de su SKILL.md: no se inventa) o `Esqueleto:` (solo mientras no haya ninguna
 * skill de ese tipo; con la primera, el ejemplo pasa a ser real).
 * `skills`: [{ nombre, tipo, texto }].
 */
export function faltasDeEstandares(plantilla, tipos, skills) {
  const f = [];
  const t = String(plantilla).replace(/\r\n/g, "\n");
  const inicio = t.search(new RegExp(`^## ${SECCION_ESTANDARES}\\s*$`, "m"));
  if (inicio === -1) return tipos.map((tipo) => faltaEstandar("tipo-sin-estandar", tipo, `la plantilla no tiene la sección «${SECCION_ESTANDARES}»`));
  const seccion = partirPorCabecera(t.slice(inicio), "## ")[0]?.texto ?? "";
  const porTipo = new Map(partirPorCabecera(seccion, "### ").map((b) => [b.titulo.replace(/`/g, "").trim(), b.texto]));
  for (const tipo of tipos) {
    const bloque = porTipo.get(tipo);
    if (bloque === undefined) { f.push(faltaEstandar("tipo-sin-estandar", tipo, `sin «### \`${tipo}\`» en «${SECCION_ESTANDARES}»`)); continue; }
    const partes = new Map(partirPorCabecera(bloque, "#### ").map((b) => [b.titulo.trim(), b.texto]));
    for (const a of [APARTADO_BUENO, APARTADO_ERRORES, APARTADO_EJEMPLO]) {
      if (!(partes.get(a) ?? "").trim()) f.push(faltaEstandar("apartado-ausente", tipo, `falta «${a}» o está vacío`));
    }
    for (const a of [APARTADO_BUENO, APARTADO_ERRORES]) {
      const puntos = (partes.get(a) ?? "").split(/^(?=- )/m).filter((p) => p.startsWith("- "));
      if ((partes.get(a) ?? "").trim() && puntos.length < MIN_PUNTOS_ESTANDAR) f.push(faltaEstandar("pocos-puntos", tipo, `«${a}» tiene ${puntos.length} puntos; hacen falta ${MIN_PUNTOS_ESTANDAR}`));
      for (const p of puntos) if (!MARCA_FUENTE.test(p)) f.push(faltaEstandar("sin-fuente", tipo, `punto de «${a}» sin [F: fuente] ni [I]: ${sinEspacios(p).slice(0, 60)}`));
    }
    const ej = partes.get(APARTADO_EJEMPLO) ?? "";
    if (!ej.trim()) continue;
    const real = ej.match(/^\s*Real: `([^`]+)`/m);
    const esqueleto = /^\s*Esqueleto:/m.test(ej);
    const bloqueCodigo = ej.match(/```[^\n]*\n([\s\S]*?)\n[ \t]*```/);
    if (!real && !esqueleto) { f.push(faltaEstandar("ejemplo-sin-origen", tipo, "el ejemplo no dice «Real: `skill`» ni «Esqueleto:»")); continue; }
    if (!bloqueCodigo) { f.push(faltaEstandar("ejemplo-sin-origen", tipo, "el ejemplo no está en un bloque de código")); continue; }
    const lineas = bloqueCodigo[1].split("\n").filter((l) => l.trim());
    if (lineas.length < LINEAS_EJEMPLO.min || lineas.length > LINEAS_EJEMPLO.max) f.push(faltaEstandar("ejemplo-largo", tipo, `el ejemplo tiene ${lineas.length} líneas; entre ${LINEAS_EJEMPLO.min} y ${LINEAS_EJEMPLO.max}`));
    const delTipo = skills.filter((s) => s.tipo === tipo);
    if (real) {
      const s = skills.find((x) => x.nombre === real[1]);
      if (!s) f.push(faltaEstandar("ejemplo-no-cuadra", tipo, `la skill «${real[1]}» del ejemplo no existe`));
      else if (s.tipo !== tipo) f.push(faltaEstandar("ejemplo-no-cuadra", tipo, `«${real[1]}» es de tipo ${s.tipo}, no ${tipo}`));
      else {
        const texto = sinEspacios(s.texto);
        for (const l of lineas) if (!texto.includes(sinEspacios(l))) f.push(faltaEstandar("ejemplo-no-cuadra", tipo, `la línea «${sinEspacios(l).slice(0, 50)}» no está en ${real[1]}/SKILL.md: el ejemplo real se copia, no se inventa`));
      }
    } else if (delTipo.length) {
      f.push(faltaEstandar("ejemplo-no-cuadra", tipo, `es un esqueleto, pero ya hay skills de este tipo (${delTipo.map((s) => s.nombre).join(", ")}): pon un ejemplo real`));
    }
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
