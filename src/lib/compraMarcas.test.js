import { describe, it, expect } from "vitest";
import { marcasDe, listaConMarcas, compraQueSeVe, compraParaGuardar, cambiarCompra, esCompraConMarcas } from "./compraMarcas.js";
import { MARCA_COMPRA } from "./vocabularios.js";

const leche = { id: "leche|ml", name: "Leche", unit: "ml", qty: 1000, have: false, atHome: false, manual: false, sources: [{ recipeId: "r1" }] };
const pan = { id: "pan|ud", name: "Pan", unit: "ud", qty: 1, have: false, atHome: false, manual: false, sources: [{ recipeId: "r2" }] };
const huevos = { id: "huevo|ud", name: "Huevos", unit: "ud", qty: 6, have: false, atHome: false, manual: false, sources: [{ recipeId: "r1" }] };
const derivados = [leche, pan, huevos];

describe("la compra guarda solo marcas (trozo 18)", () => {
  it("lo que no lleva marca no se guarda", () => {
    expect(marcasDe(derivados, derivados)).toEqual({ marcas: [] });
  });

  it("de ida y vuelta: comprado, en casa, quitado y añadido sobreviven", () => {
    const vista = [
      { ...leche, have: true },
      { ...huevos, atHome: true },
      { id: "manual:cafe:x", name: "Café", unit: "", category: "Otros", displayQty: "", manual: true, have: false, atHome: false, sources: [] },
    ];
    const guardada = marcasDe(vista, derivados);
    expect(guardada.marcas.map((m) => [m.id, m.marcas])).toEqual([
      ["leche|ml", [MARCA_COMPRA.COMPRADO]],
      ["huevo|ud", [MARCA_COMPRA.EN_CASA]],
      ["manual:cafe:x", [MARCA_COMPRA.ANADIDO]],
      ["pan|ud", [MARCA_COMPRA.QUITADO]],
    ]);
    const otraVez = listaConMarcas(derivados, guardada);
    expect(otraVez.map((it) => [it.id, it.have, it.atHome, Boolean(it.manual)])).toEqual([
      ["leche|ml", true, false, false],
      ["huevo|ud", false, true, false],
      ["manual:cafe:x", false, false, true],
    ]);
    expect(marcasDe(otraVez, derivados)).toEqual(guardada);
  });

  it("cambiar un plato no desmarca lo comprado ni devuelve lo quitado", () => {
    const guardada = { marcas: [
      { id: "leche|ml", nombre: "Leche", unidad: "ml", marcas: [MARCA_COMPRA.COMPRADO] },
      { id: "pan|ud", nombre: "Pan", unidad: "ud", marcas: [MARCA_COMPRA.QUITADO] },
    ] };
    // El plato nuevo ya no pide huevos y pide arroz; leche y pan siguen.
    const arroz = { id: "arroz|g", name: "Arroz", unit: "g", have: false, atHome: false };
    const lista = listaConMarcas([leche, pan, arroz], guardada);
    expect(lista.map((it) => [it.id, it.have])).toEqual([["leche|ml", true], ["arroz|g", false]]);
  });

  it("un añadido a mano que el menú ya pide no sale dos veces: la marca va al derivado", () => {
    const guardada = { marcas: [{ id: "leche|ml", nombre: "Leche", unidad: "ml", marcas: [MARCA_COMPRA.ANADIDO, MARCA_COMPRA.COMPRADO] }] };
    const lista = listaConMarcas(derivados, guardada);
    expect(lista.filter((it) => it.name === "Leche")).toHaveLength(1);
    expect(lista[0].have).toBe(true);
  });

  it("lo añadido a mano sigue aunque el menú cambie entero", () => {
    const guardada = { marcas: [{ id: "manual:cafe:x", nombre: "Café", unidad: "", displayQty: "1 paquete", marcas: [MARCA_COMPRA.ANADIDO] }] };
    expect(listaConMarcas([], guardada)).toEqual([expect.objectContaining({ id: "manual:cafe:x", name: "Café", displayQty: "1 paquete", manual: true })]);
  });

  it("con la forma de antes se ve la lista guardada tal cual, sin derivar", () => {
    let derivo = false;
    const vieja = { items: [{ ...leche, have: true }] };
    expect(esCompraConMarcas(vieja)).toBe(false);
    expect(compraQueSeVe(vieja, () => { derivo = true; return []; })).toEqual(vieja);
    expect(derivo).toBe(false);
    expect(compraQueSeVe(null, () => [])).toEqual({ items: [] });
  });

  it("con marcas se deriva del menú", () => {
    const guardada = { marcas: [{ id: "pan|ud", nombre: "Pan", unidad: "ud", marcas: [MARCA_COMPRA.COMPRADO] }] };
    const vista = compraQueSeVe(guardada, () => derivados);
    expect(vista.items.find((it) => it.id === "pan|ud").have).toBe(true);
  });

  it("lo que no se ve (quitado, o de un plato que ya no está) viaja aparte y se vuelve a guardar", () => {
    const guardada = { marcas: [
      { id: "pan|ud", nombre: "Pan", unidad: "ud", marcas: [MARCA_COMPRA.QUITADO] },
      { id: "leche|ml", nombre: "Leche", unidad: "ml", marcas: [MARCA_COMPRA.COMPRADO] },
    ] };
    const vista = compraQueSeVe(guardada, () => derivados);
    expect(vista.aparte.map((q) => q.id)).toEqual(["pan|ud"]);
    // Sin la lista derivada a mano (la app), lo que no se ve sale de `aparte`.
    const otraVez = compraParaGuardar(vista);
    expect(otraVez.marcas.map((m) => [m.id, m.marcas])).toEqual([["leche|ml", [MARCA_COMPRA.COMPRADO]], ["pan|ud", [MARCA_COMPRA.QUITADO]]]);
    // Si vuelve a la lista (se apunta otra vez), deja de estar quitado.
    const devuelto = compraParaGuardar({ ...vista, items: [...vista.items, { ...pan, manual: true }] });
    expect(devuelto.marcas.find((m) => m.id === "pan|ud").marcas).toEqual([MARCA_COMPRA.ANADIDO]);
    // Lo comprado de algo que el menú ya no pide tampoco se pierde al tocar la lista.
    const sinLeche = compraQueSeVe(guardada, () => [pan, huevos]);
    expect(sinLeche.aparte.map((q) => q.id)).toEqual(["pan|ud", "leche|ml"]);
    expect(compraParaGuardar({ ...sinLeche, items: sinLeche.items.map((it) => ({ ...it, have: true })) }).marcas.map((m) => m.id)).toEqual(["huevo|ud", "pan|ud", "leche|ml"]);
    // Lo ya guardado como marcas se guarda tal cual.
    expect(compraParaGuardar(guardada)).toBe(guardada);
  });

  it("la app cambia la lista que se ve y guarda marcas, venga de la lista de antes o de marcas", () => {
    const verla = (g) => compraQueSeVe(g, () => derivados);
    const tachar = (id) => (v) => ({ ...v, items: v.items.map((it) => (it.id === id ? { ...it, have: true } : it)) });
    // De la lista entera de antes: el primer cambio la deja en marcas, sin perder lo apuntado a mano.
    const antes = { items: [...derivados, { id: "manual:cafe:x", name: "Café", unit: "", manual: true, have: false, atHome: false }] };
    const primera = cambiarCompra(antes, tachar("pan|ud"), verla);
    expect(primera.marcas.map((m) => [m.id, m.marcas])).toEqual([["pan|ud", [MARCA_COMPRA.COMPRADO]], ["manual:cafe:x", [MARCA_COMPRA.ANADIDO]]]);
    // Sobre marcas: lo de antes sigue y se suma lo nuevo.
    const segunda = cambiarCompra(primera, tachar("leche|ml"), verla);
    expect(verla(segunda).items.filter((it) => it.have).map((it) => it.id)).toEqual(["leche|ml", "pan|ud"]);
    // Una vista entera en vez de una función, también.
    const idYMarcas = (g) => g.marcas.map((m) => [m.id, m.marcas]);
    expect(idYMarcas(cambiarCompra(primera, verla(primera), verla))).toEqual(idYMarcas(primera));
  });

  it("una lista vieja sin ids no pierde nada al pasar a marcas", () => {
    const vieja = [{ name: "pan", manual: true }, { name: "Leche", unit: "ml", have: true }];
    const { marcas } = compraParaGuardar({ items: vieja });
    expect(marcas.map((m) => m.marcas)).toEqual([[MARCA_COMPRA.ANADIDO], [MARCA_COMPRA.COMPRADO]]);
    expect(marcas.every((m) => m.id)).toBe(true);
    expect(listaConMarcas([], { marcas }).map((it) => it.name)).toEqual(["pan"]);
  });
});
