/**
 * Cuentas desde el bot: entrar con email y crearlas sin email.
 *
 * ── Ya tengo cuenta ────────────────────────────────────────────────────────
 * `enviarAcceso` pide a Supabase un correo de acceso (`/auth/v1/otp`, sin
 * crear cuenta si no existe) cuya plantilla lleva un código de 6 cifras; se
 * escribe en el chat y `verificarCodigoEmail` lo comprueba. Supabase une ese
 * acceso con la cuenta de Google cuando el email coincide (comprobado el
 * 29 sep 2026: mismo usuario, no crea otro).
 *
 * ── Soy nuevo ──────────────────────────────────────────────────────────────
 * `crearCuentaTelegram` crea el usuario con la API de administración, con un
 * email sintético que nunca recibe correo (`tg<id>@usuarios.menuplanai.com`,
 * confirmado de entrada), y le crea la casa llamando a `ensure_user_household`
 * CON SU PROPIA SESIÓN: así nace igual que si la hubiera creado la app, sin
 * duplicar la lógica de esa función.
 *
 * La sesión se obtiene con un enlace mágico generado y verificado en el
 * servidor (`sesionDe`): ningún correo sale y nadie más ve el token.
 */

import { config, select, insert, eq } from "./db.js";
import { LEGAL_VERSION } from "../../src/lib/legal.js";

const DOMINIO_SINTETICO = "usuarios.menuplanai.com";

// Una respuesta reciente, en cualquiera de los dos sentidos, no se vuelve a
// mirar: es un chequeo que entra en CADA mensaje de un chat ya enlazado.
// "Al día" se cachea más (LEGAL_VERSION no cambia a diario); "le falta" se
// cachea poco, para no consultar Supabase en cada mensaje mientras alguien
// ignora el aviso y sigue escribiendo, pero sin tardar en notar que ya
// aceptó. registrarConsentimiento limpia la entrada al momento: no hace
// falta esperar a que caduque para que el "sí" surta efecto.
//
// MAX_CACHE es una válvula de seguridad, no un LRU de verdad: en una
// instancia caliente que atienda a muchísima gente distinta, vaciar el mapa
// entero de cuando en cuando es más simple que llevar la cuenta de qué
// entradas son viejas, y el coste (una consulta de más justo después de
// vaciar) es insignificante al lado de crecer sin límite.
const ESTADO_LEGAL = new Map();
const OK_MS = 10 * 60 * 1000;
const FALTA_MS = 60 * 1000;
const MAX_CACHE = 5000;

function recordarEstadoLegal(userId, falta) {
  if (ESTADO_LEGAL.size >= MAX_CACHE) ESTADO_LEGAL.clear();
  ESTADO_LEGAL.set(userId, { t: Date.now(), falta });
}

/**
 * Guarda el "acepto" legal de una cuenta (nacida en el chat, o una ya
 * existente que vuelve a aceptar tras subir LEGAL_VERSION). Misma versión y
 * misma columna que usa la app (src/lib/legal.js), así que da igual por dónde
 * se haya aceptado.
 *
 * Upsert, no PATCH: una cuenta que llegó por "ya tengo cuenta" (verificación
 * de email) puede no tener todavía fila en user_profiles si nunca pasó por
 * ensure_user_household ni por el login de Google de la app — un PATCH a un
 * user_id sin fila vuelve 200 con cero filas, sin lanzar nada, y se quedaría
 * pidiendo el aviso para siempre sin que ningún reintento lo arreglara nunca.
 * Comprueba igualmente que de verdad tocó algo: por si acaso.
 *
 * Nunca lanza (todo queda en el log): quien llama no puede dejar a medias un
 * turno por esto, pero SÍ necesita saber si de verdad se guardó, para no
 * decir "¡Gracias!" cuando no ha pasado nada — por eso devuelve si salió bien.
 * @returns {Promise<boolean>}
 */
export async function registrarConsentimiento(userId) {
  const filas = await insert("user_profiles", [{
    user_id: userId,
    legal_version: LEGAL_VERSION,
    legal_accepted_at: new Date().toISOString(),
  }], { upsert: true }).catch((e) => { console.error("[cuentas] registrarConsentimiento", e?.message); return null; });
  if (!filas?.length) { console.error("[cuentas] registrarConsentimiento: no se guardó", userId); return false; }
  recordarEstadoLegal(userId, false);
  return true;
}

/**
 * ¿A esta cuenta (ya creada: la persona detrás de un chat ya enlazado, nunca
 * la que se va a crear ahora) le falta aceptar la versión vigente?
 *
 * Un ERROR de lectura falla ABIERTO y no se cachea (un hipo de red no corta
 * la charla de nadie por un turno, igual que el resto de guardas del bot:
 * fueraDeLimite, el candado…; y se vuelve a intentar en el siguiente turno,
 * no dentro de 10 min). Una lectura que SALE BIEN pero no encuentra fila es
 * otra cosa: no es un fallo, es que esa cuenta nunca aceptó nada, así que
 * cuenta como "le falta" — antes se confundían los dos casos y una cuenta sin
 * fila en user_profiles no veía el aviso nunca.
 */
export async function faltaAceptarLegal(userId) {
  if (!userId) return false;
  const visto = ESTADO_LEGAL.get(userId);
  if (visto && Date.now() - visto.t < (visto.falta ? FALTA_MS : OK_MS)) return visto.falta;
  const filas = await select("user_profiles", `user_id=${eq(userId)}`, "legal_version")
    .catch((e) => { console.error("[cuentas] faltaAceptarLegal", e?.message); return null; });
  if (filas === null) return false; // error de lectura: sin cachear, se reintenta en el próximo turno
  const falta = (filas[0]?.legal_version ?? null) !== LEGAL_VERSION;
  recordarEstadoLegal(userId, falta);
  return falta;
}

export const emailSintetico = (telegramId) => `tg${telegramId}@${DOMINIO_SINTETICO}`;

async function auth(ruta, { method = "POST", body, token } = {}) {
  const { url, key, headers } = config();
  const res = await fetch(`${url}/auth/v1${ruta}`, {
    method,
    headers: token ? { apikey: anonKey() ?? key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const anonKey = () => process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || null;

/**
 * Manda el enlace de acceso por email. Solo a cuentas que ya existen.
 * @returns {Promise<{ ok: true } | { ok: false, noExiste?: true, error?: string }>}
 */
export async function enviarAcceso(email, redirectTo) {
  const r = await auth(`/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    body: { email, create_user: false },
  });
  if (r.ok) return { ok: true };
  const msg = `${r.json?.error_code ?? ""} ${r.json?.msg ?? r.json?.message ?? ""}`;
  if (/signup|not.?allowed|not.?found|otp_disabled/i.test(msg)) return { ok: false, noExiste: true };
  if (r.status === 429) return { ok: false, error: "demasiados correos seguidos" };
  return { ok: false, error: msg.trim() || `HTTP ${r.status}` };
}

/**
 * Comprueba el código de 6 cifras que Supabase mandó por email (0059). Si es
 * bueno, devuelve el id del usuario: quien lo escribe en el chat ha leído ese
 * correo, que es la prueba de que la cuenta es suya.
 * @returns {Promise<string | null>}
 */
export async function verificarCodigoEmail(email, token) {
  for (const type of ["email", "magiclink"]) {
    const r = await auth("/verify", { body: { type, email, token } });
    if (r.ok && r.json?.user?.id) return r.json.user.id;
  }
  return null;
}

/** El `token_hash` de un enlace mágico, sin mandar correo. Sirve para abrir la app ya dentro. */
export async function tokenHashDe(email) {
  const r = await auth("/admin/generate_link", { body: { type: "magiclink", email } });
  const hash = r.json?.properties?.hashed_token ?? r.json?.hashed_token;
  if (!r.ok || !hash) throw new Error(`generate_link → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  return hash;
}

/** Una sesión del usuario, solo en el servidor. */
async function sesionDe(email) {
  const token_hash = await tokenHashDe(email);
  const r = await auth("/verify", { body: { type: "magiclink", token_hash } });
  if (!r.ok || !r.json?.access_token) throw new Error(`verify → ${r.status}`);
  return r.json.access_token;
}

/**
 * La cuenta que NACIÓ en este Telegram (la de email sintético de este from.id),
 * o null. Es la única a la que el bot puede abrir sesión sin email: una fila en
 * bot_identities no basta, porque también se crea al enlazar por email o desde
 * un grupo, y eso no prueba que este Telegram sea el dueño de la cuenta.
 */
export async function cuentaNacidaAqui(telegramId) {
  const [id] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(telegramId)}`, "user_id");
  if (!id) return null;
  const { url, headers } = config();
  const u = await fetch(`${url}/auth/v1/admin/users/${id.user_id}`, { headers }).then((r) => r.json()).catch(() => null);
  return u?.email === emailSintetico(telegramId) ? { id: u.id, email: u.email } : null;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea (o recupera) la cuenta de alguien que empieza en Telegram, y su casa.
 * @returns {Promise<{ userId: string, householdId: string, email: string }>}
 */
export async function crearCuentaTelegram({ telegramId, nombre }) {
  const email = emailSintetico(telegramId);
  const creada = await auth("/admin/users", {
    body: {
      email,
      email_confirm: true,
      user_metadata: { full_name: nombre ?? undefined, telegram_id: String(telegramId), origen: "telegram" },
    },
  });
  const yaExistia = !creada.ok && /already|exists|registered/i.test(JSON.stringify(creada.json));
  if (!creada.ok && !yaExistia) {
    throw new Error(`crear usuario → ${creada.status} ${JSON.stringify(creada.json).slice(0, 200)}`);
  }

  const token = await sesionDe(email);
  const yo = await auth("/user", { method: "GET", token });

  // Ya existía: o un intento anterior se cortó a medias, o son dos toques a
  // «Soy nuevo» a la vez. Crear la cuenta es atómico (el email es único), pero
  // `ensure_user_household` no: dos llamadas simultáneas podrían crear dos
  // casas. Así que quien NO creó la cuenta espera a que la otra llamada tenga
  // casa, y solo si no llega la crea él (el intento cortado).
  if (yaExistia) {
    for (let i = 0; i < 6; i++) {
      const [p] = await select("user_profiles", `user_id=${eq(yo.json?.id)}`, "active_household_id");
      if (p?.active_household_id) return { userId: yo.json.id, householdId: p.active_household_id, email };
      await esperar(1000);
    }
  }

  const { url } = config();
  const res = await fetch(`${url}/rest/v1/rpc/ensure_user_household`, {
    method: "POST",
    headers: { apikey: anonKey() ?? config().key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const hogar = await res.json().catch(() => null);
  if (!res.ok || !hogar?.activeHouseholdId) throw new Error(`ensure_user_household → ${res.status}`);

  return { userId: yo.json?.id, householdId: hogar.activeHouseholdId, email };
}
