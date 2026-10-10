import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ficherosDeGit } from "./ficherosGit.js";
import { EXCEPCIONES_TIEMPO, LINEAS_MARCA, MARGEN, SUELO_MS, mediana, medianaMs, medianaMsAsync, medidasSinMargen, topeMs } from "../scripts/lib/medirTiempo.mjs";

/**
 * Vigilante de la clase «todo test que compara una duración con un tope fijo sin
 * 20× de margen ni repetición» (#499, fondo #176; antes #407 y #307): falla bajo
 * carga cuando varias sesiones corren tests a la vez. Recorre todos los tests del
 * repo y pide que cada medida de tiempo pase por scripts/lib/medirTiempo.mjs
 * (`medianaMs` con un tope de `topeMs`) o lleve la marca `// tiempo: margen Nx
 * medido AAAA-MM-DD` (N ≥ 20) o `// tiempo: sin tope — …`. Registrado en
 * ops/vigilantes.json («tests-de-tiempo»).
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
// Este fichero se excluye a sí mismo: sus pruebas del escáner llevan medidas malas a propósito, como texto.
const ESTE = "ops/testsDeTiempo.test.js";
const TESTS = ficherosDeGit(RAIZ).filter((f) => /\.test\.(js|jsx|mjs)$/.test(f) && f !== ESTE);

// Las excepciones de partida (0 el 10 oct 2026, #499). Este literal NO se edita para añadir: solo se le quitan líneas.
const EXCEPCIONES_DE_PARTIDA = [];

describe("ningún test mide tiempo contra un tope sin margen (#499)", () => {
  const malas = TESTS.flatMap((f) => medidasSinMargen(readFileSync(join(RAIZ, f), "utf8")).map((m) => ({ f, ...m })));

  it("la búsqueda ve los tests que miden tiempo (no pasa en vacío)", () => {
    const conUtilidad = TESTS.filter((f) => /medianaMs(?:Async)?\(/.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(conUtilidad.length).toBeGreaterThanOrEqual(13);
  });

  it("toda medida usa la utilidad con topeMs o lleva su marca", () => {
    const excep = new Set(EXCEPCIONES_TIEMPO.map((e) => e.ruta));
    const fuera = malas.filter((m) => !excep.has(m.f)).map((m) => `${m.f}:${m.linea} ${m.motivo} ${m.texto}`);
    expect(fuera, "Mide con medianaMs(fn) y compara con topeMs(<lo medido suelto>) de scripts/lib/medirTiempo.mjs; si no cabe, `// tiempo: margen 20x medido AAAA-MM-DD (suelto …)` encima").toEqual([]);
  });

  it("las excepciones solo bajan y siguen siendo ciertas", () => {
    expect(EXCEPCIONES_TIEMPO.map((e) => e.ruta).filter((r) => !EXCEPCIONES_DE_PARTIDA.includes(r)), "La lista no crece: arregla el test").toEqual([]);
    const conFalta = new Set(malas.map((m) => m.f));
    expect(EXCEPCIONES_TIEMPO.map((e) => e.ruta).filter((r) => !conFalta.has(r)), "Ya cumple: quítalo de EXCEPCIONES_TIEMPO").toEqual([]);
  });
});

describe("el escáner, visto fallar", () => {
  const sin = (cuerpo) => medidasSinMargen(cuerpo).map((m) => m.motivo);

  it("señala una medida a mano sin marca, con performance.now, Date.now o hrtime", () => {
    expect(sin("const t0 = performance.now();\nf();\nexpect(performance.now() - t0).toBeLessThan(200);")).toEqual(["sin-marca"]);
    expect(sin("const t0 = Date.now();\nexpect(Date.now() - t0).toBeLessThan(1500);")).toEqual(["sin-marca"]);
    expect(sin("mejor = Math.min(mejor, performance.now() - t0);")).toEqual(["sin-marca"]);
    expect(sin("return { v, ms: Date.now() - t };")).toEqual(["sin-marca"]);
    expect(sin("const [s, ns] = process.hrtime(t0);")).toEqual(["sin-marca"]);
  });

  it("una marca con menos de 20x o una fecha que no existe no vale", () => {
    expect(sin("// tiempo: margen 8x medido 2026-10-10\nexpect(Date.now() - t0).toBeLessThan(800);")).toEqual(["margen-corto"]);
    expect(sin("// tiempo: margen 25x medido 2026-02-30\nexpect(Date.now() - t0).toBeLessThan(800);")).toEqual(["fecha-mala"]);
    const lejos = `// tiempo: margen 25x medido 2026-10-10\n${"x();\n".repeat(LINEAS_MARCA + 1)}expect(Date.now() - t0).toBeLessThan(800);`;
    expect(sin(lejos)).toEqual(["sin-marca"]);
  });

  it("una marca buena, en la línea o encima, vale; también «sin tope»", () => {
    expect(sin("// tiempo: margen 25x medido 2026-10-10 (suelto ~160 ms)\nexpect(Date.now() - t0).toBeLessThan(4000);")).toEqual([]);
    expect(sin("fila.wallMs = Date.now() - t; // tiempo: sin tope — se informa")).toEqual([]);
  });

  it("con la utilidad, el tope tiene que salir de topeMs", () => {
    expect(sin("expect(medianaMs(() => f())).toBeLessThan(200);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(await medianaMsAsync(g)).toBeLessThanOrEqual(1500);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(medianaMs(() => f(), { n: 3 })).toBeLessThan(topeMs(6));")).toEqual([]);
    // Una marca «sin tope» no tapa un tope a mano en la misma línea.
    expect(sin("// tiempo: sin tope — x\nexpect(medianaMs(() => Date.now() - t0)).toBeLessThan(200);")).toEqual(["tope-sin-margen"]);
  });

  it("no confunde cuentas de fechas, comentarios ni medidas dentro de la utilidad", () => {
    expect(sin("const hace8 = new Date(Date.now() - 8 * 86_400_000);")).toEqual([]);
    expect(sin("const iso = (d) => new Date(Date.now() - dias * 86400e3).toISOString();")).toEqual([]);
    expect(sin("const viejo = (Date.now() - 2 * 60_000) / 1000;")).toEqual([]);
    expect(sin("cooldownUntil: { x: Date.now() - 1000 }")).toEqual([]);
    expect(sin(" * antes se medía con Date.now() - t0")).toEqual([]);
    expect(sin("// antes: Date.now() - t0")).toEqual([]);
    expect(sin("const fin = Date.now() + 30000; while (Date.now() < fin) {}")).toEqual([]);
  });
});

describe("la utilidad", () => {
  it("mediana: impar, par y vacía", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNaN();
  });

  it("topeMs: MARGEN veces lo suelto, con suelo y espera fija", () => {
    expect(MARGEN).toBeGreaterThanOrEqual(20);
    expect(topeMs(100)).toBe(MARGEN * 100);
    expect(topeMs(1)).toBe(SUELO_MS);
    expect(topeMs(30, { fijoMs: 600 })).toBe(600 + Math.max(MARGEN * 30, SUELO_MS));
    expect(() => topeMs(0)).toThrow(/positivo/);
    expect(() => topeMs("x")).toThrow(/positivo/);
    expect(() => topeMs(5, { fijoMs: -1 })).toThrow(/espera fija/);
  });

  it("medianaMs y medianaMsAsync ejecutan n veces y devuelven la mediana, no el peor", async () => {
    let llamadas = 0;
    const ms = medianaMs(() => { llamadas++; }, { n: 7 });
    expect(llamadas).toBe(7);
    expect(ms).toBeGreaterThanOrEqual(0);
    // Un pico en una de cinco no mueve la mediana: la clase de #499.
    const esperas = [0, 0, 120, 0, 0];
    const conPico = await medianaMsAsync((i) => new Promise((ok) => setTimeout(ok, esperas[i])), { n: 5 });
    expect(conPico).toBeLessThan(esperas[2]);
  });
});
