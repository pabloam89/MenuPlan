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

import { seguirCon, fallaCon } from "./avisar.js";
import { config, select, update, eq } from "./db.js";
import { CANAL, ABREN_SESION } from "../../src/lib/vocabularios.js";
// El email sintético, de un solo sitio: la app lo usa para ofrecer «Entrar también con Google» (#1238).
import { emailSintetico } from "../../src/lib/cuentaTelegram.js";

export { emailSintetico };

async function auth(ruta, { method = "POST", body, token } = {}) {
  const { url, key, headers } = config();
  const res = await fetch(`${url}/auth/v1${ruta}`, {
    method,
    headers: token ? { apikey: anonKey() ?? key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // a propósito: sin cuerpo JSON, el status ya dice qué pasó
  const json = await res.json().catch(seguirCon("cuentas_json", {}));
  return { ok: res.ok, status: res.status, json };
}

/**
 * Un fallo de GoTrue, con su código y su mensaje y nada más: el cuerpo puede
 * traer el id y el email de la persona, y el texto acaba en el log (#211).
 */
function errorDeAuth(que, r) {
  const j = r.json ?? {};
  const codigo = j.error_code ?? j.code ?? j.error ?? null;
  const msg = j.msg ?? j.error_description ?? j.message ?? "";
  return Object.assign(new Error(`${que} → ${r.status} ${[codigo, msg].filter(Boolean).join(" ")}`.slice(0, 200)), { status: r.status });
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
  if (!r.ok || !hash) throw errorDeAuth("generate_link", r);
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
  const u = await fetch(`${url}/auth/v1/admin/users/${id.user_id}`, { headers }).then((r) => r.json()).catch(fallaCon("cuentas_nacida_aqui", null));
  return u?.email === emailSintetico(telegramId) ? { id: u.id, email: u.email } : null;
}

/**
 * La cuenta que nació en este Telegram aunque su identidad ya apunte a otra (#1238): tras pasar el Telegram a la
 * cuenta de la app, cuentaNacidaAqui ya no la ve, y sin esto quedaba perdida. Se busca por su email sintético en
 * user_profiles y se comprueba en Auth. Cada fila con ese email, no la primera: cada uno puede escribir el email de su
 * propio perfil, y una fila falsa no tiene que tapar la buena. Un fallo de la base o de Auth, lanza: quien llama no
 * decide a ciegas.
 * @returns {Promise<{ id: string, email: string } | null>}
 */
export async function cuentaNacidaDe(telegramId) {
  const email = emailSintetico(telegramId);
  const perfiles = await select("user_profiles", `email=${eq(email)}`, "user_id");
  const { url, headers } = config();
  for (const { user_id: id } of perfiles) {
    if (!id) continue;
    const res = await fetch(`${url}/auth/v1/admin/users/${id}`, { headers });
    if (!res.ok) throw new Error(`auth admin/users → ${res.status}`);
    const u = await res.json();
    if (u?.id === id && u?.email === email) return { id, email };
  }
  return null;
}

/** El email de una cuenta según su perfil, o null (lo escribe la app al entrar). Un fallo de la base, lanza. */
export async function emailDeCuenta(userId) {
  const [perfil] = await select("user_profiles", `user_id=${eq(userId)}`, "email");
  return perfil?.email ?? null;
}

/**
 * ¿Pasar este Telegram de `userId` a otra cuenta tiene vuelta con /cuentadeantes? (#1238, #1302). Lo decide la misma
 * búsqueda que hace la vuelta (cuentaNacidaDe), mirada ANTES del cambio: si no la encuentra, no hay vuelta y quien
 * llama mantiene el freno. `userId` tiene que ser la cuenta nacida en este Telegram (su email en Auth). Su perfil puede
 * no tener el email (solo lo escribe la app al entrar, y una cuenta nacida que nunca abrió la app no lo tiene): el
 * servidor lo escribe entonces, solo si falta, con el email de Auth. Un fallo de la base o de Auth, lanza.
 * @returns {Promise<boolean>}
 */
export async function hayVueltaALaNacida(telegramId, userId) {
  const email = emailSintetico(telegramId);
  const { url, headers } = config();
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers });
  if (!res.ok) throw new Error(`auth admin/users → ${res.status}`);
  const u = await res.json();
  if (u?.id !== userId || u?.email !== email) return false;
  await update("user_profiles", `user_id=${eq(userId)}&email=is.null`, { email });
  return (await cuentaNacidaDe(telegramId))?.id === userId;
}

/**
 * La cuenta (de Google, de Apple) a la que este Telegram se conectó DESDE DENTRO de ella, o null (#1238, trozo 3 de
 * specs/auth.md §7): su fila de bot_identities se apuntó con una prueba que sale de una sesión de esa cuenta
 * (ABREN_SESION: el enlace de «Conectar Telegram» pulsado en el privado de este Telegram). El código del email, una
 * invitación o una fila de antes de la 0129 (sin prueba) no abren nada.
 */
export async function cuentaConectadaDesdeLaApp(telegramId) {
  // `*` y no la columna: sin la 0129 la fila llega sin prueba_identidad y no abre nada, en vez de un 400 que tumbaría
  // también la entrada de las cuentas nacidas en Telegram.
  const [id] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(String(telegramId))}`, "*");
  if (!id || !ABREN_SESION.has(id.prueba_identidad)) return null;
  const { url, headers } = config();
  const u = await fetch(`${url}/auth/v1/admin/users/${id.user_id}`, { headers }).then((r) => r.json()).catch(fallaCon("cuentas_conectada_app", null));
  // La sesión se abre por el email (tokenHashDe): sin él, o si la cuenta no es la de la fila, nada.
  return u?.id === id.user_id && u?.email ? { id: u.id, email: u.email } : null;
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
      user_metadata: { full_name: nombre ?? undefined, telegram_id: String(telegramId), origen: CANAL.TELEGRAM },
    },
  });
  const yaExistia = !creada.ok && /already|exists|registered/i.test(JSON.stringify(creada.json));
  if (!creada.ok && !yaExistia) {
    throw errorDeAuth("crear usuario", creada);
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
  // a propósito: sin cuerpo JSON, falla justo abajo con el status
  const hogar = await res.json().catch(seguirCon("cuentas_hogar", null));
  if (!res.ok || !hogar?.activeHouseholdId) throw new Error(`ensure_user_household → ${res.status}`);

  return { userId: yo.json?.id, householdId: hogar.activeHouseholdId, email };
}
