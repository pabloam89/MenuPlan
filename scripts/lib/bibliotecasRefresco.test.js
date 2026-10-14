import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { NO_APLICA, RUTA_BIBLIOTECAS, SIN_COMPROBAR, leerBibliotecas, leerBloques, problemasDeBibliotecas } from "./bibliotecasDiseno.mjs";
import { camposRefrescables, compararFicha, errorDeLectura, lineasDeInforme, medirGithub, medirNpm, origenesDe, rangoDeReact, refrescarPool, repoDeNpm } from "./bibliotecasRefresco.mjs";
import { leerTaxonomia } from "./taxonomiaDiseno.mjs";

/**
 * El refresco del pool (#792): relee GitHub y npm y calcula qué datos medibles cambiaron. Sin red: `leer` es una función
 * que devuelve muestras guardadas de `ops/diseno/muestras-refresco/` (la forma real de las respuestas, recortadas).
 *
 *  1. el rango de React de npm pasa a la forma de la ficha (desde y hasta);
 *  2. de qué paquete y repositorio se lee cada ficha sale de ella misma;
 *  3. un refresco solo cambia campos de la lista de medibles: lo demás (accesibilidad, cobertura, nivel gratuito, plataforma,
 *     mantenimiento, vínculo…) queda idéntico aunque las fuentes digan otra cosa, y un `unverified` no se rellena;
 *  4. una ficha que cambia lleva `medida` = hoy, `comprobada` (lo investigado a mano) no se toca (#814), y el pool
 *     resultante sigue pasando el test del pool;
 *  5. archivada, sin push en un año y licencia que cambia son avisos, no escrituras;
 *  6. una lectura que falla deja la ficha como estaba y se cuenta como error; el límite de tasa se distingue de otro 403;
 *  7. (#814) un rango de React con `<`, un guion de intervalo o varios comparadores no se traduce: null y aviso de revisar a mano;
 *  8. (#814) el script, lanzado de verdad sobre una copia del pool en una carpeta temporal y con un fetch de muestras:
 *     escribe solo con --escribir, pide timeout a cada lectura y sale con código distinto de 0 si hubo errores, escriba o no.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const muestra = (n) => JSON.parse(readFileSync(join(RAIZ, "ops/diseno/muestras-refresco", `${n}.json`), "utf8"));
const HOY = new Date("2026-10-21T10:00:00Z");
/** Los únicos caminos de una ficha que el refresco puede escribir (más `medida`, que va con ellos). */
const MEDIBLES = ["version", "peso.dependencias", "licencia.spdx", "react", "ultimo_push"];
const camino = (ruta) => ruta.join(".");

const pool = leerBibliotecas(RAIZ);
const patrones = pool.lectura.patron_de_url;
const ficha = (id) => structuredClone(pool.bibliotecas.find((f) => f.id === id));

/** `leer` con muestras por URL; cualquier otra URL falla como un 404. */
const lector = (mapa) => async (url) => {
  if (!(url in mapa)) throw new Error("404 Not Found");
  return mapa[url];
};
const URL_NPM = (p) => patrones.npm.replace("<paquete>", p);
const URL_GH = (r) => patrones.github.replace("<repo>", r);

describe("rangoDeReact", () => {
  it.each([
    ["^16.8.0 || ^17.0.0-rc.1 || ^18.0.0 || ^19.0.0-rc.1", { desde: "16.8", hasta: "19" }],
    ["^19.2.0", { desde: "19.2", hasta: "19" }],
    [">=18", { desde: "18", hasta: null }],
    ["^17.0.0 || >=18.0.0", { desde: "17", hasta: null }],
    ["~18.2.0", { desde: "18.2", hasta: "18" }],
    ["*", null],
    // Dos comparadores, intervalo con guion o tope con <: el tope no se adivina (#814).
    [">=16 <19", null],
    [">=16.8.0 <19.0.0 || ^19.0.0", null],
    ["16.8.0 - 18", null],
    ["<19", null],
    // El guion de una versión previa no es un intervalo, y el espacio tras el comparador no es otro comparador.
    ["^18.0.0-rc.0", { desde: "18", hasta: "18" }],
    [">= 18", { desde: "18", hasta: null }],
    ["", null],
    [undefined, null],
  ])("%s", (rango, esperado) => expect(rangoDeReact(rango)).toEqual(esperado));
});

describe("origenes", () => {
  it("el paquete sale de la URL de npm (con scope) y el repo de la de GitHub", () => {
    expect(origenesDe(ficha("base-ui"), patrones)).toEqual({ paquete: "@base-ui/react", repo: null });
    expect(origenesDe(ficha("pico-css"), patrones)).toEqual({ paquete: null, repo: "picocss/pico" });
    expect(origenesDe(ficha("nucleo"), patrones)).toEqual({ paquete: null, repo: null });
  });
  it("el repositorio de npm, en sus formas habituales", () => {
    expect(repoDeNpm(muestra("npm-react-aria-components"))).toBe("adobe/react-spectrum");
    expect(repoDeNpm(muestra("npm-chakra-ui"))).toBe("chakra-ui/chakra-ui");
    expect(repoDeNpm({ repository: { url: "https://gitlab.com/a/b.git" } })).toBeNull();
    expect(repoDeNpm({})).toBeNull();
  });
  it("las cifras: cada ficha refresca los campos que ya traen dato y tienen de dónde leerse", () => {
    expect(camposRefrescables(ficha("react-aria-components"), patrones)).toBe(6);
    expect(camposRefrescables(ficha("nucleo"), patrones)).toBe(0);
    expect(camposRefrescables(ficha("web-awesome"), patrones)).toBe(0);
    expect(camposRefrescables(ficha("pico-css"), patrones)).toBe(2);
  });
});

describe("medir", () => {
  it("npm: versión, licencia (cadena u objeto), dependencias y React", () => {
    expect(medirNpm(muestra("npm-mantine"))).toMatchObject({ version: "9.7.2", spdx: "MIT", dependencias: 5, react: { desde: "19.2", hasta: "19" } });
    expect(medirNpm(muestra("npm-chakra-ui")).spdx).toBe("MIT");
    expect(medirNpm(muestra("npm-sin-peer"))).toMatchObject({ react: null, dependencias: 0 });
  });
  it("GitHub: fecha del push, archivada y SPDX (NOASSERTION no es un dato)", () => {
    expect(medirGithub(muestra("github-activo"))).toEqual({ archivada: false, ultimo_push: "2026-10-20", spdx: "Apache-2.0" });
    expect(medirGithub(muestra("github-archivado")).archivada).toBe(true);
    expect(medirGithub(muestra("github-inactivo")).spdx).toBeNull();
  });
});

describe("refrescarPool", () => {
  const leer = lector({
    [URL_NPM("react-aria-components")]: muestra("npm-react-aria-components"),
    [URL_GH("adobe/react-spectrum")]: muestra("github-activo"),
    [URL_NPM("@mantine/core")]: muestra("npm-mantine"),
    [URL_GH("mantinedev/mantine")]: { archived: false, pushed_at: "2026-10-11T00:00:00Z", license: { spdx_id: "MIT" } },
  });

  it("cambia lo medido y pone la fecha; lo que no cambió queda igual", async () => {
    const { datos, informe } = await refrescarPool(pool, leer, HOY);
    const a = datos.bibliotecas.find((f) => f.id === "react-aria-components");
    expect(a.version).toBe("1.23.0");
    expect(a.peso.dependencias).toBe(9);
    expect(a.ultimo_push).toBe("2026-10-20");
    expect(a.react).toEqual({ estado: "declared", desde: "16.8", hasta: "19" });
    expect(a.medida).toBe("2026-10-21");
    // Lo investigado a mano no se renueva por medir: su caducidad sigue contando desde la investigación.
    expect(a.comprobada).toBe(pool.bibliotecas.find((f) => f.id === "react-aria-components").comprobada);
    expect(informe.find((e) => e.id === "react-aria-components").cambios.map((c) => c.campo).sort()).toEqual(["peso.dependencias", "ultimo_push", "version"]);
    // Mantine no cambió nada: ni siquiera la fecha.
    expect(datos.bibliotecas.find((f) => f.id === "mantine")).toEqual(pool.bibliotecas.find((f) => f.id === "mantine"));
  });

  it("no modifica el pool que recibe", async () => {
    const antes = JSON.stringify(pool);
    await refrescarPool(pool, leer, HOY);
    expect(JSON.stringify(pool)).toBe(antes);
  });

  it("una lectura que falla deja la ficha y se cuenta como error", async () => {
    const { datos, informe } = await refrescarPool(pool, leer, HOY);
    const e = informe.find((x) => x.id === "base-ui");
    expect(e.errores).toEqual(["npm @base-ui/react: 404 Not Found"]);
    expect(datos.bibliotecas.find((f) => f.id === "base-ui")).toEqual(pool.bibliotecas.find((f) => f.id === "base-ui"));
  });

  it("el pool resultante sigue pasando el test del pool", async () => {
    const { datos } = await refrescarPool(pool, leer, HOY);
    const problemas = problemasDeBibliotecas(datos, leerTaxonomia(RAIZ), [...new Set(pool.bibliotecas.map((f) => f.dueno))], leerBloques(RAIZ));
    expect(problemas).toEqual([]);
  });

  it("nunca pisa un campo no medible, aunque las fuentes digan otra cosa", async () => {
    // Todas las fuentes devuelven datos distintos de los del pool y una licencia rara.
    const raro = async (url) => (url.startsWith("https://registry.npmjs.org/")
      ? { version: "9.9.9", license: "GPL-3.0", dependencies: { x: "1" }, peerDependencies: { react: ">=20" }, repository: "github:o/r" }
      : { archived: true, pushed_at: "2020-01-01T00:00:00Z", license: { spdx_id: "GPL-3.0" } });
    const { datos } = await refrescarPool(pool, raro, HOY);
    const sinMedibles = (f) => {
      const c = structuredClone(f);
      delete c.version; delete c.ultimo_push; delete c.medida; delete c.react; delete c.licencia.spdx; delete c.peso.dependencias;
      return c;
    };
    for (const f of datos.bibliotecas) {
      const antes = pool.bibliotecas.find((x) => x.id === f.id);
      expect(sinMedibles(f), f.id).toEqual(sinMedibles(antes));
      // Y los que sí cambian solo cambian en la lista de medibles: un unverified o not-applicable nunca se rellena.
      for (const [k, ruta] of [["version", ["version"]], ["dependencias", ["peso", "dependencias"]], ["ultimo_push", ["ultimo_push"]], ["spdx", ["licencia", "spdx"]]]) {
        const v = ruta.reduce((o, p) => o[p], antes);
        if (v === SIN_COMPROBAR || v === NO_APLICA) expect(ruta.reduce((o, p) => o[p], f), `${f.id}.${k}`).toBe(v);
      }
      if (antes.react.estado !== "declared" && antes.react.estado !== "undeclared") expect(f.react, f.id).toEqual(antes.react);
    }
  });

  it("el informe cuenta cambios, avisos y errores en líneas campo: valor", async () => {
    const { informe } = await refrescarPool(pool, leer, HOY);
    const l = lineasDeInforme(informe);
    expect(l).toContain('cambio: react-aria-components campo: version antes: "1.22.1" despues: "1.23.0"');
    expect(l).toContain("fichas: 22");
    expect(l.find((x) => x.startsWith("campos_refrescables: "))).toMatch(/^campos_refrescables: \d+$/);
  });
});

describe("avisos y cambios de la ficha", () => {
  it("una archivada que la ficha no dice es un aviso, no un cambio de mantenimiento", () => {
    const f = ficha("pico-css");
    f.mantenimiento = "active";
    f.vinculo = "candidate";
    const { cambios, avisos } = compararFicha(f, null, medirGithub(muestra("github-archivado")), HOY);
    expect(cambios).toEqual([]);
    expect(avisos).toEqual(["archivada en GitHub y la ficha no lo dice: pasar a retired con mantenimiento archived"]);
  });
  it("sin push en un año y la ficha dice active: aviso de idle", () => {
    const f = ficha("cmdk");
    f.mantenimiento = "active";
    const { avisos } = compararFicha(f, null, medirGithub(muestra("github-inactivo")), HOY);
    expect(avisos.some((a) => /sin push en \d+ días.*valorar idle/.test(a))).toBe(true);
    expect(compararFicha(ficha("cmdk"), null, medirGithub(muestra("github-inactivo")), HOY).avisos).toEqual([]);
  });
  it("un cambio de licencia se escribe y avisa de revisar el alcance", () => {
    const { cambios, avisos } = compararFicha(ficha("daisyui"), medirNpm(muestra("npm-sin-peer")), null, HOY);
    expect(cambios.find((c) => c.campo === "licencia.spdx")).toMatchObject({ antes: "MIT", despues: "GPL-3.0" });
    expect(avisos[0]).toMatch(/revisar alcance y permite/);
  });
  it("un rango de React que no se entiende no cambia la ficha y pide revisarla a mano", () => {
    const raro = { ...medirNpm(muestra("npm-mantine")), ...medirNpm({ peerDependencies: { react: ">=16 <19" } }) };
    const aviso = "rango de React «>=16 <19» en npm sin traducir: revisar react a mano";
    const { cambios, avisos } = compararFicha(ficha("react-aria-components"), raro, null, HOY);
    expect(cambios.filter((c) => c.campo.startsWith("react"))).toEqual([]);
    expect(avisos).toContain(aviso);
    expect(compararFicha(ficha("konsta"), raro, null, HOY).avisos).toContain(aviso);
  });
  it("una ficha con React sin declarar que npm ya declara pasa a declared", () => {
    const { cambios } = compararFicha(ficha("konsta"), { ...medirNpm(muestra("npm-mantine")) }, null, HOY);
    expect(cambios.find((c) => c.campo === "react")).toMatchObject({ despues: { estado: "declared", desde: "19.2", hasta: "19" } });
  });
  it("la cobertura comprobada y los campos de juicio no están entre los medibles", () => {
    const { cambios } = compararFicha(ficha("base-ui"), medirNpm(muestra("npm-mantine")), medirGithub(muestra("github-activo")), HOY);
    for (const c of cambios) expect(MEDIBLES, c.campo).toContain(c.campo.startsWith("react") ? "react" : c.campo);
    expect(camino(["peso", "podable"])).not.toBe(camino(["peso", "dependencias"]));
  });
});

describe("el error de una lectura", () => {
  const h = (o) => new Headers(o);
  it("403 o 429 con x-ratelimit-remaining 0 (o retry-after) es el límite de tasa; un 403 sin eso, no", () => {
    expect(errorDeLectura(403, "Forbidden", h({ "x-ratelimit-remaining": "0" }))).toEqual({ limite: true, mensaje: "límite de tasa: 403 x-ratelimit-remaining 0" });
    expect(errorDeLectura(429, "Too Many Requests", h({ "retry-after": "60" }))).toEqual({ limite: true, mensaje: "límite de tasa: 429 retry-after 60" });
    expect(errorDeLectura(403, "Forbidden", h({ "x-ratelimit-remaining": "12" }))).toEqual({ limite: false, mensaje: "403 Forbidden" });
    expect(errorDeLectura(404, "Not Found", h({ "x-ratelimit-remaining": "0" }))).toEqual({ limite: false, mensaje: "404 Not Found" });
    expect(errorDeLectura(500, "", null)).toEqual({ limite: false, mensaje: "500" });
  });
});

describe("el script, lanzado sobre una copia del pool", () => {
  const SCRIPT = join(RAIZ, "scripts/diseno/bibliotecas-refresco.mjs");
  /** Cambia fetch por las muestras de `muestras.json` (por URL: `{estado, texto, cabeceras, cuerpo}`); lo demás, 404. Sin señal, falla. */
  const STUB = [
    'import { readFileSync } from "node:fs";',
    'const muestras = JSON.parse(readFileSync(process.env.REFRESCO_MUESTRAS, "utf8"));',
    "globalThis.fetch = async (url, init) => {",
    '  if (!(init?.signal instanceof AbortSignal)) throw new Error("lectura sin timeout");',
    "  const m = muestras[url];",
    '  if (!m) return new Response("{}", { status: 404, statusText: "Not Found" });',
    '  return new Response(JSON.stringify(m.cuerpo ?? {}), { status: m.estado ?? 200, statusText: m.texto ?? "OK", headers: m.cabeceras ?? {} });',
    "};",
  ].join("\n");
  const ARIA = "react-aria-components";
  let dir = null;
  const prepara = (soloAria, muestras) => {
    dir = mkdtempSync(join(tmpdir(), "refresco-pool-"));
    mkdirSync(join(dir, "ops", "diseno"), { recursive: true });
    const datos = structuredClone(pool);
    if (soloAria) datos.bibliotecas = datos.bibliotecas.filter((f) => f.id === ARIA);
    writeFileSync(join(dir, RUTA_BIBLIOTECAS), `${JSON.stringify(datos, null, 2)}\n`);
    writeFileSync(join(dir, "muestras.json"), JSON.stringify(muestras));
    writeFileSync(join(dir, "stub.mjs"), STUB);
  };
  const lanza = (...args) => {
    const env = { ...process.env, REFRESCO_MUESTRAS: join(dir, "muestras.json") };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    const r = spawnSync(process.execPath, ["--import", pathToFileURL(join(dir, "stub.mjs")).href, SCRIPT, "--raiz", dir, ...args], { encoding: "utf8", env, timeout: 60_000 });
    return { codigo: r.status, salida: r.stdout, err: r.stderr, texto: readFileSync(join(dir, RUTA_BIBLIOTECAS), "utf8") };
  };
  const aria = (texto) => JSON.parse(texto).bibliotecas.find((f) => f.id === ARIA);
  const BIEN = { [URL_NPM(ARIA)]: { cuerpo: muestra("npm-react-aria-components") }, [URL_GH("adobe/react-spectrum")]: { cuerpo: muestra("github-activo") } };
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it("sin --escribir no toca el fichero; con --escribir guarda medida y no comprobada; sin errores sale con 0", () => {
    prepara(true, BIEN);
    const antes = readFileSync(join(dir, RUTA_BIBLIOTECAS), "utf8");
    const ensayo = lanza();
    expect(ensayo.err).toBe("");
    expect(ensayo.salida).toContain('cambio: react-aria-components campo: version antes: "1.22.1" despues: "1.23.0"');
    expect(ensayo.salida).toContain("errores: 0");
    expect(ensayo.codigo).toBe(0);
    expect(ensayo.texto).toBe(antes);
    const escrito = lanza("--escribir");
    expect(escrito.codigo).toBe(0);
    expect(aria(escrito.texto)).toMatchObject({ version: "1.23.0", medida: new Date().toISOString().slice(0, 10), comprobada: aria(antes).comprobada });
  });

  it("con errores sale con código distinto de 0, también con --escribir (y guarda lo que sí leyó)", () => {
    prepara(false, BIEN);
    const ensayo = lanza();
    expect(ensayo.salida).toContain("error: base-ui npm @base-ui/react: 404 Not Found");
    expect(ensayo.codigo).toBe(1);
    const escrito = lanza("--escribir");
    expect(escrito.codigo).toBe(1);
    expect(aria(escrito.texto).version).toBe("1.23.0");
  });

  it("el límite de tasa de GitHub sale como tal y no se insiste en GitHub", () => {
    prepara(false, { ...BIEN, [URL_GH("adobe/react-spectrum")]: { estado: 403, texto: "Forbidden", cabeceras: { "x-ratelimit-remaining": "0" } } });
    const r = lanza();
    expect(r.salida).toContain("error: react-aria-components github adobe/react-spectrum: límite de tasa: 403 x-ratelimit-remaining 0");
    expect(r.salida).toMatch(/github [^ ]+: límite de tasa agotado, no se lee/);
    expect(r.codigo).toBe(1);
  });
});
