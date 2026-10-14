import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerPrincipiosCasa, principiosDeProyecto } from "../scripts/lib/principios.mjs";
import { DOMINIOS_OPCIONALES } from "../scripts/lib/ambitos.mjs";

/**
 * El script `npm run principios-casa` (#619, #710): cada forma de llamarlo hace lo suyo.
 * Lección: sin `--proyecto`, `args.indexOf` da -1 y `args[iProy + 1]` era `args[0]`, que descartaba justo
 * el área o el id pedido y el script imprimía el resumen en vez de lo pedido.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corre = (...args) => {
  const r = spawnSync(process.execPath, ["scripts/principios-casa.mjs", ...args], { cwd: RAIZ, encoding: "utf8" });
  return { salida: r.stdout, error: r.stderr, codigo: r.status };
};
const datos = leerPrincipiosCasa(RAIZ);

describe("scripts/principios-casa.mjs", () => {
  it("sin argumentos: el resumen por área", () => {
    const r = corre();
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/principios, \d+ de un catálogo delegado/);
    expect(r.salida).toMatch(/^total /m);
  });

  it("<área>: los principios de esa área, no el resumen", () => {
    const area = datos.principios[0].area;
    const r = corre(area);
    expect(r.salida).not.toMatch(/de un catálogo delegado, \d+ sin norma\n.*total/s);
    expect(r.salida).not.toMatch(/^total /m);
    expect(r.salida).toContain(datos.principios.find((p) => p.area === area).id);
    expect(r.salida).toMatch(/normas:/);
  });

  it("<id>: uno solo, entero", () => {
    const p = datos.principios[0];
    const r = corre(p.id);
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/fuentes:/);
    expect(r.salida).not.toMatch(/^total /m);
  });

  it("--proyecto homenu: cuenta con sus dominios", () => {
    const r = corre("--proyecto", "homenu");
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/^homenu: \d+ de \d+ principios \(dominios: bot\)/);
  });

  it("--proyecto sin valor: error claro, no caída", () => {
    const r = corre("--proyecto");
    expect(r.codigo).toBe(1);
    expect(r.error).toMatch(/no es un proyecto/);
  });

  it("--proyecto con un id que no existe: error", () => {
    const r = corre("--proyecto", "no-existe");
    expect(r.codigo).toBe(1);
  });
});

describe("principiosDeProyecto", () => {
  const ps = datos.principios;
  it("dominios = null: todos los principios", () => {
    expect(principiosDeProyecto(ps, null)).toHaveLength(ps.length);
  });
  it("un dominio declarado que no es opcional no filtra nada y no mete los opcionales", () => {
    expect(DOMINIOS_OPCIONALES).not.toContain("no-opcional");
    const lista = principiosDeProyecto(ps, ["no-opcional"]);
    expect(lista.every((p) => !DOMINIOS_OPCIONALES.includes(p.dominio))).toBe(true);
    expect(lista).toHaveLength(ps.filter((p) => !DOMINIOS_OPCIONALES.includes(p.dominio)).length);
  });
  it("un dominio opcional declarado mete los suyos", () => {
    expect(principiosDeProyecto(ps, [...DOMINIOS_OPCIONALES])).toHaveLength(ps.length);
  });
});
