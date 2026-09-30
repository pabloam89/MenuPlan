import { describe, it, expect } from "vitest";
import { recipeCatalog } from "../../data/recipeCatalog.js";
import { computeRecipeNutrition } from "../ingredients.js";
import { declaracionesDe, destacaEn, VRN, CAMPOS_CON_VRN, FRACCION_FUENTE, FRACCION_ALTO } from "./declaraciones.js";

const nutri = (id) => {
  const r = recipeCatalog.find((x) => x.id === id);
  return computeRecipeNutrition(r, r.baseServings || 2);
};

describe("los cortes salen del reglamento, no de un redondeo", () => {
  it("«alto» es exactamente el doble de «fuente»", () => {
    expect(FRACCION_ALTO).toBeCloseTo(FRACCION_FUENTE * 2, 10);
    expect(FRACCION_FUENTE).toBe(0.15);
  });

  /**
   * Los VRN son datos legales —Reglamento (UE) 1169/2011, Anexo XIII, parte A—
   * y no se ajustan a ojo. Se comprueban tres de los más citados, que son los
   * que delatarían una transcripción mal hecha.
   */
  it("los VRN son los del Anexo XIII", () => {
    expect(VRN.iron_mg).toBe(14);
    expect(VRN.calcium_mg).toBe(800);
    expect(VRN.vitamin_c_mg).toBe(80);
    expect(VRN.folate_ug).toBe(200);
    expect(VRN.vitamin_a_rae_ug).toBe(800);
  });

  it("no se declara nada que el repo no mida", () => {
    const n = nutri("legumbres_001");
    for (const campo of CAMPOS_CON_VRN) expect(campo in n, campo).toBe(true);
  });

  /**
   * LA VITAMINA A SE DECLARA SOBRE LA SUMA EN RAE, no sobre sus dos mitades.
   * El VRN de 800 µg está definido así, y declarar «alto en retinol» y «alto en
   * betacaroteno» por separado contaría dos veces la misma vitamina.
   */
  it("el retinol y el betacaroteno no se declaran por separado", () => {
    expect(CAMPOS_CON_VRN).toContain("vitamin_a_rae_ug");
    expect(CAMPOS_CON_VRN).not.toContain("retinol_ug");
    expect(CAMPOS_CON_VRN).not.toContain("beta_carotene_ug");
  });
});

describe("no llega y no se sabe son cosas distintas", () => {
  /**
   * EL PUNTO FINO DEL MÓDULO. Si el hierro de un plato está sostenido por el
   * 40 % de su masa, el número publicado es el hierro de ese 40 %: el real es
   * MAYOR, nunca menor. Así que una declaración positiva con cobertura baja es
   * conservadora por construcción — lo que la cobertura baja produce son
   * falsos NEGATIVOS.
   *
   * Por eso el operador no dice nunca «este plato no es fuente de X»: separa
   * «no llega» (y solo lo afirma con cobertura alta) de «no se sabe».
   */
  it("un campo con cobertura floja no se afirma como que no llega", () => {
    const flojos = [];
    for (const r of recipeCatalog.slice(0, 200)) {
      const n = computeRecipeNutrition(r, r.baseServings || 2);
      if (!n) continue;
      const d = declaracionesDe(n);
      for (const campo of d.noLlega) {
        const c = n.coberturaPorCampo?.[campo];
        if (c != null && c < 0.9) flojos.push(`${r.id}.${campo} = ${c}`);
      }
    }
    expect(flojos).toEqual([]);
  });

  it("los cuatro cubos no pierden ni repiten ningún campo", () => {
    const n = nutri("legumbres_001");
    const d = declaracionesDe(n);
    const todos = [...d.alto.map((f) => f.campo), ...d.fuente.map((f) => f.campo), ...d.noLlega, ...d.noSeSabe];
    expect(todos.sort()).toEqual(CAMPOS_CON_VRN.slice().sort());
  });

  it("sin nutrición no inventa: todo va a no se sabe", () => {
    const d = declaracionesDe(null);
    expect(d.alto).toEqual([]);
    expect(d.noSeSabe).toHaveLength(CAMPOS_CON_VRN.length);
  });
});

describe("lo que se pinta es el titular, no la lista", () => {
  /**
   * LA MEDIANA SON OCHO «ALTO EN» POR PLATO, y eso no es un fallo del cálculo:
   * el corte del 30 % está pensado para 100 g de producto envasado, y una
   * ración de plato principal es del orden de un tercio del día. Un plato que
   * es alto en ocho cosas no dice nada — el fósforo sale alto en 562 de 743 y
   * el selenio en 463: ciertos e inútiles.
   *
   * Este test fija el HECHO para que nadie lo descubra a mitad de una pantalla
   * y lo tome por un error, y para que se vea si algún día deja de ser verdad.
   */
  it("un plato declara muchas cosas, y por eso hace falta cortar", () => {
    const cuentas = recipeCatalog
      .filter((r) => r.estrella)
      .map((r) => declaracionesDe(computeRecipeNutrition(r, r.baseServings || 2)).alto.length)
      .sort((a, b) => a - b);
    const mediana = cuentas[Math.floor(cuentas.length / 2)];
    expect(mediana).toBeGreaterThan(4);
  });

  it("destacaEn corta y ordena por lo que más destaca", () => {
    const top = destacaEn(nutri("legumbres_001"));
    expect(top).toHaveLength(3);
    expect(top[0].pctVRN).toBeGreaterThanOrEqual(top[1].pctVRN);
    expect(top[1].pctVRN).toBeGreaterThanOrEqual(top[2].pctVRN);
  });

  it("y prefiere alto sobre fuente", () => {
    const n = nutri("legumbres_001");
    const d = declaracionesDe(n);
    const top = destacaEn(n, 30);
    expect(top.slice(0, d.alto.length).map((f) => f.campo)).toEqual(d.alto.map((f) => f.campo));
  });

  /**
   * LOS SIETE CAMPOS SIN RETENCIÓN VAN MARCADOS. R6 no publica factor para
   * selenio, yodo, manganeso, ácido pantoténico ni las vitaminas D, E y K, así
   * que sus valores NO llevan descontado lo que se pierde al cocinar y están
   * por encima de lo que llega al plato. Sin la marca, un «alto en selenio» se
   * leería con la misma solidez que un «alto en hierro», y no la tiene.
   */
  it("un alto en selenio avisa de que no lleva cocción descontada", () => {
    const conSelenio = recipeCatalog
      .filter((r) => r.estrella)
      .map((r) => declaracionesDe(computeRecipeNutrition(r, r.baseServings || 2)))
      .flatMap((d) => [...d.alto, ...d.fuente])
      .filter((f) => f.campo === "selenium_ug");
    expect(conSelenio.length).toBeGreaterThan(0);
    for (const f of conSelenio) expect(f.sinRetencion).toBe(true);
  });

  it("y el hierro no lleva esa marca, porque sí se corrige", () => {
    const hierro = destacaEn(nutri("legumbres_001"), 30).find((f) => f.campo === "iron_mg");
    if (hierro) expect(hierro.sinRetencion).toBeUndefined();
  });
});
