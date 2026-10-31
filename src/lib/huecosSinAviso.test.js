import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMenuWithAI } from "./aiPlanner.js";
import { huecosEsperados, huecosVacios, describirHuecos } from "./huecosDelPlan.js";
import { casaAleatoria } from "./casasAleatorias.js";
import { DIAS } from "./dias.js";
import { diasActivosDe } from "./planner.js";

/**
 * Lo que el motor asigna llega al plan, y un hueco que se queda vacío lleva
 * su aviso en `plan._warnings` (#1037, trozo 3).
 *
 * Se rompía en la hidratación: un primero que TAMBIÉN puede ser plato único
 * (unas lentejas, una ensalada completa: 106 de los 271 primeros
 * estrella del catálogo) se escribía en el sitio del principal, el segundo lo
 * pisaba y el primero desaparecía sin aviso. La casa del alta (dos adultos,
 * nada que evitar) perdía primeros todas las semanas.
 *
 * Banco: la casa del alta empezando cada día de la semana, y casas de prueba
 * (casasAleatorias.js), con las alergias revisadas como tras el alta. Con el
 * solver, la fecha fija (su semilla sale de Date.now()) y el azar fijo:
 * siempre el mismo resultado.
 */

/** Del día del plan («Mié») al prefijo de los huecos del motor («mie»). */
const PREFIJO = Object.fromEntries(DIAS.map((d) => [d, d.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()]));
const CASAS_DE_PRUEBA = 8;

const casaDelAlta = (startDayIdx) => {
  const g = { id: "g1", label: "Familia", memberIds: ["m1", "m2"] };
  return {
    members: [{ id: "m1", homeRole: "Papá", allergies: [] }, { id: "m2", homeRole: "Mamá", allergies: [] }],
    allergiesReviewed: true, groups: [g], schedule: {}, meals: ["Comida", "Cena"],
    mealStructure: "primero_segundo", mealStructureCena: "1_plato",
    menuWeek: { offset: 0, startDayIdx, days: null },
  };
};

/** Los huecos vacíos del plan y, de ellos, los que `_warnings` no nombra. */
async function huecosDe(data) {
  const { plan } = await generateMenuWithAI(data);
  const vacios = huecosVacios(plan, huecosEsperados(data, { activeDays: diasActivosDe(data) }));
  const avisos = plan._warnings ?? [];
  const sinAviso = vacios.filter((h) => !avisos.some((w) => w.includes(`${PREFIJO[h.dia]}_${h.comida.toLowerCase()}`)));
  return { vacios, sinAviso };
}

const conMotorFijo = () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
};

describe("ningún hueco se queda vacío sin aviso", () => {
  conMotorFijo();

  it("la casa del alta, empezando cada día de la semana, sale completa", async () => {
    for (let dia = 0; dia < DIAS.length; dia++) {
      const { vacios } = await huecosDe(casaDelAlta(dia));
      expect(describirHuecos(vacios), `semana desde ${DIAS[dia]}`).toBe("");
    }
  }, 300000);

  it(`${CASAS_DE_PRUEBA} casas de prueba: lo que falta, avisado`, async () => {
    for (let semilla = 1; semilla <= CASAS_DE_PRUEBA; semilla++) {
      const { sinAviso } = await huecosDe(casaAleatoria(semilla, { nivel: 0 }));
      expect(describirHuecos(sinAviso), `casa ${semilla}`).toBe("");
    }
  }, 300000);
});

/**
 * La cifra (no corre en el CI): semanas con huecos, huecos vacíos y huecos
 * vacíos sin aviso en tres bancos. La casa del alta, revisada y sin revisar
 * (así generaba la app el primer menú tras el alta), 4 semanas × 7 días; y
 * HUECOS_BANCO casas de prueba.
 *
 *   HUECOS_BANCO=100 npx vitest run src/lib/huecosSinAviso.test.js --silent=false --reporter=verbose
 */
const BANCO = Number(process.env.HUECOS_BANCO ?? 0);
const SEMANAS_DEL_ALTA = 4;

describe.skipIf(!BANCO)("la cifra de huecos", () => {
  conMotorFijo();

  it("tres bancos", async () => {
    const cuenta = () => ({ semanas: 0, conHuecos: 0, vacios: 0, sinAviso: 0 });
    const sumar = (t, { vacios, sinAviso }) => {
      t.semanas += 1;
      t.conHuecos += vacios.length > 0 ? 1 : 0;
      t.vacios += vacios.length;
      t.sinAviso += sinAviso.length;
    };
    const tabla = {};
    for (const revisadas of [true, false]) {
      const t = cuenta();
      for (let semana = 0; semana < SEMANAS_DEL_ALTA; semana++) {
        for (let dia = 0; dia < DIAS.length; dia++) {
          vi.setSystemTime(new Date(Date.UTC(2026, 10, 2 + semana * DIAS.length + dia, 9)));
          sumar(t, await huecosDe({ ...casaDelAlta(0), allergiesReviewed: revisadas }));
        }
      }
      tabla[`alta, ${revisadas ? "revisada" : "sin revisar"}`] = t;
    }
    const t = cuenta();
    for (let semilla = 1; semilla <= BANCO; semilla++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 9, 0, semilla)));
      sumar(t, await huecosDe(casaAleatoria(semilla, { nivel: 0 })));
    }
    tabla[`${BANCO} casas de prueba`] = t;
    console.table(tabla);
    expect(Object.keys(tabla)).toHaveLength(3);
  }, 1800000);
});
