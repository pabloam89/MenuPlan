/**
 * El cuerpo del PR que pide el revisor de la Fábrica (.fabrica/standards/code.md),
 * hecho por código y no de memoria: así el PR nace con lo que el juez mira y no
 * hacen falta tres vueltas. Puro (sin git ni procesos), para el test; lo que lee
 * del repo y de la Fábrica lo hace scripts/pr-cuerpo.mjs.
 *
 * Las secciones y la forma de una decisión NO se escriben aquí: salen de la
 * plantilla de la Fábrica (factory-am89/fabrica, .github/pull_request_template.md,
 * en el sha que fija nuestro revisor.yml), que es la definición que lee el juez.
 * Aquí solo se dice qué va en cada una, y `contrastar` falla si la plantilla
 * trae una sección que no se rellena o si se rellena una que ya no existe.
 *
 * Lo que se puede sacar de la máquina sale de aquí: los comandos y su salida
 * (C9), el rojo antes de los tests nuevos (C6, C17), el tamaño (C11) y los fallos
 * tragados en lo añadido (C5). Lo demás es criterio (C8, C12, C14, C15) y queda
 * como hueco a rellenar, no como «sí» dado por bueno.
 */

/** Por encima de esto, el PR no cabe en una sentada (C11): partirlo antes de abrirlo. */
export const TOPE_LINEAS = 400;
export const TOPE_FICHEROS = 12;

/** Un fichero de test de este repo (vitest). */
export const esTest = (f) => /\.test\.m?js$/.test(f);

const ANSI = /\x1b\[[0-9;]*m/g;
const lineasLimpias = (s) => String(s ?? "").replace(ANSI, "").split("\n").map((l) => l.trim());

/** «Test Files  2 passed (2)» y «Tests  14 passed | 1 failed (15)»: las líneas de resumen de vitest. */
export const resumenVitest = (salida) => lineasLimpias(salida).filter((l) => /^(Test Files|Tests)\s/.test(l));

/** La primera línea de error de la salida: por qué falla, cuando el resumen no lo dice («no tests»). */
export const primerError = (salida) => lineasLimpias(salida).find((l) => /(^|\s)(\w*Error|FAIL)\b|Cannot find|Failed to load/.test(l)) ?? "";

/**
 * De la plantilla, sus secciones en orden («## X») y la forma de una línea de
 * decisión (la que va entre comillas tras «one line per decision»).
 */
export function leerPlantilla(md) {
  const secciones = String(md ?? "").split("\n").map((l) => l.match(/^## (.+?)\s*$/)?.[1]).filter(Boolean);
  const forma = String(md ?? "").match(/one line per decision: "([^"]+)"/)?.[1] ?? null;
  return { secciones, forma };
}

/**
 * Qué rellena este script, por papel. Los nombres son los de la plantilla: si
 * cambian allí, `contrastar` lo dice en vez de dejar un cuerpo que el juez no
 * reconoce. «Checks» es nuestra, de más, y va al final.
 */
export const RELLENA = { que: "What changes", evidencia: "Evidence", rojo: "Red before", decisiones: "Decisions", sinComprobar: "Not verified" };
const PROPIA = "Checks (C5, C8, C11, C12, C14)";

/** Lo que no cuadra entre la plantilla y lo que se rellena; vacío si cuadra. */
export function contrastar(plantilla) {
  const nuestras = Object.values(RELLENA);
  return [
    ...plantilla.secciones.filter((s) => !nuestras.includes(s)).map((s) => `la plantilla trae «${s}» y aquí no se rellena`),
    ...nuestras.filter((s) => !plantilla.secciones.includes(s)).map((s) => `aquí se rellena «${s}» y la plantilla ya no la trae`),
    ...(plantilla.forma ? [] : ["la plantilla no trae la forma de una línea de decisión"]),
  ];
}

/**
 * Líneas añadidas del diff que se tragan un fallo (C5): un catch vacío o que
 * devuelve un valor por defecto sin registrar nada. Es una pista, no un juicio:
 * el aviso pide mirarlo.
 */
const TRAGA = [
  /catch\s*(\([^)]*\))?\s*\{\s*\}/,
  /\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|null|undefined|\[\]|\{\}|false|0|"")\s*\)/,
];
export function fallosTragados(diff) {
  const avisos = [];
  let fichero = null;
  for (const l of String(diff ?? "").split("\n")) {
    const m = l.match(/^\+\+\+ b\/(.+)$/);
    if (m) { fichero = m[1]; continue; }
    // En un test, un catch vacío suele ser el ejemplo de lo que se busca.
    if (!l.startsWith("+") || l.startsWith("+++") || esTest(fichero ?? "")) continue;
    if (TRAGA.some((re) => re.test(l))) avisos.push(`${fichero}: \`${l.slice(1).trim().slice(0, 100)}\``);
  }
  return avisos;
}

/** Si el PR cabe en una sentada (C11), con «git diff --numstat». */
export function tamano(numstat) {
  const filas = String(numstat ?? "").split("\n").filter(Boolean).map((l) => l.split("\t"));
  const lineas = filas.reduce((n, [a, b]) => n + (Number(a) || 0) + (Number(b) || 0), 0);
  return { ficheros: filas.length, lineas, grande: lineas > TOPE_LINEAS || filas.length > TOPE_FICHEROS };
}

const bloque = (texto) => ["```", texto.trim() || "(sin salida)", "```"].join("\n");

function textoRojo(antes) {
  if (!antes) return "No aplica: el PR no trae tests nuevos.";
  const salida = [...resumenVitest(antes.salida), primerError(antes.salida)].filter(Boolean).join("\n") || antes.salida.slice(-600);
  const igual = antes.codigo === 0 ? "\n\n⚠️ Sin el cambio también pasan: el test no prueba la regla (C6)." : "";
  return `Los tests nuevos con el código de antes (\`${antes.comando}\`) → código ${antes.codigo}\n${bloque(salida)}${igual}`;
}

function textoChecks(talla, tragados) {
  const grande = talla.grande ? ` ⚠️ pasa de ${TOPE_LINEAS} líneas o ${TOPE_FICHEROS} ficheros: pártelo` : "";
  const c5 = tragados.length ? `⚠️\n${tragados.map((t) => `  - ${t}`).join("\n")}` : "ninguno visto.";
  return `- Tamaño (C11): ${talla.ficheros} ficheros, ${talla.lineas} líneas${grande}.\n- Fallos tragados en lo añadido (C5): ${c5}\n- TODO C8/C14: ninguna lista ni umbral copiado a mano en dos sitios, cada afirmación con su comando.\n- TODO C12: todo lo nuevo tiene lector y no hay ficheros ajenos al encargo.`;
}

/**
 * El cuerpo en markdown, con las secciones en el orden de la plantilla.
 * `ahora` y `antes`: { comando, salida, codigo } de los tests tocados con el
 * cambio y de los nuevos sin él (antes = null si no hay tests nuevos).
 */
export function cuerpo({ plantilla, titulo = "", ahora, antes = null, talla, tragados = [], refs = "" }) {
  const contenido = {
    [RELLENA.que]: "TODO: una sola idea (C11). Si hay más de una, parte el PR.",
    [RELLENA.evidencia]: `\`${ahora.comando}\` → código ${ahora.codigo}\n${bloque(resumenVitest(ahora.salida).join("\n"))}`,
    [RELLENA.rojo]: textoRojo(antes),
    [RELLENA.decisiones]: `TODO: «None», o una línea por decisión que el encargo no impone, con esta forma:\n${plantilla.forma}`,
    [RELLENA.sinComprobar]: "TODO: lo que no se ha probado, dicho tal cual (p. ej. «Evals: no se han corrido, a petición de Pablo»), o «Nothing».",
  };
  const partes = [
    ...(titulo ? [titulo] : []),
    ...plantilla.secciones.map((s) => `## ${s}\n${contenido[s]}`),
    `## ${PROPIA}\n${textoChecks(talla, tragados)}`,
    ...(refs ? [refs] : []),
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ];
  return partes.join("\n\n");
}
