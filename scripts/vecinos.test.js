import { describe, expect, it } from "vitest";
import { casa, elegir, faltasDeDatos, globARegex, propiosDe } from "./lib/vecinos.mjs";

const datosBase = () => ({
  conocidas: ["src/", "scripts/"],
  vigilantes: [
    { id: "g1", tests: ["scripts/a.test.js"], mira: ["scripts/**/*.mjs"], porque: "recorre todos los scripts del repo" },
    { id: "g2", tests: ["src/b.test.js"], mira: ["src/{x,y}/*.js"], borrados: ["src/**"], porque: "mira dos carpetas de src a la vez", amplio: true },
  ],
  pasos: [{ id: "p1", mira: ["scripts/**"], cmd: ["node", "scripts/p.mjs", "{lista}"], porque: "paso del CI de prueba" }],
  excepciones: [{ tests: ["scripts/c.test.js"], motivo: "lista una carpeta temporal propia, no el repo" }],
});
const indiceDe = (...tests) => new Map(tests.map((t) => [t, { texto: "", imports: new Set() }]));

describe("globs", () => {
  it("** cruza carpetas, * no, {a,b} elige", () => {
    expect(casa(["scripts/**/*.mjs"], "scripts/a.mjs")).toBe(true);
    expect(casa(["scripts/**/*.mjs"], "scripts/lib/a.mjs")).toBe(true);
    expect(casa(["scripts/*.mjs"], "scripts/lib/a.mjs")).toBe(false);
    expect(casa(["src/{x,y}/*.js"], "src/y/a.js")).toBe(true);
    expect(casa(["src/{x,y}/*.js"], "src/z/a.js")).toBe(false);
    expect(casa(["ops/*.md"], "ops/copias/LEEME.md")).toBe(false);
  });

  it("el punto es literal", () => {
    expect(globARegex("a.mjs").test("aXmjs")).toBe(false);
  });
});

describe("faltasDeDatos", () => {
  it("unos datos buenos no tienen faltas", () => expect(faltasDeDatos(datosBase())).toEqual([]));

  it("pilla un porqué vacío, un test repetido, uno que es vigilante y excepción, y una excepción sin motivo", () => {
    const d = datosBase();
    d.vigilantes[0].porque = "";
    d.vigilantes[1].tests = ["scripts/a.test.js"];
    d.excepciones.push({ tests: ["scripts/a.test.js"], motivo: "x" });
    const f = faltasDeDatos(d).join("\n");
    expect(f).toMatch(/g1: «porque»/);
    expect(f).toMatch(/dos grupos/);
    expect(f).toMatch(/vigilante y excepción/);
    expect(f).toMatch(/«motivo»/);
  });
});

describe("elegir", () => {
  const indice = indiceDe("scripts/a.test.js", "src/b.test.js", "scripts/p.test.js");

  it("un fichero activa el vigilante cuyo conjunto lo incluye, y el que no, no", () => {
    const r = elegir({ tocados: [{ ruta: "scripts/p.mjs", estado: "M" }], datos: datosBase(), indice });
    expect(r.tests.map((t) => t.test)).toEqual(["scripts/a.test.js", "scripts/p.test.js"]);
    expect(r.tests.find((t) => t.test === "scripts/p.test.js").tipos).toEqual(["propio"]);
    expect(r.pasos.map((p) => p.id)).toEqual(["p1"]);
  });

  it("borrar activa por `borrados` aunque no esté en `mira`", () => {
    const r = elegir({ tocados: [{ ruta: "src/z/loquesea.js", estado: "D" }], datos: datosBase(), indice });
    expect(r.tests.map((t) => t.test)).toEqual(["src/b.test.js"]);
    expect(elegir({ tocados: [{ ruta: "src/z/loquesea.js", estado: "M" }], datos: datosBase(), indice }).tests).toEqual([]);
  });

  it("plan B: lo que no entiende lanza los `amplio`", () => {
    const r = elegir({ tocados: [{ ruta: "otra/cosa.txt", estado: "A" }], datos: datosBase(), indice });
    expect(r.sinEntender).toEqual(["otra/cosa.txt"]);
    expect(r.tests.map((t) => t.test)).toEqual(["src/b.test.js"]);
  });

  it("un test de la lista que no existe en el repo se ignora (el test de ops lo señala)", () => {
    const r = elegir({ tocados: [{ ruta: "scripts/q.mjs", estado: "M" }], datos: datosBase(), indice: indiceDe("src/b.test.js") });
    expect(r.tests).toEqual([]);
  });
});

describe("propiosDe", () => {
  it("el que se llama igual, el que importa y el que cita un json", () => {
    const indice = new Map([
      ["scripts/x.test.js", { texto: "", imports: new Set() }],
      ["scripts/otro.test.js", { texto: "", imports: new Set(["scripts/lib/x.mjs"]) }],
      ["ops/d.test.js", { texto: 'leer("ops/datos.json")', imports: new Set() }],
    ]);
    expect(propiosDe("scripts/x.mjs", indice).map((p) => p.test)).toEqual(["scripts/x.test.js"]);
    expect(propiosDe("scripts/lib/x.mjs", indice).map((p) => p.test)).toEqual(["scripts/otro.test.js"]);
    expect(propiosDe("ops/datos.json", indice).map((p) => p.test)).toEqual(["ops/d.test.js"]);
    expect(propiosDe("ops/datos.md", indice)).toEqual([]);
  });
});
