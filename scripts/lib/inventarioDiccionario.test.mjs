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
import { FALLOS, apariciones, inventario, copiasLiterales, cifras } from "./inventarioDiccionario.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");

// Registros de mentira, con un fallo de cada clase.
const falsos = {
  receta: { RecipeSchema: z.object({ picante: z.enum(["no", "suave", "picante"]), categoria2: z.enum(["a", "b", "c"]), nombre: z.string(), kcal: z.number().optional() }) },
  ejes: { EJES: [{ id: "picante", tipo: "enum", campo: "picante", ambito: "receta" }, { id: "coste", tipo: "enum", campo: "costeNivel", ambito: "receta" }] },
  pedible: { ESQUEMA_RASGOS: { type: "object", properties: { picante: { type: "string", enum: ["sin", "con"] } } } },
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
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ concepto: "picante", dueno: "receta.picante", sobran: ["sin", "con"] });
    expect(inv.recortes).toEqual([expect.objectContaining({ concepto: "categoria2", faltan: ["c"] })]);
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
    const aps = apariciones({ receta, ejes, pedible, clasificador, vocabularios, ficha, comidas, nutrientes });
    const hoy = cifras([...inventario(aps).fallos, ...copiasLiterales(aps, raiz)]);
    const base = JSON.parse(readFileSync(join(aqui, "inventarioDiccionario.base.json"), "utf8"));
    for (const f of FALLOS) {
      // Si falla al subir: npm run diccionario:inventario dice cuál es nuevo.
      expect(hoy[f], `${f} ha subido`).toBeLessThanOrEqual(base[f]);
      // Si falla al bajar: bien hecho; baja la cifra en inventarioDiccionario.base.json.
      expect(hoy[f], `${f} ha bajado: actualiza la base`).toBe(base[f]);
    }
  });
});
