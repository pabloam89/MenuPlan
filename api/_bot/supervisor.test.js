import { describe, it, expect } from "vitest";
import { supervisar } from "./supervisor.js";

describe("supervisor: lo que quita protección necesita a la persona", () => {
  it("quitar una alergia: sí con un «sí», no con una duda", () => {
    const args = { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true };
    const pregunta = { anterior: "¿Seguro que Leo ya no es alérgico al huevo? Si me dices que sí, lo quito." };
    expect(supervisar("ajustar_alergias", args, "Sí", pregunta)).toBe(null);
    expect(supervisar("ajustar_alergias", args, "vale, quítalo", pregunta)).toBe(null);
    expect(supervisar("ajustar_alergias", args, "quítale el huevo a Leo, ya lo tolera")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "¿y si probamos a darle huevo?")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "el pediatra dice que igual lo supera")).toMatch(/No se ha guardado/);
  });

  it("«nadie tiene alergias»: dicho o confirmado", () => {
    const args = { ninguna: true, confirmado: true };
    expect(supervisar("ajustar_alergias", args, "no, nadie tiene alergias")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "sí, confirmo")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "somos cuatro, dos adultos y dos niños")).toMatch(/No se ha guardado/);
  });

  it("un «no» o un «nada» a secas también es la respuesta (Pablo, 1 oct 2026)", () => {
    const args = { ninguna: true, confirmado: true };
    expect(supervisar("ajustar_alergias", args, "Nada nada, feel free")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "no")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "No, tranquila")).toBe(null);
    expect(supervisar("ajustar_alergias", args, "nada que yo sepa")).toBe(null);
    // Con algo más dentro, ya no es un «no» a secas.
    expect(supervisar("ajustar_alergias", args, "no hay manera de que coma huevo")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "nada de marisco para Leo")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "no sé, déjame preguntar")).toMatch(/No se ha guardado/);
  });

  it("lo que parece un sí y no lo es", () => {
    const args = { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true };
    // Con la pregunta de Lola delante: lo que se prueba es que no es un sí.
    const pregunta = { anterior: "¿Seguro que Leo ya no es alérgico al huevo?" };
    expect(supervisar("ajustar_alergias", args, "si le damos huevo, ¿qué pasa?", pregunta)).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "Claro que no, sigue siendo alérgico", pregunta)).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "Vale, pero no quites nada todavía", pregunta)).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "no hay manera de que coma huevo")).toMatch(/No se ha guardado/);
  });

  it("y los síes de verdad, escritos de cualquier manera", () => {
    const args = { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true };
    const pregunta = { anterior: "¿Seguro que Leo ya no es alérgico al huevo?" };
    expect(supervisar("ajustar_alergias", args, "si", pregunta)).toBe(null);
    expect(supervisar("ajustar_alergias", args, "¡Sí!", pregunta)).toBe(null);
    expect(supervisar("ajustar_alergias", args, "[Ana]: sí, quítalo", pregunta)).toBe(null);
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "No, no tiene alergias nadie")).toBe(null);
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "no hay alergias en casa")).toBe(null);
  });

  it("apuntar una alergia no se frena (añade protección)", () => {
    expect(supervisar("ajustar_alergias", { persona: "Leo", alergenos: ["huevos"], confirmado: true }, "Leo es alérgico al huevo")).toBe(null);
  });

  it("quitar a alguien: si lo pide con su nombre, o con un sí", () => {
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "quita a Leo, ya no come aquí")).toBe(null);
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "sí", { anterior: "¿Seguro que Leo ya no come en casa?" })).toBe(null);
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "Leo esta semana está de campamentos")).toMatch(/No se ha quitado/);
    expect(supervisar("quitar_comensal", { nombre: "Isa" }, "quita a Leo")).toMatch(/No se ha quitado/);
  });

  it("quitar a alguien: un «sí» a otra cosa o una ausencia no bastan (auditoría A1, A3)", () => {
    // Un sí suelto, sin pregunta que nombre a Leo.
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "sí")).toMatch(/No se ha quitado/);
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "vale", { anterior: "¿Te genero ya el menú?" })).toMatch(/No se ha quitado/);
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "sí", { anterior: "¿Seguro que Isa ya no come en casa?" })).toMatch(/No se ha quitado/);
    // Ausencias, no bajas.
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "Leo ya no viene los jueves")).toMatch(/No se ha quitado/);
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "quita a Leo esta semana, está de vacaciones")).toMatch(/No se ha quitado/);
    // «Leonor» no es «Leo».
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "quita a Leonor")).toMatch(/No se ha quitado/);
    // Bajas de verdad.
    expect(supervisar("quitar_comensal", { nombre: "Leo" }, "Leo ya no vive en casa, quítalo")).toBe(null);
  });

  it("quitar una alergia hablando del plato no la quita (auditoría A2)", () => {
    const leche = { persona: "Leo", alergenos: ["leche"], quitar: true, confirmado: true };
    expect(supervisar("ajustar_alergias", leche, "quítale el queso a Leo")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", leche, "a la pizza de Leo quítale el queso")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", leche, "Leo ya no es alérgico a la leche, quítasela")).toBe(null);
    expect(supervisar("ajustar_alergias", leche, "Sí", { anterior: "¿Seguro que Leo ya no es alérgico a la leche?" })).toBe(null);
  });

  it("lo que llega en audio se mira igual (sin el «[nota de voz]» que se le pone a Lola)", () => {
    expect(supervisar("ajustar_alergias", { ninguna: true, confirmado: true }, "[nota de voz] Nada nada, feel free")).toBe(null);
    expect(supervisar("ajustar_alergias", { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true }, "[nota de voz] Sí", { anterior: "¿Seguro que Leo ya no es alérgico al huevo?" })).toBe(null);
  });

  it("quitar: el «sí» tiene que ser a ESA persona y ESE alérgeno", () => {
    const args = { persona: "Leo", alergenos: ["huevos"], quitar: true, confirmado: true };
    // Un sí suelto, sin pregunta de Lola que lo diga: no.
    expect(supervisar("ajustar_alergias", args, "Sí")).toMatch(/No se ha guardado/);
    // Un sí a otra cosa (otra persona, otro alérgeno): no.
    expect(supervisar("ajustar_alergias", args, "Sí", { anterior: "¿Seguro que Isa ya no es alérgica al huevo?" })).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "Sí", { anterior: "¿Seguro que Leo ya tolera los frutos secos?" })).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "Sí", { anterior: "¿Te genero ya el menú?" })).toMatch(/No se ha guardado/);
    // Pedirlo de otra persona o de otro alérgeno: no.
    expect(supervisar("ajustar_alergias", args, "quítale el huevo a Isa")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", args, "quítale los frutos secos a Leo")).toMatch(/No se ha guardado/);
    // Varios alérgenos: todos nombrados.
    const dos = { ...args, alergenos: ["huevos", "frutos_cascara"] };
    expect(supervisar("ajustar_alergias", dos, "quítale el huevo a Leo")).toMatch(/No se ha guardado/);
    // Sin hablar de la alergia puede ser el plato: pide confirmación.
    expect(supervisar("ajustar_alergias", dos, "a Leo quítale el huevo y las nueces")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_alergias", dos, "a Leo quítale la alergia al huevo y a las nueces")).toBe(null);
    // Toda la casa.
    expect(supervisar("ajustar_alergias", { ...args, persona: "toda la casa", alergenos: ["gluten"] }, "quita el gluten, ya nadie es celíaco")).toBe(null);
  });

  it("quitar una intolerancia o un estado: igual, quién y qué", () => {
    const lactancia = { persona: "Marta", estados: ["lactancia"], quitar: true, confirmado: true };
    expect(supervisar("ajustar_salud", lactancia, "Marta ya no da el pecho, hemos destetado")).toBe(null);
    expect(supervisar("ajustar_salud", lactancia, "Sí", { anterior: "¿Seguro que Marta ya no está con la lactancia?" })).toBe(null);
    expect(supervisar("ajustar_salud", lactancia, "Sí")).toMatch(/No se ha guardado/);
    expect(supervisar("ajustar_salud", lactancia, "Sí", { anterior: "¿Seguro que Marta ya no tiene intolerancia a la lactosa?" })).toMatch(/No se ha guardado/);
    const lactosa = { persona: "Leo", intolerancias: ["lactosa_fina"], quitar: true, confirmado: true };
    expect(supervisar("ajustar_salud", lactosa, "quítale lo de la lactosa a Leo")).toBe(null);
    expect(supervisar("ajustar_salud", lactosa, "¿y si probamos con leche sin lactosa?")).toMatch(/No se ha guardado/);
    // Apuntar no se frena.
    expect(supervisar("ajustar_salud", { persona: "Marta", estados: ["embarazo"], confirmado: true }, "estoy embarazada")).toBe(null);
  });

  it("lo demás pasa sin mirar", () => {
    expect(supervisar("cambiar_plato", { dia: "jueves" }, "")).toBe(null);
  });
});
