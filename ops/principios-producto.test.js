import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DERIVADOS } from "../scripts/lib/generados.mjs";
import { leerRegistro } from "../scripts/lib/normas.mjs";
import {
  MAX_PALABRAS_CITA, RUTA_MD, RUTA_PRINCIPIOS, cifras, citasDe, generarMd, leerPrincipios, normasDe, principiosDe, problemasDePrincipios, tieneControl,
} from "../scripts/lib/principiosProducto.mjs";
import { CONTROL_JUICIO, PALABRAS_DE_FUERZA } from "../scripts/lib/regla.mjs";
import { leerRedaccion } from "../scripts/lib/redaccion.mjs";

/**
 * Los principios de producto con fuente (#606), separados en principio sin fuerza y norma (#620). Falla cuando:
 *  1. un principio no pasa la plantilla de principio, el área, los ejemplos o las fuentes, o lleva fuerza o control (son de su norma);
 *  2. un id o un nombre se repite, o un principio no lleva ninguna fuente;
 *  3. un principio no tiene ninguna norma en ops/normas.json, o el control de una norma no existe o no se ejecuta;
 *  4. una cita literal pasa de 15 palabras;
 *  5. docs/producto/PRINCIPIOS.md no sale del catálogo;
 *  6. el catálogo no figura en la guía de redacción ni en el inventario de derivados.
 * Al final, cada comprobación se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const datos = leerPrincipios(RAIZ);
const registro = leerRegistro(RAIZ);
const clon = () => structuredClone(datos);
const problemas = (d) => problemasDePrincipios(d);

describe("ops/principios-producto/", () => {
  it("no tiene ningún problema", () => expect(problemas(datos)).toEqual([]));

  it("tiene los 34 del núcleo, agrupados, y los de las áreas que el núcleo no cubre", () => {
    expect(datos.principios.length).toBeGreaterThanOrEqual(34);
    expect(Object.keys(datos.areas)).toEqual([
      "trust-safety", "privacy", "conversational-ai", "onboarding", "cost-reliability", "ux-clarity", "accessibility", "scope",
    ]);
  });

  it("cada principio lleva al menos una fuente, con marca F o S (la I es de la casa, #620)", () => {
    for (const p of datos.principios) {
      expect(p.fuentes.length, p.id).toBeGreaterThanOrEqual(1);
      for (const f of p.fuentes) expect(["F", "S"], `${p.id}: ${f.url}`).toContain(f.marca);
    }
  });

  it("ids y nombres no se repiten, y el id es el nombre del fichero (en inglés, sin tildes)", () => {
    const ids = datos.principios.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(datos.principios.map((p) => p.nombre)).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, "los ids van en inglés, en ASCII").toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(existe(`${RUTA_PRINCIPIOS}principios/${id}.json`), id).toBe(true);
    }
  });

  it("cada principio tiene al menos una norma, y el control de cada una que no es juicio existe y se ejecuta", () => {
    for (const p of datos.principios) expect(normasDe(registro.normas, p.id).length, `${p.id}: sin norma en ops/normas.json`).toBeGreaterThan(0);
    const conControl = datos.principios.filter((p) => tieneControl(p, registro.normas));
    expect(conControl.length).toBeGreaterThan(0);
    for (const p of conControl) {
      for (const n of normasDe(registro.normas, p.id).filter((x) => x.control !== CONTROL_JUICIO)) {
        expect(n.control, `${p.id} · ${n.id}`).toMatch(/\.(m?js|jsx|cjs|ya?ml)$/);
        expect(existe(n.control), `${p.id} · ${n.id}: ${n.control}`).toBe(true);
      }
    }
  });

  it("la norma de public-endpoint-justified es el test de contrato de api/ y su registro existe", () => {
    const n = normasDe(registro.normas, "public-endpoint-justified");
    expect(n.map((x) => x.control)).toContain("api/sinCredencial.test.js");
    expect(existe("ops/api-sin-credencial.json")).toBe(true);
  });

  it("el principio no lleva fuerza: la lleva su norma (#620)", () => {
    for (const p of datos.principios) {
      for (const c of ["sujeto", "fuerza", "condicion", "exigencia", "control", "nota"]) expect(c in p, `${p.id}: ${c}`).toBe(false);
      expect(PALABRAS_DE_FUERZA.test(p.enunciado.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()), p.id).toBe(false);
    }
  });

  it("ninguna cita literal pasa de 15 palabras", () => {
    for (const p of datos.principios) {
      for (const t of [p.nombre, p.enunciado, p.porque, p.ejemplo_bueno, p.ejemplo_malo].filter(Boolean)) {
        for (const q of citasDe(t)) expect(q.trim().split(/\s+/).length, `${p.id}: «${q}»`).toBeLessThanOrEqual(MAX_PALABRAS_CITA);
      }
    }
  });

  it("las cifras por área suman los principios y los de norma y control cuadran", () => {
    const c = cifras(datos, registro.normas);
    expect(c.reduce((s, x) => s + x.total, 0)).toBe(datos.principios.length);
    expect(c.reduce((s, x) => s + x.conNorma, 0)).toBe(datos.principios.length);
    expect(c.reduce((s, x) => s + x.conControl, 0)).toBe(datos.principios.filter((p) => tieneControl(p, registro.normas)).length);
    for (const a of Object.keys(datos.areas)) expect(principiosDe(datos, a).length, a).toBeGreaterThan(0);
  });
});

describe("docs/producto/PRINCIPIOS.md sale del catálogo", () => {
  it("está al día", () => {
    const md = readFileSync(join(RAIZ, RUTA_MD), "utf8");
    expect(md, "PRINCIPIOS.md se genera: edita ops/principios-producto/ o ops/normas.json y lanza `npm run principios -- --escribir`").toBe(generarMd(datos, registro));
  });
  it("lleva la cabecera de documento generado, todos los ids y la norma de cada principio", () => {
    const md = generarMd(datos, registro);
    expect(md).toMatch(/^<!-- Generado desde .*No se edita a mano/m);
    for (const p of datos.principios) expect(md).toContain(`\`${p.id}\``);
    for (const p of datos.principios) for (const n of normasDe(registro.normas, p.id)) expect(md, n.id).toContain(`  - Norma: \`${n.id}\``);
  });
});

describe("el catálogo está registrado", () => {
  it("figura en la guía de redacción como catálogo de principios que cumple", () => {
    const k = leerRedaccion(RAIZ).catalogos.find((x) => x.fichero === RUTA_PRINCIPIOS);
    expect(k?.estado).toBe("cumple");
    expect(k.forma).toBe("principio");
    expect(k.clave_reglas).toBe("principios");
  });
  it("su documento figura en el inventario de derivados, con su script y su test", () => {
    const d = DERIVADOS.find((x) => x.ruta === RUTA_MD);
    expect(d).toMatchObject({ clase: "documento", regenera: "scripts/principios.mjs", test: "ops/principios-producto.test.js" });
    expect(existe(d.regenera) && existe(d.test)).toBe(true);
  });
  it("la skill que lo aplica existe y manda al comando", () => {
    const skill = readFileSync(join(RAIZ, ".claude/skills/principios-de-producto/SKILL.md"), "utf8");
    expect(skill).toContain("npm run principios");
  });
});

describe("cada comprobación se ve fallar con datos malos", () => {
  const falla = (mut, trozo) => {
    const d = clon();
    mut(d);
    expect(problemas(d).join("\n")).toContain(trozo);
  };
  const p0 = (d) => d.principios[0];

  it("un id repetido", () => falla((d) => { d.principios[1].id = d.principios[0].id; }, "id repetido"));
  it("un nombre repetido", () => falla((d) => { d.principios[1].nombre = d.principios[0].nombre; }, "nombre repetido"));
  it("un principio sin fuentes", () => falla((d) => { p0(d).fuentes = []; }, "una fuente como mínimo"));
  it("una marca fuera del vocabulario", () => falla((d) => { p0(d).fuentes[0].marca = "X"; }, "marca «X»"));
  it("una fuente que no es https", () => falla((d) => { p0(d).fuentes[0].url = "http://api-security.owasp.org/x"; }, "dirección https"));
  it("un dominio que no está admitido", () => falla((d) => { p0(d).fuentes[0].url = "https://blog.ejemplo.com/x"; }, "no está en DOMINIOS_FUENTE"));
  it("una fuente repetida en el mismo principio", () => falla((d) => { p0(d).fuentes.push({ ...p0(d).fuentes[0] }); }, "fuente repetida"));
  it("un área fuera del vocabulario", () => falla((d) => { p0(d).area = "marketing"; }, "área «marketing»"));
  it("un área sin ningún principio", () => falla((d) => { d.areas.vacia = { legible: "vacía", que: "Un área que nadie usa todavía" }; }, "ningún principio la usa"));
  it("un principio con fuerza en su enunciado", () => falla((d) => { p0(d).enunciado = "Cada endpoint debe tener su límite diario."; }, "palabra de fuerza"));
  it("un principio con los campos de regla de antes", () => falla((d) => { p0(d).fuerza = "debe"; }, "la obligación es de su norma"));
  it("un enunciado de dos frases", () => falla((d) => { p0(d).enunciado = "Un principio dice algo. Y otra cosa."; }, "una sola frase"));
  it("un catálogo que vuelve a declarar sujetos", () => falla((d) => { d.sujetos = { product: { legible: "el producto", aplica_a: ["principio"] } }; }, "no lleva «sujetos»"));
  it("un principio sin porqué", () => falla((d) => { delete p0(d).porque; }, "falta «porque»"));
  it("un ejemplo con comillas angulares", () => falla((d) => { p0(d).ejemplo_bueno = "Un ejemplo con «comillas» dentro"; }, "sin comillas angulares"));
  it("el mismo ejemplo bueno y malo", () => falla((d) => { p0(d).ejemplo_malo = p0(d).ejemplo_bueno; }, "son el mismo"));
  it("un campo que no existe", () => falla((d) => { p0(d).texto_libre = "x"; }, "campo desconocido «texto_libre»"));
  it("una cita literal de más de 15 palabras", () => {
    const larga = Array.from({ length: 16 }, (_, i) => `palabra${i}`).join(" ");
    falla((d) => { p0(d).porque = `Dice «${larga}» y poco más.`; }, "cita literal de 16 palabras");
  });
  it("una cita de 15 palabras pasa", () => {
    const d = clon();
    p0(d).porque = `Dice «${Array.from({ length: 15 }, (_, i) => `palabra${i}`).join(" ")}» y poco más.`;
    expect(problemas(d).join("\n")).not.toContain("cita literal");
  });
  it("citasDe ve las tres clases de comillas", () => {
    expect(citasDe("a «uno» b \"dos\" c “tres”")).toEqual(["uno", "tres", "dos"]);
  });
  it("el documento generado cambia si cambia un principio o su norma", () => {
    const d = clon();
    p0(d).porque = "Otro porqué distinto, escrito para que el documento cambie";
    expect(generarMd(d, registro)).not.toBe(generarMd(datos, registro));
    const r = structuredClone(registro);
    r.normas.find((n) => n.principio === datos.principios[0].id).exigencia = "hacer otra cosa distinta";
    expect(generarMd(datos, r)).not.toBe(generarMd(datos, registro));
  });
});
