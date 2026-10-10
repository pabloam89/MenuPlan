import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  VIDA_FRESCA_MS, VIDA_MAX_MS, anotarLineas, anotarVista, barrerVistas, consultarZona, cubre, escribirZonas, haceCuanto,
  leerZonas, lineasDeAviso, listaDeRamas, otrasRamas, refrescarEnSegundoPlano,
} from "./zonas.mjs";
import { contarAvisos } from "../../scripts/lib/zonas.mjs";

const AHORA = Date.parse("2026-10-10T20:00:00Z");
const hace = (h) => new Date(AHORA - h * 3_600_000).toISOString();
const FOTO = {
  hecho: new Date(AHORA).toISOString(),
  ramas: [
    { rama: "ops/1-mia", ruta: "C:/dev/MenuPlan-mia", carpeta: "MenuPlan-mia", issue: 1, desde: hace(1), ficheros: ["ops/forja.json"], reservadas: [] },
    { rama: "ops/2-otra", ruta: "C:/dev/MenuPlan-otra", carpeta: "MenuPlan-otra", issue: 2, desde: hace(3), ficheros: ["ops/forja.json", "CLAUDE.md"], reservadas: [] },
    { rama: "ops/sin-issue", ruta: "C:/dev/MenuPlan-sin", carpeta: "MenuPlan-sin", issue: null, desde: null, ficheros: [], reservadas: ["ops/glosario.json", "docs/ops/"] },
  ],
};
const dirTemporal = () => mkdtempSync(join(tmpdir(), "zonas-"));

describe("qué otras ramas llevan un fichero", () => {
  it("cuenta lo cambiado y lo reservado, y quita la rama de la propia carpeta", () => {
    expect(otrasRamas(FOTO, "ops/forja.json", "C:\\dev\\MenuPlan-mia\\ops\\forja.json").map((o) => [o.rama, o.como])).toEqual([["ops/2-otra", "cambiado"]]);
    expect(otrasRamas(FOTO, "ops/forja.json").map((o) => o.rama)).toEqual(["ops/1-mia", "ops/2-otra"]);
    expect(otrasRamas(FOTO, "ops/glosario.json", "C:/dev/MenuPlan-mia/ops/glosario.json").map((o) => [o.rama, o.como])).toEqual([["ops/sin-issue", "reservado"]]);
    expect(otrasRamas(FOTO, "docs/ops/FLUJO.md", "C:/dev/MenuPlan-mia/docs/ops/FLUJO.md").map((o) => o.rama)).toEqual(["ops/sin-issue"]);
    expect(otrasRamas(FOTO, "src/App.jsx", "C:/dev/MenuPlan-mia/src/App.jsx")).toEqual([]);
  });

  it("una carpeta con un nombre que empieza igual no es la propia", () => {
    expect(otrasRamas(FOTO, "ops/forja.json", "C:/dev/MenuPlan-mia-2/ops/forja.json").map((o) => o.rama)).toEqual(["ops/1-mia", "ops/2-otra"]);
  });

  it("una reserva cubre su fichero exacto o lo que cuelga de su carpeta", () => {
    expect(cubre("ops/forja.json", "ops/forja.json")).toBe(true);
    expect(cubre("ops/forja.json", "ops/forja.json.bak")).toBe(false);
    expect(cubre("docs/ops/", "docs/ops/FLUJO.md")).toBe(true);
    expect(cubre("docs/ops/", "docs/opsx/a.md")).toBe(false);
    expect(cubre("ops/", "docs/ops/FLUJO.md")).toBe(false);
  });

  it("el texto: rama, issue, cómo y desde cuándo, hasta tres", () => {
    const otras = otrasRamas(FOTO, "ops/forja.json");
    expect(listaDeRamas(otras, AHORA)).toBe("la rama `ops/1-mia` (#1, con cambios, desde hace 1,0 h); la rama `ops/2-otra` (#2, con cambios, desde hace 3,0 h)");
    expect(listaDeRamas([{ rama: "a/b", issue: null, desde: null, como: "reservado" }], AHORA)).toBe("la rama `a/b` (sin issue, reservado al abrir la tarea, sin fecha)");
    expect(listaDeRamas(Array.from({ length: 5 }, (_, i) => ({ rama: `a/${i}`, como: "cambiado" })), AHORA)).toMatch(/ y 2 más$/);
    expect([haceCuanto(0.2), haceCuanto(50), haceCuanto(null)]).toEqual(["12 min", "2 días", "sin fecha"]);
  });
});

describe("la foto en caché", () => {
  it("se escribe de golpe y se lee con su edad", () => {
    const dir = dirTemporal();
    expect(leerZonas(dir)).toBe(null);
    escribirZonas(dir, FOTO);
    expect(leerZonas(dir, AHORA + 1000)).toEqual({ datos: FOTO, edadMs: 1000 });
    writeFileSync(join(dir, "zonas.json"), "{a medias");
    expect(leerZonas(dir)).toBe(null);
  });

  it("sin foto o vieja pide otra sin esperarla; demasiado vieja no avisa", () => {
    const dir = dirTemporal();
    const pedidas = [];
    const refrescar = (d) => pedidas.push(d);
    expect(consultarZona(dir, "C:/dev/MenuPlan-mia/ops/forja.json", "ops/forja.json", { ahora: AHORA, refrescar })).toEqual([]);
    expect(pedidas).toHaveLength(1);
    escribirZonas(dir, FOTO);
    const rel = ["C:/dev/MenuPlan-mia/ops/forja.json", "ops/forja.json"];
    expect(consultarZona(dir, ...rel, { ahora: AHORA + 1000, refrescar }).map((o) => o.rama)).toEqual(["ops/2-otra"]);
    expect(pedidas).toHaveLength(1); // fresca: no pide
    expect(consultarZona(dir, ...rel, { ahora: AHORA + VIDA_FRESCA_MS + 1, refrescar })).toHaveLength(1);
    expect(pedidas).toHaveLength(2); // vieja: pide y usa la que hay
    expect(consultarZona(dir, ...rel, { ahora: AHORA + VIDA_MAX_MS + 1, refrescar })).toEqual([]);
    expect(pedidas).toHaveLength(3); // caducada: pide y no avisa
    expect(consultarZona(null, ...rel, { refrescar })).toEqual([]);
  });

  it("el cálculo en segundo plano no se lanza dos veces seguidas (candado)", () => {
    const dir = dirTemporal();
    const script = join(dirTemporal(), "nada.mjs");
    writeFileSync(script, "");
    expect(refrescarEnSegundoPlano(dir, { script })).toBe(true);
    expect(existsSync(join(dir, "zonas.lock"))).toBe(true);
    expect(refrescarEnSegundoPlano(dir, { script })).toBe(false);
    const viejo = (Date.now() - 2 * 60_000) / 1000;
    utimesSync(join(dir, "zonas.lock"), viejo, viejo);
    expect(refrescarEnSegundoPlano(dir, { script })).toBe(true);
  });

  it("leer la foto y buscar un fichero cuesta poco aunque haya muchas ramas (margen 20×)", () => {
    // Medido el 10 oct 2026: ~1 ms con 40 ramas de 300 ficheros. El tope, 20 veces más.
    const dir = dirTemporal();
    const grande = { hecho: new Date().toISOString(), ramas: Array.from({ length: 40 }, (_, i) => ({ rama: `ops/${i}-x`, ruta: `C:/dev/MenuPlan-${i}`, ficheros: Array.from({ length: 300 }, (_, j) => `src/f${j}.js`), reservadas: [] })) };
    escribirZonas(dir, grande);
    const t = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      consultarZona(dir, "C:/dev/MenuPlan-0/src/f299.js", "src/f299.js", { refrescar: () => {} });
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    expect(t[7]).toBeLessThan(20);
  });
});

describe("una vez por fichero y sesión, y la línea contable", () => {
  it("anotarVista dice true solo la primera vez", () => {
    const dir = dirTemporal();
    expect(anotarVista(dir, "sesion-zonas-1", "ops/forja.json")).toBe(true);
    expect(anotarVista(dir, "sesion-zonas-1", "ops/forja.json")).toBe(false);
    expect(anotarVista(dir, "sesion-zonas-1", "CLAUDE.md")).toBe(true);
    expect(anotarVista(dir, "sesion-zonas-2", "ops/forja.json")).toBe(true);
    expect(anotarVista(dir, "../fuera", "ops/forja.json")).toBe(false);
    expect(anotarVista(null, "sesion-zonas-1", "x")).toBe(false);
  });

  it("las fichas de sesiones que ya no existen se barren a las 48 h", () => {
    const dir = dirTemporal();
    anotarVista(dir, "sesion-vieja-1", "a");
    anotarVista(dir, "sesion-nueva-1", "a");
    const viejo = (Date.now() - 49 * 3_600_000) / 1000;
    utimesSync(join(dir, "zonas-vistas", "sesion-vieja-1.json"), viejo, viejo);
    expect(barrerVistas(dir)).toBe(1);
    expect(anotarVista(dir, "sesion-vieja-1", "a")).toBe(true);
    expect(anotarVista(dir, "sesion-nueva-1", "a")).toBe(false);
    expect(barrerVistas(dirTemporal())).toBe(0);
  });

  it("una línea por rama, que el informe sabe contar", () => {
    const otras = otrasRamas(FOTO, "ops/forja.json");
    const lineas = lineasDeAviso({ fichero: "ops/forja.json", otras }, new Date(AHORA));
    expect(lineas).toEqual([
      "ts: 2026-10-10T20:00:00.000Z zona: ops/forja.json rama: ops/1-mia issue: #1 como: cambiado aviso: si",
      "ts: 2026-10-10T20:00:00.000Z zona: ops/forja.json rama: ops/2-otra issue: #2 como: cambiado aviso: si",
    ]);
    const dir = dirTemporal();
    expect(anotarLineas(dir, lineas)).toBe(true);
    expect(anotarLineas(dir, [])).toBe(false);
    const texto = readFileSync(join(dir, "zonas.log"), "utf8");
    expect(contarAvisos(texto, new Date(AHORA - 1000))).toEqual({ avisos: 2, ficheros: 1 });
    expect(contarAvisos(texto, new Date(AHORA + 1000))).toEqual({ avisos: 0, ficheros: 0 });
  });
});
