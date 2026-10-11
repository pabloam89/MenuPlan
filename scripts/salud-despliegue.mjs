/**
 * La puerta de salud tras un despliegue (#589, norma `vuelta-atras-probada`).
 *
 * Vercel despliega `staging` al fusionar y `main` es producción, y hasta aquí nada
 * miraba si lo desplegado respondía: el 9 oct 2026 staging desplegó en rojo y nadie
 * lo frenó. `.github/workflows/salud-despliegue.yml` lanza este script con cada
 * `deployment_status` de esas dos ramas.
 *
 * Qué mira, SIN secretos (la URL del despliegue es pública y el workflow no lleva
 * ninguno):
 *   - `pagina`:  GET / contesta 200 y trae `id="root"` (la app de Vite).
 *   - `funcion`: POST /api/bot/telegram sin el secreto del webhook contesta 401 con el
 *                cuerpo vacío. Es la guardia de api/bot/telegram.js: si la función no
 *                carga (import roto, `includeFiles` que falta) contesta 500 o 404.
 * No llama al canario de Lola (api/bot/canario.js, nivel salud): necesita
 * CANARIO_SECRET, que vive en el environment `vigia`. El vigía de Lola
 * (vigia-lola.yml) ya lo llama cada 15 min; esta puerta es la comprobación
 * inmediata de que el despliegue nuevo no nació roto.
 *
 * Falla cerrado: una URL ilegible, un timeout, un 5xx, una respuesta sin el campo
 * esperado o una protección de Vercel que tapa la respuesta son un fallo con su
 * motivo, nunca un «no sé, pasa». Un despliegue que Vercel marcó como fallido (estado
 * failure o error) es un fallo sin llamar a nada.
 *
 * Entrada (por entorno, nunca por argumentos; el evento no se pega en ningún `run:`):
 *   DESPLIEGUE_URL      la dirección del despliegue (`environment_url` del evento)
 *   DESPLIEGUE_ESTADO   success, failure o error
 *   DESPLIEGUE_REF      staging o main (solo para el informe)
 *   SALUD_HOSTS         opcional: dominios propios permitidos además de *.vercel.app
 * Salida: una línea `salud-despliegue chequeo: … ok: … motivo: …` por chequeo y una
 * final `salud-despliegue resultado: ok|fallo`; con `--issue <ruta>`, el cuerpo del
 * aviso. Sale 0 si todo va bien y 1 si no.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Los motivos de fallo, vocabulario cerrado (los lee el informe y el test). */
export const MOTIVOS_SALUD = {
  url_ilegible: "La dirección del despliegue falta, no es https o no es de un dominio permitido",
  despliegue_fallido: "Vercel marcó el despliegue como fallido: ni se llama",
  sin_respuesta: "No contestó a tiempo o la conexión falló",
  error_servidor: "Contestó con un error 5xx",
  protegido: "Una protección de Vercel (login) tapa la respuesta: no se puede comprobar",
  respuesta_inesperada: "Contestó con un código o un cuerpo que no es el esperado",
  sin_campo: "Contestó 200 pero sin el campo esperado en el cuerpo",
};

export const CHEQUEOS = ["despliegue", "pagina", "funcion"];
export const ESTADOS = ["success", "failure", "error"];
export const REFS = ["staging", "main"];

const PLAZO_MS = 10_000;
const INTENTOS = 4;
const ESPERA_MS = 15_000;

/** Lee y valida la dirección. Devuelve { base } o { motivo }. */
export function leerUrl(texto, extras = "") {
  let u;
  try {
    u = new URL(String(texto ?? "").trim());
  } catch {
    // a propósito: una URL rota es el resultado (url_ilegible), no un error que contar
    return { motivo: "url_ilegible" };
  }
  const permitidos = String(extras).split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const hostOk = u.hostname.endsWith(".vercel.app") || permitidos.includes(u.hostname.toLowerCase());
  if (u.protocol !== "https:" || u.username || u.password || u.port || !hostOk) return { motivo: "url_ilegible" };
  return { base: u.origin };
}

const motivoDeStatus = (s) => (s >= 500 ? "error_servidor" : "respuesta_inesperada");

/** El motivo de un fallo de red o de plazo. */
const SIN_RESPUESTA = "sin_respuesta";

async function leer(fetchFn, url, init, plazoMs) {
  const res = await fetchFn(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(plazoMs) });
  const cuerpo = await res.text();
  return { status: res.status, cuerpo, location: res.headers?.get?.("location") ?? "" };
}

const protegido = (r) => (r.status >= 300 && r.status < 400 && /vercel\.com/.test(r.location)) || (r.status === 401 && r.cuerpo.trim() !== "");

/** Un chequeo, un intento. Devuelve el motivo o null si va bien. */
const CHEQUEO_UNO = {
  async pagina({ fetchFn, base, plazoMs }) {
    const r = await leer(fetchFn, `${base}/`, { method: "GET" }, plazoMs);
    if (protegido(r) || r.status === 401) return "protegido";
    if (r.status !== 200) return motivoDeStatus(r.status);
    return r.cuerpo.includes('id="root"') ? null : "sin_campo";
  },
  async funcion({ fetchFn, base, plazoMs }) {
    const r = await leer(fetchFn, `${base}/api/bot/telegram`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update_id: 0 }),
    }, plazoMs);
    if (protegido(r)) return "protegido";
    if (r.status >= 500) return "error_servidor";
    return r.status === 401 ? null : "respuesta_inesperada";
  },
};

/**
 * Corre los chequeos con reintentos (un despliegue recién hecho tarda unos
 * segundos en responder). `dormir` y `fetchFn` se inyectan para el test.
 */
export async function comprobar({ base, fetchFn = fetch, plazoMs = PLAZO_MS, intentos = INTENTOS, esperaMs = ESPERA_MS, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const chequeos = [];
  for (const chequeo of ["pagina", "funcion"]) {
    let motivo = SIN_RESPUESTA, ms = 0, intento = 0;
    while (intento < intentos) {
      intento++;
      const t0 = Date.now();
      try {
        motivo = await CHEQUEO_UNO[chequeo]({ fetchFn, base, plazoMs });
      } catch { // a propósito: un fallo de red o de plazo es el resultado del chequeo
        motivo = SIN_RESPUESTA;
      }
      ms = Date.now() - t0;
      // Un 4xx/200 sin el campo no mejora esperando; solo se reintenta lo que puede ser «aún arrancando».
      if (motivo === null || !["sin_respuesta", "error_servidor"].includes(motivo)) break;
      if (intento < intentos) await dormir(esperaMs);
    }
    chequeos.push({ chequeo, ok: motivo === null, motivo, ms, intento });
  }
  return chequeos;
}

/**
 * Todo el resultado a partir del entorno. Pura salvo `comprobar`.
 * @returns {{ ok: boolean, ref: string, estado: string, chequeos: object[] }}
 */
export async function evaluar(env, opciones = {}) {
  const estado = String(env.DESPLIEGUE_ESTADO ?? "");
  const ref = REFS.includes(env.DESPLIEGUE_REF) ? env.DESPLIEGUE_REF : "desconocida";
  const falla = (chequeo, motivo) => ({ ok: false, ref, estado, chequeos: [{ chequeo, ok: false, motivo, ms: 0, intento: 0 }] });
  if (!ESTADOS.includes(estado)) return falla("despliegue", "respuesta_inesperada");
  if (estado !== "success") return falla("despliegue", "despliegue_fallido");
  const url = leerUrl(env.DESPLIEGUE_URL, env.SALUD_HOSTS);
  if (!url.base) return falla("despliegue", url.motivo);
  const chequeos = await comprobar({ base: url.base, ...opciones });
  return { ok: chequeos.every((c) => c.ok), ref, estado, chequeos };
}

/** Las líneas `clave: valor` para el log (sin direcciones ni cuerpos). */
export function lineas(r) {
  const l = r.chequeos.map((c) => `salud-despliegue chequeo: ${c.chequeo} ok: ${c.ok ? "si" : "no"} motivo: ${c.motivo ?? "-"} ms: ${c.ms} intentos: ${c.intento}`);
  l.push(`salud-despliegue resultado: ${r.ok ? "ok" : "fallo"} ref: ${r.ref} estado: ${r.estado || "-"}`);
  return l;
}

/** El cuerpo del aviso (el repo es público: motivos y cifras, nada más). */
export function informe(r) {
  const filas = r.chequeos.filter((c) => !c.ok).map((c) => `- \`${c.chequeo}\`: ${c.motivo} (${MOTIVOS_SALUD[c.motivo] ?? c.motivo})`);
  return [
    `El despliegue de \`${r.ref}\` no ha pasado la puerta de salud (#589).`,
    "",
    ...filas,
    "",
    "```",
    ...lineas(r),
    "```",
    "",
    "Si el despliegue está roto y es de `main`, la vuelta atrás es el «Instant Rollback» del panel de Vercel (skill `vercel`, sección «Vuelta atrás»). Las migraciones no se revierten.",
  ].join("\n");
}

async function main() {
  const i = process.argv.indexOf("--issue");
  const ruta = i > 0 ? process.argv[i + 1] : null;
  const r = await evaluar(process.env);
  for (const l of lineas(r)) console.log(l);
  if (!r.ok && ruta) writeFileSync(ruta, informe(r));
  process.exitCode = r.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(`[salud-despliegue] ${e.message}`); process.exit(1); });
}
