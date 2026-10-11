// Recursos con dueño y caducidad (#581, normas C5, I2 e I9): ops/recursos.json.
//
// Vigila, en este orden:
//  1. la forma: vocabularios cerrados, fechas válidas, sin campos vacíos, rutas que existen;
//  2. el reloj, solo con fechas de mentira (la fecha de hoy no hace fallar nada; avisa el informe semanal);
//  3. las normas caducidad-*: apuntan a esta fuente y cada una tiene su recurso;
//  4. INVENTARIO.md enlaza la fuente.
// Cada regla se ve fallar con datos de mentira (más abajo).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AVISO_ANTES_DIAS } from "../scripts/lib/skills.mjs";
import { leerRegistro } from "../scripts/lib/normas.mjs";
import {
  DUENOS, ESTADOS, RUTA_RECURSOS, SERVICIOS, TIPOS, caducidadesDelRepo, diasHasta, estadoDeRecurso, leerRecursos, problemasDeConjunto, problemasDeForma, problemasDeReloj,
} from "../scripts/lib/recursos.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const datos = leerRecursos(RAIZ);
const normas = leerRegistro(RAIZ).normas;
const idsNormas = normas.map((n) => n.id);
const HOY = new Date("2026-10-11T10:00:00Z");

const BUENO = () => ({
  id: "prueba-token", servicio: "vercel", tipo: "token", dueno: "pablo", creado: "2026-10-09", caducidad: "2027-01-07",
  motivo: "Token de prueba a 90 días desde el alta.", documentado_en: ["ops/INVENTARIO.md"],
});
const con = (cambio) => { const r = BUENO(); cambio(r); return problemasDeForma(r, { raiz: RAIZ, normas: idsNormas }).join("\n"); };

describe("1. la forma", () => {
  it("el registro de verdad no tiene problemas", () => {
    expect(datos.recursos.flatMap((r) => problemasDeForma(r, { raiz: RAIZ, normas: idsNormas })), `Arregla ${RUTA_RECURSOS}`).toEqual([]);
    expect(problemasDeConjunto(datos.recursos)).toEqual([]);
  });

  it("cubre lo que dice INVENTARIO: más de una entrada, y servicios y tipos que se usan de verdad", () => {
    expect(datos.recursos.length).toBeGreaterThanOrEqual(20);
    // «Ningún valor sin uso»: cada servicio y cada tipo del vocabulario lo usa algún recurso.
    expect([...new Set(datos.recursos.map((r) => r.servicio))].sort()).toEqual(Object.keys(SERVICIOS).sort());
    expect([...new Set(datos.recursos.map((r) => r.tipo))].sort()).toEqual(Object.keys(TIPOS).sort());
    for (const d of datos.recursos.map((r) => r.dueno)) expect(Object.keys(DUENOS)).toContain(d);
  });

  it("repo público: ningún valor, ni dirección de bóveda, ni cadena con pinta de clave", () => {
    const texto = readFileSync(join(RAIZ, RUTA_RECURSOS), "utf8");
    expect(texto).not.toMatch(/op:\/\//);
    expect(texto).not.toMatch(/(?:sk-ant|ghp_|github_pat_|ops_ey|xox[bp]-|AKIA)[A-Za-z0-9_-]{6,}/);
    expect(texto).not.toMatch(/[A-Za-z0-9+/_-]{40,}/);
  });

  it("una entrada buena no da problemas, y cada fallo se ve", () => {
    expect(con(() => {})).toBe("");
    expect(con((r) => { delete r.dueno; })).toContain("falta «dueno»");
    expect(con((r) => { r.extra = 1; })).toContain("campo desconocido");
    expect(con((r) => { r.servicio = "inventado"; })).toContain("servicio «inventado» no está en el vocabulario");
    expect(con((r) => { r.tipo = "otro"; })).toContain("tipo «otro»");
    expect(con((r) => { r.dueno = "manu"; })).toContain("dueno «manu»");
    expect(con((r) => { r.caducidad = "2027-02-30"; })).toContain("«caducidad» es AAAA-MM-DD");
    expect(con((r) => { r.caducidad = "pronto"; })).toContain("«caducidad» es AAAA-MM-DD");
    expect(con((r) => { r.creado = "9/10/2026"; })).toContain("«creado» es AAAA-MM-DD");
    expect(con((r) => { r.caducidad = "2026-10-01"; })).toContain("antes de crearse");
    expect(con((r) => { r.motivo = ""; })).toContain("«motivo» es una frase");
    expect(con((r) => { r.documentado_en = []; })).toContain("«documentado_en» es una lista");
    expect(con((r) => { r.documentado_en = ["ops/no-existe.md"]; })).toContain("no existe");
    expect(con((r) => { r.norma = "norma-inventada"; })).toContain("no está en ops/normas.json");
    expect(con((r) => { r.id = "Mal Id"; })).toContain("el id va en minúsculas");
  });

  it("lo por-confirmar dice quién lo confirma, y confirma no sobra", () => {
    expect(con((r) => { r.caducidad = "por-confirmar"; })).toContain("no dice quién lo confirma");
    expect(con((r) => { r.creado = "por-confirmar"; r.confirma = "pablo"; })).toBe("");
    expect(con((r) => { r.confirma = "pablo"; })).toContain("«confirma» sobra");
    expect(con((r) => { r.dueno = "por-confirmar"; })).toContain("no dice quién lo confirma");
  });

  it("la rotación en curso es un issue y solo con fecha", () => {
    expect(con((r) => { r.rotacion_en_curso = "abc"; })).toContain("número del issue");
    expect(con((r) => { r.caducidad = "sin-caducidad"; r.rotacion_en_curso = 12; })).toContain("solo con fecha");
  });

  it("un id repetido se ve", () => {
    expect(problemasDeConjunto([BUENO(), BUENO()]).join()).toContain("repetido");
  });
});

describe("2. el reloj", () => {
  it("diasHasta cuenta días de calendario", () => {
    expect(diasHasta("2026-10-11", HOY)).toBe(0);
    expect(diasHasta("2026-10-25", HOY)).toBe(14);
    expect(diasHasta("2026-10-10", HOY)).toBe(-1);
  });

  it("el estado sale del vocabulario, con el mismo aviso de 14 días que las skills", () => {
    const e = (caducidad, extra = {}) => estadoDeRecurso({ ...BUENO(), caducidad, ...extra }, HOY).estado;
    expect(AVISO_ANTES_DIAS).toBe(14);
    expect(e("2026-10-10")).toBe("vencida");
    expect(e("2026-10-25")).toBe("proxima");
    expect(e("2026-10-26")).toBe("vigente");
    expect(e("2026-10-10", { rotacion_en_curso: 581 })).toBe("en_rotacion");
    expect(e("sin-caducidad")).toBe("sin_caducidad");
    expect(e("por-confirmar")).toBe("por_confirmar");
    for (const s of ["vencida", "proxima", "en_rotacion", "vigente", "sin_caducidad", "por_confirmar"]) expect(Object.keys(ESTADOS)).toContain(s);
  });

  it("marca como problema una caducidad vencida o a 14 días o menos sin rotación en curso (fechas de prueba)", () => {
    const vencida = { ...BUENO(), caducidad: "2026-10-10" };
    const proxima = { ...BUENO(), caducidad: "2026-10-25" };
    expect(problemasDeReloj([vencida], HOY).join()).toContain("caducó el 2026-10-10");
    expect(problemasDeReloj([proxima], HOY).join()).toContain("caduca el 2026-10-25");
    expect(problemasDeReloj([{ ...BUENO(), caducidad: "2026-10-26" }], HOY)).toEqual([]);
    expect(problemasDeReloj([{ ...vencida, rotacion_en_curso: 581 }, { ...proxima, rotacion_en_curso: 581 }], HOY)).toEqual([]);
    expect(problemasDeReloj([{ ...BUENO(), rotacion_en_curso: 581 }], HOY).join()).toContain("quita la marca");
    expect(problemasDeReloj([{ ...BUENO(), caducidad: "sin-caducidad" }, { ...BUENO(), caducidad: "por-confirmar" }], HOY)).toEqual([]);
  });

  // Decisión B de #581: ningún test compara una caducidad con la fecha de hoy (pondría en rojo todos los PR el día que algo
  // caduque). Solo avisa el informe semanal; aquí la regla se prueba con fechas de mentira.

  it("el informe ve los recursos y las skills próximas a caducar", () => {
    const c = caducidadesDelRepo(RAIZ, new Date("2027-01-01T00:00:00Z"));
    expect(c.recursos.find((r) => r.id === "vercel-token-vigia")).toMatchObject({ estado: "proxima", dias: 6 });
    expect(c.skills.every((s) => s.estado !== "vigente")).toBe(true);
    expect(caducidadesDelRepo(RAIZ, HOY).recursos).toHaveLength(datos.recursos.length);
  });
});

describe("3. las normas de caducidad", () => {
  const delTipo = normas.filter((n) => n.id.startsWith("caducidad-"));

  it("hay normas de caducidad, apuntan a la fuente y cada una tiene su recurso", () => {
    expect(delTipo.map((n) => n.id).sort()).toEqual(["caducidad-clave-anthropic-evals", "caducidad-token-vercel"]);
    for (const n of delTipo) {
      expect(n.donde, n.id).toContain(RUTA_RECURSOS);
      expect(datos.recursos.some((r) => r.norma === n.id), `${n.id} no tiene ningún recurso con «norma»`).toBe(true);
    }
  });

  it("las dos normas son blandas, con el informe semanal como control: no prometen un bloqueo", () => {
    for (const id of ["caducidad-token-vercel", "caducidad-clave-anthropic-evals"]) {
      expect(normas.find((n) => n.id === id), id).toMatchObject({ ejecutor: "script_propio", alcance: "solo_script", ante_fallo: "abierto", control: "scripts/cumplimiento.mjs", control_tipo: "script", veredicto: "blanda" });
    }
    expect(datos.recursos.find((r) => r.id === "anthropic-clave-evals").caducidad).toBe("por-confirmar");
  });

  it("INVENTARIO.md enlaza la fuente", () => {
    expect(readFileSync(join(RAIZ, "ops/INVENTARIO.md"), "utf8")).toContain(RUTA_RECURSOS);
  });
});
