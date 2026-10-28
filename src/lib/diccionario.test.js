import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import alimentos from "../data/alimentos.json";
import ingredientes from "../data/ingredients.json";
import alimentoPorIngrediente from "../data/alimentoPorIngrediente.json";
import aprendidos from "../data/sinonimosAprendidos.json";
import {
  CONNOTACIONES, DIFFICULTIES, MAIN_BASES, MAIN_PROTEINS, PICANTE_PEDIDO, SABORES, TECNICAS, TEXTURAS,
} from "../data/recipeSchema.js";
import { EJE_POR_ID } from "../data/axisRegistry.js";
import { NIVELES_COSTE } from "./costeNiveles.js";
import { NIVELES_CALORIAS } from "./caloriasNivel.js";
import { formasDeTaxonomia, NO_SON_FORMAS } from "./derive/sinonimos.js";
import {
  EJE_DEL_RASGO, GRUPO_VALORES, MAS_CONCRETO, ORIGENES_FORMA, entradas, formasDe, resolver, sinTildes,
} from "./diccionario.js";

const derivado = JSON.parse(readFileSync(fileURLToPath(new URL("../data/derived/sinonimosTaxonomia.json", import.meta.url)), "utf8"));

/** Los valores que admite cada rasgo: modelo cerrado, del dueño de cada vocabulario. */
const VALORES = {
  grupo: Object.keys(GRUPO_VALORES),
  proteinaPrincipal: MAIN_PROTEINS,
  basePrincipal: MAIN_BASES,
  tecnica: TECNICAS,
  connotacion: CONNOTACIONES,
  textura: TEXTURAS,
  picante: Object.keys(PICANTE_PEDIDO),
  sabor: SABORES,
  calorias: NIVELES_CALORIAS,
  coste: NIVELES_COSTE,
  dificultad: DIFFICULTIES,
  taper: [true], ninos: [true], congelar: [true], hierro: [true],
};

describe("el diccionario (#939, fase 3)", () => {
  it("las formas del árbol están al día: npm run build:sinonimos", () => {
    expect(derivado).toEqual(formasDeTaxonomia({ alimentos, ingredientes, alimentoPorIngrediente }));
  });

  it("cada rasgo apunta a un eje que existe en el registro (el cableado)", () => {
    const rotos = Object.entries(EJE_DEL_RASGO).filter(([, eje]) => eje && !EJE_POR_ID.has(eje));
    expect(rotos).toEqual([]);
    const sinEje = [...new Set(entradas().map((e) => e.rasgo))].filter((r) => !(r in EJE_DEL_RASGO));
    expect(sinEje, "un rasgo nuevo necesita su eje en EJE_DEL_RASGO").toEqual([]);
  });

  it("cada valor es del vocabulario de su dueño, y cada grupo abarca valores reales", () => {
    const fuera = entradas().filter((e) => !VALORES[e.rasgo]?.includes(e.valor)).map((e) => `${e.rasgo}=${e.valor}`);
    expect(fuera).toEqual([]);
    for (const [g, porEje] of Object.entries(GRUPO_VALORES)) {
      for (const [eje, vs] of Object.entries(porEje)) expect(vs.every((v) => VALORES[eje].includes(v)), g).toBe(true);
    }
  });

  it("las formas van sin tildes y en minúscula, y cada una dice de dónde sale", () => {
    for (const e of entradas()) {
      for (const [f, origen] of e.formas) {
        expect(f, `${e.rasgo}=${e.valor}`).toBe(sinTildes(f).trim());
        expect(/^[a-z0-9 ]+$/.test(f), `«${f}»`).toBe(true);
        expect(ORIGENES_FORMA).toContain(origen);
      }
    }
  });

  it("dos grupos solo comparten formas si uno abarca al otro (MAS_CONCRETO)", () => {
    const de = new Map();
    for (const e of entradas().filter((x) => x.rasgo === "grupo")) for (const f of e.formas.keys()) de.set(f, [...(de.get(f) ?? []), e.valor]);
    const mal = [...de].filter(([, gs]) => gs.length > 1)
      .filter(([, gs]) => !gs.every((g) => gs.every((h) => g === h || MAS_CONCRETO[g]?.includes(h) || MAS_CONCRETO[h]?.includes(g))))
      .map(([f, gs]) => `«${f}»: ${gs.join(", ")}`);
    expect(mal).toEqual([]);
  });

  it("reconoce lo que el árbol sabe y nadie escribió a mano", () => {
    const g = (frase) => resolver(frase).filter((r) => r.rasgo === "grupo").map((r) => r.valor);
    expect(g("unos fusilli")).toContain("pasta");
    expect(g("pescadilla rebozada")).toContain("pescado");
    expect(g("unos chipirones")).toContain("marisco");
    expect(g("garbanzos con espinacas")).toContain("legumbre");
    expect(formasDe("grupo", "pasta").find((f) => f.texto === "fusilli")?.origen).toBe("taxonomia");
  });

  it("y no confunde palabras corrientes ni preparaciones con un alimento", () => {
    expect(resolver("algo bonito para los invitados").some((r) => r.rasgo === "grupo")).toBe(false);
    expect(resolver("con salsa de soja").some((r) => r.valor === "legumbre")).toBe(false);
    expect(Object.values(NO_SON_FORMAS).every((m) => typeof m === "string" && m.length > 5)).toBe(true);
  });

  it("lo aprendido trae rasgo, valor, forma, quién y cuándo", () => {
    for (const a of aprendidos.formas) {
      expect(VALORES[a.rasgo]).toContain(a.valor);
      expect(a.forma).toBe(sinTildes(a.forma));
      expect(a.quien).toBeTruthy();
      expect(a.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
