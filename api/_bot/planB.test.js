/**
 * El plan B (agente.js): ¿cuándo se pasa al modelo de reserva? Con errores
 * de verdad del SDK, porque la primera versión miraba err.name, que el SDK no
 * pone, y no reconocía una caída de conexión.
 */
import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { esCaida } = await import("./agente.js");

const deLaApi = (status, tipo) => Anthropic.APIError.generate(status, { type: "error", error: { type: tipo, message: "x" } }, "x", new Headers());

describe("esCaida: otro modelo podría contestar", () => {
  it("saturado, caído, sin conexión o sin tiempo: sí", () => {
    expect(esCaida(deLaApi(529, "overloaded_error"))).toBe(true);
    expect(esCaida(deLaApi(500, "api_error"))).toBe(true);
    expect(esCaida(deLaApi(429, "rate_limit_error"))).toBe(true);
    expect(esCaida(new Anthropic.APIConnectionError({ message: "Connection error." }))).toBe(true);
    expect(esCaida(new Anthropic.APIConnectionTimeoutError())).toBe(true);
  });

  it("un error a mitad del stream, que llega sin status: también", () => {
    expect(esCaida(Anthropic.APIError.generate(undefined, { type: "error", error: { type: "overloaded_error" } }, "x", undefined))).toBe(true);
    expect(esCaida(Anthropic.APIError.generate(undefined, { type: "error", error: { type: "api_error" } }, "x", undefined))).toBe(true);
  });

  it("una petición mal hecha o cancelada por nosotros: no (otro modelo no lo arregla)", () => {
    expect(esCaida(deLaApi(400, "invalid_request_error"))).toBe(false);
    expect(esCaida(deLaApi(401, "authentication_error"))).toBe(false);
    expect(esCaida(new Anthropic.APIUserAbortError())).toBe(false);
    expect(esCaida(new Error("turno de la vía rápida"))).toBe(false);
    expect(esCaida(null)).toBe(false);
  });

  it("un error de la base o de Telegram, aunque traiga un status de caída: no (no es la IA)", () => {
    // Como los lanza db.js y telegram.js, con status y código (#211).
    expect(esCaida(Object.assign(new Error("GET /rest/v1/household_state → 503 PGRST002 Could not query the database"), { status: 503, codigo: "PGRST002" }))).toBe(false);
    expect(esCaida(Object.assign(new Error("POST /rest/v1/bot_messages → 409 23505 duplicate key"), { status: 409, codigo: "23505" }))).toBe(false);
    expect(esCaida(Object.assign(new Error("Telegram sendMessage: Too Many Requests: retry after 3"), { servicio: "telegram", status: 429 }))).toBe(false);
    expect(esCaida(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }))).toBe(false);
  });
});
