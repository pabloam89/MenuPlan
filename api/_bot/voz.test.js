import { describe, it, expect } from "vitest";
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { pistaDe, limpiarTranscripcion, corregirNombres, palabrasDe } = await import("./voz.js");

describe("voz", () => {
  it("la pista: la cocina, las palabras de la casa y, al final, los nombres (Whisper se queda con el final)", () => {
    const p = pistaDe(["Cova", "Manuel"], ["Pastel de cabracho"]);
    expect(p.endsWith("Pastel de cabracho, Cova, Manuel.")).toBe(true);
    expect(p).toContain("airfryer");
    // Whisper solo mira ~224 tokens: la pista tiene que ser corta.
    expect(p.length).toBeLessThanOrEqual(600);
  });

  it("si no cabe, se cae la cocina general y nunca los nombres", () => {
    const propias = Array.from({ length: 30 }, (_, i) => `Receta muy larga de la abuela número ${i}`);
    const p = pistaDe(["Cova", "Manuel"], propias);
    expect(p.length).toBeLessThanOrEqual(600);
    expect(p.endsWith("Cova, Manuel.")).toBe(true);
    expect(p).not.toContain("HoMenu");
    // Aunque los nombres solos no quepan, los nombres no se tiran.
    const muchos = Array.from({ length: 80 }, (_, i) => `Nombrelargo${i}`);
    expect(pistaDe(muchos)).toContain("Nombrelargo0,");
  });

  it("las palabras de la casa: quién come, sus recetas y lo que no les gusta", () => {
    const w = palabrasDe({
      members: [{ name: "Iker", dislikes: ["coliflor"] }, { name: "Uxue" }],
      userRecipes: [{ name: "Marmitako de la amama" }], excluidos: ["hígado"],
    });
    expect(w.nombres).toEqual(["Iker", "Uxue"]);
    expect(w.propias).toEqual(["Marmitako de la amama", "coliflor", "hígado"]);
  });

  it("un nombre de la casa mal oído se corrige; lo demás no se toca", () => {
    const casa = ["Leo", "Iker", "Lucía", "María José"];
    expect(corregirNombres("Lío no quiere pescado", casa)).toBe("Leo no quiere pescado");
    expect(corregirNombres("Para Iquer, sin gluten", casa)).toBe("Para Iker, sin gluten");
    expect(corregirNombres("Lucia cena fuera", casa)).toBe("Lucía cena fuera");
    // Palabras corrientes en mayúscula, y nombres de verdad de otra gente.
    expect(corregirNombres("Los martes cena Mario con nosotros", ["María"])).toBe("Los martes cena Mario con nosotros");
    expect(corregirNombres("Una cena ligera", ["Ana"])).toBe("Una cena ligera");
    // En minúscula no es un nombre: «leo» es del verbo leer.
    expect(corregirNombres("ya leo la receta", casa)).toBe("ya leo la receta");
    // Suena igual: es de la casa aunque sea un nombre corriente.
    expect(corregirNombres("Jimena cena fuera", ["Ximena"])).toBe("Ximena cena fuera");
    // Una palabra corriente que se parece a alguien de la casa, y otra inicial.
    expect(corregirNombres("Esa receta no", ["Elsa"])).toBe("Esa receta no");
    expect(corregirNombres("Dora viene a cenar", ["Nora"])).toBe("Dora viene a cenar");
    // Si se parece a dos de la casa, no se adivina.
    expect(corregirNombres("Lía cena fuera", ["Lea", "Lio"])).toBe("Lía cena fuera");
  });

  it("lo que se dice de verdad pasa tal cual", () => {
    const json = { segments: [{ text: " Manuel es celíaco.", no_speech_prob: 0.01, avg_logprob: -0.2 }] };
    expect(limpiarTranscripcion(json, pistaDe(["Manuel"]))).toBe("Manuel es celíaco.");
  });

  it("las frases que Whisper se inventa con silencio no llegan a Lola", () => {
    expect(limpiarTranscripcion({ text: "Subtítulos realizados por la comunidad de Amara.org" })).toBe("");
    expect(limpiarTranscripcion({ text: "¡Gracias por ver el vídeo!" })).toBe("");
    expect(limpiarTranscripcion({ text: "Pon lentejas el lunes. Suscríbete al canal." })).toBe("Pon lentejas el lunes.");
  });

  it("un segmento sin voz se descarta, y la pista devuelta tal cual es vacío", () => {
    const json = { segments: [
      { text: "Gracias.", no_speech_prob: 0.9, avg_logprob: -1.4 },
      { text: "Cena ligera hoy.", no_speech_prob: 0.05, avg_logprob: -0.3 },
    ] };
    expect(limpiarTranscripcion(json)).toBe("Cena ligera hoy.");
    const pista = pistaDe(["Cova", "Manuel"]);
    expect(limpiarTranscripcion({ text: pista }, pista)).toBe("");
    // Pero una respuesta corta que está en la pista sí vale.
    expect(limpiarTranscripcion({ text: "Macarrones." }, pista)).toBe("Macarrones.");
  });
});
