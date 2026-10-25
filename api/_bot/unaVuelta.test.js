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
      // Lo que lleva contado el stream a medias (message_start trae la entrada entera).
      currentMessage: { usage: m.usage },
      finalMessage: async () => {
        if (m.cortar) throw Object.assign(new Error("cortado"), { name: "APIUserAbortError" });
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
const { usoParcialDe } = await import("./medidaTurno.js");
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
    guion.mensajes = [msg(null), msg("El sábado, lentejas.")];
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

  it("si se corta a media vuelta, en progreso queda lo ya pagado: la vuelta acabada y la entrada de la cortada", async () => {
    const uso = (i, o, cr, cw) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw });
    guion.mensajes = [
      { ...msg(null), usage: uso(10, 50, 30000, 0) },
      { ...msg("Listo."), cortar: true, usage: uso(4, 2, 31000, 120) },
    ];
    const progreso = { vueltas: 0, herramientas: 0, texto: false };
    await expect(ejecutar({ entrada: "hola", tools: [], modelos: ["claude-sonnet-5"], progreso, alEscribir: () => {} })).rejects.toThrow("cortado");
    expect(usoParcialDe(progreso)).toEqual({ in: 14, out: 52, cr: 61000, cw: 120 });
  });

  it("acabada la vuelta, la que ya sumó no se cuenta dos veces", async () => {
    guion.mensajes = [{ ...msg("Hola."), usage: { input_tokens: 7, output_tokens: 3 } }];
    const progreso = { vueltas: 0, herramientas: 0, texto: false };
    await ejecutar({ entrada: "hola", tools: [], modelos: ["claude-sonnet-5"], progreso, alEscribir: () => {} });
    expect(usoParcialDe(progreso)).toEqual({ in: 7, out: 3, cr: 0, cw: 0 });
  });

  it("cada herramienta apunta cuándo empezó (para medir el reloj, no la suma)", async () => {
    guion.mensajes = [msg("Listo.")];
    const tool = { name: "ver_menu", run: async () => "ok" };
    const r = await ejecutar({ entrada: "x", tools: [tool], modelos: ["m"], vuelta: async (x) => { await x.tools[0].run({}); return { dicho: "ok", uso: {} }; } });
    expect(r.herramientas[0].t0).toBeGreaterThan(0);
    expect(r.herramientas[0].t0 + r.herramientas[0].ms).toBeLessThanOrEqual(Date.now());
  });
});
