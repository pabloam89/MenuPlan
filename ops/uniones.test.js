import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AMBITOS, ambitosDeFichero } from "../scripts/lib/ambitos.mjs";
import {
  TECHO_NORMAS_SIN_JUEZ, TECHO_REGLAS_QUE_NO_SON_NORMA, accionesDeConsulta, juecesPorNorma, leerEstandares, normasDeTarea, problemasDeUnionesEstandar, tareasDe,
} from "../scripts/lib/estandaresAgentes.mjs";
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
 * Y entre los estándares y las normas (#620):
 *  7. un estándar cita una norma que no existe, o una regla suya reescribe una norma (se le parece desde
 *     UMBRAL_REESCRITURA, o se llama igual) sin estar en reglas_que_no_son_norma con su motivo;
 *  8. una norma vigilada por juicio no la cita ningún estándar de juez, ni está en normas_sin_juez;
 *  9. el constructor y el juez de un mismo ámbito no reciben las mismas normas de ese ámbito;
 * 10. un fichero del repo no cae en ningún ámbito (el mapa fichero → ámbito de ambitos.mjs).
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

describe("los estándares citan normas y no las reescriben (#620)", () => {
  const estandares = leerEstandares(RAIZ);
  const clon = () => structuredClone(estandares);

  it("ninguna norma citada falta, ninguna regla reescribe una norma y toda norma a juicio tiene juez o motivo", () => {
    expect(problemasDeUnionesEstandar(estandares, normas)).toEqual([]);
  });

  it("los techos de las dos listas de excepciones son la cifra de hoy: si baja la lista, baja el techo", () => {
    expect(Object.keys(estandares.reglas_que_no_son_norma ?? {})).toHaveLength(TECHO_REGLAS_QUE_NO_SON_NORMA);
    expect(Object.keys(estandares.normas_sin_juez ?? {})).toHaveLength(TECHO_NORMAS_SIN_JUEZ);
  });

  it("el constructor y el juez de un mismo ámbito reciben las mismas normas de ese ámbito", () => {
    const tareas = tareasDe(estandares);
    const deAmbito = (tarea, a) => normasDeTarea(tarea, estandares, normas).filter((x) => x.norma?.ambito === a && x.norma.acciones.some((y) => ["construir", "juzgar"].includes(y))).map((x) => x.norma.id).sort();
    let pares = 0;
    for (const a of Object.keys(AMBITOS)) {
      const constructores = tareas.filter((x) => x.tarea.accion === "construir" && x.tarea.ambitos.includes(a));
      const jueces = tareas.filter((x) => x.tarea.accion === "juzgar" && x.tarea.ambitos.includes(a));
      for (const c of constructores) for (const j of jueces) {
        expect(deAmbito(j.tarea, a), `${a}: ${c.agente}/${c.tarea.id} frente a ${j.agente}/${j.tarea.id}`).toEqual(deAmbito(c.tarea, a));
        pares += 1;
      }
    }
    // Las parejas que pide el encargo: el código (las C) y la infraestructura (las I) tienen constructor y juez.
    for (const a of ["code", "infra"]) {
      expect(tareas.some((x) => x.tarea.accion === "construir" && x.tarea.ambitos.includes(a)), `${a}: constructor`).toBe(true);
      expect(tareas.some((x) => x.tarea.accion === "juzgar" && x.tarea.ambitos.includes(a)), `${a}: juez`).toBe(true);
    }
    expect(pares).toBeGreaterThan(20);
    expect(accionesDeConsulta("construir")).toEqual(accionesDeConsulta("juzgar"));
  });

  it("cada fichero del repo cae en algún ámbito", () => {
    const ficheros = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" }).split("\0").filter(Boolean);
    expect(ficheros.length).toBeGreaterThan(1000);
    expect(ficheros.filter((f) => !ambitosDeFichero(f).length)).toEqual([]);
    expect(ambitosDeFichero("api/_guard.js")).toEqual(["code", "api"]);
    expect(ambitosDeFichero(".claude/hooks/guardia.mjs")).toEqual(["code", "infra"]);
    expect(ambitosDeFichero("supabase/migrations/0100_x.sql")).toEqual(["data"]);
    expect(ambitosDeFichero("ops/redaccion.json")).toEqual(["process", "writing"]);
  });

  describe("se ven fallar", () => {
    const con = (cambia, opciones) => { const d = clon(); cambia(d); return problemasDeUnionesEstandar(d, normas, opciones).join("\n"); };
    const visto = normas.find((n) => n.id === "test-visto-fallar");
    const copia = { ...estandares.agentes.gobierno.tareas[0].reglas[0], nombre: "Prueba antes de fiarse", condicion: visto.condicion, exigencia: visto.exigencia };

    it("una tarea o una común que cita una norma que no existe", () => {
      expect(con((d) => { d.agentes.datos.tareas[0].normas = ["norma-inventada"]; })).toMatch(/datos\/modelar-antes-de-sql: cita la norma «norma-inventada», que no existe/);
      expect(con((d) => { d.comunes["tests-de-lo-tocado"].normas.push("otra-inventada"); })).toMatch(/común tests-de-lo-tocado: cita la norma «otra-inventada»/);
    });
    it("una regla que copia una norma, o que se llama igual que una", () => {
      expect(con((d) => { d.agentes.gobierno.tareas[0].reglas.push(copia); })).toMatch(/gobierno\/flujo-rama-pr-staging · Prueba antes de fiarse: reescribe la norma «test-visto-fallar» \(parecido 1\.00\)/);
      expect(con((d) => { d.comunes["informe-comun"].reglas[0].nombre = "Test visto fallar"; })).toMatch(/común informe-comun · Test visto fallar: reescribe la norma «test-visto-fallar»/);
    });
    it("una excepción con su motivo deja pasar la regla; una que ya no hace falta, o sin motivo, falla", () => {
      const clave = "gobierno/flujo-rama-pr-staging · Prueba antes de fiarse";
      const techos = { reglas: 7, juicio: TECHO_NORMAS_SIN_JUEZ };
      expect(con((d) => { d.agentes.gobierno.tareas[0].reglas.push(copia); d.reglas_que_no_son_norma[clave] = "test-visto-fallar: motivo de ejemplo con más de quince caracteres"; }, { techos })).toBe("");
      expect(con((d) => { d.reglas_que_no_son_norma[clave] = "test-visto-fallar: motivo de ejemplo con más de quince caracteres"; }, { techos })).toMatch(/no es una regla del catálogo/);
      const vieja = Object.keys(estandares.reglas_que_no_son_norma)[0];
      expect(con((d) => { d.reglas_que_no_son_norma[vieja] = "corto"; })).toMatch(/el valor es «<norma>: motivo»/);
      expect(con(() => {}, { umbral: 0.99 })).toMatch(/ya no se parece a ninguna norma; quítala/);
    });
    it("una norma vigilada por juicio que ningún juez cita", () => {
      expect(juecesPorNorma(estandares, normas)["migrated-screen-pixel-identical"]).toContain("qa/comprobar-design-system");
      expect(con((d) => { for (const t of d.agentes.qa.tareas) t.ambitos = t.ambitos.filter((a) => a !== "ui"); })).toMatch(/norma migrated-screen-pixel-identical: la vigila un juicio y ningún estándar de juez la cita/);
      expect(con((d) => { d.agentes.seguridad.tareas.find((t) => t.id === "auditar-secretos").normas = []; })).toMatch(/norma secretos-ok-pablo: la vigila un juicio y ningún estándar de juez la cita/);
    });
    it("una norma en normas_sin_juez que ya tiene juez, que no existe o que no es de juicio; y el techo", () => {
      expect(con((d) => { d.normas_sin_juez["test-visto-fallar"] = "Motivo de ejemplo con veinte caracteres"; }, { techos: { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA, juicio: 7 } })).toMatch(/normas_sin_juez «test-visto-fallar»: ya la cita/);
      expect(con((d) => { d.normas_sin_juez["inventada"] = "Motivo de ejemplo con veinte caracteres"; }, { techos: { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA, juicio: 7 } })).toMatch(/«inventada»: no es una norma/);
      expect(con((d) => { d.normas_sin_juez["tope-diario-ia"] = "Motivo de ejemplo con veinte caracteres"; }, { techos: { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA, juicio: 7 } })).toMatch(/«tope-diario-ia»: no la vigila un juicio/);
      expect(con((d) => { d.normas_sin_juez["inventada"] = "Motivo de ejemplo con veinte caracteres"; })).toMatch(/normas_sin_juez: 7 y el techo es 6; la lista solo baja/);
    });
    it("el constructor y el juez de un ámbito dejan de recibir lo mismo si la consulta no los empareja", () => {
      const d = clon();
      const c = d.agentes.gobierno.tareas.find((t) => t.id === "workflows-y-crons");
      const j = d.agentes.revisor.tareas.find((t) => t.id === "revisar-diff");
      const soloSuya = (t) => normas.filter((n) => t.ambitos.includes(n.ambito) && n.acciones.includes(t.accion)).map((n) => n.id).filter((id) => normas.find((n) => n.id === id).ambito === "infra").sort();
      expect(soloSuya(c)).not.toEqual(soloSuya(j));
    });
  });
});
