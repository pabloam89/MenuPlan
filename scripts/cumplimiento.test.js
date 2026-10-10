// Cumplimiento del flujo y salud de las skills (#341): cada indicador se ve disparar
// con datos de ejemplo, y no dispara con los datos buenos. Márgenes de tiempo ×20
// en los que lanzan un proceso (el CI es lento).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONSULTA_FLUJO, DIAS_PARA_PODAR, ESTADOS_INDICADOR, IDS_INDICADOR, INDICADORES, VENTANA_CORTO_DIAS, desdeGraphql, hallazgos, lineaDeIndicador, lineasDeUso, medirIndicadores, usoDeSkills,
} from "./lib/cumplimiento.mjs";
import { informe } from "./cumplimiento.mjs";
import { hash, hashLF } from "./lib/evals.mjs";
import { saludDeSkills } from "./lib/saludSkills.mjs";

const HOY = new Date("2026-10-20T10:00:00Z");
const RAIZ = join(import.meta.dirname, "..");
const TIEMPO = 120_000;

// ── Datos de ejemplo (la forma de CONSULTA_FLUJO) ─────────────────────────────

const etiquetas = (...n) => ({ nodes: n.map((name) => ({ name })) });
const ficha = (c) => ["```fondo", ...Object.entries(c).map(([k, v]) => `${k}: ${v}`), "```"].join("\n");
const encargoMd = (c) => ["```encargo", ...Object.entries(c).map(([k, v]) => `${k}: ${v}`), "```"].join("\n");
const ENCARGO_BUENO = { fondo: "#900", tipo_accion: "preventivo", mecanismo: "test_ci", clase: "toda x que y", depende_de: "ninguno", constructor: "gobierno", juez: "revisor", verificacion: "scripts/x.test.js", hecho_cuando: "pasa" };
const nodoEncargo = (n, body, extra = {}) => ({ number: n, state: "OPEN", createdAt: "2026-10-12T00:00:00Z", body, authorAssociation: "OWNER", labels: etiquetas("tipo:encargo", "area:ops"), ...extra });
const nodoCaso = (n, analisis, createdAt) => ({ number: n, state: "CLOSED", createdAt, body: "", authorAssociation: "OWNER", labels: etiquetas("tipo:caso", analisis) });
const fondo = (n, ficha_, { estado = "OPEN", razon = null, hijos = [], createdAt = "2026-10-11T00:00:00Z" } = {}) => ({
  number: n, state: estado, stateReason: razon, createdAt, closedAt: estado === "CLOSED" ? "2026-10-15T00:00:00Z" : null, body: ficha_, authorAssociation: "OWNER",
  labels: etiquetas("tipo:fondo", "area:ops", "causa:error-silencioso"), subIssues: { nodes: hijos },
});
const BASE = { estado: "diagnosticado", tipo_causa: "error-silencioso", alcance: "modulo", severidad: "medio", mecanismo: "x falla cuando y", causa_escape: "ningun test lo miraba" };
const medir = (...nodos) => medirIndicadores(nodos.map(desdeGraphql), { hoy: HOY });
const de = (m, id) => m.find((x) => x.indicador === id);

describe("el vocabulario", () => {
  it("cada indicador tiene umbral numérico y una frase de qué mide", () => {
    for (const id of IDS_INDICADOR) {
      expect(Number.isInteger(INDICADORES[id].umbral)).toBe(true);
      expect(INDICADORES[id].que.length).toBeGreaterThan(20);
    }
    expect(IDS_INDICADOR).toEqual(["fondos_sin_diagnostico", "encargos_sin_juez", "cerrados_sin_aprendizaje", "reabiertos_clase_mal_definida", "ciclos_sobre_presupuesto"]);
  });
  it("la línea contable es indicador/valor/umbral/estado, y enseña quién dispara", () => {
    const m = medir(fondo(900, ficha({ ...BASE, mecanismo: "" }), { hijos: [nodoEncargo(901, "")] }));
    expect(lineaDeIndicador(de(m, "fondos_sin_diagnostico"))).toBe("indicador: fondos_sin_diagnostico valor: 1 umbral: 0 estado: dispara en: #900");
    expect(lineaDeIndicador(de(m, "ciclos_sobre_presupuesto"))).toBe("indicador: ciclos_sobre_presupuesto valor: 0 umbral: 0 estado: ok");
  });
});

describe("cada indicador se ve disparar, y con datos buenos no", () => {
  it("fondos_sin_diagnostico: un fondo con encargos y sin mecanismo", () => {
    const malo = medir(fondo(900, ficha({ ...BASE, mecanismo: "", causa_escape: "" }), { hijos: [nodoEncargo(901, "")] }));
    expect(de(malo, "fondos_sin_diagnostico")).toMatchObject({ valor: 1, estado: "dispara", en: [900] });
    const bueno = medir(fondo(900, ficha(BASE), { hijos: [nodoEncargo(901, "")] }));
    expect(de(bueno, "fondos_sin_diagnostico").estado).toBe("ok");
    // «abierto» sin encargos todavía no necesita diagnóstico
    const recien = medir(fondo(900, ficha({ estado: "abierto", tipo_causa: "codigo", alcance: "local", severidad: "bajo" })));
    expect(de(recien, "fondos_sin_diagnostico").estado).toBe("ok");
  });

  it("fondos_sin_diagnostico: solo por su estado, sin encargos", () => {
    const m = medir(fondo(900, ficha({ ...BASE, estado: "en-curso", mecanismo: "" })));
    expect(de(m, "fondos_sin_diagnostico").en).toEqual([900]);
  });

  it("fondos_sin_diagnostico: un fondo con encargos y sin ficha", () => {
    const m = medir(fondo(900, "sin ficha", { hijos: [nodoEncargo(901, "")] }));
    expect(de(m, "fondos_sin_diagnostico").en).toEqual([900]);
  });

  it("encargos_sin_juez: sin bloque, sin juez o juez igual al constructor", () => {
    const plan = (hijos) => medir(fondo(900, ficha({ ...BASE, estado: "plan" }), { hijos }));
    const sinBloque = plan([nodoEncargo(901, "solo texto")]);
    const sinJuez = plan([nodoEncargo(902, encargoMd({ ...ENCARGO_BUENO, juez: "" }))]);
    const mismo = plan([nodoEncargo(903, encargoMd({ ...ENCARGO_BUENO, juez: "gobierno" }))]);
    expect(de(sinBloque, "encargos_sin_juez").en).toEqual([901]);
    expect(de(sinJuez, "encargos_sin_juez").en).toEqual([902]);
    expect(de(mismo, "encargos_sin_juez").en).toEqual([903]);
    expect(de(plan([nodoEncargo(904, encargoMd(ENCARGO_BUENO))]), "encargos_sin_juez").estado).toBe("ok");
    // antes del plan los encargos se van colgando: no cuenta
    const antes = medir(fondo(900, ficha(BASE), { hijos: [nodoEncargo(905, "solo texto")] }));
    expect(de(antes, "encargos_sin_juez").estado).toBe("ok");
    // un encargo cerrado ya entregó su trabajo: no cuenta
    const cerrado = plan([nodoEncargo(906, "solo texto", { state: "CLOSED" })]);
    expect(de(cerrado, "encargos_sin_juez").estado).toBe("ok");
  });

  it("cerrados_sin_aprendizaje: cerrado como arreglado sin aprendizaje; el no planeado y el que sí lo tiene, no", () => {
    const cerrado = (c, razon) => medir(fondo(900, ficha({ ...BASE, estado: "cerrado-eficaz", ...c }), { estado: "CLOSED", razon }));
    expect(de(cerrado({}, "COMPLETED"), "cerrados_sin_aprendizaje")).toMatchObject({ valor: 1, estado: "dispara", en: [900] });
    expect(de(cerrado({ aprendizaje: "ninguno" }, "COMPLETED"), "cerrados_sin_aprendizaje").estado).toBe("dispara");
    expect(de(cerrado({ aprendizaje: "un test nuevo en scripts/x.test.js" }, "COMPLETED"), "cerrados_sin_aprendizaje").estado).toBe("ok");
    expect(de(cerrado({}, "NOT_PLANNED"), "cerrados_sin_aprendizaje").estado).toBe("ok");
  });

  it("reabiertos_clase_mal_definida: un no-aguanto-corto reciente; uno antiguo o roto, no", () => {
    const con = (analisis, creado) => medir(fondo(900, ficha(BASE), { hijos: [nodoCaso(950, analisis, creado)] }));
    expect(de(con("analisis:no-aguanto-corto", "2026-10-18T00:00:00Z"), "reabiertos_clase_mal_definida")).toMatchObject({ valor: 1, estado: "dispara", en: [900] });
    expect(de(con("analisis:no-aguanto-roto", "2026-10-18T00:00:00Z"), "reabiertos_clase_mal_definida").estado).toBe("ok");
    const viejo = new Date(HOY.getTime() - (VENTANA_CORTO_DIAS + 2) * 86_400_000).toISOString();
    expect(de(con("analisis:no-aguanto-corto", viejo), "reabiertos_clase_mal_definida").estado).toBe("ok");
  });

  it("ciclos_sobre_presupuesto: más rondas que el tope del presupuesto", () => {
    const con = (rondas) => medir(fondo(900, ficha({ ...BASE, rondas }), {}));
    expect(de(con(3), "ciclos_sobre_presupuesto")).toMatchObject({ valor: 1, estado: "dispara", en: [900] });
    expect(de(con(2), "ciclos_sobre_presupuesto").estado).toBe("ok");
  });

  it("los fondos anteriores a la ficha y los de fuera de la casa no cuentan", () => {
    const viejo = fondo(100, "sin ficha", { createdAt: "2026-10-01T00:00:00Z", hijos: [nodoEncargo(101, "")] });
    const ajeno = { ...fondo(900, ficha({ ...BASE, mecanismo: "" }), { hijos: [nodoEncargo(901, "")] }), authorAssociation: "NONE" };
    const m = medir(viejo, ajeno);
    expect(m.every((x) => x.estado === "ok")).toBe(true);
  });
});

describe("más de 50 hijos", () => {
  it("se avisa con una nota en la línea, no se calla", () => {
    const nodo = { ...fondo(900, ficha(BASE)), subIssues: { pageInfo: { hasNextPage: true }, nodes: [] } };
    const m = medirIndicadores([desdeGraphql(nodo)], { hoy: HOY });
    expect(lineaDeIndicador(m[0])).toBe("indicador: fondos_sin_diagnostico valor: 0 umbral: 0 estado: ok nota: hijos_truncados_en:#900");
    expect(CONSULTA_FLUJO).toMatch(/subIssues\(first: 50\) \{\s*pageInfo \{ hasNextPage \}/);
  });
  it("reabiertos_clase_mal_definida dice que cuenta casos creados en la ventana", () => {
    expect(INDICADORES.reabiertos_clase_mal_definida.que).toMatch(/creados en los últimos 28 días/);
  });
});

describe("el hash de las pasadas de skills no depende del fin de línea", () => {
  it("CRLF y LF dan el mismo hash, y con LF vale lo de siempre", () => {
    expect(hashLF("a\r\nb\r\n")).toBe(hashLF("a\nb\n"));
    expect(hashLF("a\nb\n")).toBe(hash("a\nb\n"));
  });
  it("skills-prueba y saludSkills usan el mismo hash", () => {
    for (const f of ["scripts/skills-prueba.mjs", "scripts/lib/saludSkills.mjs"]) expect(readFileSync(join(RAIZ, f), "utf8")).toMatch(/hashLF\(/);
  });
});


describe("sin datos no hay «ok» inventado", () => {
  it("si la API no responde, todos salen sin_datos", () => {
    const m = medirIndicadores(null);
    expect(m.map((x) => x.estado)).toEqual(IDS_INDICADOR.map(() => "sin_datos"));
    expect(lineaDeIndicador(m[0])).toBe("indicador: fondos_sin_diagnostico valor: - umbral: 0 estado: sin_datos");
    for (const x of m) expect(ESTADOS_INDICADOR).toContain(x.estado);
  });
  it("hallazgos nunca lleva texto de nadie, solo números", () => {
    const h = hallazgos([desdeGraphql(fondo(900, ficha({ ...BASE, mecanismo: "" }), { hijos: [nodoEncargo(901, "")] }))], { hoy: HOY });
    for (const lista of Object.values(h)) for (const n of lista) expect(typeof n).toBe("number");
  });
});

describe("poda: skills sin uso", () => {
  const skills = ["a", "b", "c"];
  const l = (nombre, dias) => ({ ts: new Date(HOY.getTime() - dias * 86_400_000).toISOString(), evento: "skill_cargada", nombre });
  it("con poco registro cuenta la semana pero NO propone aparcar nada", () => {
    const u = usoDeSkills([l("a", 1), { ts: new Date(HOY.getTime() - 3 * 86_400_000).toISOString(), evento: "bloqueo_guardia", nombre: "x" }], skills, HOY);
    expect(u.sin_uso_semana).toEqual(["b", "c"]);
    expect(u.candidatas).toBeNull();
    expect(lineasDeUso(u)[1]).toMatch(/candidatas: sin_datos/);
  });
  it("con 90 días de registro propone las que no se abrieron en 90", () => {
    const u = usoDeSkills([l("a", DIAS_PARA_PODAR + 5), l("a", 3), l("b", 50)], skills, HOY);
    expect(u.candidatas).toEqual(["c"]);
    expect(lineasDeUso(u)[1]).toBe("poda candidatas: 1 skills: c");
  });
  it("la cifra de la semana de skills-uso manda sobre el registro", () => {
    expect(usoDeSkills([l("a", 1)], skills, HOY, ["c"]).sin_uso_semana).toEqual(["c"]);
  });
  it("una línea corrupta o ajena no rompe la cuenta", () => {
    expect(usoDeSkills([null, {}, { ts: "no", evento: "skill_cargada", nombre: "a" }], skills, HOY).sin_uso_semana).toEqual(skills);
  });
});

describe("salud de las skills del repo (sin coste)", () => {
  it("devuelve una fila por skill y los tres indicadores, con el vocabulario cerrado", () => {
    const s = saludDeSkills(RAIZ, new Date());
    expect(s.filas.length).toBeGreaterThan(5);
    expect(s.indicadores.map((i) => i.indicador)).toEqual(["skills_con_faltas", "skills_caducadas", "skills_medida_desactualizada"]);
    for (const i of s.indicadores) expect(["ok", "dispara"]).toContain(i.estado);
  }, TIEMPO);

  it("el informe junta cumplimiento del flujo y salud de skills, sin texto de nadie", () => {
    const indicadores = medir(fondo(900, ficha({ ...BASE, mecanismo: "" }), { hijos: [nodoEncargo(901, "")] }));
    const md = informe({ indicadores, salud: saludDeSkills(RAIZ, new Date()), uso: null, hoy: "2026-10-20" });
    expect(md).toMatch(/### Cumplimiento del flujo/);
    expect(md).toMatch(/### Salud de las skills/);
    expect(md).toMatch(/indicador: fondos_sin_diagnostico valor: 1 umbral: 0 estado: dispara en: #900/);
    expect(md).toMatch(/no se abre nada solo/);
  }, TIEMPO);
});

describe("el script", () => {
  const correr = (...args) => spawnSync(process.execPath, [join(RAIZ, "scripts/cumplimiento.mjs"), ...args], { cwd: RAIZ, encoding: "utf8", timeout: TIEMPO });

  it("con issues de fichero imprime las 8 líneas y escribe el informe", () => {
    const dir = mkdtempSync(join(tmpdir(), "cumpl-"));
    const f = join(dir, "issues.json");
    writeFileSync(f, JSON.stringify([fondo(900, ficha({ ...BASE, mecanismo: "" }), { hijos: [nodoEncargo(901, "")] })]));
    const r = correr("--issues", f, "--informe", join(dir, "inf.md"));
    expect(r.status).toBe(0);
    expect(r.stdout.match(/^indicador: /gm)).toHaveLength(8);
    expect(r.stdout).toMatch(/indicador: fondos_sin_diagnostico valor: 1 umbral: 0 estado: dispara en: #900/);
  }, TIEMPO);

  it("una opción sin valor es entrada mala (2)", () => {
    expect(correr("--informe").status).toBe(2);
  }, TIEMPO);

  it("--skills-pr: sin skills tocadas no hace nada; con una, higiene y ensayo sin llamar a nadie", () => {
    const dir = mkdtempSync(join(tmpdir(), "cumpl-"));
    const vacia = join(dir, "a.txt");
    writeFileSync(vacia, "src/App.jsx\n");
    expect(correr("--skills-pr", vacia).stdout).toMatch(/no toca ninguna/);
    const una = join(dir, "b.txt");
    writeFileSync(una, ".claude/skills/forja-de-skills/SKILL.md\n.claude/skills/../../etc/x\n");
    const r = correr("--skills-pr", una);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/higiene skill: forja-de-skills faltas: 0/);
    expect(r.stdout).toMatch(/Ensayo: no se llama a ninguna API/);
  }, TIEMPO);
});

describe("los workflows: sin secretos, sin coste, sin issues automáticos por indicador", () => {
  const leer = (f) => readFileSync(join(RAIZ, ".github/workflows", f), "utf8");
  const semanal = leer("flujo-semanal.yml");
  const sinComentarios = (t) => t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

  it("flujo-semanal.yml no usa secretos, ni lanza el nivel 2 de pago, ni interpola nada ajeno en un run", () => {
    const y = sinComentarios(semanal);
    expect(y).not.toMatch(/secrets\./);
    expect(y).not.toMatch(/ANTHROPIC/);
    // toda llamada a skills-prueba lleva --ensayo
    for (const l of y.split("\n").filter((x) => /skills-prueba\.mjs/.test(x))) expect(l).toMatch(/--ensayo/);
    // dos jobs: quien mide solo lee, quien publica solo escribe (y la escritura es de un único job)
    expect(y.match(/issues: write/g)).toHaveLength(1);
    expect(y.match(/issues: read/g)).toHaveLength(1);
    expect(y.indexOf("issues: read")).toBeLessThan(y.indexOf("publicar:"));
    expect(y.indexOf("issues: write")).toBeGreaterThan(y.indexOf("publicar:"));
    expect(y).not.toMatch(/\$\{\{\s*github\.event\./);
  });

  it("no abre un issue por indicador: solo el del informe, buscado antes por su título", () => {
    expect(semanal.match(/gh issue create/g)).toHaveLength(1);
    expect(semanal).toMatch(/gh issue list[\s\S]*in:title/);
  });

  it("el issue del informe se busca por autor y título exacto, y un fallo de la búsqueda no crea otro", () => {
    const y = sinComentarios(semanal);
    expect(y).toMatch(/--author "app\/github-actions"/);
    expect(y).toMatch(/select\(\.title==/);
    expect(y).toMatch(/if ! lista=\$\(gh issue list/);
    expect(y).not.toMatch(/gh issue list[^\n]*\|\| true/);
  });

  it("solo menciona si aparece un indicador que no disparaba en el comentario anterior", () => {
    const y = sinComentarios(semanal);
    expect(y).toMatch(/flujo:dispara=/);
    expect(y).toMatch(/case ",\$previo," in/);
    expect(y).not.toMatch(/grep -q 'estado: dispara'/);
  });


  it("las acciones van fijadas por SHA", () => {
    for (const l of semanal.split("\n").filter((x) => /uses:/.test(x))) expect(l).toMatch(/@[0-9a-f]{40}\b/);
  });

  it("tests.yml corre la higiene de las skills del PR", () => {
    expect(leer("tests.yml")).toMatch(/cumplimiento\.mjs --skills-pr/);
  });
});
