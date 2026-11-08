/**
 * Un turno que falla DESPUÉS de escribir (#958): se avisa de que hay algo
 * guardado, el fallo queda apuntado (fallaCon, «turno_tras_escribir») y no se
 * relanza, para que la cola del chat siga con lo que llegó entretanto.
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
  it("tras escribir, avisa, apunta el fallo y no corta la cola", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await conAutor({ chatId: 5, from: { id: 5 } }, async () => {
      contarEnOperacion("user_pantry");
      throw new Error("se cayó la entrega");
    });
    expect(r).toBeUndefined();
    expect(enviados).toEqual([[5, FALLO_TRAS_ESCRIBIR]]);
    expect(error.mock.calls.flat().join(" ")).toMatch(/turno_tras_escribir/);
  });

  it("sin escribir nada, el error sigue hacia arriba y no se avisa", async () => {
    enviados.length = 0;
    await expect(conAutor({ chatId: 5, from: { id: 5 } }, async () => { throw new Error("antes de escribir"); })).rejects.toThrow("antes de escribir");
    expect(enviados).toEqual([]);
  });
});
