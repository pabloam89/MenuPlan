import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import decisiones from "./productoBuscado.json";
import ingredients from "./ingredients.json";
import { normalizeName } from "../lib/ingredientCategories.js";
import { matchProductForIngredient, scoreProductName } from "../lib/productMatcher.js";

const entradas = Object.entries(decisiones).filter(([clave]) => !clave.startsWith("_"));

const tienda = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../public/store/mercadona.json", import.meta.url)), "utf8"),
);
const productos = tienda.products ?? Object.values(tienda).find(Array.isArray) ?? [];

describe("productoBuscado.json", () => {
  it("no está vacío", () => {
    expect(entradas.length).toBeGreaterThan(20);
  });

  it.each(entradas)("«%s» nombra a un ingrediente que existe", (clave) => {
    expect(ingredients.some((i) => normalizeName(i.name) === clave)).toBe(true);
  });

  it.each(entradas)("«%s» declara su motivo", (clave, valor) => {
    expect(Array.isArray(valor.buscar) && valor.buscar.length).toBeTruthy();
    expect(typeof valor.motivo === "string" && valor.motivo.length > 20).toBe(true);
  });

  // Un término que ya no encuentra nada es una decisión muerta: el súper cambió
  // de nombre y nadie se enteró. El cron refresca el catálogo cada semana, así
  // que esto tiene que saltar solo.
  it.each(entradas)("«%s» sigue encontrando su producto", (clave, valor) => {
    for (const termino of valor.buscar) {
      const encuentra = productos.some((p) => scoreProductName(p.name, normalizeName(termino)) >= 0.7);
      expect(encuentra, `«${termino}» ya no encuentra nada en el catálogo`).toBe(true);
    }
  });

  // Y que el término gane de verdad: si el nombre del ingrediente sigue
  // llevándose el producto equivocado, la decisión no sirve de nada.
  it.each(entradas)("«%s» se lleva un producto", (clave) => {
    const ing = ingredients.find((i) => normalizeName(i.name) === clave);
    expect(matchProductForIngredient(ing.name, productos)?.product).toBeTruthy();
  });
});

describe("el emparejador no confunde alimentos parecidos", () => {
  // Los seis los produjo el emparejador de verdad y salían en la lista de la compra.
  it.each([
    ["atun fresco", "Butifarra fresca"],
    ["espinacas frescas", "Fresas"],
    ["salchichas frescas", "Fresas"],
    ["filetes de ternera", "Filetes de dorada"],
    ["carne picada de ternera", "Botifarrón de carne"],
    ["granja", "Granola"],
  ])("«%s» no es «%s»", (ingrediente, producto) => {
    expect(scoreProductName(producto, ingrediente)).toBeLessThan(0.4);
  });

  it.each([
    ["gambas", "Gamba pelada cocida"],
    ["fresas", "Fresas"],
    ["lentejas", "Lenteja pardina"],
    ["presa iberica", "Presa de cerdo ibérico"],
    ["bacalao desalado", "Migas de bacalao desaladas Hacendado"],
  ])("«%s» sí es «%s»", (ingrediente, producto) => {
    expect(scoreProductName(producto, ingrediente)).toBeGreaterThanOrEqual(0.4);
  });

  // Emparejar los 383 ingredientes contra los 3.000 productos cuesta unos
  // segundos, así que se hace una vez y se mira dos.
  const elegidos = [];
  beforeAll(() => {
    for (const ing of ingredients) {
      const producto = matchProductForIngredient(ing.name, productos)?.product;
      if (producto) elegidos.push([ing.name, producto]);
    }
  }, 60000);

  it("una receta de adultos nunca compra comida de bebé", () => {
    const bebe = elegidos.filter(([, p]) => /papilla|potito|tarrito|\+\s*\d+\s*mes/i.test(p.name));
    expect(bebe.map(([i, p]) => `${i} → ${p.name}`)).toEqual([]);
  });

  it("ningún producto es el elegido de tres ingredientes distintos", () => {
    const porProducto = new Map();
    for (const [nombre, producto] of elegidos) {
      porProducto.set(producto.id, [...(porProducto.get(producto.id) ?? []), nombre]);
    }
    const imanes = [...porProducto.values()].filter((v) => v.length >= 3);
    expect(imanes).toEqual([]);
  });
});
