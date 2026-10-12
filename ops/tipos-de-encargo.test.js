import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENTES, CONSTRUCTORES, JUECES, agentesDe } from "../scripts/lib/agentes.mjs";
import { AMBITOS, JUEZ_SIEMPRE, juecesDeAmbitos } from "../scripts/lib/ambitos.mjs";
import { ACTORES } from "../scripts/lib/flujo.mjs";
import { CAPAS_AGENTE } from "../scripts/lib/fondos.mjs";
import { ACCIONES, leerEstandares, tareasDe } from "../scripts/lib/estandaresAgentes.mjs";
import { CATALOGO, COMPLEXITIES, PIPELINES, problemas as problemasDePresupuesto } from "../scripts/lib/presupuestos.mjs";
import {
  ALIASES, ALL_SUBTYPES, COUNTERS, DATOS, DIFFERS_IN, FLAGS, MARCA_FIN, MARCA_INICIO, MARCA_JUECES_FIN, MARCA_JUECES_INICIO, MAX_ACCION, MAX_NOTE, MIN_USOS, REGLAS_PUERTA, SUBTYPES, TYPES, ZONAS,
  avisosDeUso, conPuertaN1, tablaJueces, encargoDe, facetasDe, juecesDe, pasosMinimos, problemas, problemasDeEsqueleto, regenerarOrquestar, rolDe, tablaPipelines, textoN1Puerta, zonasQueNombra,
} from "../scripts/lib/tiposDeEncargo.mjs";

/**
 * Los tipos de encargo (#640, fondo #639): CINCO tipos con su esqueleto y sus subtipos
 * (ops/tipos-de-encargo.json, lector scripts/lib/tiposDeEncargo.mjs), y la PUERTA DE ENTRADA de un subtipo (#646, fondo #645). Falla si:
 *  1. un subtipo no cuelga de un tipo, no cumple su esqueleto o se queda sin juez que entre siempre;
 *  2. una condición opcional no es una bandera del vocabulario cerrado;
 *  3. la tabla «Qué pipeline» de /orquestar no es la que sale del JSON (ya no se compara con una copia: se genera);
 *  4. un agente de un tipo no existe, no tiene tarea con estándar, o un agente con tarea no lo usa ningún tipo;
 *  5. la lista de jueces no es la de .claude/agents (una sola fuente) o se copia a otro sitio y se separa;
 *  6. se pierde un campo que lee el panel de la factoría (homenu-panel);
 *  7. la complejidad no cubre el vocabulario cerrado;
 *  8. un subtipo activo nombra una zona, no difiere de su tipo en lo que declara, lleva texto libre fuera de `note`,
 *     rompe la plantilla del nombre, o un alias retirado no dice a qué activo pasa.
 * Al final, cada regla nueva se ve fallar con datos malos: cada caso cambia UNA cosa. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8").replace(/\r\n/g, "\n");
const clon = (x) => JSON.parse(JSON.stringify(x));
const ESPECIALES = Object.keys(DATOS.especiales);
const sub = (id) => ALL_SUBTYPES.find((s) => s.id === id);
/** Los 22 ids de antes (los 17 de siempre y los cinco `-other` de #640): ninguno desaparece, los lee el panel de la factoría. */
const IDS_DE_ANTES = [
  "pantalla-nueva", "assets", "lola-herramienta", "lola-conocimiento", "esquema-o-dato", "recetas-o-catalogo", "funcion-entre-dominios", "endpoint-nuevo", "create-other",
  "bug", "fix-other", "migrar-a-tokens", "dato-en-varias-capas", "reducir-cableado", "lento-o-caro", "refactor-monolito", "improve-other",
  "ci-permisos-hooks", "desplegar-produccion", "operate-other", "revision-periodica", "audit-other",
];
const ACTIVOS = [
  "create-plain", "create-person-approved", "create-planned", "create-in-session", "fix-bug", "improve-measured", "improve-structure", "improve-layers",
  "operate-reversible", "operate-irreversible", "audit-periodic", "audit-other",
];

describe("los tipos y subtipos", () => {
  it("son cinco tipos y 12 subtipos activos por naturaleza del trabajo, cada uno colgado de un tipo que existe", () => {
    expect(Object.keys(TYPES)).toEqual(["create", "fix", "improve", "operate", "audit"]);
    expect(SUBTYPES.map((s) => s.id)).toEqual(ACTIVOS);
    const ids = ALL_SUBTYPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ALL_SUBTYPES) expect(Object.keys(TYPES), `${s.id} cuelga de «${s.type}»`).toContain(s.type);
    for (const t of Object.keys(TYPES)) expect(SUBTYPES.some((s) => s.type === t), `el tipo ${t} no tiene subtipos activos`).toBe(true);
  });

  it("los 22 ids de antes siguen en el JSON: 21 retirados con su sustituto activo y audit-other, que sigue activo", () => {
    expect(ALL_SUBTYPES).toHaveLength(IDS_DE_ANTES.length + ACTIVOS.filter((a) => !IDS_DE_ANTES.includes(a)).length);
    for (const id of IDS_DE_ANTES) expect(ALL_SUBTYPES.map((s) => s.id), `se perdió el id ${id}`).toContain(id);
    expect(ALIASES).toHaveLength(21);
    for (const a of ALIASES) {
      expect(IDS_DE_ANTES, `${a.id} no es un id de antes`).toContain(a.id);
      expect(SUBTYPES.map((s) => s.id), `${a.id} pasa a ${a.replaced_by}`).toContain(a.replaced_by);
    }
    expect(SUBTYPES.filter((s) => IDS_DE_ANTES.includes(s.id)).map((s) => s.id)).toEqual(["audit-other"]);
  });

  it("cada id retirado está retirado también en el registro de vocabularios, con el mismo sustituto", () => {
    const vida = JSON.parse(leer("ops/vocabularios-vida.json"));
    for (const a of ALIASES) {
      const r = vida.retirados.find((x) => x.vocabulario === "encargo.subtype" && x.valor === a.id);
      expect(r, `${a.id} no está retirado en ops/vocabularios-vida.json`).toBeTruthy();
      expect(r.pasa_a).toBe(a.replaced_by);
    }
    expect(Object.keys(vida.anclados["encargo.subtype"])).toEqual(ACTIVOS);
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
    // Los dos que tenían constructor y ningún juez (#639): llevan revisor, y seguridad o evaluador por bandera.
    expect(juecesDe(sub("operate-reversible"))).toEqual({ always: ["revisor"], optional: [{ agente: "seguridad", flag: "touches_secrets_or_permissions" }] });
    expect(juecesDe(sub("operate-irreversible"))).toEqual({ always: ["revisor"], optional: [{ agente: "evaluador", flag: "changes_bot" }, { agente: "seguridad", flag: "touches_secrets_or_permissions" }] });
  });

  it("lo irreversible cierra con una persona, lo que se mejora dice qué mide y una auditoría solo lleva jueces", () => {
    expect(sub("operate-irreversible")).toMatchObject({ irreversible: true, closing: "person_ok", cierra_con: "OK de una persona" });
    expect(sub("operate-reversible")).toMatchObject({ irreversible: false });
    expect(sub("create-person-approved")).toMatchObject({ closing: "person_ok", cierra_con: "OK de una persona" });
    for (const s of SUBTYPES.filter((x) => x.type === "improve")) expect(Object.keys(DATOS.measures), s.id).toContain(s.measure_kind);
    for (const s of SUBTYPES.filter((x) => x.measure_kind === "counter_before_after")) for (const c of s.counters) expect(Object.keys(COUNTERS), s.id).toContain(c);
    const auditoria = sub("audit-periodic");
    expect(auditoria.pasos).toHaveLength(1);
    expect(auditoria.pasos[0].agentes.filter((a) => !JUECES.includes(a))).toEqual(auditoria.measured_with);
  });

  it("un bug se diagnostica antes de construir", () => {
    const [primero, segundo] = sub("fix-bug").pasos;
    expect(JUECES).toContain(primero.agentes[0]);
    expect(primero.purpose).toBe("diagnose");
    expect(segundo.agentes).toEqual(["constructor"]);
  });
});

describe("las condiciones, en vocabulario cerrado", () => {
  it("toda condición opcional es una bandera con nombre y su texto es el de la bandera", () => {
    const usadas = SUBTYPES.flatMap((s) => s.pasos.flatMap((p) => p.opcional ?? []));
    expect(usadas.length).toBeGreaterThanOrEqual(3);
    for (const o of usadas) {
      expect(Object.keys(FLAGS), o.si).toContain(o.flag);
      expect(o.si).toBe(FLAGS[o.flag].si);
    }
  });

  it("cada bandera dice el juez que dispara (un juez que existe) y el que la usa en un subtipo es ese mismo", () => {
    for (const [k, b] of Object.entries(FLAGS)) expect(JUECES, `${k}: su juez`).toContain(b.judge);
    for (const s of SUBTYPES) for (const o of s.pasos.flatMap((p) => p.opcional ?? [])) expect(o.agente, `${s.id}: ${o.flag}`).toBe(FLAGS[o.flag].judge);
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
    filas.forEach((f, i) => expect(f.startsWith(`| ${SUBTYPES[i].type} | \`${SUBTYPES[i].id}\` |`), f).toBe(true));
    // Los alias retirados no se ofrecen: la tabla es de los activos.
    for (const a of ALIASES) expect(generada, a.id).not.toContain(`\`${a.id}\``);
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
  const nombrados = [...new Set(ALL_SUBTYPES.flatMap((s) => s.pasos.flatMap((p) => [...(p.agentes ?? []), ...(p.opcional ?? []).map((o) => o.agente)])))];

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

  it("todo juez con tarea lo usa algún subtipo activo o lo pide una zona, y los constructores entran por el especial «constructor»", () => {
    const activos = new Set([
      ...SUBTYPES.flatMap((s) => s.pasos.flatMap((p) => [...(p.agentes ?? []), ...(p.opcional ?? []).map((o) => o.agente)])),
      ...Object.values(AMBITOS).flatMap((a) => a.jueces.map((j) => j.juez)),
    ]);
    for (const a of new Set(tareas.map((t) => t.agente))) {
      // Un subtipo describe el trabajo, no la zona: el constructor de la zona (diseno, lola, datos…) sale de los ficheros, no del subtipo.
      if (CONSTRUCTORES.includes(a)) continue;
      expect(activos, `${a} tiene tarea y ningún subtipo activo lo usa`).toContain(a);
    }
    expect([...activos]).toEqual(expect.arrayContaining(["constructor", "constructores", "sesion"]));
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
    const g = encargoDe({ subtype: "operate-irreversible", scope: "transversal", cause: "codigo", complexity: "large" });
    expect(g).toMatchObject({ type: "operate", pipeline: "complete", close_with: "OK de una persona", judges_min: 2 });
    expect(g.steps).toEqual(sub("operate-irreversible").pasos);
    // Las rondas y los minutos son del fondo, no del encargo.
    expect(g).not.toHaveProperty("rondas_max");
    expect(g.fund_rondas_max).toBe(CATALOGO.por_alcance.transversal.rondas_max);
    expect(g.fund_minutes).toBe(CATALOGO.por_alcance.transversal.minutos_orientativos);
  });

  it("compone con el presupuesto de la causa: un bug de modelo-datos pide auditor-datos y avisa de que el subtipo no lo lleva (la zona no está en el subtipo)", () => {
    const e = encargoDe({ subtype: "fix-bug", scope: "modulo", cause: "modelo-datos", complexity: "normal" });
    expect(e.judges_required).toEqual(["auditor-datos"]);
    expect(e.missing_judges).toEqual(["auditor-datos"]);
    expect(e.judges_min).toBe(1);
    expect(e.warnings.join(" ")).toMatch(/auditor-datos/);
    // Solo un subtipo que lo nombre lo lleva: la auditoría periódica.
    const bien = encargoDe({ subtype: "audit-periodic", scope: "modulo", cause: "modelo-datos", complexity: "normal" });
    expect(bien.missing_judges).toEqual([]);
  });

  it("avisa si el subtipo lleva menos jueces distintos de los que pide el presupuesto", () => {
    const e = encargoDe({ subtype: "fix-bug", scope: "transversal", cause: "codigo", complexity: "large" });
    expect(e.judges_min).toBe(2);
    expect(e.warnings.some((w) => /pide 2/.test(w))).toBe(true);
    const ok = encargoDe({ subtype: "audit-periodic", scope: "transversal", cause: "codigo", complexity: "large" });
    expect(ok.warnings).toEqual([]);
  });

  it("devuelve null si algún valor no existe", () => {
    expect(encargoDe({ subtype: "nada", scope: "local", cause: "codigo", complexity: "normal" })).toBeNull();
    expect(encargoDe({ subtype: "fix-bug", scope: "enorme", cause: "codigo", complexity: "normal" })).toBeNull();
    expect(encargoDe({ subtype: "fix-bug", scope: "local", cause: "inventada", complexity: "normal" })).toBeNull();
    expect(encargoDe({ subtype: "fix-bug", scope: "local", cause: "codigo", complexity: "gigante" })).toBeNull();
  });

  it("un alias retirado se resuelve a su sustituto y avisa", () => {
    const e = encargoDe({ subtype: "esquema-o-dato", scope: "local", cause: "codigo", complexity: "normal" });
    expect(e.subtype).toBe("create-person-approved");
    expect(e.type).toBe("create");
    expect(e.warnings.join(" ")).toMatch(/esquema-o-dato está retirado: usa create-person-approved/);
  });
});

describe("los pasos mínimos conservan las condiciones y no cuentan la planificación como construcción", () => {
  const agentes = (pasos) => pasos.map((p) => p.agentes ?? []);
  it("un cambio con el OK de una persona, normal: constructor y revisor, sin juez de zona", () => {
    const e = encargoDe({ subtype: "create-person-approved", scope: "local", cause: "codigo", complexity: "normal" });
    expect(agentes(e.steps)).toEqual([["constructor"], ["revisor"]]);
    expect(e.close_with).toBe("OK de una persona");
  });
  it("una función entre dominios: la sesión planifica y no cuenta; queda el constructor por dominio y su juez", () => {
    expect(rolDe("sesion")).toBe("planner");
    expect(agentes(pasosMinimos(sub("create-planned")))).toEqual([["constructores"], ["revisor"]]);
  });
  it("una mejora de estructura: constructor y revisor", () => {
    expect(agentes(pasosMinimos(sub("improve-structure")))).toEqual([["constructor"], ["revisor"]]);
  });
  it("el contenido lo construye la sesión (builds_in_session): su mínimo es la sesión y el revisor", () => {
    expect(sub("create-in-session").builds_in_session).toBe(true);
    expect(agentes(pasosMinimos(sub("create-in-session")))).toEqual([["sesion"], ["revisor"]]);
  });
  it("una operación irreversible normal conserva la bandera de evaluador", () => {
    const pasos = pasosMinimos(sub("operate-irreversible"));
    expect(pasos[1].opcional[0]).toEqual({ agente: "evaluador", si: "cambia el bot", flag: "changes_bot" });
  });
  it("una auditoría: el primer paso con juez, entero", () => {
    expect(pasosMinimos(sub("audit-periodic"))).toEqual(sub("audit-periodic").pasos);
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
  it("siguen los campos de siempre: tipos[].id, accion, pasos, cierra_con, opcional (con si) y especiales, y la versión", () => {
    expect(DATOS.version).toBe(1);
    expect(Object.keys(DATOS.especiales)).toEqual(["sesion", "constructor", "constructores"]);
    for (const t of DATOS.tipos) {
      expect(t.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(t.accion.length).toBeGreaterThan(2);
      expect(t.pasos.length).toBeGreaterThan(0);
      for (const p of t.pasos) {
        expect(p.agentes?.length ?? p.opcional?.length, t.id).toBeGreaterThan(0);
        for (const o of p.opcional ?? []) expect(typeof o.si).toBe("string");
      }
    }
    expect(DATOS.tipos.filter((t) => t.cierra_con).map((t) => t.id)).toEqual(["create-person-approved", "operate-irreversible", "esquema-o-dato", "desplegar-produccion"]);
  });

  it("cada id de antes conserva sus campos de antes, intactos: solo se añaden status y replaced_by", () => {
    for (const a of ALIASES) {
      expect(Object.keys(a).slice(0, 4)).toEqual(["id", "type", "status", "replaced_by"]);
      expect(a.status).toBe("retired");
    }
    // Un par con el cierre y las condiciones de antes, tal cual.
    expect(sub("esquema-o-dato")).toMatchObject({ cierra_con: "OK para aplicar", type: "create", accion: "Cambio de esquema o dato nuevo" });
    expect(sub("esquema-o-dato").pasos[1].opcional[0]).toEqual({ agente: "seguridad", si: "toca RLS", flag: "touches_rls" });
    expect(sub("desplegar-produccion")).toMatchObject({ cierra_con: "OK de una persona", irreversible: true });
    expect(sub("bug").pasos[0].nota).toBe("diagnóstico y test que lo reproduce");
  });
});

describe("cada regla nueva, vista fallar con datos malos", () => {
  const act = (d, id) => d.tipos.find((s) => s.id === id);
  const MALOS = [
    ["tipo", "un subtipo cuelga de un tipo que no existe", (d) => { act(d, "create-plain").type = "inventar"; }],
    ["roles", "un tipo crear sin juez detrás del constructor", (d) => { act(d, "create-plain").pasos = [{ agentes: ["constructor"] }]; }],
    ["juez-siempre", "un juez que solo entra por una bandera", (d) => { act(d, "operate-reversible").pasos = [{ agentes: ["gobierno"] }, { opcional: [{ agente: "seguridad", si: "toca secretos o permisos", flag: "touches_secrets_or_permissions" }] }]; }],
    ["roles", "arreglar sin diagnóstico antes de construir", (d) => { act(d, "fix-bug").pasos = [{ agentes: ["constructor"] }, { agentes: ["revisor"] }]; }],
    ["medida", "improve sin decir qué se mide", (d) => { delete act(d, "improve-measured").measure_kind; }],
    ["medida", "improve que mide algo que no es del vocabulario", (d) => { act(d, "improve-structure").measure_kind = "lo que sea"; }],
    ["cierre", "operar irreversible sin cierre de persona", (d) => { delete act(d, "operate-irreversible").cierra_con; }],
    ["cierre", "operar sin decir si es irreversible", (d) => { delete act(d, "operate-reversible").irreversible; }],
    ["cierre", "un cierre cuyo texto no es el de su vocabulario", (d) => { act(d, "create-person-approved").cierra_con = "OK de alguien"; }],
    ["vocabulario", "un contador sin definición", (d) => { delete d.counters.tokens.what; }],
    ["medida", "una medida de contador sin decir cuáles", (d) => { delete act(d, "improve-measured").counters; }],
    ["medida", "un contador que no es del vocabulario", (d) => { act(d, "improve-measured").counters = ["lo_que_sea"]; }],
    ["medida", "contadores en una medida que no es de contador", (d) => { act(d, "improve-structure").counters = ["tokens"]; }],
    ["solo-jueces", "auditar con un constructor que no mide", (d) => { delete act(d, "audit-periodic").measured_with; }],
    ["paralelo", "auditar en dos pasos", (d) => { act(d, "audit-periodic").pasos = [{ agentes: ["seguridad"] }, { agentes: ["revisor"] }]; }],
    ["bandera", "una condición sin bandera", (d) => { delete act(d, "operate-irreversible").pasos[1].opcional[0].flag; }],
    ["bandera", "un texto que no es el de su bandera", (d) => { act(d, "operate-irreversible").pasos[1].opcional[0].si = "toca rls o algo"; }],
    ["agente", "un agente que no existe", (d) => { act(d, "fix-bug").pasos[0].agentes = ["inventado"]; }],
    ["juez", "un tipo sin juez en su esqueleto", (d) => { d.assignment_types.create.skeleton.roles = ["builder"]; }],
    ["id", "dos subtipos con el mismo id", (d) => { d.tipos[1].id = d.tipos[0].id; }],
    ["orden", "subtipos que no van agrupados por tipo", (d) => { d.tipos.push(d.tipos.shift()); }],
    ["orden", "un alias retirado antes que un subtipo activo", (d) => { d.tipos.unshift(d.tipos.pop()); }],
    ["roles", "el subtipo que construye en la sesión sin paso de sesión", (d) => { act(d, "create-in-session").pasos[0] = { agentes: ["revisor"] }; }],
    ["especial", "un especial sin rol", (d) => { delete d.special_roles.sesion; }],
    ["medida", "medida en un subtipo que no es de mejorar", (d) => { act(d, "fix-bug").measure_kind = "time_or_cost"; }],
    ["vocabulario", "un valor de differs_in sin definición", (d) => { delete d.differs_in.steps.what; }],
    ["vocabulario", "un cierre sin su texto", (d) => { delete d.closings.person_ok.label; }],
    ["esqueleto", "improve sin una medida por defecto del vocabulario", (d) => { d.assignment_types.improve.skeleton.default_measure = "otra"; }],
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

/**
 * La puerta de entrada de un subtipo (#645, #646): una regla por prueba, cada una vista fallar con un subtipo
 * estropeado. Cada caso cambia UNA cosa de un subtipo que pasa y espera la línea de SU regla.
 */
describe("la puerta de entrada: mismo plano, difiere de verdad, lo discreto primero y el nombre", () => {
  const act = (d, id) => d.tipos.find((s) => s.id === id);
  const falla = (regla, cambia, trozo) => {
    const d = clon(DATOS);
    cambia(d);
    const lineas = problemas(d).filter((p) => p.startsWith(`${regla}:`));
    expect(lineas.length, problemas(d).join(" | ")).toBeGreaterThan(0);
    if (trozo) expect(lineas.join(" "), trozo).toContain(trozo);
  };

  it("los 12 subtipos activos la pasan, y el liso es el esqueleto: no difiere de nada", () => {
    expect(problemas()).toEqual([]);
    for (const s of SUBTYPES.filter((x) => x.plain)) expect([...facetasDe(s)], s.id).toEqual([]);
    expect(SUBTYPES.filter((x) => x.plain).map((x) => x.id)).toEqual(["create-plain", "fix-bug", "improve-measured", "operate-reversible"]);
    expect(SUBTYPES.filter((x) => x.valve).map((x) => x.id)).toEqual(["audit-other"]);
  });

  it("lo que declaran es todo lo que difiere: ni más ni menos que el esqueleto de su tipo", () => {
    for (const s of SUBTYPES) expect([...facetasDe(s)].sort(), s.id).toEqual([...s.differs_in].sort());
    // Un juez de zona (fijo o por bandera) no es una diferencia: no hay valores para eso.
    expect(Object.keys(DIFFERS_IN).sort()).toEqual(["builds_in_session", "closing", "maps_first", "measure", "plans_first", "steps"]);
    // Cada valor del vocabulario lo cumple algún subtipo (nada sin lector).
    for (const v of Object.keys(DIFFERS_IN)) expect(SUBTYPES.some((s) => s.differs_in.includes(v)), v).toBe(true);
  });

  describe("plano: un subtipo describe el trabajo, no la zona", () => {
    it("el id con una zona de AMBITOS, o con una palabra de zona, falla", () => {
      for (const z of Object.keys(AMBITOS)) falla("plano", (d) => { act(d, "create-plain").id = `create-${z}`; }, z);
      for (const z of ["screen", "endpoint", "lola", "schema", "table", "migration", "workflow", "recipe"]) falla("plano", (d) => { act(d, "create-plain").id = `create-${z}`; }, z);
      falla("plano", (d) => { act(d, "create-plain").id = "create-api-screen"; });
    });
    it("la etiqueta que nombra una zona falla, también en castellano y con tilde", () => {
      for (const t of ["Una pantalla nueva", "Cambio en el catálogo", "Un endpoint más", "Arreglar Lola", "Tocar la infraestructura"]) {
        falla("plano", (d) => { act(d, "create-plain").accion = t; });
      }
    });
    it("las palabras de zona incluyen todos los ámbitos y no cogen palabras de naturaleza", () => {
      for (const [id, a] of Object.entries(AMBITOS)) {
        expect(ZONAS, id).toContain(id);
        expect(zonasQueNombra(a.legible), a.legible).not.toEqual([]);
      }
      // Lo que dicen los subtipos activos (ids, etiquetas y finalidades de paso) no cae en ninguna palabra de zona: sale de AMBITOS, no de una lista a mano.
      for (const s of SUBTYPES) {
        const textos = [s.id.split("-").slice(1).join(" "), s.accion, ...s.pasos.map((p) => `${p.purpose ?? ""} ${DATOS.step_purposes[p.purpose]?.what ?? ""}`)];
        for (const t of textos) expect(zonasQueNombra(t), `${s.id}: «${t}»`).toEqual([]);
      }
    });
    it("una finalidad de paso que nombra una zona falla, como el catálogo que tuvo antes", () => {
      falla("plano", (d) => { d.step_purposes.validate_catalog = { what: "Validación del catálogo en los tests" }; act(d, "create-in-session").pasos[1].purpose = "validate_catalog"; }, "validate_catalog");
    });
  });

  describe("difiere: lo que declara, lo cumple contra el esqueleto de su tipo", () => {
    it("cada valor declarado de más (un subtipo liso que no lo cumple) falla", () => {
      for (const v of Object.keys(DIFFERS_IN)) falla("difiere", (d) => { act(d, "create-plain").differs_in = [v]; }, v);
    });
    it("un subtipo que no es liso ni válvula y no declara nada falla: si no difiere, no es subtipo", () => {
      falla("difiere", (d) => { act(d, "improve-structure").differs_in = []; }, "no difiere");
      falla("difiere", (d) => { delete act(d, "improve-structure").differs_in; });
    });
    it("un valor que no es del vocabulario o repetido falla", () => {
      falla("difiere", (d) => { act(d, "improve-structure").differs_in = ["measure", "mide_algo"]; }, "mide_algo");
      falla("difiere", (d) => { act(d, "improve-structure").differs_in = ["measure", "measure"]; }, "repite");
    });
    it("cada hecho medible se comprueba contra el esqueleto: se declara sin tenerlo y falla", () => {
      falla("difiere", (d) => { delete act(d, "create-person-approved").cierra_con; delete act(d, "create-person-approved").closing; }, "closing");
      falla("difiere", (d) => { act(d, "create-planned").pasos.shift(); }, "plans_first");
      falla("difiere", (d) => { act(d, "improve-layers").measure_kind = "counter_before_after"; act(d, "improve-layers").differs_in = ["maps_first", "steps", "measure"]; }, "measure");
      falla("difiere", (d) => { act(d, "improve-layers").pasos[0] = { agentes: ["constructor"] }; }, "maps_first");
      falla("difiere", (d) => { act(d, "audit-periodic").measured_with = []; }, "measure");
      falla("difiere", (d) => { act(d, "create-planned").differs_in = ["plans_first", "steps", "flags"]; }, "flags");
      falla("difiere", (d) => { delete act(d, "create-in-session").builds_in_session; }, "builds_in_session");
    });
    it("el liso no declara nada y no puede diferir; un liso que difiere deja de serlo", () => {
      falla("liso", (d) => { act(d, "create-plain").differs_in = ["steps"]; }, "no declara");
      falla("liso", (d) => { act(d, "create-plain").pasos.unshift({ agentes: ["sesion"] }); }, "steps");
    });
    it("dos subtipos con lo mismo son uno: gemelo", () => {
      falla("gemelo", (d) => { const g = clon(act(d, "improve-structure")); g.id = "improve-twin"; g.differs_in = ["measure"]; d.tipos.splice(d.tipos.indexOf(act(d, "improve-structure")) + 1, 0, g); }, "improve-twin");
    });
  });

  describe("valores: un solo liso por tipo; la válvula solo donde no hay liso, y cada tipo tiene dónde dejar lo que no encaja", () => {
    it("dos lisos en un tipo falla", () => {
      falla("liso", (d) => { const g = clon(act(d, "create-plain")); g.id = "create-simple"; g.pasos[0].agentes = ["sesion"]; d.tipos.splice(1, 0, g); }, "2 subtipos lisos");
    });
    it("una válvula en un tipo que ya tiene liso falla, y la válvula con otro nombre también", () => {
      falla("valvula", (d) => { d.tipos.splice(1, 0, { id: "create-other", type: "create", status: "active", valve: true, accion: "Otro de crear", pasos: [{ agentes: ["constructor"] }, { agentes: ["revisor"] }], differs_in: [], note: "Válvula con motivo en cada uso" }); }, "ya tiene su subtipo liso");
      falla("valvula", (d) => { act(d, "audit-other").id = "audit-misc"; }, "audit-other");
      falla("valvula", (d) => { delete act(d, "audit-other").note; }, "note");
    });
    it("un tipo sin liso ni válvula falla; operate tiene su liso (reversible), sin pareja que lo salve", () => {
      expect(SUBTYPES.find((x) => x.type === "operate" && x.plain).id).toBe("operate-reversible");
      falla("cobertura", (d) => { d.tipos = d.tipos.filter((s) => s.id !== "create-plain"); }, "create");
      falla("cobertura", (d) => { d.tipos = d.tipos.filter((s) => s.id !== "audit-other"); }, "audit");
      falla("cobertura", (d) => { delete act(d, "operate-reversible").plain; act(d, "operate-reversible").differs_in = ["steps"]; }, "operate");
    });
  });

  describe("texto-libre: lo discreto primero; el único texto libre es «note», con tope", () => {
    it("un campo de texto que no es de un subtipo activo falla, también dentro de un paso o una condición", () => {
      falla("texto-libre", (d) => { act(d, "create-plain").measure = "una cifra escrita a mano"; }, "measure");
      falla("texto-libre", (d) => { act(d, "create-plain").comentario = "algo"; }, "comentario");
      falla("texto-libre", (d) => { act(d, "fix-bug").pasos[0].nota = "diagnóstico a mano"; }, "nota");
      falla("texto-libre", (d) => { act(d, "operate-irreversible").pasos[1].opcional[0].motivo = "porque sí"; }, "motivo");
    });
    it("una finalidad, una medida o un cierre fuera de su vocabulario falla", () => {
      falla("texto-libre", (d) => { act(d, "fix-bug").pasos[0].purpose = "mirar un rato"; }, "mirar un rato");
      falla("texto-libre", (d) => { act(d, "improve-structure").measure_kind = "lo que salga"; }, "lo que salga");
      falla("texto-libre", (d) => { act(d, "create-person-approved").closing = "ok_de_alguien"; }, "ok_de_alguien");
    });
    it("la nota tiene tope, y la etiqueta también", () => {
      expect(MAX_NOTE).toBe(160);
      expect(act(clon(DATOS), "audit-other").note.length).toBeLessThanOrEqual(MAX_NOTE);
      falla("texto-libre", (d) => { act(d, "audit-other").note = "x".repeat(MAX_NOTE + 1); }, "note");
      falla("texto-libre", (d) => { act(d, "audit-other").note = "corta"; }, "note");
      falla("texto-libre", (d) => { act(d, "create-plain").accion = "Crear ".padEnd(MAX_ACCION + 1, "a"); }, "accion");
      falla("texto-libre", (d) => { act(d, "create-plain").plain = "sí"; }, "plain");
    });
    it("un alias retirado conserva sus campos de antes y no se juzga como activo", () => {
      const d = clon(DATOS);
      expect(problemas(d)).toEqual([]);
      expect(sub("lento-o-caro").measure).toMatch(/milisegundos/);
      expect(sub("bug").pasos[0].nota).toBeTruthy();
    });
  });

  describe("nombre: <tipo>-<objeto>, en inglés y en kebab-case", () => {
    it.each([
      ["sin prefijo de tipo", "plain"],
      ["en camelCase", "createPlain"],
      ["en castellano", "crear-algo"],
      ["con prefijo de otro tipo", "fix-plain"],
      ["demasiadas palabras", "create-one-two-three-four"],
      ["con mayúsculas", "create-Plain"],
      ["con un número", "create-plain2"],
    ])("%s (%s)", (_que, id) => {
      falla("nombre", (d) => { act(d, "create-plain").id = id; });
    });
    it("todos los activos siguen la plantilla con el prefijo de su tipo", () => {
      for (const s of SUBTYPES) expect(s.id, s.id).toMatch(new RegExp(`^${s.type}-[a-z]+(-[a-z]+){0,2}$`));
    });
  });

  describe("estado y alias: un id retirado dice a qué activo pasa", () => {
    it("un alias sin sustituto, con un sustituto que no existe o retirado falla", () => {
      falla("alias", (d) => { delete act(d, "bug").replaced_by; }, "bug");
      falla("alias", (d) => { act(d, "bug").replaced_by = "fix-nada"; }, "fix-nada");
      falla("alias", (d) => { act(d, "bug").replaced_by = "assets"; }, "assets");
      falla("alias", (d) => { act(d, "bug").differs_in = ["steps"]; }, "differs_in");
    });
    it("un estado que no es del vocabulario falla", () => {
      falla("estado", (d) => { act(d, "bug").status = "olvidado"; }, "olvidado");
      falla("estado", (d) => { delete act(d, "create-plain").status; });
    });
  });

  describe("repite: al menos 3 encargos con el patrón, como aviso que no falla", () => {
    const sinUsos = avisosDeUso({});
    it("sin usos, cada subtipo activo que no es válvula avisa de que le faltan encargos; los retirados no", () => {
      expect(MIN_USOS).toBe(3);
      // Ni el liso (es el esqueleto del tipo) ni la válvula (otro aviso) entran en «pocos-usos».
      expect(sinUsos).toHaveLength(SUBTYPES.filter((s) => !s.valve && !s.plain).length);
      expect(sinUsos[0]).toBe("subtipo-uso subtype: create-person-approved usos: 0 minimo: 3 aviso: pocos-usos usa: -");
    });
    it("los usos de un alias cuentan para su sustituto", () => {
      const l = avisosDeUso({ "esquema-o-dato": 2, "create-person-approved": 1 });
      expect(l.some((x) => x.includes("subtype: create-person-approved ")), l.join("|")).toBe(false);
      expect(l).toContain("subtipo-uso subtype: esquema-o-dato usos: 2 minimo: 3 aviso: alias-retirado usa: create-person-approved");
      expect(avisosDeUso({ "esquema-o-dato": 1, "create-person-approved": 1 }).some((x) => x.includes("subtype: create-person-approved "))).toBe(true);
    });
    it("con 3 o más usos no avisa", () => {
      expect(avisosDeUso(Object.fromEntries(SUBTYPES.map((s) => [s.id, MIN_USOS])))).toEqual(["subtipo-uso subtype: audit-other usos: 3 minimo: 3 aviso: valvula-repetida usa: -"]);
      expect(avisosDeUso({ ...Object.fromEntries(SUBTYPES.filter((s) => !s.valve).map((s) => [s.id, MIN_USOS])), "audit-other": 2 })).toEqual([]);
    });
    it("la válvula repetida pide un subtipo nuevo, un alias dice cuál usar y un id que no existe se señala", () => {
      const l = avisosDeUso({ "esquema-o-dato": 2, "inventado-del-todo": 1, "audit-other": 4 });
      expect(l).toContain("subtipo-uso subtype: esquema-o-dato usos: 2 minimo: 3 aviso: alias-retirado usa: create-person-approved");
      expect(l).toContain("subtipo-uso subtype: inventado-del-todo usos: 1 minimo: 3 aviso: subtipo-desconocido usa: -");
      expect(l.some((x) => /audit-other usos: 4 .*valvula-repetida/.test(x))).toBe(true);
    });
  });

  describe("el N1 recoge la puerta como regla, generada del lector", () => {
    const n1 = leer("docs/entidades/N1-encargo.md");
    it("las cinco reglas, los valores de differs_in y los 21 alias están en el N1 y regenerar lo deja igual", () => {
      expect(REGLAS_PUERTA.map((r) => r.id)).toEqual(["plano", "difiere", "repite", "texto-libre", "nombre"]);
      expect(conPuertaN1(n1)).toBe(n1);
      const puerta = textoN1Puerta();
      for (const r of REGLAS_PUERTA) expect(n1).toContain(`- \`${r.id}\`: ${r.texto}`);
      for (const v of Object.keys(DIFFERS_IN)) expect(puerta).toContain(`| \`${v}\` |`);
      for (const a of ALIASES) expect(puerta).toContain(`| \`${a.id}\` | \`${a.replaced_by}\` |`);
    });
    it("cada regla de la puerta la sigue una línea de `problemas` con su nombre", () => {
      const fuente = leer("scripts/lib/tiposDeEncargo.mjs");
      for (const id of ["plano", "difiere", "texto-libre", "nombre"]) expect(fuente, id).toContain(`p.push(\`${id}: `);
      expect(fuente).toContain("subtipo-uso subtype:");
    });
  });
});

/**
 * Los jueces por zona (#646): el puente hasta que #641 los calcule. Un subtipo no nombra la zona, así que la zona de los
 * ficheros pide sus jueces desde este dato (AMBITOS, scripts/lib/ambitos.mjs). Cada juez sale de una norma o de un agente.
 */
describe("los jueces por zona: dato de AMBITOS, con su fuente y su tabla generada", () => {
  const normas = JSON.parse(leer("ops/normas.json")).normas;
  const fuentes = Object.entries(AMBITOS).flatMap(([ambito, a]) => a.jueces.map((j) => ({ ambito, ...j })));

  it("todo ámbito dice sus jueces (una lista, vacía si no pide ninguno) y cada uno existe en JUECES", () => {
    for (const [id, a] of Object.entries(AMBITOS)) expect(Array.isArray(a.jueces), id).toBe(true);
    for (const j of fuentes) expect(JUECES, `${j.ambito}: ${j.juez}`).toContain(j.juez);
    expect(JUECES).toContain(JUEZ_SIEMPRE);
    expect(juecesDeAmbitos(["api", "bot", "ui", "data"])).toEqual(["revisor", "seguridad", "evaluador", "qa", "auditor-datos"]);
    expect(juecesDeAmbitos([])).toEqual(["revisor"]);
  });

  it("cada juez dice de dónde sale: una norma de su ámbito o un agente que existe con tareas", () => {
    const tareas = tareasDe(leerEstandares(RAIZ));
    for (const j of fuentes) {
      const [tipo, id] = j.fuente.split(":");
      if (tipo === "norma") {
        const n = normas.find((x) => x.id === id);
        expect(n, `${j.ambito}: la norma ${id}`).toBeTruthy();
        expect(n.ambito, `${id} es del ámbito ${j.ambito}`).toBe(j.ambito);
      } else {
        expect(tipo, j.fuente).toBe("agente");
        expect(id, `${j.ambito}: el agente ${id} es el juez`).toBe(j.juez);
        expect(tareas.some((t) => t.agente === id), `${id} sin tareas`).toBe(true);
      }
    }
  });

  it("toda norma de riesgo alto que pide un juez de zona queda cubierta por la tabla", () => {
    // Las normas de riesgo alto que nombran a un juez («el juez seguridad», «el OK del juez auditor-datos») o piden evals.
    const pideJuez = normas.filter((n) => n.riesgo === "alto" && (/juez (\S+)/.test(n.exigencia) || n.id === "evals-antes-de-fusionar"));
    expect(pideJuez.map((n) => n.id).sort()).toEqual(["aplicar-migracion-con-permiso", "endpoint-nuevo-juez-seguridad", "evals-antes-de-fusionar"]);
    for (const n of pideJuez) {
      expect(fuentes.some((j) => j.fuente === `norma:${n.id}` && j.ambito === n.ambito), `${n.id} (${n.ambito}) sin juez en AMBITOS`).toBe(true);
      const nombrado = /juez (auditor-datos|seguridad|evaluador|qa)/.exec(n.exigencia)?.[1];
      if (nombrado) expect(AMBITOS[n.ambito].jueces.map((j) => j.juez), n.id).toContain(nombrado);
    }
  });

  it("la tabla de /orquestar sale de AMBITOS, y un juez que sobra o falta en el fichero falla", () => {
    const md = leer(".claude/commands/orquestar.md");
    const i = md.indexOf(MARCA_JUECES_INICIO) + MARCA_JUECES_INICIO.length;
    expect(md.slice(i, md.indexOf(MARCA_JUECES_FIN)).trim(), "Regenera con `npm run flujo -- --escribir`").toBe(tablaJueces());
    expect(regenerarOrquestar(md)).toBe(md);
    expect(tablaJueces()).toContain("| `api` (api) | `seguridad` | `norma:endpoint-nuevo-juez-seguridad` |");
    expect(tablaJueces()).toContain("| `bot` (bot) | `evaluador` | `norma:evals-antes-de-fusionar` |");
  });

  it("una fuente rota se ve: sin norma, de otro ámbito o con otro agente no pasa", () => {
    const cambia = (fuente, ambito = "api") => { return normas.find((x) => x.id === fuente.split(":")[1])?.ambito === ambito; };
    expect(cambia("norma:no-existe")).toBe(false);
    expect(cambia("norma:evals-antes-de-fusionar")).toBe(false);
    expect(cambia("norma:endpoint-nuevo-juez-seguridad")).toBe(true);
  });
});
