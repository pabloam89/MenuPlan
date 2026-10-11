import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerRegistro } from "../scripts/lib/normas.mjs";
import { TECHO_SIN_NORMA, leerFondosConocidos, leerPrincipiosCasa, problemasDeUniones } from "../scripts/lib/principios.mjs";

/**
 * Las uniones entre la lista de principios y el registro de normas (#619, fondo #618). Falla si:
 *  1. una norma no cita ningún principio, o cita uno que no está en la lista;
 *  2. un principio (propio o de un catálogo delegado) no lo cita ninguna norma y no está en principios_sin_norma con su motivo;
 *  3. un principio de principios_sin_norma ya tiene norma (la lista tiene que bajar);
 *  4. la lista pasa de TECHO_SIN_NORMA (solo baja: el test la pide igual a la cifra de hoy; desde #620 los
 *     catálogos delegados no tienen techo aparte, todos sus principios tienen norma);
 *  5. una norma con ejecutor «nada» no tiene issue, o su issue es un problema de fondo (ops/fondos-conocidos.json);
 *  6. una norma lleva una acción que no es de ops/estandares-agentes.json, o fuera de su orden.
 * Al final, cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerPrincipiosCasa(RAIZ);
const normas = leerRegistro(RAIZ).normas;
const excepciones = { sinNorma: datos.sin_norma };
const fondos = leerFondosConocidos(RAIZ);

describe("principios y normas", () => {
  it("cada norma cita un principio que existe, cada principio tiene norma o motivo, y nada sin ejecutor queda sin issue", () => {
    expect(problemasDeUniones(datos.principios, normas, excepciones, { fondos })).toEqual([]);
  });

  it("el techo de principios sin norma es la cifra de hoy, y ningún delegado queda sin norma (#620)", () => {
    expect(Object.keys(datos.sin_norma)).toHaveLength(TECHO_SIN_NORMA);
    for (const d of Object.values(datos.delegados)) expect("sin_norma" in d).toBe(false);
    const citados = new Set(normas.map((n) => n.principio));
    expect(datos.principios.filter((p) => p.catalogo && !citados.has(p.id)).map((p) => p.id)).toEqual([]);
  });

  it("los principios propios de código, infra, datos y proceso tienen todos su norma", () => {
    const sinNorma = datos.principios.filter((p) => ["code", "infra", "data", "process"].includes(p.area) && p.id in datos.sin_norma);
    expect(sinNorma.map((p) => p.id)).toEqual([]);
  });
});

describe("se ven fallar", () => {
  const P = [{ id: "a-principle" }, { id: "b-principle" }, { id: "c-delegated", catalogo: "ops/x/", area: "product" }];
  const conC = (cambios = {}) => ({ id: "otra-c", principio: "c-delegated", ejecutor: "ci", issue: null, acciones: ["construir"], ...cambios });
  const N = (cambios = {}) => ({ id: "una-norma", principio: "a-principle", ejecutor: "ci", issue: null, acciones: ["construir"], ...cambios });
  const sin = { "b-principle": "Motivo de ejemplo con veinte caracteres o más" };
  const problemas = (normasX, sinX = sin, techo = 1) => problemasDeUniones(P, [...normasX, conC()], { sinNorma: sinX }, { techo, fondos: [185, 618] }).join("\n");

  it("los datos de ejemplo pasan", () => expect(problemas([N()])).toBe(""));

  it("una norma sin principio", () => expect(problemas([N({ principio: undefined })])).toMatch(/no cita ningún principio/));
  it("una norma que cita un principio que no existe", () => expect(problemas([N({ principio: "inventado" })])).toMatch(/«inventado», que no está en la lista/));
  it("un principio sin norma ni motivo", () => expect(problemas([N()], {})).toMatch(/principio b-principle: ninguna norma lo cita/));
  it("un principio exceptuado que ya tiene norma", () => expect(problemas([N(), N({ id: "otra", principio: "b-principle" })])).toMatch(/b-principle: ya lo cita otra; quítalo/));
  it("una excepción sin motivo o de un principio que no existe", () => {
    expect(problemas([N()], { "b-principle": "corto" })).toMatch(/lleva su motivo/);
    expect(problemas([N()], { ...sin, inventado: "Motivo de ejemplo con veinte caracteres" }, 2)).toMatch(/«inventado» no es un principio/);
  });
  it("una acción que no es de los estándares, o fuera de su orden", () => {
    expect(problemas([N({ acciones: ["programar"] })])).toMatch(/la acción «programar» no está/);
    expect(problemas([N({ acciones: ["juzgar", "construir"] })])).toMatch(/«acciones» va en el orden/);
  });
  it("más principios propios sin norma que el techo", () => expect(problemas([N()], sin, 0)).toMatch(/1 principios sin norma y el techo es 0/));
  it("un principio delegado sin norma falla como uno propio, salvo que esté en la lista con su motivo (#620)", () => {
    const sinC = problemasDeUniones(P, [N()], { sinNorma: sin }, { techo: 1 }).join("\n");
    expect(sinC).toMatch(/principio c-delegated: ninguna norma lo cita; .* \(es de ops\/x\/\)/);
    expect(problemasDeUniones(P, [N()], { sinNorma: { ...sin, "c-delegated": "Motivo de ejemplo con veinte caracteres" } }, { techo: 2 }).join("\n")).toBe("");
  });

  it("una norma sin ejecutor y sin issue, o colgada de cualquier fondo (no solo #618); con su encargo, pasa", () => {
    expect(problemas([N({ ejecutor: "nada" })])).toMatch(/ejecutor nada\) y no tiene issue/);
    expect(problemas([N({ ejecutor: "nada", issue: 618 })])).toMatch(/su issue es #618, un problema de fondo/);
    expect(problemas([N({ ejecutor: "nada", issue: 185 })])).toMatch(/su issue es #185, un problema de fondo/);
    expect(problemas([N({ ejecutor: "nada", issue: 624 })])).toBe("");
  });

  it("la lista de fondos conocidos trae los de la casa y solo números", () => {
    expect(fondos).toEqual(expect.arrayContaining([185, 618]));
    for (const f of fondos) expect(Number.isInteger(f), String(f)).toBe(true);
  });

  it("sobre el registro de verdad: quitar un principio, vaciar un issue o colgar una norma sin ejecutor del fondo falla", () => {
    const sinPrincipio = normas.map((n, i) => (i === 0 ? { ...n, principio: undefined } : n));
    expect(problemasDeUniones(datos.principios, sinPrincipio, excepciones, { fondos }).join("\n")).toMatch(new RegExp(`norma ${normas[0].id}: no cita`));
    const nada = normas.find((n) => n.ejecutor === "nada");
    const sinIssue = normas.map((n) => (n === nada ? { ...n, issue: null } : n));
    expect(problemasDeUniones(datos.principios, sinIssue, excepciones, { fondos }).join("\n")).toMatch(new RegExp(`norma ${nada.id}: nadie la hace cumplir`));
    const alFondo = normas.map((n) => (n === nada ? { ...n, issue: 263 } : n));
    expect(problemasDeUniones(datos.principios, alFondo, excepciones, { fondos }).join("\n")).toMatch(new RegExp(`norma ${nada.id}: .*#263`));
  });
});
