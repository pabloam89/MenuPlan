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
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Vocabulario cerrado de la línea `gh: caller=… api=…`. */
export const APIS_GH = ["rest", "graphql"];
export const CALLERS_GH = ["issues", "arranque", "avisos", "migraciones", "podar", "retirar", "lleva", "planos", "cumplimiento", "fabrica", "espera-ci", "otro"];

/** Minutos de vida de la caché de issues según quién pide. 0 = siempre fresco. */
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

/** La línea contable, sin datos de familias ni tokens: solo quién y qué API. */
export function lineaGh(caller, api) {
  const c = CALLERS_GH.includes(caller) ? caller : "otro";
  const a = APIS_GH.includes(api) ? api : "graphql";
  return `gh: caller=${c} api=${a}`;
}

/** Añade la línea al registro local (`gh.log`). Nunca rompe a quien llama. */
export function registrarGh(caller, args, { dir = dirCuota(), ahora = new Date() } = {}) {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "gh.log"), `${ahora.toISOString()} ${lineaGh(caller, apiDe(args))}\n`);
  } catch {
    // a propósito: contar es una ayuda; sin disco o sin permisos, la llamada sigue
  }
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
      try { unlinkSync(tmp); } catch { /* ya no está */ }
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
