/**
 * El "sí" legal, en el navegador: se pide antes de abrir sesión con Google (no
 * hay user_id todavía, así que primero se marca en este dispositivo y se
 * guarda en Supabase en cuanto exista sesión) y se comprueba también para
 * quien YA tenía sesión antes de que esto existiera.
 *
 * Todo pasa por aquí para que GoogleButton, useAuth y App.jsx no dupliquen la
 * lógica cada uno a su manera.
 */
import { supabase } from "./supabase.js";
import { upsertUserProfile } from "./analytics.js";
import { LEGAL_VERSION } from "./legal.js";

const CLAVE_DISPOSITIVO = "homenu.legal.aceptado";
// Aparte de la de arriba: "pendiente" se borra en cuanto se guarda en
// Supabase, así que un SIGNED_IN posterior (token refresh, otra pestaña) no
// vuelve a escribir legal_accepted_at con la hora de ese momento.
const CLAVE_PENDIENTE = "homenu.legal.pendiente";

/** ¿Este dispositivo ya dijo que sí a la versión vigente? (antes de tener sesión, es lo único que hay) */
export function haAceptadoEnEsteDispositivo() {
  try { return localStorage.getItem(CLAVE_DISPOSITIVO) === LEGAL_VERSION; } catch { return false; }
}

/**
 * Al cerrar sesión: este dispositivo deja de "saber" que alguien aceptó. Sin
 * esto, en un dispositivo compartido (el caso normal de esta app: la tablet
 * de la cocina) una segunda cuenta que entrara después heredaba el "sí" de la
 * primera sin haber visto nunca los enlaces.
 */
export function olvidarDispositivo() {
  try {
    localStorage.removeItem(CLAVE_DISPOSITIVO);
    localStorage.removeItem(CLAVE_PENDIENTE);
  } catch { /* ver arriba */ }
}

function marcarDispositivo() {
  try { localStorage.setItem(CLAVE_DISPOSITIVO, LEGAL_VERSION); } catch { /* localStorage puede fallar en privado: no bloquea el login */ }
}

/**
 * Al pulsar "Aceptar y continuar" ANTES de iniciar sesión (botón de Google):
 * no hay user_id todavía donde guardarlo, así que además de marcar el
 * dispositivo deja constancia de que hay que guardarlo en Supabase en cuanto
 * exista sesión (guardarAceptacionPendiente). Para quien YA tiene sesión, usa
 * aceptarConSesion en su lugar: ese guarda al momento y no deja nada
 * "pendiente" que un SIGNED_IN posterior pudiera reescribir con otra hora.
 */
export function marcarAceptadoEnEsteDispositivo() {
  marcarDispositivo();
  try { localStorage.setItem(CLAVE_PENDIENTE, LEGAL_VERSION); } catch { /* ver arriba */ }
}

/**
 * Se llama una vez por sesión iniciada (useAuth, SIGNED_IN). Si el "sí" se dio
 * ANTES del login (no había user_id donde guardarlo), lo guarda ahora.
 *
 * El flag "pendiente" se borra DESPUÉS de confirmar que se guardó, no antes:
 * si upsertUserProfile falla (un hipo de red, un cold start), se deja puesto
 * a propósito para reintentarlo en el siguiente SIGNED_IN (otra pestaña, el
 * siguiente arranque) — si se borrara antes y el guardado fallara, esa
 * persona habría aceptado de verdad pero quedaría con legal_version desfasada
 * para siempre, sin nada que lo vuelva a intentar.
 */
export async function guardarAceptacionPendiente(user) {
  let pendiente = null;
  try { pendiente = localStorage.getItem(CLAVE_PENDIENTE); } catch { /* ver arriba */ }
  if (pendiente !== LEGAL_VERSION) return;
  const ok = await upsertUserProfile(user, { legal_version: LEGAL_VERSION, legal_accepted_at: new Date().toISOString() });
  if (ok) { try { localStorage.removeItem(CLAVE_PENDIENTE); } catch { /* ver arriba */ } }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Para quien YA tiene sesión (de antes de que esto existiera, o entró desde
 * otro dispositivo): ¿le falta aceptar la versión vigente? Lee Supabase, no el
 * dispositivo — es la única forma de no perderse a quien nunca pasó por el
 * botón de Google en ESTE navegador.
 *
 * Si resulta que está al día, lo marca en el dispositivo antes de devolver:
 * así, en la siguiente carga, haAceptadoEnEsteDispositivo ya lo sabe sin
 * volver a preguntarle a Supabase — sin esto, una cuenta cumplidora repetía
 * esta consulta en cada carga de la app para siempre.
 *
 * Reintenta un par de veces antes de fallar abierto: a diferencia del lado
 * del bot (faltaAceptarLegal, api/_bot/cuentas.js), que vuelve a preguntar en
 * cada mensaje y se cura solo, esto lo llama App.jsx una sola vez por sesión
 * iniciada — un hipo de red aquí no se repara hasta el siguiente login, y
 * para un aviso que existe por cumplimiento legal eso es demasiado tiempo
 * sin preguntar.
 */
export async function faltaAceptar(userId) {
  if (!supabase || !userId) return false;
  for (let intento = 0; ; intento++) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("legal_version")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) {
      const falta = data?.legal_version !== LEGAL_VERSION;
      if (!falta) marcarDispositivo();
      return falta;
    }
    if (intento >= 2) { console.warn("[legal] faltaAceptar", error.message); return false; }
    await esperar(800 * (intento + 1));
  }
}

/**
 * Para quien ya tiene sesión: el "sí" directo, sin pasar por el dispositivo.
 * @returns {Promise<boolean>} si se guardó de verdad — si no, quien llama
 *   sabe que tiene que volver a abrir el aviso en vez de darlo por hecho.
 */
export async function aceptarConSesion(user) {
  const ok = await upsertUserProfile(user, { legal_version: LEGAL_VERSION, legal_accepted_at: new Date().toISOString() });
  // Marcar el dispositivo DESPUÉS de confirmar, no antes: si el guardado
  // falla (hipo de red), no se marca, y entonces el efecto de App.jsx que
  // comprueba haAceptadoEnEsteDispositivo() en cada carga sigue sin verlo
  // aceptado — así que vuelve a consultar Supabase la próxima vez, sin
  // necesitar un flag "pendiente" aparte como el del camino antes del login
  // (aquí ya hay sesión: no hace falta ese paso intermedio).
  if (ok) marcarDispositivo();
  return ok;
}
