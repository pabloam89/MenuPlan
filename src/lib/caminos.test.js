import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CAMINO, CAMINOS, TEMA, TEMAS, temasDelCamino } from "./caminos.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { SCOPE_TOPIC_STEPS } from "../screens/ScopePickerScreen.jsx";

describe("los tres caminos, una sola lista para la app y Lola", () => {
  it("cada dato que dice contestar un tema existe en el registro", () => {
    const sinRegistro = TEMAS.flatMap((t) => t.campos.filter((c) => !REGISTRO_CAMPOS[c]).map((c) => `${t.id}:${c}`));
    expect(sinRegistro).toEqual([]);
  });

  it("cada camino abre solo temas que existen, y Al detalle los abre todos", () => {
    const ids = new Set(TEMAS.map((t) => t.id));
    for (const c of CAMINOS) for (const t of c.temas) expect(ids.has(t)).toBe(true);
    expect(temasDelCamino(CAMINO.AVANZADO, { hayNinos: true })).toEqual(TEMAS.map((t) => t.id));
  });

  it("cada camino contiene al anterior: subir de camino nunca quita una pregunta", () => {
    const [basico, medio, avanzado] = [CAMINO.BASICO, CAMINO.MEDIO, CAMINO.AVANZADO]
      .map((id) => new Set(temasDelCamino(id, { hayNinos: true })));
    for (const t of basico) expect(medio.has(t)).toBe(true);
    for (const t of medio) expect(avanzado.has(t)).toBe(true);
    expect(basico.size).toBeLessThan(medio.size);
    expect(medio.size).toBeLessThan(avanzado.size);
  });

  it("sin niños, ningún camino pregunta por el cole ni por cómo comen los niños", () => {
    for (const c of CAMINOS) {
      const temas = temasDelCamino(c.id, { hayNinos: false });
      expect(temas).not.toContain(TEMA.COLE);
      expect(temas).not.toContain(TEMA.NINOS);
    }
    expect(temasDelCamino(CAMINO.BASICO, { hayNinos: true })).toContain(TEMA.COLE);
  });

  it("la pantalla del asistente tiene pasos para cada tema de la lista", () => {
    for (const t of TEMAS) expect(SCOPE_TOPIC_STEPS[t.id]?.length ?? 0).toBeGreaterThan(0);
  });

  it("el bot puede importarla: no trae nada de pantallas ni JSX", () => {
    const fuente = readFileSync(new URL("./caminos.js", import.meta.url), "utf8");
    expect(fuente).not.toMatch(/^import /m);
  });

  it("un camino desconocido falla en alto, no se lee como «nada que preguntar»", () => {
    expect(() => temasDelCamino("otro")).toThrow(/Camino desconocido: otro/);
  });
});
