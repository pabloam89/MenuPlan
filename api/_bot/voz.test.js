import { describe, it, expect } from "vitest";
import { pistaDe, limpiarTranscripcion } from "./voz.js";

describe("voz", () => {
  it("la pista lleva primero los nombres de la casa y luego la cocina", () => {
    const p = pistaDe(["Cova", "Manuel"]);
    expect(p.startsWith("Cova, Manuel, ")).toBe(true);
    expect(p).toContain("airfryer");
    // Whisper solo mira ~224 tokens: la pista tiene que ser corta.
    expect(p.length).toBeLessThan(600);
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
