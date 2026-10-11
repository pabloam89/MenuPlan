import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLASES, CLASES_DERIVADOS, DERIVADOS, GENERADOS } from "../scripts/lib/generados.mjs";
import {
  PRUEBAS_DE_TABLAS, REGISTRO, contarPorClase, derivadosDeTablas, generadosSinRegistrar, problemasDelRegistro,
} from "../scripts/lib/derivados.mjs";
import { TABLAS } from "../src/data/model.js";

/**
 * El inventario general de derivados (#584, norma C3 «un dato, un sitio»):
 *  1. cada script que regenera y cada test que vigila existen (o la entrada dice por qué no);
 *  2. todo fichero con cabecera de generado, o con bloques generados, está en el inventario;
 *  3. toda entrada sin test propio lleva su motivo;
 *  4. un solo inventario: `GENERADOS` (los drivers de fusión) es un filtro suyo y los datos de
 *     `TABLAS` no se copian.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  .split("\n").filter(Boolean).filter((f) => existsSync(join(RAIZ, f)));
const existe = (r) => existsSync(join(RAIZ, r));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");

describe("el inventario de derivados", () => {
  it("cada entrada tiene fuente, un script que existe (o `manual` con motivo) y un test que existe (o `none` con motivo)", () => {
    expect(problemasDelRegistro(REGISTRO, { existe, ficheros: tracked })).toEqual([]);
  });

  it("todo fichero con cabecera de generado, o con bloques generados, está en el inventario", () => {
    const sueltos = generadosSinRegistrar(REGISTRO, tracked, leer);
    expect(sueltos, "Un derivado nuevo: añádelo a DERIVADOS de scripts/lib/generados.mjs (o a TABLAS si es un dato derivado) con su fuente, su script y su test").toEqual([]);
  });

  it("los datos derivados de TABLAS están todos, y las pruebas solo nombran tablas que existen", () => {
    const rutas = REGISTRO.filter((g) => g.clase === "data").map((g) => g.ruta);
    const debidas = TABLAS.filter((t) => t.rol === "derivado").flatMap((t) => t.ficheros ?? []);
    expect(debidas.filter((r) => !rutas.includes(r))).toEqual([]);
    const ids = new Set(TABLAS.filter((t) => t.rol === "derivado").map((t) => t.id));
    expect(Object.keys(PRUEBAS_DE_TABLAS).filter((id) => !ids.has(id))).toEqual([]);
    const sinDecidir = REGISTRO.filter((g) => /sin decidir/.test(g.noTestReason ?? ""));
    expect(sinDecidir.map((g) => g.ruta), "Una tabla derivada nueva: di en PRUEBAS_DE_TABLAS qué test la vigila, o por qué ninguno").toEqual([]);
  });

  it("un solo inventario: GENERADOS es el filtro de las clases con driver y los datos no se copian", () => {
    expect(GENERADOS).toEqual(DERIVADOS.filter((g) => g.clase in CLASES));
    expect(new Set(GENERADOS.map((g) => g.clase))).toEqual(new Set(Object.keys(CLASES)));
    // Las clases nuevas no entran en los drivers de fusión.
    const nuevas = Object.keys(CLASES_DERIVADOS).filter((c) => !(c in CLASES));
    expect(nuevas.length).toBeGreaterThan(0);
    expect(GENERADOS.filter((g) => nuevas.includes(g.clase))).toEqual([]);
    expect(DERIVADOS.filter((g) => g.clase === "data" && TABLAS.some((t) => (t.ficheros ?? []).includes(g.ruta)))).toEqual([]);
  });

  it("los campos nuevos están en inglés y los valores sin test ni script son `none` y `manual`", () => {
    const permitidos = new Set(["ruta", "clase", "regenera", "test", "source", "manualReason", "noTestReason"]);
    expect(REGISTRO.flatMap((g) => Object.keys(g).filter((k) => !permitidos.has(k)))).toEqual([]);
  });

  it("cuenta las entradas por clase", () => {
    const n = contarPorClase();
    expect(Object.values(n).reduce((a, b) => a + b, 0)).toBe(REGISTRO.length);
    expect(n.documento).toBe(6);
    expect(n.ancla).toBe(4);
  });
});

describe("el test falla cuando debe (con ficheros de mentira)", () => {
  const conCarpeta = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), "derivados-"));
    try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const poner = (dir, ruta, texto) => { mkdirSync(dirname(join(dir, ruta)), { recursive: true }); writeFileSync(join(dir, ruta), texto); };
  const entrada = { ruta: "x/hecho.json", clase: "data", source: "x/fuente.json", regenera: "scripts/x.mjs", test: "x/x.test.js" };

  it("un fichero con cabecera de generado que no está en el inventario se detecta", () => conCarpeta((dir) => {
    poner(dir, "x/nuevo.css", "/* GENERADO por scripts/x.mjs. No se edita a mano. */\n:root {}\n");
    poner(dir, "x/nuevo.md", "# Título\n\nTexto.\n<!-- flujo:tabla:inicio -->\n<!-- flujo:tabla:fin -->\n");
    poner(dir, "x/normal.js", "// un fichero normal\nexport const a = 1;\n");
    const ficheros = ["x/nuevo.css", "x/nuevo.md", "x/normal.js"];
    const leerTmp = (r) => readFileSync(join(dir, r), "utf8");
    expect(generadosSinRegistrar([], ficheros, leerTmp)).toEqual(["x/nuevo.css", "x/nuevo.md"]);
    // Y en cuanto se registra, deja de salir.
    const registro = [{ ...entrada, ruta: "x/nuevo.css" }, { ...entrada, ruta: "x/nuevo.md", clase: "partial" }];
    expect(generadosSinRegistrar(registro, ficheros, leerTmp)).toEqual([]);
  }));

  it("el inventario real, sin una entrada, deja ese fichero suelto", () => {
    const sin = REGISTRO.filter((g) => g.ruta !== "src/design/tokens.css");
    expect(generadosSinRegistrar(sin, tracked, leer)).toEqual(["src/design/tokens.css"]);
  });

  it("una entrada sin motivo, con script o test inexistente, repetida o de clase desconocida se rechaza", () => {
    const ok = { existe: (r) => r !== "falta.mjs", ficheros: ["x/hecho.json"] };
    expect(problemasDelRegistro([entrada], { existe: () => true, ficheros: ["x/hecho.json"] })).toEqual([]);
    expect(problemasDelRegistro([{ ...entrada, test: "none" }], ok).join()).toMatch(/falta `noTestReason`/);
    expect(problemasDelRegistro([{ ...entrada, regenera: "manual" }], ok).join()).toMatch(/falta `manualReason`/);
    expect(problemasDelRegistro([{ ...entrada, regenera: "falta.mjs" }], ok).join()).toMatch(/no existe/);
    expect(problemasDelRegistro([{ ...entrada, test: "falta.mjs" }], ok).join()).toMatch(/test `falta.mjs` .* no existe/);
    expect(problemasDelRegistro([{ ...entrada, source: "" }], ok).join()).toMatch(/falta `source`/);
    expect(problemasDelRegistro([{ ...entrada, clase: "rara" }], ok).join()).toMatch(/clase desconocida/);
    expect(problemasDelRegistro([entrada, entrada], ok).join()).toMatch(/dos veces/);
    expect(problemasDelRegistro([{ ...entrada, ruta: "otro/fichero" }], ok).join()).toMatch(/ningún fichero de git/);
  });

  it("una tabla derivada nueva sin decidir su test queda marcada", () => {
    const tablas = [...TABLAS, { id: "tablaNueva", rol: "derivado", ficheros: ["x/hecho.json"], procedencia: "p", productor: ["scripts/x.mjs"] }];
    const nuevas = derivadosDeTablas(tablas).filter((g) => g.ruta === "x/hecho.json");
    expect(nuevas).toHaveLength(1);
    expect(nuevas[0].noTestReason).toMatch(/sin decidir/);
  });
});
