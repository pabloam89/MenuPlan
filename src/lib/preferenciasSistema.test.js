import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { PREFERENCIAS_SISTEMA, PREFERENCIA_DEL_SISTEMA, FORMAS_REGLA, AMBITOS_REGLA, MOTIVOS_ESCRITA, RELAJABLES, rompe } from "./preferenciasSistema.js";
import { FUERZAS_PREFERENCIA, ORIGEN_DATO } from "./vocabularios.js";
import { REGLAS_RELAJABLES } from "./solver.js";
import { buildGroupContext } from "./entradaMotor.js";
import { casaAleatoria, rng } from "./casasAleatorias.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import {
  validateMenu, splitAchievableFreqs, huecoDe, UNARIAS, NO_REPETIR, FREQ_KEY_MATCHERS, CORRECTABLE_HEALTH_PROFILES,
} from "../utils/validateMenu.js";
import { CIFRAS } from "../../scripts/lib/cifrasModelo.js";

// Las reglas del validador como preferencias del sistema (trozo 32 de #1037).

describe("cada regla del validador, declarada una vez como preferencia del sistema", () => {
  it("con casa *, origen derivado, una fuerza, y su forma de lista cerrada", () => {
    expect(new Set(PREFERENCIAS_SISTEMA.map((p) => p.id)).size).toBe(PREFERENCIAS_SISTEMA.length);
    for (const p of PREFERENCIAS_SISTEMA) {
      expect(p.casa, p.id).toBe("*");
      expect(ORIGEN_DATO, p.id).toContain(p.origen);
      expect(p.origen, p.id).toBe("derivado");
      expect(FUERZAS_PREFERENCIA, p.id).toContain(p.fuerza);
      expect(FORMAS_REGLA, p.id).toContain(p.forma);
      if (p.forma === "escrita") expect(MOTIVOS_ESCRITA, p.id).toContain(p.motivo);
      else expect(AMBITOS_REGLA, p.id).toContain(p.ambito);
    }
  });

  it("las reglas que escribe validateMenu.js son las declaradas, ni una más ni una menos", () => {
    // Los ids viven en validateMenu.js (cada `rule: "…"`) y en la declaración: se comparan las dos listas enteras.
    const texto = readFileSync(new URL("../utils/validateMenu.js", import.meta.url), "utf8");
    const emitidas = [...new Set([...texto.matchAll(/\brule: "([A-Za-z_]+)"/g)].map((m) => m[1]))].sort();
    expect(emitidas).toEqual(PREFERENCIAS_SISTEMA.map((p) => p.id).sort());
    for (const u of UNARIAS) expect(PREFERENCIA_DEL_SISTEMA[u.rule]).toMatchObject({ forma: "preferencia", ambito: "hueco" });
    for (const r of NO_REPETIR) expect(PREFERENCIA_DEL_SISTEMA[r.rule]).toMatchObject({ forma: "escrita", motivo: "entre_platos" });
  });

  it("las escritas no suben de la línea base de su cifra (reglas_fuera_de_preferencias, que solo baja)", () => {
    const cifra = CIFRAS.find((c) => c.id === "reglas_fuera_de_preferencias");
    const escritas = PREFERENCIAS_SISTEMA.filter((p) => p.forma === "escrita").length;
    expect(cifra.medir()).toEqual({ valor: escritas, de: PREFERENCIAS_SISTEMA.length });
    expect(escritas).toBeLessThanOrEqual(cifra.base.valor);
  });

  it("las relajables del solver son las que no son obligatorias, y son las cuatro de siempre", () => {
    expect([...REGLAS_RELAJABLES].sort()).toEqual([...RELAJABLES].sort());
    expect([...REGLAS_RELAJABLES].sort()).toEqual(
      ["freq_max_exceeded", "guarnicion_legumbre", "health_profile_conflict", "segundo_sin_proteina_principal"],
    );
  });

  it("rompe: una regla escrita o una cantidad que no es un número lanzan", () => {
    expect(() => rompe("recipeId_repetido", 2)).toThrow(/no es una preferencia/);
    expect(() => rompe("freq_max_exceeded", 2, undefined)).toThrow(/no es un número/);
    expect(rompe("freq_max_exceeded", 3, 2)).toBe(true);
    expect(rompe("freq_max_exceeded", 2, 2)).toBe(false);
  });
});

// Paridad: el veredicto escrito de cada regla (la unaria no se cumple; la familia pasa de su tope) y el que da
// validateMenu, que ahora pregunta al evaluador, son el mismo sobre casas y menús aleatorios. Reloj y azar fijos.
describe("paridad: validateMenu con el evaluador da el mismo veredicto que la regla escrita", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.42);
  });
  afterAll(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  /** Un menú al azar del pool entero: rompe unarias y topes a menudo, que es lo que hay que ver. */
  function menuAleatorio(slots, pool, r) {
    return slots.map((s) => ({ slotId: s.slotId, recipeId: pool[Math.floor(r() * pool.length)].id }));
  }

  it("en 12 casas y 4 menús por grupo, hueco a hueco y tope a tope", () => {
    const vistas = new Set();
    let menus = 0;
    for (let semilla = 3200; semilla < 3212; semilla++) {
      const data = casaAleatoria(semilla);
      const r = rng(semilla);
      for (const group of data.groups) {
        const ctx = buildGroupContext(data, group);
        const { recipes: pool, error } = filterRecipes(ctx.filterOpts);
        if (error || !pool.length) continue;
        const { achievable: freqs } = splitAchievableFreqs(pool, ctx.config.freqs);
        const perfiles = ctx.config.healthProfiles ?? [];
        const extra = { activeHealthProfiles: [...new Set(perfiles)].filter((id) => CORRECTABLE_HEALTH_PROFILES.has(id)) };
        const porId = Object.fromEntries(pool.map((x) => [x.id, x]));
        const porSlot = Object.fromEntries(ctx.slots.map((s) => [s.slotId, s]));
        for (let k = 0; k < 4; k++) {
          const menu = menuAleatorio(ctx.slots, pool, r);
          const { violations } = validateMenu(menu, pool, ctx.slots, perfiles, freqs);
          menus += 1;
          for (const u of UNARIAS) {
            const escrita = menu.filter((a) => !u.cumple(porId[a.recipeId], huecoDe(a.slotId, porSlot[a.slotId], extra))).map((a) => a.slotId);
            const evaluada = violations.filter((v) => v.rule === u.rule).map((v) => v.slotId);
            expect(new Set(evaluada), `${semilla} ${group.id} ${u.rule}`).toEqual(new Set(escrita));
            if (escrita.length) vistas.add(u.rule);
          }
          const pasadas = Object.entries(freqs).filter(([key, tope]) => menu.filter((a) => FREQ_KEY_MATCHERS[key](porId[a.recipeId])).length > tope);
          const marcadas = violations.filter((v) => v.rule === "freq_max_exceeded");
          expect(marcadas.length > 0, `${semilla} ${group.id} topes`).toBe(pasadas.length > 0);
          for (const v of marcadas) expect(pasadas.map(([key]) => key), v.message).toContain(v.targetKey);
          if (pasadas.length) vistas.add("freq_max_exceeded");
        }
      }
    }
    // Que la paridad no sea de menús que no rompen nada: casi todas las reglas evaluadas salen rotas alguna vez.
    expect(menus).toBeGreaterThanOrEqual(40);
    expect(vistas.size, [...vistas].join(", ")).toBeGreaterThanOrEqual(10);
  });
});
