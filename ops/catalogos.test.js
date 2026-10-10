import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATALOGOS, INDICE, RENOMBRADOS, catalogoEnReferencia, componer, escribirPartido, leerCatalogo, nombreDeFichero, partir, renombrarRutas,
} from "../scripts/lib/catalogos.mjs";
import { REFERENCIA } from "../scripts/lib/forjaReferencia.mjs";
import { leerForja } from "../scripts/lib/forja.mjs";
import { leerExcepciones, leerGlosario } from "../scripts/lib/glosario.mjs";

/**
 * Los catálogos partidos en un fichero por entrada (#505, fondo #504): la forja, el glosario y
 * sus excepciones. La carpeta es la fuente y no hay agregado; aquí se comprueba que:
 *  1. cada carpeta se compone sin errores y sus nombres de fichero son seguros en Windows;
 *  2. en el PR que los parte, lo compuesto tiene, entrada a entrada, lo mismo que el fichero
 *     viejo de la referencia (con sus rutas renombradas a las carpetas) — nada se pierde ni cambia;
 *  3. la referencia se lee en las dos formas (trinquetes durante la transición);
 *  4. dos ramas que tocan entradas distintas ya no chocan al fusionar (con git de verdad);
 *  5. componer rechaza lo que daría una pisada o una entrada perdida.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REF = REFERENCIA();

const ficherosDe = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? ficherosDe(join(dir, n)).map((x) => `${n}/${x}`) : [n]));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: "pipe" });
const fileEnRef = (ruta) => {
  try { return git(RAIZ, "show", `${REF}:${ruta}`); } catch {
    // a propósito: sin git, sin la referencia o con el catálogo ya partido en ella, no hay fichero viejo con el que comparar
    return null;
  }
};

describe("cada catálogo partido", () => {
  for (const [nombre, c] of Object.entries(CATALOGOS)) {
    it(`${nombre}: se compone sin errores desde ${c.carpeta}`, () => {
      expect(() => leerCatalogo(RAIZ, c.carpeta)).not.toThrow();
    });

    it(`${nombre}: nombres de fichero en ASCII seguro, sin choques por mayúsculas`, () => {
      const nombres = ficherosDe(join(RAIZ, c.carpeta));
      expect(nombres).toContain(INDICE);
      expect(nombres.filter((n) => n !== INDICE && !/^[a-z0-9_]+\/[a-z0-9_]+(-[a-z0-9_]+)*\.json$/.test(n)), "Una entrada es <coleccion>/<nombre>.json en minúsculas ASCII (nombreDeFichero)").toEqual([]);
      const bajas = nombres.map((n) => n.toLowerCase());
      expect(new Set(bajas).size).toBe(bajas.length);
    });
  }

  it("sus lectores de siempre leen la carpeta", () => {
    expect(leerForja(RAIZ)).toEqual(leerCatalogo(RAIZ, CATALOGOS.forja.carpeta));
    expect(leerGlosario(RAIZ)).toEqual(leerCatalogo(RAIZ, CATALOGOS.glosario.carpeta));
    expect(leerExcepciones(RAIZ)).toEqual(leerCatalogo(RAIZ, CATALOGOS["glosario-excepciones"].carpeta).excepciones);
  });

  it("los ficheros viejos ya no están: una sola fuente, sin agregado que pueda divergir", () => {
    for (const viejo of Object.keys(RENOMBRADOS)) expect(() => statSync(join(RAIZ, viejo)), viejo).toThrow();
  });
});

// De paso: solo vale en el PR que parte los catálogos. Se salta sola cuando staging ya tenga la
// forma partida (no queda fichero viejo con el que comparar).
describe(`equivalencia con el fichero viejo de ${REF} (el PR que los parte)`, () => {
  for (const [nombre, c] of Object.entries(CATALOGOS)) {
    const viejo = fileEnRef(c.antes);
    it.skipIf(viejo === null)(`${nombre}: mismas entradas y mismos valores que ${c.antes}`, () => {
      const antes = renombrarRutas(JSON.parse(viejo));
      const ahora = leerCatalogo(RAIZ, c.carpeta);
      // Las colecciones partidas, por su clave: su orden ya no es dato (es el de los nombres de fichero).
      const marcas = JSON.parse(readFileSync(join(RAIZ, c.carpeta, INDICE), "utf8"));
      const normal = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => {
        const m = marcas[k];
        if (!m?.$partida) return [k, v];
        const pares = m.$partida === "lista" ? v.map((e) => [e[m.clave], e]) : Object.entries(v);
        return [k, Object.fromEntries(pares.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))];
      }));
      // Byte a byte, con cada colección ordenada por clave: secciones, su orden, cada entrada y cada valor.
      expect(JSON.stringify(normal(ahora))).toBe(JSON.stringify(normal(antes)));
      const cuenta = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v && typeof v === "object").map(([k, v]) => [k, Object.keys(v).length]));
      expect(cuenta(ahora)).toEqual(cuenta(antes));
    });
  }
});

describe("renombrar las rutas viejas", () => {
  it("solo cambia las rutas de los catálogos partidos, en textos y en claves", () => {
    expect(renombrarRutas({ "ops/glosario.json": ["ver ops/forja.json y ops/glosario-excepciones.json", "ops/forja-campos.json", 3] }))
      .toEqual({ "ops/glosario/": ["ver ops/forja/ y ops/glosario-excepciones/", "ops/forja-campos.json", 3] });
  });
});

describe("nombres de fichero", () => {
  it("sin tildes ni ñ, en minúsculas, y «-» en lo que no es letra, cifra ni «_»", () => {
    expect(["juicio de skill", "Lección", "año", "tipos_skill", ".claude/skills/github/SKILL.md", "dueño"].map(nombreDeFichero))
      .toEqual(["juicio-de-skill", "leccion", "ano", "tipos_skill", "claude-skills-github-skill-md", "dueno"]);
    expect(() => nombreDeFichero("¿?")).toThrow(/ningún nombre/);
  });

  it("dos claves que dan el mismo fichero (también por mayúsculas) no se pueden partir ni componer", () => {
    expect(() => partir({ t: [{ id: "Lección" }, { id: "leccion" }] }, { t: "id" })).toThrow(/mismo fichero/);
    // Al componer: un fichero con mayúsculas no es el nombre de su clave, y la segunda de dos claves
    // que dan el mismo nombre no cabe en ningún otro fichero.
    const f = partir({ t: [{ id: "leccion" }] }, { t: "id" });
    f.set("t/Leccion.json", JSON.stringify({ id: "Lección" }));
    expect(() => componer(f)).toThrow(/pide el nombre leccion\.json/);
    const g = partir({ t: [{ id: "Lección" }] }, { t: "id" });
    g.set("t/otra.json", JSON.stringify({ id: "leccion" }));
    expect(() => componer(g)).toThrow(/«leccion» pide el nombre leccion\.json/);
  });
});

describe("componer y partir", () => {
  const objeto = { a: 1, lista: [{ id: "b", x: 1 }, { id: "a", x: 2 }], mapa: { "z/1": { y: 1 }, k: [2] }, fin: "x" };
  const colecciones = { lista: "id", mapa: null };

  it("son inversas: mismas secciones en su orden y mismas entradas, en el orden de sus nombres de fichero", () => {
    const f = partir(objeto, colecciones);
    expect([...f.keys()]).toEqual([INDICE, "lista/a.json", "lista/b.json", "mapa/k.json", "mapa/z-1.json"]);
    expect(f.get(INDICE)).not.toMatch(/orden/);
    expect(JSON.stringify(componer(f))).toBe(JSON.stringify({ a: 1, lista: [{ id: "a", x: 2 }, { id: "b", x: 1 }], mapa: { k: [2], "z/1": { y: 1 } }, fin: "x" }));
  });

  it("una entrada nueva es solo su fichero: entra por nombre, sin tocar _catalogo.json", () => {
    const f = partir(objeto, colecciones);
    const indice = f.get(INDICE);
    f.set("lista/0-nueva.json", JSON.stringify({ id: "0 nueva" }));
    f.set("lista/c.json", JSON.stringify({ id: "c" }));
    expect(componer(f).lista.map((e) => e.id)).toEqual(["0 nueva", "a", "b", "c"]);
    expect(f.get(INDICE)).toBe(indice);
  });

  it("una marca con «orden» es un error: volvería a ser el punto que todas las ramas editan", () => {
    const f = partir(objeto, colecciones);
    f.set(INDICE, JSON.stringify({ lista: { $partida: "lista", clave: "id", orden: ["a", "b"] }, mapa: { $partida: "mapa" } }));
    expect(() => componer(f)).toThrow(/lleva «orden»/);
  });

  it("rechaza lo que daría una pisada o una entrada perdida", () => {
    const con = (cambio) => { const f = partir(objeto, colecciones); cambio(f); return () => componer(f); };
    expect(con((f) => f.set("lista/otro.json", JSON.stringify({ id: "a" }))), "nombre que no es el de su clave").toThrow(/pide el nombre a\.json/);
    expect(con((f) => f.set("suelto.json", "{}")), "fichero fuera de una colección").toThrow(/ninguna colección/);
    expect(con((f) => f.set("mapa/k.json", JSON.stringify({ clave: "k", valor: 1, mas: 2 }))), "mapa con campos de más").toThrow(/clave", "valor"/);
    expect(con((f) => f.set("lista/a.json", "{ roto")), "JSON roto").toThrow(/no es JSON válido/);
    expect(con((f) => f.delete(INDICE)), "sin índice").toThrow(/falta _catalogo\.json/);
    expect(con((f) => f.set("lista/sub/x.json", "{}")), "subcarpeta").toThrow(/sin subcarpetas/);
  });
});

describe("con git de verdad (repo de prueba)", () => {
  const conRepo = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), "catalogos-"));
    try {
      git(dir, "init", "-q", "-b", "staging");
      git(dir, "config", "user.email", "t@t");
      git(dir, "config", "user.name", "t");
      git(dir, "config", "core.autocrlf", "false");
      return fn(dir);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const glosario = { $comentario: "ver ops/forja.json", zonas: { forja: ["ops/forja.json"] }, terminos: [{ termino: "caso", definicion: "uno" }, { termino: "lección", definicion: "dos" }, { termino: "fondo", definicion: "tres" }] };
  const commit = (dir, msg) => { git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", msg); };

  it("la referencia se lee en la forma vieja (con rutas renombradas), en la partida, y null si no está", () => conRepo((dir) => {
    escribirPartido(dir, "ops/", new Map([["glosario.json", `${JSON.stringify(glosario, null, 2)}\n`]]));
    commit(dir, "viejo");
    expect(catalogoEnReferencia(dir, "staging", "glosario")).toEqual(renombrarRutas(glosario));
    git(dir, "rm", "-q", "ops/glosario.json");
    escribirPartido(dir, "ops/glosario/", partir(renombrarRutas(glosario), { terminos: "termino" }));
    commit(dir, "partido");
    // Partido, las entradas salen en el orden de sus nombres de fichero.
    const porNombre = [...glosario.terminos].sort((x, y) => (nombreDeFichero(x.termino) < nombreDeFichero(y.termino) ? -1 : 1));
    expect(JSON.stringify(catalogoEnReferencia(dir, "staging", "glosario"))).toBe(JSON.stringify(renombrarRutas({ ...glosario, terminos: porNombre })));
    expect(catalogoEnReferencia(dir, "staging", "forja")).toBe(null);
    expect(catalogoEnReferencia(dir, "no-existe", "glosario")).toBe(null);
  }));

  // La cifra del fondo #504: dos ramas que cambian entradas vecinas distintas chocan con el fichero
  // único y no con la carpeta. git merge-tree --write-tree sale con 1 si hay conflicto.
  const choca = (dir) => {
    try { git(dir, "merge-tree", "--write-tree", "a", "b"); return false; } catch (e) {
      if (e.status === 1) return true;
      throw e;
    }
  };
  const dosRamas = (dir, escribir, cambioA, cambioB) => {
    escribir(glosario);
    commit(dir, "base");
    git(dir, "checkout", "-q", "-b", "a");
    escribir(cambioA(glosario));
    commit(dir, "a");
    git(dir, "checkout", "-q", "staging");
    git(dir, "checkout", "-q", "-b", "b");
    escribir(cambioB(glosario));
    commit(dir, "b");
    return choca(dir);
  };
  const conTerminos = (f) => (g) => ({ ...g, terminos: f(g.terminos) });
  const cambia = (n, d) => conTerminos((ts) => ts.map((x) => (x.termino === n ? { ...x, definicion: d } : x)));
  const anade = (n) => conTerminos((ts) => [...ts, { termino: n, definicion: "nueva" }]);
  const borra = (n) => conTerminos((ts) => ts.filter((x) => x.termino !== n));
  const ESCENARIOS = {
    "cambian dos vecinos": [cambia("caso", "uno bis"), cambia("lección", "dos bis")],
    "añaden una entrada cada una": [anade("zona"), anade("vigía")],
    "borran dos vecinas": [borra("caso"), borra("lección")],
  };
  // Como estaba la forja: una entrada por línea.
  const enLineas = (g) => `{\n  "zonas": ${JSON.stringify(g.zonas)},\n  "terminos": [\n    ${g.terminos.map((x) => JSON.stringify(x)).join(",\n    ")}\n  ]\n}\n`;
  // La carpeta se reescribe entera: una entrada borrada es un fichero que desaparece.
  const enCarpeta = (dir) => (g) => { rmSync(join(dir, "ops/glosario"), { recursive: true, force: true }); escribirPartido(dir, "ops/glosario/", partir(g, { terminos: "termino" })); };

  for (const [nombre, [a, b]] of Object.entries(ESCENARIOS)) {
    it(`dos ramas que ${nombre}: chocan en el fichero único y no en la carpeta`, () => {
      const unico = conRepo((dir) => dosRamas(dir, (g) => escribirPartido(dir, "ops/", new Map([["glosario.json", enLineas(g)]])), a, b));
      const partido = conRepo((dir) => dosRamas(dir, enCarpeta(dir), a, b));
      expect({ unico, partido }).toEqual({ unico: true, partido: false });
    });
  }
});
