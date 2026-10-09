/**
 * Umbrales y ventanas del vigía y el canario de Lola (#267). Un solo sitio:
 * scripts/vigia.mjs, el workflow .github/workflows/vigia-lola.yml y
 * api/bot/canario.js leen de aquí, y vigia.test.js comprueba que cuadran
 * (motivos del vocabulario, ventanas dentro de lo que guarda Vercel, el cron
 * del workflow igual a `cadaMin`). Vive en src/lib y no en scripts/ porque
 * .vercelignore deja scripts/ fuera del despliegue y el canario lo necesita.
 *
 * Los umbrales de salida son una estimación sin línea base: no se pudo contar
 * cuántos `bot_fallo` hay en un día normal (la CLI de Vercel no está en el PC
 * de Pablo). El resumen diario da esa cifra; con una semana de resúmenes se
 * ajustan aquí, en un PR.
 *
 * Coste mensual estimado (9 oct 2026), todo con los precios de hoy:
 *   - El vigía: 0 €. Corre en GitHub Actions y el repo es público (minutos
 *     gratis); lee los logs con la CLI de Vercel, que no se cobra.
 *   - El canario sin modelo: 0 €. Una función de Vercel cada 15 min (~2.900
 *     llamadas al mes, de un millón incluidas en Pro), dos lecturas pequeñas
 *     a la base y una llamada a getWebhookInfo de Telegram (gratis).
 *   - El canario con modelo, medido el 9 oct 2026 con claude-sonnet-5 y la
 *     ficha fija: 0,066 $ con la caché fría (17.248 tokens escritos en caché
 *     a 3,75 $/M y 61 de salida) y 0,014 $ con ella caliente. 4 al día →
 *     entre 1,7 y 8 $ al mes; con la casa de prueba, algo más (su ficha y
 *     alguna vuelta con herramienta). Es la única pieza que cuesta:
 *     `modeloCadaHoras` la sube o la baja. La cifra real sale en cada línea
 *     `canario` del log (tokens) y en el resumen diario.
 *
 * El entorno de los logs: `entorno` abajo, o la variable VIGIA_ENTORNO del
 * repo, que manda. Tiene que ser el del despliegue al que apunta el webhook
 * de Lola (el 9 oct 2026, staging: `preview`).
 */

import { MOTIVOS_FALLO } from "./vocabularios.js";

export const VIGIA = Object.freeze({
  /** Qué logs mira: producción. Staging casi no tiene tráfico. */
  entorno: "production",
  /** Cada cuánto corre el vigía (el cron de vigia-lola.yml dice lo mismo; lo vigila el test). */
  cadaMin: 15,
  /**
   * Un hueco sin pasadas más largo que esto es un aviso `vigia_parado`. Los
   * cron de GitHub llegan tarde hasta 15-20 min con carga: con menos, avisaría
   * de retrasos normales.
   */
  huecoMin: 50,
  /** Lo que guarda Vercel de los logs de ejecución en Pro: ninguna ventana puede pasar de aquí. */
  retencionLogsMin: 24 * 60,
  /** Cuántas pasadas como mucho se reintenta un aviso que Telegram no aceptó. */
  reintentosAviso: 4,

  /**
   * Reglas sobre las líneas `bot_fallo`. Cada una abre un incidente cuando en
   * `ventanaMin` hay `abrirDesde` fallos o más de sus motivos, y lo cierra
   * cuando en los últimos `calmaMin` hay menos de `cerrarBajoDe`. Solo cuentan
   * los graves (fallaCon): los leves (seguirCon) son de cosas accesorias y van
   * al resumen. `todos` cuenta cualquier motivo: lo que no salta por uno solo
   * y sí por el montón.
   */
  reglas: Object.freeze([
    // La IA: si cae, el plan B (Opus) tapa, pero cada fallo es un turno lento o perdido.
    { clave: "modelo", motivos: ["modelo"], ventanaMin: 15, abrirDesde: 3, calmaMin: 30, cerrarBajoDe: 1 },
    // Una clave que no vale (401) o un permiso que falta: no se arregla solo.
    { clave: "sin_sesion", motivos: ["sin_sesion"], ventanaMin: 15, abrirDesde: 2, calmaMin: 30, cerrarBajoDe: 1 },
    { clave: "permiso", motivos: ["permiso"], ventanaMin: 15, abrirDesde: 2, calmaMin: 30, cerrarBajoDe: 1 },
    // Falta una tabla, columna o función: casi siempre una migración sin aplicar.
    { clave: "no_existe", motivos: ["no_existe"], ventanaMin: 30, abrirDesde: 3, calmaMin: 60, cerrarBajoDe: 1 },
    { clave: "telegram", motivos: ["telegram"], ventanaMin: 15, abrirDesde: 5, calmaMin: 30, cerrarBajoDe: 2 },
    // La base o el camino hasta ella.
    { clave: "base", motivos: ["tiempo", "red", "servidor"], ventanaMin: 15, abrirDesde: 5, calmaMin: 30, cerrarBajoDe: 2 },
    { clave: "limite", motivos: ["limite"], ventanaMin: 30, abrirDesde: 5, calmaMin: 60, cerrarBajoDe: 2 },
    // Lo que suele ser de un caso concreto: solo salta si se repite mucho.
    { clave: "datos", motivos: ["conflicto", "datos_invalidos", "otro"], ventanaMin: 60, abrirDesde: 10, calmaMin: 60, cerrarBajoDe: 5 },
    { clave: "todos", motivos: [...MOTIVOS_FALLO], ventanaMin: 15, abrirDesde: 15, calmaMin: 30, cerrarBajoDe: 5 },
  ].map((r) => Object.freeze({ soloGraves: true, ...r }))),

  canario: Object.freeze({
    /** El turno con modelo, cada tantas horas (el resto de pasadas, solo salud). */
    modeloCadaHoras: 6,
    /** Pasadas seguidas fallando para abrir el incidente: una sola puede ser un tropiezo. */
    fallosParaAbrir: 2,
    /** Un turno con modelo más lento que esto falla como `lento` (el plazo del bot es 120 s). */
    lentoMs: 45_000,
    /** Mensajes en cola en Telegram por encima de esto: el webhook no da abasto. */
    colaMaxima: 20,
    /** Un error del webhook en Telegram más reciente que esto cuenta. */
    errorRecienteMin: 15,
    /** Plazos de la llamada del vigía al canario. */
    plazoSaludMs: 30_000,
    plazoModeloMs: 110_000,
    /** Lo que pregunta el canario con modelo: de solo lectura y con respuesta en la ficha. */
    pregunta: "¿Qué comemos hoy?",
  }),

  resumen: Object.freeze({
    /** A partir de esta hora de Madrid sale el resumen del día (en la primera pasada). */
    horaMadrid: 9,
  }),

  enlaces: Object.freeze({
    logs: "https://vercel.com/menuplan/homenu/logs",
  }),
});

/** Cuántos minutos de logs hace falta leer en una pasada normal (la ventana más larga). */
export function minutosALeer(config = VIGIA) {
  return Math.max(...config.reglas.map((r) => Math.max(r.ventanaMin, r.calmaMin)));
}
