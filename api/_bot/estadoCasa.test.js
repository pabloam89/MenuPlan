import { describe, it, expect } from "vitest";
import { resolverPersona, temaDe, claveDePregunta, resuelta, claveLibre, estadoDeClave } from "./estadoCasa.js";

const casa = (extra = {}) => ({
  members: [
    { id: "p1", name: "Pablo", age: 37 },
    { id: "i1", name: "Isa", age: 36 },
    { id: "c1", name: "Cova", age: 0 },
  ],
  ...extra,
});

describe("resolverPersona", () => {
  it("encuentra por nombre, sin mayúsculas ni tildes", () => {
    expect(resolverPersona(casa(), "cova").persona).toEqual({ id: "c1", nombre: "Cova" });
  });
  it("si no está en la casa, pregunta quién es", () => {
    expect(resolverPersona(casa(), "Mario").error).toMatch(/no hay nadie/);
  });
  it("si hay dos con el mismo nombre, pregunta cuál", () => {
    const d = { members: [{ id: "a", name: "Ana López" }, { id: "b", name: "Ana Ruiz" }] };
    expect(resolverPersona(d, "Ana").error).toMatch(/más de una/);
  });
});

describe("temaDe: clasificador determinista, con fronteras de palabra", () => {
  it("alergias e intolerancias", () => {
    expect(temaDe("¿tiene alguna alergia o intolerancia?")).toBe("alergias");
  });
  it("cómo come el bebé", () => {
    expect(temaDe("¿Cova ya come sólidos o sigue con purés?")).toBe("etapa_bebe");
  });
  it("no confunde palabras que contienen otras («purés» dentro de «impurezas»)", () => {
    expect(temaDe("¿quitamos las impurezas del caldo?")).toBe(null);
  });
  it("una pregunta de otra cosa no es de estado", () => {
    expect(temaDe("¿para qué día lo quieres?")).toBe(null);
  });
});

describe("claveDePregunta", () => {
  it("la etapa se liga al bebé", () => {
    expect(claveDePregunta("¿Cova ya come sólidos?", casa())).toBe("etapa:c1");
  });
  it("las alergias se ligan a quien se nombra", () => {
    expect(claveDePregunta("¿Isa tiene alguna alergia?", casa())).toBe("alergias:i1");
  });
  it("sin nombre, al primero que aún no tiene las alergias revisadas", () => {
    const d = casa({ members: [{ id: "p1", name: "Pablo", alergiasRevisadas: true }, { id: "c1", name: "Cova", age: 0 }] });
    expect(claveDePregunta("¿alguna alergia?", d)).toBe("alergias:c1");
  });
  it("una pregunta de otra cosa no tiene clave", () => {
    expect(claveDePregunta("¿para qué día?", casa())).toBe(null);
  });
});

describe("resuelta: el estado decide", () => {
  it("alergias: abierta hasta que se revisan o se apunta alguna", () => {
    expect(resuelta("alergias:c1", casa())).toBe(false);
    expect(resuelta("alergias:c1", casa({ allergiesReviewed: true }))).toBe(true);
  });
  it("etapa: abierta hasta que se sabe cómo come", () => {
    expect(resuelta("etapa:c1", casa())).toBe(false);
    expect(resuelta("etapa:c1", casa({ etapaBebe: "cremas" }))).toBe(true);
  });
  it("si la persona ya no está en la casa, la tarea se descarta, no se da por hecha", () => {
    expect(resuelta("etapa:zz", casa())).toBe(false);
    expect(estadoDeClave("etapa:zz", casa())).toBe("sin_persona");
    expect(estadoDeClave("alergias:zz", casa())).toBe("sin_persona");
    expect(estadoDeClave("alergias:c1", casa())).toBe("pendiente");
    expect(estadoDeClave("alergias:c1", casa({ allergiesReviewed: true }))).toBe("resuelta");
    expect(estadoDeClave("alergias:zz", {})).toBe("pendiente");
  });
  it("una casa que llega sin personas no resuelve nada (lectura a medias)", () => {
    expect(resuelta("alergias:c1", { members: [] })).toBe(false);
    expect(resuelta("etapa:c1", {})).toBe(false);
    expect(resuelta("alergias:c1", { allergiesReviewed: true })).toBe(false);
  });
  it("una clave libre nunca la resuelve el estado", () => {
    expect(resuelta("seguimiento:casa:pan", casa())).toBe(false);
  });
});

describe("claveLibre: dos maneras de pedir lo mismo chocan", () => {
  it("ignora mayúsculas, tildes, relleno y orden", () => {
    expect(claveLibre("seguimiento", "Comprar el pan para el viernes")).toBe(claveLibre("seguimiento", "el viernes, comprar pan"));
  });
  it("lo que es para otra persona es otra tarea", () => {
    expect(claveLibre("seguimiento", "comprar pan", "c1")).not.toBe(claveLibre("seguimiento", "comprar pan"));
  });
  it("sin palabras con contenido, no hay clave", () => {
    expect(claveLibre("seguimiento", "y de la")).toBe(null);
  });
  it("el verbo del encargo no cuenta: «comprar pan para el sábado» = «pan para el sábado»", () => {
    expect(claveLibre("seguimiento", "comprar pan para el sábado")).toBe(claveLibre("seguimiento", "pan para el sábado"));
    expect(claveLibre("seguimiento", "hay que traer leche")).toBe(claveLibre("seguimiento", "leche"));
    expect(claveLibre("seguimiento", "recuérdame coger los yogures")).toBe(claveLibre("seguimiento", "yogures"));
  });
  it("pero no se funden cosas distintas: «pan» y «pan sin gluten»", () => {
    expect(claveLibre("seguimiento", "comprar pan")).not.toBe(claveLibre("seguimiento", "comprar pan sin gluten"));
  });
});

describe("etapa del bebé: hoy es una sola por casa", () => {
  // data.etapaBebe es de la casa (src/lib/babyStage.js): no hay etapa por bebé.
  // Con dos bebés, apuntarla resuelve a los dos; mientras no la haya, a ninguno.
  const dos = { members: [{ id: "cova", name: "Cova", age: 0 }, { id: "leo", name: "Leo", age: 1 }] };
  it("sin etapa, ninguno está resuelto", () => {
    expect(resuelta("etapa:cova", dos)).toBe(false);
    expect(resuelta("etapa:leo", dos)).toBe(false);
  });
  it("con la etapa de la casa, los dos", () => {
    expect(resuelta("etapa:cova", { ...dos, etapaBebe: "mixto" })).toBe(true);
    expect(resuelta("etapa:leo", { ...dos, etapaBebe: "mixto" })).toBe(true);
  });
  it("quien no es bebé no tiene tarea de etapa que resolver", () => {
    expect(resuelta("etapa:ana", { members: [{ id: "ana", name: "Ana", age: 30 }] })).toBe(true);
  });
});
