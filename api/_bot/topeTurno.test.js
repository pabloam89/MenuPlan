/**
 * El turno de Lola tiene tope de llamadas y no rellena con «Hecho.» (#958,
 * clase F). Con la vuelta de verdad (agente.js unaVuelta) y el SDK de mentira:
 *  - un runner agotado (pidiendo aún herramientas, sin texto) no dice «Hecho.»
 *    ni dispara otra vuelta entera: antes eran hasta ~32 llamadas por mensaje;
 *  - la vuelta del aviso «dijo que guardó» solo tiene lo que quede del tope.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

// Cada llamada a toolRunner es una vuelta; `guiones` dice qué mensajes da cada una.
const sdk = { guiones: [], runners: [] };
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    constructor() {
      this.beta = { messages: { toolRunner: (params) => {
        sdk.runners.push(params);
        const mensajes = sdk.guiones.shift() ?? [];
        return (async function* () { for (const m of mensajes) yield m; })();
      } } };
    }
  }
  return { default: Anthropic };
});

const { ejecutar } = await import("./agente.js");

const usage = { input_tokens: 1, output_tokens: 1 };
const pide = { content: [{ type: "tool_use", id: "t", name: "ver_menu", input: {} }], stop_reason: "tool_use", usage };
const dice = (texto) => ({ content: [{ type: "text", text: texto }], stop_reason: "end_turn", usage });
const verMenu = { name: "ver_menu", run: async () => "Lunes: lentejas." };

describe("un turno sin texto del modelo (#958)", () => {
  beforeEach(() => { sdk.guiones = []; sdk.runners = []; });

  it("el runner agotado pidiendo herramientas: una sola vuelta, y dice que no terminó", async () => {
    sdk.guiones = [Array(8).fill(pide), [dice("✅ Apuntado.")]];
    const r = await ejecutar({ entrada: "haz de todo", tools: [verMenu], modelos: ["m"] });
    expect(sdk.runners).toHaveLength(1);
    expect(r.dicho).not.toMatch(/^Hecho\.$/);
    expect(r.dicho).toMatch(/No he llegado a terminarlo/);
  });

  it("sin texto y sin guardar nada: ni «Hecho.» ni otra vuelta", async () => {
    sdk.guiones = [[{ ...dice(""), content: [] }], [dice("✅ Apuntado.")]];
    const r = await ejecutar({ entrada: "hola", tools: [verMenu], modelos: ["m"] });
    expect(sdk.runners).toHaveLength(1);
    expect(r.dicho).not.toMatch(/Hecho/);
  });

  it("sin texto pero habiendo guardado: «Hecho.», sin repetir", async () => {
    sdk.guiones = [[{ ...dice(""), content: [] }]];
    const r = await ejecutar({ entrada: "apunta leche", tools: [verMenu], modelos: ["m"], guardados: () => 1 });
    expect(sdk.runners).toHaveLength(1);
    expect(r.dicho).toBe("Hecho.");
  });
});

describe("el tope de llamadas del turno (#958)", () => {
  beforeEach(() => { sdk.guiones = []; sdk.runners = []; });

  it("la primera vuelta tiene 8 llamadas; la del aviso, lo que quede hasta 10", async () => {
    sdk.guiones = [[...Array(6).fill(pide), dice("✅ Apuntado.")], [dice("No lo había guardado, perdona.")]];
    await ejecutar({ entrada: "nada de coliflor", tools: [verMenu], modelos: ["m"], guardados: () => 0 });
    expect(sdk.runners.map((p) => p.max_iterations)).toEqual([8, 3]);
  });
});
