// #930: «prefiero pasta» por la vía rápida salió judías verdes, y «pero si te
// he dicho pasta» las mismas tres otra vez. Lo que se pide y no cabe en lo que
// lee la vía rápida, o una propuesta repetida, va a Lola. Sin modelo: los
// datos de entrada son los que sacó el enrutador en esos turnos (bot_route).
import { describe, it, expect, vi } from "vitest";

vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  proponerPlatos: vi.fn(async () => {}),
}));

const { ESQUEMA, POLITICA, LEE, vaPorLaRapida, datosSinLeer, pedidoSinRecoger } = await import("./router.js");
const { BASES_PEDIBLES, CATEGORIAS_PEDIBLES, OTRA, delTipo } = await import("./esquemas.js");
const { recomendar, repiteLaPropuesta } = await import("./turno.js");
const { proponerPlatos } = await import("./menu.js");
const { recipeCatalogById } = await import("../../src/data/recipeCatalog.js");

const recomendarCon = (datos, confianza = 0.95) => ({ modo: "recomendar", confianza, datos: { varias: false, ...datos } });
const estrella = Object.values(recipeCatalogById).filter((r) => r.estrella);

describe("tipo de plato: vocabulario cerrado sacado del catálogo", () => {
  it("cada base y cada carpeta que se puede pedir tiene recetas estrella", () => {
    for (const b of BASES_PEDIBLES) expect(estrella.some((r) => r.mainBase === b), b).toBe(true);
    for (const c of CATEGORIAS_PEDIBLES) expect(estrella.some((r) => r.category === c), c).toBe(true);
  });
  it("el enrutador ofrece exactamente esas, más «otra» de plan B", () => {
    expect(ESQUEMA.properties.base.enum).toEqual([...BASES_PEDIBLES, OTRA]);
    expect(ESQUEMA.properties.categoria.enum).toEqual([...CATEGORIAS_PEDIBLES, OTRA]);
    expect(ESQUEMA.properties.sobra.type).toBe("boolean");
  });
  it("delTipo deja solo las pastas del catálogo", () => {
    const pastas = delTipo(estrella, { base: "pasta" });
    expect(pastas.length).toBeGreaterThan(10);
    expect(pastas.every((r) => r.mainBase === "pasta")).toBe(true);
  });
  it("delTipo cruza base y carpeta, y sin tipo devuelve la lista tal cual", () => {
    expect(delTipo(estrella, { base: "arroz", categoria: "pescados" }).every((r) => r.mainBase === "arroz" && r.category === "pescados")).toBe(true);
    expect(delTipo(estrella, {})).toBe(estrella);
    expect(delTipo(estrella, { base: OTRA })).toBe(estrella);
  });
});

describe("cada dato que saca el enrutador tiene quien lo lea", () => {
  it("la tabla LEE solo nombra campos que existen en el esquema", () => {
    for (const [modo, campos] of Object.entries(LEE)) {
      for (const c of campos) expect(ESQUEMA.properties[c], `${modo}.${c}`).toBeDefined();
    }
  });
  it("todo modo con vía rápida está en la tabla LEE", () => {
    for (const modo of Object.keys(POLITICA).filter((m) => m !== "eleccion")) expect(LEE[modo], modo).toBeDefined();
  });
  it("todo campo de datos del esquema lo lee algún modo (o es de control)", () => {
    const control = new Set(["modo", "confianza", "varias", "sobra"]);
    const leidos = new Set(Object.values(LEE).flat());
    for (const c of Object.keys(ESQUEMA.properties).filter((k) => !control.has(k))) expect(leidos.has(c), c).toBe(true);
  });
});

describe("la vía rápida no contesta si se pierde algo de lo pedido", () => {
  it("el turno real de «pero si te he dicho pasta» (receta en un recomendar) ya no va por la rápida", () => {
    const d = recomendarCon({ dia: "hoy", para: "Leo", comida: "Comida", rasgos: { textura: "tenedor" }, receta: "pasta" }, 0.85);
    expect(datosSinLeer("recomendar", d.datos)).toEqual(["receta"]);
    expect(vaPorLaRapida(d)).toBe(false);
  });
  it("«prefiero pasta» con base=pasta sí va por la rápida, y la base llega al motor", async () => {
    const d = recomendarCon({ dia: "hoy", comida: "Comida", base: "pasta" });
    expect(vaPorLaRapida(d)).toBe(true);
    await recomendar("casa", d.datos);
    expect(proponerPlatos).toHaveBeenLastCalledWith("casa", expect.objectContaining({ tipo: { base: "pasta", categoria: null } }), expect.anything(), expect.anything());
  });
  it("un tipo fuera de la lista («otra») o algo que no cabe (sobra) va a Lola", () => {
    expect(vaPorLaRapida(recomendarCon({ base: OTRA }))).toBe(false);
    expect(vaPorLaRapida(recomendarCon({ categoria: OTRA }))).toBe(false);
    expect(vaPorLaRapida(recomendarCon({ dia: "hoy", sobra: true }))).toBe(false);
  });
  it("una corrección en recomendar o cambiar va a Lola; en una consulta, no hace falta", () => {
    expect(vaPorLaRapida(recomendarCon({ dia: "hoy" }), { corrige: true })).toBe(false);
    expect(vaPorLaRapida({ modo: "cambiar", confianza: 0.95, datos: { dia: "jueves", comida: "Cena", cualquiera: true } }, { corrige: true })).toBe(false);
    expect(vaPorLaRapida({ modo: "consulta", confianza: 0.95, datos: { que: "menu", cuando: "hoy" } }, { corrige: true })).toBe(true);
  });
  it("cambiar el jueves de la semana que viene: cambiar no lee la semana, así que Lola", () => {
    expect(vaPorLaRapida({ modo: "cambiar", confianza: 0.95, datos: { dia: "jueves", comida: "Cena", cualquiera: true, semana: "siguiente" } })).toBe(false);
  });
  // La clase (#939, fase 3): lo que el diccionario reconoce en el texto y el
  // formulario no recoge. El primer caso es el turno real de #930.
  it("«prefiero pasta» sin base en los datos: el diccionario lo ve y va a Lola", () => {
    const d = recomendarCon({ dia: "hoy", comida: "Comida", rasgos: { textura: "tenedor" } });
    const texto = "Mmm prefiero pasta la verdad, dame opciones";
    expect(pedidoSinRecoger(texto, d.datos).map((x) => x.valor)).toContain("pasta");
    expect(vaPorLaRapida(d, { texto })).toBe(false);
    expect(vaPorLaRapida({ ...d, datos: { ...d.datos, base: "pasta" } }, { texto })).toBe(true);
  });
  it("una proteína concreta no la recoge la carpeta; el grupo genérico, sí", () => {
    const d = recomendarCon({ dia: "hoy", categoria: "pescados" });
    expect(vaPorLaRapida(d, { texto: "algo con merluza" })).toBe(false);
    expect(vaPorLaRapida(d, { texto: "algo de pescado" })).toBe(true);
    expect(vaPorLaRapida(recomendarCon({ dia: "hoy" }), { texto: "unos fusilli" })).toBe(false);
  });
  it("lo de siempre sigue por la rápida", () => {
    expect(vaPorLaRapida(recomendarCon({ dia: "hoy", comida: "Cena", estilo: "ligero" }))).toBe(true);
    expect(vaPorLaRapida({ modo: "consulta", confianza: 0.95, datos: { que: "menu", cuando: "hoy", comidas: ["Comida"] } })).toBe(true);
    expect(vaPorLaRapida({ modo: "compra_anadir", confianza: 0.95, datos: { productos: ["leche"] } })).toBe(true);
  });
});

describe("una propuesta repetida va a Lola", () => {
  const judias = { opciones: [{ id: "legumbres_051" }, { id: "carnes_121" }, { id: "ensaladas_verduras_133" }] };
  it("las mismas tres recetas, en cualquier orden, es repetir", () => {
    expect(repiteLaPropuesta(judias, { opciones: [{ id: "carnes_121" }, { id: "ensaladas_verduras_133" }, { id: "legumbres_051" }] })).toBe(true);
  });
  it("con una distinta, o sin propuesta anterior, no", () => {
    expect(repiteLaPropuesta(judias, { opciones: [{ id: "legumbres_051" }, { id: "carnes_121" }, { id: "pasta_arroces_002" }] })).toBe(false);
    expect(repiteLaPropuesta(judias, null)).toBe(false);
    expect(repiteLaPropuesta(null, null)).toBe(false);
  });
});

// #934: «Bowl de quinoa, pollo y verduras crud…». Por palabras enteras, y que
// al pulsarlo se siga reconociendo la receta.
describe("botones de las opciones", async () => {
  const { boton, botonesDe, eleccionDe } = await import("./turno.js");
  const NOMBRES = ["Judías verdes con garbanzos y jamón", "Bowl de quinoa, pollo y verduras crudas", "Ensalada templada de verduras asadas y garbanzos"];
  it("cortados por palabras, sin acabar en «de», «y» ni coma", () => {
    expect(NOMBRES.map(boton)).toEqual(["Judías verdes con garbanzos", "Bowl de quinoa, pollo y verduras", "Ensalada templada de verduras"]);
  });
  it("al pulsar el botón se elige su receta", () => {
    const propuesta = { opciones: NOMBRES.map((nombre, i) => ({ id: `r${i}`, nombre })) };
    NOMBRES.forEach((n, i) => expect(eleccionDe(boton(n), propuesta)).toEqual({ opcion: { id: `r${i}`, nombre: n } }));
  });
  it("si dos se quedarían iguales, van enteros", () => {
    const dos = ["Ensalada templada de verduras asadas y garbanzos", "Ensalada templada de verduras asadas con queso"];
    expect(botonesDe(dos)).toEqual(dos);
  });
});
