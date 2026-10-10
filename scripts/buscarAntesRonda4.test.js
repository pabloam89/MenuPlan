import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { ejecutar } from "../.claude/hooks/buscar-antes.mjs";
import { construirIndice, detectarSenales, escribirIndice, podarMarcas } from "./lib/buscarAntes.mjs";

/** Revisión de integración de #384: marcas en Windows y señales duplicadas. */
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "buscar-r4-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("M1: si no se pueden guardar las marcas, el aviso se emite igual", () => {
  it("un renombrado que falla (EPERM en Windows) no pierde el aviso ni deja temporales", () => {
    const d = tmp();
    const issue = { number: 348, title: "[caso] Agentes no cargan", state: "OPEN", body: "Agent type 'qa' not found; agentes", labels: [{ name: "tipo:caso" }], asignados: [], marcas: [], prs: [], padre: null, hijos: [], asociacion: "OWNER" };
    escribirIndice(construirIndice([issue]), join(d, "indice.json"));
    const sesion = "paralela";
    // El fichero de marcas es una carpeta: renombrar encima falla siempre, como el EPERM de dos procesos a la vez.
    mkdirSync(join(d, `sesion-${createHash("sha1").update(sesion).digest("hex").slice(0, 16)}.json`));
    process.env.MENUPLAN_BUSCAR_DIR = d;
    try {
      const textos = ejecutar({ session_id: sesion, cwd: tmp(), tool_name: "Agent", error: "Agent type 'qa' not found", hook_event_name: "PostToolUseFailure" });
      expect(textos).toHaveLength(1);
      expect(textos[0]).toMatch(/Algo no encaja/);
      expect(readdirSync(d).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    } finally {
      delete process.env.MENUPLAN_BUSCAR_DIR;
    }
  });

  it("podarMarcas borra también los .tmp viejos y deja los recientes", () => {
    const d = tmp();
    const viejo = join(d, "sesion-0123456789abcdef.json.123.abc.tmp");
    const nuevo = join(d, "indice.json.456.def.tmp");
    writeFileSync(viejo, "x");
    writeFileSync(nuevo, "x");
    const hace8 = new Date(Date.now() - 8 * 86_400_000);
    utimesSync(viejo, hace8, hace8);
    podarMarcas(d);
    expect(existsSync(viejo)).toBe(false);
    expect(existsSync(nuevo)).toBe(true);
  });
});

describe("M2: un error de agente no sale dos veces", () => {
  it("«Error: Agent type … not found» da solo la señal de agente", () => {
    const e = { tool_name: "Agent", tool_input: {}, error: "Error: Agent type 'qa' not found", hook_event_name: "PostToolUseFailure" };
    expect(detectarSenales(e).map((s) => s.tipo)).toEqual(["agente-no-existe"]);
  });
});
