import { describe, it, expect, vi } from "vitest";
import { buscarHibrido, pasaRasgos } from "./buscador.js";

const receta = (id, extra = {}) => ({ id, name: id, estrella: true, category: "carnes", ingredients: [], time: 30, ...extra });
const catalogo = [
  receta("merluza_horno", { category: "pescados", mainProtein: "pescado_blanco", tecnica: "horno" }),
  receta("arroz_gambas", { category: "pasta_arroces", mainProtein: "marisco", ingredients: [{ name: "Gambas" }], tecnica: "olla" }),
  receta("lentejas", { category: "legumbres", mainProtein: "legumbre", textura: "cuchara", temperatura: "caliente", tecnica: "olla", connotacion: ["casero", "reconfortante"] }),
  receta("pollo_horno", { mainProtein: "pollo", ingredients: [{ name: "Pollo" }], tecnica: "horno" }),
  receta("gazpacho", { category: "sopas_cremas", textura: "cuchara", temperatura: "frio", tecnica: "crudo", connotacion: ["fresco"] }),
  receta("garbanzos", { category: "legumbres", mainProtein: "legumbre", textura: "cuchara", temperatura: "caliente", tecnica: "olla" }),
];
const carpetaDe = (r) => r.category;
// El vector «prefiere» el orden que se le dé.
const vector = (orden) => vi.fn(async () => new Map(orden.map((id, i) => [id, 1 - i / 10])));
const ids = (r) => r.recetas.map((x) => x.id);

describe("buscarHibrido", () => {
  it("los rasgos mandan sobre el parecido: «cuchara para el frío» pone delante lo caliente de cuchara", async () => {
    const r = await buscarHibrido("algo de cuchara para el frío", { catalogo, carpetaDe, deps: { parecidos: vector(["gazpacho", "lentejas", "garbanzos"]), haiku: vi.fn() } });
    expect(ids(r).slice(0, 2).sort()).toEqual(["garbanzos", "lentejas"]);
    expect(r.via).toBe("vectores");
  });

  it("una negación resuelta excluye por proteína e ingredientes, no solo por carpeta, y se vectoriza sin lo negado", async () => {
    const parecidos = vector(["arroz_gambas", "merluza_horno", "lentejas"]);
    const r = await buscarHibrido("algo para cenar que no sea pescado", { catalogo, carpetaDe, deps: { parecidos, haiku: vi.fn() } });
    expect(ids(r)).not.toContain("merluza_horno");
    expect(ids(r)).not.toContain("arroz_gambas");
    expect(parecidos).toHaveBeenCalledWith("algo para cenar");
    // Si no queda nada que vectorizar, ni se llama.
    parecidos.mockClear();
    await buscarHibrido("que no sea pescado", { catalogo, carpetaDe, deps: { parecidos, haiku: vi.fn() } });
    expect(parecidos).not.toHaveBeenCalled();
  });

  it("solo entra el Recetario Estrella: una receta con estrella undefined o false no se cuela", async () => {
    const cat = [...catalogo, receta("reserva_a", { estrella: undefined }), receta("reserva_b", { estrella: false })];
    const r = await buscarHibrido("algo de cuchara", { catalogo: cat, carpetaDe, deps: { parecidos: vector(["reserva_a", "reserva_b", "lentejas"]), haiku: vi.fn() } });
    expect(ids(r)).toContain("lentejas");
    expect(ids(r)).not.toContain("reserva_a");
    expect(ids(r)).not.toContain("reserva_b");
  });

  it("una negación que no se entiende va a Haiku, y lo que trae Haiku respeta la carpeta del que llama", async () => {
    const haiku = vi.fn(async () => ["merluza_horno", "lentejas", "garbanzos"]);
    const r = await buscarHibrido("algo que no sea muy pesado", { catalogo, carpetaDe, categoria: "legumbres", deps: { parecidos: vector([]), haiku } });
    expect(r.via).toBe("haiku");
    expect(ids(r)).toEqual(["lentejas", "garbanzos"]);
  });

  it("sin vector y sin rasgos → Haiku; sin vector pero con rasgos → rasgos, sin Haiku", async () => {
    const haiku = vi.fn(async () => ["pollo_horno"]);
    const caido = vi.fn(async () => null);
    expect((await buscarHibrido("algo que me sorprenda", { catalogo, carpetaDe, deps: { parecidos: caido, haiku } })).via).toBe("haiku");
    haiku.mockClear();
    const r = await buscarHibrido("algo de cuchara", { catalogo, carpetaDe, deps: { parecidos: caido, haiku } });
    expect(r.via).toBe("rasgos");
    expect(haiku).not.toHaveBeenCalled();
  });

  it("un duro que deja menos de 3 se relaja y se avisa; lo excluido no se relaja nunca", async () => {
    const r = await buscarHibrido("algo a la plancha sin pescado", { catalogo, carpetaDe, deps: { parecidos: vector([]), haiku: vi.fn() } });
    expect(r.relajado).toBe(true);
    expect(r.aviso).toMatch(/a la plancha/);
    expect(ids(r)).not.toContain("merluza_horno");
  });

  it("las propias (sin vector) pasan por las mismas exclusiones", () => {
    const r = { rasgos: { excluir: [{ tipo: "grupo", valor: "pescado" }], duros: [] }, relajado: false };
    expect(pasaRasgos({ name: "Bacalao de mi madre", ingredients: [{ name: "Bacalao" }] }, r)).toBe(false);
    expect(pasaRasgos({ name: "Tortilla de la abuela", ingredients: [{ name: "Huevos" }] }, r)).toBe(true);
  });
});
