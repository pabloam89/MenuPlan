import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { contexto, crearRaizSintetica, ejecutar, idsEscritos, idsEscritosEn, SONDAS, SONDAS_CONOCIDAS } from "../scripts/lib/escalaProyectos.mjs";
import { ficherosDeGit } from "./ficherosGit.js";

/**
 * La factoría escala (principio `scales-by-design`; normas `pieza-vale-con-un-proyecto-mas` y `variacion-como-dato`).
 *
 * Se da de alta un tercer proyecto, el SINTÉTICO (scripts/fixtures/proyecto-sintetico/), solo en una raíz temporal, y con él se
 * ejecutan los lectores y vigilantes que recorren proyectos (scripts/lib/escalaProyectos.mjs). Tres cosas:
 *  1. las sondas que ya valen para un proyecto más deben salir vacías: si una pieza solo funciona para los proyectos reales, falla;
 *  2. las sondas que hoy fallan son la auditoría medida de la factoría: su cifra tiene techo en ops/normas-techos.json y solo baja
 *     (al arreglar una, el techo baja con ella);
 *  3. las líneas de las piezas de la casa (y de sus tests) que nombran a mano el id de un proyecto tienen su techo, que solo baja:
 *     lo que varía entre proyectos se lee de ops/entidades.json (`projects`).
 * Al final, cada comprobación se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const TECHOS = JSON.parse(readFileSync(join(RAIZ, "ops/normas-techos.json"), "utf8"));
const CLAVES = ["escala_fallos_con_un_proyecto_mas", "escala_ids_de_proyecto_en_piezas", "escala_ids_de_proyecto_en_tests"];
const UNA_VEZ = 300_000;

let sintetico;
let ctx;
let pasan;
let conocidas;
let escritos;
let reales;

beforeAll(() => {
  sintetico = crearRaizSintetica(RAIZ);
  ctx = contexto(sintetico.tmp, sintetico.id, RAIZ);
  reales = ctx.ids.filter((i) => i !== sintetico.id);
  pasan = ejecutar(SONDAS, ctx);
  conocidas = ejecutar(SONDAS_CONOCIDAS, ctx);
  escritos = idsEscritos(RAIZ, reales, ficherosDeGit(RAIZ));
}, UNA_VEZ);

afterAll(() => sintetico?.limpiar());

describe("con un proyecto más (el sintético), las piezas que recorren proyectos siguen valiendo", () => {
  it("el proyecto sintético no está en ningún registro real", () => {
    for (const f of ["ops/entidades.json", "ops/normas.json"]) expect(readFileSync(join(RAIZ, f), "utf8"), f).not.toContain(sintetico.id);
    expect(ctx.ids).toContain(sintetico.id);
    expect(reales.length, "hay proyectos reales").toBeGreaterThan(0);
  });

  it("cada sonda sale vacía", () => {
    const malas = pasan.filter((s) => s.problemas.length);
    expect(malas.map((s) => `${s.sonda}\n   ${s.problemas.slice(0, 5).join("\n   ")}`), "Una pieza solo vale para los proyectos reales: léela de ops/entidades.json y de ops/proyectos/<id>/ en vez de escribir el proyecto").toEqual([]);
  });
}, UNA_VEZ);

describe("la auditoría de la factoría: lo que aún solo vale para los proyectos reales (techo que solo baja)", () => {
  const medidas = () => ({
    escala_fallos_con_un_proyecto_mas: conocidas.reduce((n, s) => n + s.problemas.length, 0),
    escala_ids_de_proyecto_en_piezas: escritos.piezas.length,
    escala_ids_de_proyecto_en_tests: escritos.tests.length,
  });

  it("los tres techos existen en ops/normas-techos.json", () => {
    for (const k of CLAVES) expect(Number.isInteger(TECHOS[k]), k).toBe(true);
  });

  it("la cifra de hoy no sube del techo", () => {
    const m = medidas();
    for (const k of CLAVES) expect(m[k], `${k}: nueva pieza que solo vale para los proyectos reales o que nombra su id a mano. Lo que varía se lee de ops/entidades.json. Piezas: ${[...escritos.piezas, ...conocidas.flatMap((s) => s.problemas)].join(" | ")}`).toBeLessThanOrEqual(TECHOS[k]);
  });

  it("si baja, el techo baja con ella (si no, volvería a subir sin verse)", () => {
    const m = medidas();
    for (const k of CLAVES) expect(TECHOS[k], `${k}: la cifra medida es ${m[k]}; baja el techo en ops/normas-techos.json`).toBe(m[k]);
  });

  it("los techos no suben respecto a origin/staging (si se puede leer sin red)", () => {
    let enStaging = null;
    try { enStaging = JSON.parse(execFileSync("git", ["show", "origin/staging:ops/normas-techos.json"], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { /* sin referencia */ }
    if (!enStaging) return;
    for (const k of CLAVES) if (typeof enStaging[k] === "number") expect(TECHOS[k], `${k} no puede subir (staging: ${enStaging[k]})`).toBeLessThanOrEqual(enStaging[k]);
  });

  it("cada sonda conocida dice qué pieza falla", () => {
    for (const s of conocidas) for (const p of s.problemas) expect(p.length, s.sonda).toBeGreaterThan(20);
  });
}, UNA_VEZ);

describe("se ven fallar (cada caso cambia UNA cosa)", () => {
  const fichero = (...r) => join(sintetico.tmp, ...r);
  const sonda = (nombre) => SONDAS[Object.keys(SONDAS).find((k) => k.startsWith(nombre))](contexto(sintetico.tmp, sintetico.id, RAIZ));

  it("una norma del proyecto con el project de otro", () => {
    const ruta = fichero("ops", "proyectos", sintetico.id, "normas.json");
    const original = readFileSync(ruta, "utf8");
    try {
      const r = JSON.parse(original);
      r.normas[0].project = reales[0];
      writeFileSync(ruta, JSON.stringify(r));
      expect(sonda("normas del proyecto").join("\n")).toMatch(/project/);
    } finally { writeFileSync(ruta, original); }
  });

  it("una pieza que no lee el registro del proyecto sale como «no ha leído nada», no como verde", () => {
    const ruta = fichero("ops", "proyectos", sintetico.id, "tareas.json");
    const aparte = `${ruta}.aparte`;
    renameSync(ruta, aparte);
    try { expect(sonda("tareas del proyecto").join("\n")).toMatch(/no ha leído nada del proyecto/); } finally { renameSync(aparte, ruta); }
  });

  it("una tarea del proyecto que cita una norma que no existe", () => {
    const ruta = fichero("ops", "proyectos", sintetico.id, "tareas.json");
    const original = readFileSync(ruta, "utf8");
    try {
      const r = JSON.parse(original);
      r.agentes.constructor.tareas[0].normas = ["no-existe"];
      writeFileSync(ruta, JSON.stringify(r));
      expect(sonda("tareas del proyecto").join("\n")).toMatch(/no es una norma del proyecto/);
    } finally { writeFileSync(ruta, original); }
  });

  it("un id de proyecto escrito a mano: comillas con «proyecto», ruta, opción y clave de objeto; los comentarios y otras palabras, no", () => {
    const ids = ["alfa", "beta"];
    const cuenta = (t) => idsEscritosEn(t, ids).length;
    expect(cuenta('const PROYECTO = "alfa";')).toBe(1);
    expect(cuenta("const ruta = `ops/proyectos/beta/normas.json`;")).toBe(1);
    expect(cuenta('console.error("usa --proyecto alfa");')).toBe(1);
    expect(cuenta('const DEF = {\n  beta: "el segundo",\n};')).toBe(1);
    expect(cuenta('// el proyecto "alfa" es el de ejemplo')).toBe(0);
    expect(cuenta("/**\n * ops/proyectos/alfa/\n */\nconst x = 1;")).toBe(0);
    expect(cuenta('const METODOS = ["alfa", "gamma"];')).toBe(0);
    expect(cuenta("const proyecto = ids.find((x) => x === otro);")).toBe(0);
  });

  it("una lista de proyectos escrita a mano que no incluye el del registro (la sonda conocida la mide)", () => {
    const sale = ejecutar({ lista: SONDAS_CONOCIDAS[Object.keys(SONDAS_CONOCIDAS)[0]] }, { ...ctx, ids: [...ctx.ids, "otro-mas"] })[0];
    expect(sale.problemas.join("\n")).toMatch(/otro-mas/);
  });
}, UNA_VEZ);
