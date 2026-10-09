// Evals de Lola (encargo #268): las etiquetas de los casos en vocabulario
// cerrado, el tope de gasto, pass^k por niveles y la memoria por hashes.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CAMPOS_FILA, DOMINIOS_CASO, K_ALERGIAS, K_POR_NIVEL, MOTIVOS_FALLO, NIVELES, NUCLEO, ORIGENES_CASO,
  PRESUPUESTO_MENSUAL_EUR, TIPOS_CASO, TIPOS_DE_SEGURIDAD, bloquea, cabeOtro, casoHash, casosDelNivel,
  casosVersion, canonico, claveMemo, costeUsd, erroresDeCasos, esDeSeguridad, estadoDe, estimadoSiguiente,
  kDe, memoria, opcionNumero, otroIntento, presupuestoMensualUsd, topeDePasada,
} from "./evals.mjs";

const RAIZ = new URL("../../", import.meta.url);
const { casos } = JSON.parse(readFileSync(new URL("scripts/bot-evals.json", RAIZ), "utf8"));

describe("bot-evals.json: cada caso con id, tipo, dominio y origen de la lista", () => {
  it("ningún error de etiquetas", () => expect(erroresDeCasos(casos)).toEqual([]));

  it("el núcleo N1 son 12 de seguridad y 12 del resto", () => {
    const n1 = casosDelNivel(casos, "pr");
    expect(n1.filter(esDeSeguridad).length).toBe(NUCLEO.seguridad);
    expect(n1.filter((c) => !esDeSeguridad(c)).length).toBe(NUCLEO.resto);
  });

  it("los de seguridad están marcados (más que el núcleo, y en alergias y salud los más)", () => {
    const seg = casosDelNivel(casos, "seguridad");
    expect(seg.length).toBeGreaterThan(NUCLEO.seguridad);
    const deAlergias = seg.filter((c) => c.dominio === "alergias_salud").length;
    expect(deAlergias).toBeGreaterThan(seg.length / 3);
  });

  it("cada tipo de seguridad es de la lista de tipos", () => {
    for (const t of TIPOS_DE_SEGURIDAD) expect(TIPOS_CASO).toContain(t);
  });
});

describe("erroresDeCasos: una cosa mal, un error", () => {
  const bueno = { id: "uno", tipo: "texto", dominio: "faq", origen: "escrito", nombre: "x", entrada: "x" };
  const errores = (cambio, otros = []) => erroresDeCasos([...otros, { ...bueno, ...cambio }]);

  it("el bueno pasa", () => expect(errores({})).toEqual([]));
  it("id repetido", () => expect(errores({}, [{ ...bueno }])).toEqual([expect.stringMatching(/id repetido/)]));
  it("id que no es slug", () => expect(errores({ id: "Con Espacios" })).toEqual([expect.stringMatching(/no es un slug/)]));
  it("sin id", () => expect(errores({ id: undefined })).toEqual([expect.stringMatching(/no es un slug/)]));
  it("tipo fuera de lista", () => expect(errores({ tipo: "otro" })).toEqual([expect.stringMatching(/tipo .* fuera de lista/)]));
  it("dominio fuera de lista", () => expect(errores({ dominio: "otro" })).toEqual([expect.stringMatching(/dominio .* fuera de lista/)]));
  it("origen fuera de lista", () => expect(errores({ origen: "otro" })).toEqual([expect.stringMatching(/origen .* fuera de lista/)]));
  it("nucleo que no es true", () => expect(errores({ nucleo: "si" })).toEqual([expect.stringMatching(/nucleo/)]));
});

describe("vocabularios", () => {
  it("sin valores repetidos", () => {
    for (const l of [TIPOS_CASO, DOMINIOS_CASO, ORIGENES_CASO, NIVELES, MOTIVOS_FALLO, CAMPOS_FILA]) expect(new Set(l).size).toBe(l.length);
  });
});

describe("precios: la caché de Lola se escribe a 1 h", () => {
  const millon = (k) => ({ [k]: 1e6 });
  it("escribir a 1 h cuesta el doble que la entrada; a 5 min, 1,25×", () => {
    for (const m of ["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-5-5"]) {
      const entrada = costeUsd(millon("input_tokens"), m);
      expect(costeUsd(millon("cache_creation_input_tokens"), m)).toBeCloseTo(2 * entrada);
      expect(costeUsd(millon("cache_creation_input_tokens"), m, { ttl: "5m" })).toBeCloseTo(1.25 * entrada);
      expect(costeUsd(millon("cache_read_input_tokens"), m)).toBeCloseTo(entrada / 10);
    }
  });
  it("haiku < sonnet < opus", () => {
    const u = { input_tokens: 1000, output_tokens: 1000 };
    expect(costeUsd(u, "claude-haiku-4-5")).toBeLessThan(costeUsd(u, "claude-sonnet-5"));
    expect(costeUsd(u, "claude-sonnet-5")).toBeLessThan(costeUsd(u, "claude-opus-5-5"));
  });
});

describe("tope de gasto", () => {
  it("el de una pasada nunca pasa de lo que queda del mes", () => {
    expect(topeDePasada(1e6)).toBeLessThanOrEqual(presupuestoMensualUsd());
    expect(topeDePasada(10, presupuestoMensualUsd() - 2)).toBeCloseTo(2);
    expect(topeDePasada(10, presupuestoMensualUsd() + 5)).toBe(0);
    expect(topeDePasada(0)).toBe(0);
  });
  it("con tope 0 no cabe ni un intento; el primero se estima con la caché por escribir", () => {
    expect(cabeOtro(0, 0, estimadoSiguiente(0, 0))).toBe(false);
    expect(estimadoSiguiente(0, 0)).toBeGreaterThan(estimadoSiguiente(0.5, 20));
  });
  it("un --tope mal escrito es un error, no «sin tope»", () => {
    expect(() => opcionNumero(["--tope=abc"], "tope")).toThrow();
    expect(() => opcionNumero(["--tope="], "tope")).toThrow();
    expect(() => opcionNumero(["--tope=-1"], "tope")).toThrow();
    expect(opcionNumero(["--tope=0,5"], "tope")).toBe(0.5);
    expect(opcionNumero([], "tope")).toBe(null);
  });
  it("el presupuesto mensual vive en un solo sitio: los scripts lo importan, nadie lo repite", () => {
    expect(PRESUPUESTO_MENSUAL_EUR).toBeGreaterThan(0);
    const ficheros = [];
    const recorrer = (d) => {
      for (const f of readdirSync(d)) {
        const r = join(d, f);
        if (statSync(r).isDirectory()) { if (f !== "node_modules") recorrer(r); } else if (/\.m?js$/.test(f)) ficheros.push(r);
      }
    };
    recorrer(fileURLToPath(new URL("scripts", RAIZ)));
    const quienLaDefine = ficheros.filter((f) => /PRESUPUESTO_MENSUAL_EUR\s*=/.test(readFileSync(f, "utf8")));
    expect(quienLaDefine.map((f) => f.replace(/\\/g, "/").replace(/.*\/scripts\//, "scripts/"))).toEqual(["scripts/lib/evals.mjs"]);
    for (const s of ["scripts/bot-evals.mjs", "scripts/router-evals.mjs"]) expect(readFileSync(new URL(s, RAIZ), "utf8")).toMatch(/topeDePasada\(/);
  });
});

describe("niveles y pass^k", () => {
  const alergia = { id: "a", tipo: "seguridad", dominio: "alergias_salud" };
  const papel = { id: "p", tipo: "seguridad", dominio: "papeles" };
  const menu = { id: "m", tipo: "herramienta", dominio: "menu", nucleo: true };

  it("qué casos entra en cada nivel", () => {
    expect(casosDelNivel([alergia, papel, menu], "pr")).toEqual([menu]);
    expect(casosDelNivel([alergia, papel, menu], "seguridad")).toEqual([alergia, papel]);
    expect(casosDelNivel([alergia, papel, menu], "completo")).toHaveLength(3);
    expect(() => casosDelNivel([], "otro")).toThrow();
  });
  it("en seguridad, alergias y salud van con más repeticiones; --k manda", () => {
    expect(kDe(alergia, "seguridad")).toBe(K_ALERGIAS);
    expect(kDe(alergia, "seguridad")).toBeGreaterThan(kDe(papel, "seguridad"));
    expect(kDe(alergia, "pr")).toBe(K_POR_NIVEL.pr);
    expect(kDe(menu, "completo", 4)).toBe(4);
  });
  it("estado: aprobado, inestable, fallido, incompleto, sin correr", () => {
    expect(estadoDe([true, true, true], 3)).toBe("aprobado");
    expect(estadoDe([true, false, true], 3)).toBe("inestable");
    expect(estadoDe([false, false], 1)).toBe("fallido");
    expect(estadoDe([true], 3)).toBe("incompleto");
    expect(estadoDe([], 1)).toBe("sin_correr");
  });
  it("un fallo reintentado que luego pasa queda inestable", () => {
    const r = [false];
    expect(otroIntento(r, { k: 1, reintentos: 1 })).toBe(true);
    r.push(true);
    expect(otroIntento(r, { k: 1, reintentos: 1 })).toBe(false);
    expect(estadoDe(r, 1)).toBe("inestable");
    expect(otroIntento([false, false], { k: 1, reintentos: 1 })).toBe(false);
  });
  it("estricto: el primer fallo para (ya bloquea) y bloquea aunque sea inestable", () => {
    expect(otroIntento([true, true, false], { k: 5, estricto: true })).toBe(false);
    expect(otroIntento([true, true], { k: 5, estricto: true })).toBe(true);
    expect(otroIntento([false], { k: 1, reintentos: 1, estricto: true })).toBe(false);
    expect(bloquea("inestable", true)).toBe(true);
    expect(bloquea("inestable", false)).toBe(false);
    expect(bloquea("fallido", false)).toBe(true);
  });
  it("con lo guardado ya completo no hace falta otro intento", () => {
    expect(otroIntento([true], { k: 1, reintentos: 1 })).toBe(false);
    expect(otroIntento([true], { k: 3 })).toBe(true);
  });
});

describe("hashes y memoria", () => {
  const caso = { id: "x", nombre: "uno", tipo: "texto", dominio: "faq", origen: "escrito", entrada: "hola", texto: "a" };
  it("canonico no depende del orden de las claves", () => expect(canonico({ a: 1, b: [2, { d: 1, c: 2 }] })).toBe(canonico({ b: [2, { c: 2, d: 1 }], a: 1 })));
  it("caso_hash: cambia con lo que se mide, no con la etiqueta", () => {
    expect(casoHash({ ...caso, nombre: "otro", tipo: "formato", nucleo: true })).toBe(casoHash(caso));
    expect(casoHash({ ...caso, entrada: "adiós" })).not.toBe(casoHash(caso));
    expect(casoHash({ ...caso, texto: "b" })).not.toBe(casoHash(caso));
  });
  it("casos_version cambia si cambia un caso, no si cambia el orden", () => {
    const otro = { ...caso, id: "y", entrada: "otra" };
    expect(casosVersion([caso, otro])).toBe(casosVersion([otro, caso]));
    expect(casosVersion([caso, { ...otro, entrada: "más" }])).not.toBe(casosVersion([caso, otro]));
  });
  it("la memoria agrupa por caso, prompt, código, modelo y esfuerzo", () => {
    const base = { caso_hash: "c", prompt_hash: "p", codigo_hash: "k", modelo: "m", esfuerzo: "e" };
    const m = memoria([{ ...base, aprobado: false }, { ...base, aprobado: true }, { ...base, prompt_hash: "p2", aprobado: true }, { ...base }]);
    expect(m.get(claveMemo(base))).toEqual([false, true]);
    expect(m.get(claveMemo({ ...base, prompt_hash: "p2" }))).toEqual([true]);
  });
});
