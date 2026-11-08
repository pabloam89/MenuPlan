import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { PRIORIDAD_BAJA, bajarPrioridad } from "./prioridad.mjs";

/** Un sistema falso con la prioridad que se le diga: se ve qué se pidió sin tocar el proceso. */
const sistemaCon = (inicial) => {
  let actual = inicial;
  return { getPriority: vi.fn(() => actual), setPriority: vi.fn((pid, p) => { actual = p; }) };
};

describe("bajarPrioridad (#284)", () => {
  it("baja a BELOW_NORMAL un proceso a prioridad normal", () => {
    const sistema = sistemaCon(os.constants.priority.PRIORITY_NORMAL);
    const r = bajarPrioridad({ env: {}, sistema });
    expect(sistema.setPriority).toHaveBeenCalledWith(0, PRIORIDAD_BAJA);
    expect(r).toMatchObject({ hecho: true, motivo: "bajada", despues: PRIORIDAD_BAJA });
  });

  it("no hace nada en el CI ni en Vercel", () => {
    for (const env of [{ CI: "true" }, { VERCEL: "1" }]) {
      const sistema = sistemaCon(0);
      expect(bajarPrioridad({ env, sistema })).toMatchObject({ hecho: false, motivo: "ci" });
      expect(sistema.setPriority).not.toHaveBeenCalled();
    }
  });

  it("solo baja: si ya está más baja (IDLE) no la sube", () => {
    const sistema = sistemaCon(os.constants.priority.PRIORITY_LOW);
    expect(bajarPrioridad({ env: {}, sistema })).toMatchObject({ hecho: false, motivo: "ya-baja" });
    expect(sistema.setPriority).not.toHaveBeenCalled();
  });

  it("un fallo del sistema no lanza: sigue a prioridad normal", () => {
    const sistema = { getPriority: () => 0, setPriority: () => { throw new Error("EACCES"); } };
    expect(bajarPrioridad({ env: {}, sistema })).toMatchObject({ hecho: false, motivo: "error" });
  });
});

// La comprobación de verdad: este fichero corre DENTRO de un worker de vitest (pool forks, otro
// proceso). Si vite.config.js bajó la prioridad del proceso principal antes de lanzarlo, el worker
// la heredó, y también un nieto que lance el worker. En el CI no se baja nada: no se mira.
describe.skipIf(process.env.CI || process.env.VERCEL)("los procesos hijos heredan la prioridad baja (#284)", () => {
  it("el worker de vitest corre con prioridad baja", () => {
    expect(os.getPriority()).toBeGreaterThanOrEqual(PRIORIDAD_BAJA);
  });

  it("un proceso que lanza el worker también", () => {
    const r = spawnSync(process.execPath, ["-e", "console.log(require('node:os').getPriority())"], { encoding: "utf8", windowsHide: true });
    expect(Number(r.stdout.trim())).toBeGreaterThanOrEqual(PRIORIDAD_BAJA);
  });
});
