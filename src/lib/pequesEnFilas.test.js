/** Cómo comen los peques (`kidDinnerConfig.byMember`) en filas de preferencia (trozo 14 de #1037). */
import { describe, it, expect } from "vitest";
import { filasDeNino, pequesDeFilas, cambiosDePeques } from "./pequesEnFilas.js";
import { PreferenciaInvalida } from "./preferencias.js";
import { normalizeKidDinnerConfig, KID_DINNER_DEFAULTS } from "./kidsMenu.js";
import { EJES } from "../data/axisRegistry.js";

const ANA = "00000000-0000-4000-8000-0000000000a1";
const LEO = "00000000-0000-4000-8000-0000000000a2";
const MIEMBROS = [{ id: ANA }, { id: LEO }];
let n = 0;
/** Las filas como las devolvería preferencias_de_casa: con id y lo que no llevan, null. */
const enTabla = (filas) => filas.map((f) => ({ id: `f${++n}`, grupo_id: null, plan_id: null, semanas: null, desde: null, hasta: null, salvo_dias: null, salvo_comidas: null, salvo_semanas: null, ...f }));
const ANA_CFG = { ...structuredClone(KID_DINNER_DEFAULTS), weekdayLunch: "own", dinner: "different", weekend: "together", reuseColeDinner: true,
  limited: true, safeFoods: ["pasta", "arroz"], avoid: { protein: true, carbs: false, veg: true } };

describe("los peques en filas", () => {
  it("sus ejes son de EJES (0117 y subtipoIngrediente)", () => {
    const ids = new Set(EJES.map((e) => e.id));
    for (const f of filasDeNino(ANA, ANA_CFG)) expect(ids.has(f.eje), f.eje).toBe(true);
  });

  it("ida y vuelta: la config de cada niño sale igual de sus filas", () => {
    const cfg = normalizeKidDinnerConfig({ byMember: { [ANA]: ANA_CFG, [LEO]: KID_DINNER_DEFAULTS } });
    const filas = enTabla([...filasDeNino(ANA, cfg.byMember[ANA]), ...filasDeNino(LEO, cfg.byMember[LEO])]);
    expect(pequesDeFilas(filas)).toEqual(cfg);
    expect(pequesDeFilas([])).toEqual({ byMember: {} });
  });

  it("cada comida, con su ámbito: el mediodía y la cena entre semana y el finde", () => {
    const familia = filasDeNino(ANA, ANA_CFG).filter((f) => f.eje === "comeConLaFamilia");
    expect(familia.map((f) => [f.dias, f.comidas, f.valor])).toEqual([
      [["Lun", "Mar", "Mié", "Jue", "Vie"], ["Comida"], false],
      [["Lun", "Mar", "Mié", "Jue", "Vie"], ["Cena"], false],
      [["Sáb", "Dom"], null, true],
    ]);
  });

  it("una fila que no se sabe leer falla en alto", () => {
    const [mediodia] = enTabla(filasDeNino(ANA, ANA_CFG));
    expect(() => pequesDeFilas([{ ...mediodia, dias: ["Lun"] }])).toThrow(PreferenciaInvalida);
    expect(() => pequesDeFilas(enTabla([{ persona_id: ANA, eje: "repiteDelComedor", operador: "no_es", valor: "postre" }]))).toThrow(/no es protein/);
  });

  it("cambiar una cosa de un niño: borra la fila de antes y crea la nueva; los demás niños no se tocan", () => {
    const filas = enTabla([...filasDeNino(ANA, ANA_CFG), ...filasDeNino(LEO, KID_DINNER_DEFAULTS)]);
    const antes = pequesDeFilas(filas);
    const despues = structuredClone(antes);
    despues.byMember[ANA].weekend = "own";
    const cambios = cambiosDePeques(antes, despues, filas, MIEMBROS);
    const vieja = filas.find((f) => f.persona_id === ANA && f.eje === "comeConLaFamilia" && f.dias?.includes("Sáb"));
    expect(cambios).toEqual([expect.objectContaining({ persona_id: ANA, eje: "comeConLaFamilia", valor: false, dias: ["Sáb", "Dom"] }), { id: vieja.id, borrar: true }]);
    expect(cambiosDePeques(antes, structuredClone(antes), filas, MIEMBROS)).toEqual([]);
    expect(cambiosDePeques(antes, undefined, filas, MIEMBROS)).toEqual([]);
  });

  it("quitar un niño de la config borra todas sus filas; uno que no es de la casa no se guarda", () => {
    const filas = enTabla(filasDeNino(LEO, KID_DINNER_DEFAULTS));
    expect(cambiosDePeques(pequesDeFilas(filas), { byMember: {} }, filas, MIEMBROS)).toEqual(filas.map((f) => ({ id: f.id, borrar: true })));
    expect(() => cambiosDePeques({}, { byMember: { otro: KID_DINNER_DEFAULTS } }, [], MIEMBROS)).toThrow(/no es de la casa/);
  });
});
