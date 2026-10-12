import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENTES, CONSTRUCTORES, JUECES, agentesDe } from "../scripts/lib/agentes.mjs";
import { ACTORES } from "../scripts/lib/flujo.mjs";
import { CAPAS_AGENTE } from "../scripts/lib/fondos.mjs";
import { ACCIONES, leerEstandares, tareasDe } from "../scripts/lib/estandaresAgentes.mjs";
import { CATALOGO, COMPLEXITIES, PIPELINES, problemas as problemasDePresupuesto } from "../scripts/lib/presupuestos.mjs";
import {
  DATOS, FLAGS, MARCA_FIN, MARCA_INICIO, SUBTYPES, TYPES, encargoDe, juecesDe, pasosMinimos, problemas, problemasDeEsqueleto, regenerarOrquestar, rolDe, tablaPipelines,
} from "../scripts/lib/tiposDeEncargo.mjs";

/**
 * Los tipos de encargo (#640, fondo #639): CINCO tipos con su esqueleto y los 17 de siempre como subtipos
 * (ops/tipos-de-encargo.json, lector scripts/lib/tiposDeEncargo.mjs). Falla si:
 *  1. un subtipo no cuelga de un tipo, no cumple su esqueleto o se queda sin juez que entre siempre;
 *  2. una condición opcional no es una bandera del vocabulario cerrado;
 *  3. la tabla «Qué pipeline» de /orquestar no es la que sale del JSON (ya no se compara con una copia: se genera);
 *  4. un agente de un tipo no existe, no tiene tarea con estándar, o un agente con tarea no lo usa ningún tipo;
 *  5. la lista de jueces no es la de .claude/agents (una sola fuente) o se copia a otro sitio y se separa;
 *  6. se pierde un campo que lee el panel de la factoría (homenu-panel);
 *  7. la complejidad no cubre el vocabulario cerrado.
 * Al final, cada regla nueva se ve fallar con datos malos: cada caso cambia UNA cosa. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8").replace(/\r\n/g, "\n");
const clon = (x) => JSON.parse(JSON.stringify(x));
const ESPECIALES = Object.keys(DATOS.especiales);
const sub = (id) => SUBTYPES.find((s) => s.id === id);

describe("los tipos y subtipos", () => {
  it("son cinco tipos y 22 subtipos (los 17 de siempre y un `<tipo>-other` por tipo), cada uno colgado de un tipo que existe", () => {
    expect(Object.keys(TYPES)).toEqual(["create", "fix", "improve", "operate", "audit"]);
    expect(SUBTYPES).toHaveLength(22);
    const ids = SUBTYPES.map((s) => s.id);
    for (const t of Object.keys(TYPES)) expect(ids, `falta ${t}-other`).toContain(`${t}-other`);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SUBTYPES) expect(Object.keys(TYPES), `${s.id} cuelga de «${s.type}»`).toContain(s.type);
    for (const t of Object.keys(TYPES)) expect(SUBTYPES.some((s) => s.type === t), `el tipo ${t} no tiene subtipos`).toBe(true);
  });

  it("el catálogo entero pasa sus reglas de forma, esqueleto y banderas", () => {
    expect(problemas()).toEqual([]);
  });

  it("cada subtipo cumple el esqueleto de su tipo", () => {
    for (const s of SUBTYPES) expect(problemasDeEsqueleto(s), s.id).toEqual([]);
  });

  it("ningún tipo ni subtipo se queda con constructor y sin juez (el juez mínimo, siempre)", () => {
    for (const [k, t] of Object.entries(TYPES)) expect(t.skeleton.roles, k).toContain("judge");
    for (const s of SUBTYPES) expect(juecesDe(s).always.length, `${s.id} sin juez que entre siempre`).toBeGreaterThan(0);
    // Los dos que tenían constructor y ningún juez (#639): ahora llevan revisor, y seguridad por bandera.
    expect(juecesDe(sub("ci-permisos-hooks"))).toEqual({ always: ["revisor"], optional: [{ agente: "seguridad", flag: "touches_secrets_or_permissions" }] });
    expect(juecesDe(sub("desplegar-produccion"))).toEqual({ always: ["revisor"], optional: [{ agente: "evaluador", flag: "changes_bot" }] });
  });

  it("lo irreversible cierra con una persona, lo que se mejora dice qué mide y una auditoría solo lleva jueces", () => {
    expect(sub("desplegar-produccion")).toMatchObject({ irreversible: true, cierra_con: "OK de una persona" });
    expect(sub("esquema-o-dato").cierra_con).toBe("OK para aplicar");
    for (const s of SUBTYPES.filter((x) => x.type === "improve")) expect(s.measure.length, s.id).toBeGreaterThan(9);
    const auditoria = sub("revision-periodica");
    expect(auditoria.pasos).toHaveLength(1);
    expect(auditoria.pasos[0].agentes.filter((a) => !JUECES.includes(a))).toEqual(auditoria.measured_with);
  });

  it("un bug se diagnostica antes de construir", () => {
    const [primero, segundo] = sub("bug").pasos;
    expect(JUECES).toContain(primero.agentes[0]);
    expect(primero.nota).toMatch(/diagnóstico/);
    expect(segundo.agentes).toEqual(["constructor"]);
  });
});

describe("las condiciones, en vocabulario cerrado", () => {
  it("toda condición opcional es una bandera con nombre y su texto es el de la bandera", () => {
    const usadas = SUBTYPES.flatMap((s) => s.pasos.flatMap((p) => p.opcional ?? []));
    expect(usadas.length).toBeGreaterThanOrEqual(4);
    for (const o of usadas) {
      expect(Object.keys(FLAGS), o.si).toContain(o.flag);
      expect(o.si).toBe(FLAGS[o.flag].si);
    }
  });

  it("cada bandera la usa algún subtipo (nada sin lector)", () => {
    const usadas = new Set(SUBTYPES.flatMap((s) => s.pasos.flatMap((p) => (p.opcional ?? []).map((o) => o.flag))));
    expect([...usadas].sort()).toEqual(Object.keys(FLAGS).sort());
  });
});

describe("la tabla de /orquestar se genera desde el catálogo", () => {
  const md = leer(".claude/commands/orquestar.md");
  const generada = tablaPipelines();

  it("lo que hay entre las marcas es lo que sale del JSON", () => {
    const i = md.indexOf(MARCA_INICIO) + MARCA_INICIO.length;
    const f = md.indexOf(MARCA_FIN);
    expect(i).toBeGreaterThan(MARCA_INICIO.length);
    expect(md.slice(i, f).trim(), "Regenera con `npm run flujo -- --escribir`").toBe(generada);
  });

  it("regenerar deja el fichero igual y falla sin marcas", () => {
    expect(regenerarOrquestar(md)).toBe(md);
    expect(() => regenerarOrquestar("sin marcas")).toThrow(/marcas/);
  });

  it("tiene una fila por subtipo, con su tipo, y cada agente que nombra existe", () => {
    const filas = generada.split("\n").slice(2);
    expect(filas).toHaveLength(SUBTYPES.length);
    filas.forEach((f, i) => expect(f.startsWith(`| ${SUBTYPES[i].type} |`)).toBe(true));
  });

  it("el catálogo de agentes de /orquestar lista los mismos jueces y constructores que .claude/agents", () => {
    const catalogo = md.slice(md.indexOf("## 2. Catálogo"), md.indexOf("## 3."));
    const filas = catalogo.split("\n").map((l) => /^\| `([^`]+)` \| (constructor|juez) \|/.exec(l)).filter(Boolean);
    expect(filas.filter((m) => m[2] === "juez").map((m) => m[1]).sort()).toEqual([...JUECES].sort());
    expect(filas.filter((m) => m[2] === "constructor").map((m) => m[1]).sort()).toEqual([...CONSTRUCTORES].sort());
  });
});

describe("uniones con los agentes y sus estándares", () => {
  const estandares = leerEstandares(RAIZ);
  const tareas = tareasDe(estandares);
  const nombrados = [...new Set(SUBTYPES.flatMap((s) => s.pasos.flatMap((p) => [...(p.agentes ?? []), ...(p.opcional ?? []).map((o) => o.agente)])))];

  it("todo agente de un tipo existe (o es un especial) y tiene tarea con estándar", () => {
    for (const a of nombrados.filter((x) => !ESPECIALES.includes(x))) {
      expect(Object.keys(AGENTES), a).toContain(a);
      const suyas = tareas.filter((t) => t.agente === a);
      expect(suyas.length, `${a} no tiene tarea en ops/estandares-agentes.json`).toBeGreaterThan(0);
      for (const { tarea } of suyas) {
        expect(ACCIONES, `${a}: ${tarea.id}`).toContain(tarea.accion);
        expect((tarea.reglas?.length ?? 0) + (tarea.normas?.length ?? 0) + (tarea.comunes?.length ?? 0) + (tarea.ambitos?.length ?? 0), `${a}: ${tarea.id} sin estándar`).toBeGreaterThan(0);
      }
    }
  });

  it("todo agente con tarea lo usa algún tipo", () => {
    for (const a of new Set(tareas.map((t) => t.agente))) expect(nombrados, `${a} tiene tarea y ningún tipo lo usa`).toContain(a);
  });

  it("todo agente de .claude/agents tiene tarea, y su tipo es constructor o juez", () => {
    for (const [a, tipo] of Object.entries(AGENTES)) {
      expect(["constructor", "juez"], a).toContain(tipo);
      expect(tareas.some((t) => t.agente === a), a).toBe(true);
    }
  });
});

describe("la lista de jueces vive en un solo sitio", () => {
  it("es la de las cabeceras «Tipo: juez» de .claude/agents", () => {
    const dir = join(RAIZ, ".claude", "agents");
    const aMano = readdirSync(dir).filter((f) => f.endsWith(".md") && /^Tipo:\s*juez\s*$/m.test(readFileSync(join(dir, f), "utf8"))).map((f) => f.slice(0, -3));
    expect([...JUECES].sort()).toEqual(aMano.sort());
    expect(agentesDe()).toEqual(AGENTES);
  });

  it("el vocabulario de actores y el glosario la definen sin copiarla, y el presupuesto la re-exporta", async () => {
    const presupuestos = await import("../scripts/lib/presupuestos.mjs");
    expect(presupuestos.JUECES).toBe(JUECES);
    const vida = JSON.parse(leer("ops/vocabularios-vida.json"));
    expect(vida.anclados["flujo.actores"].juez).toBe(ACTORES.juez);
    // Nadie vuelve a escribir la lista en código: los scripts no copian los nombres de los cinco juntos.
    for (const f of ["scripts/lib/presupuestos.mjs", "scripts/lib/flujo.mjs"]) expect(leer(f), f).not.toMatch(/"auditor-datos",\s*"evaluador"/);
  });
});

describe("el presupuesto y los tipos, por un mismo lector", () => {
  it("la complejidad cubre el vocabulario y el catálogo de presupuestos la valida", () => {
    expect(Object.keys(COMPLEXITIES)).toEqual(["trivial", "normal", "large"]);
    expect(Object.keys(CATALOGO.by_complexity)).toEqual(Object.keys(COMPLEXITIES));
    for (const c of Object.values(CATALOGO.by_complexity)) expect(Object.keys(PIPELINES)).toContain(c.pipeline);
    expect(problemasDePresupuesto(CATALOGO)).toEqual([]);
  });

  it("toda complejidad lanza al menos un juez, también lo trivial, en cualquier subtipo", () => {
    for (const [c, b] of Object.entries(CATALOGO.by_complexity)) expect(b.jueces_min, c).toBeGreaterThanOrEqual(1);
    expect(Object.keys(PIPELINES)).toEqual(["minimal", "complete"]);
    for (const s of SUBTYPES) {
      for (const complexity of Object.keys(COMPLEXITIES)) {
        const e = encargoDe({ subtype: s.id, scope: "local", cause: "codigo", complexity });
        const nombrados = e.steps.flatMap((p) => [...(p.agentes ?? []), ...(p.opcional ?? []).map((o) => o.agente)]).filter((a) => JUECES.includes(a));
        expect(nombrados.length, `${s.id} ${complexity} no lanza ningún juez`).toBeGreaterThan(0);
        expect(e.judges_min).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("dado subtipo, alcance, causa y complejidad, devuelve los datos de los dos catálogos sin copiarlos", () => {
    const g = encargoDe({ subtype: "desplegar-produccion", scope: "transversal", cause: "codigo", complexity: "large" });
    expect(g).toMatchObject({ type: "operate", pipeline: "complete", close_with: "OK de una persona", judges_min: 2 });
    expect(g.steps).toEqual(sub("desplegar-produccion").pasos);
    // Las rondas y los minutos son del fondo, no del encargo.
    expect(g).not.toHaveProperty("rondas_max");
    expect(g.fund_rondas_max).toBe(CATALOGO.por_alcance.transversal.rondas_max);
    expect(g.fund_minutes).toBe(CATALOGO.por_alcance.transversal.minutos_orientativos);
  });

  it("compone con el presupuesto de la causa: un bug de modelo-datos pide auditor-datos y avisa de que el subtipo no lo lleva", () => {
    const e = encargoDe({ subtype: "bug", scope: "modulo", cause: "modelo-datos", complexity: "normal" });
    expect(e.judges_required).toEqual(["auditor-datos"]);
    expect(e.missing_judges).toEqual(["auditor-datos"]);
    expect(e.judges_min).toBe(1);
    expect(e.warnings.join(" ")).toMatch(/auditor-datos/);
    const bien = encargoDe({ subtype: "esquema-o-dato", scope: "modulo", cause: "modelo-datos", complexity: "normal" });
    expect(bien.missing_judges).toEqual([]);
  });

  it("avisa si el subtipo lleva menos jueces distintos de los que pide el presupuesto", () => {
    const e = encargoDe({ subtype: "bug", scope: "transversal", cause: "codigo", complexity: "large" });
    expect(e.judges_min).toBe(2);
    expect(e.warnings.some((w) => /pide 2/.test(w))).toBe(true);
    const ok = encargoDe({ subtype: "pantalla-nueva", scope: "transversal", cause: "codigo", complexity: "large" });
    expect(ok.warnings).toEqual([]);
  });

  it("devuelve null si algún valor no existe", () => {
    expect(encargoDe({ subtype: "nada", scope: "local", cause: "codigo", complexity: "normal" })).toBeNull();
    expect(encargoDe({ subtype: "bug", scope: "enorme", cause: "codigo", complexity: "normal" })).toBeNull();
    expect(encargoDe({ subtype: "bug", scope: "local", cause: "inventada", complexity: "normal" })).toBeNull();
    expect(encargoDe({ subtype: "bug", scope: "local", cause: "codigo", complexity: "gigante" })).toBeNull();
  });
});

describe("los pasos mínimos conservan las condiciones y no cuentan la planificación como construcción", () => {
  const agentes = (pasos) => pasos.map((p) => p.agentes ?? []);
  it("un esquema normal con RLS conserva a seguridad con su bandera", () => {
    const e = encargoDe({ subtype: "esquema-o-dato", scope: "local", cause: "codigo", complexity: "normal" });
    expect(agentes(e.steps)).toEqual([["datos"], ["auditor-datos"]]);
    expect(e.steps[1].opcional).toEqual([{ agente: "seguridad", si: "toca RLS", flag: "touches_rls" }]);
    expect(e.steps[1].opcional[0].flag).toBe("touches_rls");
  });
  it("una función entre dominios: la sesión planifica y no cuenta; queda el constructor por dominio y su juez", () => {
    expect(rolDe("sesion")).toBe("planner");
    expect(agentes(pasosMinimos(sub("funcion-entre-dominios")))).toEqual([["constructores"], ["revisor", "qa"]]);
  });
  it("un refactor de monolito: plan de la sesión fuera, queda constructor y revisor", () => {
    expect(agentes(pasosMinimos(sub("refactor-monolito")))).toEqual([["constructor"], ["revisor"]]);
  });
  it("las recetas las construye la sesión (builds_in_session): su mínimo es la sesión y el revisor", () => {
    expect(sub("recetas-o-catalogo").builds_in_session).toBe(true);
    expect(agentes(pasosMinimos(sub("recetas-o-catalogo")))).toEqual([["sesion"], ["revisor"]]);
  });
  it("una desplegada normal conserva la bandera de evaluador", () => {
    const pasos = pasosMinimos(sub("desplegar-produccion"));
    expect(pasos[1].opcional).toEqual([{ agente: "evaluador", si: "cambia el bot", flag: "changes_bot" }]);
  });
  it("una auditoría: el primer paso con juez, entero", () => {
    expect(pasosMinimos(sub("revision-periodica"))).toEqual(sub("revision-periodica").pasos);
  });
});

describe("las definiciones no enumeran a mano a los agentes", () => {
  it("«juez» y el constructor del dominio se definen por su cabecera y ningún nombre de agente va escrito", () => {
    const glosario = JSON.parse(leer("ops/glosario/terminos/juez.json"));
    for (const texto of [ACTORES.juez, ACTORES.agente_dominio, glosario.definicion]) {
      for (const a of Object.keys(AGENTES)) expect(texto, `«${texto}» nombra a ${a}`).not.toContain(a);
    }
    expect(ACTORES.juez).toContain("Tipo: juez");
    expect(ACTORES.agente_dominio).toContain("Tipo: constructor");
    expect(glosario.definicion).toContain("Tipo: juez");
    // Los dos sentidos: lo definido es lo que hay en la carpeta.
    expect(JUECES.length + CONSTRUCTORES.length).toBe(Object.keys(AGENTES).length);
  });
  it("los agentes del vocabulario de capas del fondo son los de la carpeta más la sesión", () => {
    expect([...CAPAS_AGENTE].sort()).toEqual([...Object.keys(AGENTES), "sesión"].sort());
  });
  it("el JSON de tipos no enumera a los constructores en la descripción de «constructor»", () => {
    for (const a of CONSTRUCTORES) expect(DATOS.especiales.constructor).not.toContain(a);
  });
});

describe("lo que lee el panel de la factoría (homenu-panel) no se rompe", () => {
  it("siguen los campos de siempre: tipos[].id, accion, pasos, cierra_con, opcional (con si) y especiales", () => {
    expect(DATOS.version).toBe(1);
    expect(Object.keys(DATOS.especiales)).toEqual(["sesion", "constructor", "constructores"]);
    for (const t of DATOS.tipos) {
      expect(t.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(t.accion.length).toBeGreaterThan(2);
      expect(t.pasos.length).toBeGreaterThan(0);
      for (const p of t.pasos) for (const o of p.opcional ?? []) expect(typeof o.si).toBe("string");
    }
    expect(DATOS.tipos.filter((t) => t.cierra_con).map((t) => t.id)).toEqual(["esquema-o-dato", "desplegar-produccion"]);
  });
});

describe("cada regla nueva, vista fallar con datos malos", () => {
  const MALOS = [
    ["tipo", "un subtipo cuelga de un tipo que no existe", (d) => { d.tipos[0].type = "inventar"; }],
    ["roles", "un tipo crear sin juez detrás del constructor", (d) => { d.tipos.find((s) => s.id === "assets").pasos = [{ agentes: ["diseno"] }]; }],
    ["juez-siempre", "un juez que solo entra por una bandera", (d) => { d.tipos.find((s) => s.id === "ci-permisos-hooks").pasos = [{ agentes: ["gobierno"] }, { opcional: [{ agente: "seguridad", si: "toca secretos o permisos", flag: "touches_secrets_or_permissions" }] }]; }],
    ["roles", "arreglar sin diagnóstico antes de construir", (d) => { d.tipos.find((s) => s.id === "bug").pasos = [{ agentes: ["constructor"] }, { agentes: ["revisor"] }]; }],
    ["medida", "improve sin decir qué se mide", (d) => { delete d.tipos.find((s) => s.id === "lento-o-caro").measure; }],
    ["cierre", "operar irreversible sin cierre de persona", (d) => { delete d.tipos.find((s) => s.id === "desplegar-produccion").cierra_con; }],
    ["cierre", "operar sin decir si es irreversible", (d) => { delete d.tipos.find((s) => s.id === "ci-permisos-hooks").irreversible; }],
    ["solo-jueces", "auditar con un constructor que no mide", (d) => { delete d.tipos.find((s) => s.id === "revision-periodica").measured_with; }],
    ["paralelo", "auditar en dos pasos", (d) => { d.tipos.find((s) => s.id === "revision-periodica").pasos = [{ agentes: ["seguridad"] }, { agentes: ["revisor"] }]; }],
    ["bandera", "una condición sin bandera", (d) => { delete d.tipos.find((s) => s.id === "esquema-o-dato").pasos[1].opcional[0].flag; }],
    ["bandera", "un texto que no es el de su bandera", (d) => { d.tipos.find((s) => s.id === "esquema-o-dato").pasos[1].opcional[0].si = "toca rls o algo"; }],
    ["agente", "un agente que no existe", (d) => { d.tipos.find((s) => s.id === "bug").pasos[0].agentes = ["inventado"]; }],
    ["juez", "un tipo sin juez en su esqueleto", (d) => { d.assignment_types.create.skeleton.roles = ["builder"]; }],
    ["id", "dos subtipos con el mismo id", (d) => { d.tipos[1].id = d.tipos[0].id; }],
    ["otro", "un tipo sin su subtipo «-other»", (d) => { d.tipos = d.tipos.filter((s) => s.id !== "fix-other"); }],
    ["orden", "subtipos que no van agrupados por tipo", (d) => { d.tipos.push(d.tipos.shift()); }],
    ["roles", "el subtipo que construye en la sesión sin paso de sesión", (d) => { d.tipos.find((s) => s.id === "recetas-o-catalogo").pasos[0] = { agentes: ["revisor"] }; }],
    ["especial", "un especial sin rol", (d) => { delete d.special_roles.sesion; }],
    ["medida", "medida en un subtipo que no es de mejorar", (d) => { d.tipos.find((s) => s.id === "bug").measure = "una medida que no toca aquí"; }],
  ];
  it.each(MALOS)("%s: %s", (regla, _que, cambia) => {
    const d = clon(DATOS);
    cambia(d);
    expect(problemas(d).some((p) => p.startsWith(`${regla}:`)), problemas(d).join(" | ")).toBe(true);
  });

  it("la complejidad: sin una fila, con un pipeline que no existe o con jueces que bajan", () => {
    const sin = clon(CATALOGO);
    delete sin.by_complexity.normal;
    const raro = clon(CATALOGO);
    raro.by_complexity.large.pipeline = "todo";
    const baja = clon(CATALOGO);
    baja.by_complexity.large.jueces_min = 0;
    for (const c of [sin, raro, baja]) expect(problemasDePresupuesto(c).some((p) => p.startsWith("complejidad:"))).toBe(true);
  });
});
