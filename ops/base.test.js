import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVENTOS } from "../.claude/hooks/eventos.mjs";
import { PASOS, PASO_FORJA, PASO_PIEZA, leerForja } from "../scripts/lib/forja.mjs";
import { METAS, METAS_NUEVAS, PERSONAS_BASE, TIPOS_DE_TEXTO, problemasDeBase, relajaLaBase } from "../scripts/lib/forjaBase.mjs";
import { conceptosDe, leerPrecedencia } from "../scripts/lib/precedencia.mjs";
import { nombresDeSkills, parsearSkill } from "../scripts/lib/skills.mjs";

/**
 * La base común de toda forja (#652, docs/ops/BASE-FORJA.md §3 y §7.3, fase F2): sus pasos con nombre
 * (base, forja, plantilla, pieza; sustituyen al «nivel» 0/1/2), la redacción por tipo de texto,
 * las seis metas y la obligación de fuente de industria. Los datos viven en `base` de `ops/forja/`.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerForja(RAIZ);
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const estandares = JSON.parse(leer("ops/estandares-agentes.json"));
const ctx = { conceptos: conceptosDe(leerPrecedencia(RAIZ)), fuentes: Object.keys(estandares.fuentes), eventos: EVENTOS };
const clon = () => structuredClone(datos.base);
const mal = (cambia, trozo) => {
  const b = clon();
  cambia(b);
  const faltas = problemasDeBase(b, ctx);
  expect(faltas.join("\n"), `se esperaba una falta con «${trozo}»`).toContain(trozo);
};

describe("la base de ops/forja/", () => {
  it("la base real no tiene faltas", () => {
    expect(problemasDeBase(datos.base, ctx)).toEqual([]);
  });

  it("las constantes de JS son el espejo de los ficheros (vocabulario cerrado)", () => {
    expect(Object.keys(datos.base.pasos)).toEqual(PASOS);
    expect(Object.keys(datos.base.redaccion)).toEqual(TIPOS_DE_TEXTO);
    expect(Object.keys(datos.base.metas)).toEqual(METAS);
    expect(PASOS).toContain(PASO_FORJA);
    expect(PASOS).toContain(PASO_PIEZA);
  });

  it("los pasos se heredan de arriba abajo: la base de nada y cada uno del anterior", () => {
    PASOS.forEach((p, i) => expect(datos.base.pasos[p].hereda, p).toBe(i === 0 ? null : PASOS[i - 1]));
    mal((b) => { b.pasos.pieza.hereda = "forja"; }, "base.pasos.pieza: hereda de «forja»");
    mal((b) => { b.pasos.base.hereda = "pieza"; }, "base.pasos.base: hereda de «pieza»");
    mal((b) => { delete b.pasos.plantilla; }, "base.pasos: tiene que traer");
  });

  it("cada tipo de texto fija voz, modo, tiempo, persona y sintaxis con vocabulario cerrado", () => {
    mal((b) => { b.redaccion.norma.voz = "pasiva"; }, "base.redaccion.norma: voz «pasiva»");
    mal((b) => { b.redaccion.skill.modo_tiempo = "futuro"; }, "base.redaccion.skill: modo_tiempo «futuro»");
    mal((b) => { b.redaccion.practica.persona = ["cuarta"]; }, "base.redaccion.practica: persona");
    mal((b) => { b.redaccion.principio.sintaxis = ""; }, "base.redaccion.principio: falta su sintaxis");
    mal((b) => { delete b.redaccion.respuesta; }, "base.redaccion: tiene que traer");
    expect(PERSONAS_BASE).toContain("primera");
  });

  it("las seis metas llevan al menos una fuente [F] (o una del catálogo de estándares) y no se copia el texto de precedencia", () => {
    mal((b) => { b.metas.cost.fuentes = []; }, "base.metas.cost: necesita al menos 1 fuente");
    mal((b) => { b.metas["agent-ux"].fuentes = ["[I] docs/ops/BASE-FORJA.md"]; }, "ni es «[F] https://…»");
    mal((b) => { b.metas.security.label = "seguridad"; }, "su texto vive en precedencia.concepts");
    mal((b) => { delete b.metas["human-intervention"].what; }, "es nueva y trae su label y su what");
    mal((b) => { b.fuente.minimo = 0; }, "base.fuente.minimo");
    expect(METAS_NUEVAS.every((m) => !ctx.conceptos.includes(m))).toBe(true);
    expect(ctx.conceptos.every((c) => METAS.includes(c))).toBe(true);
  });

  it("la meta de intervención humana se mide con el evento que ya existe", () => {
    expect(EVENTOS).toContain(datos.base.metas["human-intervention"].medida.evento);
    mal((b) => { b.metas["human-intervention"].medida.evento = "inventado"; }, "no existe en EVENTOS");
  });

  it("la herencia solo endurece: la forma de una práctica de la forja no relaja la de la base", () => {
    expect(relajaLaBase(datos.forma_practica.estandar, datos.base.redaccion.practica)).toEqual([]);
    expect(relajaLaBase({ ...datos.forma_practica.estandar, persona: "tercera" }, datos.base.redaccion.practica).join()).toContain("persona «tercera»");
    expect(relajaLaBase({ ...datos.forma_practica.estandar, modo_tiempo: "presente" }, datos.base.redaccion.practica).join()).toContain("modo_tiempo «presente»");
  });

  it("el `nivel` 0/1/2 ya no se lee: ninguna skill lo lleva en su ficha y todas dicen un paso válido", () => {
    for (const s of nombresDeSkills(RAIZ)) {
      const m = parsearSkill(leer(`.claude/skills/${s}/SKILL.md`)).meta.metadata;
      expect(m.nivel, `${s} aún lleva nivel`).toBeUndefined();
      if (m.paso !== undefined) expect([PASO_FORJA, PASO_PIEZA], s).toContain(m.paso);
    }
    expect(Object.keys(datos.base.pasos)).not.toContain("nivel");
    expect(datos.campos_ficha.skill.campos.nivel).toBeUndefined();
    expect(datos.campos_ficha.skill.campos.paso.vocab).toBe("pasos");
  });

  it("FORJA.md (generado) enseña los pasos y la base", () => {
    const md = leer("docs/ops/FORJA.md");
    for (const p of PASOS) expect(md).toContain(`| ${p} |`);
    for (const t of TIPOS_DE_TEXTO) expect(md).toContain(`| ${t} |`);
    expect(md).toContain("Metas (cada una con al menos una fuente de marca F)");
  });
});
