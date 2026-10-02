/**
 * Las vías rápidas del enrutador (api/_bot/router.js): lo que se resuelve sin
 * Lola, con el motor de siempre y una plantilla en su voz (mismo formato que
 * pide api/_bot/conocimiento.md: negritas, viñetas, un emoji por bloque,
 * botones). Cada función devuelve lo mismo que devuelve Lola —{ texto, fotos,
 * deshacible, ir }— para que api/bot/telegram.js lo entregue igual; o null si
 * no puede con ello, y entonces contesta Lola.
 *
 * Y el paso 0 de la cascada, el ESTADO: si lo último que dijo fue una lista
 * de opciones y le contestan con una (o «elige tú»), eso es elegir. Sin esto,
 * un «Para hoy» o «la merluza» se leían como peticiones nuevas.
 */

import { cargarCasa, deshacer, hoyISO } from "./casa.js";
import {
  proponerPlatos, cambiarPlato, anadirCompra, marcarCompra, normal, DIA_LARGO, grupos, quienesDe, cambiosDe,
} from "./menu.js";
import { generarMenu } from "./generar.js";
import { respuestaCompra, respuestaMenu, rangoDeFechas } from "./rapido.js";
import { fechasDe } from "./cuando.js";
import { filtrosTrasGenerar, filtrosTrasCambiar } from "./pintar.js";
import { rastro } from "./embudo.js";
import { verReceta, calorias, queFalta, verDespensaRapido, huecoSinComida, preguntaComida } from "./plato.js";
import { apuntarAusencia } from "./menu.js";
import { RASTRO, MOTIVO_CAMBIO, idBase } from "../../src/lib/rastro.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Icono y artículo de cada comida, del catálogo (src/lib/comidas.js).
import { articuloDe } from "../../src/lib/comidas.js";
const MAX_BOTON = 38;

/** «la cena de hoy», «la comida del jueves» */
function huecoEnTexto({ franja, dia, fecha }) {
  const hoyISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const cuando = fecha === hoyISO ? "de hoy" : dia ? `del ${DIA_LARGO[dia] ?? dia}` : "";
  return `${articuloDe(franja)} ${cuando}`.trim();
}

const mayusculaInicial = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const boton = (nombre) => (nombre.length > MAX_BOTON ? `${nombre.slice(0, MAX_BOTON - 1).trim()}…` : nombre);

function lineaOpcion(r, estilo) {
  const extra = [
    cambiosDe(r),
    r.time ? `${r.time} min` : "",
    estilo === "ligero" && r.kcal ? `${Math.round(r.kcal)} kcal` : "",
    r.costeRacion != null ? `≈ ${r.costeRacion.toFixed(2).replace(".", ",")} €/ración` : "",
  ].filter(Boolean).join(", ");
  return `• <b>${esc(r.name)}</b>${extra ? `: ${extra}` : ""}`;
}

/** El nombre de un grupo como cabecera: icono según quién es, en negrita, con dos puntos. */
function cabeceraGrupo(nombre, tipo) {
  const icono = { bebe: "👶", ninos: "🧒" }[tipo] ?? (/beb/i.test(nombre) ? "👶" : /niñ|peque/i.test(nombre) ? "🧒" : "👥");
  return `${icono} <b>${esc(mayusculaInicial(nombre))}:</b>`;
}

/**
 * «🛒 Apuntado en la lista: <b>leche</b> y <b>pan</b>.» si son pocas y cortas;
 * si no, la etiqueta en negrita y las cosas en viñetas. En una línea la
 * etiqueta va sin negrita: pegada a las cosas en negrita se lee todo como una.
 */
function enLista(icono, etiqueta, cosas) {
  const b = cosas.map((p) => `<b>${esc(p)}</b>`);
  if (cosas.length <= 2 && cosas.join("").length < 40) return `${icono} ${etiqueta}: ${b.join(" y ")}.`;
  return `${icono} <b>${etiqueta}:</b>\n${b.map((x) => `• ${x}`).join("\n")}`;
}

// ── Recomendar ──────────────────────────────────────────────────────────────

export async function recomendar(householdId, x) {
  const out = {};
  const fotos = [];
  await proponerPlatos(householdId, {
    dia: x.dia ?? null, franja: x.comida ?? null, para: x.para ?? null, cual: x.cual ?? "principal",
    n: 3, estilo: x.estilo ?? null, rasgos: x.rasgos ?? null,
  }, fotos, out);
  const bloques = (out.bloques ?? []).filter((b) => b.opciones?.length);
  if (!bloques.length) return null; // sin opciones: que lo explique Lola
  const hueco = huecoEnTexto(out);
  const cabecera = out.conMenu
    ? `👉 Para <b>${hueco}</b>${out.quienes ? ` de <i>${esc(out.quienes)}</i>` : ""} te encajan:`
    : `👉 Ideas para <b>${hueco}</b>:`;
  const cuerpo = bloques.map((b) => `${b.grupo && bloques.length > 1 ? `${cabeceraGrupo(b.quienes ?? b.grupo, b.tipo)}\n` : ""}${b.opciones.map((r) => lineaOpcion(r, out.estilo)).join("\n")}`).join("\n\n");
  const opciones = bloques.flatMap((b) => b.opciones);
  const aviso = (out.aviso || bloques.some((b) => b.aviso)) ? "\n\n<i>No había ninguna que cumpliera todo lo que pides: estas son las que más se acercan.</i>" : "";
  const pregunta = out.conMenu ? "¿Cuál te pongo?" : "¿Te paso la receta de alguna?";
  const botones = [...opciones.slice(0, 3).map((r) => `[[${boton(r.name)}]]`), ...(out.conMenu ? ["[[Elige tú]]"] : [])].join("\n");
  return {
    texto: `${cabecera}\n\n${cuerpo}${aviso}\n\n${pregunta}\n${botones}`,
    fotos,
    deshacible: false,
    ir: null,
    // Para el paso 0 del turno siguiente: qué se ofreció y para qué hueco.
    propuesta: {
      conMenu: !!out.conMenu, dia: out.dia ?? null, fecha: out.fecha ?? null, franja: out.franja, cual: out.cual ?? "principal",
      // El grupo solo si lo dijeron: si no, al elegir se pone para toda la familia.
      grupo: x.para || x.grupo ? out.grupo ?? null : null, opciones: opciones.map((r) => ({ id: r.id, nombre: r.name })),
    },
  };
}

// ── Cambiar ─────────────────────────────────────────────────────────────────

export async function cambiar(householdId, x) {
  const out = {};
  const fotos = [];
  await cambiarPlato(householdId, {
    dia: x.dia, franja: x.comida, grupo: x.grupo ?? x.para ?? null, cual: x.cual ?? "principal", receta: x.receta ?? null, motivo: x.motivo ?? null,
  }, fotos, out);
  if (!out.cambiado) return null; // no se pudo: Lola lo explica y ofrece opciones
  const hueco = huecoEnTexto(out);
  const sinCambiar = out.sinCambiar?.length ? `\n\n<i>A ${esc(out.sinCambiar.join(" y "))} le dejo lo suyo: ese plato no le encaja.</i>` : "";
  const aproximada = out.aproximada ? `\n<i>No había «${esc(out.pedida)}» tal cual: es lo más parecido que encaja.</i>` : "";
  // El día cambiado sale pintado debajo (pintarMenu), con el plato nuevo
  // destacado: aquí solo se dice qué se ha hecho y qué había antes.
  return {
    texto: `✅ <b>Hecho.</b> He cambiado ${hueco}${out.grupo ? ` de <i>${esc(out.grupo)}</i>` : ""}: ahora es <b>${esc(out.despues)}</b>${out.antes ? ` <i>(antes: ${esc(out.antes)})</i>` : ""}.${aproximada}${sinCambiar}`,
    fotos,
    deshacible: false,
    ir: out.dia ? `dia:${out.dia}` : null,
    pintar: filtrosTrasCambiar(out),
  };
}

// ── Compra ──────────────────────────────────────────────────────────────────

export async function apuntar(householdId, x, autor = null) {
  const out = {};
  await anadirCompra(householdId, x.productos ?? [], out);
  if (!out.ok || !out.anadidos?.length) return null;
  return {
    // En un chat de grupo se dice quién lo pidió, como hace Lola.
    texto: enLista("🛒", autor ? `Apuntado por ${esc(autor)}` : "Apuntado en la lista", out.anadidos),
    fotos: [], deshacible: false, ir: "compra",
  };
}

export async function tachar(householdId, x, autor = null) {
  const out = {};
  await marcarCompra(householdId, x.productos ?? [], "comprado", out, { soloSiClaro: true });
  // Si hay dudas («¿qué leche?») tiene que preguntar Lola, y no se ha tachado
  // nada: lo hará ella entero.
  if (!out.ok || out.dudosos?.length || !out.hechos?.length) return null;
  const faltan = out.noEncontrados?.length ? `\n\n🤔 <i>No encuentro en la lista: ${out.noEncontrados.map(esc).join(", ")}.</i>` : "";
  return {
    texto: `${enLista("✅", autor ? `Tachado por ${esc(autor)}` : "Tachado", out.hechos)}${faltan}`,
    fotos: [], deshacible: false, ir: "compra",
  };
}

// ── Generar ─────────────────────────────────────────────────────────────────

export async function generar(householdId, x) {
  const out = {};
  await generarMenu(householdId, x.semana ?? "esta", x.fijos ?? [], out);
  if (!out.ok) return null;
  // Las líneas de dondeQuedaron (generar.js) están escritas para Lola: la
  // instrucción del final se cambia por lo que se le diría a la persona.
  const aPersona = (l) => l.replace(/: ofrece ponerlo con cambiar_plato$/, ". Si quieres, dime qué día y te lo pongo.");
  // La semana sale pintada debajo con lo pedido destacado (✨): aquí solo lo
  // que no ha cabido, que eso no se ve en la lista.
  const sinSitio = (out.pedidos ?? []).filter((l) => /no ha cabido/.test(l));
  const pedidos = sinSitio.length ? `\n\n${sinSitio.map((l) => `• ${esc(aPersona(l))}`).join("\n")}` : "";
  const destacados = (out.colocados ?? []).length ? " Lo que pediste va marcado con ✨." : "";
  return {
    texto: `🎉 <b>¡Menú listo!</b> Del <b>${rangoDeFechas(out.desde, out.hasta)}</b>.${destacados}${pedidos}`,
    fotos: [], deshacible: false, ir: "semana",
    pintar: filtrosTrasGenerar(out),
  };
}

// ── Consultas y deshacer ────────────────────────────────────────────────────

export async function consultar(householdId, x) {
  if (x.que === "compra") return respuestaCompra(householdId);
  // Justo lo pedido: los días (el finde, la semana que viene…), las comidas,
  // los platos y para quién. Si no hay nada de eso en el menú, null: lo
  // explica Lola y ofrece generarlo.
  const dias = fechasDe(x, hoyISO());
  if (!dias) return null;
  return respuestaMenu(householdId, { dias, comidas: x.comidas ?? null, platos: x.platos ?? null, grupo: x.para ?? null });
}

export async function deshacerRapido(householdId) {
  const texto = await deshacer(householdId);
  return { texto: `↩️ ${esc(texto)}`, fotos: [], deshacible: false, ir: null };
}

/** El modo del enrutador → su vía rápida. */
/** @param {{ autor?: string|null }} [quien]  en un chat de grupo, quién lo pidió */
export async function viaRapida(decision, householdId, { autor = null } = {}) {
  let x = decision.datos ?? {};
  switch (decision.modo) {
    case "consulta": return consultar(householdId, x);
    case "recomendar": return recomendar(householdId, x);
    case "cambiar": {
      // Sin decir si es comida o cena: si ese día solo hay una, es esa; si hay
      // las dos, se pregunta con botones (Cena primero) en vez de ir a Lola.
      if (!x.comida) {
        const h = await huecoSinComida(householdId, "cambiar", x);
        if (!h) return null;
        if (h.pregunta) return h.pregunta;
        x = { ...x, comida: h.comida };
      }
      // Sin decir qué plato (ni «lo que sea»): no se elige por ellos, se ofrecen
      // tres opciones con «Elige tú», como haría Lola.
      return x.receta || x.cualquiera ? cambiar(householdId, x) : recomendar(householdId, x);
    }
    case "ausencia": {
      // «Hoy cenamos fuera»: regla de un día + el hueco del menú vaciado, con
      // deshacer (menu.js apuntarAusencia). Sin comida, se pregunta.
      if (!x.comida) {
        const h = await huecoSinComida(householdId, "ausencia", x);
        if (h?.comida) x = { ...x, comida: h.comida };
        else return h?.pregunta ?? preguntaComida("ausencia", x, { dia: x.dia ?? "hoy" });
      }
      const r = await apuntarAusencia(householdId, { dia: x.dia ?? "hoy", comida: x.comida, quienes: x.para ? [x.para] : null, autor });
      if (r.error) return null; // quién, qué día o qué comida no está claro: Lola
      return { texto: r.texto, fotos: [], deshacible: false, ir: null, pintar: r.pintar };
    }
    case "receta": return verReceta(householdId, x);
    case "calorias": return calorias(householdId, x);
    case "falta": return queFalta(householdId, x);
    case "despensa": return verDespensaRapido(householdId);
    case "compra_anadir": return apuntar(householdId, x, autor);
    case "compra_marcar": return tachar(householdId, x, autor);
    case "generar": return generar(householdId, x);
    case "deshacer": return deshacerRapido(householdId);
    default: return null;
  }
}

// ── Paso 0: el estado de la conversación ────────────────────────────────────

// Frontera a mano y no \b: en JavaScript \b no ve la «ú» final de «tú».
const ELIGE_TU = /^(elige t[uú]|la que (tu |tú )?quieras|cualquiera|me da igual|sorpr[eé]ndeme)(?=[\s,.!?¡¿]|$)/i;

/**
 * ¿El mensaje elige una de las opciones que Lola acaba de dar? Por nombre (o
 * el principio del nombre, que es lo que llevan los botones largos) o «elige
 * tú». Pura, para el test.
 * @returns {{ opcion: {id: string, nombre: string} } | { eligeTu: true } | null}
 */
export function eleccionDe(texto, propuesta) {
  if (!propuesta?.opciones?.length) return null;
  const t = normal(String(texto).replace(/…$/, "").replace(/^(la|el|los|las|pon(me)?|quiero)\s+/i, ""));
  if (!t) return null;
  if (ELIGE_TU.test(String(texto).trim())) return { eligeTu: true };
  const exacta = propuesta.opciones.find((o) => normal(o.nombre) === t);
  if (exacta) return { opcion: exacta };
  const porPrincipio = propuesta.opciones.filter((o) => normal(o.nombre).startsWith(t) && t.length >= 4);
  if (porPrincipio.length === 1) return { opcion: porPrincipio[0] };
  // «la merluza»: una palabra que solo está en una opción.
  const palabras = t.split(/\s+/).filter((w) => w.length >= 4);
  const porPalabra = propuesta.opciones.filter((o) => palabras.length && palabras.every((w) => new RegExp(`\\b${w}`).test(normal(o.nombre))));
  return porPalabra.length === 1 ? { opcion: porPalabra[0] } : null;
}

/** Aplica la elección: con menú, se pone en su hueco; sin menú, a Lola (que enseña la receta). */
export async function aplicarEleccion(eleccion, propuesta, householdId) {
  // Qué se ofreció y qué eligieron, aunque luego no haya hueco donde ponerlo:
  // es lo que dice qué gusta (o que da igual).
  // «Elige tú» elige ENTRE las que se ofrecieron (la primera, que es la que
  // mejor encaja), no un plato cualquiera del catálogo: se lo pusieron delante.
  const opcion = eleccion.opcion ?? (eleccion.eligeTu ? propuesta.opciones?.[0] ?? null : null);
  await rastro(householdId, RASTRO.OPCION_ELEGIDA, {
    day: propuesta.dia ?? null, meal: propuesta.franja ?? null,
    ofrecidas: (propuesta.opciones ?? []).map((o) => idBase(o.id)),
    elegida: idBase(opcion?.id) ?? null, eligeTu: Boolean(eleccion.eligeTu),
  });
  if (!propuesta.conMenu) return null;
  return cambiar(householdId, {
    dia: DIA_LARGO[propuesta.dia] ?? propuesta.dia, comida: propuesta.franja, grupo: propuesta.grupo,
    cual: propuesta.cual, receta: opcion?.nombre ?? null,
    motivo: eleccion.eligeTu ? MOTIVO_CAMBIO.ELIGE_TU : MOTIVO_CAMBIO.ELECCION,
  });
}

/** Contexto que el enrutador necesita: quién hay, los grupos y si hay menú esta semana. */
export async function contextoDe(householdId) {
  const casa = await cargarCasa(householdId).catch(() => null);
  const miembros = casa?.state?.data?.members ?? [];
  const hoyISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  return {
    personas: miembros.map((p) => `${p.name}${p.age != null ? ` (${p.age})` : ""}`),
    grupos: casa ? grupos(casa).map((g) => quienesDe(g, miembros) ?? g.label) : [],
    hayMenu: Boolean(casa?.semana?.plan && casa.semana.weekEnd >= hoyISO),
  };
}
