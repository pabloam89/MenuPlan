import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LIMITES_REGLA } from "../scripts/lib/regla.mjs";
import {
  ESTADOS_CATALOGO, MAX_PRINCIPIOS, MIN_PRINCIPIOS, RUTA_MD, anclarPendientes, generarMd, leerJsonEn, leerPendientes, leerRedaccion,
  pendientesDe, problemasDeRedaccion, problemasDeTrinquete,
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
  it("cubre lo que pidió el encargo", () => {
    const ids = datos.principios.map((p) => p.id);
    for (const id of ["castellano-siempre", "un-termino-por-concepto", "fuerza-segun-rfc-2119", "condicion-estilo-ears", "exigencia-en-infinitivo", "nombre-de-dos-a-cinco-palabras", "dato-contable-en-campo", "nota-solo-para-el-matiz", "frases-cortas", "sin-anglicismos-con-termino"]) {
      expect(ids, id).toContain(id);
    }
  });
  it("cita las fuentes que pidió el encargo", () => {
    const fuentes = datos.principios.map((p) => p.fuente).join("\n");
    for (const f of ["rfc2119", "rfc8174", "alistairmavin.com/ears", "agent-skills/best-practices", "plainlanguage.gov"]) expect(fuentes, f).toContain(f);
  });
  it("los topes que cita un principio son los de regla.mjs", () => {
    const de = (id) => datos.principios.find((p) => p.id === id).exigencia;
    expect(de("exigencia-corta-y-unica")).toContain(String(LIMITES_REGLA.exigencia.max));
    expect(de("nota-solo-para-el-matiz")).toContain(String(LIMITES_REGLA.nota.max));
    expect(de("nombre-de-dos-a-cinco-palabras")).toContain(`de ${LIMITES_REGLA.nombre.palabras_min} a ${LIMITES_REGLA.nombre.palabras_max} palabras`);
  });
  it("los estados de catálogo son dos", () => expect(Object.keys(ESTADOS_CATALOGO)).toEqual(["cumple", "pendiente"]));
});

describe("docs/ops/REDACCION.md sale del JSON", () => {
  it("está al día", () => {
    const md = readFileSync(join(RAIZ, RUTA_MD), "utf8");
    expect(md, "REDACCION.md se genera: edita ops/redaccion.json y lanza `npm run redaccion -- --escribir`").toBe(generarMd(datos, leerJson));
  });
  it("lleva todos los principios", () => {
    const md = generarMd(datos, leerJson);
    for (const p of datos.principios) expect(md).toContain(`\`${p.id}\``);
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
    expect(anclarPendientes(d, ["ops/normas.json"])).toEqual(["ops/normas.json"]);
    expect(anclarPendientes(d, [], { sembrar: true })).toEqual(pendientesDe(d));
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
  it("un catálogo pendiente sin encargo", () => falla((d) => { delete d.catalogos[1].encargo; }, "lleva su encargo"));
  it("un catálogo con un estado inventado", () => falla((d) => { d.catalogos[1].estado = "casi"; }, "fuera del vocabulario"));
  it("un catálogo que cumple y trae una regla mal escrita", () => {
    const d = clon();
    const malo = { sujetos: { s: { legible: "cada cosa", aplica_a: ["x"] } }, criterios: [{ nombre: "Mal.", sujeto: "s", fuerza: "debe", exigencia: "Hacer algo." }] };
    const salida = problemasDeRedaccion(d, { existe, leerJson: (r) => (r === d.catalogos[0].fichero ? malo : leerJson(r)) });
    expect(salida.join("\n")).toContain("«nombre»");
  });
});
