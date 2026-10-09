import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAMPOS_POR_TIPO, DISPARADORES, ESTADOS_CRITERIO, MEDIDORES, NIVELES, OPERADORES, PERSONAS, REGLAS_GITHUB, TIPOS_CRITERIO,
  cuerpoIssue, diasEntre, evaluarCriterio, evaluarReglaGithub, generarTabla, medir, nivelDe, sustituirTabla, tablaActual,
} from "../scripts/lib/planos.mjs";

/**
 * Los planos se miden con comprobaciones (#248). Este test vigila tres cosas:
 * que ops/planos.json tenga la forma y el vocabulario cerrado, que la tabla de
 * ops/PLANOS.md salga de él (no se edita a mano) y que la medición guardada
 * siga siendo posible con lo que hay hoy en el repo (sin red).
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const datos = JSON.parse(leer("ops/planos.json"));
const md = leer("ops/PLANOS.md");
const AGENTES = readdirSync(join(RAIZ, ".claude/agents")).map((f) => f.replace(/\.md$/, ""));
const todos = datos.planos.flatMap((p) => NIVELES.flatMap((n) => (p.niveles[String(n)] ?? []).map((c) => ({ plano: p.id, nivel: n, c }))));
const donde = ({ plano, nivel, c }) => `plano ${plano}, nivel ${nivel}: «${c.que}»`;

describe("planos.json: forma y vocabulario cerrado", () => {
  it("los tipos de criterio del JSON son los del script, con su definición", () => {
    const aviso = "Un tipo nuevo va en TIPOS_CRITERIO de scripts/lib/planos.mjs (con su evaluación) Y en `vocabularios.tipos_criterio` de ops/planos.json.";
    expect(Object.keys(datos.vocabularios.tipos_criterio), aviso).toEqual(TIPOS_CRITERIO);
    expect(Object.keys(datos.vocabularios.estados_criterio), aviso).toEqual(ESTADOS_CRITERIO);
    expect(Object.keys(CAMPOS_POR_TIPO)).toEqual(TIPOS_CRITERIO);
    for (const d of Object.values(datos.vocabularios.tipos_criterio)) expect(d.length).toBeGreaterThan(20);
  });

  it("hay 13 planos, del 1 al 13, con todos sus campos", () => {
    expect(datos.planos.map((p) => p.id)).toEqual([...Array(13)].map((_, i) => i + 1));
    const faltan = [];
    for (const p of datos.planos) {
      for (const k of ["nombre", "pregunta", "agentes"]) if (typeof p[k] !== "string" || !p[k]) faltan.push(`${p.id}: ${k}`);
      for (const k of ["lanzar", "escalar"]) if (!Number.isInteger(p[k]) || p[k] < 0 || p[k] > 4) faltan.push(`${p.id}: ${k}`);
      if (p.lanzar > p.escalar) faltan.push(`${p.id}: lanzar > escalar`);
    }
    expect(faltan).toEqual([]);
  });

  it("cada nivel del 1 al 4 de cada plano tiene al menos un criterio (si no, el nivel saldría regalado)", () => {
    const vacios = datos.planos.flatMap((p) => NIVELES.filter((n) => !(p.niveles[String(n)]?.length)).map((n) => `plano ${p.id}, nivel ${n}`));
    expect(vacios, "Un nivel sin nada que comprobar se da por cumplido; si aún no se sabe cómo medirlo, pon un `por_definir`.").toEqual([]);
    for (const p of datos.planos) expect(Object.keys(p.niveles).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("cada criterio es de un tipo conocido y trae los campos de su tipo", () => {
    const malos = [];
    for (const x of todos) {
      const { c } = x;
      if (!TIPOS_CRITERIO.includes(c.tipo)) { malos.push(`${donde(x)}: tipo desconocido «${c.tipo}»`); continue; }
      if (typeof c.que !== "string" || c.que.length < 10) malos.push(`${donde(x)}: falta \`que\`, la frase en llano`);
      for (const k of CAMPOS_POR_TIPO[c.tipo]) if (c[k] === undefined || c[k] === "") malos.push(`${donde(x)}: falta \`${k}\``);
      const sobran = Object.keys(c).filter((k) => !["tipo", "que", "patron", "rama", "check", "issue", ...CAMPOS_POR_TIPO[c.tipo]].includes(k));
      if (sobran.length) malos.push(`${donde(x)}: campos que nadie lee: ${sobran.join(", ")}`);
    }
    expect(malos).toEqual([]);
  });

  it("los parámetros de cada tipo son válidos", () => {
    const malos = [];
    for (const x of todos) {
      const { c } = x;
      if (c.patron !== undefined) { try { new RegExp(c.patron); } catch { malos.push(`${donde(x)}: patrón inválido`); } }
      if (c.tipo === "test_existe" && !/\.test\.(js|mjs|jsx)$/.test(c.ruta)) malos.push(`${donde(x)}: un test_existe apunta a un *.test.js`);
      if (c.tipo === "workflow_activo" && !DISPARADORES.includes(c.disparador)) malos.push(`${donde(x)}: disparador «${c.disparador}»`);
      if (c.tipo === "regla_github") {
        if (!(c.regla in REGLAS_GITHUB)) malos.push(`${donde(x)}: regla «${c.regla}»`);
        else for (const k of REGLAS_GITHUB[c.regla]) if (!c[k]) malos.push(`${donde(x)}: la regla ${c.regla} pide \`${k}\``);
      }
      if (c.tipo === "cifra_umbral") {
        if (!(c.medidor in MEDIDORES)) malos.push(`${donde(x)}: medidor «${c.medidor}»`);
        if (!(c.operador in OPERADORES)) malos.push(`${donde(x)}: operador «${c.operador}»`);
        if (typeof c.umbral !== "number") malos.push(`${donde(x)}: umbral no numérico`);
      }
      if (c.tipo === "a_juicio") {
        if (![...AGENTES, ...PERSONAS].includes(c.quien)) malos.push(`${donde(x)}: «${c.quien}» no es un agente ni ${PERSONAS.join("/")}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) malos.push(`${donde(x)}: fecha AAAA-MM-DD`);
        if (typeof c.cumple !== "boolean") malos.push(`${donde(x)}: cumple es true o false`);
      }
    }
    expect(malos).toEqual([]);
  });

  it("cada regla de GitHub que el script sabe comprobar la usa algún criterio (sin código muerto)", () => {
    const usadas = new Set(todos.filter((x) => x.c.tipo === "regla_github").map((x) => x.c.regla));
    expect(Object.keys(REGLAS_GITHUB).filter((r) => !usadas.has(r))).toEqual([]);
  });

  it("la medición guardada tiene fecha, autor y un nivel 0-4 para cada plano", () => {
    const { medicion } = datos;
    expect(medicion.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof medicion.por).toBe("string");
    expect(Object.keys(medicion.niveles)).toEqual(datos.planos.map((p) => String(p.id)));
    for (const n of Object.values(medicion.niveles)) expect([0, 1, 2, 3, 4]).toContain(n);
    expect(Number.isInteger(datos.caducidad_juicio_dias)).toBe(true);
  });
});

describe("PLANOS.md sale de planos.json", () => {
  it("la tabla de PLANOS.md es la que genera planos.json", () => {
    expect(tablaActual(md), "La tabla no se edita a mano: cambia ops/planos.json y corre `npm run planos -- --tabla` (o `--red --escribir` si es una medición nueva).").toBe(generarTabla(datos));
  });

  it("el «Por qué cada nivel» dice el mismo nivel que la medición", () => {
    const malos = [];
    for (const p of datos.planos) {
      const m = md.match(new RegExp(`\\*\\*${p.id} · [^*(]+\\((\\d)[^)]*\\)\\.\\*\\*`));
      if (!m) malos.push(`${p.id}: falta su párrafo «**${p.id} · ${p.nombre} (n).**»`);
      else if (Number(m[1]) !== datos.medicion.niveles[String(p.id)]) malos.push(`${p.id}: el texto dice ${m[1]} y la medición ${datos.medicion.niveles[String(p.id)]}`);
    }
    expect(malos).toEqual([]);
  });
});

describe("la medición guardada sigue siendo posible (sin red)", () => {
  it("cada nivel guardado cae entre el nivel comprobado y el techo de hoy", () => {
    const m = medir(datos, { raiz: RAIZ, gh: null, hoy: datos.medicion.fecha });
    const fuera = m.desajustes.map((d) => `${d.id} · ${d.nombre}: guardado ${d.guardado}, hoy ${d.nivel}–${d.techo}`);
    expect(fuera, "Si baja: algo que el nivel necesitaba ha desaparecido (míralo con `npm run planos`). Si sube: guarda la medición con `npm run planos -- --red --escribir`.").toEqual([]);
  });
});

describe("el cálculo del nivel", () => {
  const ctx = { raiz: RAIZ, hoy: "2026-10-09", caducidad: 30, repo: "x/y", gh: null };

  it("el nivel es el más alto con todo cumplido, también lo de debajo", () => {
    expect(nivelDe({ 1: ["cumple"], 2: ["cumple", "cumple"], 3: ["no_cumple"], 4: ["cumple"] })).toEqual({ nivel: 2, techo: 2 });
    expect(nivelDe({ 1: ["no_cumple"], 2: ["cumple"], 3: ["cumple"], 4: ["cumple"] })).toEqual({ nivel: 0, techo: 0 });
  });

  it("«sin comprobar» nunca cuenta como cumplido: baja el nivel, no el techo", () => {
    expect(nivelDe({ 1: ["cumple"], 2: ["sin_comprobar"], 3: ["cumple"], 4: ["no_cumple"] })).toEqual({ nivel: 1, techo: 3 });
  });

  it("un nivel sin criterios no se regala", () => {
    expect(nivelDe({ 1: ["cumple"], 2: [], 3: ["cumple"], 4: ["cumple"] })).toEqual({ nivel: 1, techo: 1 });
  });

  it("sin red, todo lo de GitHub sale sin comprobar", () => {
    expect(evaluarCriterio({ tipo: "regla_github", regla: "secret_scanning", que: "x" }, ctx).estado).toBe("sin_comprobar");
    expect(evaluarCriterio({ tipo: "workflow_activo", fichero: "tests.yml", disparador: "push", que: "x" }, ctx).estado).toBe("sin_comprobar");
  });

  it("un workflow que no existe o no tiene el disparador no cumple, ni sin red", () => {
    expect(evaluarCriterio({ tipo: "workflow_activo", fichero: "no-existe.yml", disparador: "push", que: "x" }, ctx).estado).toBe("no_cumple");
    expect(evaluarCriterio({ tipo: "workflow_activo", fichero: "tests.yml", disparador: "schedule", que: "x" }, ctx).estado).toBe("no_cumple");
  });

  it("fichero_contiene y test_existe miran el patrón", () => {
    expect(evaluarCriterio({ tipo: "fichero_contiene", ruta: "package.json", patron: '"planos":', que: "x" }, ctx).estado).toBe("cumple");
    expect(evaluarCriterio({ tipo: "fichero_contiene", ruta: "package.json", patron: "no-esta-nunca-aqui", que: "x" }, ctx).estado).toBe("no_cumple");
    expect(evaluarCriterio({ tipo: "test_existe", ruta: "ops/no-existe.test.js", que: "x" }, ctx).estado).toBe("no_cumple");
  });

  it("cifra_umbral mide y compara; un medidor desconocido no cumple", () => {
    const r = evaluarCriterio({ tipo: "cifra_umbral", medidor: "errores_lint_base", operador: "<=", umbral: 100_000, que: "x" }, ctx);
    expect(r.estado).toBe("cumple");
    expect(r.valor).toBeGreaterThan(0);
    expect(evaluarCriterio({ tipo: "cifra_umbral", medidor: "inventado", operador: "<=", umbral: 1, que: "x" }, ctx).estado).toBe("no_cumple");
  });

  it("un juicio de hace más de N días sale caducado; por_definir nunca cumple", () => {
    expect(diasEntre("2026-09-01", "2026-10-09")).toBe(38);
    expect(evaluarCriterio({ tipo: "a_juicio", quien: "gobierno", fecha: "2026-09-01", cumple: true, nota: "n", que: "x" }, ctx).caducado).toBe(true);
    expect(evaluarCriterio({ tipo: "a_juicio", quien: "gobierno", fecha: "2026-10-01", cumple: true, nota: "n", que: "x" }, ctx).caducado).toBe(false);
    expect(evaluarCriterio({ tipo: "a_juicio", quien: "gobierno", fecha: "2026-10-01", cumple: true, nota: "n", que: "x" }, ctx).estado).toBe("cumple");
    expect(evaluarCriterio({ tipo: "por_definir", que: "x" }, ctx).estado).toBe("no_cumple");
  });

  it("un juicio caducado que decía «cumple» ya no cuenta: sale sin comprobar (baja el nivel, no el techo)", () => {
    const viejo = { tipo: "a_juicio", quien: "gobierno", fecha: "2026-09-01", cumple: true, nota: "n", que: "x" };
    expect(evaluarCriterio(viejo, ctx).estado).toBe("sin_comprobar");
    expect(evaluarCriterio({ ...viejo, cumple: false }, ctx).estado).toBe("no_cumple");
  });
});

describe("las reglas de GitHub, con un gh de mentira", () => {
  const gh = (respuestas) => (ruta) => respuestas[ruta] ?? { ok: false, status: 404, json: null };
  const repo = "x/y";
  const admin = { ok: true, status: 200, json: { permissions: { admin: true }, visibility: "public", security_and_analysis: { secret_scanning: { status: "enabled" } } } };
  const token = { ok: true, status: 200, json: { visibility: "public" } };

  const reglaTests = { ok: true, status: 200, json: [{ type: "required_status_checks", ruleset_id: 7, parameters: { required_status_checks: [{ context: "tests" }] } }] };
  const ruleset = (bypass) => ({ ok: true, status: 200, json: bypass === undefined ? { id: 7 } : { id: 7, bypass_actors: bypass } });
  const checkStaging = (respuestas) => evaluarReglaGithub({ regla: "check_obligatorio", rama: "staging", check: "tests" }, { repo, gh: gh({
    "repos/x/y": token, "repos/x/y/rules/branches/staging": reglaTests, ...respuestas,
  }) }).estado;

  it("el check de un ruleset cuenta como obligatorio si nadie se lo salta, salvo la deploy key permitida", () => {
    expect(checkStaging({ "repos/x/y/rulesets/7": ruleset([]) })).toBe("cumple");
    expect(checkStaging({ "repos/x/y/rulesets/7": ruleset([{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }]) })).toBe("cumple");
  });

  it("un ruleset con un bypass fuera de la lista (p. ej. el rol de administrador) no cumple", () => {
    // Visto por un administrador: la protección clásica (404) tampoco lo exige.
    const rol = ruleset([{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }]);
    expect(checkStaging({ "repos/x/y": admin, "repos/x/y/rulesets/7": rol })).toBe("no_cumple");
    expect(checkStaging({ "repos/x/y": admin, "repos/x/y/rulesets/7": ruleset([{ actor_id: 1, actor_type: "Integration", bypass_mode: "pull_request" }]) })).toBe("no_cumple");
    // Con el token de Actions no se sabe si la protección clásica lo exige: sin comprobar, nunca cumple.
    expect(checkStaging({ "repos/x/y/rulesets/7": rol })).toBe("sin_comprobar");
  });

  it("si no se pueden leer los bypass del ruleset, sin comprobar", () => {
    expect(checkStaging({})).toBe("sin_comprobar");
    expect(checkStaging({ "repos/x/y/rulesets/7": ruleset(undefined) })).toBe("sin_comprobar");
  });

  it("con el token de Actions (sin admin), lo que solo ve un administrador queda sin comprobar, no en «no cumple»", () => {
    const g = gh({ "repos/x/y": token, "repos/x/y/rules/branches/main": { ok: true, status: 200, json: [] } });
    expect(evaluarReglaGithub({ regla: "check_obligatorio", rama: "main", check: "tests" }, { repo, gh: g }).estado).toBe("sin_comprobar");
    expect(evaluarReglaGithub({ regla: "admins_incluidos", rama: "main" }, { repo, gh: g }).estado).toBe("sin_comprobar");
    expect(evaluarReglaGithub({ regla: "dependabot_alertas" }, { repo, gh: g }).estado).toBe("sin_comprobar");
    expect(evaluarReglaGithub({ regla: "secret_scanning" }, { repo, gh: g }).estado).toBe("sin_comprobar");
  });

  it("un administrador que recibe 404 sí es «no cumple»", () => {
    const g = gh({ "repos/x/y": admin, "repos/x/y/rules/branches/main": { ok: true, status: 200, json: [] } });
    expect(evaluarReglaGithub({ regla: "check_obligatorio", rama: "main", check: "tests" }, { repo, gh: g }).estado).toBe("no_cumple");
    expect(evaluarReglaGithub({ regla: "dependabot_alertas" }, { repo, gh: g }).estado).toBe("no_cumple");
    expect(evaluarReglaGithub({ regla: "secret_scanning" }, { repo, gh: g }).estado).toBe("cumple");
  });

  it("sin red ni gh, nada", () => {
    const r = evaluarReglaGithub({ regla: "secret_scanning" }, { repo, gh: () => ({ ok: false, status: null, json: null }) });
    expect(r.estado).toBe("sin_comprobar");
  });
});

describe("tabla e issue", () => {
  it("sustituirTabla cambia solo lo de entre las marcas", () => {
    const tabla = generarTabla(datos);
    expect(tablaActual(sustituirTabla(md, tabla))).toBe(tabla);
    expect(() => sustituirTabla("sin marcas", tabla)).toThrow();
  });

  it("el issue sale solo si algo no cuadra o hay juicios caducados", () => {
    const base = { fecha: "2026-10-12", planos: [], desajustes: [], caducados: [] };
    expect(cuerpoIssue(base)).toBeNull();
    const p = { id: 1, nombre: "Flujo", criterios: [{ nivel: 2, que: "staging exige tests", estado: "no_cumple", detalle: "d" }] };
    const cuerpo = cuerpoIssue({ ...base, planos: [p], desajustes: [{ id: 1, nombre: "Flujo", guardado: 3, nivel: 1, techo: 1, sentido: "baja" }] });
    expect(cuerpo).toMatch(/\| 1 \| Flujo \| 3 \| 1–1 \| baja \|/);
    expect(cuerpo).toMatch(/staging exige tests/);
  });
});
