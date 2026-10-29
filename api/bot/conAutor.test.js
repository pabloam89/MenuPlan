/**
 * Un turno que falla DESPUÉS de escribir (#958): se avisa de que hay algo
 * guardado y el error sigue hacia arriba marcado `avisado`, sin tragarse.
 */
import { describe, it, expect, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const enviados = [];
vi.mock("../_bot/telegram.js", async (original) => ({
  ...(await original()),
  enviar: vi.fn(async (chat, texto) => { enviados.push([chat, texto]); return {}; }),
}));

const { conAutor, FALLO_TRAS_ESCRIBIR } = await import("./telegram.js");
const { contarEnOperacion } = await import("../_bot/operacion.js");

describe("conAutor", () => {
  it("tras escribir, avisa y vuelve a lanzar el error marcado", async () => {
    const err = await conAutor({ chatId: 5, from: { id: 5 } }, async () => {
      contarEnOperacion("user_pantry");
      throw new Error("se cayó la entrega");
    }).catch((e) => e);
    expect(err?.message).toBe("se cayó la entrega");
    expect(err?.avisado).toBe(true);
    expect(enviados).toEqual([[5, FALLO_TRAS_ESCRIBIR]]);
  });

  it("sin escribir nada, el error sigue igual y no se avisa", async () => {
    enviados.length = 0;
    const err = await conAutor({ chatId: 5, from: { id: 5 } }, async () => { throw new Error("antes de escribir"); }).catch((e) => e);
    expect(err?.avisado).toBeUndefined();
    expect(enviados).toEqual([]);
  });
});
