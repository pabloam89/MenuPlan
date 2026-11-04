import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMINO, CAMINOS } from "../../src/lib/caminos.js";
import { BOTONES_CAMINO, BOTONES_CAMINO_TELEGRAM, IDS_CAMINO, PREGUNTA_DE_CAMINO, LEYENDA_CAMINOS, caminoDelBoton, faltaParaGenerar, hayNinosEn, preguntasDelCamino } from "./caminoMenu.js";

describe("los caminos de Lola son los de la app", () => {
  it("los ids y los botones salen de src/lib/caminos.js, sin copiarlos", () => {
    expect(IDS_CAMINO).toEqual(Object.values(CAMINO));
    expect(BOTONES_CAMINO).toBe("[[Lo básico]] [[A tu gusto]] [[Al detalle]]");
  });

  it("los botones de Telegram vuelven con el título, que caminoDelBoton reconoce; la pregunta es la del manual", () => {
    const manual = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
    expect(BOTONES_CAMINO_TELEGRAM.map((x) => caminoDelBoton(x.dato.replace(/^t:/, "")))).toEqual(IDS_CAMINO);
    expect(manual).toContain(PREGUNTA_DE_CAMINO);
  });

  it("la leyenda de generar_menu sale de la misma lista", () => {
    expect(LEYENDA_CAMINOS).toBe("basico = Lo básico, medio = A tu gusto, avanzado = Al detalle");
  });

  it("el manual de Lola enseña los botones con los títulos de CAMINOS (si cambia uno, caminoDelBoton no lo reconocería)", () => {
    const manual = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
    const enElManual = [...manual.matchAll(/\[\[(Lo [^\]]+|A tu [^\]]+|Al [^\]]+)\]\]/g)].map((m) => m[1]);
    expect(new Set(enElManual)).toEqual(new Set(CAMINOS.map((c) => c.titulo)));
    for (const t of enElManual) expect(caminoDelBoton(t)).not.toBe(null);
  });

  it("pulsar un botón da su camino; otro texto, ninguno", () => {
    expect(caminoDelBoton("A tu gusto")).toBe(CAMINO.MEDIO);
    expect(caminoDelBoton(" lo básico ")).toBe(CAMINO.BASICO);
    expect(caminoDelBoton("hazme el menú a tu gusto")).toBe(null);
    expect(caminoDelBoton(undefined)).toBe(null);
  });

  it("las preguntas del cole solo salen con niños en casa", () => {
    const conNinos = preguntasDelCamino(CAMINO.BASICO, { hayNinos: true });
    const sinNinos = preguntasDelCamino(CAMINO.BASICO, { hayNinos: false });
    expect(conNinos).toContain("¿Tienes el menú del cole de tus hijos?");
    expect(sinNinos).not.toContain("¿Tienes el menú del cole de tus hijos?");
    expect(sinNinos).toContain("¿Para qué días quieres el menú?");
    expect(preguntasDelCamino(CAMINO.AVANZADO).length).toBeGreaterThan(preguntasDelCamino(CAMINO.BASICO).length);
  });

  it("sin miembros en la casa (o sin casa), no hay niños", () => {
    expect(hayNinosEn(null)).toBe(false);
    expect(hayNinosEn({ state: { data: {} } })).toBe(false);
  });
});

describe("faltaParaGenerar: no se genera sin preguntar", () => {
  it("sin camino, pide preguntar para cuándo y cómo de a fondo, con los tres botones", () => {
    const r = faltaParaGenerar({ desde: "2026-11-02", texto: "hazme el menú" });
    expect(r).toMatch(/^NO GENERADO: antes de generar, pregunta SIEMPRE para cuándo/);
    expect(r).toContain(BOTONES_CAMINO);
    for (const c of CAMINOS) expect(r).toContain(c.resumen);
  });

  it("un camino que no existe cuenta como sin camino", () => {
    expect(faltaParaGenerar({ camino: "rapido", desde: "2026-11-02" })).toMatch(/pregunta SIEMPRE/);
  });

  it("recién pulsado el camino, toca hacer sus preguntas, aunque el modelo traiga fecha", () => {
    const r = faltaParaGenerar({ camino: CAMINO.MEDIO, desde: "2026-11-02", texto: "A tu gusto" });
    expect(r).toMatch(/^NO GENERADO: acaban de elegir «A tu gusto»/);
    for (const p of preguntasDelCamino(CAMINO.MEDIO)) expect(r).toContain(p);
  });

  it("con camino y sin fecha, pide para cuándo", () => {
    expect(faltaParaGenerar({ camino: CAMINO.BASICO, texto: "para el lunes" })).toMatch(/^NO GENERADO: falta para cuándo/);
  });

  it("con camino y fecha, en otro mensaje que el botón, se genera", () => {
    expect(faltaParaGenerar({ camino: CAMINO.BASICO, desde: "2026-11-02", texto: "comemos todos en casa" })).toBe(null);
  });

  it("el botón «Rehacer la del …» ya trae su semana: no pregunta", () => {
    expect(faltaParaGenerar({ texto: "Rehacer la del 26 oct" })).toBe(null);
  });
});
