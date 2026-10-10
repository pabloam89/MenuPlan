import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CALCULOS_SIN_CODIGO, DIR_FICHAS, NOTA_SIN_EVALUAR, ORIGENES, cifrasDeFicha, criteriosDeSkill, ctxEvidencia, esAutomatico, estadoDeControl,
  faltaDeEvidencia, fichaDeSkill, fichasDelRepo, leerFichas, lineaDeCifras, lineaDelConjunto, lineasDeFicha, problemasDeControles,
  problemasDeFichaGuardada, senalesDelRepo, sumarCifras,
} from "../scripts/lib/fichasSkills.mjs";
import { ESTADOS_CRITERIO, leerFicha, leerForja, problemasDeFicha } from "../scripts/lib/forja.mjs";
import { nombresDeSkills } from "../scripts/lib/skills.mjs";

/**
 * La ficha de huecos de cada skill (#457, fondo #455): cada skill tiene su ficha,
 * cada criterio que se le aplica aparece con un estado del vocabulario de la forja,
 * los de juicio llevan evidencia que existe y los automáticos los calcula su control
 * (nadie escribe a mano un estado que le contradiga). Cada regla se ve fallar abajo.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOY = new Date();
const DATOS = leerForja(RAIZ);
const SKILLS = nombresDeSkills(RAIZ);
const GUARDADAS = leerFichas(RAIZ);
const SENALES = senalesDelRepo(RAIZ, HOY);
const CTX = { ...ctxEvidencia(RAIZ), hoy: HOY };
const FICHAS = fichasDelRepo(RAIZ, HOY, { senales: SENALES, guardadas: GUARDADAS, datos: DATOS });
const metaDe = (s) => SENALES[s].metadata;
const problemas = (s, ...g) => problemasDeFichaGuardada(s, g.length ? g[0] : GUARDADAS[s], metaDe(s), DATOS, CTX);
const copia = (x) => JSON.parse(JSON.stringify(x));
const unJuicio = (s) => criteriosDeSkill(DATOS, metaDe(s)).find((c) => !esAutomatico(c)).id;
const unAutomatico = (s) => criteriosDeSkill(DATOS, metaDe(s)).find((c) => esAutomatico(c) && typeof c.codigo === "string" && c.sujeto !== "plantilla.tipo");

describe("las fichas del repo", () => {
  it("toda skill tiene su ficha y no hay ficha de una skill que no existe", () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(14);
    expect(SKILLS.filter((s) => !(s in GUARDADAS)), `sin ficha en ${DIR_FICHAS}/`).toEqual([]);
    expect(Object.keys(GUARDADAS).filter((s) => !SKILLS.includes(s)), "fichas huérfanas").toEqual([]);
  });

  it("cada ficha guardada está bien: juicios completos, del vocabulario, con evidencia que existe y sin estados de criterios automáticos", () => {
    for (const s of SKILLS) expect(problemas(s), s).toEqual([]);
  });

  it("todo criterio aplicable aparece una vez en la ficha generada, y nada más", () => {
    for (const { nombre, filas } of FICHAS) {
      const quiero = criteriosDeSkill(DATOS, metaDe(nombre)).map((c) => c.id);
      expect(filas.map((f) => f.criterio), nombre).toEqual(quiero);
    }
  });

  it("toda línea de ficha se lee y la forja la da por buena (estado del vocabulario, nota solo en el hueco)", () => {
    for (const { nombre, filas } of FICHAS) {
      for (const l of lineasDeFicha(nombre, filas)) {
        const f = leerFicha(l);
        expect(f, l).not.toBeNull();
        expect(problemasDeFicha(f, DATOS), l).toEqual([]);
        expect(Object.keys(ESTADOS_CRITERIO)).toContain(f.estado);
      }
    }
  });

  it("todo criterio automático de skill tiene con qué calcularse: un código que emiten los scripts o un cálculo propio", () => {
    expect(problemasDeControles(DATOS)).toEqual([]);
    for (const id of Object.keys(CALCULOS_SIN_CODIGO)) expect(DATOS.criterios.map((c) => c.id), id).toContain(id);
  });

  it("el origen de cada fila es del vocabulario y casa con el control del criterio", () => {
    for (const { filas } of FICHAS) {
      for (const f of filas) {
        expect(Object.keys(ORIGENES)).toContain(f.origen);
        expect(f.origen === "control", f.criterio).toBe(f.control !== "juicio");
      }
    }
  });

  it("las cifras cuadran: vigilados más de juicio son los criterios, y los estados suman lo mismo", () => {
    for (const { nombre, cifras: c } of FICHAS) {
      expect(c.vigilados + c.de_juicio, nombre).toBe(c.criterios);
      expect(Object.keys(ESTADOS_CRITERIO).reduce((n, e) => n + c[e], 0), nombre).toBe(c.criterios);
      expect(c.juzgados + c.juicio, nombre).toBe(c.de_juicio);
    }
    const t = sumarCifras(FICHAS.map((f) => f.cifras));
    expect(lineaDelConjunto(FICHAS.length, t)).toMatch(/^Fichas: \d+ skills, \d+ criterios aplicados: \d+ vigilados por un control y \d+ de juicio \(\d+ juzgados, \d+ sin juzgar\)/);
  });
});

describe("cada regla de la ficha guardada se ve fallar", () => {
  const s = "github";
  const base = GUARDADAS[s];

  it("sin ficha", () => {
    expect(problemas(s, undefined)[0]).toMatch(/no tiene ficha/);
  });

  it("falta un criterio de juicio", () => {
    const g = copia(base);
    delete g.juicios[unJuicio(s)];
    expect(problemas(s, g).join("\n")).toMatch(/falta el criterio de juicio/);
  });

  it("un estado fuera del vocabulario de la forja", () => {
    const g = copia(base);
    g.juicios[unJuicio(s)] = { estado: "regular", nota: "ni bien ni mal" };
    expect(problemas(s, g).join("\n")).toMatch(/no está en el vocabulario/);
  });

  it("un juicio hecho sin evidencia, o con una evidencia que no existe", () => {
    const g = copia(base);
    g.juicios[unJuicio(s)] = { estado: "cumple", fecha: "2026-10-10", quien: "gobierno" };
    expect(problemas(s, g).join("\n")).toMatch(/lleva «evidencia»/);
    g.juicios[unJuicio(s)].evidencia = ["ops/no-existe.json"];
    expect(problemas(s, g).join("\n")).toMatch(/no existe/);
    g.juicios[unJuicio(s)].evidencia = [`caso:${s}/no-existe`];
    expect(problemas(s, g).join("\n")).toMatch(/no tiene el caso/);
    g.juicios[unJuicio(s)].evidencia = [".claude/skills/github/SKILL.md#Sección inventada"];
    expect(problemas(s, g).join("\n")).toMatch(/no tiene la cabecera/);
    g.juicios[unJuicio(s)].evidencia = ["npm run no-existe"];
    expect(problemas(s, g).join("\n")).toMatch(/no hay npm run/);
  });

  it("no_cumple y juicio llevan nota; cumple no", () => {
    const g = copia(base);
    g.juicios[unJuicio(s)] = { estado: "no_cumple", evidencia: [".claude/skills/github/SKILL.md"], fecha: "2026-10-10", quien: "gobierno" };
    expect(problemas(s, g).join("\n")).toMatch(/lleva «nota»/);
    g.juicios[unJuicio(s)] = { estado: "cumple", nota: "una nota de más", evidencia: [".claude/skills/github/SKILL.md"], fecha: "2026-10-10", quien: "gobierno" };
    expect(problemas(s, g).join("\n")).toMatch(/la nota solo va con/);
    g.juicios[unJuicio(s)] = { estado: "juicio" };
    expect(problemas(s, g).join("\n")).toMatch(/lleva «nota»/);
  });

  it("un juicio firmado por alguien que no es agente ni persona de la casa, o con fecha mala", () => {
    const g = copia(base);
    g.juicios[unJuicio(s)] = { estado: "cumple", evidencia: [".claude/skills/github/SKILL.md"], fecha: "ayer", quien: "nadie" };
    const p = problemas(s, g).join("\n");
    expect(p).toMatch(/«fecha» AAAA-MM-DD/);
    expect(p).toMatch(/«quien» es un agente/);
  });

  it("un estado escrito a mano para un criterio automático (que contradice, o duplica, a su control)", () => {
    const c = unAutomatico(s);
    const calculado = estadoDeControl(c, SENALES[s]).estado;
    const g = copia(base);
    g.juicios[c.id] = { estado: calculado === "cumple" ? "no_cumple" : "cumple", nota: "a mano contra el control" };
    expect(problemas(s, g).join("\n")).toMatch(/lo calcula el control y no se escribe a mano/);
  });

  it("un criterio que no existe o que no se aplica a la skill", () => {
    const g = copia(base);
    g.juicios["criterio-inventado"] = { estado: "juicio", nota: NOTA_SIN_EVALUAR };
    expect(problemas(s, g).join("\n")).toMatch(/no es un criterio de ops\/forja.json/);
    const g2 = copia(base);
    g2.juicios["estandar-concreto-y-verificable"] = { estado: "juicio", nota: NOTA_SIN_EVALUAR };
    expect(problemas(s, g2).join("\n")).toMatch(/no se aplica a esta skill/);
  });

  it("una ficha de otra skill o con claves de más", () => {
    expect(problemas(s, { ...copia(base), skill: "vercel" }).join("\n")).toMatch(/no github/);
    expect(problemas(s, { ...copia(base), estados: {} }).join("\n")).toMatch(/clave «estados» no admitida/);
  });
});

describe("el control calcula el estado", () => {
  const c = DATOS.criterios.find((x) => x.id === "tamano-cerca");
  const sinDefectos = { metadata: { tipo: "servicio" }, defectos: [], estandar: [], glosario: [] };

  it("un código emitido por la higiene es no_cumple con su detalle como nota; sin él, cumple", () => {
    expect(estadoDeControl(c, sinDefectos)).toEqual({ estado: "cumple", nota: null });
    const r = estadoDeControl(c, { ...sinDefectos, defectos: [{ codigo: "tamano-cerca", gravedad: "aviso", detalle: "210 líneas de 220" }] });
    expect(r).toEqual({ estado: "no_cumple", nota: "210 líneas de 220" });
  });

  it("la caducidad tiene su propio código y la ficha lo ve", () => {
    const cad = DATOS.criterios.find((x) => x.id === "caducada");
    expect(estadoDeControl(cad, { ...sinDefectos, defectos: [{ codigo: "caducada", detalle: "hace 120 días" }] }).estado).toBe("no_cumple");
  });

  it("los criterios de la plantilla por tipo no se aplican a la pieza meta, que no tiene tipo", () => {
    const p = DATOS.criterios.find((x) => x.sujeto === "plantilla.tipo");
    expect(estadoDeControl(p, { ...sinDefectos, estandar: null }).estado).toBe("no_aplica");
    expect(estadoDeControl(p, { ...sinDefectos, estandar: [{ codigo: p.codigo, detalle: "servicio: falta" }] }).estado).toBe("no_cumple");
  });

  it("el glosario: un sinónimo prohibido en la skill es no_cumple", () => {
    const g = DATOS.criterios.find((x) => x.id === "vocabulario-canonico");
    expect(estadoDeControl(g, sinDefectos).estado).toBe("cumple");
    expect(estadoDeControl(g, { ...sinDefectos, glosario: [{ ruta: "x", sinonimo: "runbook", canonico: "skill" }] }).estado).toBe("no_cumple");
  });

  it("un criterio automático sin código ni cálculo es un hueco que se ve", () => {
    const datos = copia(DATOS);
    datos.criterios.push({ ...datos.criterios.find((x) => x.id === "vocabulario-canonico"), id: "sin-calculo", codigo: null });
    expect(problemasDeControles(datos).join("\n")).toMatch(/sin-calculo: criterio con control/);
  });

  it("un matiz de una persona sobre un criterio automático se suma a la nota del control, sin cambiar el estado", () => {
    const filas = fichaDeSkill("x", { ...sinDefectos, defectos: [{ codigo: "tamano-cerca", detalle: "210 líneas" }] }, { skill: "x", juicios: { "tamano-cerca": { nota: "se parte en el PR siguiente" } } }, DATOS);
    const f = filas.find((x) => x.criterio === "tamano-cerca");
    expect(f.estado).toBe("no_cumple");
    expect(f.nota).toBe("210 líneas — matiz: se parte en el PR siguiente");
  });
});

describe("evidencias", () => {
  it("valen una ruta (con su cabecera), un caso y un comando que existen", () => {
    expect(faltaDeEvidencia(".claude/skills/github/SKILL.md#Operaciones habituales", CTX)).toBeNull();
    expect(faltaDeEvidencia("caso:github/ci-rojo-log", CTX)).toBeNull();
    expect(faltaDeEvidencia("npm run higiene-skills", CTX)).toBeNull();
    expect(faltaDeEvidencia("cualquier cosa", CTX)).toMatch(/no es ni una ruta/);
    expect(faltaDeEvidencia("../fuera.md", CTX)).toMatch(/no es ni una ruta/);
  });
});

describe("las cifras y las líneas", () => {
  it("una ficha da su línea de cifras contable", () => {
    const filas = [
      { criterio: "a", origen: "control", estado: "cumple" },
      { criterio: "b", origen: "control", estado: "no_cumple", nota: "x" },
      { criterio: "c", origen: "juicio", estado: "juicio", nota: "sin evaluar" },
      { criterio: "d", origen: "juicio", estado: "cumple" },
    ];
    expect(lineaDeCifras("x", cifrasDeFicha(filas))).toBe("fichas skill: x criterios: 4 vigilados: 2 de_juicio: 2 juzgados: 1 cumple: 2 no_cumple: 1 no_aplica: 0 juicio: 1");
  });

  it("higiene-skills habla en «skill: x criterio: y estado: z» y da la cifra de vigilados y de juicio", () => {
    const r = spawnSync("node", ["scripts/higiene-skills.mjs", "github"], { cwd: RAIZ, encoding: "utf8" });
    expect(r.stdout).toMatch(/^fichas skill: github criterios: \d+ vigilados: \d+ de_juicio: \d+ /m);
    expect(r.stdout).toMatch(/^ {2}skill: github criterio: [\w-]+ estado: (no_cumple|juicio) nota: /m);
    expect(r.stdout).toMatch(/^Fichas: 1 skills, /m);
    const todo = spawnSync("node", ["scripts/higiene-skills.mjs", "github", "--ficha"], { cwd: RAIZ, encoding: "utf8" }).stdout;
    expect(todo.match(/^ {2}skill: github criterio: /gm).length).toBe(criteriosDeSkill(DATOS, metaDe("github")).length);
  });
});
