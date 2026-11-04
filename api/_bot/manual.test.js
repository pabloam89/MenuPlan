/**
 * El manual de Lola con sus marcas rellenas desde las fichas y el mapa de capacidades (api/_bot/manual.js,
 * trozo 43): lo que dice que sabe hacer, lo que solo se hace en la app y lo que no se deshace sale de ahí.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { armarManual, rellenos, MARCAS_MANUAL } from "./manual.js";
import { DESHACE } from "../../src/lib/vocabularios.js";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { FICHAS, sistema } = await import("./agente.js");
const { CAPACIDADES, estadoDe } = await import("../../src/lib/capacidades.js");
const MANUAL = readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
const DE_VERDAD = { capacidades: CAPACIDADES, fichas: FICHAS };
const lineas = (texto) => texto.split("\n").filter((l) => l.startsWith("• ")).map((l) => l.slice(2));

describe("el manual armado", () => {
  it("no le queda ninguna marca, y es el que usa Lola", async () => {
    const armado = await sistema();
    expect(armado).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(armado).toBe(armarManual(MANUAL, DE_VERDAD));
  });

  it("sale igual cada vez: la caché del prompt no se rompe", async () => {
    expect(armarManual(MANUAL, DE_VERDAD)).toBe(armarManual(MANUAL, DE_VERDAD));
    expect(await sistema()).toBe(await sistema());
  });

  it("una marca sin poner o que no existe no se le da al modelo", () => {
    expect(() => armarManual(MANUAL.replace("{{SOLO_EN_LA_APP}}", ""), DE_VERDAD)).toThrow(/sin poner: SOLO_EN_LA_APP/);
    expect(() => armarManual(`${MANUAL}\n{{OTRA_COSA}}`, DE_VERDAD)).toThrow(/no existen: OTRA_COSA/);
    for (const m of Object.keys(MARCAS_MANUAL)) expect(MANUAL, m).toContain(`{{${m}}}`);
  });
});

describe("lo que dice sale del mapa y de las fichas", () => {
  const r = rellenos(DE_VERDAD);

  it("lo que sabe hacer: cada capacidad con alguna herramienta suya, y ninguna más", () => {
    expect(lineas(r.QUE_SABES_HACER)).toEqual(CAPACIDADES.filter((c) => c.lola.length > 0).map((c) => c.accion));
  });

  it("lo que solo se hace en la app: las que la app hace (encendida) y Lola no", () => {
    expect(lineas(r.SOLO_EN_LA_APP)).toEqual(CAPACIDADES.filter((c) => estadoDe(c) === "solo_app").map((c) => c.accion));
  });

  it("lo que no se deshace: cada capacidad cuyas herramientas que escriben son todas «deshace: no»", () => {
    const dichas = new Set(lineas(r.QUE_SE_DESHACE));
    for (const c of CAPACIDADES.filter((x) => x.lola.length > 0 && x.verbo !== "deshacer")) {
      const escriben = c.lola.map((n) => FICHAS.get(n)).filter((f) => !f.soloLectura);
      const no = escriben.length > 0 && escriben.every((f) => f.deshace === DESHACE.NO);
      expect(dichas.has(c.accion), c.id).toBe(no);
    }
    // Lo que el manual decía a mano antes de las fichas sigue dicho: despensa, tareas y recordatorios.
    for (const id of ["anadir_despensa", "tareas", "recordatorios"]) expect(dichas, id).toContain(CAPACIDADES.find((c) => c.id === id).accion);
  });
});
