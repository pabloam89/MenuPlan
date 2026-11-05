/**
 * Enlazar un chat con una casa, y los códigos de un solo uso del bot.
 *
 * Tres caminos acaban aquí: «Conectar Telegram» en Ajustes (bot_link_tokens),
 * «ya tengo cuenta» por email y «soy nuevo» (bot_codigos, 0058). Las reglas
 * viven en un solo sitio para que ninguno se las salte.
 */

import * as ids from "../../src/lib/ids.js";
import { select, insert, update, eq } from "./db.js";
import { enviar, escaparHtml, TECLADO } from "./telegram.js";
import { registrar, EMBUDO } from "./embudo.js";
import { CANAL, paraEscribir, RESULTADO_ENLACE, PRUEBA_IDENTIDAD, ABREN_SESION } from "../../src/lib/vocabularios.js";
import { seguirCon } from "./avisar.js";

// Ids de Telegram que no son una persona: el admin anónimo de un grupo
// (GroupAnonymousBot), lo que se publica como canal (Channel_Bot) y los avisos
// del propio Telegram. Todos los admins anónimos escriben con el primero: si se
// enlazara a alguien, todos heredarían su cuenta.
const NO_PERSONAS = new Set(["1087968824", "136817688", "777000"]);

/** El id de quien escribe, o null si no es una persona (un bot, un anónimo). */
export function idDePersona(from) {
  if (!from?.id || from.is_bot) return null;
  const id = String(from.id);
  return NO_PERSONAS.has(id) ? null : id;
}

/**
 * Enlazar un chat con una casa (bot_chats) es una cosa; decir que un Telegram
 * ES una cuenta (bot_identities) es otra, y solo se apunta con prueba (C-3 de
 * specs/roles-de-la-casa-revision.md):
 *   · `nacida`: la cuenta se creó en este Telegram (email sintético de su id).
 *     Es la prueba más fuerte, y la única que corrige una identidad anterior.
 *   · `codigo_email`: escribió aquí el código que llegó al correo de la cuenta.
 *   · `ajustes`: el enlace de «Conectar Telegram» que el dueño sacó en su app,
 *     pulsado en un chat privado.
 *   · `cambio`: el mismo enlace, cuando este Telegram ya era de otra cuenta y
 *     la persona confirmó aquí, en su privado, que lo pasa a la de la app
 *     (#1238). Quien tiene el privado es quien tenía la otra cuenta: por eso
 *     corrige la identidad y puede mover el chat que esa cuenta enlazó.
 * Sin prueba (`identidad` null), o en un grupo, solo se enlaza el chat: el
 * que pulsa «Añadir al grupo» no tiene por qué ser quien firmó el enlace.
 * Y una identidad que ya es de otra cuenta no se cambia por pulsar un enlace.
 *
 * @param {{ identidad?: PRUEBAS_IDENTIDAD de vocabularios.js, o null }} args
 * @returns {Promise<{ ok: true, identidad: "nueva" | "igual" | "de-otra" | "sin" } | { ok: false, ocupado: true }>}
 */
// `lang` (el idioma de la app de Telegram) se sigue aceptando pero ya no se
// guarda en bot_chats.lang: nadie lo leía. El idioma de Lola sale de
// user_profiles.ui_lang (papel.js, idiomaDe).
/**
 * ¿Este chat (su fila de bot_chats, o nada) está ocupado para `userId` si lo
 * quiere llevar a `householdId`? Un chat ya enlazado a OTRA casa solo lo puede
 * mover quien lo enlazó: si no, cualquiera del grupo familiar se lo llevaría a
 * su casa con su código. Una sola regla para enlazarChat y para la invitación,
 * que la mira antes de unirse (invitacion.js, #958).
 */
/** La prueba de un cambio de cuenta confirmado en el privado (#1238); con `nacida`, las únicas que corrigen una identidad. */
export const CAMBIO = PRUEBA_IDENTIDAD.CAMBIO;
const CORRIGEN_IDENTIDAD = new Set([PRUEBA_IDENTIDAD.NACIDA, CAMBIO]);

/** La cuenta de este Telegram (bot_identities), o null. Un fallo de la base, lanza. */
export async function cuentaDeTelegram(externalId, channel = CANAL.TELEGRAM) {
  if (!externalId) return null;
  const [ya] = await select("bot_identities", `channel=${eq(channel)}&external_id=${eq(String(externalId))}`, "user_id");
  return ya?.user_id ?? null;
}

/**
 * Pura. ¿Hay que preguntar antes de enlazar? En un privado, si este Telegram ya es otra cuenta que la del enlace: la
 * persona tiene las dos (el privado y la sesión de la app), y elige con cuál sigue (#1238, recorrido 4).
 */
export const pideCambioDeCuenta = ({ esGrupo, deAntes, userId }) => Boolean(!esGrupo && deAntes && deAntes !== userId);

/**
 * Pura. La pregunta del cambio de cuenta, con el nombre de las dos casas y cuántas personas tiene cada una, si se saben:
 * casi todas se llaman «Mi casa», y el nombre solo no deja elegir (#1302). `conPedido`: venía de un botón
 * de la app con algo pedido, que no se hace (sería en la otra casa) ni se guarda: se dice que hay que pedirlo otra vez.
 */
export function preguntaDeCambio({ casaAntes, casaApp, personasAntes = null, personasApp = null, conPedido = false }) {
  const cuantas = (n) => (n == null ? "" : n === 0 ? ", sin nadie" : n === 1 ? ", con 1 persona" : `, con ${n} personas`);
  const nombre = (n, si, personas) => `${n ? `<b>${escaparHtml(n)}</b>` : si}${cuantas(personas)}`;
  return `Este Telegram ya está conectado a otra cuenta de HoMenu (la de ${nombre(casaAntes, "otra casa", personasAntes)}). `
    + `¿Lo pasas a la cuenta con la que has entrado en la app (${nombre(casaApp, "tu casa", personasApp)})?\n\n`
    + "Lo de la otra cuenta se queda en ella: no se pasa a esta."
    + (conPedido ? "\n\nLo que me has pedido desde la app no lo he hecho: cuando contestes, pídemelo otra vez." : "");
}

/** Las filas de persona de estas casas, para contarlas con personasDeCasa. Un fallo de la base, lanza. */
export const personasDeCasas = (casas) => select("persona", `household_id=in.(${casas.map(encodeURIComponent).join(",")})`, "household_id");

/** Pura. Cuántas personas de `filas` son de esta casa. Sin saber la casa o sin filas, null: no se sabe, no es que no haya nadie. */
export const personasDeCasa = (filas, casa) => (casa && filas ? filas.filter((p) => p.household_id === casa).length : null);

export const chatOcupado = (actual, householdId, userId) =>
  Boolean(actual && actual.household_id !== householdId && actual.linked_by !== userId);

/**
 * Pura. Cómo acaba un enlace que sí se hace (bot_enlaces.resultado_enlace, #1238): `actual` es la fila de bot_chats de antes
 * (o nada) y `identidad`, lo que devolvió apuntarIdentidad.
 */
export function resultadoDeEnlace(actual, householdId, identidad) {
  if (identidad === "de-otra") return RESULTADO_ENLACE.IDENTIDAD_DE_OTRA;
  if (!actual) return RESULTADO_ENLACE.NUEVO;
  return actual.household_id === householdId ? RESULTADO_ENLACE.YA_ESTABA : RESULTADO_ENLACE.CASA_CAMBIADA;
}

/**
 * Apunta un intento de enlace en bot_enlaces (0126, #1238): por qué camino llegó y cómo acabó, los dos de su lista
 * cerrada. Un valor que falta o fuera de la lista es un fallo del código y se avisa con su nombre (seguirCon), igual
 * que si la base no contesta o la 0126 no está aplicada; pero apuntar nunca tumba el enlace de la persona. Que cada
 * llamada a enlazarChat diga su camino lo vigila enlace.test.js recorriendo el código.
 */
export async function apuntarEnlace({ camino, resultado, householdId = null, userId = null }) {
  try {
    if (!camino || !resultado) throw new Error(`apuntarEnlace sin camino o resultado («${camino}», «${resultado}»)`);
    const fila = {
      camino_enlace: paraEscribir("caminos_enlace", camino),
      resultado_enlace: paraEscribir("resultados_enlace", resultado),
      household_id: householdId ?? null,
      user_id: userId ?? null,
    };
    await insert("bot_enlaces", [fila]);
  } catch (e) {
    // a propósito: apuntar el intento es accesorio; el enlace de la persona sigue y el fallo queda en el log.
    seguirCon("enlace_apuntar")(e);
  }
}

export async function enlazarChat({ channel = CANAL.TELEGRAM, camino, chatId, kind, householdId, userId, externalId, nombre, identidad = null }) {
  const [actual] = await select("bot_chats", `channel=${eq(channel)}&chat_id=${eq(chatId)}`, "household_id,linked_by");
  // Un cambio confirmado mueve el chat que enlazó la cuenta de antes de este mismo Telegram, y ninguno más.
  const deAntes = identidad === CAMBIO && kind === "private" ? await cuentaDeTelegram(externalId, channel) : null;
  if (chatOcupado(actual, householdId, userId) && !(deAntes && actual.linked_by === deAntes)) {
    await apuntarEnlace({ camino, resultado: RESULTADO_ENLACE.OCUPADO, householdId, userId });
    return { ok: false, ocupado: true };
  }

  const estado = await apuntarIdentidad({ channel, kind, userId, externalId, nombre, identidad });
  await insert("bot_chats", [{
    channel: paraEscribir("canales", channel),
    chat_id: String(chatId),
    household_id: householdId,
    kind,
    linked_by: userId,
  }], { upsert: true });
  await registrar(EMBUDO.ENLACE, { userId, telegramId: externalId, unaVez: true, extra: { tipo: kind } });
  await apuntarEnlace({ camino, resultado: resultadoDeEnlace(actual, householdId, estado), householdId, userId });
  return { ok: true, identidad: estado };
}

async function apuntarIdentidad({ channel, kind, userId, externalId, nombre, identidad }) {
  if (!identidad || kind !== "private" || !externalId || NO_PERSONAS.has(String(externalId))) return "sin";
  const [ya] = await select("bot_identities", `channel=${eq(channel)}&external_id=${eq(String(externalId))}`, "user_id");
  if (ya && ya.user_id !== userId && !CORRIGEN_IDENTIDAD.has(identidad)) {
    console.warn("[enlace] identidad de otra cuenta, no se cambia", { channel, identidad });
    return "de-otra";
  }
  await insert("bot_identities", [{
    channel: paraEscribir("canales", channel),
    external_id: String(externalId),
    user_id: userId,
    display_name: nombre ?? null,
  }], { upsert: true });
  const estado = ya?.user_id === userId ? "igual" : "nueva";
  await apuntarPrueba({ channel, externalId, userId, identidad, estado });
  return estado;
}

/**
 * Pura. ¿Se escribe la prueba de esta identidad (bot_identities.prueba_identidad, 0129)? Siempre que la fila nace o
 * cambia de cuenta; en la misma cuenta, solo si la nueva abre sesión (ABREN_SESION): un código del email no le quita
 * a la fila el «se conectó desde la app» que ya tenía.
 */
export const escribePrueba = ({ identidad, estado }) => estado === "nueva" || ABREN_SESION.has(identidad);

/**
 * Apunta con qué prueba se dijo que este Telegram es la cuenta (#1238, trozo 3 de specs/auth.md §7). Va aparte del
 * upsert, filtrado también por la cuenta: sin la 0129 falla, se avisa (`enlace_prueba`) y el enlace sigue; la fila
 * queda sin prueba, que no abre nada. Si falla en una fila que cambia de cuenta (solo pasa con `nacida` o `cambio`,
 * CORRIGEN_IDENTIDAD), se queda con la prueba de antes: `cambio` abre la cuenta nueva igual, y la nacida la abre su
 * email sintético (cuentaNacidaAqui), así que nunca abre más de lo probado.
 */
async function apuntarPrueba({ channel, externalId, userId, identidad, estado }) {
  if (!escribePrueba({ identidad, estado })) return;
  // Fuera del try: una prueba fuera de la lista es un fallo del código y tumba el enlace, no se apunta y sigue.
  const prueba = paraEscribir("pruebas_identidad", identidad);
  try {
    await update("bot_identities", `channel=${eq(channel)}&external_id=${eq(String(externalId))}&user_id=${eq(userId)}`, { prueba_identidad: prueba });
  } catch (e) {
    // a propósito: sin la 0129 la fila queda sin prueba (no abre nada) y el enlace sigue; el fallo queda en el log.
    seguirCon("enlace_prueba")(e);
  }
}

/**
 * 16 bytes en base64url: cabe en el `/start` de Telegram (máx. 64) y en una
 * URL. Nunca empieza como otra clase de /start (rc_, ru_, m_…): src/lib/ids.js.
 */
export const codigoNuevo = () => ids.codigoBot.nuevo();

// Los de /grupo llevan una «g» delante: 23 caracteres, y los demás (16 bytes en
// base64url, también los de la app) siempre 22. Así se distinguen sin tocar la
// tabla, y uno de grupo no sirve para enlazar un privado.
export const codigoDeGrupo = () => ids.codigoGrupo.nuevo();
export const esCodigoDeGrupo = (token) => ids.codigoGrupo.es(token);

export async function crearCodigo({ tipo, channel = CANAL.TELEGRAM, chatId, externalId, nombre, userId = null, email = null, minutos }) {
  const codigo = codigoNuevo();
  await insert("bot_codigos", [{
    codigo,
    tipo,
    channel: paraEscribir("canales", channel),
    chat_id: String(chatId),
    external_id: externalId ? String(externalId) : null,
    nombre: nombre ?? null,
    user_id: userId,
    email,
    expires_at: new Date(Date.now() + minutos * 60000).toISOString(),
  }]);
  return codigo;
}

/**
 * Gasta un código: solo lo devuelve una vez, y solo si no ha caducado. El
 * `used_at=is.null` en el mismo UPDATE hace que dos peticiones a la vez no lo
 * gasten las dos.
 */
export async function gastarCodigo(codigo, tipo) {
  if (typeof codigo !== "string" || !/^[\w-]{16,64}$/.test(codigo)) return null;
  const filas = await update(
    "bot_codigos",
    `codigo=${eq(codigo)}&tipo=${eq(tipo)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    { used_at: new Date().toISOString() },
  );
  return filas?.[0] ?? null;
}

/** El dueño de la casa activa de un usuario (el bot escribe como dueño). */
export async function casaPropia(userId) {
  const [perfil] = await select("user_profiles", `user_id=${eq(userId)}`, "active_household_id");
  const householdId = perfil?.active_household_id;
  if (!householdId) return null;
  const [hogar] = await select("households", `id=${eq(householdId)}`, "id,name,owner_user_id");
  if (!hogar || hogar.owner_user_id !== userId) return null;
  return hogar;
}

/** El «¡Listo!» del bot en el chat recién enlazado. */
export async function confirmarEnlace(chatId, householdId, esGrupo = false) {
  const [hogar] = await select("households", `id=${eq(householdId)}`, "name");
  const casa = hogar?.name ? ` con <b>${escaparHtml(hogar.name)}</b>` : "";
  return enviar(
    chatId,
    esGrupo
      ? `¡Listo! Este grupo está conectado${casa}. Para hablarme aquí, empezad el mensaje con <b>Lola</b> (por ejemplo, «Lola, ¿qué cenamos?») o responded a uno de mis mensajes.`
      : `¡Listo! Estamos conectados${casa}. Escríbeme o mándame un audio cuando quieras.`,
    esGrupo ? {} : { teclado: TECLADO },
  );
}

/** La URL pública de la app para este despliegue (staging o producción). */
export function baseDe(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `https://${host}`;
}
