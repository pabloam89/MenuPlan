import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { agentesDe } from "./agentes.mjs";
import { leerBibliotecas, leerBloques, problemasDeBibliotecas } from "./bibliotecasDiseno.mjs";
import { camposRefrescables, compararFicha, lineasDeInforme, medirGithub, medirNpm, origenesDe, rangoDeReact, refrescarPool, repoDeNpm } from "./bibliotecasRefresco.mjs";
import { leerTaxonomia } from "./taxonomiaDiseno.mjs";

/**
 * El refresco del pool (#792): relee GitHub y npm y calcula qué datos medibles cambiaron. Sin red: `leer` es una función
 * que devuelve muestras guardadas de `ops/diseno/muestras-refresco/` (la forma real de las respuestas, recortadas).
 *
 *  1. el rango de React de npm pasa a la forma de la ficha (desde y hasta);
 *  2. de qué paquete y repositorio se lee cada ficha sale de ella misma;
 *  3. un refresco solo cambia campos de la lista de medibles: lo demás (accesibilidad, cobertura, nivel gratuito, plataforma,
 *     mantenimiento, vínculo…) queda idéntico aunque las fuentes digan otra cosa, y un `unverified` no se rellena;
 *  4. una ficha que cambia lleva `comprobada` = hoy y el pool resultante sigue pasando el test del pool;
 *  5. archivada, sin push en un año y licencia que cambia son avisos, no escrituras;
 *  6. una lectura que falla deja la ficha como estaba y se cuenta como error.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const muestra = (n) => JSON.parse(readFileSync(join(RAIZ, "ops/diseno/muestras-refresco", `${n}.json`), "utf8"));
const HOY = new Date("2026-10-21T10:00:00Z");
/** Los únicos caminos de una ficha que el refresco puede escribir (más `comprobada`, que va con ellos). */
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
    expect(a.comprobada).toBe("2026-10-21");
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
    const problemas = problemasDeBibliotecas(datos, leerTaxonomia(RAIZ), Object.keys(agentesDe(RAIZ)), leerBloques(RAIZ));
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
      delete c.version; delete c.ultimo_push; delete c.comprobada; delete c.react; delete c.licencia.spdx; delete c.peso.dependencias;
      return c;
    };
    for (const f of datos.bibliotecas) {
      const antes = pool.bibliotecas.find((x) => x.id === f.id);
      expect(sinMedibles(f), f.id).toEqual(sinMedibles(antes));
      // Y los que sí cambian solo cambian en la lista de medibles: un unverified o not-applicable nunca se rellena.
      for (const [k, ruta] of [["version", ["version"]], ["dependencias", ["peso", "dependencias"]], ["ultimo_push", ["ultimo_push"]], ["spdx", ["licencia", "spdx"]]]) {
        const v = ruta.reduce((o, p) => o[p], antes);
        if (v === "unverified" || v === "not-applicable") expect(ruta.reduce((o, p) => o[p], f), `${f.id}.${k}`).toBe(v);
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

describe("el script", () => {
  it("escribe solo con --escribir", () => {
    const src = readFileSync(join(RAIZ, "scripts/diseno/bibliotecas-refresco.mjs"), "utf8");
    expect(src).toMatch(/if \(escribir && hayCambios\) \{\s*writeFileSync/);
    expect(src.match(/writeFileSync\(/g)).toHaveLength(1);
  });
});
