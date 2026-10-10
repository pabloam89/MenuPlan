import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ESCALERA, ESCALONES, ESCALONES_AUTOMATICOS, ETIQUETA_SIN_ESCALON, ETIQUETAS_DE_ESCALERA, ORDEN_VEREDICTO, VEREDICTOS,
  copiasDeEscalas, etiquetaDeEscalon, masDebil,
} from "../scripts/lib/escalas.mjs";
import { ESCALONES_AUTOMATICOS as AUTOMATICOS_DE_ISSUES, GRUPOS } from "../scripts/lib/issues.mjs";
import { BARRERAS, VERIFICACION_POR_BARRERA, arregloDeBarrera } from "../scripts/lib/fondos.mjs";
import { CATALOGO, ESCALONES as ESCALONES_DE_MECANISMOS, ESCALON_DE_EJECUTOR } from "../scripts/lib/mecanismos.mjs";
import { leerRegistro } from "../scripts/lib/normas.mjs";

/**
 * Una sola escala de veredicto y una sola escalera (#515, fondo #488). Antes eran cuatro vocabularios con
 * nombres distintos para la escalera (`escalera` de flujo.json, la etiqueta `arreglo:`, el `escalon` de
 * mecanismos y la `barrera` de la ficha del fondo) y tres nombres para la escala (`dureza`, `veredicto`,
 * `veredicto_max`). Este test falla si:
 *  1. alguien vuelve a declarar la escala o la escalera a mano en otro fichero;
 *  2. un lector (normas, mecanismos, ficha del fondo, etiquetas) se sale de ellas;
 *  3. el campo de la escala vuelve a tener otro nombre.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const json = (ruta) => JSON.parse(leer(ruta));

describe("la escala de veredicto", () => {
  it("va de dura a rota, y una cadena vale lo que su eslabón más flojo", () => {
    expect(ORDEN_VEREDICTO).toEqual(["dura", "semidura", "blanda", "rota"]);
    expect(masDebil(["dura", "blanda", "semidura"])).toBe("blanda");
    expect(masDebil(["dura", "rota"])).toBe("rota");
    expect(masDebil([])).toBeNull();
    for (const t of Object.values(VEREDICTOS)) expect(t.length).toBeGreaterThan(10);
  });

  it("las normas, los mecanismos y las obligaciones usan solo estos valores, con el campo «veredicto»", () => {
    for (const n of leerRegistro(RAIZ).normas) expect(VEREDICTOS, n.id).toHaveProperty(n.veredicto);
    for (const m of CATALOGO.mecanismos) {
      expect(VEREDICTOS, m.id).toHaveProperty(m.veredicto);
      expect(m, `${m.id} usa el nombre viejo «veredicto_max»`).not.toHaveProperty("veredicto_max");
    }
    for (const p of json("ops/flujo.json").pasos) {
      for (const o of p.obligaciones) {
        expect(o, `${o.id} usa el nombre viejo «dureza»`).not.toHaveProperty("dureza");
        if (!o.norma) expect(VEREDICTOS, o.id).toHaveProperty(o.veredicto);
      }
    }
  });
});

describe("la escalera de durabilidad", () => {
  it("va del bloqueo al texto, sin repetir escalón ni etiqueta", () => {
    expect(ESCALONES).toEqual(["bloqueo", "test_ci", "script", "skill", "texto"]);
    expect(new Set(ESCALONES).size).toBe(ESCALONES.length);
    expect(new Set(ETIQUETAS_DE_ESCALERA).size).toBe(ESCALERA.length);
    for (const e of ESCALERA) expect(e.que.length, e.id).toBeGreaterThan(10);
  });

  it("los lectores leen de ella: mecanismos, ficha del fondo, issues y los verificadores", () => {
    expect(ESCALONES_DE_MECANISMOS).toBe(ESCALONES);
    expect(BARRERAS).toBe(ESCALONES);
    expect(AUTOMATICOS_DE_ISSUES).toBe(ESCALONES_AUTOMATICOS);
    expect(Object.keys(VERIFICACION_POR_BARRERA)).toEqual(ESCALONES);
    for (const m of CATALOGO.mecanismos) expect(ESCALONES, m.id).toContain(m.escalon);
    for (const e of Object.values(ESCALON_DE_EJECUTOR)) if (e !== null) expect(ESCALONES).toContain(e);
  });

  it("los escalones automáticos son los de arriba", () => {
    expect(ESCALONES_AUTOMATICOS).toEqual(ESCALONES.slice(0, ESCALONES_AUTOMATICOS.length));
    expect(ESCALONES_AUTOMATICOS.length).toBeGreaterThan(0);
  });

  it("cada escalón tiene su etiqueta `arreglo:` de GitHub, y la etiqueta sin escalón es «ninguno»", () => {
    const etiquetas = Object.keys(GRUPOS.arreglo.valores);
    expect([...etiquetas].sort()).toEqual([...ETIQUETAS_DE_ESCALERA, ETIQUETA_SIN_ESCALON].sort());
    for (const b of ESCALONES) {
      expect(etiquetas, b).toContain(etiquetaDeEscalon(b));
      expect(arregloDeBarrera(b), b).toBe(etiquetaDeEscalon(b));
    }
    expect(etiquetaDeEscalon("inventado")).toBeNull();
  });

  it("flujo.json ya no guarda la escalera", () => expect(json("ops/flujo.json")).not.toHaveProperty("escalera"));
});

describe("la escala y la escalera no se escriben a mano en otro sitio", () => {
  // Lo que nombra los escalones pero no los declara, y un test lo coteja: el formulario del fondo los lista para quien lo
  // rellena; `VERIFICACION_POR_BARRERA` y `ESCALON_DE_EJECUTOR` son tablas CON clave por escalón (arriba se comprueba que
  // sus claves y valores son los de la escalera).
  const COTEJADAS = {
    ".github/ISSUE_TEMPLATE/2-fondo.yml": "scripts/fondos.test.js",
    "scripts/lib/fondos.mjs": "scripts/fondos-ronda2.test.js",
    "scripts/lib/mecanismos.mjs": "ops/mecanismos.test.js",
  };
  const EXENTOS = ["scripts/lib/escalas.mjs", "ops/escalas.test.js"];
  const ficheros = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0").filter((f) => /\.(mjs|js|jsx|json|yml|yaml)$/.test(f) && !EXENTOS.includes(f) && existsSync(join(RAIZ, f)));

  it("hay ficheros que mirar", () => expect(ficheros.length).toBeGreaterThan(100));

  it("ningún fichero de código o de datos declara la escala ni la escalera", () => {
    const copias = ficheros.filter((f) => !(f in COTEJADAS)).map((f) => [f, copiasDeEscalas(leer(f))]).filter(([, c]) => c.length)
      .map(([f, c]) => `${f}: ${c.join(" y ")}`);
    expect(copias, "Importa la escala o la escalera de scripts/lib/escalas.mjs en vez de escribirlas").toEqual([]);
  });

  it("la copia que sí hay está cotejada: su lista es la escalera y su test existe", () => {
    for (const [f, test] of Object.entries(COTEJADAS)) {
      expect(existsSync(join(RAIZ, test)), `${f}: su test ${test} no existe`).toBe(true);
    }
    expect(leer(".github/ISSUE_TEMPLATE/2-fondo.yml")).toContain(`barrera: ${ESCALONES.join(", ")}`);
  });

  it("la skill issues lista los escalones de la barrera como la escalera", () => {
    expect(leer(".claude/skills/issues/SKILL.md")).toContain(ESCALONES.map((e) => `\`${e}\``).join(", "));
  });

  it("el detector ve una escala o una escalera escrita a mano, en lista o en objeto", () => {
    expect(copiasDeEscalas('export const ORDEN = ["dura", "semidura", "blanda", "rota"];')).toEqual(["escala"]);
    expect(copiasDeEscalas("const V = { dura: 1, semidura: 2, blanda: 3, rota: 4 };")).toEqual(["escala"]);
    expect(copiasDeEscalas('{ "dura": "Ejecutor del sistema", "semidura": "Tiene ejecutor", "blanda": "Solo texto" }')).toEqual(["escala"]);
    expect(copiasDeEscalas('const E = ["bloqueo", "test_ci", "script", "skill", "texto"];')).toEqual(["escalera"]);
    expect(copiasDeEscalas("const E = { bloqueo: 1, test_ci: 2, script: 3 };")).toEqual(["escalera"]);
  });

  it("el detector no se queja de un valor suelto ni de ids que no están juntos", () => {
    expect(copiasDeEscalas('{ "veredicto": "dura", "riesgo": "alto" }')).toEqual([]);
    expect(copiasDeEscalas('{ "escalon": "bloqueo", "ejecutor": "guardia" }')).toEqual([]);
  });
});
