import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hoyISO, indiceDiaHoy, indiceDeFecha } from "./hoy.js";
import { hoyISO as hoyDelBot } from "../../api/_bot/casa.js";
import { hoy as diaDelBot } from "../../api/_bot/menu.js";
import { mesActual } from "../../api/_bot/uso.js";

// Jueves 8 de octubre de 2026 a las 00:30 en Madrid (CEST, UTC+2): en UTC aún
// son las 22:30 del miércoles 7. «Hoy» es jueves.
const MADRUGADA = new Date("2026-10-07T22:30:00Z");

describe("hoy de la casa", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(MADRUGADA); });
  afterEach(() => vi.useRealTimers());

  it("a las 00:30 de Madrid, hoy es el día de Madrid y no el de UTC", () => {
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-07"); // el fallo de antes
    expect(hoyISO()).toBe("2026-10-08");
    expect(indiceDiaHoy()).toBe(3); // jueves
  });

  it("la zona es un parámetro: en UTC sigue siendo miércoles", () => {
    expect(hoyISO("UTC")).toBe("2026-10-07");
    expect(indiceDiaHoy("UTC")).toBe(2);
    expect(hoyISO("America/Mexico_City")).toBe("2026-10-07");
  });

  it("el bot usa la misma fecha: casa.hoyISO y menu.hoy", () => {
    expect(hoyDelBot()).toBe("2026-10-08");
    expect(diaDelBot()).toBe("Jue");
  });

  it("en invierno (UTC+1) el cambio de mes también cae en Madrid", () => {
    vi.setSystemTime(new Date("2026-10-31T23:30:00Z")); // 00:30 del domingo 1 de noviembre
    expect(hoyISO()).toBe("2026-11-01");
    expect(indiceDiaHoy()).toBe(6);
    expect(mesActual()).toBe("2026-11-01");
  });
});

describe("indiceDeFecha", () => {
  it("cuenta desde el lunes", () => {
    expect(indiceDeFecha("2026-10-05")).toBe(0);
    expect(indiceDeFecha("2026-10-11")).toBe(6);
  });
});

// Que nadie vuelva a sacar «hoy» en UTC: los sitios arreglados usan hoy.js.
describe("ningún «hoy» en UTC", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const ficheros = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : ficheros(p);
    return /\.(m?js|jsx)$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== "core.mjs" ? [p] : [];
  });
  // Datos de demostración, no el día de nadie; y el tope diario de gasto de
  // _guard.js, que es una cubeta de coste en UTC a propósito, no el día de una casa.
  const FUERA = new Set(["receiptFixtures.js", "socialFixtures.js", "_guard.js"]);

  it("ni new Date().toISOString().slice(0, 10) ni un Intl de Madrid suelto", () => {
    const malos = [];
    for (const f of [...ficheros(path.join(raiz, "src")), ...ficheros(path.join(raiz, "api"))]) {
      if (FUERA.has(path.basename(f)) || path.basename(f) === "hoy.js") continue;
      const s = fs.readFileSync(f, "utf8");
      if (/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(s)) malos.push(`${path.relative(raiz, f)}: toISOString`);
      if (/timeZone: "Europe\/Madrid" \}\)\.format\(new Date\(\)\)/.test(s)) malos.push(`${path.relative(raiz, f)}: Intl suelto`);
    }
    expect(malos).toEqual([]);
  });
});
