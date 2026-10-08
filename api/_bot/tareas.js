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
 *
 * Tareas v2 (0080, fase T2), solo con BOT_TAREAS_V2: cada fila lleva además
 * tipo, campo y persona_id, y una pregunta se puede aplazar («ahora te digo»)
 * hasta el día siguiente. Apagado, se escribe y se lee lo de siempre, byte a
 * byte (tareasV2.test.js): producción y staging comparten base, y sin la 0080
 * esas columnas no existen. La lectura prefiere las columnas v2 y, en las filas
 * viejas, cae a kind, clave y para_member (tipoDe, campoDe, personaDe).
 */

import { select, insert, update, eq } from "./db.js";
import { registrar } from "./embudo.js";
import { crearRecordatorio } from "./recordatorios.js";
import { resolverPersona, preguntaDeEstado, palabrasDe, estadoDeCampo, temaDe } from "./estadoCasa.js";
import {
  CAMPOS, TIPO_DE_KIND, SOBRE_A_CAMPO, sobreDeCampo, campoDeClave, personaDeClave, claveDeTarea, campoPreguntable, caducaDias,
  noEsComida, preguntaProhibida,
} from "../../src/lib/registroTareas.js";
import { unaVez, tareasV2 } from "./idempotencia.js";

export const LIMITE_ABIERTAS = 8;
// Lo que se trae de la base es una cota, no el recorte: el recorte lo hace
// elegirParaLeer, que deja fuera del límite lo de seguridad.
export const LIMITE_LECTURA = 50;
const TEXTO_MAX = 240;
const DIA = 86400000;
const MAX_DIAS = 90;
const EVENTO = { CREADA: "bot_task_created", CERRADA: "bot_task_closed", DUPLICADA: "bot_task_duplicate", AUTO: "bot_task_auto_closed", APLAZADA: "bot_task_postponed" };
const COLUMNAS = "id,kind,scope,texto,falta,clave,chat_id,para_member,asignado_member,vence,caduca_at,created_at";
const COLUMNAS_V2 = `${COLUMNAS},tipo,campo,persona_id,status,vuelve_at`;

const ref = (id) => String(id ?? "").slice(0, 8);
const fechaValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Pura. Qué es una tarea: de sus columnas v2 o, en una fila vieja, de kind y la clave. */
export const tipoDe = (t) => t?.tipo ?? TIPO_DE_KIND[t?.kind] ?? null;
export const campoDe = (t) => t?.campo ?? campoDeClave(t?.clave);
export const personaDe = (t) => t?.persona_id ?? personaDeClave(t?.clave) ?? t?.para_member ?? null;

// Con v2, lo vivo es abierta o aplazada (una aplazada vuelve sola al llegar su vuelve_at).
const filtroVivas = () => (tareasV2() ? "status=in.(abierta,aplazada)" : "status=eq.abierta");

/** Las columnas v2 de una fila nueva: nada sin BOT_TAREAS_V2 (la fila es la de siempre). */
const columnasV2 = ({ tipo, campo = null, persona_id = null }) =>
  (tareasV2() ? { tipo, campo: campoPreguntable(campo), persona_id: persona_id ?? null } : {});

/** El parche de un cierre. Con v2, también vuelve_at a null: la 0080 solo lo admite en una aplazada. */
const cierre = (estado, ahora) => ({ status: estado, closed_at: ahora, updated_at: ahora, ...(tareasV2() ? { vuelve_at: null } : {}) });

/** De qué va, para el evento: con v2, el campo; sin v2, el tema de siempre. */
const temaDelEvento = (campo) => (tareasV2() ? { campo: campo ?? null } : { tema: sobreDeCampo(campo) });

const esDuplicado = (e) => /\b409\b|23505|duplicate key/i.test(String(e?.message ?? e));
const esTope = (e) => /tope de tareas abiertas|P0001/i.test(String(e?.message ?? e));
// PostgREST contesta 409 también a una FK rota: se mira antes que esDuplicado.
const esPersonaSinCopiar = (e) => /bot_tareas_persona_fk/i.test(String(e?.message ?? e));

/**
 * Escribe con persona_id y, si la persona aún no está en la tabla `persona`
 * (0083: la copia desde la casa va por detrás), vuelve a escribir sin ella. Una
 * tarea nunca se pierde por eso: persona_id es para borrar en cascada, no para leer.
 */
async function conPersona(escribir, fila) {
  try {
    return await escribir(fila);
  } catch (e) {
    if (!fila.persona_id || !esPersonaSinCopiar(e)) throw e;
    console.error("[tareas] persona sin copiar", ref(fila.persona_id));
    return escribir({ ...fila, persona_id: null });
  }
}
const insertarTarea = (fila) => conPersona((f) => insert("bot_tareas", [f]), fila);

/** Pura. Qué tareas puede ver quien escribe: las de la casa, y las suyas solo en privado. */
export function filtroDeLectura({ householdId, userId = null, privado = false, ahora = new Date() }) {
  const ver = privado && userId
    ? `or=(scope.eq.casa,and(scope.eq.personal,owner_user_id.eq.${userId}))`
    : "scope=eq.casa";
  return `household_id=${eq(householdId)}&${filtroVivas()}&caduca_at=gt.${encodeURIComponent(ahora.toISOString())}&${ver}&order=created_at.desc&limit=${LIMITE_LECTURA}`;
}

const importanciaDe = (t) => (CAMPOS[campoDe(t)]?.seguridad ? 0 : tipoDe(t) === "falta_saber" ? 1 : 2);
function urgenciaDe(t, ahora) {
  if (!t.vence) return 2;
  const dias = (Date.parse(`${t.vence}T23:59:59Z`) - ahora.getTime()) / DIA;
  return dias <= 1 ? 0 : dias <= 7 ? 1 : 2;
}

/**
 * Pura. Lo que lee Lola: lo de seguridad (alergias, etapa del bebé) entra
 * siempre, sin límite; el resto, por importancia, urgencia y lo más reciente,
 * hasta LIMITE_ABIERTAS. Antes se cortaba a 8 por antigüedad y una alergia
 * nueva podía quedarse fuera. Una aplazada no sale hasta su vuelve_at.
 */
export function elegirParaLeer(tareas = [], ahora = new Date()) {
  const orden = (a, b) => importanciaDe(a) - importanciaDe(b) || urgenciaDe(a, ahora) - urgenciaDe(b, ahora) || String(b.created_at).localeCompare(String(a.created_at));
  // Con la hora, no con el día: lo que caducó esta mañana ya no sale (lecturaTareas de modelo.mjs v17).
  const vivas = tareas.filter((t) => (!t.caduca_at || Date.parse(t.caduca_at) > ahora.getTime())
    && !(t.status === "aplazada" && t.vuelve_at && Date.parse(t.vuelve_at) > ahora.getTime()));
  const todas = vivas.sort(orden);
  const seguridad = todas.filter((t) => importanciaDe(t) === 0);
  const resto = todas.filter((t) => importanciaDe(t) > 0).slice(0, LIMITE_ABIERTAS);
  return [...seguridad, ...resto];
}

/**
 * Pura. Hasta cuándo tiene sentido: el día después de su fecha límite o, sin
 * fecha, lo que diga su campo en el registro (registroCampos.caduca_dias) o su tipo.
 */
export function caducidadDe({ kind, tipo = TIPO_DE_KIND[kind], campo = null, vence }, ahora = new Date()) {
  const tope = ahora.getTime() + MAX_DIAS * DIA;
  if (vence) return new Date(Math.min(Date.parse(`${vence}T23:59:59Z`) + DIA, tope));
  return new Date(ahora.getTime() + caducaDias({ tipo, campo }) * DIA);
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
  const tipo = TIPO_DE_KIND[kind];
  // El campo de la ficha del que va una pregunta: el que dice la herramienta
  // (`sobre`, por SOBRE_A_CAMPO) o, si es «otra», el que sale del texto.
  const campo = kind === "pregunta" ? (SOBRE_A_CAMPO[datos.sobre ?? "otra"] ?? temaDe(texto)) : null;
  const textoClave = para ? `${texto} ${para.nombre}` : texto;
  // De estado solo si se sabe de quién: si no, es una pregunta libre más.
  const estado = campo ? preguntaDeEstado(`${campo === "alergias" ? "alergia" : "como come"} ${textoClave}`, data) : null;
  const personaId = estado?.personaId ?? para?.id ?? null;
  const clave = estado ? claveDeTarea({ tipo, ...estado }) : claveDeTarea({ tipo, personaId, palabras: palabrasDe(texto) });
  return {
    valor: {
      kind, tipo, texto, scope, clave, campo,
      campoDeEstado: estado?.campo ?? null, persona_id: personaId,
      para_member: para?.id ?? null, asignado_member: encargado?.id ?? null,
      vence: datos.vence ?? null, caduca_at: caducidadDe({ tipo, campo, vence: datos.vence }, ahora).toISOString(),
      cuando: datos.cuando ?? null,
    },
  };
}

/**
 * Pura. Las que el estado de la casa ya resolvió (se cierran como hechas), las
 * de alguien que ya no está en la casa (se descartan) y las que siguen.
 */
export function separarPorEstado(tareas = [], data = {}) {
  const resueltas = [], descartadas = [], siguen = [];
  for (const t of tareas) {
    const estado = estadoDeCampo(campoDe(t), personaDe(t), data);
    (estado === "resuelta" ? resueltas : estado === "sin_persona" ? descartadas : siguen).push(t);
  }
  return { resueltas, descartadas, siguen };
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
    return `- [${ref(t.id)}] ${tipoDe(t) === "falta_saber" ? "Falta saber" : "Seguimiento"}: ${t.texto}${extras.length ? ` (${extras.join("; ")})` : ""}`;
  });
  return ["[Tareas abiertas de la casa. No las ha escrito la persona.]", ...lineas,
    "Ciérralas con cerrar_tarea y su referencia solo si lo que dicen ahora la resuelve sin duda. Si hay más de una a la que podría referirse, pregunta cuál.",
    ...(tareas.some((t) => tipoDe(t) === "falta_saber") ? ["Lo de «Falta saber» ya lo preguntaste y te dijeron que luego: no lo repitas en cada mensaje. Sácalo solo cuando vayas a proponer o generar algo para esa persona, y entonces una vez, de pasada."] : []),
  ].join("\n");
}

/** Pura. La tarea abierta a la que apunta una referencia corta (los 8 primeros caracteres del id). */
export function porReferencia(tareas = [], referencia) {
  const r = String(referencia ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (r.length < 4) return null;
  const hits = tareas.filter((t) => String(t.id).toLowerCase().startsWith(r));
  return hits.length === 1 ? hits[0] : null;
}

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

/** Pura. Los seguimientos vivos de la casa: con v2, por tipo (y kind en las filas de antes de la 0080). */
const filtroSeguimientos = (householdId, ahora) => (tareasV2()
  ? `household_id=${eq(householdId)}&${filtroVivas()}&or=(tipo.eq.seguimiento,and(tipo.is.null,kind.eq.seguimiento))&caduca_at=gt.${encodeURIComponent(ahora)}&order=created_at.asc`
  : `household_id=${eq(householdId)}&status=eq.abierta&kind=eq.seguimiento&caduca_at=gt.${encodeURIComponent(ahora)}&order=created_at.asc`);

/** Null si cabe. Con `reemplaza` válido y visible, descarta esa y deja sitio. */
async function topeAlcanzado(householdId, reemplaza, quien = {}) {
  const abiertos = await select("bot_tareas", filtroSeguimientos(householdId, new Date().toISOString()), "id,texto,scope,owner_user_id");
  const d = decidirTope(abiertos, reemplaza, quien);
  if (d.cabe) return null;
  if (d.texto) return d.texto;
  const quitar = d.quitar;
  const ahora = new Date().toISOString();
  await update("bot_tareas", `id=${eq(quitar.id)}&${filtroVivas()}`, cierre("descartada", ahora));
  await registrar(EVENTO.CERRADA, { extra: { householdId, kind: "seguimiento", estado: "descartada", motivo: "reemplazo" } });
  return null;
}

export async function tareasAbiertas(householdId, opciones = {}) {
  if (!householdId) return [];
  return elegirParaLeer(await select("bot_tareas", filtroDeLectura({ householdId, ...opciones }), tareasV2() ? COLUMNAS_V2 : COLUMNAS), opciones.ahora);
}

/**
 * Las claves de estado que no se preguntan ahora: las que alguien no quiso
 * contestar (rechazada, nunca) y, con v2, las aplazadas hasta su vuelve_at.
 */
export async function clavesCalladas(householdId, ahora = new Date()) {
  if (!householdId) return new Set();
  const cuales = tareasV2()
    ? `or=(status.eq.rechazada,and(status.eq.aplazada,vuelve_at.gt.${encodeURIComponent(ahora.toISOString())}))`
    : "status=eq.rechazada";
  const filas = await select("bot_tareas", `household_id=${eq(householdId)}&${cuales}&clave=not.is.null`, "clave");
  return new Set(filas.map((f) => f.clave));
}

/** Cierra en segundo plano lo que el estado ya decidió: «hecha» si se resolvió, «descartada» si la persona ya no está. No retrasa el turno. */
export function cerrarResueltas(resueltas = [], { householdId, userId = null } = {}, estado = "hecha") {
  if (!resueltas.length) return Promise.resolve();
  const ahora = new Date().toISOString();
  return Promise.all(resueltas.map((t) =>
    update("bot_tareas", `id=${eq(t.id)}&${filtroVivas()}`, cierre(estado, ahora))
      .then(() => registrar(EVENTO.AUTO, { userId, extra: { householdId, kind: t.kind, clave: t.clave, estado } }))
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
  const abiertas = tareasV2()
    ? await select("bot_tareas", `household_id=${eq(householdId)}&${filtroVivas()}&or=(campo.not.is.null,clave.like.alergias:*,clave.like.etapa:*)`, "id,kind,clave,tipo,campo,persona_id")
    : await select("bot_tareas", `household_id=${eq(householdId)}&status=eq.abierta&or=(clave.like.alergias:*,clave.like.etapa:*)`, "id,kind,clave");
  const { resueltas, descartadas } = separarPorEstado(abiertas, data);
  await Promise.all([
    cerrarResueltas(resueltas, { householdId, userId }),
    cerrarResueltas(descartadas, { householdId, userId }, "descartada"),
  ]);
  return resueltas.length + descartadas.length;
}

/** La fila de una pregunta de estado que abre el código (no Lola). */
function filaDePregunta(ctx, { campo, personaId, texto, falta }, ahora) {
  return {
    household_id: ctx.householdId, channel: ctx.channel, chat_id: String(ctx.chatId), kind: "pregunta", scope: "casa",
    texto, ...(falta === undefined ? {} : { falta }), clave: claveDeTarea({ tipo: "falta_saber", campo, personaId }), created_by: ctx.userId ?? null,
    caduca_at: caducidadDe({ tipo: "falta_saber", campo }, ahora).toISOString(),
    ...columnasV2({ tipo: "falta_saber", campo, persona_id: personaId }),
  };
}

/** Abre la pregunta de un campo de estado de una persona desde el código. Si ya está abierta, el índice único la para. */
export async function abrirPreguntaDeEstado(ctx, { campo, personaId, texto }, ahora = new Date()) {
  if (!ctx?.householdId || !ctx?.chatId || !claveDeTarea({ tipo: "falta_saber", campo, personaId })) return false;
  try {
    await insertarTarea(filaDePregunta({ ...ctx, channel: ctx.channel ?? "telegram" }, { campo, personaId, texto: String(texto ?? "").slice(0, TEXTO_MAX) }, ahora));
    await registrar(EVENTO.CREADA, { userId: ctx.userId ?? null, extra: { householdId: ctx.householdId, kind: "pregunta", ...temaDelEvento(campo), origen: "codigo" } });
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
    .filter((p) => campoDeClave(p.clave) && personaDeClave(p.clave))
    .map((p) => ({
      clave: p.clave,
      campo: campoDeClave(p.clave),
      personaId: personaDeClave(p.clave),
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
      await insertarTarea(filaDePregunta(ctx, p, ahora));
      await registrar(EVENTO.CREADA, { userId: ctx.userId ?? null, extra: { householdId: ctx.householdId, kind: "pregunta", ...temaDelEvento(p.campo), origen: "codigo" } });
    } catch (e) {
      if (!esDuplicado(e)) console.error("[tareas] promover", e?.message);
    }
  }
}

// Las tres escrituras de Lola sobre tareas, una sola vez por llamada de
// herramienta (ctx.idem). Sin BOT_TAREAS_V2, unaVez solo ejecuta.
export function anotarTarea(ctx, datos, data = {}) {
  return unaVez({ householdId: ctx.householdId, clave: ctx.idem, rpc: "anotar_tarea" }, () => anotar(ctx, datos, data));
}

export function cerrarTarea(ctx, abiertas, referencia, estado = "hecha", ahora = new Date()) {
  return unaVez({ householdId: ctx.householdId, clave: ctx.idem, rpc: "cerrar_tarea" }, () => cerrar(ctx, abiertas, referencia, estado, ahora));
}

export function editarTarea(ctx, abiertas, referencia, cambios = {}, data = {}, ahora = new Date()) {
  return unaVez({ householdId: ctx.householdId, clave: ctx.idem, rpc: "editar_tarea" }, () => editar(ctx, abiertas, referencia, cambios, data, ahora));
}

async function anotar(ctx, datos, data = {}) {
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
    await insertarTarea({
      household_id: householdId, channel, chat_id: String(chatId), kind: t.kind, scope: t.scope,
      owner_user_id: t.scope === "personal" ? userId : null, texto: t.texto, clave: t.clave,
      para_member: t.para_member, asignado_member: t.asignado_member, vence: t.vence, caduca_at: t.caduca_at,
      created_by: userId,
      ...columnasV2({ tipo: t.tipo, campo: t.campoDeEstado, persona_id: t.persona_id }),
    });
  } catch (e) {
    if (esTope(e)) return (await topeAlcanzado(householdId, null, { userId, privado, papel })) ?? "No he podido apuntarlo: hay demasiadas cosas abiertas. Pregunta cuál quitar.";
    if (!esDuplicado(e)) throw e;
    await registrar(EVENTO.DUPLICADA, { userId, extra: { householdId, kind: t.kind } });
    return "Ya estaba apuntado (lo pidió alguien antes): no lo he duplicado. Dilo así.";
  }
  await registrar(EVENTO.CREADA, { userId, extra: { householdId, kind: t.kind, ...temaDelEvento(t.campo), conFecha: Boolean(t.vence), conAviso: Boolean(t.cuando) } });
  if (t.cuando) {
    const aviso = await crearRecordatorio({ channel, chatId, householdId, autor }, { texto: t.texto, cuando: t.cuando });
    return `Apuntado. Y el aviso: ${aviso}`;
  }
  return "Apuntado.";
}

async function cerrar(ctx, abiertas, referencia, estado = "hecha", ahora = new Date()) {
  const t = porReferencia(abiertas, referencia);
  if (!t) return "No encuentro esa tarea entre las abiertas: mira la referencia en «Tareas abiertas de la casa».";
  if (estado === "aplazada") return aplazar(ctx, t, ahora);
  if (estado === "rechazada" && tipoDe(t) !== "falta_saber") return "«No quiere decirlo» solo vale para una pregunta; esto se descarta.";
  const filas = await update("bot_tareas", `id=${eq(t.id)}&household_id=${eq(ctx.householdId)}&${filtroVivas()}`, cierre(estado, ahora.toISOString()));
  if (!filas?.length) return "Esa tarea ya estaba cerrada.";
  // Sin chat_id (las que trae ficha_casa, fichaRpc.js) no se sabe: no se dice que fue en otro.
  const deOtroChat = t.chat_id != null && String(t.chat_id) !== String(ctx.chatId);
  await registrar(EVENTO.CERRADA, { userId: ctx.userId ?? null, extra: { householdId: ctx.householdId, kind: t.kind, estado, otroChat: deOtroChat } });
  const otroChat = deOtroChat ? " Se pidió en otro chat: si hace falta que allí lo sepan, ofrécete a decirlo, no lo hagas tú." : "";
  if (estado === "rechazada") return `Hecho: no lo volveré a preguntar. Ojo: no es «ninguna»; si importa para la seguridad, dilo así, sin insistir.${otroChat}`;
  return `${estado === "hecha" ? "Cerrada" : "Descartada"}: ${t.texto}.${otroChat}`;
}

/**
 * «Ahora te digo» (spec de tareas, decisión C): la pregunta queda aplazada y
 * vuelve sola al día siguiente (vuelve_at). Solo con BOT_TAREAS_V2 y solo una
 * pregunta: un seguimiento se cierra o se descarta, no se aplaza.
 */
async function aplazar(ctx, t, ahora) {
  if (!tareasV2()) return "Ese estado no vale: hecha, descartada o rechazada.";
  if (tipoDe(t) !== "falta_saber") return "Solo se aplaza una pregunta («ahora te digo»). Un seguimiento se queda abierto, o se descarta si ya no hace falta.";
  const filas = await update("bot_tareas", `id=${eq(t.id)}&household_id=${eq(ctx.householdId)}&${filtroVivas()}`,
    { status: "aplazada", vuelve_at: new Date(ahora.getTime() + DIA).toISOString(), updated_at: ahora.toISOString() });
  if (!filas?.length) return "Esa tarea ya estaba cerrada.";
  await registrar(EVENTO.APLAZADA, { userId: ctx.userId ?? null, extra: { householdId: ctx.householdId, campo: campoDe(t) ?? null } });
  return "Aplazada hasta mañana: no la vuelvas a sacar hasta entonces. Si piden algo que necesita ese dato, pregúntalo en ese momento, una vez y diciendo para qué.";
}

async function editar(ctx, abiertas, referencia, cambios = {}, data = {}, ahora = new Date()) {
  const t = porReferencia(abiertas, referencia);
  if (!t) return "No encuentro esa tarea entre las abiertas.";
  const parche = {};
  if (cambios.texto) parche.texto = String(cambios.texto).trim().slice(0, TEXTO_MAX);
  if (cambios.vence) {
    if (!fechaValida(cambios.vence)) return `No entiendo la fecha «${cambios.vence}»: AAAA-MM-DD.`;
    if (Date.parse(`${cambios.vence}T23:59:59Z`) < ahora.getTime()) return "Esa fecha ya ha pasado. ¿Para cuándo es?";
    parche.vence = cambios.vence;
    parche.caduca_at = caducidadDe({ tipo: tipoDe(t), vence: cambios.vence }, ahora).toISOString();
  }
  for (const [campo, columna] of [["para", "para_member"], ["encargado", "asignado_member"]]) {
    if (!cambios[campo]) continue;
    const r = resolverPersona(data, cambios[campo]);
    if (r.error) return r.error;
    parche[columna] = r.persona.id;
  }
  if (!Object.keys(parche).length) return "No me has dicho qué cambiar.";
  // La clave sale del texto y de para quién, como al crearla: si cambian, se recalcula.
  // Las de estado (de un campo de la ficha) no dependen del texto.
  if (!campoDe(t) && (parche.texto || "para_member" in parche)) {
    const personaId = parche.para_member ?? t.para_member ?? null;
    const clave = claveDeTarea({ tipo: tipoDe(t), personaId, palabras: palabrasDe(parche.texto ?? t.texto) });
    if (clave && clave !== t.clave) parche.clave = clave;
    // Con v2, la persona de una tarea libre es su «para».
    if (tareasV2() && "para_member" in parche) parche.persona_id = parche.para_member;
  }
  parche.updated_at = ahora.toISOString();
  try {
    await conPersona((p) => update("bot_tareas", `id=${eq(t.id)}&household_id=${eq(ctx.householdId)}&${filtroVivas()}`, p), parche);
  } catch (e) {
    if (esDuplicado(e)) return "Ya hay otra igual apuntada: no la he cambiado. Dilo así y pregunta si quiere cerrar una de las dos.";
    throw e;
  }
  return "Cambiado.";
}
