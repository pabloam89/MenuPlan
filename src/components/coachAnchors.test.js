import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Cada paso de un tutorial apunta a un `data-coach` del DOM. Cuando la UI se
 * mueve y ese ancla desaparece, NO se rompe nada a la vista:
 * ResolvingCoachTour descarta el paso en silencio y el tour enseña de menos.
 *
 * Así llegamos a tener 7 de 26 pasos apuntando al vacío sin que saltara una
 * sola alarma -- incluido el tutorial de Recetas entero, que se quedó sin
 * ningún paso válido y se cerraba solo al abrirlo.
 *
 * Este test es la alarma que faltaba.
 */

const RAIZ = "src";
const TOUR = join("src", "components", "HomeCoachTour.jsx");

// Anclas que se COMPONEN en tiempo de ejecución y por tanto nunca aparecen
// literales en el código: BottomNav pinta data-coach={`nav-${it.id}`} para
// cada pestaña. Se acepta el prefijo si el generador sigue ahí.
const GENERADORES = [{ prefijo: "nav-", marca: "data-coach={`nav-${it.id}`}" }];

function ficheros(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(jsx?|tsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

const fuentes = ficheros(RAIZ).filter((f) => f !== TOUR && !f.endsWith(sep + "HomeCoachTour.jsx"));
const textoApp = fuentes.map((f) => readFileSync(f, "utf8")).join("\n");
const textoTour = readFileSync(TOUR, "utf8");

const pasos = [...textoTour.matchAll(/selector:\s*'\[data-coach="([^"]+)"\]'/g)].map((m) => m[1]);

/**
 * Vale tanto el atributo literal como el nombre pasado por variable o prop
 * (data-coach={isMine ? "recipes-mine" : undefined}, coach="shop-purchased"),
 * porque las dos formas acaban pintando el atributo.
 */
function tieneDestino(ancla) {
  if (textoApp.includes(`"${ancla}"`)) return true;
  return GENERADORES.some((g) => ancla.startsWith(g.prefijo) && textoApp.includes(g.marca));
}

describe("cada paso de tutorial apunta a algo que existe", () => {
  it("encuentra los pasos declarados", () => {
    // Si esto baja de golpe, alguien borró tours sin querer.
    expect(pasos.length).toBeGreaterThan(15);
  });

  it("ningún paso apunta a un data-coach inexistente", () => {
    const huerfanos = pasos.filter((a) => !tieneDestino(a));
    expect(huerfanos, `Pasos sin destino en el DOM: ${huerfanos.join(", ")}`).toEqual([]);
  });

  it("ningún tutorial se queda sin un solo paso válido", () => {
    // El fallo de Recetas: los dos pasos rotos, el tour vacío y cerrándose
    // solo. Pulsar "?" no hacía nada.
    const vacios = [];
    for (const m of textoTour.matchAll(/export const (\w+_COACH_STEPS) = \[([\s\S]*?)\n\];/g)) {
      const suyos = [...m[2].matchAll(/data-coach="([^"]+)"/g)].map((x) => x[1]);
      if (suyos.length > 0 && !suyos.some(tieneDestino)) vacios.push(m[1]);
    }
    expect(vacios, `Tutoriales sin ningún paso vivo: ${vacios.join(", ")}`).toEqual([]);
  });
});
