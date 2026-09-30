import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/**
 * El código fuente no lleva caracteres de control, y hay un motivo concreto.
 *
 * `src/lib/ingredients.js` llevó durante meses un byte 0x08 —un backspace
 * literal— donde alguien quiso escribir la frontera de palabra:
 *
 *     const ES_SAL = /^sal<0x08>|sal gruesa|sal gorda|sal marina/i;
 *
 * En pantalla se lee igual que si dijera `\b` y parece correcto. En ejecución
 * la primera alternativa no casa NUNCA, así que la regla de la costra de sal
 * —la que existe porque «Dorada a la sal» llegó a publicar 291.593 mg de
 * sodio— corría con un cuarto de su alcance: «Sal gruesa» sí, «Sal» y «Sal en
 * escamas» no, y son 354 líneas del catálogo.
 *
 * Es el mismo daño que la regla de no escribir en el repo con herramientas que
 * reinterpretan el texto: un byte invisible que sobrevive a la revisión porque
 * el diff lo pinta igual que lo que se quería escribir. La diferencia es que
 * aquello rompía los acentos, que se ven, y esto rompía un regex, que no.
 *
 * Se permite el tabulador porque hay ficheros que lo usan para indentar.
 */
const EXTENSIONES = /\.(js|jsx|mjs|json|sql)$/;
const IGNORA = new Set(["node_modules", "dist", "output", ".git", ".claude", "coverage", "public"]);

// El repo va en CRLF, así que el 0x0D del final de línea es legítimo y se
// normaliza antes de mirar. Un CR SUELTO en medio de una línea sí salta — y
// ya cazó uno, al final de `src/lib/freezer.js`.
const sinFinalesDeLinea = (s) => s.replace(/\r\n/g, "\n");

/**
 * Todo lo de control menos el tabulador (9), el salto de línea (10) y el
 * retorno de carro (13), que aquí es final de línea legítimo.
 *
 * Se compara por NÚMERO y no con un regex de escapes, a propósito: una
 * secuencia de escape unicode escrita en el fuente es justo la clase de cosa
 * que se convierte en carácter real al pasar por la herramienta equivocada, y
 * este test acabaría delatándose a sí mismo. Pasó dos veces mientras se
 * escribía, y la segunda la cazó él.
 *
 * Mirar el Buffer y no la cadena también lo hace rápido: los bytes de control
 * son ASCII y en UTF-8 ninguna continuación baja de 0x80, así que no hay
 * falsos positivos con los acentos.
 */
const esControl = (b) => (b < 9 || b === 11 || b === 12 || (b > 13 && b < 32) || b === 127);

function ficheros(dir) {
  const out = [];
  for (const entrada of readdirSync(dir)) {
    if (IGNORA.has(entrada)) continue;
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) out.push(...ficheros(p));
    else if (EXTENSIONES.test(entrada)) out.push(p);
  }
  return out;
}

describe("las fuentes no llevan caracteres invisibles", () => {
  // Son ~900 ficheros y algunos pasan del megabyte. Se mira el fichero entero
  // de una pasada y solo se baja a localizar la línea cuando hay algo que
  // enseñar: recorrerlo carácter a carácter tardaba nueve segundos.
  it("ningún byte de control en el código ni en los datos", () => {
    const sucios = [];
    for (const f of ficheros(RAIZ)) {
      const bytes = readFileSync(f);
      if (!bytes.some(esControl)) continue;
      // Solo cuando hay algo que enseñar se baja a localizar la línea.
      sinFinalesDeLinea(bytes.toString("utf8")).split("\n").forEach((linea, i) => {
        for (const ch of linea) {
          if (!esControl(ch.charCodeAt(0))) continue;
          const code = ch.charCodeAt(0).toString(16);
          sucios.push(`${relative(RAIZ, f)}:${i + 1} · byte 0x${code} · ${linea.trim().slice(0, 60)}`);
          return;
        }
      });
    }
    expect(
      sucios,
      "caracteres de control en el fuente. El caso real fue un 0x08 donde se quiso escribir "
      + "una frontera de palabra: se lee bien en el diff y en ejecución la alternativa no casa "
      + "nunca. Si es un regex, escribe la barra invertida y la b; si es un dato, quítalo.",
    ).toEqual([]);
  }, 30_000);
});
