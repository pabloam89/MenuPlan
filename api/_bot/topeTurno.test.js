/**
 * El turno de Lola tiene tope de llamadas y no rellena con «Hecho.» (#958,
 * clase F), con una vuelta de mentira:
 *  - una vuelta sin texto (el runner agotado) no dice «Hecho.» ni dispara otra
 *    vuelta entera: antes eran hasta ~32 llamadas al modelo por mensaje;
 *  - la vuelta del aviso «dijo que guardó» solo tiene lo que quede del tope.
 */
import { describe, it, expect, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { ejecutar, SIN_TEXTO, MAX_LLAMADAS_TURNO, MAX_LLAMADAS_VUELTA } = await import("./agente.js");

const verMenu = { name: "ver_menu", run: async () => "Lunes: lentejas." };
const uso = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

describe("sin texto del modelo (#958)", () => {
  it("una vuelta agotada (pidiendo aún herramientas) no repite: dice que no terminó", async () => {
    const vuelta = vi.fn(async () => ({ dicho: "", uso, vueltas: 8, agotada: true }));
    const r = await ejecutar({ entrada: "haz de todo", tools: [verMenu], modelos: ["m"], vuelta });
    expect(vuelta).toHaveBeenCalledTimes(1);
    expect(r.dicho).toBe(SIN_TEXTO.AGOTADA);
    expect(r.corregido).toBeFalsy();
  });

  it("sin texto y sin guardar nada: ni «Hecho.» ni otra vuelta", async () => {
    const vuelta = vi.fn(async () => ({ dicho: "", uso, vueltas: 1 }));
    const r = await ejecutar({ entrada: "hola", tools: [verMenu], modelos: ["m"], vuelta });
    expect(vuelta).toHaveBeenCalledTimes(1);
    expect(r.dicho).toBe(SIN_TEXTO.NADA);
  });

  it("sin texto pero habiendo guardado: «Hecho.», sin repetir", async () => {
    const vuelta = vi.fn(async () => ({ dicho: "", uso, vueltas: 2 }));
    const r = await ejecutar({ entrada: "apunta leche", tools: [verMenu], modelos: ["m"], vuelta, guardados: () => 1 });
    expect(vuelta).toHaveBeenCalledTimes(1);
    expect(r.dicho).toBe(SIN_TEXTO.HECHO);
  });
});

describe("el tope de llamadas del turno (#958)", () => {
  it("la primera vuelta tiene 8 llamadas; la del aviso, lo que quede hasta 10", async () => {
    const vuelta = vi.fn()
      .mockResolvedValueOnce({ dicho: "✅ Apuntado.", uso, vueltas: 7 })
      .mockResolvedValueOnce({ dicho: "No lo había guardado, perdona.", uso, vueltas: 1 });
    await ejecutar({ entrada: "nada de coliflor", tools: [verMenu], modelos: ["m"], vuelta, guardados: () => 0 });
    expect(MAX_LLAMADAS_VUELTA).toBe(8);
    expect(MAX_LLAMADAS_TURNO).toBe(10);
    expect(vuelta.mock.calls[0][0].maxIteraciones).toBe(8);
    expect(vuelta.mock.calls[1][0].maxIteraciones).toBe(3);
  });

  it("la vuelta del aviso que se queda sin texto no dice «Hecho.» si no guardó", async () => {
    const vuelta = vi.fn()
      .mockResolvedValueOnce({ dicho: "✅ Apuntado.", uso, vueltas: 2 })
      .mockResolvedValueOnce({ dicho: "", uso, vueltas: 1, agotada: true });
    const r = await ejecutar({ entrada: "nada de coliflor", tools: [verMenu], modelos: ["m"], vuelta, guardados: () => 0 });
    expect(r.dicho).toBe(SIN_TEXTO.AGOTADA);
    expect(r.sigueSinGuardar).toBe(false);
  });
});
