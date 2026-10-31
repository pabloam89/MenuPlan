import { describe, expect, it } from "vitest";

import { acabadas, clasificar, contar, jobDelJuez, leerPr, leerSalida, LIMITE_EJECUCIONES, MOTIVOS_SIN_VEREDICTO, motivoSinVeredicto, tabla } from "./rondas-del-juez.mjs";

// Líneas con la forma de `gh run view <id> --log`: job, paso, hora y texto.
const linea = (texto) => `revisor / juzgar\tUNKNOWN STEP\t2026-10-30T22:40:15.1678601Z ${texto}`;
const salida = (respuestas) => linea(`  SALIDA: ${JSON.stringify({ respuestas })}`);
const log = (...lineas) => [linea("##[group]Run node .fabrica/scripts/veredicto.mjs"), ...lineas, linea("  PR: 1066")].join("\n");

const r = (id, respuesta) => ({ id, respuesta, prueba: `prueba de ${id}` });

describe("rondas-del-juez: lee el veredicto de la línea SALIDA", () => {
  it("saca las respuestas y el número de PR", () => {
    const l = log(salida([r("C9", "no"), r("C6", "sí")]));
    expect(leerSalida(l).respuestas.map((x) => x.id)).toEqual(["C9", "C6"]);
    expect(leerPr(l)).toBe(1066);
  });

  it("dos líneas SALIDA en un log es un error, no se escoge una", () => {
    expect(() => leerSalida(log(salida([r("C9", "no")]), salida([r("C9", "sí")])))).toThrow(/2 líneas SALIDA/);
  });

  it("solo lee el PR de la variable PR, no de PR_NUMBER", () => {
    expect(leerPr(linea("  PR_NUMBER: 7"))).toBeNull();
  });

  it("sin SALIDA, o con una SALIDA cortada, no hay veredicto", () => {
    expect(leerSalida(log(linea("veredicto: no")))).toBeNull();
    expect(leerSalida(log(linea('  SALIDA: {"respuestas":[{"id":"C9","respu')))).toBeNull();
  });
});

describe("rondas-del-juez: clasifica cada ejecución", () => {
  it("cuenta solo los «no», sin repetir un id dentro de la misma ejecución", () => {
    const c = clasificar({ id: 1, rama: "ops/x", conclusion: "success", log: log(salida([r("C9", "no"), r("C9", "No"), r("C6", "sí"), r("C8", "no aplica")])) });
    expect(c).toMatchObject({ veredicto: true, noes: ["C9"], motivo: null, pr: 1066 });
  });

  it("un veredicto sin número de PR para el script", () => {
    expect(() => clasificar({ id: 9, rama: "x", conclusion: "success", log: salida([r("C9", "no")]) })).toThrow(/ejecución 9 trae veredicto y no «PR: n»/);
  });

  it("sin SALIDA no inventa «no»: motivo del vocabulario según la señal del log", () => {
    const tope = clasificar({ id: 2, rama: "x", conclusion: "success", log: log(linea("Reached maximum number of turns: exceeding the configured maximum")) });
    expect(tope).toMatchObject({ veredicto: false, noes: [], motivo: "tope-de-turnos" });
    expect(motivoSinVeredicto(linea("salida ilegible"), "success")).toBe("salida-ilegible");
    expect(motivoSinVeredicto(linea("C9: sin respuesta"), "success")).toBe("sin-respuesta");
    expect(motivoSinVeredicto("", "cancelled")).toBe("cancelada");
    expect(motivoSinVeredicto("", "success")).toBe("sin-salida");
  });

  it("todo motivo que devuelve está en MOTIVOS_SIN_VEREDICTO", () => {
    const motivos = MOTIVOS_SIN_VEREDICTO.map((m) => m.motivo);
    for (const [texto, conclusion] of [["exceeding the configured maximum", "success"], ["salida ilegible", "failure"], ["", "cancelled"], ["", "skipped"]]) {
      expect(motivos).toContain(motivoSinVeredicto(texto, conclusion));
    }
  });
});

describe("rondas-del-juez: suma por criterio", () => {
  const clasificadas = [
    { id: 1, rama: "a", pr: 10, veredicto: true, noes: ["C9", "C6"], motivo: null },
    { id: 2, rama: "a", pr: 10, veredicto: true, noes: ["C9"], motivo: null },
    { id: 3, rama: "b", pr: 11, veredicto: true, noes: ["C9"], motivo: null },
    { id: 4, rama: "b", pr: 11, veredicto: true, noes: [], motivo: null },
    { id: 5, rama: "c", pr: null, veredicto: false, noes: [], motivo: "tope-de-turnos" },
    { id: 6, rama: "c", pr: null, veredicto: false, noes: [], motivo: "cancelada" },
  ];

  it("ordena por «no» y cuenta los PR distintos", () => {
    const res = contar(clasificadas);
    expect(res).toMatchObject({ ejecuciones: 6, juzgadas: 4, conAlgunNo: 3 });
    expect(res.criterios).toEqual([
      { id: "C9", no: 3, prs: 2 },
      { id: "C6", no: 1, prs: 1 },
    ]);
    expect(res.sinVeredicto.find((s) => s.motivo === "tope-de-turnos")).toEqual({ motivo: "tope-de-turnos", fallaElJuez: true, ejecuciones: 1, ids: [5] });
    expect(res.sinVeredicto.find((s) => s.motivo === "cancelada").fallaElJuez).toBe(false);
  });

  it("la tabla pone una fila por criterio y por motivo", () => {
    const t = tabla(contar(clasificadas), 14);
    expect(t).toContain("| C9 | 3 | 2 |");
    expect(t).toContain("| tope-de-turnos | 1 | sí |");
    expect(t).toContain("últimos 14 días: 6 ejecuciones, 4 con veredicto, 3 con algún «no»");
  });

  it("lista los ids de las sin-salida, para ver si cambió una señal copiada", () => {
    const t = tabla(contar([...clasificadas, { id: 7, rama: "d", pr: null, veredicto: false, noes: [], motivo: "sin-salida" }]), 14);
    expect(t).toContain("sin-salida, mira su log (¿cambió una señal de MOTIVOS_SIN_VEREDICTO?): 7");
    expect(tabla(contar(clasificadas), 14)).not.toContain("mira su log");
  });
});

describe("rondas-del-juez: la lista de ejecuciones", () => {
  it("se queda con las acabadas", () => {
    expect(acabadas([{ status: "completed" }, { status: "in_progress" }], 5)).toEqual([{ status: "completed" }]);
  });

  it("lee solo el job que juzga, y no uno saltado", () => {
    const pendiente = { id: 1, name: "revisor / pendiente", conclusion: "success" };
    const juzgar = { id: 2, name: "revisor / juzgar", conclusion: "cancelled" };
    expect(jobDelJuez([pendiente, juzgar])).toBe(juzgar);
    expect(jobDelJuez([pendiente, { ...juzgar, conclusion: "skipped" }])).toBeNull();
    expect(jobDelJuez([pendiente])).toBeNull();
  });

  it("para si la lista llega al tope de gh run list, en vez de contar corto", () => {
    expect(() => acabadas(Array.from({ length: 3 }, () => ({ status: "completed" })), 3)).toThrow(/el tope/);
    expect(LIMITE_EJECUCIONES).toBeGreaterThan(0);
  });
});
