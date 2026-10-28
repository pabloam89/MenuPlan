import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import * as receta from "../../src/data/recipeSchema.js";
import * as ejes from "../../src/data/axisRegistry.js";
import * as pedible from "../../api/_bot/esquemas.js";
import * as clasificador from "../../api/_bot/router.js";
import * as vocabularios from "../../src/lib/vocabularios.js";
import * as ficha from "../../src/lib/registroCampos.js";
import * as comidas from "../../src/lib/comidas.js";
import * as nutrientes from "../../src/data/nutrientes.js";
import * as familias from "../../src/lib/notepadFields.js";
import { FALLOS, apariciones, inventario, copiasLiterales, cifras, esCopia, listasLiterales } from "./inventarioDiccionario.mjs";
import { enOrden } from "../../src/lib/enOrden.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");

// Registros de mentira, con un fallo de cada clase.
const falsos = {
  receta: {
    RecipeSchema: z.object({ textura: z.enum(["cuchara", "tenedor"]), picante: z.enum(["no", "suave", "picante"]), categoria2: z.enum(["a", "b", "c"]), nombre: z.string(), kcal: z.number().optional() }),
    // No cubre «picante»: discrepa.
    PICANTE_PEDIDO: { sin: ["no"], con: ["suave"] },
  },
  ejes: { EJES: [{ id: "textura", tipo: "enum", campo: "textura", ambito: "receta" }, { id: "picante", tipo: "enum", campo: "picante", ambito: "receta" }, { id: "coste", tipo: "enum", campo: "costeNivel", ambito: "receta" }] },
  pedible: { ESQUEMA_RASGOS: { type: "object", properties: { textura: { type: "string", enum: ["cuchara", "mano"] }, picante: { type: "string", enum: ["sin", "con"] } } } },
  clasificador: {},
  vocabularios: { VOCABULARIOS: { categoria2: ["a", "b"], motivos_fallo: ["x"] } },
  ficha: {},
  comidas: {},
  nutrientes: { NUTRIENTES: { kcal: { porRacion: "kcal" } } },
};

describe("inventario del diccionario (#939)", () => {
  const inv = inventario(apariciones(falsos));

  it("discrepancia si la copia tiene valores que el dueño no; recorte si solo le faltan", () => {
    const d = inv.fallos.filter((f) => f.fallo === "discrepancia");
    expect(d.find((x) => x.concepto === "textura")).toMatchObject({ dueno: "receta.textura", sobran: ["mano"] });
    expect(inv.recortes).toEqual([expect.objectContaining({ concepto: "categoria2", faltan: ["c"] })]);
  });

  it("una forma de pedir que agrupa niveles es su propio concepto, y discrepa si deja un nivel sin cubrir", () => {
    const d = inv.fallos.filter((f) => f.fallo === "discrepancia" && f.concepto === "picantePedido");
    expect(d).toEqual([expect.objectContaining({ faltan: ["picante"] })]);
    // «sin | con» en lo pedible no se compara con los niveles guardados.
    expect(inv.fallos.some((f) => f.copia === "pedible.rasgos.picante")).toBe(false);
  });

  it("copia: el vocabulario entero en cualquier orden, más solo valores de reserva", () => {
    expect(esCopia(new Set(["c", "a", "b"]), ["a", "b", "c"])).toBe(true);
    expect(esCopia(new Set(["a", "b", "c", "otra"]), ["a", "b", "c"])).toBe(true);
    expect(esCopia(new Set(["a", "b", "c", "d"]), ["a", "b", "c"])).toBe(false);
    expect(esCopia(new Set(["a", "b"]), ["a", "b", "c"])).toBe(false);
  });

  it("no son copia un orden dado a enOrden() ni una lista con repetidos (pesos)", () => {
    const texto = ['const x = enOrden(V, ["a", "b", "c"]);', 'const p = ["a", "a", "b", "c"];', 'const y = ["c", "b", "a"];'].join("\n");
    expect(listasLiterales(texto)).toEqual([new Set(["c", "b", "a"])]);
  });

  it("campo cerrado sin eje sí; campo abierto y nutriente no", () => {
    const sinEje = inv.fallos.filter((f) => f.fallo === "campo_sin_eje").map((f) => f.concepto);
    expect(sinEje).toEqual(["categoria2"]);
  });

  it("eje que apunta a un campo que la receta no tiene", () => {
    expect(inv.fallos.filter((f) => f.fallo === "eje_sin_campo").map((f) => f.concepto)).toEqual(["costeNivel"]);
  });

  it("lo de sistema se lista aparte y no cuenta", () => {
    expect(inv.sistema).toEqual(["vocabularios.motivos_fallo"]);
    expect(inv.conceptos.map((c) => c.concepto)).not.toContain("motivos_fallo");
  });

  it("las cifras del repo solo bajan", () => {
    const aps = apariciones({ receta, ejes, pedible, clasificador, vocabularios, ficha, comidas, nutrientes, familias });
    const hoy = cifras([...inventario(aps).fallos, ...copiasLiterales(aps, raiz)]);
    const base = JSON.parse(readFileSync(join(aqui, "inventarioDiccionario.base.json"), "utf8"));
    for (const f of FALLOS) {
      // Si falla al subir: npm run diccionario:inventario dice cuál es nuevo.
      expect(hoy[f], `${f} ha subido`).toBeLessThanOrEqual(base[f]);
      // Si falla al bajar: bien hecho; baja la cifra en inventarioDiccionario.base.json.
      expect(hoy[f], `${f} ha bajado: actualiza la base`).toBe(base[f]);
    }
  });

  it("enOrden: el orden de quien lo usa, los valores del dueño", () => {
    expect(enOrden(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
    expect(enOrden(["a", "b"], ["z", "b"])).toEqual(["b", "a"]);
  });
});
