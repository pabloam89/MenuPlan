import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerRegistro } from "../scripts/lib/normas.mjs";
import { TECHO_SIN_NORMA, leerPrincipiosCasa, problemasDeUniones } from "../scripts/lib/principios.mjs";

/**
 * Las uniones entre la lista de principios y el registro de normas (#619, fondo #618). Falla si:
 *  1. una norma no cita ningún principio, o cita uno que no está en la lista;
 *  2. un principio no lo cita ninguna norma y no está en principios_sin_norma con su motivo;
 *  3. un principio de principios_sin_norma ya tiene norma (la lista tiene que bajar);
 *  4. la lista de principios sin norma pasa del techo (TECHO_SIN_NORMA, que solo baja);
 *  5. una norma con ejecutor «nada» no tiene issue que lleve su control;
 *  6. una norma lleva una acción que no es de ops/estandares-agentes.json.
 * Al final, cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerPrincipiosCasa(RAIZ);
const normas = leerRegistro(RAIZ).normas;

describe("principios y normas", () => {
  it("cada norma cita un principio que existe, cada principio tiene norma o motivo, y nada sin ejecutor queda sin issue", () => {
    expect(problemasDeUniones(datos.principios, normas, datos.sin_norma)).toEqual([]);
  });

  it("el techo de principios sin norma es la cifra de hoy: si baja la lista, baja el techo", () => {
    expect(Object.keys(datos.sin_norma)).toHaveLength(TECHO_SIN_NORMA);
  });

  it("los principios propios de código, infra y proceso tienen todos su norma", () => {
    const sinNorma = datos.principios.filter((p) => ["codigo", "infra", "proceso"].includes(p.area) && p.id in datos.sin_norma);
    expect(sinNorma.map((p) => p.id)).toEqual([]);
  });
});

describe("se ven fallar", () => {
  const P = [{ id: "a-principle" }, { id: "b-principle" }];
  const N = (cambios = {}) => ({ id: "una-norma", principio: "a-principle", ejecutor: "ci", issue: null, acciones: ["construir"], ...cambios });
  const sin = { "b-principle": "Motivo de ejemplo con veinte caracteres o más" };
  const problemas = (normasX, sinX = sin, techo = 1) => problemasDeUniones(P, normasX, sinX, { techo }).join("\n");

  it("los datos de ejemplo pasan", () => expect(problemas([N()])).toBe(""));

  it("una norma sin principio", () => expect(problemas([N({ principio: undefined })])).toMatch(/no cita ningún principio/));
  it("una norma que cita un principio que no existe", () => expect(problemas([N({ principio: "inventado" })])).toMatch(/«inventado», que no está en la lista/));
  it("un principio sin norma ni motivo", () => expect(problemas([N()], {})).toMatch(/principio b-principle: ninguna norma lo cita/));
  it("un principio exceptuado que ya tiene norma", () => expect(problemas([N(), N({ id: "otra", principio: "b-principle" })])).toMatch(/b-principle: ya lo cita otra; quítalo/));
  it("una excepción sin motivo o de un principio que no existe", () => {
    expect(problemas([N()], { "b-principle": "corto" })).toMatch(/lleva su motivo/);
    expect(problemas([N()], { ...sin, inventado: "Motivo de ejemplo con veinte caracteres" }, 2)).toMatch(/«inventado» no es un principio/);
  });
  it("una acción que no es de los estándares", () => expect(problemas([N({ acciones: ["programar"] })])).toMatch(/la acción «programar» no está/));
  it("más principios sin norma que el techo", () => expect(problemas([N()], sin, 0)).toMatch(/1 principios sin norma y el techo es 0/));
  it("una norma sin ejecutor y sin issue; con issue, pasa", () => {
    expect(problemas([N({ ejecutor: "nada" })])).toMatch(/ejecutor nada\) y no tiene issue/);
    expect(problemas([N({ ejecutor: "nada", issue: 618 })])).toBe("");
  });

  it("sobre el registro de verdad: quitar el principio de una norma o vaciar el issue de una norma sin ejecutor falla", () => {
    const sinPrincipio = normas.map((n, i) => (i === 0 ? { ...n, principio: undefined } : n));
    expect(problemasDeUniones(datos.principios, sinPrincipio, datos.sin_norma).join("\n")).toMatch(new RegExp(`norma ${normas[0].id}: no cita`));
    const nada = normas.find((n) => n.ejecutor === "nada");
    const sinIssue = normas.map((n) => (n === nada ? { ...n, issue: null } : n));
    expect(problemasDeUniones(datos.principios, sinIssue, datos.sin_norma).join("\n")).toMatch(new RegExp(`norma ${nada.id}: nadie la hace cumplir`));
  });
});
