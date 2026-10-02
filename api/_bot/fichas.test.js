/**
 * Lo que Lola ve de sus herramientas (nombre, descripción, esquema y orden),
 * exactamente como sale hacia la API. Si esta foto cambia, cambia lo que lee
 * el modelo: eso pide pasar bot-evals antes de mergear. Una reorganización
 * del código no puede moverla ni un carácter.
 */
import { describe, it, expect, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
// dominiosGustos.json no está en git (lo genera build-bot-core): sin esto la
// foto dependería de la máquina.
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { herramientas } = await import("./agente.js");

describe("lo que Lola ve de sus herramientas", () => {
  it("no cambia sin querer", async () => {
    const tools = await herramientas({ householdId: "x", chatId: "1", channel: "telegram", fotos: [] });
    expect(JSON.stringify(tools, null, 1)).toMatchSnapshot();
  });
});
