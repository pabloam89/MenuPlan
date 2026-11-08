import { describe, it, expect } from "vitest";
import { conRasgos, segunEstilo } from "./menu.js";
import { recipeCatalog } from "../../src/data/recipeCatalog.js";

const estrella = recipeCatalog.filter((r) => r.estrella && r.category !== "bebes");

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
