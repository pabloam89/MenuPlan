/**
 * ghApi.mjs — cliente mínimo de la API REST de GitHub para los controles del
 * CI y de los workflows (casos-pr, fondos-pr, fondos-evento).
 *
 * Una sola pieza para tres scripts: el reintento y el «falla cerrado» no se
 * copian. Sin dependencias; `fetchFn` y `espera` se inyectan para probarlo sin red.
 *
 * - GET: reintenta fallos pasajeros (red, 5xx, 403/429 de límite) con espera
 *   creciente. 404 → null. 401 → no se reintenta: el token no vale.
 * - Escrituras (POST/PATCH/PUT/DELETE): UN intento, salvo `reintentos` explícito.
 *   Repetir un POST de comentario a ciegas lo duplicaría.
 * - Todo lo demás lanza ErrorDeApi con la causa: quien llama FALLA con ella en
 *   vez de dejar pasar lo que debía vigilar.
 */

/** Error de la API (no del contenido que se vigila): el mensaje dice la causa. */
export class ErrorDeApi extends Error {
  /** `permisos`: 401, el token no sirve; relanzar no lo arregla. */
  constructor(mensaje, { permisos = false } = {}) {
    super(mensaje);
    this.permisos = permisos;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Una petición. Devuelve el JSON (o null en 204 o 404 si `nulo404`).
 * `cuerpo` se manda como JSON.
 */
export async function pedir({
  token, repo, ruta, metodo = "GET", cuerpo, fetchFn = globalThis.fetch, espera = dormir, intentos, nulo404 = true,
}) {
  // Una URL absoluta solo si es de la API de GitHub: el token no sale a ningún otro sitio.
  if (/^[a-z][a-z0-9+.-]*:/i.test(ruta) && !ruta.startsWith("https://api.github.com/")) throw new Error("ghApi: URL fuera de https://api.github.com/");
  const url = ruta.startsWith("https://") ? ruta : `https://api.github.com/repos/${repo}${ruta}`;
  const max = intentos ?? (metodo === "GET" ? 3 : 1);
  let causa = "";
  let permisos = false;
  for (let i = 1; i <= max; i++) {
    try {
      const r = await fetchFn(url, {
        method: metodo,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.status === 404 && nulo404) return null;
      if (r.status === 204) return null;
      if (r.ok) return await r.json();
      causa = `HTTP ${r.status}`;
      if (r.status === 401) {
        permisos = true; // el token no vale: reintentar no lo arregla
        break;
      }
      // Un 4xx que no es de límite (403/429) no mejora al repetirlo.
      if (r.status >= 400 && r.status < 500 && r.status !== 403 && r.status !== 429) break;
    } catch (e) {
      causa = e?.message ?? String(e);
    }
    if (i < max) await espera(1000 * i);
  }
  throw new ErrorDeApi(`${metodo} ${ruta.replace(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+/, "")}: ${causa}`, { permisos });
}

/** Todas las páginas de una lista (con tope: un repo no debe agotar el límite del token). */
export async function pedirPaginas(opciones, { porPagina = 100, maxPaginas = 5 } = {}) {
  const out = [];
  const sep = opciones.ruta.includes("?") ? "&" : "?";
  for (let p = 1; p <= maxPaginas; p++) {
    const pagina = await pedir({ ...opciones, ruta: `${opciones.ruta}${sep}per_page=${porPagina}&page=${p}` });
    if (!Array.isArray(pagina)) break;
    out.push(...pagina);
    if (pagina.length < porPagina) break;
  }
  return out;
}
