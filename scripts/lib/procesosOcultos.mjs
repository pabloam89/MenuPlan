/**
 * procesosOcultos.mjs — que ningún proceso hijo de un hook abra una consola (#506).
 *
 * En Windows, un proceso que corre sin consola propia (un hook, o el cálculo de
 * zonas lanzado en segundo plano con `detached`) abre una ventana de consola
 * visible por cada `git`, `gh` u `op` que lance, salvo que la llamada lleve
 * `windowsHide: true`. El revisor de #506 contó unas 38 ventanas por cada
 * refresco de zonas. La clase: toda llamada de `node:child_process` en
 * `.claude/hooks/` y `scripts/lib/` (lo que cargan los hooks y lo que lanzan
 * en segundo plano) lleva `windowsHide: true`, en la propia llamada o en una
 * constante de opciones del mismo fichero que nombra.
 *
 * Lo vigila ops/procesosOcultos.test.js sobre esas dos carpetas (registrado en
 * ops/vigilantes.json). Es un escáner de texto: busca las funciones importadas de
 * `node:child_process` y mira el texto de cada llamada.
 */

const FUNCIONES = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"];

/** Las funciones de child_process que importa el fichero, con su nombre local. */
export function funcionesImportadas(texto) {
  const nombres = new Set();
  for (const m of String(texto).matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/g)) {
    for (const parte of m[1].split(",")) {
      const [orig, alias] = parte.trim().split(/\s+as\s+/);
      if (FUNCIONES.includes(orig)) nombres.add(alias ?? orig);
    }
  }
  return nombres;
}

/** El texto de la llamada que empieza en `desde` (el paréntesis de apertura), con paréntesis equilibrados. */
function textoDeLlamada(texto, desde) {
  let nivel = 0;
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")" && --nivel === 0) return texto.slice(desde, i + 1);
  }
  return texto.slice(desde);
}

/** ¿El fichero define `id` como un objeto de opciones con windowsHide? */
const constanteOculta = (texto, id) => new RegExp(String.raw`(?:const|let)\s+${id}\s*=\s*(?:\([^)]*\)\s*=>\s*\(?)?\{[^;]*?windowsHide\s*:\s*true`).test(texto);

/**
 * Las llamadas sin `windowsHide: true`: [{ linea, llamada }]. Un `.exec(` de una
 * expresión regular no cuenta (va tras un punto).
 */
export function llamadasSinOcultar(texto) {
  const t = String(texto);
  const nombres = funcionesImportadas(t);
  if (!nombres.size) return [];
  const re = new RegExp(String.raw`(?<![.\w])(${[...nombres].join("|")})\s*\(`, "g");
  const malas = [];
  for (const m of t.matchAll(re)) {
    // La línea del import no es una llamada.
    const inicioLinea = t.lastIndexOf("\n", m.index) + 1;
    const linea = t.slice(inicioLinea, t.indexOf("\n", m.index) === -1 ? t.length : t.indexOf("\n", m.index));
    if (/^\s*(?:import|\*|\/\/)/.test(linea)) continue;
    const llamada = textoDeLlamada(t, m.index + m[0].length - 1);
    if (/windowsHide\s*:\s*true/.test(llamada)) continue;
    const ids = [...llamada.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((x) => x[1]);
    if (ids.some((id) => constanteOculta(t, id))) continue;
    malas.push({ linea: t.slice(0, m.index).split("\n").length, llamada: llamada.replace(/\s+/g, " ").slice(0, 100) });
  }
  return malas;
}
