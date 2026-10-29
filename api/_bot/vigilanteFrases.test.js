/**
 * El vigilante de «dice que lo guardó» (diceQueGuardo, agente.js), con las
 * frases que se le escapaban (#958): Lola decía que había cambiado algo sin
 * haber llamado a nada que guarde, y el aviso no saltaba.
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const { diceQueGuardo, tipoDePromesa } = await import("./agente.js");

describe("el vigilante ve las frases que se le escapaban", () => {
  it.each([
    "He cambiado la cena del jueves por merluza.",
    "Te he añadido el pan a la lista.",
    "He borrado los yogures de la compra.",
    "Ya está: el lunes cenáis crema de calabacín.",
    "¡Ya está! Os he quitado el pescado.",
    "Os hemos marcado la leche como comprada.",
    "He eliminado la tarea del dentista.",
    // Entre «no» y «he» hay palabras que no son pronombres: no es negarlo.
    "No olvides que he apuntado leche.",
    "Lo he puesto el jueves.",
  ])("«%s» dice que guardó", (frase) => {
    expect(diceQueGuardo(frase)).toBe(true);
    expect(tipoDePromesa(frase)).toBe("guardado");
  });
});

describe("lo negado, preguntado, leído o de cocina sigue sin contar", () => {
  it.each([
    "No he cambiado nada todavía.",
    "No te he añadido nada.",
    "No he borrado nada.",
    "No te lo he quitado: sigue en la lista.",
    "No lo he cambiado.",
    "¿Quieres que te lo cambie?",
    "El arroz ya está.",
    "Te he puesto los botones para mandarlo.",
    "He hecho una lista con lo que falta.",
  ])("«%s» no dice que guardó", (frase) => {
    expect(diceQueGuardo(frase)).toBe(false);
  });
});
