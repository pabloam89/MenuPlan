// Los ids que inventamos nosotros: uno por clase de cosa, en un solo sitio.
//
// Antes cada pantalla se hacía el suyo (`Math.random().toString(36)` en diez
// variantes, `randomUUID`, `randomBytes`…), y un día dos formatos se pisaron:
// los códigos de «Conectar Telegram» son 22 caracteres base64url, uno de cada
// 4096 empieza por «m_», y el webhook lo tomaba por una semana compartida.
//
// Reglas (decisión de Pablo, 7 oct 2026):
//   · Los ids NUEVOS de texto: prefijo de la clase + 12 caracteres base36 de un
//     generador criptográfico (crypto.getRandomValues; en Node vale el
//     `globalThis.crypto`). 36^12 ≈ 4,7·10^18: sin choques en la vida de una casa.
//   · Los ids que ya existen NO se reescriben nunca: `es(x)` acepta el formato
//     nuevo y los viejos. Por eso cada clase lleva su `viejo`.
//   · Los secretos (códigos del bot, llaves de compartir) no son ids: llevan
//     128 bits y su formato de siempre, porque hay quien los lee por la forma
//     (el largo de 22 de pedidoLola.js, el CHECK de las tablas…).
//
// Sin dependencias: lo importan la app, el bot (api/, directo, sin cargar el
// motor) y src/server/botCore.js. Lo vigila src/lib/ids.guard.test.js.

const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** `n` caracteres base36 sin sesgo: se tiran los bytes ≥ 252 (7·36). */
function base36(n) {
  let s = "";
  while (s.length < n) {
    for (const x of bytes(n + 4)) {
      if (x < 252 && s.length < n) s += B36[x % 36];
    }
  }
  return s;
}

function hex(nBytes) {
  return Array.from(bytes(nBytes), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** base64url sin relleno, como `Buffer#toString("base64url")`. */
function base64url(b) {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    const quedan = b.length - i;
    s += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (quedan > 1) s += B64URL[(n >> 6) & 63];
    if (quedan > 2) s += B64URL[n & 63];
  }
  return s;
}

/** UUID v4, para las columnas `uuid` de la base. */
function uuid() {
  const b = bytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const LARGO = 12;
const esTexto = (x) => typeof x === "string";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Una clase de id UUID. `viejo`: formas guardadas antes que se siguen aceptando. */
const claseUuid = ({ viejo = null } = {}) => Object.freeze({
  re: RE_UUID,
  viejo,
  nuevo: uuid,
  es: (x) => esTexto(x) && (RE_UUID.test(x) || Boolean(viejo?.test(x))),
  esNuevo: (x) => esTexto(x) && RE_UUID.test(x),
});

/**
 * Una clase de id con prefijo. `viejo`: la forma de los que ya hay guardados
 * (se siguen aceptando); `fijos`: ids con nombre que también valen.
 */
function clase(prefijo, { viejo = null, fijos = [] } = {}) {
  const re = new RegExp(`^${prefijo.replace(/[-_]/g, "\\$&")}[0-9a-z]{${LARGO}}$`);
  return Object.freeze({
    prefijo,
    re,
    viejo,
    nuevo: () => `${prefijo}${base36(LARGO)}`,
    es: (x) => esTexto(x) && (re.test(x) || fijos.includes(x) || Boolean(viejo?.test(x))),
  });
}

// `Math.random().toString(36).slice(2, 10)`: hasta 8 caracteres (a veces menos).
const VIEJO_UID = /^[0-9a-z]{1,8}$/;

// ── Ids de cosas de la casa (dentro de `data`) ──────────────────────────────

/**
 * Persona y grupo son UUID (decisión de Pablo, 7 oct 2026): van a columnas
 * `uuid` de persona/grupo, y los ~92 + ~34 que ya hay se migran (bloque 0120+
 * de la sesión de la ficha). Mientras dura la migración `es()` acepta también
 * los viejos: el uid() de la app (≤ 8), `m<base36>` del bot y los `per_`/`grp_`
 * que se fabricaron entre #83 y este cambio.
 */
const VIEJO_PERSONA = /^([0-9a-z]{1,16}|per_[0-9a-z]{12})$/;
const VIEJO_GRUPO = /^([0-9a-z]{1,8}|grp_[0-9a-z]{12})$/;
/** Una persona de la casa. */
export const persona = claseUuid({ viejo: VIEJO_PERSONA });
/** Un grupo de menú (Adultos, Niños, Bebé, un menú individual…). */
export const grupo = claseUuid({ viejo: VIEJO_GRUPO });
/** Una regla (src/lib/reglas.js). */
export const regla = clase("reg_", { viejo: VIEJO_UID });
/** Un roster («Mi familia», «Otro grupo»…). `default` y `other` son fijos. */
export const roster = clase("ros_", { viejo: VIEJO_UID, fijos: ["default", "other"] });
/**
 * Una receta propia. El prefijo `user_` se queda: medio código decide por él
 * si una receta es del catálogo o propia. Viejos: `user_<uid>`,
 * `user_<uuid>` (copiar del feed) y `user_<tiempo><hex>` (copiar en el bot).
 */
export const recetaPropia = clase("user_", { viejo: /^user_[0-9a-z-]{1,40}$/ });
/** Un menú guardado. Viejo: `menu_` + 8 al azar + la hora en base36. */
export const menu = clase("menu_", { viejo: /^menu_[0-9a-z]{1,24}$/ });
/** Una carpeta del recetario. Viejo: `fld_<uuid>` (el CHECK de 0086 pide `fld\_%`). */
export const carpeta = clase("fld_", { viejo: /^fld_[0-9a-z_-]{1,48}$/ });
/** Un plato borrador (cocinada o despensa sin receta todavía). Viejo: `draft_<tiempo>`. */
export const borrador = clase("draft_", { viejo: /^draft_[0-9a-z_]{1,32}$/ });
/**
 * Un objetivo propio sin nombre que dé un slug. Va con guion, como los slugs
 * a cuyo lado vive; se le añade `-2`, `-3` si ya existía.
 */
export const objetivoPropio = clase("custom-", { viejo: /^custom-[0-9a-z]{1,12}(-\d+)?$/ });
/** Una fila de despensa que aún no ha subido (`local_` = sin id de la base). */
export const despensaLocal = clase("local_", { viejo: /^local_[0-9a-z]{1,8}$/ });
/** Un gasto apuntado a mano. Viejo: `m-<ms>-<4>`. */
export const gasto = clase("gst_", { viejo: /^m-\d{10,16}-[0-9a-z]{1,4}$/ });
/** Un ticket; sus líneas son `<ticket>-<n>`. Viejo: `r-<ms>-<4>`. */
export const ticket = clase("tkt_", { viejo: /^r-\d{10,16}-[0-9a-z]{1,4}$/ });

// ── Ids que van a columnas `uuid` de la base ────────────────────────────────

/** Una cocinada (cookings.id; también la carpeta de su foto en Storage). */
export const cocinada = claseUuid();
/** El id anónimo de analítica de quien no ha entrado (localStorage). */
export const anonimo = Object.freeze({ ...claseUuid(), es: (x) => esTexto(x) && (RE_UUID.test(x) || /^[0-9a-z]{8,24}$/.test(x)) });

// ── Secretos: códigos del bot y llaves de compartir ─────────────────────────

/**
 * El payload de `/start` de Telegram (64 caracteres de [A-Za-z0-9_-]). Cada
 * clase se reconoce por su forma ENTERA, nunca por el prefijo solo: un código
 * al azar puede empezar por cualquier cosa.
 */
const START = Object.freeze({
  correo: /^c(\d{6})$/, // el botón del correo de «ya tengo cuenta»
  invitacion: /^inv_([0-9a-f]{32})$/, // invitación a una casa (api/_bot/invitacion.js)
  recetaPropia: /^ru_([0-9a-f]{32})$/, // llave de recipe_share_links
  semana: /^m_([0-9a-f]{32})$/, // llave de menu_share_links
  // Ids del catálogo: minúsculas, cifras, `_` y `-` (los de la ñ no caben en un /start).
  receta: /^rc_([a-z0-9][a-z0-9_-]{0,60})$/,
  grupo: /^grupo$/, // el botón de un grupo sin casa
  codigoGrupo: /^(g[A-Za-z0-9_-]{22})$/, // el de /grupo (startgroup)
  enlace: /^([A-Za-z0-9_-]{22})$/, // «Conectar Telegram» en Ajustes
  enlaceConPedido: /^([A-Za-z0-9_-]{22})-([A-Za-z0-9_-]{1,41})$/, // src/lib/pedidoLola.js
  pedido: /^p-([A-Za-z0-9_-]{1,19})$/, // pedido sin sesión (más corto que un código)
});

// Lo que un código nuevo no puede ser ni parecer al principio: las otras
// clases de /start. «grupo» también, por si un código de grupo (`g…`) siguiera «rupo».
const PREFIJOS_DE_OTROS = ["rc_", "ru_", "m_", "inv_", "p-", "grupo"];

/** Lee un payload de /start: `{ tipo, … }`, o null si no es de los nuestros. */
function leerStart(p) {
  if (!esTexto(p) || p.length > 64) return null;
  let m;
  if ((m = START.correo.exec(p))) return { tipo: "correo", codigo: m[1] };
  if ((m = START.invitacion.exec(p))) return { tipo: "invitacion", token: m[1] };
  if ((m = START.recetaPropia.exec(p))) return { tipo: "recetaPropia", llave: m[1] };
  if ((m = START.semana.exec(p))) return { tipo: "semana", llave: m[1] };
  if ((m = START.receta.exec(p))) return { tipo: "receta", id: m[1] };
  if (START.grupo.test(p)) return { tipo: "grupo" };
  if ((m = START.codigoGrupo.exec(p))) return { tipo: "codigoGrupo", codigo: m[1] };
  if ((m = START.enlace.exec(p))) return { tipo: "enlace", codigo: m[1], pedido: null };
  if ((m = START.enlaceConPedido.exec(p))) return { tipo: "pedido", codigo: m[1], pedido: m[2] };
  if ((m = START.pedido.exec(p))) return { tipo: "pedido", codigo: null, pedido: m[1] };
  return null;
}

/** Las clases de /start que son un enlace de compartir (api/bot/telegram.js, recibirCompartido). */
const COMPARTIDOS = new Set(["receta", "recetaPropia", "semana"]);

export const payloadStart = Object.freeze({
  re: START,
  leer: leerStart,
  esCompartido: (p) => COMPARTIDOS.has(leerStart(p)?.tipo),
});

/** 16 bytes en base64url (22 caracteres) que no se confunden con otra clase de /start. */
function codigo22() {
  for (;;) {
    const c = base64url(bytes(16));
    if (!PREFIJOS_DE_OTROS.some((p) => c.startsWith(p))) return c;
  }
}

/**
 * Código de «Conectar Telegram» (bot_link_tokens) y de un solo uso del bot
 * (bot_codigos: entrar, alta…). 22 caracteres: lo que cabe junto a un pedido
 * en el /start, y lo que pedidoLola.js corta por el largo.
 */
export const codigoBot = Object.freeze({
  re: START.enlace,
  nuevo: codigo22,
  es: (x) => esTexto(x) && START.enlace.test(x),
});

/** El de /grupo: una «g» delante y 23 caracteres; uno de grupo no enlaza un privado. */
export const codigoGrupo = Object.freeze({
  re: START.codigoGrupo,
  nuevo: () => {
    for (;;) {
      const c = `g${codigo22()}`;
      if (!PREFIJOS_DE_OTROS.some((p) => c.startsWith(p))) return c;
    }
  },
  es: (x) => esTexto(x) && x.length === 23 && START.codigoGrupo.test(x),
});

/**
 * Llave de compartir (recipe_share_links, menu_share_links) e invitación a
 * una casa: 32 hex, la misma forma que `gen_invite_token()` en SQL (0017).
 */
const RE_LLAVE = /^[0-9a-f]{32}$/;
export const llave = Object.freeze({ re: RE_LLAVE, nuevo: () => hex(16), es: (x) => esTexto(x) && RE_LLAVE.test(x) });

// ── Ids compuestos ──────────────────────────────────────────────────────────

/**
 * Una receta dentro del plan de un grupo: `<grupo>__<receta>` cuando hay más
 * de un grupo, o la receta a secas. Ningún id de grupo ni de receta lleva `__`.
 */
export const recetaEnGrupo = Object.freeze({
  SEP: "__",
  formatear: (grupoId, recetaId) => (grupoId ? `${grupoId}__${recetaId}` : String(recetaId)),
  leer: (x) => {
    const s = String(x ?? "");
    const i = s.indexOf("__");
    return i < 0 ? { grupo: null, receta: s } : { grupo: s.slice(0, i), receta: s.slice(i + 2) };
  },
});

/** El hueco de un plan: `<Día>-<Comida>` («Lunes-Cena»). Ni días ni comidas llevan guion. */
export const huecoPlan = Object.freeze({
  formatear: (dia, comida) => `${dia}-${comida}`,
  leer: (x) => {
    const s = String(x ?? "");
    const i = s.indexOf("-");
    return i <= 0 || i === s.length - 1 ? null : { dia: s.slice(0, i), comida: s.slice(i + 1) };
  },
});

// Para los tests (ids.test.js): las piezas, sin pasar por una clase.
export const _interno = Object.freeze({ base36, base64url, hex, uuid, PREFIJOS_DE_OTROS });
