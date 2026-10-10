import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTEFACTOS, CLASES_CAMPO, RUTA_CAMPOS,
  anclarCampos, cifrasDeCampos, cifrasPorTipo, criteriosDeTipo, generarMd, leerCamposGuardados, leerForja,
  problemasDeCampos, problemasDeForja, problemasDeTaxonomia, problemasDeTrinqueteCampos, tipoDeSkill,
} from "../scripts/lib/forja.mjs";
import { ORIGENES } from "../scripts/lib/estandaresAgentes.mjs";
import { nombresDeSkills, parsearSkill } from "../scripts/lib/skills.mjs";

/**
 * Tipos de skill (decisión de Pablo, 10 oct 2026) y campos discretos frente a huecos de texto (#458).
 * Falla cuando: a una skill le faltan respuestas, el tipo derivado no coincide con la tabla de Pablo,
 * un tipo de ops/flujo.json no tiene destino, un texto no es hueco, un enum se sale del vocabulario,
 * una ref no existe o un campo vuelve de discreto a texto.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const datos = leerForja(RAIZ);
const clon = () => structuredClone(datos);
const md = leer("docs/ops/FORJA.md");

const flujo = JSON.parse(leer("ops/flujo.json"));
const tiposActuales = flujo.tipos_skill.map((t) => t.id);
const skills = nombresDeSkills(RAIZ);
const metaDe = (s) => parsearSkill(leer(`.claude/skills/${s}/SKILL.md`)).meta;
const tipoActualDe = Object.fromEntries(skills.map((s) => [s, metaDe(s).metadata.tipo]));
const ctxTaxonomia = { skills, tiposActuales, tipoActualDe };

/** La tabla de Pablo, escrita aparte del JSON: lo que el JSON deriva tiene que coincidir con ella. */
const TABLA_PABLO = {
  servicio: ["github", "vercel", "supabase", "telegram", "hetzner", "tailscale", "1password"],
  procedimiento: ["alta-de-secreto"],
  diagnostico: ["causa-raiz"],
  decision: ["plan-de-arreglo"],
  flujo: ["issues"],
  forja: ["forja-de-skills"],
  revision: ["higiene-de-skills"],
  conocimiento: [],
};
const PREGUNTAS_PABLO = ["opera_proveedor", "crea_artefacto", "juzga_artefacto", "encadena", "pasos_fijos", "sintoma_a_causa", "elige_opciones"];
const TIPOS_PABLO = ["servicio", "forja", "revision", "flujo", "procedimiento", "diagnostico", "decision"];

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
    expect(tipoDeSkill({ ...sin, opera_proveedor: true, crea_artefacto: true })).toBe("servicio");
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

describe("la taxonomía de tipos y la migración de las skills", () => {
  it("ops/forja.json cumple la taxonomía", () => {
    expect(problemasDeTaxonomia(datos, ctxTaxonomia), "Corrige tipos_skill, respuestas_tipo, migracion_tipos o destino_tipos_actuales en ops/forja.json").toEqual([]);
  });
  it("el tipo derivado de cada skill es el de la tabla de Pablo", () => {
    const deTabla = Object.fromEntries(Object.entries(TABLA_PABLO).flatMap(([t, ss]) => ss.map((s) => [s, t])));
    for (const s of skills) {
      const esperado = deTabla[s] ?? "conocimiento";
      expect(tipoDeSkill(datos.respuestas_tipo[s]), s).toBe(esperado);
      expect(datos.migracion_tipos[s], s).toBe(esperado);
    }
    for (const [t, ss] of Object.entries(TABLA_PABLO)) expect(datos.tipos_skill.find((x) => x.id === t).skills_hoy, t).toEqual(ss);
  });
  it("cada skill del repo tiene respuestas a las siete preguntas", () => {
    for (const s of skills) expect(Object.keys(datos.respuestas_tipo[s] ?? {}).filter((k) => k !== "nota"), s).toEqual(PREGUNTAS_PABLO);
    expect(Object.keys(datos.skills_provisionales)).toEqual(["estilo-de-respuesta", "issues"]);
  });
  it("forja-de-skills juzga y crea (y da forja); issues es provisional; alta-de-secreto dice por qué no opera un proveedor", () => {
    const r = datos.respuestas_tipo;
    expect(r["forja-de-skills"]).toMatchObject({ crea_artefacto: true, juzga_artefacto: true });
    expect(tipoDeSkill(r["forja-de-skills"])).toBe("forja");
    expect(datos.skills_provisionales.issues).toMatchObject({ en_tabla: true });
    expect(datos.skills_provisionales["estilo-de-respuesta"]).toMatchObject({ en_tabla: false });
    expect(datos.tipos_skill.find((t) => t.id === "flujo").skills_hoy).toEqual(["issues"]);
    expect(r["alta-de-secreto"].opera_proveedor).toBe(false);
    expect(r["alta-de-secreto"].nota).toContain("opera_proveedor es false");
    expect(r.issues.nota).toContain("#414");
  });
  it("cada tipo de hoy de ops/flujo.json tiene un destino y cada skill pasa a uno de los suyos", () => {
    for (const t of tiposActuales) expect(datos.destino_tipos_actuales[t]?.destinos?.length, t).toBeGreaterThan(0);
    for (const s of skills) expect(datos.destino_tipos_actuales[tipoActualDe[s]].destinos, s).toContain(datos.migracion_tipos[s]);
  });
  const mal = (mut, trozo, ctx = ctxTaxonomia) => {
    const d = clon();
    mut(d);
    expect(problemasDeTaxonomia(d, ctx).join("\n"), trozo).toContain(trozo);
  };
  it("falla si a una skill le faltan respuestas", () => {
    mal((d) => { delete d.respuestas_tipo.github; }, "github: faltan sus respuestas");
    mal((d) => { delete d.respuestas_tipo.github.encadena; }, "la respuesta «encadena» es verdadero o falso");
    mal((d) => { d.respuestas_tipo.github.encadena = "no"; }, "la respuesta «encadena» es verdadero o falso");
    mal((d) => { d.respuestas_tipo.github.rara = true; }, "no es una pregunta");
    mal((d) => { d.respuestas_tipo.fantasma = d.respuestas_tipo.github; }, "fantasma");
    mal((d) => { d.migracion_tipos.fantasma = "servicio"; }, "fantasma");
  });
  it("falla si el tipo derivado no coincide con la migración", () => {
    mal((d) => { d.respuestas_tipo.github.opera_proveedor = false; }, "github: migracion_tipos dice «servicio» y sus respuestas dan «conocimiento»");
    mal((d) => { d.migracion_tipos.issues = "servicio"; }, "issues: migracion_tipos dice «servicio» y sus respuestas dan «flujo»");
    mal((d) => { d.tipos_skill.find((t) => t.id === "servicio").skills_hoy.pop(); }, "tipo servicio: skills_hoy");
  });
  it("falla si un tipo actual de ops/flujo.json no tiene destino", () => {
    mal((d) => { delete d.destino_tipos_actuales.meta; }, "el tipo actual «meta» de ops/flujo.json no tiene destino");
    mal((d) => { d.destino_tipos_actuales.meta.destinos = ["inventado"]; }, "el destino «inventado» no está en tipos_skill");
    mal((d) => { d.destino_tipos_actuales.herramienta.destinos = ["servicio"]; }, "issues: era «herramienta» y pasa a «flujo»");
    mal(() => {}, "el tipo actual «nuevo_tipo» de ops/flujo.json no tiene destino", { ...ctxTaxonomia, tiposActuales: [...tiposActuales, "nuevo_tipo"] });
    mal((d) => { d.destino_tipos_actuales.viejo = { destinos: ["flujo"], nota: "Un tipo que ya no está en el flujo" }; }, "ya no es un tipo de ops/flujo.json");
  });
  it("falla con una nota corta o un provisional mal puesto", () => {
    mal((d) => { d.respuestas_tipo["alta-de-secreto"].nota = "corta"; }, "la nota de sus respuestas dice por qué");
    mal((d) => { delete d.skills_provisionales.issues.en_tabla; }, "dice en_tabla");
    mal((d) => { d.skills_provisionales.issues.motivo = "corto"; }, "lleva su motivo");
    mal((d) => { d.skills_provisionales.issues.en_tabla = false; }, "tipo flujo: skills_hoy");
  });
  it("falla si falta un tipo o una pregunta, o sobra una", () => {
    mal((d) => { d.tipos_skill.pop(); }, "la decisión de Pablo son 8");
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
    expect(cifrasPorTipo(datos).forja.total).toBe(deSkill.length);
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
    tipos_skill_vigentes: tiposActuales,
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
    for (const s of skills) expect(problemasDeCampos(fichaDeSkill(s), "skill", datos, ctxCampos), s).toEqual([]);
  });
  it("todas las tareas del catálogo de estándares", () => {
    expect(tareas.length).toBeGreaterThan(50);
    for (const [id, t] of tareas) expect(problemasDeCampos(t, "estandar", datos, ctxCampos), id).toEqual([]);
  });
  it("el frontmatter de todos los agentes", () => {
    expect(agentesDelRepo.length).toBeGreaterThanOrEqual(9);
    for (const a of agentesDelRepo) expect(problemasDeCampos(fichaDeAgente(a), "agente", datos, ctxCampos), a).toEqual([]);
  });
  it("cada artefacto tiene sus campos declarados", () => expect(Object.keys(datos.campos_ficha)).toEqual(Object.keys(ARTEFACTOS)));
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
    expect(cifrasDeCampos(datos)).toEqual({ skill: { discretos: 6, huecos: 1, total: 7 }, estandar: { discretos: 2, huecos: 5, total: 7 }, agente: { discretos: 3, huecos: 1, total: 4 } });
    expect(md).toContain("| skill | 6 | 1 | 7 |");
    expect(md).toContain("| estandar | 2 | 5 | 7 |");
  });
  it("FORJA.md dice que la fuente de los tipos es ops/forja.json y que la plantilla es de otro encargo", () => {
    expect(md).toContain("La fuente de los tipos pasa a ser `ops/forja.json`");
    expect(md).toContain("encargo de plantillas por tipo");
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
