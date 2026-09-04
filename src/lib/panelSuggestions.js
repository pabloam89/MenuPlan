/**
 * Las sugerencias que abren el panel. SIN IA.
 *
 * Se leen del menú de esta semana y se comparan con lo que la libreta dice que
 * queríais. Cero latencia, cero coste, cero alucinación — y el usuario abre la
 * burbuja y ve que la app YA ha mirado su menú antes de que él escriba nada.
 * Eso compra más confianza que cualquier respuesta del modelo, y es lo que
 * mata la pantalla en blanco: una caja de texto vacía da mal material.
 *
 * La regla que las hace útiles: una sugerencia solo aparece si tiene algo que
 * decir de ESTE menú. "Menos pescado" cuando no hay pescado es ruido, y el
 * ruido enseña al usuario a ignorar el panel.
 */

import { CAMPOS_POR_ID } from "./notepadFields.js";
import { valorDe, proyectar } from "./notepad.js";

/** Cuántas se enseñan. Tres o cuatro caben sin scroll y no abruman. */
export const MAX_SUGERENCIAS = 4;

const FAMILIA_LABEL = {
  carne: "carne", pescado: "pescado", legumbres: "legumbre",
  pasta_arroz: "pasta o arroz", huevos: "huevo", verdura: "verdura",
};

const veces = (n) => (n === 1 ? "una vez" : n === 2 ? "dos veces" : `${n} veces`);

/**
 * @param {{familias: Record<string, number>, cocinas: Record<string, number>, tecnicas: Record<string, number>, huecos: number}} recuento
 *   Lo que hay en el menú de esta semana, ya contado por quien lo tiene a mano.
 * @param {object} notepad
 * @returns {Array<{id: string, texto: string, frase: string, porque: string}>}
 *   `frase` es lo que se escribe en el input al pulsarla — la sugerencia no
 *   ejecuta nada por su cuenta, rellena el campo y deja que el flujo normal
 *   siga. Así hay un solo camino que mantener y probar.
 */
export function sugerenciasDelMenu(recuento, notepad) {
  const { familias = {}, cocinas = {}, tecnicas = {}, huecos = 0 } = recuento ?? {};
  const objetivos = proyectar(notepad).freqs;
  const out = [];

  // 1. Una familia que se pasa de lo que pediste. Es la más accionable de
  //    todas porque el usuario ya dijo cuánto quería.
  for (const [familia, cuantas] of Object.entries(familias)) {
    const objetivo = objetivos[familia];
    if (objetivo != null && cuantas > objetivo) {
      out.push({
        id: `menos-${familia}`,
        texto: `Menos ${FAMILIA_LABEL[familia] ?? familia}`,
        frase: `menos ${FAMILIA_LABEL[familia] ?? familia}`,
        porque: `Hay ${veces(cuantas)} y pediste ${objetivo}`,
      });
    }
  }

  // 2. Una técnica que domina la semana. El umbral es un TERCIO de los huecos:
  //    por debajo de eso no es monotonía, es casualidad, y avisar de una
  //    casualidad es exactamente el ruido que queremos evitar.
  const [tecnicaTop, tecnicaN] = mayor(tecnicas);
  if (tecnicaTop && huecos >= 6 && tecnicaN >= Math.ceil(huecos / 3)) {
    out.push({
      id: `variar-${tecnicaTop}`,
      texto: "Más variedad de estilos",
      frase: `menos ${tecnicaTop}`,
      porque: `${tecnicaN} platos ${preposicion(tecnicaTop)} ${tecnicaTop}`,
    });
  }

  // 3. Semana sin cocina de fuera. Solo si de verdad no hay NINGUNA: con una
  //    ya no es un hueco, es una semana normal.
  if (Object.keys(cocinas).length === 0 && huecos > 0) {
    const dominio = CAMPOS_POR_ID.cocina.dominio;
    const cual = dominio[Math.floor(Date.now() / 86400000) % dominio.length];
    out.push({
      id: `probar-${cual}`,
      texto: `Prueba algo ${cual}`,
      frase: `más comida ${cual}`,
      porque: "Esta semana no hay nada de fuera",
    });
  }

  // 4. Comodín: siempre queda algo que ofrecer, para que el panel nunca abra
  //    vacío ni siquiera con un menú recién generado y perfecto.
  if (out.length < 2) {
    out.push({
      id: "mas-rapido",
      texto: "Algo más rápido",
      frase: "algo más rápido",
      porque: "Para las noches con prisa",
    });
  }

  return out.slice(0, MAX_SUGERENCIAS);
}

function mayor(obj) {
  let clave = null, max = 0;
  for (const [k, v] of Object.entries(obj ?? {})) if (v > max) { clave = k; max = v; }
  return [clave, max];
}

// "al horno" pero "a la plancha": el castellano no perdona esto y una frase
// mal construida delata que la escribió una máquina.
const preposicion = (t) => (t === "plancha" ? "a la" : t === "sarten" ? "a la" : "al");

/**
 * El contexto que viaja al modelo: números, nunca nombres.
 *
 * Sin platos, sin personas, sin ids. El modelo solo necesita saber de dónde
 * parte para poder decir "ahora hay pescado dos veces"; darle el menú entero
 * sería mandar datos de casa a un tercero sin que haga falta.
 */
export function contextoParaElModelo(recuento, notepad) {
  const objetivos = proyectar(notepad).freqs;
  const lineas = [];
  for (const [familia, n] of Object.entries(recuento?.familias ?? {})) {
    const objetivo = objetivos[familia];
    lineas.push(`${FAMILIA_LABEL[familia] ?? familia}: ${n} esta semana${objetivo != null ? ` (pediste ${objetivo})` : ""}`);
  }
  const cocinas = Object.keys(recuento?.cocinas ?? {});
  return [
    `Huecos de la semana: ${recuento?.huecos ?? 0}.`,
    lineas.length ? `Reparto actual — ${lineas.join("; ")}.` : null,
    cocinas.length ? `Cocinas presentes: ${cocinas.join(", ")}.` : "No hay ningún plato de cocina de fuera.",
  ].filter(Boolean).join("\n");
}

export { FAMILIA_LABEL };
