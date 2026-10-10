import { describe, expect, it } from "vitest";

import { BLOQUES, cabecera, estadoCI, situacion } from "./lib/situacion.mjs";

const AHORA = new Date("2026-10-10T10:00:00Z");
const hace = (h) => new Date(AHORA - h * 3_600_000).toISOString();

const etiquetas = (...n) => n.map((name) => ({ name }));
const encargo = (number, state) => ({ number, state, tipo: "encargo", labels: etiquetas("tipo:encargo"), agente: null });

/** Fuentes de mentira: lo que leerían gh y git. Cada una puede sobrescribirse o romperse. */
function fuentes(sobre = {}) {
  return {
    prsAbiertos: () => [
      { number: 500, title: "ops: algo", headRefName: "ops/500-algo", checks: [{ status: "COMPLETED", conclusion: "SUCCESS" }] },
      { number: 501, title: "bot: otra", headRefName: "bot/501-otra", checks: [{ status: "COMPLETED", conclusion: "FAILURE" }] },
    ],
    atrasada: (rama) => rama === "bot/501-otra",
    fusionados: () => [
      { number: 490, title: "reciente", headRefName: "ops/490-r", mergedAt: hace(2) },
      { number: 480, title: "vieja", headRefName: "ops/480-v", mergedAt: hace(9) },
    ],
    ramas: () => [
      { rama: "ops/500-algo", carpeta: "MenuPlan-algo", remota: true, ultimo: new Date(hace(1)), numero: 500 },
      { rama: "ops/459-situacion", carpeta: "MenuPlan-situacion", remota: false, ultimo: new Date(hace(6)), numero: 459 },
    ],
    decisiones: () => [
      { number: 300, title: "decidir X", createdAt: hace(100), ultimoComentario: hace(30) },
      { number: 301, title: "decidir Y", createdAt: hace(50), ultimoComentario: null },
    ],
    issues: () => [
      {
        number: 231, title: "fondo A", state: "OPEN", labels: etiquetas("tipo:fondo"), prs: [], marcas: [],
        hijos: [encargo(459, "OPEN"), encargo(461, "OPEN"), encargo(462, "CLOSED")],
      },
      { number: 459, title: "situacion", state: "OPEN", labels: etiquetas("tipo:encargo"), prs: [], hijos: [], marcas: [{ rama: "ops/459-situacion", carpeta: "MenuPlan-situacion", desde: new Date(hace(7)) }] },
      { number: 461, title: "arranque", state: "OPEN", labels: etiquetas("tipo:encargo"), prs: [], hijos: [], marcas: [{ rama: "ops/461-arranque", carpeta: "MenuPlan-arranque", desde: new Date(hace(2)) }] },
      { number: 470, title: "ya hecho", state: "OPEN", labels: etiquetas("tipo:encargo"), prs: [{ number: 489, mergedAt: hace(5) }], hijos: [], marcas: [] },
    ],
    ...sobre,
  };
}

const caer = (motivo) => () => { throw new Error(motivo); };

describe("situacion: cabecera", () => {
  it("lleva la hora de Madrid y la fuente de cada bloque", () => {
    const t = situacion(fuentes(), AHORA);
    expect(t).toMatch(/Situación/);
    expect(t).toMatch(/en Madrid \(UTC\+2\)/);
    expect(t).toMatch(/12:00/); // 10:00 UTC es 12:00 en Madrid en octubre
    for (const b of BLOQUES) expect(cabecera(AHORA)).toContain(b.fuente);
  });
});

describe("situacion: bloques", () => {
  const t = situacion(fuentes(), AHORA);

  it("PR abiertos con su CI y si van atrasados", () => {
    expect(t).toMatch(/#500 .*CI verde.*al día/);
    expect(t).toMatch(/#501 .*CI rojo.*atrasada respecto a origin\/staging/);
  });

  it("fusionado: solo las últimas 6 horas", () => {
    expect(t).toContain("#490");
    expect(t).not.toContain("#480");
  });

  it("ramas vivas con las horas desde su último commit", () => {
    expect(t).toMatch(/ops\/500-algo.*1,0 h/);
    expect(t).toMatch(/ops\/459-situacion en MenuPlan-situacion.*6,0 h/);
  });

  it("decisiones con la fecha de su último comentario y sin afirmar quién espera", () => {
    expect(t).toMatch(/#300 .*último comentario hace 30,0 h/);
    expect(t).toMatch(/#301 .*sin comentarios/);
    expect(t).not.toMatch(/esperando a Pablo/i);
  });

  it("cada fondo con encargos abiertos y cerrados y quién los lleva", () => {
    expect(t).toMatch(/#231 .*2 abiertos, 1 cerrado/);
    expect(t).toMatch(/#459: lo lleva ops\/459-situacion/);
  });

  it("contradicciones: abierto con PR fusionado y 'lo lleva' sin rama viva", () => {
    expect(t).toMatch(/#470 sigue abierto y su PR #489 está fusionado/);
    expect(t).toMatch(/#461 se marcó como «lo lleva ops\/461-arranque».*no hay esa rama viva/);
    expect(t).not.toMatch(/#459 se marcó/);
  });

  it("un bloque sin nada dice que no hay, no queda vacío", () => {
    const vacio = situacion(fuentes({ prsAbiertos: () => [], fusionados: () => [], ramas: () => [], decisiones: () => [], issues: () => [] }), AHORA);
    expect(vacio.match(/ning(uno|una|ún)/gi).length).toBeGreaterThanOrEqual(BLOQUES.length);
  });
});

describe("situacion: fuente caída", () => {
  it("el bloque lo dice con su motivo y el resto sigue", () => {
    const t = situacion(fuentes({ prsAbiertos: caer("API rate limit exceeded") }), AHORA);
    expect(t).toMatch(/sin ver: API rate limit exceeded/);
    expect(t).toContain("#490"); // otro bloque intacto
  });

  it("si caen los issues, fondos y contradicciones lo dicen y no se rellenan", () => {
    const t = situacion(fuentes({ issues: caer("sin red") }), AHORA);
    expect(t.match(/sin ver: sin red/g)).toHaveLength(2);
    expect(t).not.toContain("#231");
  });

  it("si cae git, las ramas lo dicen y la contradicción de rama no se afirma", () => {
    const t = situacion(fuentes({ ramas: caer("git roto") }), AHORA);
    expect(t).toMatch(/sin ver: git roto/);
    expect(t).not.toMatch(/no hay esa rama viva/);
    expect(t).toMatch(/«lo lleva» sin rama viva: sin ver \(git roto\)/);
    expect(t).toMatch(/#470 sigue abierto/);
  });
});

describe("situacion: CI y texto externo", () => {
  it("estadoCI distingue verde, rojo, en curso y sin CI", () => {
    expect(estadoCI([{ status: "COMPLETED", conclusion: "SUCCESS" }])).toBe("CI verde");
    expect(estadoCI([{ status: "COMPLETED", conclusion: "FAILURE" }])).toBe("CI rojo");
    expect(estadoCI([{ status: "IN_PROGRESS", conclusion: "" }])).toBe("CI en curso");
    expect(estadoCI([])).toBe("sin CI");
  });

  it("un título hostil no mete saltos de línea ni HTML en la salida", () => {
    const t = situacion(fuentes({ decisiones: () => [{ number: 9, title: "x\n<img src=y>‮", createdAt: hace(1), ultimoComentario: null }] }), AHORA);
    expect(t).not.toMatch(/<img/);
    expect(t).not.toMatch(/‮/);
  });
});
