import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EJECUTORES, MARCAS, VEREDICTOS, cuentaPorDureza, durezaDelPaso, generarCatalogos, generarFichas, generarTablaPasos,
  problemas, regenerar, textoEntre,
} from "../scripts/lib/flujo.mjs";
import { GRUPOS } from "../scripts/lib/issues.mjs";

/**
 * El flujo de una incidencia (#335, fase F0 de #334) no se puede quedar en
 * prosa. Este test vigila cuatro cosas:
 *
 *  1. que ops/flujo.json tenga la forma y el vocabulario cerrado;
 *  2. que lo que dice sea verdad: cada fichero y cada test que cita existe, y
 *     ninguna obligación se dice «dura» sin un ejecutor del sistema y un test;
 *  3. que las tablas de docs/ops/FLUJO.md salgan del JSON (no se editan a mano);
 *  4. que CLAUDE.md apunte aquí en vez de repetir el flujo.
 *
 * Y, abajo, un autotest: cada regla falla con datos malos, como en
 * supabase/principios.test.js. Un test que nunca se ha visto fallar no vigila.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const existe = (ruta) => typeof ruta === "string" && existsSync(join(RAIZ, ruta));
const datos = JSON.parse(leer("ops/flujo.json"));
const md = leer("docs/ops/FLUJO.md");
const skills = readdirSync(join(RAIZ, ".claude/skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const arreglos = Object.keys(GRUPOS.arreglo.valores);
const ctx = { existe, skills, arreglos };

const reglas = (lista) => [...new Set(lista.map((x) => x.split(":")[0]))].sort();
const obligacion = (d, id) => d.pasos.flatMap((p) => p.obligaciones).find((o) => o.id === id);

describe("flujo.json: forma, vocabulario y verdad", () => {
  it("no tiene ningún problema", () => {
    expect(problemas(datos, ctx), "Corrige ops/flujo.json (o el fichero que cita) y vuelve a lanzar").toEqual([]);
  });

  it("tiene doce pasos y obligaciones en todos", () => {
    expect(datos.pasos).toHaveLength(12);
    for (const p of datos.pasos) expect(p.obligaciones.length, p.id).toBeGreaterThan(0);
  });

  it("la dureza de un paso es la de su obligación más débil", () => {
    const paso = datos.pasos.find((p) => p.id === "ejecutar");
    expect(paso.obligaciones.some((o) => o.dureza === "dura")).toBe(true);
    expect(durezaDelPaso(paso)).toBe("blanda");
  });

  it("la cuenta de obligaciones por dureza suma todas", () => {
    const total = datos.pasos.reduce((n, p) => n + p.obligaciones.length, 0);
    expect(Object.values(cuentaPorDureza(datos)).reduce((a, b) => a + b, 0)).toBe(total);
  });
});

describe("docs/ops/FLUJO.md: las tablas salen del JSON", () => {
  const aviso = "Las tablas de FLUJO.md se generan: edita ops/flujo.json y lanza `npm run flujo -- --escribir`";
  it("las fichas de los pasos", () => expect(textoEntre(md, MARCAS.fichas), aviso).toBe(generarFichas(datos)));
  it("las obligaciones", () => expect(textoEntre(md, MARCAS.pasos), aviso).toBe(generarTablaPasos(datos)));
  it("los catálogos", () => expect(textoEntre(md, MARCAS.catalogos), aviso).toBe(generarCatalogos(datos)));
  it("regenerar no cambia nada", () => expect(regenerar(md, datos)).toBe(md));
});

describe("CLAUDE.md apunta al flujo y no lo repite", () => {
  const claude = leer("CLAUDE.md");
  it("cita docs/ops/FLUJO.md", () => expect(claude).toContain("docs/ops/FLUJO.md"));
  it("no copia la definición de las cuatro respuestas (viven en scripts/lib/issues.mjs)", () => {
    expect(claude, "La definición de «nuevo», «abierto»… tiene una sola fuente: scripts/lib/issues.mjs").not.toMatch(/no había problema de fondo/i);
  });
  it("npm run flujo existe", () => expect(JSON.parse(leer("package.json")).scripts.flujo).toBeTruthy());
});

describe("convergencia con el registro de normas (#296)", () => {
  const ruta = join(RAIZ, "scripts/lib/normas.mjs");
  // Hasta que #296 entre en staging no hay nada que cruzar; en cuanto entre,
  // este test se activa solo y los dos vocabularios no pueden separarse.
  describe.runIf(existsSync(ruta))("con scripts/lib/normas.mjs", () => {
    it("el vocabulario de ejecutor y de veredicto es el mismo", async () => {
      const n = await import(pathToFileURL(ruta).href);
      expect(Object.keys(EJECUTORES)).toEqual(Object.keys(n.EJECUTORES));
      expect(Object.keys(VEREDICTOS)).toEqual(Object.keys(n.VEREDICTOS));
    });
    it("cada norma citada existe en ops/normas.json", async () => {
      const n = await import(pathToFileURL(ruta).href);
      const registro = n.leerRegistro(RAIZ);
      const ids = new Set((Array.isArray(registro) ? registro : registro.normas ?? []).map((x) => x.id));
      const citadas = datos.pasos.flatMap((p) => p.obligaciones).map((o) => o.norma).filter(Boolean);
      expect(citadas.filter((id) => !ids.has(id))).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Autotest: cada regla falla con datos malos. Cada caso cambia UNA cosa.

/** [regla que debe saltar, qué se rompe, cómo se rompe]. */
const MALOS = [
  ["paso-orden", "dos pasos intercambiados", (d) => { [d.pasos[0], d.pasos[1]] = [d.pasos[1], d.pasos[0]]; }],
  ["paso-campos", "un paso sin «sale»", (d) => { d.pasos[2].sale = ""; }],
  ["actor", "un actor inventado", (d) => { d.pasos[0].quien = ["robot"]; }],
  ["skill-no-existe", "una skill que no existe", (d) => { d.pasos[1].skill = "inventada"; }],
  ["medida", "un indicador «existe» en un fichero que no está", (d) => { d.pasos[1].mide[0].donde = "src/no-existe.js"; }],
  ["medida", "un estado de medida inventado", (d) => { d.pasos[1].mide[0].estado = "quizas"; }],
  ["obligacion-id", "un id repetido", (d) => { obligacion(d, "P01.2").id = "P01.1"; }],
  ["obligacion-id", "un id que no es de su paso", (d) => { obligacion(d, "P02.1").id = "P09.1"; }],
  ["obligacion-campos", "una obligación sin «fase»", (d) => { delete obligacion(d, "P01.1").fase; }],
  ["ejecutor", "un ejecutor fuera del vocabulario", (d) => { obligacion(d, "P07.5").ejecutor = "inventado"; }],
  ["dureza", "una dureza fuera del vocabulario", (d) => { obligacion(d, "P07.5").dureza = "durisima"; }],
  ["ref-no-existe", "una referencia a un fichero que no está", (d) => { obligacion(d, "P01.3").ref = "src/no-existe.js"; }],
  ["test-no-existe", "un test que no existe", (d) => { obligacion(d, "P07.5").test = "ops/no-existe.test.js"; }],
  ["fase-desconocida", "una fase que no es del plan", (d) => { obligacion(d, "P02.1").fase = ["#99999"]; }],
  ["dura-sin-sistema", "dura con la guardia, que solo ve a Claude", (d) => { obligacion(d, "P02.1").dureza = "dura"; obligacion(d, "P02.1").fase = []; }],
  ["dura-sin-test", "dura sin test", (d) => { obligacion(d, "P07.5").test = null; }],
  ["dura-con-fase", "dura y aún con fase pendiente", (d) => { obligacion(d, "P07.5").fase = ["#337"]; }],
  ["ejecutor-blando", "semidura con ejecutor «nada»", (d) => { obligacion(d, "P02.3").dureza = "semidura"; }],
  ["sin-fase", "blanda sin la fase que la endurece", (d) => { obligacion(d, "P04.3").fase = []; }],
  ["sin-fase", "aceptada sin explicar por qué", (d) => { delete obligacion(d, "P01.3").nota; }],
  ["capa", "una capa menos", (d) => { d.capas.pop(); }],
  ["escalera", "un escalón sin su etiqueta de arreglo", (d) => { d.escalera.pop(); }],
  ["tipo-skill", "un tipo de skill reservado sin fase", (d) => { d.tipos_skill.find((t) => t.id === "dominio").fase = []; }],
  ["presupuesto", "tres rondas permitidas", (d) => { d.presupuestos.por_alcance.local.rondas_max = 3; }],
  ["presupuesto", "un alcance sin presupuesto", (d) => { delete d.presupuestos.por_alcance.transversal; }],
];

describe("flujo.json: el test distingue lo bueno de lo malo", () => {
  it.each(MALOS)("%s · %s", (regla, _quien, romper) => {
    const malo = structuredClone(datos);
    romper(malo);
    expect(reglas(problemas(malo, ctx))).toContain(regla);
  });

  it("los datos de verdad no disparan ninguna regla", () => {
    expect(problemas(structuredClone(datos), ctx)).toEqual([]);
  });
});
