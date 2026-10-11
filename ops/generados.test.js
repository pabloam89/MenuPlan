import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLASES, DRIVERS, GENERADOS, casaRuta, comandosDeEscribir, configDrivers, desinstalarDrivers, driversQueFaltan, instalarDrivers, lineasGitattributes, mezclarJson,
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

  /** Pone en `dir` el comando de los drivers con este node y `script` (como instalarDrivers, sin mirar la carpeta principal). */
  const configurar = (dir, script) => {
    for (const [k, v] of Object.entries(configDrivers({ node: process.execPath, script }))) git(dir, "config", k, v);
  };

  /**
   * Monta base, rama a (criterio idA) y rama b (idB); fusiona b en a. `drivers`: false, "bien"
   * (el script de este repo) o "roto" (un script que no existe). Devuelve líneas en conflicto por
   * fichero, los ficheros sin fusionar (UU) y los desfasados.
   */
  const fusionar = ({ idA, idB, drivers }) => {
    const dir = mkdtempSync(join(tmpdir(), "generados-"));
    try {
      git(dir, "init", "-q", "-b", "staging");
      git(dir, "config", "user.email", "t@t");
      git(dir, "config", "user.name", "t");
      git(dir, "config", "core.autocrlf", "false");
      if (drivers === "bien") configurar(dir, SCRIPT);
      if (drivers === "roto") configurar(dir, join(dir, "no-existe", "merge-driver.mjs"));
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
      const sinFusionar = git(dir, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
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
      return { limpia, conflicto, sinFusionar, desfasados, capas: conflicto["ops/forja-capas.json"] ? null : JSON.parse(readFileSync(join(dir, "ops/forja-capas.json"), "utf8")) };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);

  // Criterios vecinos (chocan en las mismas tablas) y lejanos (en tablas y líneas distintas).
  const ESCENARIOS = { vecinos: ["zz-prueba-a", "zz-prueba-b"], lejanos: ["aa-prueba", "zz-prueba"] };

  for (const [nombre, [idA, idB]] of Object.entries(ESCENARIOS)) {
    it(`${nombre}: sin los drivers chocan en los generados; con ellos, no`, () => {
      const sin = fusionar({ idA, idB, drivers: false });
      const con = fusionar({ idA, idB, drivers: "bien" });
      // La cifra de #551 (antes y después), en el mensaje si falla.
      expect(total(sin.conflicto), `sin drivers: ${JSON.stringify(sin.conflicto)}`).toBeGreaterThan(0);
      expect(sin.limpia).toBe(false);
      expect(con.conflicto, "con drivers no queda ninguna marca de conflicto").toEqual({});
      expect(con.limpia, "con drivers la fusión no para").toBe(true);
      // El ancla queda bien fusionada: los dos criterios, sin regenerar nada.
      expect(Object.keys(con.capas.capas)).toEqual(expect.arrayContaining([idA, idB]));
      expect(con.desfasados, "el ancla no queda desfasada").not.toContain("ops/forja-capas.json");
      // FORJA.md se queda con la versión de HEAD y queda desfasada: es justo lo que dice su test
      // «está al día» (ops/forja.test.js), que corre en local y en el CI.
      expect(con.desfasados).toContain("docs/ops/FORJA.md");
    });
  }

  it("si el driver no se puede lanzar (script o node que no están), cae a la fusión de git con marcas: nada sin fusionar queda sin ellas", () => {
    const roto = fusionar({ idA: "zz-prueba-a", idB: "zz-prueba-b", drivers: "roto" });
    expect(roto.limpia).toBe(false);
    expect(roto.sinFusionar.length).toBeGreaterThan(0);
    const silenciosos = roto.sinFusionar.filter((r) => !(r in roto.conflicto));
    expect(silenciosos, "un fichero sin fusionar (UU) sin marcas parece resuelto").toEqual([]);
    expect(Object.keys(roto.conflicto)).toEqual(expect.arrayContaining(["docs/ops/FORJA.md", "ops/forja-capas.json"]));
  });

  it("la ruta del fichero llega literal al driver, aunque lleve caracteres del shell, y no ejecuta nada", () => {
    const dir = mkdtempSync(join(tmpdir(), "generados-ruta-"));
    try {
      git(dir, "init", "-q", "-b", "staging");
      git(dir, "config", "user.email", "t@t");
      git(dir, "config", "user.name", "t");
      git(dir, "config", "core.autocrlf", "false");
      configurar(dir, SCRIPT);
      const raro = "x`touch testigo1`$(touch testigo2).gen";
      writeFileSync(join(dir, ".gitattributes"), "*.gen merge=generado\n");
      const texto = (n) => `${Array.from({ length: 12 }, (_, i) => `línea ${i}`).join("\n")}\n${n}\n`;
      writeFileSync(join(dir, "a.gen"), texto("base"));
      commit(dir, "base");
      git(dir, "checkout", "-q", "-b", "a");
      git(dir, "mv", "a.gen", raro);
      writeFileSync(join(dir, raro), texto("rama a"));
      commit(dir, "a");
      git(dir, "checkout", "-q", "staging");
      writeFileSync(join(dir, "a.gen"), texto("rama b"));
      commit(dir, "b");
      git(dir, "checkout", "-q", "a");
      const r = spawnSync("git", ["merge", "--no-edit", "staging"], { cwd: dir, encoding: "utf8", windowsHide: true });
      expect(existsSync(join(dir, "testigo1")), "no se crea ningún fichero testigo").toBe(false);
      expect(existsSync(join(dir, "testigo2")), "no se crea ningún fichero testigo").toBe(false);
      expect(r.stderr, "el driver recibe la ruta tal cual").toContain(`generado ruta: ${raro} driver: generado`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  describe("instalar", () => {
    const conRepo = (fn) => {
      const dir = mkdtempSync(join(tmpdir(), "generados-cfg-"));
      try {
        git(dir, "init", "-q", "-b", "staging");
        git(dir, "config", "user.email", "t@t");
        git(dir, "config", "user.name", "t");
        return fn(dir);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    const N = Object.keys(configDrivers({ node: "n", script: "s" })).length;

    it("sin el script en la carpeta principal (una rama vieja, main) no instala nada", () => conRepo((dir) => {
      const r = instalarDrivers(dir);
      expect(r.puestos).toEqual([]);
      expect(r.motivo).toMatch(/no existe .*scripts\/merge-driver\.mjs/);
      expect(() => git(dir, "config", "--get", "merge.generado.driver")).toThrow();
    }));

    it("con él: rutas absolutas de node y del script de la carpeta principal, también desde otra carpeta de trabajo; idempotente", () => conRepo((dir) => {
      mkdirSync(join(dir, "scripts"));
      writeFileSync(join(dir, "scripts", "merge-driver.mjs"), "");
      writeFileSync(join(dir, "x.txt"), "x\n");
      git(dir, "add", "x.txt", "scripts/merge-driver.mjs");
      git(dir, "commit", "-q", "-m", "base");
      const otra = `${dir}-otra`;
      try {
        git(dir, "worktree", "add", "-q", "-b", "otra", otra);
        expect(instalarDrivers(otra).puestos).toHaveLength(N);
        expect(instalarDrivers(dir).puestos).toEqual([]);
        expect(driversQueFaltan(dir)).toEqual([]);
        const cmd = git(dir, "config", "--get", "merge.generado.driver").trim();
        const principal = realpathSync(dir).replace(/\\/g, "/");
        expect(cmd).toContain(`'${process.execPath.replace(/\\/g, "/")}'`);
        expect(cmd.toLowerCase()).toContain(`'${principal}/scripts/merge-driver.mjs' generado`.toLowerCase());
        expect(cmd).toContain(" %P || git merge-file");
      } finally { rmSync(otra, { recursive: true, force: true }); }
    }));

    it("no pisa un driver ajeno con el mismo nombre, y --desinstalar solo quita los nuestros", () => conRepo((dir) => {
      mkdirSync(join(dir, "scripts"));
      writeFileSync(join(dir, "scripts", "merge-driver.mjs"), "");
      git(dir, "config", "merge.generado.driver", "otro-programa %A");
      const r = instalarDrivers(dir);
      expect(r.ajenos).toEqual(["merge.generado.driver"]);
      expect(git(dir, "config", "--get", "merge.generado.driver").trim()).toBe("otro-programa %A");
      expect(desinstalarDrivers(dir)).toHaveLength(N - 1);
      expect(git(dir, "config", "--get", "merge.generado.driver").trim()).toBe("otro-programa %A");
    }));
  });
});
