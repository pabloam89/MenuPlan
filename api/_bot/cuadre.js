/**
 * Lola solo confirma lo que de verdad quedó guardado, y con los valores
 * guardados (L1 del plan de conversación, decisión de Pablo del 3 nov 2026).
 *
 * El vigilante de #958 (agente.js, `diceQueGuardo`) solo mira si en el turno
 * se guardó ALGO. No veía que Lola dijera «comida y cena» y se guardara solo
 * «cena», ni que confirmara un día que no se tocó. Aquí se compara, en código:
 * los valores que nombra Lola en las frases en que dice que está hecho, contra
 * los `valores` del RESULTADO de la herramienta (resultado.js, por ejes
 * cerrados: día, comida, persona).
 *
 *   · cuadra: Lola lo dice con su voz y el recibo ✅ de ese resultado no se
 *     repite (lo que falta, ⚠️, sale siempre);
 *   · no cuadra: sus frases de confirmar que nombran algo que no se guardó se
 *     quitan y entra el recibo en su lugar;
 *   · lo demás (no lo dice, no nombra nada, o el resultado no trae valores):
 *     el recibo como siempre.
 *
 * Errar hacia el recibo es lo barato: la familia lee una línea más seca, pero
 * cierta. Por eso lo dudoso (un «hoy» sin fecha, un día que no se nombra) no
 * cuenta como cuadrar.
 *
 * Lo que nombra cada frase lo lee el intérprete (interprete.js valoresNombrados).
 * Pura: sin base ni modelo, para los tests. `confirma` (agente.js
 * diceQueGuardo) entra de fuera para no importar agente.js.
 */
import { valoresNombrados as menciones } from "./interprete.js";

export { menciones };

/** Cómo acaba la comparación del turno (bot_route.cuadre): vocabulario cerrado. */
export const CUADRE = Object.freeze({
  SIN_VALORES: "sin_valores",
  NO_LO_DICE: "no_lo_dice",
  SIN_NOMBRAR: "sin_nombrar",
  CUADRA: "cuadra",
  NO_CUADRA: "no_cuadra",
});

/** Por qué no cuadra, una clase por fallo. */
export const FALLO = Object.freeze({
  // Nombra un valor de un eje guardado que no se guardó («comida y cena» y se guardó «cena»).
  OTRO_VALOR: "otro_valor",
  // Confirma un eje que en el turno no se tocó (un día, cuando lo guardado no lleva días).
  EJE_NO_TOCADO: "eje_no_tocado",
  // Nombra parte de lo guardado en un eje («cena» y se guardaron comida y cena).
  FALTA_VALOR: "falta_valor",
  // No nombra un eje que hay que decir (el día o la comida).
  FALTA_EJE: "falta_eje",
});

/** Lo que Lola tiene que nombrar siempre al confirmar; la persona puede ir implícita («cenáis fuera»). */
const OBLIGATORIOS = ["dia", "comida"];

/**
 * Las frases del texto, tal cual (para poder quitarlas): por punto, «!», «?»,
 * «;» o salto de línea. Una pregunta no afirma nada (el vigilante tampoco la lee).
 */
export const frasesDe = (texto) => String(texto ?? "").split(/(?<=[.!?…;])[ \t]+|\n+/).map((x) => x.trim()).filter(Boolean);

/**
 * ¿Cuadra lo que confirma Lola con lo guardado en el turno?
 * @param {string} texto  lo que dice Lola.
 * @param {object[]} resultados  los RESULTADOS del turno (resultado.js).
 * @param {{ confirma: (frase: string) => boolean, hoy?: string|null, nombres?: string[] }} opciones
 *   `confirma`: si una frase dice que está hecho (agente.js diceQueGuardo);
 *   `hoy`: el día de hoy («Vie»), para «hoy» y «mañana»; `nombres`: los de la casa.
 * @returns {{ estado: string, dichos: object[], quitar: string[], fallos: { eje: string, valor: string|null, clase: string }[] }}
 */
export function cuadre(texto, resultados = [], { confirma, hoy = null, nombres = [] }) {
  const hechos = resultados.filter((r) => r.hecho.length);
  const conValores = hechos.filter((r) => r.valores);
  const nada = (estado) => ({ estado, dichos: [], quitar: [], fallos: [] });
  if (!conValores.length) return nada(CUADRE.SIN_VALORES);

  const guardado = {};
  for (const r of conValores) for (const [eje, l] of Object.entries(r.valores)) for (const v of l) (guardado[eje] ??= new Set()).add(v);
  // Sabemos todo lo guardado en el turno solo si todo resultado con algo hecho trae valores.
  const completo = conValores.length === hechos.length;
  const opciones = { hoy, nombres: [...nombres, ...(guardado.persona ?? [])] };

  // La unidad es la frase que confirma; si no nombra nada («¡Hecho!»), se lleva la siguiente.
  const frases = frasesDe(texto).filter((f) => !/\?$/.test(f));
  const unidades = [];
  for (let i = 0; i < frases.length; i++) {
    if (!confirma(frases[i])) continue;
    const sola = menciones(frases[i], opciones);
    const conSiguiente = !Object.keys(sola).length && frases[i + 1] && !confirma(frases[i + 1]);
    unidades.push(conSiguiente ? { frases: [frases[i], frases[i + 1]], m: menciones(`${frases[i]} ${frases[i + 1]}`, opciones) } : { frases: [frases[i]], m: sola });
    if (conSiguiente) i++;
  }
  if (!unidades.length) return nada(CUADRE.NO_LO_DICE);
  if (unidades.every((u) => !Object.keys(u.m).length)) return nada(CUADRE.SIN_NOMBRAR);

  const fallos = [];
  const malas = new Set();
  const dicho = {};
  for (const u of unidades) {
    for (const [eje, vs] of Object.entries(u.m)) {
      for (const v of vs) {
        (dicho[eje] ??= new Set()).add(v);
        if (guardado[eje] ? guardado[eje].has(v) : !completo) continue;
        fallos.push({ eje, valor: v, clase: guardado[eje] ? FALLO.OTRO_VALOR : FALLO.EJE_NO_TOCADO });
        malas.add(u);
      }
    }
  }
  for (const [eje, vs] of Object.entries(guardado)) {
    if (dicho[eje]) {
      const faltan = [...vs].filter((v) => !dicho[eje].has(v));
      for (const v of faltan) fallos.push({ eje, valor: v, clase: FALLO.FALTA_VALOR });
      if (faltan.length) for (const u of unidades) if (u.m[eje]) malas.add(u);
    } else if (OBLIGATORIOS.includes(eje)) {
      // No dice nada falso: su frase se queda, pero el recibo dice lo que calló.
      fallos.push({ eje, valor: null, clase: FALLO.FALTA_EJE });
    }
  }
  if (!fallos.length) return { estado: CUADRE.CUADRA, dichos: conValores, quitar: [], fallos };
  return { estado: CUADRE.NO_CUADRA, dichos: [], quitar: [...malas].flatMap((u) => u.frases), fallos };
}
