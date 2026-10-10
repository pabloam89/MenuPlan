import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLASES, DRIVERS, GENERADOS, casaRuta, comandosDeEscribir, configDrivers, driversQueFaltan, instalarDrivers, lineasGitattributes, mezclarJson,
} from "../scripts/lib/generados.mjs";
import { anclarCapas, generarMd, leerCapas, leerForja } from "../scripts/lib/forja.mjs";
import { RUTA_PLANTILLA_COMUN, generarPlantillas, rutaPlantilla } from "../scripts/lib/plantillasSkill.mjs";
import { nombreDeFichero } from "../scripts/lib/catalogos.mjs";

/**
 * Lo generado y guardado en el repo no choca entre ramas (#551, fondo #504):
 *  1. el registro de scripts/lib/generados.mjs y `.gitattributes` dicen lo mismo, y todo documento
 *     con cabecera «Generado desde … No se edita a mano» está en el registro;
 *  2. la fusión por claves de las anclas JSON;
 *  3. con git de verdad: dos ramas que añaden un criterio cada una a la forja chocan en FORJA.md,
 *     los moldes y ops/forja-capas.json sin los drivers, y no con ellos; y lo que queda desfasado
 *     (FORJA.md se queda con tu versión) lo dice la comparación del test «está al día».
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: "pipe" });
const tracked = git(RAIZ, "ls-files").split("\n").filter(Boolean);
const gitattributes = readFileSync(join(RAIZ, ".gitattributes"), "utf8").split(/\r?\n/).map((l) => l.trim());

describe("el registro de lo generado", () => {
  it("`.gitattributes` lleva una línea por generado, con el driver de su clase", () => {
    const faltan = lineasGitattributes().filter((l) => !gitattributes.includes(l));
    expect(faltan, "Añade estas líneas a .gitattributes (las da lineasGitattributes de scripts/lib/generados.mjs)").toEqual([]);
  });

  it("y ninguna línea de `.gitattributes` usa un driver de lo generado sin estar en el registro", () => {
    const drivers = Object.keys(DRIVERS);
    const sueltas = gitattributes.filter((l) => drivers.some((d) => l.endsWith(` merge=${d}`)) && !lineasGitattributes().includes(l));
    expect(sueltas, "Da de alta el fichero en GENERADOS de scripts/lib/generados.mjs o quita la línea").toEqual([]);
  });

  it("cada entrada existe en git, con su script y su test", () => {
    const malos = [];
    for (const g of GENERADOS) {
      if (!(g.clase in CLASES)) malos.push(`${g.ruta}: clase desconocida ${g.clase}`);
      if (!tracked.some((f) => casaRuta(g.ruta, f))) malos.push(`${g.ruta}: ningún fichero de git casa`);
      if (!existsSync(join(RAIZ, g.regenera))) malos.push(`${g.ruta}: no existe ${g.regenera}`);
      if (!existsSync(join(RAIZ, g.test))) malos.push(`${g.ruta}: no existe ${g.test}`);
    }
    expect(malos).toEqual([]);
  });

  it("todo documento con cabecera «Generado desde … No se edita a mano» está en el registro como documento", () => {
    const documentos = GENERADOS.filter((g) => g.clase === "documento");
    const sinRegistro = tracked.filter((f) => /\.md$/.test(f) && existsSync(join(RAIZ, f)))
      .filter((f) => /^<!-- Generado desde .*No se edita a mano/m.test(readFileSync(join(RAIZ, f), "utf8")))
      .filter((f) => !documentos.some((g) => casaRuta(g.ruta, f)));
    expect(sinRegistro, "Un documento generado entero nuevo: añádelo a GENERADOS y a .gitattributes, o chocará entre ramas").toEqual([]);
  });

  it("y todo documento del registro lleva esa cabecera (si no, quedarse con tu versión perdería lo escrito a mano)", () => {
    const sinCabecera = GENERADOS.filter((g) => g.clase === "documento")
      .flatMap((g) => tracked.filter((f) => casaRuta(g.ruta, f)))
      .filter((f) => !/^<!-- Generado desde .*No se edita a mano/m.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(sinCabecera).toEqual([]);
  });

  it("un patrón no cruza carpetas, como en .gitattributes", () => {
    expect(casaRuta(".claude/plantillas-skill/*.md", ".claude/plantillas-skill/flujo.md")).toBe(true);
    expect(casaRuta(".claude/plantillas-skill/*.md", ".claude/plantillas-skill/x/flujo.md")).toBe(false);
    expect(casaRuta("docs/ops/FORJA.md", "docs/ops/FORJAxmd")).toBe(false);
  });

  it("--escribir lanza cada script una vez", () => {
    const c = comandosDeEscribir();
    expect(new Set(c).size).toBe(c.length);
    expect(c).toContain("scripts/forja.mjs");
  });
});

describe("la fusión por claves de un ancla JSON", () => {
  const J = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const base = { $comentario: "x", capas: { a: "formal", c: "formal" }, retirados: {} };

  it("entra lo que añade cada lado, en orden si tus claves iban en orden", () => {
    const m = mezclarJson(J(base), J({ ...base, capas: { a: "formal", b: "material", c: "formal" } }), J({ ...base, capas: { a: "formal", c: "formal", d: "subjetiva" } }));
    expect(m.texto).toBe(J({ ...base, capas: { a: "formal", b: "material", c: "formal", d: "subjetiva" } }));
  });

  it("lo que cambia o borra un solo lado se respeta", () => {
    const m = mezclarJson(J(base), J({ ...base, capas: { a: "material", c: "formal" } }), J({ ...base, capas: { a: "formal" }, retirados: { c: { motivo: "fuera" } } }));
    expect(JSON.parse(m.texto)).toEqual({ ...base, capas: { a: "material" }, retirados: { c: { motivo: "fuera" } } });
  });

  it("la misma clave cambiada distinto en los dos lados es un choque, con su ruta", () => {
    expect(mezclarJson(J(base), J({ ...base, capas: { ...base.capas, a: "material" } }), J({ ...base, capas: { ...base.capas, a: "subjetiva" } })))
      .toEqual({ choques: [".capas.a"] });
    expect(mezclarJson(J(base), J({ ...base, capas: { ...base.capas, b: "material" } }), J({ ...base, capas: { ...base.capas, b: "formal" } })).choques).toEqual([".capas.b"]);
  });

  it("listas de valores sueltos, como conjuntos; de objetos, choque", () => {
    const b = { p: ["a", "b", "c"] };
    expect(JSON.parse(mezclarJson(J(b), J({ p: ["a", "c", "d"] }), J({ p: ["a", "b", "c", "e"] })).texto)).toEqual({ p: ["a", "c", "d", "e"] });
    expect(mezclarJson(J({ p: [{ x: 1 }] }), J({ p: [{ x: 2 }] }), J({ p: [{ x: 3 }] })).choques).toEqual([".p"]);
  });

  it("lo que no es JSON no se fusiona", () => {
    expect(mezclarJson(J(base), "{ roto", J(base)).error).toMatch(/no es JSON/);
  });
});

describe("con git de verdad: dos ramas que añaden un criterio cada una", () => {
  const SCRIPT = join(RAIZ, "scripts", "merge-driver.mjs").replace(/\\/g, "/");
  const datos = leerForja(RAIZ);
  const capas = leerCapas(RAIZ);
  const comun = readFileSync(join(RAIZ, RUTA_PLANTILLA_COMUN), "utf8");
  const molde = datos.criterios.find((c) => c.id === "camino-por-defecto");

  const conCriterio = (d, id) => {
    const criterios = [...d.criterios, { ...molde, id, nombre: `Prueba ${id}` }]
      .sort((x, y) => (nombreDeFichero(x.id) < nombreDeFichero(y.id) ? -1 : 1));
    return { ...d, criterios };
  };
  /** Los generados de la forja para unos datos y un ancla de partida, como los deja `--escribir`. */
  const generados = (d, ancla) => {
    const f = new Map([["docs/ops/FORJA.md", generarMd(d)], ["ops/forja-capas.json", `${JSON.stringify(anclarCapas(d, ancla).guardado, null, 2)}\n`]]);
    for (const [t, texto] of Object.entries(generarPlantillas(d, comun))) f.set(rutaPlantilla(t), texto);
    return f;
  };
  const escribir = (dir, ficheros) => {
    for (const [ruta, texto] of ficheros) { mkdirSync(dirname(join(dir, ruta)), { recursive: true }); writeFileSync(join(dir, ruta), texto); }
  };
  const commit = (dir, msg) => { git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", msg); };

  /** Monta base, rama a (criterio idA) y rama b (idB); fusiona b en a. Devuelve líneas en conflicto por fichero. */
  const fusionar = ({ idA, idB, drivers }) => {
    const dir = mkdtempSync(join(tmpdir(), "generados-"));
    try {
      git(dir, "init", "-q", "-b", "staging");
      git(dir, "config", "user.email", "t@t");
      git(dir, "config", "user.name", "t");
      git(dir, "config", "core.autocrlf", "false");
      if (drivers) instalarDrivers(dir, `"${SCRIPT}"`);
      writeFileSync(join(dir, ".gitattributes"), readFileSync(join(RAIZ, ".gitattributes"), "utf8"));
      escribir(dir, generados(datos, capas));
      commit(dir, "base");
      git(dir, "checkout", "-q", "-b", "a");
      const dA = conCriterio(datos, idA);
      escribir(dir, new Map([...generados(dA, capas), [`ops/forja/criterios/${idA}.json`, JSON.stringify({ ...molde, id: idA })]]));
      commit(dir, "a");
      git(dir, "checkout", "-q", "staging");
      git(dir, "checkout", "-q", "-b", "b");
      const dB = conCriterio(datos, idB);
      escribir(dir, new Map([...generados(dB, capas), [`ops/forja/criterios/${idB}.json`, JSON.stringify({ ...molde, id: idB })]]));
      commit(dir, "b");
      git(dir, "checkout", "-q", "a");
      let limpia = true;
      try { git(dir, "merge", "--no-edit", "-q", "b"); } catch { limpia = false; }
      const conflicto = {};
      const juntos = conCriterio(conCriterio(datos, idA), idB);
      const esperado = generados(juntos, capas);
      const desfasados = [];
      for (const ruta of esperado.keys()) {
        const texto = readFileSync(join(dir, ruta), "utf8");
        let dentro = false;
        let n = 0;
        for (const l of texto.split("\n")) {
          if (l.startsWith("<<<<<<<")) dentro = true;
          else if (l.startsWith(">>>>>>>")) dentro = false;
          else if (dentro && !l.startsWith("=======")) n++;
        }
        if (n) conflicto[ruta] = n;
        if (texto !== esperado.get(ruta)) desfasados.push(ruta);
      }
      return { limpia, conflicto, desfasados, capas: conflicto["ops/forja-capas.json"] ? null : JSON.parse(readFileSync(join(dir, "ops/forja-capas.json"), "utf8")) };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);

  // Criterios vecinos (chocan en las mismas tablas) y lejanos (en tablas y líneas distintas).
  const ESCENARIOS = { vecinos: ["zz-prueba-a", "zz-prueba-b"], lejanos: ["aa-prueba", "zz-prueba"] };

  for (const [nombre, [idA, idB]] of Object.entries(ESCENARIOS)) {
    it(`${nombre}: sin los drivers chocan en los generados; con ellos, no`, () => {
      const sin = fusionar({ idA, idB, drivers: false });
      const con = fusionar({ idA, idB, drivers: true });
      // La cifra de #551 (antes y después), en el mensaje si falla.
      expect(total(sin.conflicto), `sin drivers: ${JSON.stringify(sin.conflicto)}`).toBeGreaterThan(0);
      expect(sin.limpia).toBe(false);
      expect(con.conflicto, "con drivers no queda ninguna marca de conflicto").toEqual({});
      expect(con.limpia, "con drivers la fusión no para").toBe(true);
      // El ancla queda bien fusionada: los dos criterios, sin regenerar nada.
      expect(Object.keys(con.capas.capas)).toEqual(expect.arrayContaining([idA, idB]));
      expect(con.desfasados, "el ancla no queda desfasada").not.toContain("ops/forja-capas.json");
      // FORJA.md se queda con tu versión y queda desfasada: es justo lo que dice su test «está al día»
      // (ops/forja.test.js), que corre en local y en el CI.
      expect(con.desfasados).toContain("docs/ops/FORJA.md");
    });
  }

  it("la configuración de los drivers: se instala, es idempotente y usa la ruta relativa por defecto", () => {
    const dir = mkdtempSync(join(tmpdir(), "generados-cfg-"));
    try {
      git(dir, "init", "-q");
      expect(driversQueFaltan(dir)).toHaveLength(Object.keys(configDrivers()).length);
      expect(instalarDrivers(dir)).toHaveLength(Object.keys(configDrivers()).length);
      expect(instalarDrivers(dir)).toEqual([]);
      expect(driversQueFaltan(dir)).toEqual([]);
      expect(git(dir, "config", "--get", "merge.generado.driver").trim()).toBe("node scripts/merge-driver.mjs generado %O %A %B %P");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
