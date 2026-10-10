import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CALCULOS_DE_JUICIO, CALCULOS_SIN_CODIGO, DIR_JUICIOS, ORIGENES, cifrasDeCriterios, criteriosDeSkill, criteriosDelRepo, criteriosEvaluados,
  ctxEvidencia, esAutomatico, estadoDeControl, faltaDeEvidencia, leerJuicios, lineaDeCifras, lineaDelConjunto, lineasDeCriterios, origenDe,
  problemasDeControles, problemasDeJuicios, senalesDelRepo, sumarCifras, versionDe, vocabulariosDeJuicio,
} from "../scripts/lib/juiciosSkills.mjs";
import { CAPAS_AGENTE } from "../scripts/lib/fondos.mjs";
import { ESTADOS_CRITERIO, MOTIVOS_PENDIENTE, leerFicha, leerForja, problemasDeFicha } from "../scripts/lib/forja.mjs";
import { nombresDeSkills } from "../scripts/lib/skills.mjs";

/**
 * Los criterios de cada skill y sus juicios (#457, fondo #455): cada skill tiene sus
 * juicios guardados, cada criterio que se le aplica aparece con un estado del
 * vocabulario de la forja, los juicios cumplen campos_ficha.juicio con evidencia que
 * existe y la versión del SKILL.md que juzgaron, y lo calculable (un control, una
 * pasada vigente) no se escribe a mano. Cada regla se ve fallar abajo.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOY = new Date();
const DATOS = leerForja(RAIZ);
const SKILLS = nombresDeSkills(RAIZ);
const GUARDADOS = leerJuicios(RAIZ);
const SENALES = senalesDelRepo(RAIZ, HOY);
const CTX = ctxEvidencia(RAIZ, HOY);
const TODAS = criteriosDelRepo(RAIZ, HOY, { senales: SENALES, guardadas: GUARDADOS, datos: DATOS });
const metaDe = (s) => SENALES[s].metadata;
const problemas = (s, ...g) => problemasDeJuicios(s, g.length ? g[0] : GUARDADOS[s], metaDe(s), DATOS, CTX);
const copia = (x) => JSON.parse(JSON.stringify(x));
const deJuicio = (s) => criteriosDeSkill(DATOS, metaDe(s)).filter((c) => origenDe(c) === "juicio").map((c) => c.id);
const unAutomatico = (s) => criteriosDeSkill(DATOS, metaDe(s)).find((c) => esAutomatico(c) && typeof c.codigo === "string" && c.sujeto !== "plantilla.tipo");
const hecho = (s, extra = {}) => ({ estado: "cumple", evidencia: [`.claude/skills/${s}/SKILL.md`], fecha: "2026-10-10", firmante: "gobierno", version_skill_md: SENALES[s].version, ...extra });

describe("los juicios de skill del repo", () => {
  it("toda skill tiene sus juicios y no hay juicios de una skill que no existe", () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(14);
    expect(SKILLS.filter((s) => !(s in GUARDADOS)), `sin juicios en ${DIR_JUICIOS}/`).toEqual([]);
    expect(Object.keys(GUARDADOS).filter((s) => !SKILLS.includes(s)), "juicios huérfanos").toEqual([]);
  });

  it("cada fichero de juicios está bien: completo, con los campos de campos_ficha.juicio, evidencia que existe y nada calculable escrito a mano", () => {
    for (const s of SKILLS) expect(problemas(s), s).toEqual([]);
  });

  it("todo criterio aplicable aparece una vez, y nada más", () => {
    for (const { nombre, filas } of TODAS) expect(filas.map((f) => f.criterio), nombre).toEqual(criteriosDeSkill(DATOS, metaDe(nombre)).map((c) => c.id));
  });

  it("toda línea se lee y la forja la da por buena (estado del vocabulario, nota solo en el hueco)", () => {
    for (const { nombre, filas } of TODAS) {
      for (const l of lineasDeCriterios(nombre, filas)) {
        const f = leerFicha(l);
        expect(f, l).not.toBeNull();
        expect(problemasDeFicha(f, DATOS), l).toEqual([]);
      }
    }
  });

  it("todo criterio automático de skill tiene con qué calcularse, y los cálculos de juicio son de criterios de juicio", () => {
    expect(problemasDeControles(DATOS)).toEqual([]);
    for (const id of [...Object.keys(CALCULOS_SIN_CODIGO), ...Object.keys(CALCULOS_DE_JUICIO)]) expect(DATOS.criterios.map((c) => c.id), id).toContain(id);
  });

  it("todo código de un criterio automático de skill (salvo la plantilla) se ve emitir en las pruebas de la higiene", () => {
    const pruebas = readFileSync(join(RAIZ, "scripts/higiene-skills.test.js"), "utf8");
    const sinVer = DATOS.criterios
      .filter((c) => c.aplica_a.includes("skill") && esAutomatico(c) && typeof c.codigo === "string" && c.sujeto !== "plantilla.tipo")
      .map((c) => c.codigo)
      .filter((cod) => !pruebas.includes(`"${cod}"`));
    expect(sinVer, "códigos que ninguna prueba de scripts/higiene-skills.test.js ve salir").toEqual([]);
  });

  it("el origen de cada fila es del vocabulario y casa con el criterio", () => {
    for (const { filas } of TODAS) for (const f of filas) {
      expect(Object.keys(ORIGENES)).toContain(f.origen);
      expect(f.origen === "control", f.criterio).toBe(f.control !== "juicio");
      if (f.estado === "juicio" && f.origen !== "control") expect(Object.keys(MOTIVOS_PENDIENTE), f.criterio).toContain(f.motivo);
    }
  });

  it("las cifras cuadran", () => {
    for (const { nombre, cifras: c } of TODAS) {
      expect(c.vigilados + c.de_juicio, nombre).toBe(c.criterios);
      expect(Object.keys(ESTADOS_CRITERIO).reduce((n, e) => n + c[e], 0), nombre).toBe(c.criterios);
      expect(c.calculados + c.a_mano, nombre).toBe(c.de_juicio);
      expect(c.resueltos, nombre).toBeLessThanOrEqual(c.calculados);
      expect(c.juzgados + c.pendientes, nombre).toBe(c.a_mano);
      expect(Object.values(c.motivos).reduce((a, b) => a + b, 0), nombre).toBe(c.juicio);
    }
  });

  it("la frase del conjunto: cada parte suma su total, sin contar dos veces", () => {
    const t = sumarCifras(TODAS.map((f) => f.cifras));
    const frase = lineaDelConjunto(TODAS.length, t);
    const m = frase.match(/^Criterios: \d+ skills, (\d+) criterios aplicados: (\d+) vigilados por un control y (\d+) de juicio: (\d+) de cálculo \((\d+) resueltos\) y (\d+) a mano \((\d+) juzgados, (\d+) pendientes\); cumple (\d+), no_cumple (\d+), no_aplica (\d+), juicio (\d+); juicio por motivo: /);
    expect(m, frase).not.toBeNull();
    const [total, vig, dj, calc, res, mano, juz, pend, cu, nc, na, ju] = m.slice(1).map(Number);
    expect(vig + dj).toBe(total);
    expect(calc + mano).toBe(dj);
    expect(res).toBeLessThanOrEqual(calc);
    expect(juz + pend).toBe(mano);
    expect(cu + nc + na + ju).toBe(total);
    // Un caso a mano en que el reparto viejo sumaba de más: un calculado pendiente.
    const c = cifrasDeCriterios([{ origen: "calculo", estado: "juicio", motivo: "sin_pasada" }, { origen: "juicio", estado: "cumple" }]);
    expect(lineaDelConjunto(1, c)).toMatch(/2 de juicio: 1 de cálculo \(0 resueltos\) y 1 a mano \(1 juzgados, 0 pendientes\)/);
  });

  it("el firmante sale de la misma lista de actores que los fondos (CAPAS_AGENTE)", () => {
    expect(vocabulariosDeJuicio().firmantes).toBe(CAPAS_AGENTE);
  });
});

describe("cada regla de los juicios guardados se ve fallar", () => {
  const s = "github";
  const base = GUARDADOS[s];
  const id = () => deJuicio(s)[0];
  const con = (j) => { const g = copia(base); g.juicios[id()] = j; return problemas(s, g).join("\n"); };

  it("sin juicios", () => expect(problemas(s, undefined)[0]).toMatch(/no tiene juicios/));

  it("falta un criterio de juicio", () => {
    const g = copia(base);
    delete g.juicios[id()];
    expect(problemas(s, g).join("\n")).toMatch(/falta el criterio de juicio/);
  });

  it("un estado o un motivo fuera de vocabulario", () => {
    expect(con({ estado: "regular", motivo_pendiente: "sin_mirar" })).toMatch(/no está en el vocabulario estados_criterio/);
    expect(con({ estado: "juicio", motivo_pendiente: "pereza" })).toMatch(/no está en el vocabulario motivos_pendiente/);
    expect(con({ estado: "juicio", motivo_pendiente: "otra_version" })).toMatch(/no está en el vocabulario motivos_pendiente/);
  });

  it("un juicio pendiente sin motivo, o con un motivo que es del criterio y el criterio no lo dice", () => {
    expect(con({ estado: "juicio", nota: "sin motivo ninguno" })).toMatch(/lleva motivo_pendiente/);
    const c = DATOS.criterios.find((x) => x.id === id());
    const otro = ["falta_herramienta", "falta_decision"].find((m) => m !== c.motivo_pendiente);
    expect(con({ estado: "juicio", motivo_pendiente: otro })).toMatch(/es del criterio: ponlo en ops\/forja.json/);
  });

  it("un juicio hecho sin evidencia, fecha, firmante o versión, o con un firmante de fuera", () => {
    for (const k of ["evidencia", "fecha", "firmante", "version_skill_md"]) {
      const j = hecho(s);
      delete j[k];
      expect(con(j), k).toMatch(new RegExp(`lleva «${k}»`));
    }
    expect(con(hecho(s, { firmante: "pablo" }))).toMatch(/no está en el vocabulario firmantes/);
    expect(con(hecho(s, { version_skill_md: "nohex" }))).toMatch(/no es una versión/);
  });

  it("una evidencia que no existe, de cada forma", () => {
    expect(con(hecho(s, { evidencia: ["ops/no-existe.json"] }))).toMatch(/no existe/);
    expect(con(hecho(s, { evidencia: [`caso:${s}/no-existe`] }))).toMatch(/no tiene el caso/);
    expect(con(hecho(s, { evidencia: [".claude/skills/github/SKILL.md#Sección inventada"] }))).toMatch(/no tiene la cabecera/);
    expect(con(hecho(s, { evidencia: ["npm run no-existe"] }))).toMatch(/no hay npm run/);
    expect(con(hecho(s, { evidencia: ["pr:abc"] }))).toMatch(/pr:<n> o issue:<n>/);
  });

  it("la evidencia de un juicio sobre otro SKILL.md no se valida: ese juicio ya no cuenta (otra_version)", () => {
    const viejo = hecho(s, { version_skill_md: "000000000000", evidencia: ["ops/no-existe.json"] });
    expect(con(viejo)).not.toMatch(/no existe/);
    expect(con(viejo)).toBe("");
    // La forma del campo sí se sigue mirando.
    expect(con(hecho(s, { version_skill_md: "nohex", evidencia: ["ops/no-existe.json"] }))).toMatch(/no es una versión/);
  });

  it("no_cumple lleva nota; cumple no", () => {
    expect(con(hecho(s, { estado: "no_cumple" }))).toMatch(/un no_cumple lleva «nota»/);
    expect(con(hecho(s, { nota: "una nota de más" }))).toMatch(/la nota solo va con/);
  });

  it("un estado escrito a mano para un criterio automático, o para uno que se deduce de una pasada", () => {
    const c = unAutomatico(s);
    const g = copia(base);
    g.juicios[c.id] = { estado: estadoDeControl(c, SENALES[s]).estado === "cumple" ? "no_cumple" : "cumple" };
    expect(problemas(s, g).join("\n")).toMatch(/lo calcula el control y no se escribe a mano/);
    const g2 = copia(base);
    g2.juicios["sin-duda-con-vecina"] = hecho(s);
    expect(problemas(s, g2).join("\n")).toMatch(/se deduce de las pasadas del nivel 2/);
  });

  it("un criterio que no existe o que no se aplica a la skill", () => {
    const g = copia(base);
    g.juicios["criterio-inventado"] = { estado: "juicio", motivo_pendiente: "sin_mirar" };
    expect(problemas(s, g).join("\n")).toMatch(/no es un criterio de ops\/forja.json/);
    const g2 = copia(base);
    g2.juicios["estandar-concreto-y-verificable"] = { estado: "juicio", motivo_pendiente: "sin_mirar" };
    expect(problemas(s, g2).join("\n")).toMatch(/no se aplica a esta skill/);
  });

  it("juicios de otra skill o con claves de más", () => {
    expect(problemas(s, { ...copia(base), skill: "vercel" }).join("\n")).toMatch(/no github/);
    expect(problemas(s, { ...copia(base), estados: {} }).join("\n")).toMatch(/clave «estados» no admitida/);
  });
});

describe("lo calculado", () => {
  const vacio = { metadata: { tipo: "servicio" }, version: "aaaaaaaaaaaa", defectos: [], estandar: [], glosario: [], pasadas: {} };
  const fila = (filas, id) => filas.find((x) => x.criterio === id);

  it("un código emitido por la higiene es no_cumple con su detalle como nota; sin él, cumple", () => {
    const c = DATOS.criterios.find((x) => x.id === "tamano-cerca");
    expect(estadoDeControl(c, vacio)).toEqual({ estado: "cumple", nota: null });
    expect(estadoDeControl(c, { ...vacio, defectos: [{ codigo: "tamano-cerca", detalle: "210 líneas de 220" }] })).toEqual({ estado: "no_cumple", nota: "210 líneas de 220" });
  });

  it("la caducidad tiene su propio código", () => {
    const cad = DATOS.criterios.find((x) => x.id === "caducada");
    expect(estadoDeControl(cad, { ...vacio, defectos: [{ codigo: "caducada", detalle: "hace 120 días" }] }).estado).toBe("no_cumple");
  });

  it("los criterios de la plantilla por tipo no se aplican a la pieza meta", () => {
    const p = DATOS.criterios.find((x) => x.sujeto === "plantilla.tipo");
    expect(estadoDeControl(p, { ...vacio, estandar: null }).estado).toBe("no_aplica");
    expect(estadoDeControl(p, { ...vacio, estandar: [{ codigo: p.codigo, detalle: "servicio: falta" }] }).estado).toBe("no_cumple");
  });

  it("el glosario: un sinónimo prohibido en la skill es no_cumple", () => {
    const g = DATOS.criterios.find((x) => x.id === "vocabulario-canonico");
    expect(estadoDeControl(g, vacio).estado).toBe("cumple");
    expect(estadoDeControl(g, { ...vacio, glosario: [{ ruta: "x", sinonimo: "runbook", canonico: "skill" }] }).estado).toBe("no_cumple");
  });

  it("un criterio automático sin código ni cálculo es un hueco que se ve", () => {
    const datos = copia(DATOS);
    datos.criterios.push({ ...datos.criterios.find((x) => x.id === "vocabulario-canonico"), id: "sin-calculo", codigo: null });
    expect(problemasDeControles(datos).join("\n")).toMatch(/sin-calculo: criterio con control/);
  });

  it("las pasadas: sin pasada vigente, pendiente (sin_pasada); con una duda en cualquier pasada vigente, no_cumple; limpia, cumple", () => {
    const sinPasada = criteriosEvaluados("x", vacio, { juicios: {} }, DATOS);
    expect(fila(sinPasada, "sin-duda-con-vecina")).toMatchObject({ estado: "juicio", motivo: "sin_pasada", origen: "calculo" });
    expect(fila(sinPasada, "casos-medidos-con-y-sin-skill")).toMatchObject({ estado: "juicio", motivo: "sin_pasada" });
    const limpia = { x: { disparo: [{ id: "a", esperado: "x", elegido: "x", estado: "ok" }] } };
    const conLimpia = criteriosEvaluados("x", { ...vacio, pasadas: limpia }, { juicios: {} }, DATOS);
    expect(fila(conLimpia, "sin-duda-con-vecina").estado).toBe("cumple");
    expect(fila(conLimpia, "casos-medidos-con-y-sin-skill")).toMatchObject({ estado: "no_cumple", nota: "la pasada vigente mide solo con la skill puesta" });
    const conAB = criteriosEvaluados("x", { ...vacio, pasadas: { x: { ...limpia.x, sin_skill: { ejecuciones: 3 } } } }, { juicios: {} }, DATOS);
    expect(fila(conAB, "casos-medidos-con-y-sin-skill").estado).toBe("cumple");
    const duda = { ...limpia, y: { disparo: [{ id: "b", esperado: "y", elegido: "x", estado: "falla" }] } };
    expect(fila(criteriosEvaluados("x", { ...vacio, pasadas: duda }, { juicios: {} }, DATOS), "sin-duda-con-vecina").nota).toMatch(/y\/b: esperaba y, eligió x/);
  });

  it("un juicio hecho sobre otra versión del SKILL.md vuelve a pendiente (otra_version) sin tocar el fichero", () => {
    const id = "frontera-casi-fallos";
    const j = { juicios: { [id]: { estado: "cumple", evidencia: ["x"], fecha: "2026-10-10", firmante: "gobierno", version_skill_md: "bbbbbbbbbbbb" } } };
    expect(fila(criteriosEvaluados("x", vacio, j, DATOS), id)).toMatchObject({ estado: "juicio", motivo: "otra_version" });
    j.juicios[id].version_skill_md = vacio.version;
    expect(fila(criteriosEvaluados("x", vacio, j, DATOS), id).estado).toBe("cumple");
  });

  it("lo pendiente del criterio sale en la nota con su issue", () => {
    const c = DATOS.criterios.find((x) => x.id === "solo-lo-que-el-modelo-no-sabe");
    expect(c.pendiente_de).toMatch(/^#\d+$/);
    const f = fila(criteriosEvaluados("x", vacio, { juicios: { [c.id]: { estado: "juicio", motivo_pendiente: c.motivo_pendiente } } }, DATOS), c.id);
    expect(f.nota).toBe(`${c.motivo_pendiente} (${c.pendiente_de})`);
  });

  it("la versión es la de skills-prueba (hashLF de 12)", () => {
    expect(versionDe("a\r\nb")).toBe(versionDe("a\nb"));
    expect(versionDe("x")).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("evidencias", () => {
  it("valen una ruta (con su cabecera), un caso, un comando, un PR y un issue", () => {
    expect(faltaDeEvidencia(".claude/skills/github/SKILL.md#Operaciones habituales", CTX)).toBeNull();
    expect(faltaDeEvidencia("caso:github/ci-rojo-log", CTX)).toBeNull();
    expect(faltaDeEvidencia("npm run higiene-skills", CTX)).toBeNull();
    expect(faltaDeEvidencia("pr:446", CTX)).toBeNull();
    expect(faltaDeEvidencia("issue:338", CTX)).toBeNull();
    expect(faltaDeEvidencia("cualquier cosa", CTX)).toMatch(/no es ni una ruta/);
    expect(faltaDeEvidencia("../fuera.md", CTX)).toMatch(/no es ni una ruta/);
  });

  it("una pasada del nivel 2 solo vale si está vigente", () => {
    const ctx = (vigente) => ({ ...CTX, existe: () => true, pasadaVigente: () => vigente });
    expect(faltaDeEvidencia("ops/skills-prueba/github.json", ctx(null))).toMatch(/desactualizada/);
    expect(faltaDeEvidencia("ops/skills-prueba/github.json", ctx({ disparo: [] }))).toBeNull();
  });
});

describe("las cifras y las líneas", () => {
  it("una skill da su línea de cifras contable", () => {
    const filas = [
      { criterio: "a", origen: "control", estado: "cumple" },
      { criterio: "b", origen: "control", estado: "no_cumple", nota: "x" },
      { criterio: "c", origen: "juicio", estado: "juicio", motivo: "sin_mirar" },
      { criterio: "d", origen: "calculo", estado: "cumple" },
    ];
    const c = cifrasDeCriterios(filas);
    expect(lineaDeCifras("x", c)).toBe("criterios skill: x criterios: 4 vigilados: 2 de_juicio: 2 calculados: 1 resueltos: 1 a_mano: 1 juzgados: 0 pendientes: 1 cumple: 2 no_cumple: 1 no_aplica: 0 juicio: 1");
    expect(c.motivos).toEqual({ sin_mirar: 1 });
  });

  it("higiene-skills habla en «skill: x criterio: y estado: z» y da la cifra de vigilados y de juicio", () => {
    const r = spawnSync("node", ["scripts/higiene-skills.mjs", "github"], { cwd: RAIZ, encoding: "utf8" });
    expect(r.stdout).toMatch(/^criterios skill: github criterios: \d+ vigilados: \d+ de_juicio: \d+ /m);
    expect(r.stdout).toMatch(/^ {2}skill: github criterio: [\w-]+ estado: (no_cumple|juicio) nota: /m);
    expect(r.stdout).toMatch(/^Criterios: 1 skills, /m);
    const todo = spawnSync("node", ["scripts/higiene-skills.mjs", "github", "--todos"], { cwd: RAIZ, encoding: "utf8" }).stdout;
    expect(todo.match(/^ {2}skill: github criterio: /gm).length).toBe(criteriosDeSkill(DATOS, metaDe("github")).length);
  });
});
