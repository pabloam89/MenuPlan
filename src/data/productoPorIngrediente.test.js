import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tabla from "./productoPorIngrediente.json";
import ingredients from "./ingredients.json";
import { FilaProductoSchema, TablaProductoSchema, ENCAJE_PRODUCTO } from "./productoSchema.js";
import { normalizeName } from "../lib/ingredientCategories.js";
import { gramsForRecipeQuantity } from "../lib/kitchenUnits.js";
import { envaseDesproporcionado, filaDeLinea } from "../lib/productoDeLinea.js";
import { recipeCatalog } from "./recipeCatalog.js";

const tienda = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../public/store/mercadona.json", import.meta.url)), "utf8"),
);
const idsMercadona = new Set(tienda.products.map((p) => String(p.id)));
const ingPorId = new Map(ingredients.map((i) => [i.id, i]));
const filas = tabla.filas;
/** Las raciones de una compra de casa: con ellas se mide si un envase es desproporcionado. */
const RACIONES_DE_REFERENCIA = 4;

describe("productoPorIngrediente.json", () => {
  it("cumple el esquema (campos cerrados, motivo donde toca, producto según el encaje)", () => {
    const r = TablaProductoSchema.safeParse(tabla);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues.slice(0, 5), null, 1)).toBe(true);
  });

  it("cada ingredientId es un ingrediente del catálogo", () => {
    const huerfanos = filas.filter((f) => !ingPorId.has(f.ingredientId)).map((f) => f.ingredientId);
    expect(huerfanos).toEqual([]);
  });

  it("cada alias es el nombre o un alias de su ingrediente", () => {
    const malos = filas
      .filter((f) => f.alias != null)
      .filter((f) => {
        const ing = ingPorId.get(f.ingredientId);
        const suyos = [ing?.name, ...(ing?.aliases ?? [])].map(normalizeName);
        return !suyos.includes(normalizeName(f.alias));
      })
      .map((f) => `${f.ingredientId} / ${f.alias}`);
    expect(malos).toEqual([]);
  });

  it("no repite clave (ingredientId, alias, supermercado)", () => {
    const vistas = new Set();
    const repetidas = [];
    for (const f of filas) {
      const k = `${f.supermercado}|${f.ingredientId}|${f.alias == null ? "" : normalizeName(f.alias)}`;
      if (vistas.has(k)) repetidas.push(k);
      vistas.add(k);
    }
    expect(repetidas).toEqual([]);
  });

  it("una fila por alias solo existe junto a la fila del ingrediente", () => {
    const base = new Set(filas.filter((f) => f.alias == null).map((f) => `${f.supermercado}|${f.ingredientId}`));
    const sueltas = filas.filter((f) => f.alias != null && !base.has(`${f.supermercado}|${f.ingredientId}`));
    expect(sueltas.map((f) => `${f.ingredientId} / ${f.alias}`)).toEqual([]);
  });

  // El cron refresca el catálogo cada semana. Un producto que se va no puede
  // desaparecer en silencio: salta aquí y se decide otra vez (o se queda, si es
  // de temporada, y la lista lo cuenta como «falta_esta_semana»).
  it("cada productId de Mercadona sigue en el catálogo de la semana", () => {
    const idos = filas
      .filter((f) => f.supermercado === "Mercadona" && f.productId != null && !idsMercadona.has(f.productId))
      .map((f) => `${f.ingredientId}${f.alias ? ` / ${f.alias}` : ""} → ${f.productId}`);
    expect(idos).toEqual([]);
  });

  // La puerta: un ingrediente sin decisión en Mercadona cae al emparejador por
  // nombre, que es justo lo que esta tabla vino a quitar. Vale para todo el
  // catálogo de ingredientes, no solo el del recetario: las recetas de reserva
  // y las que resuelven a un ingrediente también compran.
  it("todo ingrediente del catálogo tiene su fila de Mercadona", () => {
    const conFila = new Set(filas.filter((f) => f.supermercado === "Mercadona" && f.alias == null).map((f) => f.ingredientId));
    expect(ingredients.map((i) => i.id).filter((id) => !conFila.has(id)).sort()).toEqual([]);
  });

  // La clase del jamón de 6,8 kg: un producto decidido cuyo envase cuesta
  // DINERO_DE_MAS_MAX o más de lo que vale lo que pide una línea del recetario
  // escalada a una compra de casa (4 raciones; una receta de bebé de una ración
  // pide 30 g y la casa compra para la semana).
  it("ningún producto decidido tiene un envase desproporcionado para lo que pide una línea", () => {
    const productos = new Map(tienda.products.map((p) => [String(p.id), p]));
    const malos = new Set();
    for (const r of recipeCatalog.filter((x) => x.estrella)) {
      for (const l of r.ingredients ?? []) {
        const g = gramsForRecipeQuantity(l.name, Number(l.amount), l.unit);
        const fila = filaDeLinea(l.name);
        const p = fila?.productId ? productos.get(fila.productId) : null;
        if (!(g > 0) || !p) continue;
        const gramos = (g * RACIONES_DE_REFERENCIA) / (r.baseServings || RACIONES_DE_REFERENCIA);
        if (envaseDesproporcionado(p, gramos)) malos.add(`${l.name} → ${p.name}`);
      }
    }
    expect([...malos].sort()).toEqual([]);
  });

  it("no_se_compra no depende del súper: si una fila lo dice, lo dicen todas las del ingrediente", () => {
    const porIng = new Map();
    for (const f of filas.filter((f) => f.alias == null)) {
      const s = porIng.get(f.ingredientId) ?? new Set();
      s.add(f.encaje === ENCAJE_PRODUCTO.NO_SE_COMPRA);
      porIng.set(f.ingredientId, s);
    }
    expect([...porIng].filter(([, s]) => s.size > 1).map(([id]) => id)).toEqual([]);
  });
});

describe("FilaProductoSchema", () => {
  const buena = { ingredientId: "perejil", alias: null, supermercado: "Mercadona", productId: "10", encaje: "exacto", decididoPor: "modelo", motivo: null, revisado: "2026-11-08" };
  const valida = (cambio) => FilaProductoSchema.safeParse({ ...buena, ...cambio }).success;

  it("acepta una fila exacta sin motivo", () => {
    expect(valida({})).toBe(true);
  });
  it("no_lo_vende sin producto y con motivo; con producto, no", () => {
    expect(valida({ productId: null, encaje: "no_lo_vende", motivo: "No hay nada parecido en el catálogo" })).toBe(true);
    expect(valida({ encaje: "no_lo_vende", motivo: "No hay nada parecido en el catálogo" })).toBe(false);
  });
  it("exacto sin producto, no", () => {
    expect(valida({ productId: null })).toBe(false);
  });
  it("equivalente pide motivo", () => {
    expect(valida({ encaje: "equivalente" })).toBe(false);
    expect(valida({ encaje: "equivalente", motivo: "No hay parmigiano; el grana padano ocupa su lugar" })).toBe(true);
  });
  it("campos cerrados: ni encaje, ni decisor, ni súper fuera de su lista, ni campos de más", () => {
    expect(valida({ encaje: "parecido" })).toBe(false);
    expect(valida({ decididoPor: "emparejador" })).toBe(false);
    expect(valida({ supermercado: "Mercadonna" })).toBe(false);
    expect(valida({ confianza: 0.9 })).toBe(false);
  });
});
