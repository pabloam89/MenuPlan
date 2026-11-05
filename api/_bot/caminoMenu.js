/**
 * Antes de generar un menú, Lola pregunta siempre para cuándo y cómo de a fondo (decisión de Pablo del 4 nov 2026,
 * #1210): el menú solo se genera desde Lola, y cada vez se elige uno de los tres caminos de src/lib/caminos.js
 * (Solo los días / Unas preguntas / A fondo), la misma lista que el asistente de la app.
 *
 * Lo comprueba el código, no solo el manual: generar_menu no genera sin camino ni fecha, y tampoco en el mismo turno
 * en que se acaba de elegir el camino (entonces toca hacer sus preguntas). Puro: sin base.
 */
import { CAMINO, CAMINOS, TEMAS, temasDelCamino } from "../../src/lib/caminos.js";
import { faltaDelPedido } from "../../src/lib/pedidoMenu.js";
import { hasChildMember } from "../../src/lib/groups.js";
import { diaYNumero, esBotonRehacer, lunesDe, rangoDeFechas, resolverSemana, sumarDias } from "./semanaPedida.js";
import { lineaDeCamino } from "./manual.js";

/** Los ids de los caminos, para el enum de generar_menu. */
export const IDS_CAMINO = CAMINOS.map((c) => c.id);

/** Qué id es cada botón, para la descripción de generar_menu: «basico = Solo los días, …». */
export const LEYENDA_CAMINOS = CAMINOS.map((c) => `${c.id} = ${c.titulo}`).join(", ");

/** Los botones de elegir camino, con el texto que llega al pulsarlos: cada uno en su línea, al final del mensaje. */
export const BOTONES_CAMINO = CAMINOS.map((c) => `[[${c.titulo}]]`).join("\n");

/** Los mismos, como botones de Telegram que vuelven como si los escribieran (`t:`, sacarBotones en telegram.js). */
export const BOTONES_CAMINO_TELEGRAM = CAMINOS.map((c) => ({ texto: c.titulo, dato: `t:${c.titulo}` }));

/** La pregunta de antes de cada menú: para cuándo y cómo de a fondo (la misma que enseña el manual de Lola). */
export const PREGUNTA_DE_CAMINO = "¿Para cuándo quieres el menú, y cuánto lo afinamos?";

const tituloDeTema = (id) => TEMAS.find((t) => t.id === id).titulo;

/** El camino cuyo botón es este mensaje («Unas preguntas»), o null. */
export function caminoDelBoton(texto) {
  const t = String(texto ?? "").trim().toLowerCase();
  return CAMINOS.find((c) => c.titulo.toLowerCase() === t)?.id ?? null;
}

/** El botón para dejar de preguntar y generar con lo que haya (lo enseña el manual de Lola). */
export const BOTON_SALIR = "Ya está, genéralo";
export const esBotonSalir = (texto) => String(texto ?? "").trim().toLowerCase() === BOTON_SALIR.toLowerCase();

/** Pura. Lo que Lola da por supuesto, para decirlo en el resumen del menú. Sin supuestos, nada. */
export function notaDeSupuestos(supuestos = []) {
  const titulos = TEMAS.filter((t) => t.ejes.some((e) => supuestos.includes(e.dato))).map((t) => t.titulo);
  return titulos.length ? `Has dado por supuesto lo de: ${titulos.join(" ")} Dilo en una línea del resumen y ofrece cambiarlo.` : "";
}

/** Pura. ¿Hay niños en la casa? (para no preguntar lo que solo aplica con niños) */
export const hayNinosEn = (casa) => hasChildMember(casa?.state?.data?.members ?? []);

/**
 * Pura. Lo que Lola pregunta en un camino: los títulos de sus temas, en orden. Con `ejes` (ejesDeCasa.js), solo los
 * temas en los que a esta casa le falta algo: lo que ya dijo no se repite.
 */
export function preguntasDelCamino(camino, { hayNinos = false, ejes = null } = {}) {
  const temas = ejes ? faltaDelPedido({ camino, hayNinos, ejes }).temas : temasDelCamino(camino, { hayNinos });
  return temas.map(tituloDeTema);
}

/**
 * Pura. Desde cuándo se propone el menú: el primer día sin menú, esta semana (desde hoy) o, si ya lo tiene, la
 * primera libre (resolverSemana, la misma cuenta que generar). Null si no queda ninguna libre.
 * @returns {{ desde: string, domingo: string } | null}
 */
export function semanaPropuesta({ hoy, semanas = [] }) {
  const esta = resolverSemana({ cual: "esta", semanas, hoy });
  const r = esta.aviso ? resolverSemana({ cual: "siguiente", semanas, hoy }) : esta;
  if (r.aviso) return null;
  const lunes = sumarDias(lunesDe(hoy), 7 * r.offset);
  return { desde: sumarDias(lunes, r.startDayIdx), domingo: sumarDias(lunes, 6) };
}

/**
 * Pura. La pregunta de antes de cada menú, en corto (trozo 60 de #1037): qué días no tienen menú y desde cuándo,
 * en humano; una línea por camino con su botón en negrita; la otra vía (sus palabras o un audio); y los botones,
 * cada uno en su línea. Sin semana libre que proponer, la pregunta abierta de siempre.
 */
export function preguntaDeCamino({ hoy, semanas = [] }) {
  const s = semanaPropuesta({ hoy, semanas });
  const primera = s ? `Del ${rangoDeFechas(s.desde, s.domingo)} no tenéis menú. ¿Te lo preparo desde el <b>${diaYNumero(s.desde)}</b>?` : PREGUNTA_DE_CAMINO;
  return [primera, CAMINOS.map(lineaDeCamino).join("\n"), "O cuéntamelo con tus palabras o en un audio.", BOTONES_CAMINO].join("\n\n");
}

/**
 * Pura. Si no se puede generar todavía, el «NO GENERADO» con lo que Lola tiene que preguntar; si se puede, null.
 * @param {{ camino?: string|null, desde?: string|null, texto?: string, hayNinos?: boolean, hoy?: string, semanas?: object[], ejes?: object|null, forzado?: boolean, preguntado?: boolean }} p
 *   `texto`: el mensaje de este turno. Si es el botón «Rehacer la del…», ya trae su semana y no se pregunta.
 *   `hoy` y `semanas`: para proponer desde cuándo, cuando falta el camino.
 *   `ejes`: lo que la casa ya sabe (ejesDeCasa.js); sin ellos, se preguntan todos los temas del camino.
 *   `forzado`: dijeron «sigue tú»: ni camino, ni preguntas, ni fecha, salvo lo que bloquea. `preguntado`: ya se hicieron las del camino.
 */
export function faltaParaGenerar({ camino = null, desde = null, texto = "", hayNinos = false, hoy = null, semanas = [], ejes = null, forzado = false, preguntado = false }) {
  if (esBotonRehacer(texto)) return null;
  const hayCamino = IDS_CAMINO.includes(camino);
  if (ejes) {
    const { bloquea } = faltaDelPedido({ camino: hayCamino ? camino : CAMINO.BASICO, desde, forzado, ejes, hayNinos });
    if (bloquea.length) return `NO GENERADO: sin esto no se genera, aunque digan que sigas: ${bloquea.join(", ")}. Pregúntalo, con el aviso de «Seguridad», y luego generar_menu.`;
  }
  if (forzado) return null;
  if (!hayCamino) {
    if (!hoy) throw new Error("faltaParaGenerar: sin camino hace falta hoy para proponer la semana");
    const s = semanaPropuesta({ hoy, semanas });
    const luego = s ? ` Cuando elijan, generar_menu con ese camino y desde ${s.desde} (o la fecha que digan).` : " Cuando elijan, generar_menu con ese camino y la fecha que digan.";
    return `NO GENERADO: antes de generar, pregunta SIEMPRE para cuándo y cómo de a fondo con este mensaje, tal cual (si ya te han dicho la fecha, cambia solo la primera línea).${luego} Después te da las preguntas de ese camino.\n\n${preguntaDeCamino({ hoy, semanas })}`;
  }
  const preguntas = preguntasDelCamino(camino, { hayNinos, ejes }).join(" ");
  const titulo = CAMINOS.find((c) => c.id === camino).titulo;
  if (preguntas && (caminoDelBoton(texto) === camino || (ejes && !preguntado))) {
    return `NO GENERADO: acaban de elegir «${titulo}». Ahora pregúntale, en un mensaje y con la invitación a contestar en un audio, lo de ese camino (lo que ya sepas de la ficha, no lo vuelvas a preguntar)${desde ? "" : " y para cuándo lo quiere"}: ${preguntas} Con lo que conteste, generar_menu con camino «${camino}» y desde.`;
  }
  if (!desde) {
    return `NO GENERADO: falta para cuándo. Pregúntalo siempre, aunque parezca obvio (camino «${titulo}»: ${preguntas}). Luego generar_menu con camino y desde (AAAA-MM-DD).`;
  }
  return null;
}
