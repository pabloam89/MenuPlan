import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REFERENCIA, jsonEnReferenciaAvisando } from "../scripts/lib/forjaReferencia.mjs";
import { LIMITES_REGLA } from "../scripts/lib/regla.mjs";
import {
  ESTADOS_CATALOGO, MAX_PRINCIPIOS, MIN_PRINCIPIOS, RUTA_MD, anclarPendientes, generarMd, leerJsonEn, leerPendientes, leerRedaccion,
  pendientesDe, problemasContraReferencia, problemasDeRedaccion, problemasDeTrinquete, reglasDe, sujetosDe, tieneReglas,
} from "../scripts/lib/redaccion.mjs";

/**
 * La guía única de redacción de reglas (#493, fondo #488). Falla cuando:
 *  1. un principio no pasa `problemasDeRegla`, o le falta un ejemplo, su fuente o su control;
 *  2. docs/ops/REDACCION.md no sale del JSON;
 *  3. un catálogo que `cumple` tiene una entrada que no pasa `problemasDeRegla`;
 *  4. un catálogo `pendiente` no lleva su encargo;
 *  5. la lista de pendientes sube (trinquete).
 * Al final, cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const leerJson = leerJsonEn(RAIZ);
const datos = leerRedaccion(RAIZ);
const clon = () => structuredClone(datos);
const problemas = (d) => problemasDeRedaccion(d, { existe, leerJson });

describe("ops/redaccion.json", () => {
  it("no tiene ningún problema", () => expect(problemas(datos)).toEqual([]));
  it(`tiene de ${MIN_PRINCIPIOS} a ${MAX_PRINCIPIOS} principios`, () => {
    expect(datos.principios.length).toBeGreaterThanOrEqual(MIN_PRINCIPIOS);
    expect(datos.principios.length).toBeLessThanOrEqual(MAX_PRINCIPIOS);
  });
  it("los topes que cita un principio son los de regla.mjs", () => {
    const de = (id) => datos.principios.find((p) => p.id === id).exigencia;
    expect(de("exigencia-corta-y-unica")).toContain(String(LIMITES_REGLA.exigencia.max));
    expect(de("nota-solo-para-el-matiz")).toContain(String(LIMITES_REGLA.nota.max));
    expect(de("nombre-corto-y-nominal")).toContain(`de ${LIMITES_REGLA.nombre.palabras_min} a ${LIMITES_REGLA.nombre.palabras_max} palabras`);
  });
});

describe("docs/ops/REDACCION.md sale del JSON", () => {
  it("está al día", () => {
    const md = readFileSync(join(RAIZ, RUTA_MD), "utf8");
    expect(md, "REDACCION.md se genera: edita ops/redaccion.json y lanza `npm run redaccion -- --escribir`").toBe(generarMd(datos, leerJson));
  });
});

describe("trinquete: la lista de pendientes solo baja", () => {
  it("lo anclado coincide con lo pendiente", () => expect(problemasDeTrinquete(datos, leerPendientes(RAIZ))).toEqual([]));
  it("un catálogo que pasa a pendiente sin estar anclado falla", () => {
    const d = clon();
    d.catalogos[0] = { fichero: d.catalogos[0].fichero, estado: "pendiente", encargo: "#494" };
    expect(problemasDeTrinquete(d, leerPendientes(RAIZ)).join("\n")).toContain("solo baja");
  });
  it("un catálogo puesto al día obliga a bajarlo del ancla", () => {
    const d = clon();
    const k = d.catalogos.find((x) => x.estado === "pendiente");
    expect(problemasDeTrinquete({ ...d, catalogos: d.catalogos.filter((x) => x !== k) }, leerPendientes(RAIZ)).join("\n")).toContain("ya no está pendiente");
  });
  it("anclar baja pero no sube", () => {
    const d = clon();
    d.catalogos.push({ fichero: "ops/pendiente-de-prueba.json", estado: "pendiente", encargo: "#1" });
    expect(anclarPendientes(d, ["ops/pendiente-de-prueba.json"])).toEqual(["ops/pendiente-de-prueba.json"]);
    expect(anclarPendientes(d, [])).toEqual([]);
    expect(anclarPendientes(d, [], { sembrar: true })).toEqual(pendientesDe(d));
  });
});

describe("todo catálogo de reglas figura en la guía", () => {
  it("cada ops/*.json con entradas de sujeto, fuerza y exigencia está en «catalogos»", () => {
    const declarados = datos.catalogos.map((k) => k.fichero);
    const conReglas = readdirSync(join(RAIZ, "ops")).filter((f) => f.endsWith(".json")).map((f) => `ops/${f}`).filter((f) => tieneReglas(leerJson(f)));
    for (const f of conReglas) expect(declarados, `${f} usa sujeto, fuerza y exigencia: declara su estado en ops/redaccion.json`).toContain(f);
  });
  it("tieneReglas ve una regla a cualquier profundidad y no ve una ficha cualquiera", () => {
    expect(tieneReglas({ a: [{ b: { sujeto: "x", fuerza: "debe", exigencia: "llevar algo" } }] })).toBe(true);
    expect(tieneReglas({ a: [{ sujeto: "x", fuerza: "debe" }] })).toBe(false);
  });
});

/**
 * El borrado doble: quitar un catálogo (o pasarlo a pendiente) de ops/redaccion.json y de su ancla a la
 * vez pasa el trinquete local. Se contrasta con origin/staging (FORJA_REF cambia la referencia); sin ella,
 * o mientras los ficheros no estén en ella, se salta limpio y lo dice.
 */
const REF = REFERENCIA();
const refRedaccion = jsonEnReferenciaAvisando(RAIZ, REF, "ops/redaccion.json", "redacción");
const refPendientes = jsonEnReferenciaAvisando(RAIZ, REF, "ops/redaccion-pendientes.json", "redacción");

describe(`el trinquete contra ${REF}`, () => {
  it.skipIf(!refRedaccion || !refPendientes)("no hay pendientes nuevos ni faltan catálogos de la referencia", () => {
    expect(problemasContraReferencia(datos, leerPendientes(RAIZ), refRedaccion, refPendientes)).toEqual([]);
  });
  const ref = { catalogos: [{ fichero: "ops/a.json", estado: "pendiente" }, { fichero: "ops/b.json", estado: "cumple" }] };
  const ancla = { pendientes: ["ops/a.json"] };
  const hoy = (catalogos) => ({ catalogos });
  it("un pendiente que la referencia no tenía falla", () => {
    const d = hoy([{ fichero: "ops/a.json", estado: "pendiente" }, { fichero: "ops/b.json", estado: "pendiente" }]);
    expect(problemasContraReferencia(d, ["ops/a.json"], ref, ancla).join(String.fromCharCode(10))).toContain("«ops/b.json» está pendiente");
  });
  it("un ancla que la referencia no tenía falla", () => {
    const d = hoy([{ fichero: "ops/a.json", estado: "pendiente" }, { fichero: "ops/b.json", estado: "cumple" }]);
    expect(problemasContraReferencia(d, ["ops/a.json", "ops/b.json"], ref, ancla).join(String.fromCharCode(10))).toContain("el ancla solo baja");
  });
  it("un catálogo que la referencia tenía y ya no está falla", () => {
    expect(problemasContraReferencia(hoy([{ fichero: "ops/b.json", estado: "cumple" }]), [], ref, ancla).join(String.fromCharCode(10))).toContain("falta el catálogo «ops/a.json»");
  });
  it("bajar un pendiente a cumple pasa", () => {
    expect(problemasContraReferencia(hoy([{ fichero: "ops/a.json", estado: "cumple" }, { fichero: "ops/b.json", estado: "cumple" }]), [], ref, ancla)).toEqual([]);
  });
});

describe("cada regla se ve fallar con datos malos", () => {
  const falla = (mut, trozo) => {
    const d = clon();
    mut(d);
    expect(problemas(d).join("\n"), trozo).toContain(trozo);
  };
  const p0 = (d) => d.principios[0];
  it("un principio que no pasa problemasDeRegla", () => falla((d) => { p0(d).exigencia = "Escribirse en castellano."; }, "«exigencia»"));
  it("un principio con texto libre", () => falla((d) => { p0(d).texto = "algo"; }, "«texto» ya no existe"));
  it("un principio sin ejemplo bueno", () => falla((d) => { delete p0(d).ejemplo_bueno; }, "falta «ejemplo_bueno»"));
  it("un principio sin ejemplo malo", () => falla((d) => { p0(d).ejemplo_malo = ""; }, "«ejemplo_malo»"));
  it("un ejemplo con comillas angulares", () => falla((d) => { p0(d).ejemplo_malo = "Úsala «así» siempre"; }, "sin comillas angulares"));
  it("un principio sin fuente", () => falla((d) => { delete p0(d).fuente; }, "falta «fuente»"));
  it("una fuente sin marca", () => falla((d) => { p0(d).fuente = "https://www.rfc-editor.org/rfc/rfc2119"; }, "[F] con una dirección web"));
  it("una fuente [I] que no existe", () => falla((d) => { p0(d).fuente = "[I] docs/no-existe.md"; }, "que no existe"));
  it("un control que no existe", () => falla((d) => { p0(d).control = "ops/no-existe.test.js"; }, "no existe"));
  it("un sujeto fuera del vocabulario", () => falla((d) => { p0(d).sujeto = "coche"; }, "sujeto «coche»"));
  it("demasiado pocos principios", () => falla((d) => { d.principios = d.principios.slice(0, 5); }, "hay 5"));
  it("un id repetido", () => falla((d) => { d.principios[1].id = d.principios[0].id; }, "id repetido"));
  it("un catálogo que cumple sin su clave de reglas", () => falla((d) => { d.catalogos[0] = { ...d.catalogos[0], clave_reglas: "reglas_mal" }; }, "no es una lista de reglas"));
  it("un catálogo pendiente sin encargo", () => falla((d) => { delete d.catalogos.find((k) => k.estado === "pendiente").encargo; }, "lleva su encargo"));
  it("un catálogo cuya ruta no existe", () => falla((d) => { d.catalogos[2].fichero = "ops/no-existe.json"; }, "no existe"));
  it("un catálogo con un estado inventado", () => falla((d) => { d.catalogos[2].estado = "casi"; }, "fuera del vocabulario"));
  it("un catálogo que cumple y trae una regla mal escrita", () => {
    const d = clon();
    const malo = { sujetos: { s: { legible: "cada cosa", aplica_a: ["x"] } }, criterios: [{ nombre: "Mal.", sujeto: "s", fuerza: "debe", exigencia: "Hacer algo." }] };
    const salida = problemasDeRedaccion(d, { existe, leerJson: (r) => (r === d.catalogos[0].fichero ? malo : leerJson(r)) });
    expect(salida.join("\n")).toContain("«nombre»");
  });
  it("ops/flujo.json cumple la guía: una obligación por campos mal escrita falla", () => {
    const d = clon();
    const k = d.catalogos.find((x) => x.fichero === "ops/flujo.json");
    expect(k.estado).toBe("cumple");
    const flujo = leerJson("ops/flujo.json");
    const malo = structuredClone(flujo);
    malo.pasos[0].obligaciones[0].exigencia = "Avisar a alguien.";
    const salida = problemasDeRedaccion(d, { existe, leerJson: (r) => (r === "ops/flujo.json" ? malo : leerJson(r)) });
    expect(salida.join(String.fromCharCode(10))).toContain("P01.1");
    expect(salida.join(String.fromCharCode(10))).toContain("«exigencia»");
  });
  it("un catálogo que hereda sujetos de un fichero que no existe falla", () => falla((d) => { d.catalogos.find((k) => k.fichero === "ops/flujo.json").sujetos_de = ["ops/no-existe.json"]; }, "sujetos_de cita ops/no-existe.json"));
});

describe("reglasDe y sujetosDe", () => {
  const json = { pasos: [{ obligaciones: [{ id: "a" }, { id: "b", norma: "n" }] }, { obligaciones: [{ id: "c" }] }], normas: [{ id: "x" }] };
  it("una clave de primer nivel", () => expect(reglasDe(json, "normas").reglas).toEqual([{ id: "x" }]));
  it("una ruta que atraviesa listas, y separa las que remiten a una norma", () => {
    const de = reglasDe(json, "pasos.obligaciones");
    expect(de.reglas.map((r) => r.id)).toEqual(["a", "c"]);
    expect(de.remisiones.map((r) => r.id)).toEqual(["b"]);
  });
  it("una ruta que no existe", () => expect(reglasDe(json, "pasos.inventado")).toBeNull());
  it("los sujetos propios mandan sobre los heredados", () => {
    const leer = (r) => ({ sujetos: { a: { legible: "heredado" }, b: { legible: "otro" } }, otra: r });
    expect(sujetosDe({ clave_sujetos: "sujetos", sujetos_de: ["x.json"] }, { sujetos: { a: { legible: "propio" } } }, leer))
      .toEqual({ a: { legible: "propio" }, b: { legible: "otro" } });
  });
});
