/**
 * Buscador híbrido del Recetario Estrella: rasgos + vectores, y Haiku solo de
 * reserva. Lo acordaron dos agentes (diseño y crítica, oct 2026), con estas
 * medidas delante: Haiku solo (significado.js) acertaba 90 % con mediana
 * 1,2 s y peor caso 3,6 s; los vectores solos, 76 % y 0,7 s, y fallaban en
 * rasgos («de cuchara», «contundente») y en negaciones (29 %).
 *
 *  1. Rasgos de la frase (src/lib/rasgosBusqueda.js).
 *  2. Candidatas: estrella, en la carpeta y el tiempo que manda quien llama
 *     (Lola), sin lo excluido y cumpliendo los duros. Si quedan menos de 3,
 *     se quitan los duros (nunca lo excluido ni lo de Lola) y se avisa.
 *  3. Negación que no se entiende → Haiku, y lo que devuelve pasa por las
 *     mismas candidatas: Haiku nunca se salta una exclusión.
 *  4. Si no, el vector de la frase SIN lo negado, y se ordena por rasgos
 *     blandos cumplidos y después por parecido. Sin pesos que calibrar.
 *  5. Si el vector no llega y la frase no tiene rasgos → Haiku.
 *
 * Nunca decide qué se come: devuelve recetas del catálogo estrella, y las
 * alergias las avisa quien llama.
 */

import { rasgosDeFrase, cumple, excluye, blandosCumplidos, sinTildes } from "../../src/lib/rasgosBusqueda.js";
import { parecidos as parecidosGateway } from "./vectores.js";
import { porSignificado } from "./significado.js";

const VACIAS = new Set("algo alguna algun receta recetas para con que los las del una unos unas de el la y me dame ideas plato platos un hoy a al en mi mis tu por favor quiero".split(" "));
const tieneContenido = (s) => sinTildes(s).split(/[^a-z0-9]+/).some((w) => w.length > 2 && !VACIAS.has(w));

function describirDuros(duros) {
  return duros.map((d) => (d.campo === "tecnica" ? `«${{ horno: "al horno", plancha: "a la plancha", sarten: "frito", olla: "guisado", crudo: "sin cocinar" }[d.valor] ?? d.valor}»` : `«en ${d.valor} min o menos»`)).join(" y ");
}

/**
 * @param {string} consulta
 * @param {{ catalogo: any[], carpetaDe: (r: any) => string, categoria?: string|null, maxMinutos?: number|null, n?: number,
 *   deps?: { parecidos?: (frase: string) => Promise<Map<string, number>|null>, haiku?: Function } }} p
 * @returns {Promise<{ recetas: any[], aviso: string, via: "vectores"|"rasgos"|"haiku", rasgos: object, relajado: boolean, parecidoMax?: number|null }>}
 */
export async function buscarHibrido(consulta, { catalogo, carpetaDe, categoria = null, maxMinutos = null, n = 10, deps = {} }) {
  const { parecidos = parecidosGateway, haiku = porSignificado } = deps;
  const rasgos = rasgosDeFrase(consulta);

  const delQueLlama = (r) => (!categoria || carpetaDe(r) === categoria) && !(maxMinutos && r.time && r.time > maxMinutos);
  const base = catalogo.filter((r) => r.estrella !== false && delQueLlama(r) && !rasgos.excluir.some((e) => excluye(r, e)));
  let candidatas = base.filter((r) => rasgos.duros.every((d) => cumple(r, d)));
  let aviso = "";
  let relajado = false;
  if (rasgos.duros.length && candidatas.length < 3) {
    candidatas = base;
    relajado = true;
    aviso = `Casi ninguna cumple ${describirDuros(rasgos.duros)}: van las que más se acercan.`;
  }

  const porHaiku = async () => {
    const ids = await haiku(consulta, { catalogo, carpetaDe, n: Math.max(n, 8) });
    const dentro = new Map(candidatas.map((r) => [r.id, r]));
    const recetas = ids.map((id) => dentro.get(id)).filter(Boolean).slice(0, n);
    return { recetas, aviso, via: "haiku", rasgos, relajado };
  };
  if (rasgos.negacionSinResolver) return porHaiku();

  const notas = tieneContenido(rasgos.resto) ? await parecidos(rasgos.resto) : null;
  if (!notas && !rasgos.hayRasgos) return porHaiku();

  const parecido = (r) => notas?.get(r.id) ?? -1;
  const puntos = new Map(candidatas.map((r) => [r.id, blandosCumplidos(r, rasgos.blandos)]));
  const ordenadas = [...candidatas].sort((a, b) => puntos.get(b.id) - puntos.get(a.id) || parecido(b) - parecido(a));
  const recetas = ordenadas.slice(0, n);
  // El mejor parecido de lo que se devuelve: si es bajo, el índice no tenía
  // nada cerca (un hueco, scripts/lola-feedback.mjs).
  const parecidoMax = notas && recetas.length ? Math.max(...recetas.map(parecido)) : null;
  return { recetas, aviso, via: notas ? "vectores" : "rasgos", rasgos, relajado, parecidoMax };
}

/** ¿Pasa una receta (p. ej. una propia, que no tiene vector) lo que pide la frase? */
export function pasaRasgos(r, { rasgos, relajado }) {
  return !rasgos.excluir.some((e) => excluye(r, e)) && (relajado || rasgos.duros.every((d) => cumple(r, d)));
}
