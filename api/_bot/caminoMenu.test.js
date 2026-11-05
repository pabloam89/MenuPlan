import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lineaDeCamino, rellenos } from "./manual.js";
import { CAMINO, CAMINOS } from "../../src/lib/caminos.js";
import { BOTONES_CAMINO, BOTONES_CAMINO_TELEGRAM, IDS_CAMINO, PREGUNTA_DE_CAMINO, LEYENDA_CAMINOS, caminoDelBoton, faltaParaGenerar, hayNinosEn, preguntaDeCamino, preguntasDelCamino } from "./caminoMenu.js";
import { faltasDeFormato } from "./formatoMensaje.js";

describe("los caminos de Lola son los de la app", () => {
  it("los ids y los botones salen de src/lib/caminos.js, sin copiarlos", () => {
    expect(IDS_CAMINO).toEqual(Object.values(CAMINO));
    expect(BOTONES_CAMINO).toBe("[[Solo los días]]\n[[Unas preguntas]]\n[[A fondo]]");
  });

  it("los botones de Telegram vuelven con el título, que caminoDelBoton reconoce; la pregunta es la del manual", () => {
    const manual = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
    expect(BOTONES_CAMINO_TELEGRAM.map((x) => caminoDelBoton(x.dato.replace(/^t:/, "")))).toEqual(IDS_CAMINO);
    expect(manual).toContain(PREGUNTA_DE_CAMINO);
  });

  it("la leyenda de generar_menu sale de la misma lista", () => {
    expect(LEYENDA_CAMINOS).toBe("basico = Solo los días, medio = Unas preguntas, avanzado = A fondo");
  });

  it("el manual enseña los caminos desde CAMINOS (marca {{CAMINOS}}): cada uno con su botón en negrita, y los ejemplos aparte", () => {
    const manual = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
    expect(manual).toContain("{{CAMINOS}}");
    const lineas = rellenos({ capacidades: [], fichas: new Map() }).CAMINOS.split("\n");
    expect(lineas).toHaveLength(CAMINOS.length + 1);
    for (const [i, c] of CAMINOS.entries()) {
      expect(c.ejemplo, c.id).toMatch(/\S/);
      expect(lineas[i].startsWith(`<b>${c.titulo}</b>: ${c.enChat}`), c.id).toBe(true);
      // El botón de verdad no va dentro de la línea: el chat se lo lleva y deja «:» (4 nov 2026).
      expect(lineas[i]).not.toContain("[[");
      expect(lineas.at(-1)).toContain(c.ejemplo);
      expect(caminoDelBoton(c.titulo)).toBe(c.id);
    }
  });

  it("pulsar un botón da su camino; otro texto, ninguno", () => {
    expect(caminoDelBoton("Unas preguntas")).toBe(CAMINO.MEDIO);
    expect(caminoDelBoton(" solo los días ")).toBe(CAMINO.BASICO);
    expect(caminoDelBoton("hazme el menú a fondo")).toBe(null);
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

// El caso de Pablo (4 nov 2026, miércoles): esta semana ya tiene menú, la que viene no.
const HOY = "2026-11-04";
const ESTA = [{ weekStart: "2026-11-02", weekEnd: "2026-11-08" }];

describe("la pregunta del camino, en corto (trozo 60)", () => {
  it("el caso de Pablo: la semana sin menú y su lunes en humano, una línea por camino y los botones al final", () => {
    expect(preguntaDeCamino({ hoy: HOY, semanas: ESTA })).toBe([
      "Del 9 al 15 de noviembre no tenéis menú. ¿Te lo preparo desde el <b>lunes 9</b>?",
      "",
      "<b>Solo los días</b>: me dices cuándo coméis en casa (1 min)",
      "<b>Unas preguntas</b>: además, gustos y cómo cocináis (3 min)",
      "<b>A fondo</b>: también presupuesto, cole y tiempos (5 min)",
      "",
      "O cuéntamelo con tus palabras o en un audio.",
      "",
      "[[Solo los días]]",
      "[[Unas preguntas]]",
      "[[A fondo]]",
    ].join("\n"));
  });

  it("sin menú esta semana, desde hoy; sin semana libre, la pregunta abierta", () => {
    expect(preguntaDeCamino({ hoy: HOY, semanas: [] })).toMatch(/^Del 4 al 8 de noviembre no tenéis menú\. ¿Te lo preparo desde el <b>miércoles 4<\/b>\?/);
    const llenas = Array.from({ length: 10 }, (_, i) => ({
      weekStart: new Date(Date.UTC(2026, 10, 2 + 7 * i)).toISOString().slice(0, 10),
      weekEnd: new Date(Date.UTC(2026, 10, 8 + 7 * i)).toISOString().slice(0, 10),
    }));
    expect(preguntaDeCamino({ hoy: HOY, semanas: llenas }).split("\n")[0]).toBe(PREGUNTA_DE_CAMINO);
  });

  it("pasa todas las reglas de forma, con semana y sin ella", () => {
    expect(faltasDeFormato(preguntaDeCamino({ hoy: HOY, semanas: ESTA }))).toEqual([]);
    expect(faltasDeFormato(preguntaDeCamino({ hoy: HOY, semanas: [] }))).toEqual([]);
  });
});

describe("la línea de cada camino (trozo 60)", () => {
  it("el botón en negrita, qué pasa y cuánto, sin el botón de verdad dentro de la frase", () => {
    const linea = lineaDeCamino({ titulo: "Solo los días", enChat: "me dices cuándo coméis en casa", minutos: 1 });
    expect(linea).toBe("<b>Solo los días</b>: me dices cuándo coméis en casa (1 min)");
    expect(faltasDeFormato(`${linea}\n\n[[Solo los días]]`)).toEqual([]);
  });

  it("quita el punto final, y solo el punto: una frase sin punto conserva su última letra", () => {
    expect(lineaDeCamino({ titulo: "A", enChat: "uno, dos.", minutos: 5 })).toBe("<b>A</b>: uno, dos (5 min)");
    expect(lineaDeCamino({ titulo: "A", enChat: "cole y tiempos", minutos: 5 })).toBe("<b>A</b>: cole y tiempos (5 min)");
  });
});

describe("faltaParaGenerar: no se genera sin preguntar", () => {
  it("sin camino, trae la pregunta corta entera para mandarla tal cual, y el lunes para generar", () => {
    const r = faltaParaGenerar({ desde: "2026-11-02", texto: "hazme el menú", hoy: HOY, semanas: ESTA });
    expect(r).toMatch(/^NO GENERADO: antes de generar, pregunta SIEMPRE para cuándo/);
    expect(r).toContain(preguntaDeCamino({ hoy: HOY, semanas: ESTA }));
    expect(r).toContain("desde 2026-11-09");
  });

  it("sin camino y sin saber qué día es hoy, lanza: no se propone una semana a ciegas", () => {
    expect(() => faltaParaGenerar({ texto: "hazme el menú" })).toThrow(/hace falta hoy/);
  });

  it("un camino que no existe cuenta como sin camino", () => {
    expect(faltaParaGenerar({ camino: "rapido", desde: "2026-11-02", hoy: HOY })).toMatch(/pregunta SIEMPRE/);
  });

  it("recién pulsado el camino, toca hacer sus preguntas, aunque el modelo traiga fecha", () => {
    const r = faltaParaGenerar({ camino: CAMINO.MEDIO, desde: "2026-11-02", texto: "Unas preguntas" });
    expect(r).toMatch(/^NO GENERADO: acaban de elegir «Unas preguntas»/);
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

  it("con lo que la casa ya sabe, no repite esos temas (trozo 65)", () => {
    const ejes = { mealStructure: { estado: "falta" }, cookLevel: { estado: "sabido" } };
    const preguntas = preguntasDelCamino(CAMINO.MEDIO, { ejes });
    expect(preguntas).toEqual(["¿Cuántos platos por comida?"]);
    const r = faltaParaGenerar({ camino: CAMINO.MEDIO, desde: "2026-11-02", texto: "Unas preguntas", ejes });
    expect(r).toContain("¿Cuántos platos por comida?");
    expect(r).not.toContain("¿Cuánto os gusta cocinar?");
  });

  it("si al elegir camino no falta nada, no pregunta: con fecha, se genera (trozo 65)", () => {
    expect(faltaParaGenerar({ camino: CAMINO.BASICO, desde: "2026-11-02", texto: "Solo los días", ejes: { schedule: { estado: "sabido" } }, preguntado: true })).toBeNull();
  });
});
