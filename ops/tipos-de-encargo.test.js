import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENTES, CONSTRUCTORES, JUECES, agentesDe } from "../scripts/lib/agentes.mjs";
import { ACTORES } from "../scripts/lib/flujo.mjs";
import { ACCIONES, leerEstandares, tareasDe } from "../scripts/lib/estandaresAgentes.mjs";
import { CATALOGO, COMPLEJIDADES, PIPELINES, problemas as problemasDePresupuesto } from "../scripts/lib/presupuestos.mjs";
import {
  BANDERAS, DATOS, MARCA_FIN, MARCA_INICIO, SUBTIPOS, TIPOS, encargoDe, juecesDe, problemas, problemasDeEsqueleto, regenerarOrquestar, tablaPipelines,
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
const sub = (id) => SUBTIPOS.find((s) => s.id === id);

describe("los tipos y subtipos", () => {
  it("son cinco tipos y diecisiete subtipos, cada uno colgado de un tipo que existe", () => {
    expect(Object.keys(TIPOS)).toEqual(["crear", "arreglar", "mejorar", "operar", "auditar"]);
    expect(SUBTIPOS).toHaveLength(17);
    const ids = SUBTIPOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SUBTIPOS) expect(Object.keys(TIPOS), `${s.id} cuelga de «${s.tipo}»`).toContain(s.tipo);
    for (const t of Object.keys(TIPOS)) expect(SUBTIPOS.some((s) => s.tipo === t), `el tipo ${t} no tiene subtipos`).toBe(true);
  });

  it("el catálogo entero pasa sus reglas de forma, esqueleto y banderas", () => {
    expect(problemas()).toEqual([]);
  });

  it("cada subtipo cumple el esqueleto de su tipo", () => {
    for (const s of SUBTIPOS) expect(problemasDeEsqueleto(s), s.id).toEqual([]);
  });

  it("ningún tipo ni subtipo se queda con constructor y sin juez (el juez mínimo, siempre)", () => {
    for (const [k, t] of Object.entries(TIPOS)) expect(t.esqueleto.roles, k).toContain("juez");
    for (const s of SUBTIPOS) expect(juecesDe(s).siempre.length, `${s.id} sin juez que entre siempre`).toBeGreaterThan(0);
    // Los dos que tenían constructor y ningún juez (#639): ahora llevan revisor, y seguridad por bandera.
    expect(juecesDe(sub("ci-permisos-hooks"))).toEqual({ siempre: ["revisor"], opcionales: [{ agente: "seguridad", bandera: "toca_secretos_o_permisos" }] });
    expect(juecesDe(sub("desplegar-produccion"))).toEqual({ siempre: ["revisor"], opcionales: [{ agente: "evaluador", bandera: "cambia_el_bot" }] });
  });

  it("lo irreversible cierra con una persona, lo que se mejora dice qué mide y una auditoría solo lleva jueces", () => {
    expect(sub("desplegar-produccion")).toMatchObject({ irreversible: true, cierra_con: "OK de una persona" });
    expect(sub("esquema-o-dato").cierra_con).toBe("OK para aplicar");
    for (const s of SUBTIPOS.filter((x) => x.tipo === "mejorar")) expect(s.medida.length, s.id).toBeGreaterThan(9);
    const auditoria = sub("revision-periodica");
    expect(auditoria.pasos).toHaveLength(1);
    expect(auditoria.pasos[0].agentes.filter((a) => !JUECES.includes(a))).toEqual(auditoria.mide_con);
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
    const usadas = SUBTIPOS.flatMap((s) => s.pasos.flatMap((p) => p.opcional ?? []));
    expect(usadas.length).toBeGreaterThanOrEqual(4);
    for (const o of usadas) {
      expect(Object.keys(BANDERAS), o.si).toContain(o.bandera);
      expect(o.si).toBe(BANDERAS[o.bandera].si);
    }
  });

  it("cada bandera la usa algún subtipo (nada sin lector)", () => {
    const usadas = new Set(SUBTIPOS.flatMap((s) => s.pasos.flatMap((p) => (p.opcional ?? []).map((o) => o.bandera))));
    expect([...usadas].sort()).toEqual(Object.keys(BANDERAS).sort());
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
    expect(filas).toHaveLength(SUBTIPOS.length);
    filas.forEach((f, i) => expect(f.startsWith(`| ${SUBTIPOS[i].tipo} |`)).toBe(true));
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
  const nombrados = [...new Set(SUBTIPOS.flatMap((s) => s.pasos.flatMap((p) => [...(p.agentes ?? []), ...(p.opcional ?? []).map((o) => o.agente)])))];

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

  it("el vocabulario de actores y el glosario salen de ella, y el presupuesto la re-exporta", async () => {
    for (const j of JUECES) expect(ACTORES.juez).toContain(j);
    expect(ACTORES.juez).toBe(`Un agente juez (${JUECES.join(", ")})`);
    const glosario = JSON.parse(leer("ops/glosario/terminos/juez.json"));
    for (const j of JUECES) expect(glosario.definicion, "la definición del glosario nombra a cada juez").toContain(j);
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
    expect(Object.keys(COMPLEJIDADES)).toEqual(["trivial", "normal", "grande"]);
    expect(Object.keys(CATALOGO.por_complejidad)).toEqual(Object.keys(COMPLEJIDADES));
    for (const c of Object.values(CATALOGO.por_complejidad)) expect(Object.keys(PIPELINES)).toContain(c.pipeline);
    expect(problemasDePresupuesto(CATALOGO)).toEqual([]);
  });

  it("dado subtipo, alcance y complejidad, devuelve los datos de los dos catálogos sin copiarlos", () => {
    const g = encargoDe({ subtipo: "desplegar-produccion", alcance: "transversal", complejidad: "grande" });
    expect(g).toMatchObject({ tipo: "operar", pipeline: "completo", cierra_con: "OK de una persona", jueces_min: 2, rondas_max: CATALOGO.por_alcance.transversal.rondas_max, minutos_orientativos: CATALOGO.por_alcance.transversal.minutos_orientativos });
    expect(g.pasos).toEqual(sub("desplegar-produccion").pasos);
    const n = encargoDe({ subtipo: "esquema-o-dato", alcance: "local", complejidad: "normal" });
    expect(n.jueces_min).toBe(1);
    expect(n.pasos.map((p) => p.agentes)).toEqual([["datos"], ["auditor-datos"]]);
    expect(n.pasos.every((p) => !p.opcional)).toBe(true);
    expect(encargoDe({ subtipo: "bug", alcance: "modulo", complejidad: "trivial" }).pasos).toEqual([]);
  });

  it("devuelve null si algún valor no existe", () => {
    expect(encargoDe({ subtipo: "nada", alcance: "local", complejidad: "normal" })).toBeNull();
    expect(encargoDe({ subtipo: "bug", alcance: "enorme", complejidad: "normal" })).toBeNull();
    expect(encargoDe({ subtipo: "bug", alcance: "local", complejidad: "gigante" })).toBeNull();
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
    ["tipo", "un subtipo cuelga de un tipo que no existe", (d) => { d.tipos[0].tipo = "inventar"; }],
    ["roles", "un tipo crear sin juez detrás del constructor", (d) => { d.tipos.find((s) => s.id === "assets").pasos = [{ agentes: ["diseno"] }]; }],
    ["juez-siempre", "un juez que solo entra por una bandera", (d) => { d.tipos.find((s) => s.id === "ci-permisos-hooks").pasos = [{ agentes: ["gobierno"] }, { opcional: [{ agente: "seguridad", si: "toca secretos o permisos", bandera: "toca_secretos_o_permisos" }] }]; }],
    ["roles", "arreglar sin diagnóstico antes de construir", (d) => { d.tipos.find((s) => s.id === "bug").pasos = [{ agentes: ["constructor"] }, { agentes: ["revisor"] }]; }],
    ["medida", "mejorar sin decir qué se mide", (d) => { delete d.tipos.find((s) => s.id === "lento-o-caro").medida; }],
    ["cierre", "operar irreversible sin cierre de persona", (d) => { delete d.tipos.find((s) => s.id === "desplegar-produccion").cierra_con; }],
    ["cierre", "operar sin decir si es irreversible", (d) => { delete d.tipos.find((s) => s.id === "ci-permisos-hooks").irreversible; }],
    ["solo-jueces", "auditar con un constructor que no mide", (d) => { delete d.tipos.find((s) => s.id === "revision-periodica").mide_con; }],
    ["paralelo", "auditar en dos pasos", (d) => { d.tipos.find((s) => s.id === "revision-periodica").pasos = [{ agentes: ["seguridad"] }, { agentes: ["revisor"] }]; }],
    ["bandera", "una condición sin bandera", (d) => { delete d.tipos.find((s) => s.id === "esquema-o-dato").pasos[1].opcional[0].bandera; }],
    ["bandera", "un texto que no es el de su bandera", (d) => { d.tipos.find((s) => s.id === "esquema-o-dato").pasos[1].opcional[0].si = "toca rls o algo"; }],
    ["agente", "un agente que no existe", (d) => { d.tipos.find((s) => s.id === "bug").pasos[0].agentes = ["inventado"]; }],
    ["juez", "un tipo sin juez en su esqueleto", (d) => { d.tipos_de_encargo.crear.esqueleto.roles = ["constructor"]; }],
    ["id", "dos subtipos con el mismo id", (d) => { d.tipos[1].id = d.tipos[0].id; }],
    ["medida", "medida en un subtipo que no es de mejorar", (d) => { d.tipos.find((s) => s.id === "bug").medida = "una medida que no toca aquí"; }],
  ];
  it.each(MALOS)("%s: %s", (regla, _que, cambia) => {
    const d = clon(DATOS);
    cambia(d);
    expect(problemas(d).some((p) => p.startsWith(`${regla}:`)), problemas(d).join(" | ")).toBe(true);
  });

  it("la complejidad: sin una fila, con un pipeline que no existe o con jueces que bajan", () => {
    const sin = clon(CATALOGO);
    delete sin.por_complejidad.normal;
    const raro = clon(CATALOGO);
    raro.por_complejidad.grande.pipeline = "todo";
    const baja = clon(CATALOGO);
    baja.por_complejidad.grande.jueces_min = 0;
    for (const c of [sin, raro, baja]) expect(problemasDePresupuesto(c).some((p) => p.startsWith("complejidad:"))).toBe(true);
  });
});
