/**
 * Salud de las skills (#341), sin gastar nada: junta lo que ya miden la higiene
 * (`higieneSkills.mjs`), la caducidad (`skills.mjs`) y la última pasada de pago
 * guardada en `ops/skills-prueba/` (nivel 2). NO llama a ningún modelo: el
 * nivel 2 de pago lo lanza una persona con `npm run skills-prueba`.
 *
 * Mismo formato de línea que los indicadores del flujo (cumplimiento.mjs):
 *   indicador: <id> valor: <n> umbral: <m> estado: ok|dispara|sin_datos [en: <skills>]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { hashLF } from "./evals.mjs";
import { cargarSkill, caducidades, DIR_SKILLS, RAIZ, nombresDeSkills } from "./skills.mjs";
import { ctxHigiene, higieneDeSkill, solapeMaximo } from "./higieneSkills.mjs";

export const INDICADORES_SKILLS = {
  skills_con_faltas: { umbral: 0, que: "skills con alguna falta de higiene (lo que el nivel 1 negaría sin su lista de excepciones, o una fecha caducada)" },
  skills_caducadas: { umbral: 0, que: "skills cuyo «comprobado» pasó de 90 días o falta" },
  skills_medida_desactualizada: { umbral: 0, que: "skills con una pasada de nivel 2 guardada hecha con un SKILL.md o casos.json distintos de los actuales (hay que volver a medir, con tokens)" },
};

/** Lo guardado por la última pasada de pago de una skill, o null. */
export function pasadaGuardada(nombre, raiz = RAIZ) {
  const ruta = join(raiz, "ops/skills-prueba", `${nombre}.json`);
  if (!existsSync(ruta)) return null;
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return null; // a propósito: una pasada ilegible cuenta como «sin pasada», no rompe el informe
  }
}

/**
 * Si una pasada guardada se hizo con el SKILL.md y el casos.json de hoy (los hashes de `version`). Una pasada
 * desactualizada no vale como evidencia (#457): mide otra skill.
 */
export function pasadaDesactualizada(pasada, nombre, raiz = RAIZ) {
  const skill = existsSync(join(raiz, DIR_SKILLS, nombre, "SKILL.md")) ? readFileSync(join(raiz, DIR_SKILLS, nombre, "SKILL.md"), "utf8") : "";
  const casos = existsSync(join(raiz, DIR_SKILLS, nombre, "casos.json")) ? readFileSync(join(raiz, DIR_SKILLS, nombre, "casos.json"), "utf8") : "";
  return pasada?.version?.skill_md !== hashLF(skill) || pasada?.version?.casos_json !== hashLF(casos);
}

/** La pasada guardada de una skill si está vigente (hecha con sus ficheros de hoy); si no, null. */
export function pasadaVigente(nombre, raiz = RAIZ) {
  const p = pasadaGuardada(nombre, raiz);
  return p && !pasadaDesactualizada(p, nombre, raiz) ? p : null;
}

/** → { filas:[{nombre, faltas, avisos, caducidad, dias, pasada}], indicadores:[{indicador, valor, umbral, estado, en}] } */
export function saludDeSkills(raiz = RAIZ, hoy = new Date()) {
  const nombres = nombresDeSkills(raiz);
  const cad = new Map(caducidades(raiz, hoy).map((c) => [c.nombre, c]));
  const filas = nombres.map((nombre) => {
    const skill = cargarSkill(nombre, raiz);
    const defectos = higieneDeSkill(skill, ctxHigiene(nombre, raiz, hoy));
    const g = (x) => defectos.filter((d) => d.gravedad === x).length;
    const p = pasadaGuardada(nombre, raiz);
    return {
      nombre,
      faltas: g("falta"),
      avisos: g("aviso"),
      solape: solapeMaximo(skill, ctxHigiene(nombre, raiz, hoy).catalogo).solape,
      caducidad: cad.get(nombre)?.estado ?? "sin_fecha",
      dias: cad.get(nombre)?.dias ?? null,
      pasada: p && {
        fecha: String(p.fecha_utc ?? "").slice(0, 10),
        resultado: p.resultado,
        disparo: `${p.resumen?.disparo_ok}/${p.resumen?.disparo_total}`,
        comprobaciones: `${p.resumen?.comprobaciones_ok}/${p.resumen?.comprobaciones_total}`,
        desactualizada: pasadaDesactualizada(p, nombre, raiz),
      },
    };
  });
  const lista = (f) => filas.filter(f).map((x) => x.nombre);
  const ind = (indicador, en) => ({ indicador, valor: en.length, umbral: INDICADORES_SKILLS[indicador].umbral, estado: en.length > INDICADORES_SKILLS[indicador].umbral ? "dispara" : "ok", en });
  return {
    filas,
    indicadores: [
      ind("skills_con_faltas", lista((x) => x.faltas > 0)),
      ind("skills_caducadas", lista((x) => x.caducidad === "caducada" || x.caducidad === "sin_fecha")),
      ind("skills_medida_desactualizada", lista((x) => x.pasada?.desactualizada)),
    ],
  };
}

export function lineaDeIndicadorSkill(m) {
  const en = m.estado === "dispara" && m.en.length ? ` en: ${m.en.join(",")}` : "";
  return `indicador: ${m.indicador} valor: ${m.valor} umbral: ${m.umbral} estado: ${m.estado}${en}`;
}
