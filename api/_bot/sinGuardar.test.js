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
    // El «no» niega otra cosa: «te he apuntado» es decir que guardó.
    expect(diceQueGuardo("No olvides que te he apuntado leche")).toBe(true);
    expect(diceQueGuardo("Nada más: os he apuntado el pan")).toBe(true);
    // Y negado de verdad, no.
    expect(diceQueGuardo("No te he apuntado nada todavía")).toBe(false);
    expect(diceQueGuardo("No lo he apuntado")).toBe(false);
  });
});

describe("lo que suena a «ya está arreglado» (#911)", () => {
  it("la frase de producción del 20 oct y sus variantes", () => {
    expect(diceQueGuardo("Ya está arreglado. Te propongo tres primeros para el viernes:")).toBe(true);
    expect(diceQueGuardo("Ya está cambiado, el viernes cenáis tortilla.")).toBe(true);
    expect(diceQueGuardo("Perfecto, ya está hecho.")).toBe(true);
    expect(diceQueGuardo("Queda arreglado el viernes.")).toBe(true);
    expect(diceQueGuardo("Ya lo he arreglado: el primero es ahora crema de puerros.")).toBe(true);
    expect(diceQueGuardo("Ya lo cambié por una crema.")).toBe(true);
    expect(diceQueGuardo("¡Listo!")).toBe(true);
    expect(diceQueGuardo("Vale. Arreglado.")).toBe(true);
  });

  it("lo que solo informa, pregunta o niega, no", () => {
    expect(diceQueGuardo("¿Ya está arreglado o prefieres otro primero?")).toBe(false);
    expect(diceQueGuardo("Todavía no está arreglado: ¿cuál de estos tres te pongo?")).toBe(false);
    expect(diceQueGuardo("Nada está cambiado aún: para poner una, dime cuál.")).toBe(false);
    expect(diceQueGuardo("No he cambiado nada todavía.")).toBe(false);
    expect(diceQueGuardo("Aún no lo he arreglado, ¿cuál prefieres?")).toBe(false);
    expect(diceQueGuardo("¿Quieres que lo deje hecho para el viernes?")).toBe(false);
    // «listo» y «hecho» como adjetivos de otra cosa.
    expect(diceQueGuardo("Estoy listo para proponerte opciones, dime el día.")).toBe(false);
    expect(diceQueGuardo("Cuando esté listo el arroz, lo sacas del fuego.")).toBe(false);
    expect(diceQueGuardo("Te propongo tres primeros para el viernes:")).toBe(false);
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

  it("«Ya está arreglado» tras solo proponer opciones: repite con el aviso (#911)", async () => {
    const proponer = { name: "proponer_platos", run: async () => "Opciones: 1. Crema de puerros 2. Tortilla 3. Merluza. Nada está cambiado aún." };
    const { vuelta, llamadas } = guion([
      { dice: "Ya está arreglado. Te propongo tres primeros para el viernes.", llama: ["proponer_platos"] },
      { dice: "Te propongo tres primeros para el viernes: crema de puerros, tortilla o merluza. ¿Cuál te pongo?" },
    ]);
    // proponer_platos es de solo lectura: en producción no cuenta como guardado.
    const r = await ejecutar({ entrada: "No pega el arroz con tomate con ensalada de lentejas", tools: [proponer], modelos: ["m"], vuelta, guardados: () => 0 });
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].entrada).toMatch(/cambiado, arreglado o hecho/);
    expect(r.corregido).toBe(true);
    expect(r.sigueSinGuardar).toBe(false);
    expect(r.dicho).not.toMatch(/ya est[aá] arreglado/i);
  });

  it("si de verdad cambió el plato, «ya está cambiado» no se toca (#911)", async () => {
    const cambiar = { name: "cambiar_plato", run: async () => "Cambiado." };
    const { vuelta, llamadas } = guion([{ dice: "Ya está cambiado: el viernes, crema de puerros.", llama: ["cambiar_plato"] }]);
    const r = await ejecutar({ entrada: "cambia el primero del viernes por crema de puerros", tools: [cambiar], modelos: ["m"], vuelta, guardados: () => 1 });
    expect(llamadas).toHaveLength(1);
    expect(r.corregido).toBeUndefined();
  });

  it("una respuesta que solo informa no se toca", async () => {
    const { vuelta, llamadas } = guion([{ dice: "Esta noche, tortilla de patatas." }]);
    await ejecutar({ entrada: "¿qué cenamos?", tools: [verMenu], modelos: ["m"], vuelta });
    expect(llamadas).toHaveLength(1);
  });
});
