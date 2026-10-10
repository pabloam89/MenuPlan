import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EJECUTORES, MARCAS, VEREDICTOS, cuentaPorDureza, durezaDelPaso, generarCatalogos, generarFichas, generarTablaPasos,
  problemas, regenerar, textoEntre,
} from "../scripts/lib/flujo.mjs";
import { GRUPOS } from "../scripts/lib/issues.mjs";
import * as registroNormas from "../scripts/lib/normas.mjs";
import { generarTabla } from "../scripts/lib/presupuestos.mjs";

/**
 * El flujo de una incidencia (#335, fase F0 de #334) no se puede quedar en
 * prosa. Este test vigila cinco cosas:
 *
 *  1. que ops/flujo.json tenga la forma y el vocabulario cerrado;
 *  2. que lo que dice sea verdad: cada fichero que cita existe Y lleva la frase
 *     que se dice que lleva, cada test existe, y ninguna obligación se dice
 *     «dura» sin ejecutor del sistema y sin un *.test.js que nombre su fichero;
 *  3. que las obligaciones enlazadas con una norma de ops/normas.json digan lo
 *     mismo que el registro (ejecutor y dureza): una sola fuente;
 *  4. que las tablas de docs/ops/FLUJO.md salgan del JSON (no se editan a mano);
 *  5. que CLAUDE.md apunte aquí en vez de repetir el flujo.
 *
 * Y, abajo, un autotest: cada regla falla con datos malos, como en
 * supabase/principios.test.js. Un test que nunca se ha visto fallar no vigila.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leerTexto = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const existe = (ruta) => typeof ruta === "string" && existsSync(join(RAIZ, ruta));
const leer = (ruta) => (existe(ruta) ? leerTexto(ruta) : null);
const datos = JSON.parse(leerTexto("ops/flujo.json"));
const md = leerTexto("docs/ops/FLUJO.md");
const planos = JSON.parse(leerTexto("ops/planos.json"));
const registro = registroNormas.leerRegistro(RAIZ);
const normas = Object.fromEntries(registro.normas.map((n) => [n.id, n]));
const skills = readdirSync(join(RAIZ, ".claude/skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const arreglos = Object.keys(GRUPOS.arreglo.valores);
const existeTest = (test) => registroNormas.testExiste(test, { raiz: RAIZ, planos });
const ctx = { existe, leer, existeTest, skills, arreglos, normas };

const reglas = (lista) => [...new Set(lista.map((x) => x.split(":")[0]))].sort();
const obligacion = (d, id) => d.pasos.flatMap((p) => p.obligaciones).find((o) => o.id === id);
const todas = datos.pasos.flatMap((p) => p.obligaciones);

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
    expect(Object.values(cuentaPorDureza(datos)).reduce((a, b) => a + b, 0)).toBe(todas.length);
  });
});

describe("flujo.json y el registro de normas (#296) dicen lo mismo", () => {
  it("el vocabulario de ejecutor y de veredicto es el del registro (se importa, no se copia)", () => {
    expect(EJECUTORES).toBe(registroNormas.EJECUTORES);
    expect(VEREDICTOS).toBe(registroNormas.VEREDICTOS);
  });

  it("cada obligación enlazada coincide con su norma en ejecutor y en dureza", () => {
    const malas = todas.filter((o) => o.norma).filter((o) => {
      const n = normas[o.norma];
      return !n || n.ejecutor !== o.ejecutor || n.veredicto !== o.dureza;
    });
    expect(malas.map((o) => o.id), "Si el registro cambia de veredicto, cambia aquí también (o al revés), en el mismo PR").toEqual([]);
  });

  it("el número de obligaciones enlazadas solo puede subir", () => {
    // Trinquete: una obligación que se desenlaza vuelve a ser una segunda verdad.
    expect(todas.filter((o) => o.norma).length).toBeGreaterThanOrEqual(11);
  });
});

describe("docs/ops/FLUJO.md: las tablas salen del JSON", () => {
  const aviso = "Las tablas de FLUJO.md se generan: edita ops/flujo.json y lanza `npm run flujo -- --escribir`";
  it("las fichas de los pasos", () => expect(textoEntre(md, MARCAS.fichas), aviso).toBe(generarFichas(datos)));
  it("las obligaciones", () => expect(textoEntre(md, MARCAS.pasos), aviso).toBe(generarTablaPasos(datos)));
  it("los catálogos", () => expect(textoEntre(md, MARCAS.catalogos), aviso).toBe(generarCatalogos(datos, generarTabla())));
  it("regenerar no cambia nada", () => expect(regenerar(md, datos, generarTabla())).toBe(md));
  it("el documento no usa saltos de línea de Windows (el CI es Linux)", () => expect(md).not.toContain("\r"));
});

describe("CLAUDE.md apunta al flujo y no lo repite", () => {
  const claude = leerTexto("CLAUDE.md").toLowerCase();
  it("cita docs/ops/FLUJO.md", () => expect(claude).toContain("docs/ops/flujo.md"));
  it("no copia la definición de ninguna respuesta del análisis (viven en scripts/lib/issues.mjs)", () => {
    for (const [respuesta, definicion] of Object.entries(GRUPOS.analisis.valores)) {
      const arranque = definicion.slice(0, 30).toLowerCase();
      expect(claude, `CLAUDE.md copia la definición de «${respuesta}»: tiene una sola fuente, scripts/lib/issues.mjs`).not.toContain(arranque);
    }
  });
  it("npm run flujo existe", () => expect(JSON.parse(leerTexto("package.json")).scripts.flujo).toBeTruthy());
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
  ["obligacion-campos", "un campo que no existe", (d) => { obligacion(d, "P01.1").inventado = 1; }],
  ["ejecutor", "un ejecutor fuera del vocabulario", (d) => { obligacion(d, "P07.5").ejecutor = "inventado"; }],
  ["dureza", "una dureza fuera del vocabulario", (d) => { obligacion(d, "P07.5").dureza = "durisima"; }],
  ["ref-no-existe", "una referencia a un fichero que no está", (d) => { obligacion(d, "P01.3").ref = "src/no-existe.js"; }],
  ["ref-no-contiene", "un fichero que existe pero no lleva la frase (la clase #231)", (d) => { obligacion(d, "P04.1").contiene = "una frase que no está en ese fichero"; }],
  ["ref-contiene-corto", "una frase tan genérica que cualquier fichero la lleva", (d) => { obligacion(d, "P06.3").contiene = "e"; }],
  ["ref-sin-contiene", "un ref sin decir qué tiene que llevar", (d) => { obligacion(d, "P04.1").contiene = null; }],
  ["ref-sin-nota", "sin ref y sin decir por qué", (d) => { delete obligacion(d, "P04.3").nota; }],
  ["ref-nulo", "sin ref con un ejecutor que sí tiene que tener fichero", (d) => { Object.assign(obligacion(d, "P07.1"), { ref: null, contiene: null, nota: "x" }); }],
  ["test-no-existe", "un test que no existe", (d) => { obligacion(d, "P07.5").test = "ops/no-existe.test.js"; }],
  ["fase-desconocida", "una fase que no es del plan", (d) => { obligacion(d, "P02.1").fase = ["#99999"]; }],
  ["norma-desconocida", "una norma que no está en el registro", (d) => { obligacion(d, "P02.1").norma = "no-existe-en-el-registro"; }],
  ["norma-distinta", "una dureza distinta de la del registro", (d) => { obligacion(d, "P02.1").dureza = "blanda"; }],
  ["norma-distinta", "un ejecutor distinto del del registro", (d) => { obligacion(d, "P07.6").ejecutor = "ci"; }],
  ["dura-sin-sistema", "dura con la guardia, que solo ve a Claude", (d) => { obligacion(d, "P02.1").dureza = "dura"; obligacion(d, "P02.1").fase = []; }],
  ["dura-sin-test", "dura sin test", (d) => { obligacion(d, "P07.5").test = null; }],
  ["dura-test-ajeno", "dura con un test que no nombra su fichero", (d) => { obligacion(d, "P07.5").test = ".claude/skills.test.js"; }],
  ["dura-test-ajeno", "dura con un test que no es un *.test.js", (d) => { obligacion(d, "P07.5").test = "package.json"; }],
  ["dura-con-fase", "dura y aún con fase pendiente", (d) => { obligacion(d, "P07.5").fase = ["#337"]; }],
  ["ejecutor-blando", "semidura con ejecutor «nada»", (d) => { obligacion(d, "P04.3").dureza = "semidura"; }],
  ["sin-fase", "blanda sin la fase que la endurece", (d) => { obligacion(d, "P04.3").fase = []; }],
  ["sin-fase", "aceptada sin explicar por qué", (d) => { delete obligacion(d, "P01.3").nota; }],
  ["capa", "una capa menos", (d) => { d.capas.pop(); }],
  ["escalera", "un escalón sin su etiqueta de arreglo", (d) => { d.escalera.pop(); }],
  ["tipo-skill", "un tipo de skill reservado sin fase", (d) => { d.tipos_skill.find((t) => t.id === "dominio").fase = []; }],
  ["presupuesto", "el catálogo copiado en flujo.json (dos fuentes): vive en ops/presupuestos.json", (d) => { d.presupuestos = { por_alcance: {} }; }],
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
