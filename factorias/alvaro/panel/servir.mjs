/**
 * servir.mjs — el panel local de la factoría de Álvaro.
 *
 *   node factorias/alvaro/panel/servir.mjs        → http://127.0.0.1:5177
 *
 * SOLO LEE: no escribe nada (ni en ~/.claude ni en el repo ni en disco: el estado vive en memoria),
 * no hace peticiones hacia fuera, escucha solo en 127.0.0.1 y solo responde a GET.
 * Variables: PANEL_PUERTO (5177), PANEL_DIAS (7: ventana de días), FACTORIA_ALVARO_DIR (el registro de jueces).
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { agregar, compararCopias, leerDeclarados, nuevoResumen, parsearRegistro, procesarLinea } from "./lib/leer.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";

const motivo = (e) => (e && e.code ? `${e.code}: ${e.message}` : String(e?.message ?? e));

/** Lee un fichero por líneas completas desde un byte; devuelve hasta dónde llegó (la última línea sin salto de línea se deja). */
async function leerLineas(ruta, desde, alLinea, crearLector) {
  let resto = Buffer.alloc(0);
  let consumido = desde;
  for await (const trozo of crearLector(ruta, { start: desde, highWaterMark: 1 << 20 })) {
    const buf = resto.length ? Buffer.concat([resto, trozo]) : trozo;
    let ini = 0;
    for (let i = buf.indexOf(10, ini); i !== -1; i = buf.indexOf(10, ini)) {
      alLinea(buf.toString("utf8", ini, i));
      ini = i + 1;
    }
    consumido += ini;
    resto = buf.subarray(ini);
  }
  return consumido;
}

async function hashes(dir, prefijo) {
  const sal = {};
  for (const f of await readdir(dir)) {
    const st = await stat(join(dir, f));
    if (st.isFile()) sal[`${prefijo}/${f}`] = createHash("sha256").update(await readFile(join(dir, f))).digest("hex");
  }
  return sal;
}

/** cfg: { home, repoAlvaro, dias, dirRegistro, crearLector, alLeer } (todo opcional). */
export function crearRecolector(cfg = {}) {
  const home = cfg.home ?? homedir();
  const repoAlvaro = cfg.repoAlvaro ?? join(aqui, "..");
  const dias = cfg.dias ?? 7;
  const claude = join(home, ".claude");
  const dirRegistro = cfg.dirRegistro ?? join(claude, "factoria-alvaro");
  const crearLector = cfg.crearLector ?? createReadStream;
  const cacheTranscripciones = new Map(); // ruta → { mtimeMs, size, bytes, resumen }
  const cacheRegistros = new Map(); // ruta → { mtimeMs, size, registro }
  let enCurso = null;

  async function transcripcion(ruta, st, errores, contador) {
    const c = cacheTranscripciones.get(ruta);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.resumen;
    // Un fichero que solo creció (las transcripciones solo añaden líneas) se sigue leyendo desde donde se quedó.
    const sigue = c && st.size > c.size;
    const resumen = sigue ? c.resumen : nuevoResumen();
    const desde = sigue ? c.bytes : 0;
    try {
      cfg.alLeer?.(ruta, desde);
      contador.releidos++;
      const bytes = await leerLineas(ruta, desde, (l) => procesarLinea(resumen, l), crearLector);
      cacheTranscripciones.set(ruta, { mtimeMs: st.mtimeMs, size: st.size, bytes, resumen });
      return resumen;
    } catch (e) {
      cacheTranscripciones.delete(ruta); // a medias: la próxima vez se lee entero
      errores.push({ fichero: ruta, motivo: motivo(e) });
      return null;
    }
  }

  async function transcripciones(corte, errores, contador) {
    const raiz = join(claude, "projects");
    const sal = [];
    let carpetas;
    try {
      carpetas = await readdir(raiz);
    } catch (e) {
      errores.push({ fichero: raiz, motivo: motivo(e) });
      return sal;
    }
    for (const carpeta of carpetas) {
      let nombres;
      try {
        nombres = await readdir(join(raiz, carpeta));
      } catch (e) {
        if (e.code !== "ENOTDIR") errores.push({ fichero: join(raiz, carpeta), motivo: motivo(e) });
        continue;
      }
      for (const n of nombres.filter((x) => x.endsWith(".jsonl"))) {
        const ruta = join(raiz, carpeta, n);
        try {
          const st = await stat(ruta);
          if (st.mtimeMs < corte) continue;
          contador.total++;
          const resumen = await transcripcion(ruta, st, errores, contador);
          if (resumen) sal.push({ ruta, mtimeMs: st.mtimeMs, resumen });
        } catch (e) {
          errores.push({ fichero: ruta, motivo: motivo(e) });
        }
      }
    }
    return sal;
  }

  async function registros(corte, errores) {
    let nombres;
    try {
      nombres = await readdir(dirRegistro);
    } catch (e) {
      if (e.code !== "ENOENT") errores.push({ fichero: dirRegistro, motivo: motivo(e) });
      return []; // sin carpeta de registro todavía: no es un fallo
    }
    const sal = [];
    for (const n of nombres.filter((x) => x.endsWith(".jsonl"))) {
      const ruta = join(dirRegistro, n);
      try {
        const st = await stat(ruta);
        if (st.mtimeMs < corte) continue;
        let c = cacheRegistros.get(ruta);
        if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
          c = { mtimeMs: st.mtimeMs, size: st.size, registro: parsearRegistro(await readFile(ruta, "utf8")) };
          cacheRegistros.set(ruta, c);
        }
        sal.push({ rama: n.replace(/\.jsonl$/, ""), ...c.registro });
      } catch (e) {
        errores.push({ fichero: ruta, motivo: motivo(e) });
      }
    }
    return sal;
  }

  async function declarados(errores) {
    const ruta = join(claude, "settings.json");
    try {
      return leerDeclarados(await readFile(ruta, "utf8")); // solo la clave hooks
    } catch (e) {
      errores.push({ fichero: ruta, motivo: motivo(e) });
      return null;
    }
  }

  async function copia(errores) {
    const carpeta = async (base, nombre) => {
      try {
        return { ...(await hashes(join(base, "hooks"), "hooks")), ...(await hashes(join(base, "lib"), "lib")) };
      } catch (e) {
        if (e.code === "ENOENT" && nombre === "instalada") return {}; // sin copia instalada: salen como «faltan»
        errores.push({ fichero: base, motivo: motivo(e) });
        return null;
      }
    };
    const inst = await carpeta(join(claude, "factoria"), "instalada");
    const repo = await carpeta(repoAlvaro, "repo");
    if (inst === null || repo === null) return { ok: null, difieren: [], faltanInstalada: [], sobranInstalada: [] }; // no se pudo comparar: ni verde ni se da por bueno
    return compararCopias(inst, repo);
  }

  async function hacer(ahora) {
    const t0 = Date.now();
    const errores = [];
    const contador = { total: 0, releidos: 0 };
    const ficheros = await transcripciones(ahora - dias * 864e5, errores, contador);
    const regs = await registros(ahora - dias * 864e5, errores);
    const decl = await declarados(errores);
    const cp = await copia(errores);
    const datos = agregar({ ahora, dias, ficheros, registros: regs, declarados: decl, copia: cp, home, errores });
    const mem = process.memoryUsage();
    return { generado: new Date(ahora).toISOString(), dias, lecturaMs: Date.now() - t0, ficheros: { total: contador.total, releidos: contador.releidos, enCache: contador.total - contador.releidos }, proceso: { rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) }, ...datos };
  }

  // Dos peticiones a la vez comparten una sola lectura
  return { recoger: (ahora = Date.now()) => (enCurso ??= hacer(ahora).finally(() => (enCurso = null))) };
}

const HOST_VALIDO = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;

export function crearServidor(cfg = {}) {
  const rec = crearRecolector(cfg);
  const cabeceras = (tipo) => ({
    "Content-Type": tipo,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
  });
  return createServer(async (req, res) => {
    const fin = (estado, tipo, cuerpo, extra = {}) => {
      res.writeHead(estado, { ...cabeceras(tipo), ...extra });
      res.end(cuerpo);
    };
    // Un Host de fuera (DNS rebinding: una web que apunta su nombre a 127.0.0.1) no puede leer el panel.
    if (!HOST_VALIDO.test(req.headers.host ?? "")) return fin(403, "text/plain; charset=utf-8", "Host no permitido");
    if (req.method !== "GET") return fin(405, "text/plain; charset=utf-8", "Solo GET", { Allow: "GET" });
    const ruta = new URL(req.url, "http://panel.local").pathname;
    try {
      if (ruta === "/" || ruta === "/index.html") return fin(200, "text/html; charset=utf-8", readFileSync(join(aqui, "panel.html")));
      if (ruta === "/datos.json") return fin(200, "application/json; charset=utf-8", JSON.stringify(await rec.recoger()));
    } catch (e) {
      return fin(500, "application/json; charset=utf-8", JSON.stringify({ errores: [{ fichero: "(el propio panel)", motivo: motivo(e) }] }));
    }
    return fin(404, "text/plain; charset=utf-8", "No existe");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.env.PANEL_PUERTO ?? 5177);
  const dias = Number(process.env.PANEL_DIAS ?? 7);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535 || !(dias > 0)) {
    console.error("PANEL_PUERTO tiene que ser un puerto (1-65535) y PANEL_DIAS un número de días mayor que 0.");
    process.exit(1);
  }
  const srv = crearServidor({ dias, dirRegistro: process.env.FACTORIA_ALVARO_DIR || undefined });
  srv.on("error", (e) => {
    console.error(e.code === "EADDRINUSE" ? `El puerto ${puerto} está ocupado: prueba con PANEL_PUERTO=<otro>.` : `No se pudo arrancar: ${e.message}`);
    process.exit(1);
  });
  srv.listen(puerto, HOST, () => console.log(`Panel de la factoría en http://${HOST}:${puerto} (solo lee; Ctrl+C para parar)`));
}
