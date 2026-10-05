/**
 * Tareas abiertas del bot (migraciones 0076 y 0077): seguimientos y preguntas
 * pendientes que tienen que sobrevivir a la charla. Lola las lee en cada turno
 * junto a la ficha.
 *
 * Lo que no puede depender del modelo se garantiza fuera de él:
 *   · duplicados → índice único (casa, clave) entre las abiertas;
 *   · tope y desalojo → disparador con candado por casa;
 *   · lo de estado (alergias, etapa del bebé) se cierra solo al resolverse;
 *   · un seguimiento solo se escribe con el sí de la persona (confirmado).
 * Las preguntas de Lola no piden permiso: son lo que ella necesita saber.
 */

import { select, insert, update, eq } from "./db.js";
import { registrar } from "./embudo.js";
import { crearRecordatorio } from "./recordatorios.js";
import { resolverPersona, claveDePregunta, claveLibre, resuelta, temaDe } from "./estadoCasa.js";
import { esDeSeguridad, noEsComida, preguntaProhibida } from "../../src/lib/registroTareas.js";

export const LIMITE_ABIERTAS = 8;
// Lo que se trae de la base es una cota, no el recorte: el recorte lo hace
// elegirParaLeer, que deja fuera del límite lo de seguridad.
export const LIMITE_LECTURA = 50;
const TEXTO_MAX = 240;
const DIA = 86400000;
// Cuánto tiene sentido cada cosa: la etapa de un bebé cambia en semanas.
const CADUCIDAD_DIAS = { alergias: 30, etapa_bebe: 21, pregunta: 14, seguimiento: 10 };
const MAX_DIAS = 90;
const EVENTO = { CREADA: "bot_task_created", CERRADA: "bot_task_closed", DUPLICADA: "bot_task_duplicate", AUTO: "bot_task_auto_closed" };
const COLUMNAS = "id,kind,scope,texto,falta,clave,chat_id,para_member,asignado_member,vence,caduca_at,created_at";

const ref = (id) => String(id ?? "").slice(0, 8);
const fechaValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Pura. Qué tareas puede ver quien escribe: las de la casa, y las suyas solo en privado. */
export function filtroDeLectura({ householdId, userId = null, privado = false, ahora = new Date() }) {
  const ver = privado && userId
    ? `or=(scope.eq.casa,and(scope.eq.personal,owner_user_id.eq.${userId}))`
    : "scope=eq.casa";
  return `household_id=${eq(householdId)}&status=eq.abierta&caduca_at=gt.${encodeURIComponent(ahora.toISOString())}&${ver}&order=created_at.desc&limit=${LIMITE_LECTURA}`;
}

const importanciaDe = (t) => (esDeSeguridad(t.clave) ? 0 : t.kind === "pregunta" ? 1 : 2);
function urgenciaDe(t, ahora) {
  if (!t.vence) return 2;
  const dias = (Date.parse(`${t.vence}T23:59:59Z`) - ahora.getTime()) / DIA;
  return dias <= 1 ? 0 : dias <= 7 ? 1 : 2;
}

/**
 * Pura. Lo que lee Lola: lo de seguridad (alergias, etapa del bebé) entra
 * siempre, sin límite; el resto, por importancia, urgencia y lo más reciente,
 * hasta LIMITE_ABIERTAS. Antes se cortaba a 8 por antigüedad y una alergia
 * nueva podía quedarse fuera.
 */
export function elegirParaLeer(tareas = [], ahora = new Date()) {
  const orden = (a, b) => importanciaDe(a) - importanciaDe(b) || urgenciaDe(a, ahora) - urgenciaDe(b, ahora) || String(b.created_at).localeCompare(String(a.created_at));
  const todas = [...tareas].sort(orden);
  const seguridad = todas.filter((t) => importanciaDe(t) === 0);
  const resto = todas.filter((t) => importanciaDe(t) > 0).slice(0, LIMITE_ABIERTAS);
  return [...seguridad, ...resto];
}

/** Pura. Hasta cuándo tiene sentido: por tipo, o el día después de su fecha límite. */
export function caducidadDe({ kind, tema, vence }, ahora = new Date()) {
  const tope = ahora.getTime() + MAX_DIAS * DIA;
  if (vence) return new Date(Math.min(Date.parse(`${vence}T23:59:59Z`) + DIA, tope));
  return new Date(ahora.getTime() + (CADUCIDAD_DIAS[tema] ?? CADUCIDAD_DIAS[kind] ?? 14) * DIA);
}

/**
 * Pura. Valida y tipa lo que propone el modelo antes de escribir nada.
 * @returns {{ valor: object } | { error: string }}
 */
export function validarNueva(datos = {}, data = {}, ahora = new Date()) {
  const kind = datos.kind;
  if (!["seguimiento", "pregunta"].includes(kind)) return { error: "Tipo de tarea no válido." };
  if (kind === "seguimiento" && datos.confirmado !== true) return { error: "Antes de anotarlo, pregúntale si quiere que lo apunte. Solo con su sí." };
  const texto = String(datos.texto ?? "").trim().slice(0, TEXTO_MAX);
  if (!texto) return { error: "¿Qué quieres que quede apuntado?" };
  // Lo que no puede depender del modelo: solo comida, y lo que nunca se pregunta.
  if (kind === "seguimiento" && noEsComida(texto)) return { error: `No lo he apuntado: solo llevo lo que tiene que ver con la comida de casa (${noEsComida(texto)} no). Dilo así, con naturalidad.` };
  if (kind === "pregunta" && preguntaProhibida(texto)) return { error: "Eso no se pregunta (edad, colegio, sexo o custodia): solo se apunta si lo cuentan. No lo anotes ni lo preguntes." };
  const scope = datos.scope ?? "casa";
  if (!["casa", "personal"].includes(scope)) return { error: "Ámbito no válido." };
  let para = null, encargado = null;
  if (datos.para) {
    const r = resolverPersona(data, datos.para);
    if (r.error) return { error: r.error };
    para = r.persona;
  }
  if (datos.encargado) {
    const r = resolverPersona(data, datos.encargado);
    if (r.error) return { error: r.error };
    encargado = r.persona;
  }
  if (datos.vence && !fechaValida(datos.vence)) return { error: `No entiendo la fecha «${datos.vence}»: dámela como AAAA-MM-DD.` };
  if (datos.vence && Date.parse(`${datos.vence}T23:59:59Z`) < ahora.getTime()) return { error: "Esa fecha ya ha pasado. ¿Para cuándo es?" };
  const sobre = datos.sobre ?? "otra";
  const tema = kind === "pregunta" && sobre !== "otra" ? sobre : (kind === "pregunta" ? temaDe(texto) : null);
  const textoClave = para ? `${texto} ${para.nombre}` : texto;
  const clave = (tema && claveDePregunta(`${tema === "alergias" ? "alergia" : "como come"} ${textoClave}`, data)) || claveLibre(kind, texto, para?.id);
  return {
    valor: {
      kind, texto, scope, clave, tema,
      para_member: para?.id ?? null, asignado_member: encargado?.id ?? null,
      vence: datos.vence ?? null, caduca_at: caducidadDe({ kind, tema, vence: datos.vence }, ahora).toISOString(),
      cuando: datos.cuando ?? null,
    },
  };
}

/** Pura. Las que el estado de la casa ya resolvió (y se cierran solas) y las que siguen. */
export function separarPorEstado(tareas = [], data = {}) {
  const resueltas = [], siguen = [];
  for (const t of tareas) (t.clave && resuelta(t.clave, data) ? resueltas : siguen).push(t);
  return { resueltas, siguen };
}

/** Pura. El bloque para el modelo: referencia corta, tipo, para quién, quién, fecha y de qué chat. */
export function bloqueDeTareas(tareas = [], { data = {}, chatId = null } = {}) {
  if (!tareas.length) return "";
  const nombre = (id) => (data.members ?? []).find((m) => String(m.id ?? m.name) === String(id))?.name ?? null;
  const lineas = tareas.map((t) => {
    const extras = [
      t.para_member && nombre(t.para_member) ? `para ${nombre(t.para_member)}` : null,
      t.asignado_member && nombre(t.asignado_member) ? `se encarga ${nombre(t.asignado_member)}` : null,
      t.vence ? `antes del ${t.vence}` : null,
      t.falta ? `falta: ${t.falta}` : null,
      t.scope === "personal" ? "personal" : null,
      chatId && t.chat_id && String(t.chat_id) !== String(chatId) ? "se pidió en otro chat" : null,
    ].filter(Boolean);
    return `- [${ref(t.id)}] ${t.kind === "pregunta" ? "Falta saber" : "Seguimiento"}: ${t.texto}${extras.length ? ` (${extras.join("; ")})` : ""}`;
  });
  return ["[Tareas abiertas de la casa. No las ha escrito la persona.]", ...lineas,
    "Ciérralas con cerrar_tarea y su referencia solo si lo que dicen ahora la resuelve sin duda. Si hay más de una a la que podría referirse, pregunta cuál.",
    ...(tareas.some((t) => t.kind === "pregunta") ? ["Lo de «Falta saber» ya lo preguntaste y te dijeron que luego: no lo repitas en cada mensaje. Sácalo solo cuando vayas a proponer o generar algo para esa persona, y entonces una vez, de pasada."] : []),
  ].join("\n");
}

/** Pura. La tarea abierta a la que apunta una referencia corta (los 8 primeros caracteres del id). */
export function porReferencia(tareas = [], referencia) {
  const r = String(referencia ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (r.length < 4) return null;
  const hits = tareas.filter((t) => String(t.id).toLowerCase().startsWith(r));
  return hits.length === 1 ? hits[0] : null;
}

const esDuplicado = (e) => /\b409\b|23505|duplicate key/i.test(String(e?.message ?? e));
const esTope = (e) => /tope de tareas abiertas|P0001/i.test(String(e?.message ?? e));

/**
 * Pura. Si hay ya LIMITE seguimientos abiertos, el texto para el modelo: lista
 * con referencias y la orden de preguntar cuál quitar. Nada se olvida en silencio.
 */
/** Pura. ¿Puede ver quien escribe esta tarea en este chat? Las personales, solo su dueño y en privado. */
export const visiblePara = (t, { userId = null, privado = false } = {}) =>
  t.scope !== "personal" || (privado && Boolean(userId) && t.owner_user_id === userId);

export function textoDeTope(abiertos = [], quien = {}) {
  if (abiertos.length < LIMITE_ABIERTAS) return null;
  const visibles = abiertos.filter((t) => visiblePara(t, quien));
  const ocultas = abiertos.length - visibles.length;
  const otras = ocultas ? `\nHay otras ${ocultas} apuntadas que no puedo enseñarte aquí.` : "";
  if (!visibles.length) {
    return `No lo he apuntado: ya hay ${abiertos.length} cosas apuntadas en la casa y ninguna se puede quitar desde aquí.${otras}\nDíselo así: no se quita nada sin preguntar a quien lo apuntó.`;
  }
  const lista = visibles.map((t) => `- [${ref(t.id)}] ${t.texto}`).join("\n");
  return `No lo he apuntado: ya hay ${abiertos.length} cosas apuntadas en la casa y no se quita ninguna sin preguntar.\n${lista}${otras}\nDíselo y pregunta cuál quitar. Con su respuesta, vuelve a llamar a anotar_tarea con reemplaza = esa referencia.`;
}

/**
 * Pura. Con el tope lleno: { cabe } si hay sitio, { quitar } si `reemplaza`
 * apunta a una que quien escribe puede ver, o { texto } para el modelo. Una
 * personal ajena nunca se enseña ni se quita.
 */
export function decidirTope(abiertos = [], reemplaza, quien = {}) {
  if (abiertos.length < LIMITE_ABIERTAS) return { cabe: true };
  if (reemplaza) {
    const quitar = porReferencia(abiertos.filter((t) => visiblePara(t, quien)), reemplaza);
    // Quitar uno de la casa es cerrarlo: un lector solo quita lo suyo (modelo.mjs v17, menuplan-1e).
    if (quitar && quien.papel === "viewer" && quitar.scope !== "personal") {
      return { texto: "No la he quitado: quien solo puede ver la casa no quita cosas apuntadas para todos. Que lo haga quien la gestiona." };
    }
    if (quitar) return { quitar };
    if (porReferencia(abiertos, reemplaza)) return { texto: "No la he quitado: es una cosa personal de otra persona y no se puede quitar desde aquí. Pregunta cuál de las que ve quitar." };
  }
  return { texto: textoDeTope(abiertos, quien) };
}

/** Null si cabe. Con `reemplaza` válido y visible, descarta esa y deja sitio. */
async function topeAlcanzado(householdId, reemplaza, quien = {}) {
  const abiertos = await select("bot_tareas", `household_id=${eq(householdId)}&status=eq.abierta&kind=eq.seguimiento&caduca_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.asc`, "id,texto,scope,owner_user_id");
  const d = decidirTope(abiertos, reemplaza, quien);
  if (d.cabe) return null;
  if (d.texto) return d.texto;
  const quitar = d.quitar;
  const ahora = new Date().toISOString();
  await update("bot_tareas", `id=${eq(quitar.id)}&status=eq.abierta`, { status: "descartada", closed_at: ahora, updated_at: ahora });
  await registrar(EVENTO.CERRADA, { extra: { householdId, kind: "seguimiento", estado: "descartada", motivo: "reemplazo" } });
  return null;
}

export async function tareasAbiertas(householdId, opciones = {}) {
  if (!householdId) return [];
  return elegirParaLeer(await select("bot_tareas", filtroDeLectura({ householdId, ...opciones }), COLUMNAS), opciones.ahora);
}

/** Las claves de estado que alguien no quiso contestar: no se vuelven a preguntar. */
export async function clavesCalladas(householdId) {
  if (!householdId) return new Set();
  const filas = await select("bot_tareas", `household_id=${eq(householdId)}&status=eq.rechazada&clave=not.is.null`, "clave");
  return new Set(filas.map((f) => f.clave));
}

/** Cierra en segundo plano lo que el estado ya resolvió. No retrasa el turno. */
export function cerrarResueltas(resueltas = [], { householdId, userId = null } = {}) {
  if (!resueltas.length) return Promise.resolve();
  const ahora = new Date().toISOString();
  return Promise.all(resueltas.map((t) =>
    update("bot_tareas", `id=${eq(t.id)}&status=eq.abierta`, { status: "hecha", closed_at: ahora, updated_at: ahora })
      .then(() => registrar(EVENTO.AUTO, { userId, extra: { householdId, kind: t.kind, clave: t.clave } }))
      .catch((e) => console.error("[tareas] auto", e?.message)),
  ));
}

/**
 * Al escribir en la casa: cierra en ese momento las tareas de estado que la
 * casa recién guardada ya resuelve. Si falla, no deshace el dato: la red es el
 * cierre del turno siguiente (separarPorEstado + cerrarResueltas en agente.js).
 */
export async function cerrarPorEstado(householdId, data, { userId = null } = {}) {
  if (!householdId || !data) return 0;
  const abiertas = await select("bot_tareas", `household_id=${eq(householdId)}&status=eq.abierta&or=(clave.like.alergias:*,clave.like.etapa:*)`, "id,kind,clave");
  const { resueltas } = separarPorEstado(abiertas, data);
  await cerrarResueltas(resueltas, { householdId, userId });
  return resueltas.length;
}

/** Abre una pregunta de estado («alergias:<id>») desde el código. Si ya está abierta, el índice único la para. */
export async function abrirPreguntaDeEstado(ctx, { clave, texto }, ahora = new Date()) {
  if (!ctx?.householdId || !ctx?.chatId || !clave) return false;
  const tema = clave.startsWith("etapa:") ? "etapa_bebe" : "alergias";
  try {
    await insert("bot_tareas", [{
      household_id: ctx.householdId, channel: ctx.channel ?? "telegram", chat_id: String(ctx.chatId), kind: "pregunta", scope: "casa",
      texto: String(texto ?? "").slice(0, TEXTO_MAX), clave, created_by: ctx.userId ?? null,
      caduca_at: caducidadDe({ kind: "pregunta", tema }, ahora).toISOString(),
    }]);
    await registrar(EVENTO.CREADA, { userId: ctx.userId ?? null, extra: { householdId: ctx.householdId, kind: "pregunta", tema, origen: "codigo" } });
    return true;
  } catch (e) {
    if (!esDuplicado(e)) throw e;
    return false;
  }
}

/**
 * Pura. Las preguntas del mensaje (pendientes.js) que tocan un hueco de estado
 * y siguen abiertas: el código las sube a la tabla él solo, sin depender de que
 * el modelo llame a anotar_tarea. Así «luego te digo cómo come» no se pierde.
 */
export function aPromover(pendientes = []) {
  return pendientes
    .filter((p) => /^(alergias|etapa):/.test(String(p.clave ?? "")))
    .map((p) => ({
      clave: p.clave,
      tema: p.clave.startsWith("etapa:") ? "etapa_bebe" : "alergias",
      texto: String(p.pedido ?? "").replace(/@\w+/g, "").replace(/\s+/g, " ").trim().slice(0, TEXTO_MAX),
      falta: String(p.falta ?? "").slice(0, 160) || null,
    }))
    .filter((p) => p.texto);
}

/** Sube las preguntas de estado a la tabla. Idempotente: si ya está abierta, el índice único la para. */
export async function promoverPreguntas(ctx, pendientes = [], ahora = new Date()) {
  const filas = aPromover(pendientes);
  for (const p of filas) {
    try {
      await insert("bot_tareas", [{
        household_id: ctx.householdId, channel: ctx.channel, chat_id: String(ctx.chatId), kind: "pregunta", scope: "casa",
        texto: p.texto, falta: p.falta, clave: p.clave, created_by: ctx.userId ?? null,
        caduca_at: caducidadDe({ kind: "pregunta", tema: p.tema }, ahora).toISOString(),
      }]);
      await registrar(EVENTO.CREADA, { userId: ctx.userId ?? null, extra: { householdId: ctx.householdId, kind: "pregunta", tema: p.tema, origen: "codigo" } });
    } catch (e) {
      if (!esDuplicado(e)) console.error("[tareas] promover", e?.message);
    }
  }
}

export async function anotarTarea(ctx, datos, data = {}) {
  const { householdId, channel, chatId, userId = null, privado = false, autor = null, papel = null } = ctx;
  const v = validarNueva(datos, data);
  if (v.error) return v.error;
  const t = v.valor;
  if (t.scope === "personal" && !(privado && userId)) return "Lo personal solo se apunta en un chat privado.";
  if (t.kind === "seguimiento") {
    const lleno = await topeAlcanzado(householdId, datos.reemplaza, { userId, privado, papel });
    if (lleno) return lleno;
  }
  try {
    await insert("bot_tareas", [{
      household_id: householdId, channel, chat_id: String(chatId), kind: t.kind, scope: t.scope,
      owner_user_id: t.scope === "personal" ? userId : null, texto: t.texto, clave: t.clave,
      para_member: t.para_member, asignado_member: t.asignado_member, vence: t.vence, caduca_at: t.caduca_at,
      created_by: userId,
    }]);
  } catch (e) {
    if (esTope(e)) return (await topeAlcanzado(householdId, null, { userId, privado, papel })) ?? "No he podido apuntarlo: hay demasiadas cosas abiertas. Pregunta cuál quitar.";
    if (!esDuplicado(e)) throw e;
    await registrar(EVENTO.DUPLICADA, { userId, extra: { householdId, kind: t.kind } });
    return "Ya estaba apuntado (lo pidió alguien antes): no lo he duplicado. Dilo así.";
  }
  await registrar(EVENTO.CREADA, { userId, extra: { householdId, kind: t.kind, tema: t.tema, conFecha: Boolean(t.vence), conAviso: Boolean(t.cuando) } });
  if (t.cuando) {
    const aviso = await crearRecordatorio({ channel, chatId, householdId, autor }, { texto: t.texto, cuando: t.cuando });
    return `Apuntado. Y el aviso: ${aviso}`;
  }
  return "Apuntado.";
}

export async function cerrarTarea(ctx, abiertas, referencia, estado = "hecha") {
  const t = porReferencia(abiertas, referencia);
  if (!t) return "No encuentro esa tarea entre las abiertas: mira la referencia en «Tareas abiertas de la casa».";
  if (estado === "rechazada" && t.kind !== "pregunta") return "«No quiere decirlo» solo vale para una pregunta; esto se descarta.";
  const ahora = new Date().toISOString();
  const filas = await update("bot_tareas", `id=${eq(t.id)}&household_id=${eq(ctx.householdId)}&status=eq.abierta`, { status: estado, closed_at: ahora, updated_at: ahora });
  if (!filas?.length) return "Esa tarea ya estaba cerrada.";
  await registrar(EVENTO.CERRADA, { userId: ctx.userId ?? null, extra: { householdId: ctx.householdId, kind: t.kind, estado, otroChat: String(t.chat_id) !== String(ctx.chatId) } });
  const otroChat = String(t.chat_id) !== String(ctx.chatId) ? " Se pidió en otro chat: si hace falta que allí lo sepan, ofrécete a decirlo, no lo hagas tú." : "";
  if (estado === "rechazada") return `Hecho: no lo volveré a preguntar. Ojo: no es «ninguna»; si importa para la seguridad, dilo así, sin insistir.${otroChat}`;
  return `${estado === "hecha" ? "Cerrada" : "Descartada"}: ${t.texto}.${otroChat}`;
}

export async function editarTarea(ctx, abiertas, referencia, cambios = {}, data = {}) {
  const t = porReferencia(abiertas, referencia);
  if (!t) return "No encuentro esa tarea entre las abiertas.";
  const parche = {};
  if (cambios.texto) parche.texto = String(cambios.texto).trim().slice(0, TEXTO_MAX);
  if (cambios.vence) {
    if (!fechaValida(cambios.vence)) return `No entiendo la fecha «${cambios.vence}»: AAAA-MM-DD.`;
    parche.vence = cambios.vence;
    parche.caduca_at = caducidadDe({ kind: t.kind, vence: cambios.vence }).toISOString();
  }
  for (const [campo, columna] of [["para", "para_member"], ["encargado", "asignado_member"]]) {
    if (!cambios[campo]) continue;
    const r = resolverPersona(data, cambios[campo]);
    if (r.error) return r.error;
    parche[columna] = r.persona.id;
  }
  if (!Object.keys(parche).length) return "No me has dicho qué cambiar.";
  parche.updated_at = new Date().toISOString();
  await update("bot_tareas", `id=${eq(t.id)}&household_id=${eq(ctx.householdId)}&status=eq.abierta`, parche);
  return "Cambiado.";
}
