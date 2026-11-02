// El método de choques (trozo 33 de #1037): clases, orden y respuestas, contra su única fuente
// (specs/arquitectura-objetivo.md, «Choques»), caso a caso, y el motor relajando con ese orden.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { claseDe, rangoDeClase, ordenar, responder, CLASE_DE_ORIGEN } from "./choques.js";
import { ESCALONES_RELAJAR, RELAJABLES, PREFERENCIA_DEL_SISTEMA } from "./preferenciasSistema.js";
import { pesoDe, FACTOR_ORIGEN } from "./cumplimiento.js";
import { FORMA_DE_PROYECCION, FUERZA_BLANDA } from "./preferencias.js";
import { CLASES_CHOQUE, CRITERIOS_CHOQUE, RESPUESTAS_CHOQUE, RESPUESTA_CHOQUE as R, CRITERIO_CHOQUE as CR, ORIGEN_DATO, FUERZAS_PREFERENCIA } from "./vocabularios.js";

const spec = readFileSync(new URL("../../specs/arquitectura-objetivo.md", import.meta.url), "utf8");
const seccion = spec.slice(spec.indexOf("## Choques"), spec.indexOf("### 4. Cuándo se detecta"));
const tabla = (desde, hasta) => [...seccion.slice(seccion.indexOf(desde), seccion.indexOf(hasta)).matchAll(/^\| \*\*([^*]+)\*\* \|/gm)].map((m) => sinTildes(m[1]));
const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

describe("clasificar", () => {
  it("las seis clases son las de la arquitectura, de la que más manda a la que menos", () => {
    expect(tabla("### 1.", "### 2.")).toEqual(CLASES_CHOQUE);
  });

  it("cada origen tiene su clase; la salud es seguridad venga de donde venga", () => {
    for (const origen of ORIGEN_DATO) {
      expect(CLASES_CHOQUE).toContain(claseDe({ origen }));
      expect(claseDe({ origen, seguridad: true })).toBe("seguridad");
    }
    expect(Object.keys(CLASE_DE_ORIGEN).sort()).toEqual([...ORIGEN_DATO].sort());
    expect(claseDe({ origen: "dicho" })).toBe("deseo");
    expect(claseDe({ origen: "visto" })).toBe("aprendido");
    expect(claseDe({ origen: "por_defecto" })).toBe("supuesto");
    expect(claseDe({ origen: "derivado" })).toBe("sistema");
  });

  it("un origen o una clase que no existen lanzan: sin clase no hay orden", () => {
    expect(() => claseDe({ origen: "inventado" })).toThrow(/sin clase/);
    expect(() => rangoDeClase({ clase: "otra" })).toThrow(/fuera de CLASES_CHOQUE/);
  });
});

describe("ordenar: gana el primer criterio que distingue", () => {
  const deseo = { clase: "deseo", fuerza: "medio", papel: "owner", sujeto: "casa", cuando: "siempre", vigente: true, at: "2026-11-01T10:00:00Z" };
  const casos = [
    [CR.RIESGO, { ...deseo, clase: "seguridad" }, { ...deseo, clase: "hecho", fuerza: "obligatoria" }],
    [CR.CLASE, { ...deseo, clase: "hecho" }, { ...deseo, fuerza: "obligatoria" }],
    [CR.FUERZA, { ...deseo, fuerza: "alto" }, { ...deseo, fuerza: "bajo", habla_de_si: true }],
    [CR.AUTORIDAD, { ...deseo, papel: "editor", habla_de_si: true }, { ...deseo, sujeto: "persona" }],
    [CR.ALCANCE, { ...deseo, sujeto: "persona" }, { ...deseo, cuando: "dia", at: "2026-11-02T10:00:00Z" }],
    [CR.TIEMPO, { ...deseo, at: "2026-11-02T10:00:00Z" }, deseo],
    [CR.PESO_APRENDIDO, { ...deseo, clase: "aprendido", peso: 5 }, { ...deseo, clase: "aprendido", peso: 2 }],
  ];

  it("los siete criterios, en el orden de la arquitectura; cada uno decide si los anteriores empatan, aunque los siguientes digan lo contrario", () => {
    expect([...seccion.matchAll(/^\d\. \*\*([^:*]+):\*\*/gm)].map((m) => sinTildes(m[1]).replace(/ /g, "_"))).toEqual(CRITERIOS_CHOQUE);
    expect(casos.map(([c]) => c)).toEqual(CRITERIOS_CHOQUE);
    for (const [criterio, gana, pierde] of casos) {
      expect(ordenar(gana, pierde), criterio).toEqual({ gana: "a", criterio });
      expect(ordenar(pierde, gana), criterio).toEqual({ gana: "b", criterio });
    }
  });

  it("dos adultos con lo mismo empatan; lo más reciente gana entre lo de una misma persona, no entre dos; lo vigente, a lo caducado", () => {
    expect(ordenar({ ...deseo, papel: "owner" }, { ...deseo, papel: "editor" })).toEqual({ gana: null, criterio: null });
    const nuevo = { ...deseo, at: "2026-11-02T10:00:00Z" };
    expect(ordenar({ ...nuevo, autor: "u1" }, { ...deseo, autor: "u1" })).toEqual({ gana: "a", criterio: CR.TIEMPO });
    expect(ordenar({ ...nuevo, autor: "u1" }, { ...deseo, autor: "u2" })).toEqual({ gana: null, criterio: null });
    expect(ordenar({ ...deseo, at: "2026-01-01T00:00:00Z" }, { ...deseo, vigente: false })).toMatchObject({ gana: "a", criterio: CR.TIEMPO });
  });
});

describe("responder", () => {
  const deseo = { clase: "deseo", fuerza: "medio" };
  const r = (a, b, como) => responder({ a, b }, ordenar(a, b), como);

  it("las cuatro respuestas son las de la arquitectura", () => {
    expect(tabla("### 3.", "### 4.").map((x) => x.replace(/ /g, "_").replace("_en_una_linea", ""))).toEqual(RESPUESTAS_CHOQUE);
  });

  it("«He puesto 3 pescados, no 4, por el presupuesto»: gana uno claro y se pierde una preferencia, aplicar y avisar", () => {
    expect(r({ clase: "hecho" }, deseo)).toBe(R.APLICAR_Y_AVISAR);
    expect(r({ ...deseo, at: "2026-11-02T10:00:00Z" }, { ...deseo, at: "2026-10-02T10:00:00Z" })).toBe(R.APLICAR_Y_AVISAR);
  });

  it("lo concreto sobre lo general, o lo vigente sobre lo caducado: en silencio", () => {
    expect(r({ ...deseo, sujeto: "persona" }, { ...deseo, sujeto: "casa" })).toBe(R.APLICAR_EN_SILENCIO);
    expect(r({ ...deseo, vigente: true }, { ...deseo, vigente: false })).toBe(R.APLICAR_EN_SILENCIO);
  });

  it("toca la salud o una obligatoria, o el orden no decide: preguntar; si es de la casa, tarea de decisión", () => {
    expect(r({ clase: "seguridad" }, deseo)).toBe(R.PREGUNTAR);
    expect(r({ ...deseo, fuerza: "obligatoria" }, deseo)).toBe(R.PREGUNTAR);
    expect(r({ ...deseo, papel: "owner" }, { ...deseo, papel: "editor" })).toBe(R.PREGUNTAR);
    expect(r({ ...deseo, papel: "owner" }, { ...deseo, papel: "editor" }, { de_la_casa: true })).toBe(R.TAREA_DE_DECISION);
  });
});

describe("ordenar por clase", () => {
  it("hecho > deseo > aprendido > supuesto > sistema, y la seguridad por encima de todo", () => {
    const rangos = CLASES_CHOQUE.map((clase) => rangoDeClase({ clase }));
    expect(rangos).toEqual([...rangos].sort((a, b) => b - a));
    expect(new Set(rangos).size).toBe(CLASES_CHOQUE.length);
  });

  it("el sistema cede ante un deseo dicho, salvo una regla de calidad mínima (obligatoria), que no cede ante el deseo pero sí ante un hecho", () => {
    const regla = (fuerza) => rangoDeClase({ clase: "sistema", fuerza });
    expect(rangoDeClase({ clase: "deseo" })).toBeGreaterThan(regla("alto"));
    expect(regla("obligatoria")).toBeGreaterThan(rangoDeClase({ clase: "deseo" }));
    expect(regla("obligatoria")).toBeLessThan(rangoDeClase({ clase: "hecho" }));
  });
});

describe("el motor usa el mismo orden (al generar)", () => {
  it("relaja por escalones de la clase que menos manda a la que más, y cada regla relajable está en uno", () => {
    const rangos = ESCALONES_RELAJAR.map((e) => rangoDeClase({ clase: e.clase }));
    expect(rangos).toEqual([...rangos].sort((a, b) => a - b));
    expect(ESCALONES_RELAJAR.flatMap((e) => e.reglas).sort()).toEqual([...RELAJABLES].sort());
    expect(ESCALONES_RELAJAR.map((e) => e.clase)).toEqual(["sistema", "supuesto", "deseo"]);
    for (const e of ESCALONES_RELAJAR) for (const id of e.reglas) expect(PREFERENCIA_DEL_SISTEMA[id].clase).toBe(e.clase);
  });

  it("el peso de una preferencia en el solver ordena como el método (clase y luego fuerza), en las que puede haber: lo no dicho siempre es blando", () => {
    // Las fuerzas que da preferenciasDelMotor: lo dicho, la de su forma; lo visto y lo supuesto, FUERZA_BLANDA.
    const dichas = [...new Set(Object.values(FORMA_DE_PROYECCION).map((f) => f.fuerza))].map((fuerza) => ({ origen: "dicho", fuerza }));
    const prefs = [...dichas, ...Object.keys(FACTOR_ORIGEN).filter((o) => o !== "dicho").map((origen) => ({ origen, fuerza: FUERZA_BLANDA }))];
    // Gana la primera que distingue: la clase y, a igual clase, la fuerza (obligatoria > alto > medio > bajo).
    const metodo = (p) => [rangoDeClase({ clase: claseDe(p) }), -FUERZAS_PREFERENCIA.indexOf(p.fuerza)];
    let pares = 0;
    for (const a of prefs) for (const b of prefs) {
      if (a === b) continue;
      const [ca, fa] = metodo(a);
      const [cb, fb] = metodo(b);
      const gana = ca !== cb ? (ca > cb ? "a" : "b") : fa !== fb ? (fa > fb ? "a" : "b") : null;
      const porPeso = pesoDe(a) === pesoDe(b) ? null : pesoDe(a) > pesoDe(b) ? "a" : "b";
      expect(porPeso, `${a.origen}/${a.fuerza} frente a ${b.origen}/${b.fuerza}`).toBe(gana);
      pares += 1;
    }
    expect(pares).toBeGreaterThan(6);
  });
});
