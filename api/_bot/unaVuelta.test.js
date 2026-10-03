/**
 * La vuelta de verdad (agente.js unaVuelta) con el SDK de mentira: lo que
 * apunta en `progreso` (la pista lo mira para saber si puede cortar a Lola) y
 * dónde va la pista en la petición (detrás del punto de caché).
 */
import { describe, it, expect, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

// Cada vuelta del runner es un stream que escribe sus trozos al pedirle el final.
const guion = { mensajes: [], params: null };
vi.mock("@anthropic-ai/sdk", () => {
  const stream = (m) => {
    const oyentes = [];
    return {
      on: (ev, f) => { if (ev === "text") oyentes.push(f); },
      finalMessage: async () => {
        for (const b of m.content) if (b.type === "text") for (const f of oyentes) f(b.text);
        return m;
      },
    };
  };
  class Anthropic {
    constructor() {
      this.beta = { messages: { toolRunner: (params) => { guion.params = params; return (async function* () { for (const m of guion.mensajes) yield stream(m); })(); } } };
    }
  }
  return { default: Anthropic };
});

const { ejecutar } = await import("./agente.js");
const msg = (texto) => ({ content: texto ? [{ type: "text", text: texto }] : [{ type: "tool_use", id: "t1", name: "ver_menu", input: {} }], usage: { input_tokens: 1, output_tokens: 1 } });

describe("unaVuelta: progreso y pista", () => {
  it("cuenta cada llamada acabada y marca cuando ya hay texto", async () => {
    guion.mensajes = [msg(null), msg("El sábado hay lentejas.")];
    const progreso = { vueltas: 0, herramientas: 0, texto: false };
    const vistos = [];
    await ejecutar({ entrada: "¿qué hay el sábado?", tools: [], modelos: ["claude-sonnet-5"], progreso, alEscribir: (t) => vistos.push(t) });
    expect(progreso.vueltas).toBe(2);
    expect(progreso.texto).toBe(true);
    expect(vistos.at(-1)).toBe("El sábado hay lentejas.");
  });

  it("sin texto, no marca texto", async () => {
    guion.mensajes = [msg(null)];
    const progreso = { vueltas: 0, herramientas: 0, texto: false };
    await ejecutar({ entrada: "hola", tools: [], modelos: ["claude-sonnet-5"], progreso, alEscribir: () => {} });
    expect(progreso.texto).toBe(false);
  });

  it("la pista va detrás del mensaje, sin punto de caché", async () => {
    guion.mensajes = [msg("Vale.")];
    await ejecutar({ entrada: "hola", tools: [], modelos: ["claude-sonnet-5"], pista: "[Pista del sistema] x", alEscribir: () => {} });
    const ultimo = guion.params.messages.at(-1).content;
    expect(ultimo[0]).toMatchObject({ text: "hola", cache_control: { type: "ephemeral" } });
    expect(ultimo[1]).toEqual({ type: "text", text: "[Pista del sistema] x" });
  });

  it("lo fijo (instrucciones y ficha) con caché de 1 h, delante; el mensaje con 5 min, detrás", async () => {
    guion.mensajes = [msg("Vale.")];
    await ejecutar({ entrada: "hola", tools: [], modelos: ["claude-sonnet-5"], ficha: { estable: "CASA", delDia: "HOY" }, alEscribir: () => {} });
    const marcas = guion.params.system.filter((b) => b.cache_control).map((b) => b.cache_control.ttl);
    expect(marcas).toEqual(["1h", "1h", "1h"]);
    // La API exige los de 1 h antes que los de 5 min: el del mensaje va sin ttl (5 min).
    expect(guion.params.messages.at(-1).content[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("apunta cada llamada al modelo: ms, tokens de salida y primer trozo de texto", async () => {
    guion.mensajes = [msg(null), msg("Listo.")];
    const r = await ejecutar({ entrada: "¿qué hay el sábado?", tools: [], modelos: ["claude-sonnet-5"], alEscribir: () => {} });
    expect(r.llamadas).toHaveLength(2);
    for (const [ms, out] of r.llamadas) {
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(out).toBe(1);
    }
    // La primera llamada solo pidió una herramienta: sin texto. La segunda, sí.
    expect(r.llamadas[0][2]).toBeNull();
    expect(r.llamadas[1][2]).toBeGreaterThanOrEqual(0);
  });
});
