import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DERIVADOS } from "../scripts/lib/generados.mjs";
import {
  MAX_PALABRAS_CITA, RUTA_MD, RUTA_PRINCIPIOS, cifras, citasDe, generarMd, leerPrincipios, principiosDe, problemasDePrincipios, tieneControl,
} from "../scripts/lib/principiosProducto.mjs";
import { CONTROL_JUICIO, fraseDeRegla } from "../scripts/lib/regla.mjs";
import { leerRedaccion } from "../scripts/lib/redaccion.mjs";

/**
 * Los principios de producto con fuente (#606). Falla cuando:
 *  1. un principio no pasa la plantilla de regla, el área, los ejemplos, las fuentes o el control;
 *  2. un id o un nombre se repite, o un principio no lleva ninguna fuente;
 *  3. un control apunta a un fichero que no existe o que no se ejecuta;
 *  4. una cita literal pasa de 15 palabras;
 *  5. docs/producto/PRINCIPIOS.md no sale del catálogo;
 *  6. el catálogo no figura en la guía de redacción ni en el inventario de derivados.
 * Al final, cada comprobación se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const datos = leerPrincipios(RAIZ);
const clon = () => structuredClone(datos);
const problemas = (d) => problemasDePrincipios(d, { existe });

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

  it("cada control que no es juicio existe y se ejecuta", () => {
    const conControl = datos.principios.filter(tieneControl);
    expect(conControl.length).toBeGreaterThan(0);
    for (const p of conControl) {
      expect(p.control, p.id).toMatch(/\.(m?js|jsx|cjs|ya?ml)$/);
      expect(existe(p.control), `${p.id}: ${p.control}`).toBe(true);
    }
  });

  it("el control de public-endpoint-justified es el test de contrato de api/ y su registro existe", () => {
    const p = datos.principios.find((x) => x.id === "public-endpoint-justified");
    expect(p.control).toBe("api/sinCredencial.test.js");
    expect(existe("ops/api-sin-credencial.json")).toBe(true);
  });

  it("la frase de cada principio sale de sus campos", () => {
    for (const p of datos.principios) {
      const f = fraseDeRegla(p, datos.sujetos);
      expect(f, p.id).toContain(p.nombre);
      expect(f, p.id).toMatch(/DEBE|CONVIENE/);
    }
  });

  it("ninguna cita literal pasa de 15 palabras", () => {
    for (const p of datos.principios) {
      for (const t of [p.nombre, p.condicion, p.exigencia, p.nota, p.porque, p.ejemplo_bueno, p.ejemplo_malo].filter(Boolean)) {
        for (const q of citasDe(t)) expect(q.trim().split(/\s+/).length, `${p.id}: «${q}»`).toBeLessThanOrEqual(MAX_PALABRAS_CITA);
      }
    }
  });

  it("las cifras por área suman los principios y los de control cuadran", () => {
    const c = cifras(datos);
    expect(c.reduce((s, x) => s + x.total, 0)).toBe(datos.principios.length);
    expect(c.reduce((s, x) => s + x.conControl, 0)).toBe(datos.principios.filter((p) => p.control !== CONTROL_JUICIO).length);
    for (const a of Object.keys(datos.areas)) expect(principiosDe(datos, a).length, a).toBeGreaterThan(0);
  });
});

describe("docs/producto/PRINCIPIOS.md sale del catálogo", () => {
  it("está al día", () => {
    const md = readFileSync(join(RAIZ, RUTA_MD), "utf8");
    expect(md, "PRINCIPIOS.md se genera: edita ops/principios-producto/ y lanza `npm run principios -- --escribir`").toBe(generarMd(datos));
  });
  it("lleva la cabecera de documento generado y todos los ids", () => {
    const md = generarMd(datos);
    expect(md).toMatch(/^<!-- Generado desde .*No se edita a mano/m);
    for (const p of datos.principios) expect(md).toContain(`\`${p.id}\``);
  });
});

describe("el catálogo está registrado", () => {
  it("figura en la guía de redacción como catálogo que cumple", () => {
    const k = leerRedaccion(RAIZ).catalogos.find((x) => x.fichero === RUTA_PRINCIPIOS);
    expect(k?.estado).toBe("cumple");
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
  const juicio = (d) => d.principios.find((p) => p.control === CONTROL_JUICIO);

  it("un id repetido", () => falla((d) => { d.principios[1].id = d.principios[0].id; }, "id repetido"));
  it("un nombre repetido", () => falla((d) => { d.principios[1].nombre = d.principios[0].nombre; }, "nombre repetido"));
  it("un principio sin fuentes", () => falla((d) => { p0(d).fuentes = []; }, "una fuente como mínimo"));
  it("una marca fuera del vocabulario", () => falla((d) => { p0(d).fuentes[0].marca = "X"; }, "marca «X»"));
  it("una fuente que no es https", () => falla((d) => { p0(d).fuentes[0].url = "http://api-security.owasp.org/x"; }, "dirección https"));
  it("un dominio que no está admitido", () => falla((d) => { p0(d).fuentes[0].url = "https://blog.ejemplo.com/x"; }, "no está en DOMINIOS_FUENTE"));
  it("una fuente repetida en el mismo principio", () => falla((d) => { p0(d).fuentes.push({ ...p0(d).fuentes[0] }); }, "fuente repetida"));
  it("un área fuera del vocabulario", () => falla((d) => { p0(d).area = "marketing"; }, "área «marketing»"));
  it("un área sin ningún principio", () => falla((d) => { d.areas.vacia = { legible: "vacía", que: "Un área que nadie usa todavía" }; }, "ningún principio la usa"));
  it("un sujeto fuera del vocabulario", () => falla((d) => { p0(d).sujeto = "nadie"; }, "sujeto «nadie»"));
  it("una fuerza fuera del vocabulario", () => falla((d) => { p0(d).fuerza = "quizas"; }, "fuerza «quizas»"));
  it("una exigencia de más de 160 caracteres", () => falla((d) => { p0(d).exigencia = `${"decir algo largo ".repeat(12)}`.trim(); }, "pasa de 160"));
  it("un control que no existe", () => falla((d) => { juicio(d).control = "ops/no-existe.test.js"; }, "no existe en el repo"));
  it("un control que es un documento", () => falla((d) => { juicio(d).control = "CLAUDE.md"; }, "si lo vigila una persona, es «juicio»"));
  it("un principio sin control", () => falla((d) => { delete p0(d).control; }, "falta «control»"));
  it("un principio sin porqué", () => falla((d) => { delete p0(d).porque; }, "falta «porque»"));
  it("un ejemplo con comillas angulares", () => falla((d) => { p0(d).ejemplo_bueno = "Un ejemplo con «comillas» dentro"; }, "sin comillas angulares"));
  it("el mismo ejemplo bueno y malo", () => falla((d) => { p0(d).ejemplo_malo = p0(d).ejemplo_bueno; }, "son el mismo"));
  it("un campo que no existe", () => falla((d) => { p0(d).texto_libre = "x"; }, "campo desconocido «texto_libre»"));
  it("una cita literal de más de 15 palabras", () => {
    const larga = Array.from({ length: 16 }, (_, i) => `palabra${i}`).join(" ");
    falla((d) => { p0(d).nota = `Dice «${larga}» y poco más`; }, "cita literal de 16 palabras");
  });
  it("una cita de 15 palabras pasa", () => {
    const d = clon();
    p0(d).nota = `Dice «${Array.from({ length: 15 }, (_, i) => `palabra${i}`).join(" ")}» y poco más`;
    expect(problemas(d).join("\n")).not.toContain("cita literal");
  });
  it("citasDe ve las tres clases de comillas", () => {
    expect(citasDe("a «uno» b \"dos\" c “tres”")).toEqual(["uno", "tres", "dos"]);
  });
  it("el documento generado cambia si cambia un principio", () => {
    const d = clon();
    p0(d).porque = "Otro porqué distinto, escrito para que el documento cambie";
    expect(generarMd(d)).not.toBe(generarMd(datos));
  });
});
