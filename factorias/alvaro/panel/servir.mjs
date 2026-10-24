/**
 * servir.mjs — el panel local de la factoría de Álvaro.
 *
 *   node factorias/alvaro/panel/servir.mjs        → http://127.0.0.1:5177
 *
 * SOLO LEE: no escribe nada (ni en ~/.claude ni en el repo ni en disco: el estado vive en memoria),
 * no hace peticiones hacia fuera, escucha solo en 127.0.0.1 y solo responde a GET. Variables: ver el README.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FUENTES, agregar, compararCopias, leerDeclarados, nuevoResumen, parsearRegistro, procesarLinea } from "./lib/leer.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";

// El mensaje de Node ya empieza por el código (ENOENT: …): no se repite. Un JSON roto no enseña su texto
// (el mensaje de Node cita trozos del fichero, que puede ser privado): solo la posición del error, si la hay.
const motivo = (e) => {
  const m = String(e?.message ?? e);
  if (e instanceof SyntaxError) {
    const pos = /position (\d+)/.exec(m)?.[1];
    return "JSON roto" + (pos ? ` cerca de la posición ${pos}` : "");
  }
  return e?.code && !m.includes(e.code) ? `${e.code}: ${m}` : m;
};

async function hashes(dir, prefijo) {
  const sal = {};
  for (const f of await readdir(dir)) {
    if ((await stat(join(dir, f))).isFile()) sal[`${prefijo}/${f}`] = createHash("sha256").update(await readFile(join(dir, f))).digest("hex");
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
  const cacheTr = new Map(); // ruta → { mtimeMs, size, valor }
  let enCurso = null;

  // Un fichero solo se vuelve a leer, entero, si cambió su fecha o su tamaño.
  async function cacheado(cache, ruta, st, leer) {
    const c = cache.get(ruta);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.valor;
    cfg.alLeer?.(ruta);
    try {
      const valor = await leer(ruta);
      cache.set(ruta, { mtimeMs: st.mtimeMs, size: st.size, valor });
      return valor;
    } catch (e) {
      cache.delete(ruta); // un fallo no deja una lectura a medias en la caché
      throw e;
    }
  }
  // Lo que ya no está en la ventana (o desapareció) se olvida
  const purgar = (cache, vistos) => cache.forEach((_, k) => vistos.has(k) || cache.delete(k));

  async function leerTranscripcion(ruta) {
    const r = nuevoResumen();
    for await (const l of createInterface({ input: crearLector(ruta), crlfDelay: Infinity })) procesarLinea(r, l);
    return r;
  }

  async function transcripciones(corte, errores) {
    const raiz = join(claude, "projects");
    const sal = [];
    const vistos = new Set();
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
          vistos.add(ruta);
          sal.push({ ruta, mtimeMs: st.mtimeMs, resumen: await cacheado(cacheTr, ruta, st, leerTranscripcion) });
        } catch (e) {
          errores.push({ fichero: ruta, motivo: motivo(e) });
        }
      }
    }
    purgar(cacheTr, vistos);
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
    const sal = []; // el registro son unos KB: se lee entero cada vez, sin caché
    for (const n of nombres.filter((x) => x.endsWith(".jsonl"))) {
      const ruta = join(dirRegistro, n);
      try {
        if ((await stat(ruta)).mtimeMs < corte) continue;
        sal.push({ rama: n.replace(/\.jsonl$/, ""), ...parsearRegistro(await readFile(ruta, "utf8")) });
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
    // Los errores se recogen por fuente: agregar() deja null lo derivado de cada fuente caída
    const [eT, eS, eC, eR] = FUENTES.map(() => []);
    const ficheros = await transcripciones(ahora - dias * 864e5, eT);
    const regs = await registros(ahora - dias * 864e5, eR);
    const decl = await declarados(eS);
    const cp = await copia(eC);
    const errores = [eT, eS, eC, eR].flatMap((lista, i) => lista.map((x) => ({ fuente: FUENTES[i], ...x })));
    const datos = agregar({ ahora, dias, ficheros, registros: regs, declarados: decl, copia: cp, home, errores });
    const mem = process.memoryUsage();
    return { generado: new Date(ahora).toISOString(), dias, lecturaMs: Date.now() - t0, proceso: { rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) }, ...datos };
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
    const ruta = req.url.split("?")[0]; // sin new URL: «GET //» o una URL rota no pueden lanzar
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
