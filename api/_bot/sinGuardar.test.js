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
    // Lo que sabe hacer, con ✅ de viñeta (staging, 2 oct 2026).
    expect(diceQueGuardo("¡Hola! Puedo ayudarte con:\n• 🍽️ Enseñarte el menú\n• ✅ Cambiar un plato o generar el menú")).toBe(false);
  });

  it("«apuntad…» negado o con «ninguna» es leer, no guardar (#229: otra vuelta de ~3 s)", () => {
    // Las tres del evaluador, al preguntar qué alergias hay apuntadas.
    expect(diceQueGuardo("De momento no tenéis ninguna alergia apuntada. Si alguien tiene alguna, dímelo cuando quieras y la aplico al momento.")).toBe(false);
    expect(diceQueGuardo("No tenéis ninguna alergia apuntada: cuando os pregunté, no dijisteis nada, así que lo entendí como que no había ninguna.")).toBe(false);
    expect(diceQueGuardo("No tenéis ninguna apuntada: no me dijisteis nada cuando os pregunté, así que lo di por hecho.")).toBe(false);
    expect(diceQueGuardo("No hay nada apuntado todavía.")).toBe(false);
    // Lo afirmado sigue contando aunque la frase lleve un «no» en otra parte.
    expect(diceQueGuardo("No pasa nada. ✅ Apuntado: Leo, sin huevo.")).toBe(true);
    expect(diceQueGuardo("Apuntado que nadie tiene alergias.")).toBe(true);
    expect(diceQueGuardo("No te preocupes, ya está apuntado.")).toBe(true);
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

  it("intentar guardar y fallar no cuenta: «✅ Apuntado» tras un choque pasa por el aviso", async () => {
    // Lo de Nat (2 oct 2026): fuera_de_casa contestó «no he podido guardarlo»
    // y aun así había contado como escritura.
    const fallida = { name: "ajustar_gustos", run: async () => "No he podido guardarlo: conflicto persistente." };
    const { vuelta, llamadas } = guion([
      { dice: "✅ Apuntado.", llama: ["ajustar_gustos"] },
      { dice: "No he podido guardarlo, ¿lo intento otra vez?" },
    ]);
    const r = await ejecutar({ entrada: "nada de coliflor", tools: [fallida], modelos: ["m"], vuelta, guardados: () => 0 });
    expect(llamadas).toHaveLength(2);
    expect(r.corregido).toBe(true);
    // La segunda vuelta dice la verdad («no he podido»): no es un fallo final.
    expect(r.sigueSinGuardar).toBe(false);
  });

  it("si tras el aviso sigue diciendo que guardó sin guardar, queda marcado", async () => {
    const { vuelta } = guion([{ dice: "✅ Apuntado: nada de coliflor." }, { dice: "✅ Hecho, apuntado." }]);
    const r = await ejecutar({ entrada: "nada de coliflor", tools: [ajustarGustos], modelos: ["m"], vuelta });
    expect(r.corregido).toBe(true);
    expect(r.sigueSinGuardar).toBe(true);
  });

  it("una respuesta que solo informa no se toca", async () => {
    const { vuelta, llamadas } = guion([{ dice: "Esta noche, tortilla de patatas." }]);
    await ejecutar({ entrada: "¿qué cenamos?", tools: [verMenu], modelos: ["m"], vuelta });
    expect(llamadas).toHaveLength(1);
  });
});
