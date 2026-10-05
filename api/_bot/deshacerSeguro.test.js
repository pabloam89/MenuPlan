import { describe, it, expect } from "vitest";
import { frenoDeshacer, quitaProteccion } from "./supervisor.js";

const leo = (extra = {}) => ({ id: "m1", name: "Leo", allergies: [], intolerances: [], dietaryStates: [], ...extra });
const casa = (...members) => ({ members });

describe("deshacer no quita protección sin confirmarlo", () => {
  it("detecta lo que deshacer quitaría", () => {
    const ahora = casa(leo({ allergies: ["Huevos"] }), { id: "m2", name: "Isa" });
    const antes = casa(leo());
    expect(quitaProteccion(ahora, antes)).toEqual([
      { nombre: "Leo", cosas: ["Huevos"] },
      { nombre: "Isa", cosas: ["persona"] },
    ]);
    expect(quitaProteccion(casa(leo()), casa(leo({ allergies: ["Huevos"] })))).toEqual([]);
  });

  it("un deshacer suelto que quitaría una alergia se frena", () => {
    const ahora = casa(leo({ allergies: ["Huevos"] }));
    const antes = casa(leo());
    expect(frenoDeshacer(ahora, antes, "deshaz lo último", "")).toMatch(/No lo he deshecho/);
    expect(frenoDeshacer(ahora, antes, "sí", "¿Te genero ya el menú?")).toMatch(/No lo he deshecho/);
  });

  it("«No es así» justo después de apuntarla vale: Lola acababa de nombrarla", () => {
    const ahora = casa(leo({ allergies: ["Huevos"] }));
    const antes = casa(leo());
    const anterior = "✅ Apuntado: Leo es alérgico al huevo.";
    expect(frenoDeshacer(ahora, antes, "Deshaz lo último que has cambiado", anterior)).toBe(null);
    expect(frenoDeshacer(ahora, antes, "sí", "¿Seguro que quito la alergia al huevo de Leo?")).toBe(null);
    expect(frenoDeshacer(ahora, antes, "deshaz lo de la alergia al huevo de Leo", "")).toBe(null);
  });

  it("deshacer un alta pide nombrar a la persona", () => {
    const ahora = casa(leo(), { id: "m2", name: "Isa" });
    const antes = casa(leo());
    expect(frenoDeshacer(ahora, antes, "deshaz", "")).toMatch(/Isa/);
    expect(frenoDeshacer(ahora, antes, "Deshaz lo último que has cambiado", "✅ Isa ya está en la casa.")).toBe(null);
  });

  it("si no toca seguridad, deshacer va como siempre", () => {
    const igual = casa(leo({ allergies: ["Huevos"] }));
    expect(frenoDeshacer(igual, igual, "deshaz", "")).toBe(null);
    expect(frenoDeshacer(casa(leo()), casa(leo({ allergies: ["Huevos"] })), "deshaz", "")).toBe(null);
  });
});

