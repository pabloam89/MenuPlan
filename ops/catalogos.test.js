import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
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
 *  2. en el PR que los parte, lo compuesto es, entrada a entrada y en el mismo orden, el fichero
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

describe(`equivalencia con el fichero viejo de ${REF} (el PR que los parte)`, () => {
  for (const [nombre, c] of Object.entries(CATALOGOS)) {
    const viejo = fileEnRef(c.antes);
    it.skipIf(viejo === null)(`${nombre}: mismas entradas, mismos valores y mismo orden que ${c.antes}`, () => {
      const antes = renombrarRutas(JSON.parse(viejo));
      const ahora = leerCatalogo(RAIZ, c.carpeta);
      // Byte a byte del JSON compuesto: claves, orden de las colecciones y cada valor.
      expect(JSON.stringify(ahora)).toBe(JSON.stringify(antes));
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

  it("dos claves que dan el mismo fichero (también por mayúsculas) no se pueden partir", () => {
    expect(() => partir({ t: [{ id: "Lección" }, { id: "leccion" }] }, { t: "id" })).toThrow(/mismo fichero/);
  });
});

describe("componer y partir", () => {
  const objeto = { a: 1, lista: [{ id: "b", x: 1 }, { id: "a", x: 2 }], mapa: { "z/1": { y: 1 }, k: [2] }, fin: "x" };
  const colecciones = { lista: "id", mapa: null };

  it("son inversas, también en el orden de las claves y de las entradas", () => {
    const f = partir(objeto, colecciones);
    expect([...f.keys()]).toEqual([INDICE, "lista/a.json", "lista/b.json", "mapa/k.json", "mapa/z-1.json"]);
    expect(JSON.stringify(componer(f))).toBe(JSON.stringify(objeto));
  });

  it("una entrada nueva sin tocar _catalogo.json va al final, por nombre", () => {
    const f = partir(objeto, colecciones);
    f.set("lista/0-nueva.json", JSON.stringify({ id: "0 nueva" }));
    f.set("lista/c.json", JSON.stringify({ id: "c" }));
    expect(componer(f).lista.map((e) => e.id)).toEqual(["b", "a", "0 nueva", "c"]);
  });

  it("rechaza lo que daría una pisada o una entrada perdida", () => {
    const con = (cambio) => { const f = partir(objeto, colecciones); cambio(f); return () => componer(f); };
    expect(con((f) => f.set("lista/otro.json", JSON.stringify({ id: "a" }))), "nombre que no es el de su clave").toThrow(/pide el nombre a\.json/);
    expect(con((f) => f.delete("lista/a.json")), "orden con una entrada sin fichero").toThrow(/sin fichero: a/);
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
    expect(JSON.stringify(catalogoEnReferencia(dir, "staging", "glosario"))).toBe(JSON.stringify(renombrarRutas(glosario)));
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
  const dosRamas = (dir, escribir) => {
    escribir(glosario);
    commit(dir, "base");
    git(dir, "checkout", "-q", "-b", "a");
    escribir({ ...glosario, terminos: glosario.terminos.map((t) => (t.termino === "caso" ? { ...t, definicion: "uno bis" } : t)) });
    commit(dir, "a");
    git(dir, "checkout", "-q", "staging");
    git(dir, "checkout", "-q", "-b", "b");
    escribir({ ...glosario, terminos: glosario.terminos.map((t) => (t.termino === "lección" ? { ...t, definicion: "dos bis" } : t)) });
    commit(dir, "b");
    return choca(dir);
  };

  it("dos ramas que cambian términos vecinos distintos: chocan en el fichero único y no en la carpeta", () => {
    // Como estaba la forja: una entrada por línea.
    const enLineas = (g) => `{\n  "zonas": ${JSON.stringify(g.zonas)},\n  "terminos": [\n    ${g.terminos.map((t) => JSON.stringify(t)).join(",\n    ")}\n  ]\n}\n`;
    const unico = conRepo((dir) => dosRamas(dir, (g) => escribirPartido(dir, "ops/", new Map([["glosario.json", enLineas(g)]]))));
    const partido = conRepo((dir) => dosRamas(dir, (g) => escribirPartido(dir, "ops/glosario/", partir(g, { terminos: "termino" }))));
    expect({ unico, partido }).toEqual({ unico: true, partido: false });
  });
});
