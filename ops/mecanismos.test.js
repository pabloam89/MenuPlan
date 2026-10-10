import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BARRERAS } from "../scripts/lib/fondos.mjs";
import {
  CATALOGO, ESCALONES, ESCALON_DE_EJECUTOR, MECANISMOS_PEDIDOS, masAlto, problemas, rango, veredictoPosible,
} from "../scripts/lib/mecanismos.mjs";
import { EJECUTORES, EJECUTORES_DEL_SISTEMA, leerRegistro, problemasDeDureza } from "../scripts/lib/normas.mjs";

/**
 * El catálogo de mecanismos (#338, fase C de #334). Vigila:
 *
 *  1. la forma y el vocabulario de ops/mecanismos.json;
 *  2. el cruce con el registro de normas: el puente ejecutor → escalón tiene
 *     exactamente los ejecutores de normas.mjs (un ejecutor nuevo no entra sin
 *     escalón), y cada norma del registro cae en un mecanismo del catálogo;
 *  3. que el veredicto que promete cada mecanismo es el que las reglas de
 *     dureza de normas.mjs le dejan dar;
 *  4. que la escalera es la de ops/flujo.json (la misma `barrera` de la ficha);
 *  5. que la skill plan-de-arreglo cite el catálogo y no lo copie.
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const reglas = (lista) => [...new Set(lista.map((x) => x.split(":")[0]))].sort();
const copia = () => JSON.parse(JSON.stringify(CATALOGO));

describe("el catálogo de mecanismos", () => {
  it("no tiene ningún problema", () => {
    expect(problemas(CATALOGO, { existe }), "Corrige ops/mecanismos.json o el puente de scripts/lib/mecanismos.mjs").toEqual([]);
  });

  it("la escalera es la de ops/flujo.json, la misma que la barrera de la ficha del fondo", () => {
    expect(ESCALONES).toEqual(BARRERAS);
  });

  it("el puente cubre exactamente los ejecutores del registro de normas", () => {
    expect(Object.keys(ESCALON_DE_EJECUTOR).sort()).toEqual(Object.keys(EJECUTORES).sort());
  });

  it("los ejecutores del sistema caen en los dos escalones de arriba", () => {
    for (const ej of EJECUTORES_DEL_SISTEMA) expect(ESCALONES.indexOf(ESCALON_DE_EJECUTOR[ej]), ej).toBeLessThanOrEqual(1);
  });

  it("la escalera va de permiso o hook a texto: hook por encima de CI, CI de eval, eval de skill y skill de texto", () => {
    expect(rango("hook")).toBeLessThan(rango("ci"));
    expect(rango("ci")).toBeLessThan(rango("eval"));
    expect(rango("eval")).toBeLessThan(rango("skill"));
    expect(rango("skill")).toBeLessThan(rango("texto"));
    expect(rango("permisos_identidad")).toBeLessThan(rango("ci"));
  });

  it("tiene los mecanismos que pide el plan", () => {
    const ids = CATALOGO.mecanismos.map((m) => m.id);
    for (const id of MECANISMOS_PEDIDOS) expect(ids).toContain(id);
  });

  it("masAlto elige el del escalón más duradero y no se inventa uno", () => {
    expect(masAlto(["texto", "ci", "skill"])).toBe("ci");
    expect(masAlto(["skill", "restriccion_bd"])).toBe("restriccion_bd");
    expect(masAlto(["inventado"])).toBeNull();
  });
});

describe("cruce con el registro de normas (ops/normas.json)", () => {
  const registro = leerRegistro(RAIZ);

  it("cada norma cae en un ejecutor con mecanismo o declarado sin él", () => {
    const sin = Object.keys(CATALOGO.ejecutores_sin_mecanismo);
    const conMec = new Set(CATALOGO.mecanismos.map((m) => m.ejecutor));
    const huerfanas = registro.normas.filter((n) => !conMec.has(n.ejecutor) && !sin.includes(n.ejecutor)).map((n) => n.id);
    expect(huerfanas).toEqual([]);
  });

  it("ninguna norma es más dura de lo que su ejecutor y su alcance permiten según el catálogo", () => {
    const orden = ["dura", "semidura", "blanda", "rota"];
    const demasiado = registro.normas
      .filter((n) => n.veredicto !== "rota" && orden.indexOf(n.veredicto) < orden.indexOf(veredictoPosible(n.ejecutor, n.alcance)))
      .map((n) => n.id);
    expect(demasiado).toEqual([]);
  });

  it("veredictoPosible dice lo mismo que las reglas de dureza de normas.mjs", () => {
    // Una norma de mentira «dura» con cada ejecutor y alcance: si normas.mjs la acepta, el catálogo tiene que decir «dura».
    const planos = JSON.parse(readFileSync(join(RAIZ, "ops/planos.json"), "utf8"));
    for (const ejecutor of Object.keys(EJECUTORES)) {
      for (const alcance of ["todos", "solo_claude", "solo_script", "nadie"]) {
        const n = { id: "x", ejecutor, alcance, ante_fallo: "cerrado", test: "ops/mecanismos.test.js", veredicto: "dura", riesgo: "bajo", issue: null, test_fallo: { ruta: "ops/mecanismos.test.js", caso: "test_fallo" } };
        const aceptaDura = problemasDeDureza(n, { raiz: RAIZ, planos }).length === 0;
        expect(veredictoPosible(ejecutor, alcance) === "dura", `${ejecutor}/${alcance}`).toBe(aceptaDura);
      }
    }
  });
});

describe("la skill plan-de-arreglo cita el catálogo y no lo copia", () => {
  const ruta = join(RAIZ, ".claude/skills/plan-de-arreglo/SKILL.md");
  const skill = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";

  it("nombra el catálogo y el comando", () => {
    expect(skill).toContain("ops/mecanismos.json");
    expect(skill).toContain("npm run mecanismos");
  });

  it("no copia los «cuándo» ni los «cuesta» del catálogo", () => {
    const textos = CATALOGO.mecanismos.flatMap((m) => [m.cuando, m.cuesta]);
    expect(textos.filter((t) => skill.includes(t)), "Viven en ops/mecanismos.json: cítalo").toEqual([]);
  });
});

describe("autotest: cada regla falla con datos malos", () => {
  const casos = [
    ["escalón que no existe", (c) => { c.mecanismos[0].escalon = "muro"; }, ["escalon"]],
    ["ejecutor que no está en el registro", (c) => { c.mecanismos.find((m) => m.id === "script").ejecutor = "magia"; }, ["ejecutor"]],
    ["escalón distinto del de su ejecutor", (c) => { c.mecanismos.find((m) => m.id === "hook").escalon = "test_ci"; }, ["escalon-distinto"]],
    ["veredicto que su ejecutor no puede dar", (c) => { c.mecanismos.find((m) => m.id === "hook").veredicto_max = "dura"; }, ["veredicto-distinto"]],
    ["alcance fuera de vocabulario", (c) => { c.mecanismos.find((m) => m.id === "texto").alcance = "medio"; }, ["alcance"]],
    ["falta un mecanismo pedido", (c) => { c.mecanismos = c.mecanismos.filter((m) => m.id !== "entorno_aprobador"); }, ["falta-mecanismo"]],
    ["escalón sin mecanismos", (c) => { c.mecanismos = c.mecanismos.filter((m) => m.escalon !== "texto"); c.mecanismos.push({ ...CATALOGO.mecanismos.find((m) => m.id === "skill"), id: "texto" }); }, ["ejecutor-sin-mecanismo", "escalon-vacio"]],
    ["ejecutor sin mecanismo ni porqué", (c) => { c.mecanismos = c.mecanismos.filter((m) => m.id !== "comprobacion_en_codigo"); }, ["ejecutor-sin-mecanismo"]],
    ["sin mecanismo sin decir por qué", (c) => { c.ejecutores_sin_mecanismo = {}; }, ["ejecutor-sin-mecanismo"]],
    ["ejemplo que no existe", (c) => { c.mecanismos[0].ejemplo = "ops/no-existe.json"; }, ["ejemplo"]],
    ["campo desconocido", (c) => { c.mecanismos[0].precio = 3; }, ["forma"]],
  ];
  it.each(casos)("%s", (_n, romper, esperadas) => {
    const c = copia();
    romper(c);
    expect(reglas(problemas(c, { existe }))).toEqual(esperadas);
  });
});
