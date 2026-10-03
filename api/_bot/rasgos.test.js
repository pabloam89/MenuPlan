import { describe, it, expect, beforeAll } from "vitest";
import { conRasgos, segunEstilo, conEje, usarDerivados } from "./menu.js";
import { recipeCatalog } from "../../src/data/recipeCatalog.js";
import { densidadDe, cargaDe } from "../../src/lib/derive/ejesDePlato.js";

const estrella = recipeCatalog.filter((r) => r.estrella && r.category !== "bebes");
const base = estrella.find((r) => [r.protein_g, r.fiber_g, r.carbs_g, r.fat_g, r.kcal].every((v) => v != null));

describe("conEje, «más/menos» de un número contra el plato de ahora", () => {
  beforeAll(() => usarDerivados({ densidadDe, cargaDe }));
  it("«más carbos» deja solo lo que tiene más carbohidratos que el plato de ahora", () => {
    const { lista, aviso } = conEje(estrella, { cual: "carbohidratos", direccion: "mas" }, base);
    expect(aviso).toBeNull();
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((r) => r.carbs_g > base.carbs_g)).toBe(true);
  });
  it("«menos grasa» va en la otra dirección", () => {
    const { lista, aviso } = conEje(estrella, { cual: "grasa", direccion: "menos" }, base);
    expect(aviso).toBeNull();
    expect(lista.every((r) => r.fat_g < base.fat_g)).toBe(true);
  });
  it("una candidata sin el dato no pasa el filtro", () => {
    const sinDato = { ...estrella[0], carbs_g: null };
    const { lista } = conEje([sinDato, ...estrella.slice(0, 3)], { cual: "carbohidratos", direccion: "mas" }, base);
    expect(lista).not.toContain(sinDato);
  });
  it("si ninguna supera el plato de ahora, avisa y devuelve la lista sin tocar", () => {
    const pocas = estrella.slice(0, 5);
    const { lista, aviso } = conEje(pocas, { cual: "proteina", direccion: "mas" }, { ...base, protein_g: 9999 });
    expect(aviso).toMatch(/Ninguna/);
    expect(lista).toHaveLength(5);
  });
  it("un eje que no existe avisa sin inventar nada", () => {
    const { lista, aviso } = conEje(estrella, { cual: "omega3", direccion: "mas" }, base);
    expect(aviso).toMatch(/No tengo/);
    expect(lista).toBe(estrella);
  });
  it("«carga» y «densidadNutricional» responden: el registro ya tiene lector para los dos", () => {
    expect(conEje(estrella, { cual: "carga", direccion: "mas" }, base).aviso).toBeNull();
    expect(conEje(estrella, { cual: "densidadNutricional", direccion: "menos" }, base).aviso).toBeNull();
  });
  it("sin plato de ahora (hueco vacío o ideas sin menú) ordena en la dirección pedida", () => {
    const { lista, aviso } = conEje(estrella, { cual: "carbohidratos", direccion: "mas" });
    expect(aviso).toBeNull();
    expect(lista).toHaveLength(estrella.length);
    const cs = lista.map((r) => r.carbs_g).filter((v) => v != null);
    expect(cs).toEqual([...cs].sort((a, b) => b - a));
  });
  it("se combina con un rasgo categórico: cumplen los dos a la vez", () => {
    const sinPicante = conRasgos(estrella, { picante: "sin" }).lista;
    const { lista, aviso } = conEje(sinPicante, { cual: "carbohidratos", direccion: "mas" }, base);
    expect(aviso).toBeNull();
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((r) => r.picante === "no" && r.carbs_g > base.carbs_g)).toBe(true);
  });
});

describe("conRasgos, sobre el Recetario Estrella de verdad", () => {
  it("«reconfortante y de cuchara» da platos de cuchara reconfortantes, y hay para elegir", () => {
    const { lista, aviso } = conRasgos(estrella, { connotacion: "reconfortante", textura: "cuchara" });
    expect(aviso).toBeNull();
    expect(lista.length).toBeGreaterThan(20);
    expect(lista.every((r) => r.textura === "cuchara" && r.connotacion.includes("reconfortante"))).toBe(true);
  });
  it("«barato y que no pique» solo deja lo que sabemos barato (sin coste, fuera)", () => {
    const { lista } = conRasgos(estrella, { coste: "economico", picante: "sin" });
    expect(lista.length).toBeGreaterThan(20);
    expect(lista.every((r) => r.costeNivel === "economico" && r.picante === "no")).toBe(true);
  });
  it("si nada cumple, devuelve las de siempre y un aviso, nunca una lista vacía", () => {
    const pocas = estrella.slice(0, 5).map((r) => ({ ...r, textura: "tenedor" }));
    const { lista, aviso } = conRasgos(pocas, { textura: "mano" });
    expect(lista).toHaveLength(5);
    expect(aviso).toMatch(/Ninguna/);
  });
  it("sin rasgos, no toca nada", () => {
    expect(conRasgos(estrella, null).lista).toBe(estrella);
  });
});

describe("segunEstilo «ligero» por la etiqueta", () => {
  it("primero las ligeras, luego las medias (cae a medio si no hay bastantes)", () => {
    const l = [
      { id: "a", kcal: 300, caloriasNivel: "medio" },
      { id: "b", kcal: 500, caloriasNivel: "contundente" },
      { id: "c", kcal: 320, caloriasNivel: "ligero" },
      { id: "d", kcal: 200, caloriasNivel: "ligero" },
    ];
    expect(segunEstilo(l, "ligero").map((r) => r.id)).toEqual(["d", "c", "a", "b"]);
  });
  it("un primero de 400 kcal no pasa por delante de un segundo ligero de 330", () => {
    const l = [
      { id: "primero", kcal: 400, caloriasNivel: "medio" },
      { id: "segundo", kcal: 330, caloriasNivel: "ligero" },
    ];
    expect(segunEstilo(l, "ligero")[0].id).toBe("segundo");
  });
});
