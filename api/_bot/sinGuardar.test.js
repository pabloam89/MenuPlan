/**
 * El control de «dijo que lo guardó y no lo guardó» (agente.js, ejecutar):
 * Lola contestaba «✅ Apuntado: nada de coliflor» sin llamar a ajustar_gustos.
 * Con una vuelta de mentira en vez del modelo.
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { ejecutar, diceQueGuardo } = await import("./agente.js");

const ajustarGustos = { name: "ajustar_gustos", run: async () => "Guardado." };
const verMenu = { name: "ver_menu", run: async () => "Lunes: lentejas." };
const uso = { input_tokens: 10, output_tokens: 5 };

/** Una vuelta de mentira: contesta lo que toca en cada llamada, y llama a las herramientas que se le digan. */
function guion(pasos) {
  const llamadas = [];
  const vuelta = async (x) => {
    const paso = pasos[llamadas.length];
    llamadas.push(x);
    for (const nombre of paso.llama ?? []) await x.tools.find((t) => t.name === nombre).run({});
    return { dicho: paso.dice, uso };
  };
  return { vuelta, llamadas };
}

describe("lo que suena a «ya está guardado»", () => {
  it("las frases que salieron en las pruebas de 92", () => {
    expect(diceQueGuardo("✅ Apuntado: nada de coliflor. Lo tendré en cuenta en el próximo menú.")).toBe(true);
    expect(diceQueGuardo("Ya os tengo apuntados: Ana, Pablo y Leo (6 años), sin alergias.")).toBe(true);
    expect(diceQueGuardo("Hecho. Manuel come ya lo mismo que vosotros.")).toBe(true);
    expect(diceQueGuardo("Vale, lo he puesto el jueves.")).toBe(true);
  });

  it("lo que solo informa, no", () => {
    expect(diceQueGuardo("Esta noche cenáis tortilla de patatas, y Leo lo mismo.")).toBe(false);
    expect(diceQueGuardo("¿Quieres que lo apunte para la semana que viene?")).toBe(false);
    expect(diceQueGuardo("Pollo hecho al horno con patatas")).toBe(false);
  });
});

describe("ejecutar: si lo dice y no guardó, otra vuelta", () => {
  it("«✅ Apuntado» sin herramienta: repite con el aviso, y vale la segunda respuesta", async () => {
    const { vuelta, llamadas } = guion([
      { dice: "✅ Apuntado: nada de coliflor." },
      { dice: "Apuntado: nada de coliflor en casa.", llama: ["ajustar_gustos"] },
    ]);
    const r = await ejecutar({ entrada: "a partir de ahora nada de coliflor", tools: [ajustarGustos, verMenu], modelos: ["m"], vuelta });
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].entrada).toMatch(/no has llamado a ninguna herramienta que guarde/);
    expect(llamadas[1].historia.at(-1)).toEqual({ role: "assistant", content: "✅ Apuntado: nada de coliflor." });
    expect(r.dicho).toBe("Apuntado: nada de coliflor en casa.");
    expect(r.corregido).toBe(true);
    expect(r.uso.input_tokens).toBe(20);
  });

  it("si de verdad guardó, no se repite", async () => {
    const { vuelta, llamadas } = guion([{ dice: "✅ Apuntado: nada de coliflor.", llama: ["ajustar_gustos"] }]);
    const r = await ejecutar({ entrada: "nada de coliflor", tools: [ajustarGustos], modelos: ["m"], vuelta });
    expect(llamadas).toHaveLength(1);
    expect(r.corregido).toBeUndefined();
  });

  it("leer no cuenta como guardar", async () => {
    const { vuelta, llamadas } = guion([{ dice: "✅ Hecho.", llama: ["ver_menu"] }, { dice: "No he cambiado nada todavía." }]);
    await ejecutar({ entrada: "cambia el lunes", tools: [verMenu], modelos: ["m"], vuelta });
    expect(llamadas).toHaveLength(2);
  });

  it("una respuesta que solo informa no se toca", async () => {
    const { vuelta, llamadas } = guion([{ dice: "Esta noche, tortilla de patatas." }]);
    await ejecutar({ entrada: "¿qué cenamos?", tools: [verMenu], modelos: ["m"], vuelta });
    expect(llamadas).toHaveLength(1);
  });
});
