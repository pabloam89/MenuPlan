/**
 * El cuerpo del PR que pide el revisor de la Fábrica (.fabrica/standards/code.md),
 * hecho por código y no de memoria: así el PR nace con lo que el juez mira y no
 * hacen falta tres vueltas. Puro (sin git ni procesos), para el test; lo que lee
 * del repo lo hace scripts/pr-cuerpo.mjs.
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

/** «Test Files  2 passed (2)» y «Tests  14 passed | 1 failed (15)»: las líneas de resumen de vitest. */
export function resumenVitest(salida) {
  const limpia = String(salida ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  return limpia.split("\n").map((l) => l.trim()).filter((l) => /^(Test Files|Tests)\s/.test(l));
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

/** La primera línea de error de la salida: por qué falla, cuando el resumen no lo dice («no tests»). */
export function primerError(salida) {
  const limpia = String(salida ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  return limpia.split("\n").map((l) => l.trim()).find((l) => /(^|\s)(\w*Error|FAIL)\b|Cannot find|Failed to load/.test(l)) ?? "";
}

const bloque = (texto) => ["```", texto.trim() || "(sin salida)", "```"].join("\n");

/**
 * El cuerpo en markdown. `ahora` y `antes`: { comando, salida, codigo } de los
 * tests tocados con el cambio y de los nuevos sin él (antes = null si no hay
 * tests nuevos). Las secciones de criterio salen con un TODO visible.
 */
export function cuerpo({ titulo = "", ahora, antes = null, talla, tragados = [], refs = "" }) {
  const partes = [
    `${titulo ? `${titulo}\n\n` : ""}## Qué y por qué\nTODO: una sola idea (C11). Si hay más de una, parte el PR.`,
    `## Comandos y salida (C9)\n\`${ahora.comando}\` → código ${ahora.codigo}\n${bloque(resumenVitest(ahora.salida).join("\n"))}`,
    antes
      ? `## Red before (C6, C17)\nLos tests nuevos con el código de antes (\`${antes.comando}\`) → código ${antes.codigo}\n${bloque([...resumenVitest(antes.salida), primerError(antes.salida)].filter(Boolean).join("\n") || antes.salida.slice(-600))}${antes.codigo === 0 ? "\n\n⚠️ Sin el cambio también pasan: el test no prueba la regla (C6)." : ""}`
      : "## Red before (C6, C17)\nNo aplica: el PR no trae tests nuevos.",
    "## Decisions (C15)\n- principio N | eligió: … | descartó: … | motivo: …\nTODO: cada decisión que el encargo no impone (umbrales, nombres, qué se deja fuera).",
    `## Comprobaciones\n- Tamaño (C11): ${talla.ficheros} ficheros, ${talla.lineas} líneas${talla.grande ? ` ⚠️ pasa de ${TOPE_LINEAS} líneas o ${TOPE_FICHEROS} ficheros: pártelo` : ""}.\n- Fallos tragados en lo añadido (C5): ${tragados.length ? `⚠️\n${tragados.map((t) => `  - ${t}`).join("\n")}` : "ninguno visto."}\n- TODO C8/C14: ninguna lista ni umbral copiado a mano en dos sitios.\n- TODO C12: todo lo nuevo tiene lector y no hay ficheros ajenos al encargo.`,
    "## Sin comprobar\nTODO: lo que no se ha probado, dicho tal cual (p. ej. «Evals: no se han corrido, a petición de Pablo»).",
  ];
  if (refs) partes.push(refs);
  partes.push("🤖 Generated with [Claude Code](https://claude.com/claude-code)");
  return partes.join("\n\n");
}
