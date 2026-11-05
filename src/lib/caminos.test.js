import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CAMINO, CAMINOS, EJES_FUERA_DE_CAMINO, NIVEL_EJE, TEMA, TEMAS, VIVE_EJE, temasDelCamino } from "./caminos.js";
import { DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";
import { SCOPE_TOPIC_STEPS } from "../screens/ScopePickerScreen.jsx";

describe("los tres caminos, una sola lista para la app y Lola", () => {
  const DATOS = { ...DATOS_CASA, ...DATOS_PERSONA };
  const EJES = TEMAS.flatMap((t) => t.ejes.map((e) => ({ ...e, tema: t.id })));

  it("cada eje de un tema existe en el registro y vive donde dice", () => {
    const viveEn = (d) => (d.ficha === "preferencia" ? VIVE_EJE.PREFERENCIA : d.vive?.startsWith("tabla:sobre") ? VIVE_EJE.SOBRE : VIVE_EJE.DOCUMENTO);
    const malos = EJES.filter((e) => !DATOS[e.dato] || viveEn(DATOS[e.dato]) !== e.vive).map((e) => `${e.tema}:${e.dato}`);
    expect(malos).toEqual([]);
  });

  it("todo dato que pesa en el menú está en un tema o dice por qué no: ninguno se pierde", () => {
    const conTema = new Set(EJES.map((e) => e.dato));
    const sinSitio = Object.keys(DATOS).filter((d) => DATOS[d].peso_menu != null && !conTema.has(d) && !EJES_FUERA_DE_CAMINO[d]);
    expect(sinSitio).toEqual([]);
  });

  it("un dato tiene un solo nivel, de la lista cerrada, aunque salga en dos temas", () => {
    const niveles = Object.values(NIVEL_EJE);
    expect(EJES.filter((e) => !niveles.includes(e.nivel))).toEqual([]);
    const dobles = EJES.filter((e) => EJES.some((o) => o.dato === e.dato && o.nivel !== e.nivel));
    expect(dobles).toEqual([]);
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
