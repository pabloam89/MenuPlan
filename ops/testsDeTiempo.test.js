import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ficherosDeGit } from "./ficherosGit.js";
import {
  EXCEPCIONES_TIEMPO, LINEAS_MARCA, MARGEN, SATURACION, SUELO_MS, TESTIGO_SUELTO_MS, maquinaSaturada, mediana, medianaMs, medianaMsAsync, medidasSinMargen, testigoMs, topeConTestigo, topeMs,
} from "../scripts/lib/medirTiempo.mjs";

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

  it("las excepciones están vacías y no pueden crecer", () => {
    expect(EXCEPCIONES_DE_PARTIDA).toHaveLength(0);
    expect(EXCEPCIONES_TIEMPO, "La lista no crece: arregla el test con la utilidad").toHaveLength(0);
  });
});

describe("el escáner, visto fallar", () => {
  const sin = (cuerpo) => medidasSinMargen(cuerpo).map((m) => m.motivo);

  it("señala una medida a mano sin marca, con performance.now, Date.now o hrtime", () => {
    // La medida y su comparación con un número: las dos faltas.
    expect(sin("const t0 = performance.now();\nf();\nexpect(performance.now() - t0).toBeLessThan(200);")).toEqual(["sin-marca", "tope-sin-margen"]);
    expect(sin("const t0 = Date.now();\nexpect(Date.now() - t0).toBeLessThan(1500);")).toEqual(["sin-marca", "tope-sin-margen"]);
    expect(sin("mejor = Math.min(mejor, performance.now() - t0);")).toEqual(["sin-marca"]);
    expect(sin("return { v, ms: Date.now() - t };")).toEqual(["sin-marca"]);
    expect(sin("const [s, ns] = process.hrtime(t0);")).toEqual(["sin-marca"]);
  });

  it("una marca con menos de 20x o una fecha que no existe no vale", () => {
    expect(sin("// tiempo: margen 8x medido 2026-10-10\nconst d = Date.now() - t0;")).toEqual(["margen-corto"]);
    expect(sin("// tiempo: margen 25x medido 2026-02-30\nconst d = Date.now() - t0;")).toEqual(["fecha-mala"]);
    expect(sin("// tiempo: margen 8x medido 2026-10-10\nexpect(Date.now() - t0).toBeLessThan(800);")).toEqual(["margen-corto", "tope-sin-margen"]);
    const lejos = `// tiempo: margen 25x medido 2026-10-10\n${"x();\n".repeat(LINEAS_MARCA + 1)}expect(Date.now() - t0).toBeLessThan(800);`;
    expect(sin(lejos)).toEqual(["sin-marca", "tope-sin-margen"]);
  });

  it("una marca buena vale: la de margen hasta LINEAS_MARCA encima; «sin tope», solo en la línea o la anterior", () => {
    expect(sin("// tiempo: margen 25x medido 2026-10-10 (suelto ~160 ms)\nexpect(Date.now() - t0).toBeLessThan(4000);")).toEqual([]);
    expect(sin("fila.wallMs = Date.now() - t; // tiempo: sin tope — se informa")).toEqual([]);
    expect(sin("// tiempo: sin tope — se informa\nfila.wallMs = Date.now() - t;")).toEqual([]);
    expect(sin("// tiempo: sin tope — se informa\nx();\nfila.wallMs = Date.now() - t;")).toEqual(["sin-marca"]);
  });

  it("dos lecturas del reloj restadas, también con new Date()", () => {
    expect(sin("const t0 = performance.now();\nf();\nconst t1 = performance.now();\nconst d = t1 - t0;")).toEqual(["sin-marca"]);
    expect(sin("const a = new Date();\nconst b = Date.now();\nlog(b - a);")).toEqual(["sin-marca"]);
    expect(sin("const t0 = new Date();\nexpect(new Date() - t0).toBeLessThan(500);")).toEqual(["sin-marca", "tope-sin-margen"]);
    // Restar dos números que no son lecturas del reloj no es una medida.
    expect(sin("const a = 5;\nconst b = 3;\nconst d = a - b;")).toEqual([]);
  });

  it("con la utilidad, el tope tiene que salir de topeMs o topeConTestigo, también por un nombre", () => {
    expect(sin("expect(medianaMs(() => f())).toBeLessThan(200);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(await medianaMsAsync(g)).toBeLessThanOrEqual(1500);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(medianaMs(() => f(), { n: 3 })).toBeLessThan(topeMs(6));")).toEqual([]);
    // El nombre que recibe la mediana se sigue, y el del tope también.
    expect(sin("const tarda = medianaMs(f);\nexpect(tarda).toBeLessThan(800);")).toEqual(["tope-sin-margen"]);
    expect(sin("const tarda = await medianaMsAsync(f);\nconst limite = topeConTestigo(100, { testigoAhoraMs: 60 });\nexpect(tarda).toBeLessThan(limite);")).toEqual([]);
    // Una marca «sin tope» no tapa un tope a mano.
    expect(sin("// tiempo: sin tope — x\nexpect(medianaMs(f)).toBeLessThan(200);")).toEqual(["tope-sin-margen"]);
  });

  it("un expect partido en varias líneas se ve entero", () => {
    expect(sin("expect(\n  medianaMs(() => f()),\n  'mensaje',\n)\n  .toBeLessThan(\n    800,\n  );")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(\n  medianaMs(() => f()),\n)\n  .toBeLessThan(\n    topeMs(6),\n  );")).toEqual([]);
  });

  it("un nombre de duración (ms, …Ms, …_ms) contra un número, sin topeMs ni marca", () => {
    expect(sin("expect(ruta.primer_ms).toBeLessThan(120);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(r.duracionMs).toBeLessThanOrEqual(LIMITE);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(ms).toBeLessThan(2000);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(ruta.primer_ms).toBeLessThan(ruta.ms); // tiempo: relación — el primer texto antes")).toEqual([]);
    // Un límite inferior no se rompe con la carga: no cuenta.
    expect(sin("expect(ruta.ms).toBeGreaterThanOrEqual(75);")).toEqual([]);
    // Ni algo que no es una duración.
    expect(sin("expect(r.razon).toBeLessThan(8);")).toEqual([]);
  });

  it("«relación» es entre dos medidas: contra un número solo, falla", () => {
    expect(sin("expect(ruta.primer_ms).toBeLessThan(120); // tiempo: relación — trampa")).toEqual(["relacion-con-numero"]);
    expect(sin("// tiempo: relación — trampa\nexpect(ms).toBeLessThan(60 * 1000);")).toEqual(["relacion-con-numero"]);
    expect(sin("expect(c.plazoModeloMs).toBeLessThan(canario.maxDuration * 1000); // tiempo: relación — plazos")).toEqual([]);
  });

  it("con «sin tope», el nombre que recibe la medida sigue siendo una duración", () => {
    expect(sin("const d = Date.now() - t0; // tiempo: sin tope — se informa\nexpect(d).toBeLessThan(500);")).toEqual(["tope-sin-margen"]);
    expect(sin("mejor = Math.min(mejor, performance.now() - t0); // tiempo: sin tope — x\nexpect(mejor).toBeLessThanOrEqual(800);")).toEqual(["tope-sin-margen"]);
    expect(sin("const d = Date.now() - t0; // tiempo: sin tope — se informa\nlog(d);")).toEqual([]);
  });

  it("topeMs y topeConTestigo son el argumento entero, no una parte", () => {
    expect(sin("expect(ms).toBeLessThan(topeMs(6) * 2);")).toEqual(["tope-sin-margen"]);
    expect(sin("expect(ms).toBeLessThan(Math.min(topeMs(6), 500));")).toEqual(["tope-sin-margen"]);
    expect(sin("const t = topeMs(6) * 2;\nexpect(ms).toBeLessThan(t);")).toEqual(["tope-sin-margen"]);
    expect(sin("const t = topeConTestigo(6, { testigoAhoraMs: x });\nexpect(ms).toBeLessThan(t);")).toEqual([]);
    expect(sin("expect(ms).toBeLessThan(topeMs(6, { fijoMs: 50 }));")).toEqual([]);
  });

  it("no confunde cuentas de fechas, comentarios ni cadenas", () => {
    expect(sin("const hace8 = new Date(Date.now() - 8 * 86_400_000);")).toEqual([]);
    expect(sin("const iso = (d) => new Date(Date.now() - dias * 86400e3).toISOString();")).toEqual([]);
    expect(sin("const viejo = (Date.now() - 2 * 60_000) / 1000;")).toEqual([]);
    expect(sin("cooldownUntil: { x: Date.now() - 1000 }")).toEqual([]);
    expect(sin("/**\n * antes se medía con Date.now() - t0\n */")).toEqual([]);
    expect(sin("// antes: Date.now() - t0")).toEqual([]);
    expect(sin("const fin = Date.now() + 30000; while (Date.now() < fin) {}")).toEqual([]);
    // El cuerpo de un proceso hijo, en una cadena, no es una medida del test.
    expect(sin("const cuerpo = \"const t = Date.now(); while (Date.now() - t < 9) {}\";")).toEqual([]);
    expect(sin("const url = \"https://x\"; const t0 = Date.now();\nexpect(Date.now() - t0).toBeLessThan(5);")).toEqual(["sin-marca", "tope-sin-margen"]);
    // Lo de dentro de ${…} de una plantilla sí es código.
    expect(sin("const t0 = Date.now();\nlog(`van ${Date.now() - t0} ms`);")).toEqual(["sin-marca"]);
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

  it("topeConTestigo: crece con la carga de la máquina, no con la lentitud del código", () => {
    // El caso de #499: el hook suelto ~100 ms, y con carga sostenida 4 s en las tres medidas;
    // el testigo, en la misma tanda, también ~36 veces más lento.
    const conCarga = topeConTestigo(100, { testigoAhoraMs: 2000, testigoSueltoMs: 56 });
    expect(4000).toBeGreaterThan(topeMs(100)); // sin testigo, rojo falso
    expect(4000).toBeLessThan(conCarga); // con testigo, pasa
    // El hook se vuelve lento por su cuenta con la máquina libre: el testigo no se mueve y se caza.
    const libre = topeConTestigo(100, { testigoAhoraMs: 56, testigoSueltoMs: 56 });
    expect(libre).toBe(topeMs(100));
    expect(4000).toBeGreaterThan(libre);
    // Una máquina más rápida que la del día de la medida no baja el tope.
    expect(topeConTestigo(100, { testigoAhoraMs: 20, testigoSueltoMs: 56 })).toBe(topeMs(100));
    expect(topeConTestigo(30, { testigoAhoraMs: 112, testigoSueltoMs: 56, fijoMs: 600 })).toBe(600 + MARGEN * 60);
    expect(() => topeConTestigo(100, {})).toThrow(/testigo/);
    expect(TESTIGO_SUELTO_MS).toBeGreaterThan(0);
  });

  it("maquinaSaturada: por encima de SATURACION no se compara y queda la línea contable", () => {
    const fichero = join(mkdtempSync(join(tmpdir(), "tiempos-")), "t.txt");
    const antes = process.env.MENUPLAN_TIEMPOS;
    process.env.MENUPLAN_TIEMPOS = fichero;
    try {
      // La carga de #499: el testigo, unas 44 veces lo suelto.
      expect(maquinaSaturada(44 * 56, { testigoSueltoMs: 56, etiqueta: "prueba" })).toBe(true);
      expect(maquinaSaturada(9 * 56, { testigoSueltoMs: 56, etiqueta: "prueba" })).toBe(false);
      expect(maquinaSaturada(SATURACION * 56, { testigoSueltoMs: 56 })).toBe(false);
    } finally {
      if (antes === undefined) delete process.env.MENUPLAN_TIEMPOS;
      else process.env.MENUPLAN_TIEMPOS = antes;
    }
    expect(readFileSync(fichero, "utf8").trim().split("\n")).toEqual(["tiempo: maquina-saturada testigo_ms: 2464.0 factor: 44.0 etiqueta: prueba"]);
    expect(SATURACION).toBeGreaterThan(1);
    expect(() => maquinaSaturada(0)).toThrow(/testigo/);
  });

  it("testigoMs mide arrancar un proceso de verdad", () => {
    expect(testigoMs({ n: 1 })).toBeGreaterThan(0);
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
