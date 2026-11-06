/**
 * La forma de un mensaje de Lola (trozo 54 de #1037): la lista cerrada REGLAS_FORMATO, el revisor que mide cada
 * respuesta, lo que apunta en bot_route y el bloque del manual que sale de la misma lista.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FALTAS_FORMATO, REGLAS_FORMATO, faltasDeFormato, formatoParaElManual } from "./formatoMensaje.js";
import { armarManual } from "./manual.js";
import { CANAL } from "../../src/lib/vocabularios.js";
import { medida } from "../bot/telegram.js";

// El mensaje que vio Pablo en Telegram el 4 nov 2026, tal como lo escribió Lola (antes de sacar los botones).
const DE_PABLO = [
  "¿Para cuándo quieres el menú, y cuánto lo afinamos?",
  "",
  "Desde 2026-11-09 (lunes que viene).",
  "",
  "[[Solo los días]]: me dices qué días coméis en casa y del resto me encargo yo (1 min). Ej.: «de lunes a viernes, solo cenas».",
  "[[Unas preguntas]]: los días y, además, cómo os gusta comer y cómo cocináis (3 min). Ej.: «menos fritos, y tengo airfryer».",
  "[[A fondo]]: repasamos todo: el cole, el presupuesto, los tiempos y los aparatos (5 min). Ej.: «60 € a la semana, y cocino en tandas el domingo».",
  "",
  "También puedes contestarme con tus palabras o en un audio.",
].join("\n");

// La forma buena (la que pidió Pablo): pasa todas las reglas.
const BUENO = [
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
].join("\n");

// Cada caso malo cambia UNA cosa del bueno y debe disparar exactamente su regla.
const MALOS = {
  prosa_larga: BUENO.replace("O cuéntamelo", "Una.\nDos.\nTres.\nO cuéntamelo").replace("¿Te lo preparo desde el <b>lunes 9</b>?", "Te lo preparo desde el <b>lunes 9</b>."),
  varias_preguntas: BUENO.replace("O cuéntamelo con tus palabras o en un audio.", "¿O me lo cuentas en un audio?"),
  pregunta_enterrada: BUENO.replace("O cuéntamelo con tus palabras o en un audio.", "O cuéntamelo con tus palabras.\nTambién vale un audio."),
  fecha_iso: BUENO.replace("<b>lunes 9</b>", "<b>2026-11-09</b>"),
  // La línea rota es la de después de la pregunta, para no añadir prosa detrás de ella (eso es pregunta_enterrada).
  puntuacion_huerfana: BUENO.replace("O cuéntamelo con tus palabras", ": o cuéntamelo con tus palabras"),
  boton_en_linea: BUENO.replace("O cuéntamelo con tus palabras o en un audio.", "O cuéntamelo [[en un audio]]"),
  opcion_sin_negrita: BUENO.replace("O cuéntamelo con tus palabras o en un audio.", "A fondo: también presupuesto (5 min)"),
  markdown: BUENO.replace("<b>lunes 9</b>", "**lunes 9**"),
};

describe("la lista cerrada de reglas de forma", () => {
  it("cada regla con id único, frase y medida; las faltas son sus ids", () => {
    expect(new Set(FALTAS_FORMATO).size).toBe(REGLAS_FORMATO.length);
    for (const r of REGLAS_FORMATO) {
      expect(r.id, r.id).toMatch(/^[a-z_]+$/);
      expect(r.frase.length, r.id).toBeGreaterThan(10);
      expect(typeof r.rompe, r.id).toBe("function");
    }
    // Un caso malo por regla, y ninguno de más: si se añade una regla, se añade su caso.
    expect(Object.keys(MALOS).sort()).toEqual([...FALTAS_FORMATO].sort());
  });

  it("la forma buena no tiene ninguna falta", () => {
    expect(faltasDeFormato(BUENO)).toEqual([]);
  });

  for (const [falta, texto] of Object.entries(MALOS)) {
    it(`romper solo «${falta}» da solo esa falta`, () => {
      expect(faltasDeFormato(texto)).toEqual([falta]);
    });
  }

  it("el mensaje que vio Pablo el 4 nov rompe cinco reglas", () => {
    expect(faltasDeFormato(DE_PABLO)).toEqual(["prosa_larga", "pregunta_enterrada", "fecha_iso", "puntuacion_huerfana", "boton_en_linea"]);
  });

  it("un día del menú o una lista larga no cuentan como prosa", () => {
    const dia = ["<b>Sábado 4 de octubre</b>", "", "🍽️ <b>Comida:</b>", "• Crema de calabaza (20 min)", "• Pollo al horno (55 min)", "", "🌙 <b>Cena:</b>", "<i>Cova:</i>", "• Tortilla (20 min)", "1. Pela la patata."].join("\n");
    expect(faltasDeFormato(dia)).toEqual([]);
  });
});

describe("el manual dice la forma desde la misma lista", () => {
  const MANUAL = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
  const armado = armarManual(MANUAL, { capacidades: [], fichas: new Map(), canal: CANAL.TELEGRAM });

  it("con la marca {{FORMATO}}, una línea por regla", () => {
    expect(MANUAL).toContain("{{FORMATO}}");
    for (const r of REGLAS_FORMATO) expect(armado, r.id).toContain(`- ${r.frase}`);
    expect(formatoParaElManual().split("\n")).toHaveLength(REGLAS_FORMATO.length);
  });
});

describe("lo que apunta bot_route", () => {
  it("lola.formato pasa tal cual (vacía si no hay faltas); sin medir, null", () => {
    const faltas = faltasDeFormato(DE_PABLO);
    expect(medida({ lola: { herramientas: [], formato: faltas } }, {}, 0).lola.formato).toEqual(faltas);
    expect(medida({ lola: { herramientas: [], formato: [] } }, {}, 0).lola.formato).toEqual([]);
    expect(medida({ lola: { herramientas: [] } }, {}, 0).lola.formato).toBeNull();
  });
});
