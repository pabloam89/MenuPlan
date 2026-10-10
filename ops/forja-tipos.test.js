import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTEFACTOS, CLASES_CAMPO, NUM_TIPOS_SKILL, RUTA_CAMPOS, tiposRetiradosEnCriterios,
  anclarCampos, cifrasDeCampos, cifrasPorTipo, criteriosDeTipo, generarMd, leerCamposGuardados, leerForja,
  problemasDeCampos, problemasDeCamposContraReferencia, problemasDeDeclaracion, problemasDeForja, problemasDeTaxonomia, problemasDeTrinqueteCampos, tipoDeSkill,
  vocabulariosDeCriterio,
} from "../scripts/lib/forja.mjs";
import { leerJuicios, vocabulariosDeJuicio } from "../scripts/lib/juiciosSkills.mjs";
import { REFERENCIA, jsonEnReferenciaAvisando } from "../scripts/lib/forjaReferencia.mjs";
import { ORIGENES } from "../scripts/lib/estandaresAgentes.mjs";
import { nombresDeSkills, parsearSkill } from "../scripts/lib/skills.mjs";

/**
 * Tipos de skill (decisión de Pablo, 10 oct 2026) y campos discretos frente a huecos de texto (#458).
 * Falla cuando: a una skill le faltan respuestas, el tipo derivado no coincide con la tabla de Pablo o con
 * su frontmatter, un tipo retirado vuelve o no dice a cuál pasa, no hay exactamente una pieza meta (nivel 0), un texto no es hueco, un enum se sale del vocabulario,
 * una ref no existe o un campo vuelve de discreto a texto.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const datos = leerForja(RAIZ);
const clon = () => structuredClone(datos);
const md = leer("docs/ops/FORJA.md");

const todas = nombresDeSkills(RAIZ);
const metaDe = (s) => parsearSkill(leer(`.claude/skills/${s}/SKILL.md`)).meta;
/** La ficha (metadata del frontmatter) de cada skill: ahí declara sus respuestas y su tipo (#495). */
const fichaDe = Object.fromEntries(todas.map((s) => [s, metaDe(s).metadata]));
const nivelDe = Object.fromEntries(todas.map((s) => [s, fichaDe[s].nivel ?? "2"]));
/** Las skills de nivel 2 (con tipo); la pieza meta (nivel 0) va aparte. */
const skills = todas.filter((s) => nivelDe[s] !== "0");
const ctxTaxonomia = { skills: todas, fichaDe };
/** Un contexto con la ficha de una skill cambiada. */
const conFicha = (s, cambia) => ({ ...ctxTaxonomia, fichaDe: { ...fichaDe, [s]: cambia(structuredClone(fichaDe[s])) } });

/** La tabla de Pablo, escrita aparte del JSON: lo que el JSON deriva tiene que coincidir con ella. */
const TABLA_PABLO = {
  servicio: ["github", "vercel", "supabase", "telegram", "hetzner", "tailscale", "1password"],
  procedimiento: ["alta-de-secreto"],
  diagnostico: ["causa-raiz"],
  decision: ["plan-de-arreglo"],
  flujo: ["issues"],
  revision: ["higiene-de-skills"],
  conocimiento: [],
};
const PREGUNTAS_PABLO = ["opera_proveedor", "juzga_artefacto", "encadena", "pasos_fijos", "sintoma_a_causa", "elige_opciones"];
const TIPOS_PABLO = ["servicio", "revision", "flujo", "procedimiento", "diagnostico", "decision"];

describe("tipoDeSkill", () => {
  const sin = Object.fromEntries(PREGUNTAS_PABLO.map((k) => [k, false]));
  it("las preguntas van en el orden de Pablo y cada una da su tipo", () => {
    expect(datos.preguntas_tipo.map((p) => p.clave)).toEqual(PREGUNTAS_PABLO);
    expect(datos.preguntas_tipo.map((p) => p.tipo)).toEqual(TIPOS_PABLO);
    expect(datos.tipos_skill.map((t) => t.id).sort()).toEqual([...TIPOS_PABLO, "conocimiento"].sort());
  });
  it("devuelve el tipo de la primera pregunta con true", () => {
    for (const p of datos.preguntas_tipo) expect(tipoDeSkill({ ...sin, [p.clave]: true }), p.clave).toBe(p.tipo);
    expect(tipoDeSkill({ ...sin, encadena: true, pasos_fijos: true, elige_opciones: true })).toBe("flujo");
    expect(tipoDeSkill({ ...sin, opera_proveedor: true, juzga_artefacto: true })).toBe("servicio");
    expect(tipoDeSkill({ ...sin, elige_opciones: true, sintoma_a_causa: true })).toBe("diagnostico");
  });
  it("sin ningún true, conocimiento", () => {
    expect(tipoDeSkill(sin)).toBe("conocimiento");
    expect(tipoDeSkill({})).toBe("conocimiento");
    expect(tipoDeSkill(undefined)).toBe("conocimiento");
  });
  it("solo un true cuenta: 1 o «sí» no son true", () => {
    expect(tipoDeSkill({ ...sin, opera_proveedor: 1, encadena: "sí" })).toBe("conocimiento");
  });
  it("sigue el orden del JSON y no uno escrito en el código", () => {
    const alReves = [...datos.preguntas_tipo].reverse();
    expect(tipoDeSkill({ ...sin, opera_proveedor: true, elige_opciones: true }, alReves)).toBe("decision");
  });
});

describe("la taxonomía de tipos y la ficha de cada skill", () => {
  it("ops/forja.json y las fichas cumplen la taxonomía", () => {
    expect(problemasDeTaxonomia(datos, ctxTaxonomia), "Corrige tipos_skill o destino_tipos_actuales en ops/forja.json, o las respuestas y el tipo en el frontmatter de la skill").toEqual([]);
  });
  it("el tipo que dan las respuestas de cada ficha es el de la tabla de Pablo, y el que dice su frontmatter", () => {
    const deTabla = Object.fromEntries(Object.entries(TABLA_PABLO).flatMap(([t, ss]) => ss.map((s) => [s, t])));
    for (const s of skills) {
      const esperado = deTabla[s] ?? "conocimiento";
      expect(tipoDeSkill(fichaDe[s]), s).toBe(esperado);
      expect(fichaDe[s].tipo, s).toBe(esperado);
    }
    for (const [t, ss] of Object.entries(TABLA_PABLO)) expect(datos.tipos_skill.find((x) => x.id === t).skills_hoy, t).toEqual(ss);
  });
  it("cada skill de nivel 2 responde las seis preguntas en su ficha, son siete tipos y la base no guarda respuestas", () => {
    expect(NUM_TIPOS_SKILL).toBe(7);
    expect(datos.tipos_skill).toHaveLength(NUM_TIPOS_SKILL);
    for (const s of skills) for (const k of PREGUNTAS_PABLO) expect(typeof fichaDe[s][k], `${s}.${k}`).toBe("boolean");
    expect("respuestas_tipo" in datos).toBe(false);
    expect("migracion_tipos" in datos).toBe(false);
    expect(Object.keys(datos.skills_provisionales)).toEqual(["estilo-de-respuesta", "issues"]);
  });
  it("forja-de-skills es la pieza meta (nivel 0): sin tipo ni respuestas; issues es provisional; las que no son evidentes dicen por qué", () => {
    expect(todas.filter((s) => nivelDe[s] === "0")).toEqual(["forja-de-skills"]);
    for (const k of ["tipo", ...PREGUNTAS_PABLO]) expect(fichaDe["forja-de-skills"][k], k).toBeUndefined();
    expect(datos.nivel_0.skills.secciones.at(-1)).toBe("Fuentes y comprobación");
    expect(datos.skills_provisionales.issues).toMatchObject({ en_tabla: true });
    expect(datos.skills_provisionales["estilo-de-respuesta"]).toMatchObject({ en_tabla: false });
    expect(datos.tipos_skill.find((t) => t.id === "flujo").skills_hoy).toEqual(["issues"]);
    expect(fichaDe["alta-de-secreto"].opera_proveedor).toBe(false);
    expect(fichaDe["alta-de-secreto"].porque_tipo).toContain("opera_proveedor es false");
    expect(fichaDe.issues.porque_tipo).toContain("#414");
  });
  it("cada tipo lleva sus secciones en la forja", () => {
    for (const t of datos.tipos_skill) expect(t.secciones.at(-1), t.id).toBe("Fuentes y comprobación");
  });
  it("ninguna skill está en un tipo retirado, y forja se retiró sin sucesor", () => {
    for (const s of skills) expect(Object.keys(datos.destino_tipos_actuales), s).not.toContain(fichaDe[s].tipo);
    expect(datos.destino_tipos_actuales.forja.destinos).toEqual([]);
  });
  it("los criterios que aún nombran un tipo retirado solo bajan (este literal no se edita para añadir)", () => {
    const DE_PARTIDA = [];
    expect(tiposRetiradosEnCriterios(datos).filter((x) => !DE_PARTIDA.includes(x)), "Un criterio no puede nombrar un tipo retirado").toEqual([]);
    const d = clon();
    d.criterios.find((c) => c.id === "secciones").tipos = ["oficio"];
    expect(tiposRetiradosEnCriterios(d)).toContain("secciones: oficio");
  });
  const mal = (mut, trozo, ctx = ctxTaxonomia) => {
    const d = clon();
    mut(d);
    expect(problemasDeTaxonomia(d, ctx).join("\n"), trozo).toContain(trozo);
  };
  it("falla si a una ficha le faltan respuestas o no son true o false", () => {
    mal(() => {}, "github: su ficha no responde «encadena»", conFicha("github", (f) => { delete f.encadena; return f; }));
    mal(() => {}, "github: su ficha no responde «encadena»", conFicha("github", (f) => ({ ...f, encadena: "no" })));
  });
  it("falla si el tipo de la ficha no es el que dan sus respuestas, o si las skills_hoy no cuadran", () => {
    mal(() => {}, "github: su metadata.tipo es «servicio» y sus respuestas dan «conocimiento»", conFicha("github", (f) => ({ ...f, opera_proveedor: false })));
    mal(() => {}, "su metadata.tipo es «revision» y sus respuestas dan «servicio»", conFicha("github", (f) => ({ ...f, tipo: "revision" })));
    mal((d) => { d.tipos_skill.find((t) => t.id === "servicio").skills_hoy.pop(); }, "tipo servicio: skills_hoy");
  });
  it("falla si vuelven a la base las respuestas o la migración", () => {
    mal((d) => { d.respuestas_tipo = {}; }, "respuestas_tipo: las respuestas y el tipo de cada skill van en su ficha");
    mal((d) => { d.migracion_tipos = {}; }, "migracion_tipos: las respuestas y el tipo de cada skill van en su ficha");
    mal((d) => { delete d.tipos_skill[0].secciones; }, "falta «secciones»");
  });
  it("falla si un tipo retirado vuelve, no dice a cuál pasa o lo usa una skill", () => {
    mal((d) => { d.destino_tipos_actuales.meta.destinos = ["inventado"]; }, "el destino «inventado» no está en tipos_skill");
    mal((d) => { delete d.destino_tipos_actuales.meta.destinos; }, "destinos es una lista");
    mal((d) => { d.destino_tipos_actuales.servicio = { destinos: ["flujo"], nota: "Un tipo vigente no se retira así" }; }, "vuelve a estar en tipos_skill");
    mal((d) => { d.destino_tipos_actuales.forja.nota = "corta"; }, "el destino lleva su nota");
    mal(() => {}, "su metadata.tipo «herramienta» es un tipo retirado", conFicha("github", (f) => ({ ...f, tipo: "herramienta" })));
  });
  it("falla si no hay exactamente una pieza meta, si lleva tipo o respuestas, o si su forma o los niveles no están", () => {
    mal(() => {}, "hay 0 piezas meta", conFicha("forja-de-skills", (f) => ({ ...f, nivel: "2" })));
    mal(() => {}, "hay 2 piezas meta", conFicha("github", (f) => ({ ...f, nivel: "0" })));
    mal(() => {}, "es la pieza meta (nivel 0) y no lleva tipo", conFicha("forja-de-skills", (f) => ({ ...f, tipo: "revision" })));
    mal(() => {}, "es la pieza meta (nivel 0) y no responde «encadena»", conFicha("forja-de-skills", (f) => ({ ...f, encadena: false })));
    mal((d) => { delete d.nivel_0; }, "nivel_0.skills.secciones");
    mal((d) => { delete d.niveles["1"]; }, "niveles: falta el 1");
  });
  it("falla con un provisional mal puesto", () => {
    mal((d) => { delete d.skills_provisionales.issues.en_tabla; }, "dice en_tabla");
    mal((d) => { d.skills_provisionales.issues.motivo = "corto"; }, "lleva su motivo");
    mal((d) => { d.skills_provisionales.issues.en_tabla = false; }, "tipo flujo: skills_hoy");
  });
  it("falla si falta un tipo o una pregunta, o sobra una", () => {
    mal((d) => { d.tipos_skill.pop(); }, "la decisión de Pablo son 7");
    mal((d) => { d.preguntas_tipo.pop(); }, "sin pregunta que lo asigne");
    mal((d) => { d.preguntas_tipo[0].tipo = "inventado"; }, "no está en tipos_skill");
    mal((d) => { delete d.libertad; }, "libertad es un vocabulario");
  });
});

describe("tipos de cada criterio: la plantilla de cada tipo sale de filtrar la base", () => {
  const deSkill = datos.criterios.filter((c) => c.aplica_a.includes("skill"));
  it("todo criterio de skill dice a qué tipos se aplica y ninguno más lo lleva", () => {
    for (const c of deSkill) expect(c.tipos === "todos" || Array.isArray(c.tipos), c.id).toBe(true);
    for (const c of datos.criterios.filter((x) => !x.aplica_a.includes("skill"))) expect("tipos" in c, c.id).toBe(false);
  });
  it("la plantilla de un tipo es la base filtrada: sin-parada no se pide al servicio", () => {
    expect(criteriosDeTipo(datos, "servicio").map((c) => c.id)).not.toContain("sin-parada");
    expect(criteriosDeTipo(datos, "flujo").map((c) => c.id)).toContain("sin-parada");
    for (const t of datos.tipos_skill) expect(criteriosDeTipo(datos, t.id).length, t.id).toBeGreaterThan(0);
    expect(cifrasPorTipo(datos).servicio.total).toBe(deSkill.length - 1);
    expect(cifrasPorTipo(datos).flujo.total).toBe(deSkill.length);
  });
  it("falla con tipos ausentes, desconocidos, repetidos, vacíos o sobrando", () => {
    const f = (mut, trozo) => {
      const d = clon();
      mut(d.criterios[0], d);
      expect(problemasDeForja(d, existe).join("\n"), trozo).toContain(trozo);
    };
    f((c) => { delete c.tipos; }, "falta «tipos»");
    f((c) => { c.tipos = ["inventado"]; }, "no está en tipos_skill");
    f((c) => { c.tipos = ["flujo", "flujo"]; }, "repite");
    f((c) => { c.tipos = []; }, "al menos un tipo");
    f((c, d) => { c.tipos = d.tipos_skill.map((t) => t.id); }, "pon «todos»");
    const d = clon();
    d.criterios.find((c) => !c.aplica_a.includes("skill")).tipos = "todos";
    expect(problemasDeForja(d, existe).join()).toContain("solo de los criterios que se aplican a skills");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discreto y texto: los campos de cada ficha.
const estandares = JSON.parse(leer("ops/estandares-agentes.json"));
const agentesDelRepo = readdirSync(join(RAIZ, ".claude/agents")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
const existeFicha = (tipo, v) => {
  if (tipo === "skill") return existe(`.claude/skills/${v}/SKILL.md`);
  if (tipo === "agente") return existe(`.claude/agents/${v}.md`);
  if (tipo === "ruta") return existe(v);
  if (tipo === "fuente") return v in estandares.fuentes;
  return false;
};
const ctxCampos = {
  existe: existeFicha,
  vocabularios: {
    niveles: Object.keys(datos.niveles),
    tipos_skill: datos.tipos_skill.map((t) => t.id),
    libertad: Object.keys(datos.libertad),
    invocacion: Object.keys(datos.invocacion),
    origen_tarea: ORIGENES,
    modelo_agente: ["inherit", "opus", "sonnet", "haiku"],
  },
};
const fichaDeSkill = (s) => { const m = metaDe(s); return { name: m.name, description: m.description, ...m.metadata }; };
const fichaDeAgente = (a) => {
  const m = parsearSkill(leer(`.claude/agents/${a}.md`)).meta;
  return { name: m.name, description: m.description, model: m.model, ...(m.skills ? { skills: m.skills.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean) } : {}) };
};
const tareas = Object.entries(estandares.agentes).flatMap(([a, ag]) => ag.tareas.map((t) => [`${a}/${t.id}`, t]));

describe("campos de las fichas: lo que ya existe cumple lo que declara campos_ficha", () => {
  it("el frontmatter de todas las skills", () => {
    for (const s of todas) expect(problemasDeCampos(fichaDeSkill(s), "skill", datos, ctxCampos), s).toEqual([]);
    expect(problemasDeCampos({ ...fichaDeSkill("forja-de-skills"), nivel: "3" }, "skill", datos, ctxCampos).join()).toContain("skill.nivel: «3» no está en el vocabulario");
  });
  it("todas las tareas del catálogo de estándares", () => {
    expect(tareas.length).toBeGreaterThan(50);
    for (const [id, t] of tareas) expect(problemasDeCampos(t, "estandar", datos, ctxCampos), id).toEqual([]);
  });
  it("el frontmatter de todos los agentes", () => {
    expect(agentesDelRepo.length).toBeGreaterThanOrEqual(9);
    for (const a of agentesDelRepo) expect(problemasDeCampos(fichaDeAgente(a), "agente", datos, ctxCampos), a).toEqual([]);
  });
  it("cada artefacto tiene sus campos declarados, y los juicios de skill y los criterios los suyos", () => expect(Object.keys(datos.campos_ficha)).toEqual([...Object.keys(ARTEFACTOS), "juicio", "criterio"]));
  it("todos los juicios de skill guardados cumplen lo que declara campos_ficha.juicio (#457)", () => {
    const ctx = { vocabularios: vocabulariosDeJuicio(), existe: () => true };
    expect(problemasDeDeclaracion(datos, "juicio", ctx.vocabularios)).toEqual([]);
    const juicios = Object.entries(leerJuicios(RAIZ)).flatMap(([s, g]) => Object.entries(g.juicios).map(([id, j]) => [`${s}/${id}`, j]));
    expect(juicios.length).toBeGreaterThan(100);
    for (const [id, j] of juicios) expect(problemasDeCampos(j, "juicio", datos, ctx), id).toEqual([]);
    expect(problemasDeCampos({ estado: "cumple", version_skill_md: "corta" }, "juicio", datos, ctx).join()).toContain("no es una versión");
    expect(datos.campos_ficha.juicio.campos.version_skill_md).toMatchObject({ clase: "ref", ref: "version" });
    expect(datos.campos_ficha.juicio.campos.nota).toMatchObject({ clase: "texto", hueco: true });
  });
  it("los campos de regla de todos los criterios cumplen lo que declara campos_ficha.criterio (#487)", () => {
    const decl = Object.keys(datos.campos_ficha.criterio.campos);
    const ctx = { vocabularios: vocabulariosDeCriterio(datos) };
    expect(datos.criterios.length).toBeGreaterThan(70);
    for (const c of datos.criterios) {
      const ficha = Object.fromEntries(decl.filter((k) => k in c).map((k) => [k, c[k]]));
      expect(problemasDeCampos(ficha, "criterio", datos, ctx), c.id).toEqual([]);
    }
  });
  it("de los campos de un criterio, la exigencia es un hueco de texto y el sujeto y la fuerza son discretos", () => {
    const campos = datos.campos_ficha.criterio.campos;
    expect(campos.exigencia).toMatchObject({ clase: "texto", hueco: true, obligatorio: true });
    expect(campos.sujeto.clase).toBe("enum");
    expect(campos.fuerza.clase).toBe("enum");
  });
  it("las clases son las seis acordadas", () => expect(Object.keys(CLASES_CAMPO)).toEqual(["bool", "enum", "ref", "numero", "fecha", "texto"]));
  it("los campos de estándares que Pablo nombró: tres huecos de texto, un enum y una ref", () => {
    const c = datos.campos_ficha.estandar.campos;
    for (const k of ["estandar", "comprueba", "no_hace"]) expect(c[k]).toMatchObject({ clase: "texto", hueco: true });
    expect(c.origen.clase).toBe("enum");
    expect(c.fuentes.clase).toBe("ref");
    for (const k of ["tipo", "dueno", "comprobado"]) expect(datos.campos_ficha.skill.campos[k]).toBeDefined();
  });
});

describe("autotest de los campos: cada regla falla con datos malos", () => {
  const skillOk = () => fichaDeSkill("github");
  const estOk = () => structuredClone(tareas[0][1]);
  const falla = (ficha, artefacto, trozo, d = datos, ctx = ctxCampos) => expect(problemasDeCampos(ficha, artefacto, d, ctx).join("\n"), trozo).toContain(trozo);
  it("la ficha buena pasa", () => {
    expect(problemasDeCampos(skillOk(), "skill", datos, ctxCampos)).toEqual([]);
    expect(problemasDeCampos(estOk(), "estandar", datos, ctxCampos)).toEqual([]);
  });
  it("un texto sin hueco", () => {
    const d = clon();
    delete d.campos_ficha.estandar.campos.estandar.hueco;
    falla(estOk(), "estandar", "estandar.estandar: un texto solo se admite como hueco", d);
    const e = clon();
    e.campos_ficha.estandar.campos.estandar.cubre = "corto";
    falla(estOk(), "estandar", "dice en «cubre» qué cubre", e);
    const f = clon();
    f.campos_ficha.skill.campos.comprobado.hueco = true;
    falla(skillOk(), "skill", "«hueco» y «cubre» son solo de un texto", f);
  });
  it("un enum fuera de vocabulario", () => {
    falla({ ...skillOk(), tipo: "inventado" }, "skill", "skill.tipo: «inventado» no está en el vocabulario");
    falla({ ...skillOk(), libertad: "enorme" }, "skill", "skill.libertad");
    falla({ ...estOk(), origen: "Capricho" }, "estandar", "estandar.origen: «Capricho»");
    const d = clon();
    d.campos_ficha.skill.campos.tipo.vocab = "no_existe";
    falla(skillOk(), "skill", "«no_existe» no existe", d);
  });
  it("una ref que no existe: skill, agente, criterio, ruta, comando, issue y fuente", () => {
    falla({ ...skillOk(), dueno: "nadie" }, "skill", "agente «nadie» no existe");
    falla({ ...fichaDeAgente("gobierno"), skills: ["github", "no-existe"] }, "agente", "skill «no-existe» no existe");
    falla({ ...estOk(), fuentes: ["fuente-inventada"] }, "estandar", "fuente «fuente-inventada» no existe");
    const d = clon();
    d.campos_ficha.skill.campos.extra = { clase: "ref", ref: "criterio", obligatorio: false };
    d.campos_ficha.skill.campos.donde = { clase: "ref", ref: "ruta", obligatorio: false };
    d.campos_ficha.skill.campos.orden = { clase: "ref", ref: "comando", obligatorio: false };
    d.campos_ficha.skill.campos.issue = { clase: "ref", ref: "issue", obligatorio: false };
    expect(problemasDeCampos({ ...skillOk(), extra: "solape", donde: "ops/forja.json", orden: "npm run forja", issue: "#458" }, "skill", d, ctxCampos)).toEqual([]);
    falla({ ...skillOk(), extra: "criterio-inventado" }, "skill", "el criterio «criterio-inventado» no existe", d);
    falla({ ...skillOk(), donde: "ops/no-existe.json" }, "skill", "ruta «ops/no-existe.json» no existe", d);
    falla({ ...skillOk(), orden: "rm -rf" }, "skill", "no es un comando", d);
    falla({ ...skillOk(), issue: "abc" }, "skill", "no es un issue", d);
    expect(problemasDeCampos(skillOk(), "skill", datos, { vocabularios: ctxCampos.vocabularios }).join()).toContain("falta ctx.existe");
  });
  it("una fecha mala, un campo sin declarar, uno obligatorio ausente y una lista que no lo es", () => {
    falla({ ...skillOk(), comprobado: "2026-13-45" }, "skill", "no es una fecha AAAA-MM-DD válida");
    falla({ ...skillOk(), comprobado: "ayer" }, "skill", "skill.comprobado");
    falla({ ...skillOk(), color: "rojo" }, "skill", "skill.color: campo no declarado");
    const sin = skillOk();
    delete sin.dueno;
    falla(sin, "skill", "skill.dueno: falta (es obligatorio)");
    falla({ ...estOk(), fuentes: "gg-estandar" }, "estandar", "estandar.fuentes: es una lista");
    falla({ ...estOk(), comprueba: [] }, "estandar", "la lista está vacía");
    falla({ ...estOk(), tarea: 7 }, "estandar", "un texto sin hueco declarado");
    falla({}, "cosa", "no tiene campos_ficha");
  });
  it("bool y numero, aunque hoy ningún campo los use", () => {
    const d = clon();
    d.campos_ficha.skill.campos.activa = { clase: "bool", obligatorio: false };
    d.campos_ficha.skill.campos.lineas = { clase: "numero", obligatorio: false };
    expect(problemasDeCampos({ ...skillOk(), activa: true, lineas: 12 }, "skill", d, ctxCampos)).toEqual([]);
    falla({ ...skillOk(), activa: "sí" }, "skill", "no es verdadero o falso", d);
    falla({ ...skillOk(), lineas: "doce" }, "skill", "no es un número", d);
    const e = clon();
    e.campos_ficha.skill.campos.raro = { clase: "lista", obligatorio: false };
    falla(skillOk(), "skill", "clase «lista» no está en el vocabulario", e);
    const f = clon();
    f.campos_ficha.skill.campos.ref_mala = { clase: "ref", ref: "cosa", obligatorio: false };
    falla(skillOk(), "skill", "una ref dice a qué apunta", f);
  });
});

describe("trinquete de los campos (ops/forja-campos.json): de texto a discreto, nunca al revés", () => {
  const guardadoCampos = leerCamposGuardados(RAIZ);
  const texto = { clase: "texto", hueco: true, cubre: "Quién es el dueño de la skill, dicho a mano", obligatorio: true };
  it("lo anclado coincide con campos_ficha y nada baja", () => {
    expect(problemasDeTrinqueteCampos(datos, guardadoCampos), "Lanza «npm run forja -- --escribir»").toEqual([]);
    expect(anclarCampos(datos, guardadoCampos).cambios).toEqual([]);
    expect(existe(RUTA_CAMPOS)).toBe(true);
  });
  it("un campo discreto que vuelve a ser texto falla", () => {
    const d = clon();
    d.campos_ficha.skill.campos.dueno = texto;
    expect(problemasDeTrinqueteCampos(d, guardadoCampos).join()).toContain("skill.dueno: vuelve de discreto a texto");
    const e = clon();
    e.campos_ficha.estandar.campos.origen = texto;
    expect(problemasDeTrinqueteCampos(e, guardadoCampos).join()).toContain("estandar.origen: vuelve de discreto a texto");
  });
  it("un texto que pasa a discreto no falla y se ancla; anclar nunca baja ni borra", () => {
    const d = clon();
    d.campos_ficha.estandar.campos.no_hace = { clase: "ref", ref: "ruta", lista: true, obligatorio: false };
    expect(problemasDeTrinqueteCampos(d, guardadoCampos)).toEqual([]);
    const { guardado, cambios } = anclarCampos(d, guardadoCampos);
    expect(cambios.join()).toContain("estandar.no_hace: sube de texto a discreto");
    expect(guardado.campos["estandar.no_hace"]).toBe("discreto");
    const e = clon();
    e.campos_ficha.skill.campos.dueno = texto;
    delete e.campos_ficha.agente;
    const { guardado: g2 } = anclarCampos(e, guardadoCampos);
    expect(g2.campos["skill.dueno"]).toBe("discreto");
    expect(Object.keys(g2.campos)).toEqual(Object.keys(guardadoCampos.campos));
  });
  it("un campo que desaparece sin motivo falla; con motivo, no; uno nuevo sin anclar falla", () => {
    const d = clon();
    delete d.campos_ficha.skill.campos.libertad;
    expect(problemasDeTrinqueteCampos(d, guardadoCampos).join()).toContain("skill.libertad: ha desaparecido");
    const con = { ...guardadoCampos, retirados: { "skill.libertad": { motivo: "Pasa a la ficha de skill de #457" } } };
    expect(problemasDeTrinqueteCampos(d, con)).toEqual([]);
    expect(problemasDeTrinqueteCampos(d, { ...guardadoCampos, retirados: { "skill.libertad": { motivo: "no" } } }).join()).toContain("sin motivo");
    expect(problemasDeTrinqueteCampos(clon(), con).join()).toContain("sigue en campos_ficha");
    const n = clon();
    n.campos_ficha.skill.campos.nuevo = { clase: "bool", obligatorio: false };
    expect(problemasDeTrinqueteCampos(n, guardadoCampos).join()).toContain("skill.nuevo: campo sin anclar");
    expect(problemasDeTrinqueteCampos(datos, { ...guardadoCampos, campos: { ...guardadoCampos.campos, "skill.name": "raro" } }).join()).toContain("no es del vocabulario");
  });
});

describe("cifras: campos discretos frente a huecos", () => {
  it("por artefacto, en la vista y en las cifras", () => {
    expect(cifrasDeCampos(datos)).toEqual({ skill: { discretos: 13, huecos: 2, total: 15 }, estandar: { discretos: 2, huecos: 5, total: 7 }, agente: { discretos: 3, huecos: 1, total: 4 }, juicio: { discretos: 6, huecos: 1, total: 7 }, criterio: { discretos: 2, huecos: 6, total: 8 } });
    expect(md).toContain("| skill | 13 | 2 | 15 |");
    expect(md).toContain("| criterio | 2 | 6 | 8 |");
    expect(md).toContain("| estandar | 2 | 5 | 7 |");
    expect(md).toContain("| juicio | 6 | 1 | 7 |");
  });
  it("FORJA.md dice que la única lista de tipos es la de ops/forja.json y dónde están los moldes", () => {
    expect(md).toContain("La única lista de tipos es la de `ops/forja.json`");
    expect(md).toContain(".claude/plantillas-skill/<tipo>.md");
  });
  it("cambiar un campo o un tipo cambia la vista", () => {
    const d = clon();
    d.campos_ficha.skill.campos.dueno = { clase: "texto", hueco: true, cubre: "Quién es el dueño de la skill, dicho a mano", obligatorio: true };
    expect(generarMd(d)).not.toBe(md);
    const e = clon();
    e.criterios.find((c) => c.id === "sin-parada").tipos = "todos";
    expect(generarMd(e)).not.toBe(md);
  });
});

/**
 * El borrado doble: pasar un campo de discreto a texto en campos_ficha y en ops/forja-campos.json a la vez
 * pasa el trinquete local. Se contrasta con lo anclado en origin/staging (FORJA_REF cambia la referencia).
 * Mientras ops/forja-campos.json no esté en la referencia, se salta limpio y lo dice.
 */
const REF = REFERENCIA();
const camposRef = jsonEnReferenciaAvisando(RAIZ, REF, RUTA_CAMPOS, "trinquete de campos");
describe(`el trinquete de campos contra ${REF}`, () => {
  const actual = leerCamposGuardados(RAIZ);
  it.skipIf(!camposRef)("ningún campo anclado en la referencia baja de nivel ni desaparece sin motivo", () => {
    expect(problemasDeCamposContraReferencia(actual, camposRef), "Un campo solo pasa de texto a discreto; si lo quitas, déjalo en «retirados» de ops/forja-campos.json con su motivo").toEqual([]);
  });
  it("cada regla falla con datos malos (esté o no la referencia)", () => {
    const ref = { campos: { "a.uno": "discreto", "a.dos": "texto", "a.tres": "discreto" } };
    expect(problemasDeCamposContraReferencia({ campos: { "a.uno": "discreto", "a.dos": "texto", "a.tres": "discreto" } }, ref)).toEqual([]);
    expect(problemasDeCamposContraReferencia({ campos: { "a.uno": "discreto", "a.dos": "discreto", "a.tres": "discreto" } }, ref)).toEqual([]);
    expect(problemasDeCamposContraReferencia({ campos: { "a.uno": "texto", "a.dos": "texto", "a.tres": "discreto" } }, ref).join()).toContain("a.uno: estaba como discreto");
    expect(problemasDeCamposContraReferencia({ campos: { "a.uno": "discreto", "a.dos": "texto" } }, ref).join()).toContain("a.tres: estaba anclado");
    expect(problemasDeCamposContraReferencia({ campos: { "a.uno": "discreto", "a.dos": "texto" }, retirados: { "a.tres": { motivo: "Pasa a otra ficha de skill" } } }, ref)).toEqual([]);
    expect(problemasDeCamposContraReferencia({ campos: { "a.uno": "discreto", "a.dos": "texto" }, retirados: { "a.tres": { motivo: "no" } } }, ref).join()).toContain("a.tres");
  });
  it("pasar skill.tipo a texto en campos_ficha y en el ancla a la vez sí lo ve la referencia", () => {
    const d = clon();
    d.campos_ficha.skill.campos.tipo = { clase: "texto", hueco: true, cubre: "El tipo de la skill, dicho a mano sin vocabulario", obligatorio: true };
    const { guardado } = anclarCampos(d, { campos: { ...actual.campos, "skill.tipo": "texto" }, retirados: {} });
    const ambos = { ...actual, campos: { ...actual.campos, "skill.tipo": "texto" } };
    expect(problemasDeTrinqueteCampos(d, ambos), "el trinquete local no lo ve: por eso existe el de la referencia").toEqual([]);
    expect(problemasDeCamposContraReferencia(ambos, actual).join()).toContain("skill.tipo: estaba como discreto");
    expect(guardado.campos["skill.tipo"]).toBe("texto");
  });
});
