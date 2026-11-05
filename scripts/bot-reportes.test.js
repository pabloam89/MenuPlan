import { describe, it, expect } from "vitest";
import { resumir, pintar, leerDias, DIAS_POR_DEFECTO, SIN_TIPO, FALTA_TURNO } from "./bot-reportes.mjs";
import { SIN_LEER_REPORTE } from "../api/_bot/reporte.js";
import { TIPOS_REPORTE } from "../src/lib/vocabularios.js";

const reporte = (id, created_at, metadata) => ({ id, created_at, metadata });
const FIJOS = [
  reporte(2, "2026-11-04T17:50:00Z", { quien: "Manu", tipo: "dato_mal", texto: "quería la pasta del martes", ultima: "He puesto <b>lentejas</b> el martes", ruta_id: 4242, ruta_enlace: "mensaje" }),
  reporte(1, "2026-11-04T09:05:00Z", { quien: "Pablo", tipo: "lento", ultima: "Aquí tienes la semana", anterior: "¿qué comemos esta semana?", ruta_id: 4100, ruta_enlace: "hora" }),
  reporte(3, "2026-11-04T18:10:00Z", { quien: "Álvaro", ultima: null }),
];
const RUTAS = [
  { id: 4242, metadata: { texto: "pon pasta el martes", lola: { herramientas: [["ver_menu", 120], ["cambiar_plato", 300]] } } },
  { id: 4100, metadata: { lola: { herramientas: [] } } },
];

describe("bot-reportes: los /fallo de los probadores", () => {
  it("cuenta por tipo, con todos los de la lista y los que se quedaron sin tipo", () => {
    const { porTipo, lineas } = resumir(FIJOS, RUTAS);
    expect(Object.keys(porTipo)).toEqual([...TIPOS_REPORTE, SIN_TIPO]);
    expect(porTipo).toMatchObject({ dato_mal: 1, lento: 1, [SIN_TIPO]: 1, formato: 0 });
    expect(lineas.map((l) => l.quien)).toEqual(["Pablo", "Manu", "Álvaro"]);
  });

  it("cada uno con la hora de Madrid, lo de antes y las herramientas de su turno", () => {
    const [pablo, manu, alvaro] = resumir(FIJOS, RUTAS).lineas;
    expect(pablo.cuando).toBe("2026-11-04 10:05");
    expect(manu).toMatchObject({ antes: "pon pasta el martes", herramientas: ["ver_menu", "cambiar_plato"], turno: "mensaje" });
    expect(pablo).toMatchObject({ antes: "¿qué comemos esta semana?", herramientas: [] });
    expect(alvaro.herramientas).toBe(null);
  });

  it("lo que falta por un fallo se dice, no se pinta como «sin turno» (juez C5)", () => {
    const fallados = [
      reporte(5, "2026-11-04T19:00:00Z", { quien: "Manu", tipo: "otro", sin_leer: [SIN_LEER_REPORTE.RUTA, SIN_LEER_REPORTE.CHARLA] }),
      reporte(6, "2026-11-04T19:05:00Z", { quien: "Pablo", tipo: "otro", ruta_id: 9999, ruta_enlace: "hora" }),
    ];
    const r = resumir([...FIJOS, ...fallados], RUTAS);
    expect(r.lineas.map((l) => l.faltan)).toEqual([[], [], [], [SIN_LEER_REPORTE.RUTA, SIN_LEER_REPORTE.CHARLA], [FALTA_TURNO]]);
    const texto = pintar(r, 7);
    expect(texto).toContain("Falta: no se pudo leer el turno al apuntarlo; no se pudo leer la charla al apuntarlo");
    expect(texto).toContain("Falta: su turno ya no está en la base");
    expect(texto.match(/Falta:/g)).toHaveLength(2);
  });

  it("un tipo fuera de la lista es un error, no una cuenta aparte", () => {
    expect(() => resumir([reporte(9, "2026-11-04T10:00:00Z", { tipo: "me_aburre" })])).toThrow(/fuera de la lista/);
  });

  it("pinta cada reporte y la cuenta por tipo", () => {
    const texto = pintar(resumir(FIJOS, RUTAS), 7);
    expect(texto).toContain("Últimos 7 días: 3 fallos apuntados");
    expect(texto).toContain("Lola: «He puesto lentejas el martes»");
    expect(texto).toContain("Herramientas: ver_menu, cambiar_plato [turno por mensaje]");
    expect(texto).toMatch(/Por tipo: no_entendio 0, hizo_otra_cosa 0, dato_mal 1, formato 0, lento 1, otro 0, sin_tipo 1\.$/);
  });

  it("sin --dias, una semana", () => {
    expect(leerDias(["node", "x"])).toBe(DIAS_POR_DEFECTO);
    expect(leerDias(["node", "x", "--dias", "30"])).toBe(30);
  });
});
