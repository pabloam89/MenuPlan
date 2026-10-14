/**
 * La cuota de GitHub (#424, fondo #326): lo que gasta cada llamada a `gh`, cacheado
 * y contado en un solo sitio.
 *
 * Por qué: GraphQL tiene su propio cupo (5.000 puntos por hora y por identidad) y
 * el contador REST (`gh api rate_limit`) NO lo refleja. Una página de `npm run
 * issues` (100 issues con sus comentarios, hijos y PR) cuesta ~106 puntos, y con
 * ~220 issues son 3 páginas: ~320 puntos por ejecución, y la lanza el arranque de
 * cada sesión. El remedio es no pedir lo que se pidió hace poco (caché con TTL) y
 * dejar una línea contable por llamada para poder contar quién gasta.
 *
 * Todo es plan B: si la caché no se lee o no se escribe, se pide como antes.
 */
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Vocabulario cerrado de la línea `gh: caller=… api=…`. */
export const APIS_GH = ["rest", "graphql"];
export const CALLERS_GH = ["issues", "arranque", "avisos", "migraciones", "podar", "retirar", "lleva", "planos", "cumplimiento", "fabrica", "espera-ci", "cupos", "dimensionar", "situacion", "token-sesion", "otro"];

/** Minutos de vida de la caché de issues según quién pide. 0 = sin caché. */
export const TTL_MIN = { arranque: 15, listado: 10, escritura: 0 };
/** Pasado este tiempo, la caché ya no sustituye a un error: se propaga (6 h). */
export const TOPE_VIEJO_MIN = 360;

export const dirCuota = () => process.env.MENUPLAN_CUOTA_DIR || join(tmpdir(), "menuplan-cuota");

/**
 * Qué API gasta un `gh <args>`. `gh api` es REST salvo `gh api graphql`; los
 * subcomandos de alto nivel (`issue`, `pr`, `label`, `repo`…) hablan GraphQL
 * (salvo `run`, `workflow`, `secret` y `variable`, que son REST).
 */
export function apiDe(args) {
  const [a, b] = args;
  if (a === "api") return b === "graphql" ? "graphql" : "rest";
  return ["run", "workflow", "secret", "variable", "auth", "gist"].includes(a) ? "rest" : "graphql";
}

/** Quién hace la llamada (cuota propia de Pablo o de la App de las sesiones) y cómo salió. */
export const IDENTIDADES_GH = ["pablo", "app"];
export const RESULTADOS_GH = ["ok", "limitado", "error"];
/** `real` = lo dijo GitHub (`rateLimit { cost }`); `est` = la tabla de abajo; `nada` = REST, que no gasta puntos GraphQL. */
export const MEDIDAS_GH = ["real", "est", "nada"];

/**
 * Puntos estimados de una llamada GraphQL cuya respuesta no trae `rateLimit { cost }`:
 * una página completa de `issues` cuesta ~106 (#424) y las de fabrica ~5; lo demás, 1.
 */
export const PUNTOS_EST = { issues: 106, cumplimiento: 106, planos: 106, situacion: 106, fabrica: 5, otro: 1 };

/** ¿Es un error de límite de peticiones (cuota, límite secundario o `RATE_LIMITED` de GraphQL)? */
export const esLimite = (e) => /rate limit|rate_limited|abuse/i.test(String(e?.stderr ?? e?.stdout ?? e?.message ?? ""));

/**
 * Hash corto de la sesión (6 hex): el id de sesión si lo hay y, si no, la carpeta de trabajo
 * (una sesión = una carpeta). Nunca lleva rutas ni nombres, solo el hash.
 */
export function sesionCorta(env = process.env, cwd = process.cwd()) {
  const base = env.CLAUDE_SESSION_ID || env.MENUPLAN_SESION || cwd;
  return createHash("sha1").update(String(base)).digest("hex").slice(0, 6);
}

/** `app` si la llamada va con un token de instalación (ghs_…); si no, `pablo`. Solo mira el prefijo. */
export const identidadDe = (env = process.env) => (String(env.GH_TOKEN ?? env.GITHUB_TOKEN ?? "").startsWith("ghs_") ? "app" : "pablo");

/**
 * Puntos que costó la llamada y cómo se sabe: de `rateLimit { cost }` si viene en la respuesta, o estimados.
 * Una llamada que no salió bien (`resultado` distinto de `ok`) y sin coste real no suma la estimación: no
 * sabemos que gastara y inflaría la hora más cara y la comparación con `used`.
 */
export function puntosDe(caller, args, salida, resultado = "ok") {
  if (apiDe(args) === "rest") return { puntos: 0, medida: "nada" };
  const m = /"rateLimit"\s*:\s*\{[^}]*?"cost"\s*:\s*(\d+)/.exec(String(salida ?? ""));
  if (m) return { puntos: Number(m[1]), medida: "real" };
  if (resultado !== "ok") return { puntos: 0, medida: "est" };
  const consulta = args[0] === "api" && args[1] === "graphql";
  return { puntos: consulta ? (PUNTOS_EST[caller] ?? PUNTOS_EST.otro) : 1, medida: "est" };
}

const entero = (n, def) => (Number.isInteger(n) && n >= 0 && n < 1e6 ? n : def);

/**
 * La línea contable, sin datos de familias ni tokens: quién, qué API y, con `campos`, la identidad,
 * la sesión, los puntos, cómo salió y el número de intento. Sin `campos`, la forma corta de antes.
 */
export function lineaGh(caller, api, campos) {
  const c = CALLERS_GH.includes(caller) ? caller : "otro";
  const a = APIS_GH.includes(api) ? api : "graphql";
  const base = `gh: caller=${c} api=${a}`;
  if (!campos) return base;
  const i = IDENTIDADES_GH.includes(campos.identidad) ? campos.identidad : "pablo";
  const s = /^[0-9a-f]{6}$/.test(campos.sesion) ? campos.sesion : "000000";
  const m = MEDIDAS_GH.includes(campos.medida) ? campos.medida : "est";
  const r = RESULTADOS_GH.includes(campos.resultado) ? campos.resultado : "error";
  return `${base} identidad=${i} sesion=${s} puntos=${entero(campos.puntos, 0)} medida=${m} resultado=${r} intento=${entero(campos.intento, 1) || 1}`;
}

/**
 * Añade la línea al registro local (`gh.log`). Nunca rompe a quien llama. Se llama DESPUÉS de la
 * llamada para poder decir cómo salió (`resultado`) y cuántos puntos costó; sin `resultado`,
 * escribe la forma corta de antes.
 */
export function registrarGh(caller, args, { dir = dirCuota(), ahora = new Date(), env = process.env, salida, resultado, intento = 1 } = {}) {
  try {
    mkdirSync(dir, { recursive: true });
    const linea = resultado === undefined
      ? lineaGh(caller, apiDe(args))
      : lineaGh(caller, apiDe(args), { identidad: identidadDe(env), sesion: sesionCorta(env), ...puntosDe(caller, args, salida, resultado), resultado, intento });
    appendFileSync(join(dir, "gh.log"), `${ahora.toISOString()} ${linea}\n`);
  } catch {
    // a propósito: contar es una ayuda; sin disco o sin permisos, la llamada sigue
  }
}

/**
 * EL sitio donde se lanza `gh` de forma síncrona: ejecuta, registra la línea DESPUÉS (con resultado,
 * puntos e intento) y devuelve la salida o relanza el error tal cual. `ejecutar` se cambia en los tests.
 * Cada reintento de quien llama es una llamada nueva y deja su línea (`intento`).
 */
export function ghSync(caller, args, opciones = {}, { intento = 1, dir, ahora, ejecutar = (a, o) => execFileSync("gh", a, { windowsHide: true, ...o }) } = {}) {
  const env = opciones.env ?? process.env;
  let salida;
  try {
    salida = ejecutar(args, opciones);
  } catch (e) {
    registrarGh(caller, args, { dir, ahora, env, intento, resultado: esLimite(e) ? "limitado" : "error", salida: e?.stdout });
    throw e;
  }
  registrarGh(caller, args, { dir, ahora, env, intento, resultado: "ok", salida });
  return salida;
}

/** Lo mismo con `execFile` y su callback: registra al terminar y luego llama al callback de quien llama. */
export function execFileGh(caller, args, opciones, devolver, { intento = 1, dir, ahora, ejecutar = (a, o, cb) => execFile("gh", a, { windowsHide: true, ...o }, cb) } = {}) {
  const env = opciones.env ?? process.env;
  return ejecutar(args, opciones, (error, stdout, stderr) => {
    registrarGh(caller, args, { dir, ahora, env, intento, resultado: !error ? "ok" : esLimite({ stderr, stdout, message: error.message }) ? "limitado" : "error", salida: stdout });
    devolver(error, stdout, stderr);
  });
}

/** Lo mismo para una llamada asíncrona (una promesa): registra al resolverse o fallar, y devuelve la misma promesa. */
export function registrarTras(caller, args, promesa, { env = process.env, intento = 1, dir, ahora } = {}) {
  const fin = (resultado, salida) => registrarGh(caller, args, { dir, ahora, env, intento, resultado, salida });
  return Promise.resolve(promesa).then(
    (v) => { fin("ok", typeof v === "string" ? v : v?.stdout); return v; },
    (e) => { fin(esLimite(e) ? "limitado" : "error", e?.stdout); throw e; },
  );
}

/** Cuenta las líneas de un `gh.log` por caller y API. */
export function contarLog(texto) {
  const r = {};
  for (const m of String(texto).matchAll(/gh: caller=(\S+) api=(\S+)/g)) {
    const k = `${m[1]}/${m[2]}`;
    r[k] = (r[k] ?? 0) + 1;
  }
  return r;
}

/** Las líneas del log, ya leídas. Las antiguas (sin campos nuevos) salen con `sin-dato`. */
export function leerLineas(texto) {
  const out = [];
  for (const l of String(texto).split("\n")) {
    const m = /^(\S+) gh: caller=(\S+) api=(\S+)(.*)$/.exec(l);
    if (!m) continue;
    const t = Date.parse(m[1]);
    if (Number.isNaN(t)) continue;
    const campo = (k) => new RegExp(`\\b${k}=(\\S+)`).exec(m[4])?.[1];
    out.push({
      t, caller: m[2], api: m[3],
      identidad: campo("identidad") ?? "sin-dato", sesion: campo("sesion") ?? "sin-dato",
      puntos: Number(campo("puntos") ?? 0), medida: campo("medida") ?? "sin-dato",
      resultado: campo("resultado") ?? "sin-dato", intento: Number(campo("intento") ?? 1),
    });
  }
  return out;
}

/**
 * Lo que gasta cada hora (hora de Madrid, clave `AAAA-MM-DD HH`): líneas, puntos GraphQL, líneas
 * limitadas, y los puntos por origen y por sesión. `desde` (ms) acota; `zona` cambia la hora (tests).
 */
export function porHoras(texto, { desde = 0, zona = "Europe/Madrid" } = {}) {
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const horas = {};
  for (const l of leerLineas(texto)) {
    if (l.t < desde) continue;
    const h = fmt.format(new Date(l.t)).slice(0, 13);
    const o = (horas[h] ??= { lineas: 0, puntos: 0, limitadas: 0, porOrigen: {}, porSesion: {} });
    // líneas antiguas con la estimación de un fallo: no cuentan (solo el coste real)
    const gasto = l.api === "graphql" && (l.resultado === "ok" || l.medida === "real" || l.resultado === "sin-dato") ? l.puntos : 0;
    o.lineas += 1;
    o.puntos += gasto;
    if (l.resultado === "limitado") o.limitadas += 1;
    o.porOrigen[l.caller] = (o.porOrigen[l.caller] ?? 0) + gasto;
    o.porSesion[l.sesion] = (o.porSesion[l.sesion] ?? 0) + gasto;
  }
  return horas;
}

const rutaCache = (nombre, dir) => join(dir, `${nombre}.json`);

/** Lo cacheado y su edad en minutos, o null si no hay nada que valga. */
export function leerCacheGh(nombre, { dir = dirCuota(), ahora = Date.now() } = {}) {
  try {
    const ruta = rutaCache(nombre, dir);
    if (!existsSync(ruta)) return null;
    const st = statSync(ruta);
    if (!st.isFile() || st.size > 50_000_000) return null;
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    if (!datos || typeof datos !== "object" || !("valor" in datos)) return null;
    return { valor: datos.valor, minutos: (ahora - st.mtimeMs) / 60_000 };
  } catch {
    // a propósito: una caché ilegible o ausente es como no tenerla; se pide a GitHub
    return null;
  }
}

export function escribirCacheGh(nombre, valor, { dir = dirCuota() } = {}) {
  try {
    mkdirSync(dir, { recursive: true });
    const ruta = rutaCache(nombre, dir);
    const tmp = `${ruta}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ valor }));
    try {
      renameSync(tmp, ruta);
    } catch {
      // a propósito: en Windows dos procesos pueden chocar al renombrar; se tira el temporal
      try {
        unlinkSync(tmp);
      } catch {
        // a propósito: si el temporal ya no está, no hay nada que tirar
      }
    }
  } catch {
    // a propósito: sin caché se pide como antes
  }
}

export function borrarCacheGh(nombre, { dir = dirCuota() } = {}) {
  try {
    unlinkSync(rutaCache(nombre, dir));
  } catch {
    // a propósito: si no había, da igual
  }
}

/**
 * Lee con caché. `pedir()` es la llamada cara. Con `ttlMin` 0 no se lee la caché
 * (pero sí se escribe lo nuevo, para el siguiente). Si `pedir()` falla y hay algo
 * guardado, `viejoSiFalla` lo devuelve en vez de romper (cuota agotada, sin red);
 * `aviso` recibe la edad para que quien llama la cuente.
 */
export function conCache(nombre, { ttlMin, viejoSiFalla = false, pedir, aviso = () => {}, dir = dirCuota(), ahora = Date.now() }) {
  const previo = leerCacheGh(nombre, { dir, ahora });
  if (ttlMin > 0 && previo && previo.minutos < ttlMin) return previo.valor;
  try {
    const valor = pedir();
    escribirCacheGh(nombre, valor, { dir });
    return valor;
  } catch (e) {
    if (viejoSiFalla && previo && previo.minutos <= TOPE_VIEJO_MIN) {
      aviso(`caché de ${nombre} de hace ${Math.round(previo.minutos)} min (GitHub no contesta o sin cuota)`, Math.round(previo.minutos));
      return previo.valor;
    }
    throw e;
  }
}

/** Resumen de `porHoras`: la hora más cara, el percentil 95 de puntos por hora, el total y las líneas limitadas. */
export function resumenDeHoras(horas) {
  const ent = Object.entries(horas);
  const puntos = ent.map(([, h]) => h.puntos).sort((a, b) => a - b);
  const maxima = ent.reduce((m, e) => (e[1].puntos > (m?.[1].puntos ?? -1) ? e : m), null);
  return {
    horas: ent.length,
    puntos: puntos.reduce((s, p) => s + p, 0),
    limitadas: ent.reduce((s, [, h]) => s + h.limitadas, 0),
    maxima: maxima ? { hora: maxima[0], puntos: maxima[1].puntos } : null,
    p95: puntos.length ? puntos[Math.min(puntos.length - 1, Math.ceil(0.95 * puntos.length) - 1)] : 0,
  };
}

/**
 * Ráfagas de un origen: líneas seguidas con menos de `huecoS` segundos entre una y la siguiente.
 * Devuelve el tamaño de cada ráfaga con su inicio y la sesión de la primera línea (H3 de #326: ¿un lote de
 * escrituras o un bucle externo?).
 */
export function rafagas(texto, { caller = "issues", huecoS = 30 } = {}) {
  const out = [];
  let actual = null;
  for (const l of leerLineas(texto).filter((x) => x.caller === caller).sort((a, b) => a.t - b.t)) {
    if (actual && l.t - actual.fin <= huecoS * 1000) {
      actual.lineas += 1;
      actual.fin = l.t;
      actual.sesiones.add(l.sesion);
    } else {
      if (actual) out.push(actual);
      actual = { inicio: new Date(l.t).toISOString(), fin: l.t, lineas: 1, sesiones: new Set([l.sesion]) };
    }
  }
  if (actual) out.push(actual);
  return out.map(({ inicio, lineas, sesiones }) => ({ inicio, lineas, sesiones: sesiones.size }));
}
