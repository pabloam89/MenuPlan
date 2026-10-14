import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerForja, vinculosDeCampos } from "../scripts/lib/forja.mjs";
import { leerGlosario } from "../scripts/lib/glosario.mjs";

/**
 * La conexión campo → glosario (#744, fondo #743; docs/ops/BASE-FORJA.md §9.1). Cada campo de cada ficha de
 * `ops/forja/campos_ficha/` declara con `termino` el término activo del glosario que lo define, y ese término
 * es de clase `campo`. Varios campos pueden compartir uno (nombre, nota, fecha). Es un test booleano: no hay lista
 * de excepciones ni techo, y un campo nuevo sin término rompe el CI.
 *
 * Los nombres de los campos NO se tocan aquí (#566: el nombre en inglés se cambia poco a poco y con encargo propio).
 * Abajo, un autotest: un campo inventado y un término retirado deben fallar. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORJA = leerForja(RAIZ);
const G = leerGlosario(RAIZ);
const copia = (x) => JSON.parse(JSON.stringify(x));

describe("la conexión de los campos de las fichas con el glosario", () => {
  it("todo campo declara un término activo del glosario de clase campo", () => {
    const r = vinculosDeCampos(FORJA, G.terminos);
    expect(r.problemas, "Añade `termino` al campo (o crea el término en ops/glosario/terminos/)").toEqual([]);
    expect(r.conVinculo).toBe(r.campos);
    expect(r.campos).toBeGreaterThan(0);
  });

  it("cada término usado es un fichero del glosario, no un nombre suelto", () => {
    const usados = new Set(Object.values(FORJA.campos_ficha).flatMap((d) => Object.values(d.campos).map((c) => c.termino)));
    for (const u of usados) expect(G.terminos.some((t) => t.termino === u && t.estado !== "retirado"), u).toBe(true);
  });
});

describe("autotest: la conexión falla con datos malos", () => {
  const un = (f) => {
    const d = copia(FORJA);
    f(d);
    return vinculosDeCampos(d, G.terminos);
  };

  it("un campo sin `termino` falla", () => {
    const r = un((d) => { d.campos_ficha.agente.campos.inventado = { clase: "bool", obligatorio: false }; });
    expect(r.problemas.join("\n")).toContain("agente.inventado: no declara su término");
    expect(r.conVinculo).toBe(r.campos - 1);
  });

  it("un término que no existe falla", () => {
    const r = un((d) => { d.campos_ficha.agente.campos.name.termino = "palabra-que-no-esta"; });
    expect(r.problemas.join("\n")).toContain("agente.name: su término «palabra-que-no-esta» no existe");
  });

  it("un término retirado falla, aunque su nombre siga en el glosario", () => {
    const nombre = FORJA.campos_ficha.agente.campos.name.termino;
    const terminos = copia(G.terminos).map((t) => (t.termino === nombre ? { ...t, estado: "retirado", pasa_a: "norma" } : t));
    const r = vinculosDeCampos(FORJA, terminos);
    expect(r.problemas.join("\n")).toContain(`su término «${nombre}» está retirado`);
  });

  it("un término de otra clase falla", () => {
    const r = un((d) => { d.campos_ficha.agente.campos.name.termino = "norma"; });
    expect(r.problemas.join("\n")).toContain("agente.name: su término «norma» es de clase artefacto");
  });
});
