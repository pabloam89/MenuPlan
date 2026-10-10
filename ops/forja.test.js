import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTEFACTOS, CAMPOS, ESTADOS_CON_NOTA, ESTADOS_CRITERIO, JUICIO, ORDEN_CAPAS, RUTA_CAPAS, RUTA_FORJA, RUTA_MD,
  anclarCapas, cifras, codigosDeFuente, codigosEmitidos, generarMd, leerCapas, leerFicha, leerForja, lineaDeFicha,
  problemasDeCodigos, problemasDeFicha, problemasDeForja, problemasDeTrinquete,
} from "../scripts/lib/forja.mjs";
import { CODIGOS_ESTANDAR, CODIGOS_FORJA } from "../scripts/lib/skillsForja.mjs";
import { ARREGLOS, CODIGOS_HIGIENE } from "../scripts/lib/higieneSkills.mjs";
import { REGLAS } from "../scripts/lib/skills.mjs";

/**
 * La base común de la forja (#458, fondo #455). Falla cuando:
 *  1. un criterio no tiene su forma, su fuente ([F] con url, [I] con ruta) o su control (un fichero o «juicio»);
 *  2. un script de skills emite un código que ningún criterio recoge (los códigos salen del propio código);
 *  3. la capa de un criterio baja o un criterio desaparece sin motivo (trinquete de promoción);
 *  4. docs/ops/FORJA.md no sale del JSON.
 * Al final, cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const datos = leerForja(RAIZ);
const guardado = leerCapas(RAIZ);
const fuentes = { "skillsForja.mjs": leer("scripts/lib/skillsForja.mjs"), "higieneSkills.mjs": leer("scripts/lib/higieneSkills.mjs") };
const emitidos = codigosEmitidos({ CODIGOS_FORJA, CODIGOS_ESTANDAR, CODIGOS_HIGIENE, ARREGLOS, REGLAS }, fuentes);
const md = leer(RUTA_MD);
const clon = () => structuredClone(datos);

describe("vocabularios", () => {
  it("tres capas, de la más blanda a la más dura", () => expect(ORDEN_CAPAS).toEqual(["subjetiva", "material", "formal"]));
  it("cuatro estados y la nota solo para el hueco", () => {
    expect(Object.keys(ESTADOS_CRITERIO)).toEqual(["cumple", "no_cumple", "no_aplica", "juicio"]);
    expect(ESTADOS_CON_NOTA).toEqual(["no_cumple", "juicio"]);
  });
  it("tres artefactos", () => expect(Object.keys(ARTEFACTOS)).toEqual(["skill", "estandar", "agente"]));
});

describe("ops/forja.json", () => {
  it("cada criterio tiene su forma, su fuente y su control", () => {
    expect(problemasDeForja(datos, existe), "Corrige ops/forja.json (y lanza «npm run forja -- --escribir»)").toEqual([]);
  });
  it("todo criterio tiene control o juicio", () => {
    for (const c of datos.criterios) expect(typeof c.control === "string" && c.control.length > 0, c.id).toBe(true);
    for (const c of datos.criterios.filter((x) => x.control !== JUICIO)) expect(existe(c.control), `${c.id}: ${c.control}`).toBe(true);
  });
  it("cada capa tiene criterios y los de la capa subjetiva llevan rúbrica", () => {
    const k = cifras(datos);
    for (const capa of ORDEN_CAPAS) expect(k.porCapa[capa], capa).toBeGreaterThan(0);
    for (const c of datos.criterios.filter((x) => x.capa === "subjetiva")) expect(c.texto).toMatch(/Cumple si[\s\S]*No cumple si/);
  });
  it("el solape lleva los tres pares medidos como casos que lo prueban", () => {
    const t = datos.criterios.find((c) => c.id === "solape").texto;
    for (const par of ["forja-de-skills con higiene-de-skills", "hetzner con 1password", "issues con causa-raiz"]) expect(t).toContain(par);
  });
});

describe("los códigos que emiten los scripts apuntan a un criterio", () => {
  it("se sacan del propio código y no son pocos", () => {
    expect(emitidos.size).toBeGreaterThanOrEqual(35);
    for (const c of ["casos-negativos", "comando-suelto", "tipo-sin-estandar", "caduca-pronto", "frontmatter"]) expect(emitidos.has(c), c).toBe(true);
  });
  it("ningún código emitido queda sin criterio, ni criterio con un código que nadie emite", () => {
    expect(problemasDeCodigos(datos, emitidos), "Da de alta el criterio en ops/forja.json con su codigo").toEqual([]);
  });
});

describe("el trinquete de promoción (ops/forja-capas.json)", () => {
  it("ninguna capa baja, ningún criterio desaparece sin motivo y todos están anclados", () => {
    expect(problemasDeTrinquete(datos, guardado), "Una capa solo sube. Para ancharla: «npm run forja -- --escribir»").toEqual([]);
  });
  it("lo anclado coincide con el catálogo (nada por subir sin guardar)", () => {
    expect(anclarCapas(datos, guardado).cambios, "Lanza «npm run forja -- --escribir»").toEqual([]);
  });
});

describe("docs/ops/FORJA.md sale del JSON", () => {
  it("está al día", () => expect(md, "FORJA.md se genera: edita ops/forja.json y lanza `npm run forja -- --escribir`").toBe(generarMd(datos)));
  it("no usa saltos de línea de Windows (el CI es Linux)", () => expect(md).not.toContain("\r"));
  it("npm run forja existe", () => expect(JSON.parse(leer("package.json")).scripts.forja).toBeTruthy());
});

describe("las fichas: skill: x criterio: y estado: z", () => {
  it("una línea se escribe, se lee y se valida", () => {
    const f = { artefacto: "skill", nombre: "hetzner", criterio: "solape", estado: "no_cumple", nota: "solapa con 1password" };
    const l = lineaDeFicha(f);
    expect(l).toBe("skill: hetzner criterio: solape estado: no_cumple nota: solapa con 1password");
    expect(leerFicha(l)).toEqual(f);
    expect(problemasDeFicha(leerFicha(l), datos)).toEqual([]);
  });
  it("cada regla de la ficha falla con una ficha mala", () => {
    const ok = { artefacto: "skill", nombre: "x", criterio: "solape", estado: "cumple", nota: null };
    expect(problemasDeFicha(null, datos)).not.toEqual([]);
    expect(problemasDeFicha({ ...ok, criterio: "inventado" }, datos).join()).toContain("no existe");
    expect(problemasDeFicha({ ...ok, estado: "quizá" }, datos).join()).toContain("vocabulario");
    expect(problemasDeFicha({ ...ok, artefacto: "estandar" }, datos).join()).toContain("no se aplica");
    expect(problemasDeFicha({ ...ok, artefacto: "estandar", estado: "no_aplica" }, datos)).toEqual([]);
    expect(problemasDeFicha({ ...ok, nota: "algo" }, datos).join()).toContain("hueco");
    expect(problemasDeFicha({ ...ok, artefacto: "cosa" }, datos).join()).toContain("artefacto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Autotest: cada regla falla con datos malos. Cada caso cambia UNA cosa.
describe("autotest: cada regla falla con datos malos", () => {
  const falla = (mut, trozo) => {
    const d = clon();
    mut(d.criterios[0], d);
    expect(problemasDeForja(d, existe).join("\n"), trozo).toContain(trozo);
  };
  const subj = (d) => d.criterios.find((c) => c.capa === "subjetiva");
  it("el catálogo sin tocar pasa", () => expect(problemasDeForja(clon(), existe)).toEqual([]));
  it("un campo de más o de menos", () => {
    falla((c) => { c.raro = 1; }, "no admitido");
    falla((c) => { delete c.control; }, "falta el campo");
  });
  it("id mal escrito o repetido", () => {
    falla((c) => { c.id = "Mal Id"; }, "minúsculas");
    falla((c, d) => { d.criterios[1].id = c.id; }, "repetido");
  });
  it("capa y artefacto fuera del vocabulario", () => {
    falla((c) => { c.capa = "blanda"; }, "capa");
    falla((c) => { c.aplica_a = ["coche"]; }, "aplica_a");
    falla((c) => { c.aplica_a = []; }, "aplica_a");
  });
  it("texto corto o en varias líneas", () => {
    falla((c) => { c.texto = "corto"; }, "texto");
    falla((c) => { c.texto = `${c.texto}\nsegunda línea`; }, "una sola línea");
  });
  it("una rúbrica subjetiva sin «Cumple si» y «No cumple si»", () => {
    const d = clon();
    subj(d).texto = "Esto es una frase suficientemente larga pero sin rúbrica alguna.";
    expect(problemasDeForja(d, existe).join()).toContain("rúbrica");
  });
  it("fuente sin marca, sin url o con una ruta que no existe", () => {
    falla((c) => { c.fuente = "https://x.com"; }, "fuente");
    falla((c) => { c.fuente = "[F] http://x.com/a"; }, "fuente");
    falla((c) => { c.fuente = "[I] ruta/que/no/existe.md"; }, "no existe");
  });
  it("sin control, control inexistente o juicio donde no toca", () => {
    falla((c) => { c.control = ""; }, "sin control");
    falla((c) => { c.control = "ops/no-existe.test.js"; }, "no existe");
    falla((c) => { c.control = JUICIO; }, "lo vigila un fichero");
    const d = clon();
    subj(d).control = ".claude/skills.test.js";
    expect(problemasDeForja(d, existe).join()).toContain("subjetivo se vigila con");
  });
  it("código mal escrito, repetido o en un criterio subjetivo", () => {
    falla((c) => { c.codigo = "Mal Codigo"; }, "codigo");
    falla((c, d) => { d.criterios[1].codigo = c.codigo; }, "ya es de");
    const d = clon();
    subj(d).codigo = "algo";
    expect(problemasDeForja(d, existe).join()).toContain("ningún script");
  });
  it("un código emitido sin criterio, y un criterio con un código que nadie emite", () => {
    expect(problemasDeCodigos(datos, new Map([...emitidos, ["codigo-nuevo", "prueba"]])).join()).toContain("codigo-nuevo");
    const d = clon();
    d.criterios[0].codigo = "ya-no-existe";
    expect(problemasDeCodigos(d, emitidos).join()).toContain("ya no lo emite");
  });
  it("los códigos de un fuente se leen de sus llamadas", () => {
    expect(codigosDeFuente('f.push(falta("uno", x)); defecto("dos-dos", "a"); faltaEstandar("tres", t, d); const falta = (codigo) => 1;')).toEqual(["uno", "dos-dos", "tres"]);
    expect(codigosEmitidos({ CODIGOS_FORJA: [], CODIGOS_ESTANDAR: [], CODIGOS_HIGIENE: [], ARREGLOS: {}, REGLAS: { forja: "x", otra: "y" } }, { "f.mjs": 'falta("nuevo", d)' }).size).toBe(2);
  });
  it("trinquete: una capa que baja falla", () => {
    const d = clon();
    const c = d.criterios.find((x) => x.capa === "formal");
    c.capa = "material";
    expect(problemasDeTrinquete(d, guardado).join()).toContain(`${c.id}: baja de formal a material`);
    const s = clon();
    const m = s.criterios.find((x) => x.capa === "material");
    m.capa = "subjetiva";
    expect(problemasDeTrinquete(s, guardado).join()).toContain("baja de material a subjetiva");
  });
  it("trinquete: subir no falla, pero queda por anclar", () => {
    const d = clon();
    const c = d.criterios.find((x) => x.capa === "subjetiva");
    c.capa = "material";
    expect(problemasDeTrinquete(d, guardado)).toEqual([]);
    const { guardado: nuevo, cambios } = anclarCapas(d, guardado);
    expect(cambios.join()).toContain(`${c.id}: sube de subjetiva a material`);
    expect(nuevo.capas[c.id]).toBe("material");
  });
  it("trinquete: anclar nunca baja ni borra", () => {
    const d = clon();
    const c = d.criterios.find((x) => x.capa === "formal");
    c.capa = "subjetiva";
    d.criterios.pop();
    const { guardado: nuevo } = anclarCapas(d, guardado);
    expect(nuevo.capas[c.id]).toBe("formal");
    expect(Object.keys(nuevo.capas).length).toBe(Object.keys(guardado.capas).length);
  });
  it("trinquete: un criterio que desaparece sin motivo falla; con motivo, no", () => {
    const d = clon();
    const quitado = d.criterios.pop();
    expect(problemasDeTrinquete(d, guardado).join()).toContain(`${quitado.id}: ha desaparecido`);
    const con = { ...guardado, retirados: { [quitado.id]: { motivo: "Se fundió en otro criterio más general" } } };
    expect(problemasDeTrinquete(d, con)).toEqual([]);
    const corto = { ...guardado, retirados: { [quitado.id]: { motivo: "no" } } };
    expect(problemasDeTrinquete(d, corto).join()).toContain("sin motivo");
    expect(problemasDeTrinquete(clon(), { ...guardado, retirados: { [quitado.id]: { motivo: "Se fundió en otro criterio más general" } } }).join()).toContain("sigue en el catálogo");
  });
  it("trinquete: un criterio nuevo sin anclar falla", () => {
    const d = clon();
    d.criterios.push({ ...d.criterios[0], id: "criterio-nuevo", codigo: null });
    expect(problemasDeTrinquete(d, guardado).join()).toContain("criterio-nuevo: criterio sin anclar");
  });
  it("FORJA.md desfasado: cambiar un criterio cambia la vista", () => {
    const d = clon();
    d.criterios[0].texto += " y algo más";
    expect(generarMd(d)).not.toBe(md);
    const e = clon();
    e.criterios.pop();
    expect(generarMd(e)).not.toBe(md);
  });
  it("calibración: todo criterio subjetivo lleva casos con respuesta conocida, y solo ellos", () => {
    const d = clon();
    delete subj(d).casos_calibracion;
    expect(problemasDeForja(d, existe).join()).toContain("caso de calibración");
    const v = clon();
    subj(v).casos_calibracion = [];
    expect(problemasDeForja(v, existe).join()).toContain("caso de calibración");
    const e = clon();
    subj(e).casos_calibracion[0].esperado = "quizá";
    expect(problemasDeForja(e, existe).join()).toContain("esperado");
    const t = clon();
    subj(t).casos_calibracion[0].texto = "corto";
    expect(problemasDeForja(t, existe).join()).toContain("texto");
    falla((c) => { c.casos_calibracion = [{ texto: "Un texto de ejemplo suficientemente largo", esperado: "cumple" }]; }, "solo de la capa subjetiva");
  });
  it("promoción: el umbral es un parámetro válido", () => {
    const a = clon();
    delete a.promocion;
    expect(problemasDeForja(a, existe).join()).toContain("promocion");
    for (const mala of [{ coincidencia_minima: 0, repeticiones: 10 }, { coincidencia_minima: 1.5, repeticiones: 10 }, { coincidencia_minima: 0.9, repeticiones: 0 }, { coincidencia_minima: 0.9, repeticiones: 2.5 }]) {
      const d = clon();
      d.promocion = mala;
      expect(problemasDeForja(d, existe), JSON.stringify(mala)).not.toEqual([]);
    }
  });
  it("promoción: listo_para_subir solo con medidas que cumplen el umbral", () => {
    const con = (extra) => { const d = clon(); Object.assign(subj(d), extra); return problemasDeForja(d, existe).join(); };
    expect(con({ listo_para_subir: true })).toContain("sin medidas");
    expect(con({ listo_para_subir: true, medidas: { coincidencia: 0.8, repeticiones: 10 } })).toContain("coincidencia");
    expect(con({ listo_para_subir: true, medidas: { coincidencia: 0.95, repeticiones: 3 } })).toContain("repeticiones");
    expect(con({ listo_para_subir: "sí" })).toContain("verdadero o falso");
    expect(con({ listo_para_subir: true, medidas: { coincidencia: 0.95, repeticiones: 10 } })).toBe("");
    expect(con({ listo_para_subir: false })).toBe("");
    const umbral = clon();
    umbral.promocion.coincidencia_minima = 0.99;
    Object.assign(subj(umbral), { listo_para_subir: true, medidas: { coincidencia: 0.95, repeticiones: 10 } });
    expect(problemasDeForja(umbral, existe).join()).toContain("la promoción pide 0.99");
  });
  it("FORJA.md dice que los valores de promoción son un primer tiro", () => {
    expect(md).toContain("primer tiro, pendientes de ajustar con datos");
    expect(md).toContain(String(datos.promocion.coincidencia_minima));
  });
  it("los campos del catálogo son los acordados", () => expect(CAMPOS).toEqual(["id", "capa", "aplica_a", "texto", "fuente", "control", "codigo"]));
  it("las rutas del módulo existen", () => {
    expect(existe(RUTA_FORJA) && existe(RUTA_CAPAS) && existe(RUTA_MD)).toBe(true);
  });
});
