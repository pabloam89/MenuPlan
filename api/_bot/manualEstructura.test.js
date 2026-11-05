/**
 * El manual de Lola en su orden fijo (trozo 58 del plan de fichas, #1037): identidad, principios, seguridad y
 * límites, la ficha, situaciones, ejemplos, la forma de su canal y un recordatorio final. El orden vive en
 * ORDEN_MANUAL (manual.js); aquí se comprueba que conocimiento.md lo sigue.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ORDEN_MANUAL, BLOQUES_MANUAL, titulosDelManual, armarManual } from "./manual.js";
import { CANAL } from "../../src/lib/vocabularios.js";

const MANUAL = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
const VACIO = { capacidades: [], fichas: new Map() };

describe("el manual sigue su orden fijo", () => {
  it("sus títulos «# » son los de ORDEN_MANUAL, en ese orden, y ninguno más", () => {
    expect(titulosDelManual(MANUAL)).toEqual(ORDEN_MANUAL.map((a) => a.titulo));
  });

  it("los bloques van en el orden de BLOQUES_MANUAL, todos, y cada uno junto", () => {
    const bloques = ORDEN_MANUAL.map((a) => a.bloque);
    expect([...new Set(bloques)]).toEqual(BLOQUES_MANUAL);
    const posiciones = bloques.map((b) => BLOQUES_MANUAL.indexOf(b));
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
  });
});

describe("la forma va por canal", () => {
  it("cada canal con forma tiene su apartado, y solo la forma lleva canal", () => {
    for (const a of ORDEN_MANUAL) expect(Boolean(a.canal), a.titulo).toBe(a.bloque === "forma");
    expect(ORDEN_MANUAL.filter((a) => a.bloque === "forma").map((a) => a.canal)).toEqual([CANAL.TELEGRAM]);
  });

  it("con Telegram entra su forma; un canal sin la suya no se arma (WhatsApp todavía no tiene)", () => {
    expect(armarManual(MANUAL, { ...VACIO, canal: CANAL.TELEGRAM })).toMatch(/^# Forma en Telegram$/m);
    expect(() => armarManual(MANUAL, { ...VACIO, canal: CANAL.WHATSAPP })).toThrow(/sin forma para el canal whatsapp/);
    expect(() => armarManual(MANUAL, VACIO)).toThrow(/sin forma para el canal undefined/);
  });
});
