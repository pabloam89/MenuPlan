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

import { cargarCasa, deshacer } from "./casa.js";
import {
  proponerPlatos, cambiarPlato, anadirCompra, marcarCompra, normal, DIA_LARGO, grupos, quienesDe, cambiosDe,
} from "./menu.js";
import { generarMenu } from "./generar.js";
import { respuestaHoy, respuestaSemana, respuestaCompra, respuestaDia, rangoDeFechas } from "./rapido.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const EMOJI = { Desayuno: "☕", Comida: "🍽️", Merienda: "🥪", Cena: "🌙", Postre: "🍮" };
const ARTICULO = { Desayuno: "el desayuno", Comida: "la comida", Merienda: "la merienda", Cena: "la cena", Postre: "el postre" };
const MAX_BOTON = 38;

/** «la cena de hoy», «la comida del jueves» */
function huecoEnTexto({ franja, dia, fecha }) {
  const hoyISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const cuando = fecha === hoyISO ? "de hoy" : dia ? `del ${DIA_LARGO[dia] ?? dia}` : "";
  return `${ARTICULO[franja] ?? (franja ? franja.toLowerCase() : "la comida")} ${cuando}`.trim();
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
    dia: x.dia, franja: x.comida, grupo: x.grupo ?? x.para ?? null, cual: x.cual ?? "principal", receta: x.receta ?? null,
  }, fotos, out);
  if (!out.cambiado) return null; // no se pudo: Lola lo explica y ofrece opciones
  const hueco = huecoEnTexto(out);
  const sinCambiar = out.sinCambiar?.length ? `\n\n<i>A ${esc(out.sinCambiar.join(" y "))} le dejo lo suyo: ese plato no le encaja.</i>` : "";
  const aproximada = out.aproximada ? `\n<i>No había «${esc(out.pedida)}» tal cual: es lo más parecido que encaja.</i>` : "";
  return {
    texto: `✅ <b>Hecho.</b> ${mayusculaInicial(hueco)}${out.grupo ? ` de <i>${esc(out.grupo)}</i>` : ""} ahora es:\n\n${EMOJI[out.franja] ?? "🍽️"} <b>${esc(out.despues)}</b>${out.antes ? `\n<i>Antes: ${esc(out.antes)}.</i>` : ""}${aproximada}${sinCambiar}`,
    fotos,
    deshacible: true,
    ir: out.dia ? `dia:${out.dia}` : null,
  };
}

// ── Compra ──────────────────────────────────────────────────────────────────

export async function apuntar(householdId, x) {
  const out = {};
  await anadirCompra(householdId, x.productos ?? [], out);
  if (!out.ok || !out.anadidos?.length) return null;
  return {
    texto: enLista("🛒", "Apuntado en la lista", out.anadidos),
    fotos: [], deshacible: true, ir: "compra",
  };
}

export async function tachar(householdId, x) {
  const out = {};
  await marcarCompra(householdId, x.productos ?? [], "comprado", out);
  // Si hay dudas («¿qué leche?») tiene que preguntar Lola.
  if (!out.ok || out.dudosos?.length || !out.hechos?.length) return null;
  const faltan = out.noEncontrados?.length ? `\n\n🤔 <i>No encuentro en la lista: ${out.noEncontrados.map(esc).join(", ")}.</i>` : "";
  return {
    texto: `${enLista("✅", "Tachado", out.hechos)}${faltan}`,
    fotos: [], deshacible: true, ir: "compra",
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
  const pedidos = out.pedidos?.length ? `\n\n📌 <b>Lo que pediste:</b>\n${out.pedidos.map((l) => `• ${esc(aPersona(l))}`).join("\n")}` : "";
  return {
    texto: `🎉 <b>¡Menú listo!</b>\n📅 Del <b>${rangoDeFechas(out.desde, out.hasta)}</b>.${pedidos}\n\nPídeme cambios cuando quieras («cambia la cena del jueves»), o ábrelo en la app con el botón.`,
    fotos: [], deshacible: true, ir: "semana",
  };
}

// ── Consultas y deshacer ────────────────────────────────────────────────────

export async function consultar(householdId, x) {
  if (x.que === "hoy") return respuestaHoy(householdId);
  if (x.que === "semana") return respuestaSemana(householdId);
  if (x.que === "compra") return respuestaCompra(householdId);
  if (x.que === "dia" && x.dia) return respuestaDia(householdId, x.dia);
  return null;
}

export async function deshacerRapido(householdId) {
  const texto = await deshacer(householdId);
  return { texto: `↩️ ${esc(texto)}`, fotos: [], deshacible: false, ir: null };
}

/** El modo del enrutador → su vía rápida. */
export async function viaRapida(decision, householdId) {
  const x = decision.datos ?? {};
  switch (decision.modo) {
    case "consulta": return consultar(householdId, x);
    case "recomendar": return recomendar(householdId, x);
    // Sin decir qué plato (ni «lo que sea»): no se elige por ellos, se ofrecen
    // tres opciones con «Elige tú», como haría Lola.
    case "cambiar": return x.receta || x.cualquiera ? cambiar(householdId, x) : recomendar(householdId, x);
    case "compra_anadir": return apuntar(householdId, x);
    case "compra_marcar": return tachar(householdId, x);
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
  if (!propuesta.conMenu) return null;
  return cambiar(householdId, {
    dia: DIA_LARGO[propuesta.dia] ?? propuesta.dia, comida: propuesta.franja, grupo: propuesta.grupo,
    cual: propuesta.cual, receta: eleccion.opcion?.nombre ?? null,
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
