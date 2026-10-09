// Los umbrales del vigía (#267) viven en un sitio, y lo que depende de ellos
// tiene que cuadrar: los motivos son los del vocabulario, las ventanas caben
// en lo que guarda Vercel, el cron del workflow es el de `cadaMin` y el
// canario tiene en Vercel lo mismo que el webhook.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { VIGIA, minutosALeer } from "./vigia.js";
import { MOTIVOS_FALLO } from "./vocabularios.js";
import { CLAVES_PROPIAS } from "../../scripts/vigia.mjs";

const raiz = new URL("../../", import.meta.url);
const leer = (f) => readFileSync(new URL(f, raiz), "utf8");

describe("vigía: la configuración", () => {
  it("cada regla con motivos del vocabulario y umbrales con sentido", () => {
    for (const r of VIGIA.reglas) {
      expect(r.motivos.length, r.clave).toBeGreaterThan(0);
      for (const m of r.motivos) expect(MOTIVOS_FALLO, `${r.clave}: ${m}`).toContain(m);
      expect(r.abrirDesde, r.clave).toBeGreaterThan(0);
      // Si cerrara con lo mismo que abre, abriría y cerraría en bucle.
      expect(r.cerrarBajoDe, r.clave).toBeLessThanOrEqual(r.abrirDesde);
      expect(r.cerrarBajoDe, r.clave).toBeGreaterThan(0);
      expect(r.calmaMin, r.clave).toBeGreaterThanOrEqual(r.ventanaMin);
      // Una ventana más corta que la pasada se salta fallos entre pasadas.
      expect(r.ventanaMin, r.clave).toBeGreaterThanOrEqual(VIGIA.cadaMin);
    }
  });

  it("todos los motivos tienen una regla propia, además de la de todos", () => {
    const propias = VIGIA.reglas.filter((r) => r.motivos.length < MOTIVOS_FALLO.length);
    for (const m of MOTIVOS_FALLO) expect(propias.some((r) => r.motivos.includes(m)), m).toBe(true);
  });

  it("las claves no se repiten ni chocan con las del canario y los logs", () => {
    const claves = VIGIA.reglas.map((r) => r.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const c of CLAVES_PROPIAS) expect(claves).not.toContain(c);
  });

  it("ninguna ventana pasa de lo que Vercel guarda de logs", () => {
    expect(minutosALeer()).toBeLessThanOrEqual(VIGIA.retencionLogsMin);
    expect(minutosALeer()).toBe(Math.max(...VIGIA.reglas.map((r) => r.calmaMin)));
  });

  it("el cron del workflow corre cada `cadaMin`, y el hueco que avisa deja margen a los retrasos de GitHub", () => {
    const yml = leer(".github/workflows/vigia-lola.yml");
    const cron = yml.match(/cron:\s*"([^"]+)"/)?.[1];
    expect(cron).toBeTruthy();
    const minutos = cron.split(" ")[0].split(",").map(Number);
    expect(minutos.length * VIGIA.cadaMin).toBe(60);
    for (let i = 1; i < minutos.length; i++) expect(minutos[i] - minutos[i - 1]).toBe(VIGIA.cadaMin);
    expect(cron.split(" ").slice(1).join(" ")).toBe("* * * *");
    expect(VIGIA.huecoMin).toBeGreaterThan(2 * VIGIA.cadaMin);
  });

  it("el canario cabe en su plazo y en el de la función de Vercel", () => {
    const vercel = JSON.parse(leer("vercel.json"));
    const canario = vercel.functions["api/bot/canario.js"];
    const webhook = vercel.functions["api/bot/telegram.js"];
    expect(canario, "api/bot/canario.js en vercel.json").toBeTruthy();
    // Lo que lee el agente en tiempo de ejecución tiene que viajar también con el canario.
    expect(canario.includeFiles).toBe(webhook.includeFiles);
    const c = VIGIA.canario;
    expect(c.lentoMs).toBeLessThan(c.plazoModeloMs);
    expect(c.plazoModeloMs).toBeLessThan(canario.maxDuration * 1000);
    expect(c.plazoSaludMs).toBeLessThan(c.plazoModeloMs);
    expect(c.modeloCadaHoras * 60).toBeGreaterThan(VIGIA.cadaMin);
    expect(c.fallosParaAbrir).toBeGreaterThanOrEqual(1);
  });
});
