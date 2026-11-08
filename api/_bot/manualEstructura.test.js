/**
 * El manual de Lola en su orden fijo (trozo 58 del plan de fichas, #1037): identidad, principios, seguridad y
 * límites, la ficha, situaciones, ejemplos, la forma de su canal y un recordatorio final. El orden vive en
 * ORDEN_MANUAL (manual.js); aquí se comprueba que conocimiento.md lo sigue.
 *
 * Y criterio sin mecánica (trozo 59): en qué parámetro va cada cosa lo dicen las herramientas (sus descripciones y
 * sus inputSchema, agente.js), no el manual; y los ejemplos del manual cumplen la forma que mide el revisor
 * (REGLAS_FORMATO, formatoMensaje.js).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ORDEN_MANUAL, BLOQUES_MANUAL, titulosDelManual, armarManual } from "./manual.js";
import { faltasDeFormato } from "./formatoMensaje.js";
import { CANAL } from "../../src/lib/vocabularios.js";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
const { herramientas, FICHAS } = await import("./agente.js");

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

// ── Trozo 59: criterio sin mecánica ─────────────────────────────────────────────────────────────────────────

// Todas las herramientas: las de un titular, que las ve todas (se comprueba contra FICHAS).
const TOOLS = await herramientas({ householdId: "x", chatId: "1", channel: CANAL.TELEGRAM, fotos: [], papel: "owner" });

/** Los nombres de parámetro de un inputSchema, también los de dentro (objetos de una lista, variantes). */
function parametros(s, nombres = new Set()) {
  if (!s || typeof s !== "object") return nombres;
  for (const [k, v] of Object.entries(s.properties ?? {})) { nombres.add(k); parametros(v, nombres); }
  parametros(s.items, nombres);
  for (const v of [...(s.anyOf ?? []), ...(s.oneOf ?? [])]) parametros(v, nombres);
  return nombres;
}
const PARAMETROS = [...new Set(TOOLS.flatMap((t) => [...parametros(t.input_schema ?? t.inputSchema)]))];

// Un nombre de parámetro usado como parámetro: entre comillas invertidas («`fijos`»), seguido de «=» («receta =»)
// o de «:» y un valor de máquina («rehacer: true», «dias: [»). Con «:» y prosa detrás («la comida: no la hacen»)
// es castellano, no un parámetro. Los bordes, con letras de verdad: «también:» no es «n:».
const NOMBRE = `(?<![\\p{L}\\p{N}_])(?:${PARAMETROS.join("|")})(?![\\p{L}\\p{N}_])`;
const COMO_PARAMETRO = new RegExp(`\`${NOMBRE}\`|${NOMBRE}\\s*=|${NOMBRE}:\\s*(?:true|false|null|-?\\d|\\[|\\{|")`, "u");
const lineasConParametro = (texto) => texto.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => COMO_PARAMETRO.test(l));

/** Los ejemplos del manual: cada mensaje entero entre <ejemplo> y </ejemplo>. */
const ejemplosDe = (texto) => [...texto.matchAll(/^<ejemplo>\n([\s\S]*?)\n<\/ejemplo>$/gm)].map((m) => m[1]);

describe("el manual dice el criterio; en qué parámetro va cada cosa lo dicen las herramientas", () => {
  it("los parámetros salen de todas las herramientas de FICHAS", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...FICHAS.keys()].sort());
    expect(PARAMETROS).toEqual(expect.arrayContaining(["fijos", "receta", "rehacer", "confirmado", "ejes"]));
  });

  it("la regla pilla un parámetro y deja la prosa", () => {
    for (const l of ["van en `fijos` de generar_menu", "cambiar_plato con receta = su nombre", "rehacer: true", "con ninguna=true"]) expect(COMO_PARAMETRO.test(l), l).toBe(true);
    for (const l of ["no son de comida: no los apuntes", "dilo tal cual: ninguna cumple", "lo tiene también: dilo", "🍽️ <b>Comida:</b>"]) expect(COMO_PARAMETRO.test(l), l).toBe(false);
  });

  it("ninguna línea del manual nombra un parámetro como parámetro", () => {
    expect(lineasConParametro(MANUAL)).toEqual([]);
  });
});

describe("los ejemplos del manual cumplen la forma (REGLAS_FORMATO)", () => {
  const ejemplos = ejemplosDe(MANUAL);

  it("hay ejemplos, y cada <ejemplo> se cierra", () => {
    expect(ejemplos.length).toBeGreaterThan(0);
    expect(ejemplos.length).toBe((MANUAL.match(/^<ejemplo>$/gm) ?? []).length);
    expect(ejemplos.length).toBe((MANUAL.match(/^<\/ejemplo>$/gm) ?? []).length);
  });

  it("ningún ejemplo tiene faltas de forma", () => {
    expect(ejemplos.map((e) => [e.split("\n")[0], faltasDeFormato(e)]).filter(([, f]) => f.length)).toEqual([]);
  });
});
