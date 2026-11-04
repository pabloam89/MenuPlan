/**
 * El riesgo de cada herramienta de Lola y cómo la deshace «deshaz», en su ficha (trozo 42 del plan de fichas):
 * los dos vocabularios de src/lib/vocabularios.js, que cuadran entre sí y con lo que hacen de verdad deshacer
 * (api/_bot/casa.js) y el vigilante (api/_bot/supervisor.js).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { RIESGOS_HERRAMIENTA, RIESGO_HERRAMIENTA, FORMAS_DE_DESHACER, DESHACE } from "../../src/lib/vocabularios.js";
import { TIPO_DE_HERRAMIENTA, TIPO_OPERACION } from "./operacion.js";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { FICHAS, SOLO_LECTURA, vigilada } = await import("./agente.js");
const conRiesgo = (r) => [...FICHAS].filter(([, f]) => f.riesgo === r).map(([n]) => n).sort();

describe("riesgo y deshacer en la ficha de cada herramienta", () => {
  it("toda herramienta lleva un riesgo y una forma de deshacer de su vocabulario", () => {
    for (const [n, f] of FICHAS) {
      expect(RIESGOS_HERRAMIENTA, n).toContain(f.riesgo);
      expect(FORMAS_DE_DESHACER, n).toContain(f.deshace);
    }
  });

  it("solo lectura es riesgo «lee»: no hay otra lista", () => {
    expect([...SOLO_LECTURA].sort()).toEqual(conRiesgo(RIESGO_HERRAMIENTA.LEE));
  });

  it("lo reversible y lo que quita protección se deshacen; lo que lee y lo irreversible, no", () => {
    const seDeshace = new Set([RIESGO_HERRAMIENTA.ESCRIBE_REVERSIBLE, RIESGO_HERRAMIENTA.QUITA_PROTECCION]);
    for (const [n, f] of FICHAS) expect(f.deshace !== DESHACE.NO, `${n}: ${f.riesgo} con ${f.deshace}`).toBe(seDeshace.has(f.riesgo));
  });

  it("deshace con foto solo lo que no se apunta fuera de la casa; por su operación, solo lo que tiene pasos que deshacer", () => {
    // TIPO_DE_HERRAMIENTA (operacion.js) dice qué escribe fuera de la casa, sin foto; de esos, deshacer
    // (casa.js, deshacerPasos) solo sabe quitar la receta guardada.
    for (const [n, f] of FICHAS) {
      if (f.deshace === DESHACE.FOTO) expect(TIPO_DE_HERRAMIENTA[n], n).toBeUndefined();
      if (f.deshace === DESHACE.OPERACION) expect(TIPO_DE_HERRAMIENTA[n], n).toBe(TIPO_OPERACION.RECETA);
      if (TIPO_DE_HERRAMIENTA[n]) expect(f.deshace, n).not.toBe(DESHACE.FOTO);
    }
  });

  it("lo que quita protección son las tres de hoy, y son las que el vigilante sabe contrastar", () => {
    expect(conRiesgo(RIESGO_HERRAMIENTA.QUITA_PROTECCION)).toEqual(["ajustar_alergias", "ajustar_salud", "quitar_comensal"]);
    const src = readFileSync(new URL("./supervisor.js", import.meta.url), "utf8");
    const vigila = [...src.matchAll(/herramienta === "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(vigila)].sort()).toEqual(conRiesgo(RIESGO_HERRAMIENTA.QUITA_PROTECCION));
  });

  it("el vigilante mira las que quitan protección, y ninguna más", () => {
    for (const n of FICHAS.keys()) expect(vigilada(n), n).toBe(FICHAS.get(n).riesgo === RIESGO_HERRAMIENTA.QUITA_PROTECCION);
    expect(vigilada("no_existe")).toBe(false);
  });
});
