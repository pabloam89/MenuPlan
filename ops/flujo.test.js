import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ORDEN_VEREDICTO, VEREDICTOS } from "../scripts/lib/escalas.mjs";
import {
  CAMPOS_DE_NORMA, EJECUTORES, MARCAS, contextoDeNormas, cuentaPorVeredicto, generarCatalogos, generarFichas, generarTablaPasos,
  obligacionesDe, problemas, regenerar, resolver, textoEntre, veredictoDelPaso,
} from "../scripts/lib/flujo.mjs";
import { GRUPOS } from "../scripts/lib/issues.mjs";
import * as registroNormas from "../scripts/lib/normas.mjs";
import { fraseDeRegla } from "../scripts/lib/regla.mjs";
import { generarTabla } from "../scripts/lib/presupuestos.mjs";

/**
 * El flujo de una incidencia (#335, fase F0 de #334) no se puede quedar en
 * prosa. Este test vigila cinco cosas:
 *
 *  1. que ops/flujo.json tenga la forma y el vocabulario cerrado;
 *  2. que lo que dice sea verdad: cada fichero que cita existe Y lleva la frase
 *     que se dice que lleva, cada test existe, y ninguna obligación se dice
 *     «dura» sin ejecutor del sistema y sin un *.test.js que nombre su fichero;
 *  3. que cada obligación se escriba por campos (la plantilla de regla.mjs) o remita a
 *     su norma de ops/normas.json sin copiar su frase, su ejecutor ni su veredicto: una sola fuente;
 *  4. que la tabla de docs/ops/FLUJO.md salga del JSON y del registro (no se edita a mano);
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
const registro = registroNormas.leerRegistro(RAIZ);
const contexto = contextoDeNormas(registro);
const { normas } = contexto;
const skills = readdirSync(join(RAIZ, ".claude/skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const ctx = { existe, leer, skills, normas, sujetos: registro.sujetos };

const reglas = (lista) => [...new Set(lista.map((x) => x.split(":")[0]))].sort();
const obligacion = (d, id) => d.pasos.flatMap((p) => p.obligaciones).find((o) => o.id === id);
const todas = obligacionesDe(datos);
const conNorma = todas.filter((o) => o.norma);
const sinNorma = todas.filter((o) => !o.norma);

describe("flujo.json: forma, vocabulario y verdad", () => {
  it("no tiene ningún problema", () => {
    expect(problemas(datos, ctx), "Corrige ops/flujo.json (o el fichero que cita) y vuelve a lanzar").toEqual([]);
  });

  it("tiene doce pasos y obligaciones en todos", () => {
    expect(datos.pasos).toHaveLength(12);
    for (const p of datos.pasos) expect(p.obligaciones.length, p.id).toBeGreaterThan(0);
  });

  it("el veredicto de un paso es el de su obligación más débil", () => {
    const paso = datos.pasos.find((p) => p.id === "ejecutar");
    expect(paso.obligaciones.some((o) => resolver(o, normas).veredicto === "dura")).toBe(true);
    expect(veredictoDelPaso(paso, normas)).toBe("blanda");
  });

  it("la cuenta de obligaciones por veredicto suma todas", () => {
    expect(Object.values(cuentaPorVeredicto(datos, normas)).reduce((a, b) => a + b, 0)).toBe(todas.length);
  });
});

describe("flujo.json y el registro de normas (#296): cada dato, en un solo sitio", () => {
  it("el vocabulario de ejecutor es el del registro y la escala de veredicto es la de escalas.mjs (se importan, no se copian)", () => {
    expect(EJECUTORES).toBe(registroNormas.EJECUTORES);
    expect(Object.keys(VEREDICTOS)).toEqual(ORDEN_VEREDICTO);
  });

  it("toda obligación remite a su norma o va por campos, y ninguna con norma copia lo suyo", () => {
    for (const o of conNorma) {
      expect(Object.keys(o).filter((k) => CAMPOS_DE_NORMA.includes(k)), `${o.id} copia datos de ${o.norma}`).toEqual([]);
      expect(normas[o.norma], `${o.id} remite a una norma que no existe`).toBeTruthy();
    }
    for (const o of sinNorma) expect(o, `${o.id} no remite a ninguna norma: va por campos`).toHaveProperty("exigencia");
  });

  it("la frase y los datos de una obligación con norma salen de la norma", () => {
    for (const o of conNorma) {
      const e = resolver(o, normas);
      const n = normas[o.norma];
      expect({ nombre: e.nombre, ejecutor: e.ejecutor, veredicto: e.veredicto, control: e.control }, o.id)
        .toEqual({ nombre: n.nombre, ejecutor: n.ejecutor, veredicto: n.veredicto, control: n.control });
      expect(fraseDeRegla(e, { ...registro.sujetos, ...datos.sujetos }), o.id).toBe(fraseDeRegla(n, registro.sujetos));
    }
  });

  it("el número de obligaciones que remiten a su norma solo puede subir", () => {
    // Trinquete: una obligación que se escribe aparte vuelve a ser una segunda verdad.
    expect(conNorma.length).toBeGreaterThanOrEqual(25);
  });
});

describe("docs/ops/FLUJO.md: las tablas salen del JSON y del registro de normas", () => {
  const aviso = "Las tablas de FLUJO.md se generan: edita ops/flujo.json (o ops/normas.json) y lanza `npm run flujo -- --escribir`";
  it("las fichas de los pasos", () => expect(textoEntre(md, MARCAS.fichas), aviso).toBe(generarFichas(datos)));
  it("las obligaciones", () => expect(textoEntre(md, MARCAS.pasos), aviso).toBe(generarTablaPasos(datos, contexto)));
  it("los catálogos", () => expect(textoEntre(md, MARCAS.catalogos), aviso).toBe(generarCatalogos(datos, generarTabla())));
  it("regenerar no cambia nada", () => expect(regenerar(md, datos, generarTabla(), contexto)).toBe(md));
  it("la tabla trae las columnas de paso, obligación, fuerza, quién la hace cumplir, control y norma", () => {
    expect(textoEntre(md, MARCAS.pasos)).toContain("| Paso | Obligación | Fuerza | Lo hace cumplir | Control | Norma | Fase que la endurece |");
  });
  it("cada obligación tiene su fila, con su frase", () => {
    const tabla = textoEntre(md, MARCAS.pasos);
    const sujetos = { ...registro.sujetos, ...datos.sujetos };
    for (const o of todas) expect(tabla, o.id).toContain(`| ${o.id} | ${fraseDeRegla(resolver(o, normas), sujetos, { conControl: false })} |`);
  });
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
  ["veredicto", "un veredicto fuera de la escala", (d) => { obligacion(d, "P07.5").veredicto = "durisima"; }],
  ["dureza-vieja", "el campo viejo «dureza» en vez de «veredicto»", (d) => { obligacion(d, "P07.5").dureza = "dura"; }],
  ["test-viejo", "el campo viejo «test» en vez de «control»", (d) => { obligacion(d, "P07.5").test = ".claude/agentes.test.js"; }],
  ["regla", "una exigencia que no empieza por un verbo en infinitivo (pasa problemasDeRegla)", (d) => { obligacion(d, "P01.1").exigencia = "Avisar a alguien."; }],
  ["regla", "un sujeto fuera del vocabulario", (d) => { obligacion(d, "P01.1").sujeto = "coche"; }],
  ["regla", "texto libre en vez de campos", (d) => { obligacion(d, "P01.1").texto = "Un fallo de Lola avisa en minutos"; }],
  ["regla", "un nombre repetido", (d) => { obligacion(d, "P01.2").nombre = obligacion(d, "P01.1").nombre; }],
  ["obligacion-campos", "una obligación por campos sin exigencia", (d) => { delete obligacion(d, "P01.1").exigencia; }],
  ["control", "un control_tipo fuera del vocabulario", (d) => { obligacion(d, "P07.5").control_tipo = "inventado"; }],
  ["control", "un control de juicio con un fichero", (d) => { obligacion(d, "P04.3").control = "ops/flujo.test.js"; }],
  ["control", "un control de un test que no es un *.test.js", (d) => { obligacion(d, "P07.5").control = "package.json"; }],
  ["control-no-existe", "un control que no existe", (d) => { obligacion(d, "P07.5").control = "ops/no-existe.test.js"; }],
  ["ref-no-existe", "una referencia a un fichero que no está", (d) => { obligacion(d, "P01.3").ref = "src/no-existe.js"; }],
  ["ref-no-contiene", "un fichero que existe pero no lleva la frase (la clase #231)", (d) => { obligacion(d, "P04.1").contiene = "una frase que no está en ese fichero"; }],
  ["ref-contiene-corto", "una frase tan genérica que cualquier fichero la lleva", (d) => { obligacion(d, "P06.3").contiene = "e"; }],
  ["ref-sin-contiene", "un ref sin decir qué tiene que llevar", (d) => { obligacion(d, "P04.1").contiene = null; }],
  ["ref-sin-nota", "sin ref y sin decir por qué", (d) => { delete d.pasos.flatMap((p) => p.obligaciones).find((o) => o.ref === null && o.nota).nota; }],
  ["ref-nulo", "sin ref con un ejecutor que sí tiene que tener fichero", (d) => { Object.assign(obligacion(d, "P07.1"), { ref: null, contiene: null, nota: "x" }); }],
  ["fase-desconocida", "una fase que no es del plan", (d) => { obligacion(d, "P02.1").fase = ["#99999"]; }],
  ["nota-larga", "una nota que pasa del tope de una regla", (d) => { obligacion(d, "P02.1").nota = "x".repeat(401); }],
  ["norma-desconocida", "una norma que no está en el registro", (d) => { obligacion(d, "P02.1").norma = "no-existe-en-el-registro"; }],
  ["norma-copia", "una obligación con norma que copia su «texto»", (d) => { obligacion(d, "P02.1").texto = "Antes de crear un issue se buscan los parecidos"; }],
  ["norma-copia", "una obligación con norma que copia su ejecutor", (d) => { obligacion(d, "P07.6").ejecutor = "github_regla"; }],
  ["norma-copia", "una obligación con norma que copia su dureza (el nombre viejo)", (d) => { obligacion(d, "P02.1").dureza = "semidura"; }],
  ["norma-copia", "una obligación con norma que copia su veredicto", (d) => { obligacion(d, "P07.6").veredicto = "semidura"; }],
  ["norma-copia", "una obligación con norma que copia su frase por campos", (d) => { obligacion(d, "P07.6").exigencia = "recibir cambios solo por PR"; }],
  ["dura-sin-sistema", "dura con la guardia, que solo ve a Claude", (d) => { Object.assign(obligacion(d, "P07.5"), { ejecutor: "guardia" }); }],
  ["dura-sin-test", "dura con un control que no es una prueba", (d) => { Object.assign(obligacion(d, "P07.5"), { control: "juicio", control_tipo: "juicio" }); }],
  ["dura-test-ajeno", "dura con un test que no nombra su fichero", (d) => { obligacion(d, "P07.5").control = ".claude/skills.test.js"; }],
  ["dura-con-fase", "dura y aún con fase pendiente", (d) => { obligacion(d, "P07.5").fase = ["#337"]; }],
  ["ejecutor-blando", "semidura con ejecutor «nada»", (d) => { obligacion(d, "P04.3").veredicto = "semidura"; Object.assign(obligacion(d, "P04.3"), { ejecutor: "persona" }); }],
  ["sin-fase", "blanda sin la fase que la endurece", (d) => { obligacion(d, "P04.3").fase = []; }],
  ["sin-fase", "aceptada sin explicar por qué", (d) => { delete obligacion(d, "P01.3").nota; }],
  ["sujetos", "un sujeto propio que ya está en el registro de normas", (d) => { d.sujetos.fallo = { legible: "cada fallo", aplica_a: ["obligacion"] }; }],
  ["sujetos", "un sujeto propio que nadie usa", (d) => { d.sujetos.inventado = { legible: "cada cosa inventada", aplica_a: ["obligacion"] }; }],
  ["capa", "una capa menos", (d) => { d.capas.pop(); }],
  ["escalera", "la escalera copiada otra vez en flujo.json (vive en escalas.mjs)", (d) => { d.escalera = [{ id: "bloqueo" }]; }],
  ["tipo-skill", "una lista de tipos de skill que vuelve a flujo.json", (d) => { d.tipos_skill = [{ id: "servicio" }]; }],
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
