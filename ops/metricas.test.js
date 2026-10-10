// El registro de métricas (#480, fondo #479): «Ninguna cifra sin pregunta», «La cifra antes y
// después» y «Ninguna cifra es objetivo sola» (CLAUDE.md, «Pensar en datos»).
//
// Vigila, en este orden:
//  1. el registro está bien: cada métrica con objetivo, pregunta, emisor y lector que existen
//     (y el lector la nombra), unidad, umbral, vigilante y, si se persigue, su muestra a mano;
//  2. toda línea `campo: valor` que emiten los scripts vigilados (y lo que importan) está en el
//     registro con todas sus claves, o en las excepciones; y nada registrado se ha quedado sin emitir;
//  3. todo indicador, contrapeso y evento del código, y toda columna del informe de planos, es una
//     métrica del registro; y el informe semanal de verdad solo lleva líneas registradas;
//  4. las excepciones solo bajan (contra origin/staging, como los trinquetes de la forja);
//  5. el margen de ruido: límites a 3 sigmas y «sin datos suficientes» con pocos puntos.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EVENTOS } from "../.claude/hooks/eventos.mjs";
import { antesYDespues, informe } from "../scripts/cumplimiento.mjs";
import { CONTRAPESOS, INDICADORES, medirContrapesos, medirIndicadores } from "../scripts/lib/cumplimiento.mjs";
import { REFERENCIA, jsonEnReferenciaAvisando } from "../scripts/lib/forjaReferencia.mjs";
import { estadoDelGlosario } from "../scripts/lib/glosarioCandidatos.mjs";
import { criteriosDelRepo } from "../scripts/lib/juiciosSkills.mjs";
import {
  RUTA_METRICAS, clavesDeTexto, clavesQueCuentan, excepcionDe, excepcionesNuevas, leerMetricas, lineaDelRegistro, problemasDelRegistro, regexDeFirma, vigilanteDe,
} from "../scripts/lib/metricas.mjs";
import { lineaEstatica, lineasDeFicheros, lineasDeFuente, lineasDeTexto } from "../scripts/lib/metricasLineas.mjs";
import { MIN_PUNTOS, VEREDICTOS_RUIDO, lineaDeRuido, salDelMargen, textoDeRuido } from "../scripts/lib/ruido.mjs";
import { INDICADORES_SKILLS, saludDeSkills } from "../scripts/lib/saludSkills.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const TIEMPO = 120_000;
const datos = leerMetricas(RAIZ);
const leer = (r) => (existsSync(join(RAIZ, r)) ? readFileSync(join(RAIZ, r), "utf8") : null);
const metrica = (id) => datos.metricas.find((m) => m.id === id);

// Un registro mínimo bueno, para ver fallar cada regla.
const BUENO = () => ({
  objetivos: { prueba: "Que la prueba mida lo que dice medir" },
  lineas: [{ firma: "indicador", emisores: ["scripts/lib/cumplimiento.mjs"], campos: { indicador: "id_metrica", valor: "metrica", umbral: "umbral", estado: "estado" } }],
  informes: {},
  metricas: [
    { id: "fondos_sin_diagnostico", objetivo: "prueba", pregunta: "¿Cuántos fondos no tienen diagnóstico?", emisor: "scripts/lib/cumplimiento.mjs", sale_en: [{ indicador: "indicador" }], lectores: [{ tipo: "informe", ref: ".github/workflows/flujo-semanal.yml", menciona: "scripts/cumplimiento.mjs --informe" }], unidad: "cuenta", umbral: 0, vigilante: "encargos_sin_juez", muestra: "Leer dos fondos al mes y ver su mecanismo" },
    { id: "encargos_sin_juez", objetivo: "prueba", pregunta: "¿Cuántos encargos no tienen juez?", emisor: "scripts/lib/cumplimiento.mjs", sale_en: [{ indicador: "indicador" }], lectores: [{ tipo: "informe", ref: ".github/workflows/flujo-semanal.yml", menciona: "scripts/cumplimiento.mjs --informe" }], unidad: "cuenta", umbral: null, vigilante: "fondos_sin_diagnostico" },
  ],
  excepciones: [],
});
const con = (cambio) => { const d = BUENO(); cambio(d); return problemasDelRegistro(d, { leer }).join("\n"); };

describe("1. el registro está bien", () => {
  it("sin problemas", () => {
    expect(problemasDelRegistro(datos, { leer }), `Arregla ${RUTA_METRICAS}`).toEqual([]);
  });
  it("vigila los scripts que emiten cifras, al menos los del encargo", () => {
    for (const r of ["scripts/cumplimiento.mjs", "scripts/fabrica.mjs", "scripts/skills-prueba.mjs", "scripts/issues.mjs", "scripts/higiene-skills.mjs", "scripts/glosario.mjs", "scripts/planos.mjs", ".claude/hooks/eventos.mjs"]) {
      expect(datos.raices, r).toContain(r);
    }
  });
  it("cada métrica con umbral tiene su vigilante en el registro", () => {
    for (const m of datos.metricas.filter((x) => typeof x.umbral === "number")) expect(vigilanteDe(datos, m.id), m.id).not.toBeNull();
  });
  it("el registro bueno de prueba pasa", () => {
    expect(problemasDelRegistro(BUENO(), { leer })).toEqual([]);
  });
  it("cada regla falla con datos malos", () => {
    expect(con((d) => { d.metricas[0].lectores = []; })).toMatch(/sin lector/);
    expect(con((d) => { d.metricas[0].lectores[0].menciona = "algo que no está en el fichero"; })).toMatch(/no nombra/);
    expect(con((d) => { d.metricas[0].lectores[0].ref = ".github/workflows/no-existe.yml"; })).toMatch(/no existe/);
    expect(con((d) => { d.metricas[0].lectores[0].tipo = "persona"; })).toMatch(/TIPOS_LECTOR/);
    expect(con((d) => { d.metricas[0].lectores[0].tipo = "rutina"; })).toMatch(/vive en/);
    expect(con((d) => { d.metricas[0].emisor = "scripts/no-existe.mjs"; })).toMatch(/emisor .* no existe/);
    expect(con((d) => { d.metricas[0].vigilante = "nadie"; })).toMatch(/no es una métrica/);
    expect(con((d) => { d.metricas[0].vigilante = "fondos_sin_diagnostico"; })).toMatch(/a sí misma/);
    expect(con((d) => { delete d.metricas[0].muestra; })).toMatch(/muestra/);
    expect(con((d) => { d.metricas[0].pregunta = "Cuántos fondos hay"; })).toMatch(/pregunta/);
    expect(con((d) => { d.metricas[0].unidad = "kilos"; })).toMatch(/UNIDADES/);
    expect(con((d) => { d.metricas[0].objetivo = "otro"; })).toMatch(/objetivo/);
    expect(con((d) => { d.metricas[0].comentario = "texto libre fuera de su hueco"; })).toMatch(/campos que no existen/);
    expect(con((d) => { d.metricas[0].id = "no_existe_en_el_emisor"; d.metricas[1].vigilante = "no_existe_en_el_emisor"; })).toMatch(/no nombra «no_existe_en_el_emisor»/);
    expect(con((d) => { d.metricas[0].sale_en = [{ linea: "indicador", campos: ["umbral"] }]; })).toMatch(/papel metrica/);
    expect(con((d) => { d.metricas[0].sale_en = [{ algo: 1 }]; })).toMatch(/cada «sale_en»/);
    expect(con((d) => { d.lineas[0].campos.valor = "cifra"; })).toMatch(/ROLES_CAMPO/);
    expect(con((d) => { d.lineas.push({ firma: "otra", emisores: ["scripts/lib/cumplimiento.mjs"], campos: { a: "id", b: "metrica" } }); })).toMatch(/«b» no la cubre ninguna métrica/);
    expect(con((d) => { d.lineas.push({ firma: "otra", emisores: ["scripts/lib/cumplimiento.mjs"], campos: { a: "id", b: "id" } }); })).toMatch(/dice sus lectores/);
    expect(con((d) => { d.lineas[0].emisores = ["scripts/no-existe.mjs"]; })).toMatch(/emisor .* no existe/);
    expect(con((d) => { d.excepciones.push({ emisor: "scripts/a.mjs", firma: "x", causa: "porque_si", nota: "una nota bien larga de verdad" }); })).toMatch(/CAUSAS_EXCEPCION/);
    expect(con((d) => { d.excepciones.push({ emisor: "scripts/lib/cumplimiento.mjs", firma: "indicador", causa: "sin_lector", nota: "una nota bien larga de verdad" }); })).toMatch(/ya está registrada/);
  });
});

describe("2. toda línea `campo: valor` que se emite está en el registro", () => {
  const { ficheros, lineas } = lineasDeFicheros(RAIZ, datos.raices);
  const desc = (l) => `${l.emisor} «${l.firma}»`;

  it("recorre los scripts vigilados y lo que importan", () => {
    expect(ficheros.length).toBeGreaterThan(datos.raices.length);
    expect(ficheros).toContain("scripts/lib/juiciosSkills.mjs");
    expect(lineas.length).toBeGreaterThan(10);
  });
  it("ninguna línea sin registrar (ni en excepciones)", () => {
    const sueltas = lineas.filter((l) => !lineaDelRegistro(datos, l.firma, l.emisor) && !excepcionDe(datos, l.firma, l.emisor)).map(desc);
    expect(sueltas, `Da de alta la línea en ${RUTA_METRICAS} (firma, emisores, campos y la métrica que la lee), o deja de emitirla`).toEqual([]);
  });
  it("cada clave de una línea registrada está en sus campos", () => {
    const deMas = lineas.flatMap((l) => {
      const r = lineaDelRegistro(datos, l.firma, l.emisor);
      return r ? clavesQueCuentan(l.claves, r).filter((c) => !(c in r.campos)).map((c) => `${desc(l)}: ${c}`) : [];
    });
    expect(deMas, "Una clave nueva en una línea: dale su papel en «campos» (y su métrica si es una cifra)").toEqual([]);
  });
  it("nada registrado se ha quedado sin emitir (salvo las dinámicas, que mira el paso 3)", () => {
    const vistas = new Set(lineas.map((l) => `${l.emisor}|${l.firma}`));
    const viejas = datos.lineas.filter((l) => !l.dinamica).flatMap((l) => l.emisores.filter((e) => !vistas.has(`${e}|${l.firma}`)).map((e) => `${e} «${l.firma}»`));
    expect(viejas, "Quita del registro la línea que ya no se emite (o su emisor)").toEqual([]);
    const excViejas = datos.excepciones.filter((e) => !vistas.has(`${e.emisor}|${e.firma}`)).map((e) => `${e.emisor} «${e.firma}»`);
    expect(excViejas, "Esta excepción ya no hace falta: quítala (la lista solo baja)").toEqual([]);
  });
  it("detecta una línea nueva: la de un script inventado no está en el registro", () => {
    const [nueva] = lineasDeFuente("console.log(`nueva_cifra skill: ${s} veces: ${n} coste: ${c}`);");
    expect(nueva).toEqual({ firma: "nueva_cifra skill", claves: ["skill", "veces", "coste"] });
    expect(lineaDelRegistro(datos, nueva.firma)).toBeNull();
    // Una interpolación al principio y un comentario: el comentario no cuenta.
    expect(lineasDeFuente("// indicador: ${x} valor: ${y}\nconst f = (a) => `${a.x}: ${a.n} criterio: ${a.c} estado: ${a.e}`;")).toEqual([{ firma: "<x>: <x> criterio", claves: ["criterio", "estado"] }]);
    // Una sola clave con valor, o prosa con mayúscula y tildes, no es una línea contable.
    expect(lineaEstatica("lo lleva: \u0000")).toBeNull();
    expect(lineaEstatica("cerrados con ficha: \u0000 con aprendizaje, sin él: \u0000")).toBeNull();
  });
});

describe("3. los indicadores de los informes son métricas del registro", () => {
  const conIndicador = (firma) => datos.metricas.filter((m) => m.sale_en.some((s) => s.indicador === firma)).map((m) => m.id).sort();

  it("cada indicador del flujo y de las skills, y nada más, sale en la línea «indicador»", () => {
    expect(conIndicador("indicador")).toEqual([...Object.keys(INDICADORES), ...Object.keys(INDICADORES_SKILLS)].sort());
  });
  it("cada contrapeso, y nada más, sale en la línea «contrapeso»", () => {
    expect(conIndicador("contrapeso")).toEqual(Object.keys(CONTRAPESOS).sort());
  });
  it("cada evento de los hooks es una métrica", () => {
    const eventos = datos.metricas.filter((m) => m.sale_en.some((s) => s.evento)).map((m) => m.id).sort();
    expect(eventos).toEqual([...EVENTOS].sort());
  });
  it("cada columna de la tabla de planos está declarada en su informe", () => {
    const m = leer("scripts/planos.mjs").match(/padEnd\(ancho\)\}\s+([a-z ]+)`\);/);
    expect(m, "planos.mjs ya no escribe la cabecera «… nivel techo …»: ajusta este test").not.toBeNull();
    const columnas = m[1].trim().split(/\s+/);
    expect(columnas.length).toBeGreaterThanOrEqual(3);
    for (const c of columnas) expect(Object.keys(datos.informes["planos-semanal"].columnas), c).toContain(c);
  });
  it("el informe semanal de verdad solo lleva líneas registradas, con sus claves", () => {
    const hoy = new Date();
    const issues = [];
    const indicadores = medirIndicadores(issues, { hoy });
    const salud = saludDeSkills(RAIZ, hoy);
    const contrapesos = medirContrapesos(issues, { hoy });
    const cifras = Object.fromEntries([...indicadores, ...salud.indicadores].map((x) => [x.indicador, x.valor]).concat(contrapesos.map((c) => [c.contrapeso, c.valor])));
    const margen = antesYDespues({ cifras, series: null, registro: datos });
    const md = informe({ indicadores, salud, glosario: estadoDelGlosario(RAIZ), criterios: criteriosDelRepo(RAIZ, hoy), contrapesos, margen, hoy: "2026-10-10" });
    const malas = lineasDeTexto(md).flatMap(({ linea }) => {
      const r = datos.lineas.find((l) => regexDeFirma(l.firma).test(linea));
      if (!r) return [`sin registrar: ${linea.slice(0, 80)}`];
      return clavesDeTexto(linea, r).filter((c) => !(c in r.campos)).map((c) => `«${r.firma}»: clave ${c} sin campo`);
    });
    expect(malas, `Registra en ${RUTA_METRICAS} la línea o la clave que el informe escribe`).toEqual([]);
    // Las dinámicas también se ven en el informe (no las ve la lectura estática).
    for (const l of datos.lineas.filter((x) => x.dinamica)) expect(md, l.firma).toMatch(new RegExp(regexDeFirma(l.firma).source, "m"));
  }, TIEMPO);
});

describe("4. las excepciones solo bajan", () => {
  const REF = REFERENCIA();
  const enRef = jsonEnReferenciaAvisando(RAIZ, REF, RUTA_METRICAS, "excepciones de métricas");
  it.skipIf(!enRef)(`ninguna excepción nueva respecto a ${REF}`, () => {
    expect(excepcionesNuevas(datos, enRef), "Una línea nueva se registra con su lector; no entra en excepciones").toEqual([]);
  });
  it("la comparación ve una excepción nueva", () => {
    const ref = { excepciones: [{ emisor: "a", firma: "x" }] };
    expect(excepcionesNuevas({ excepciones: [{ emisor: "a", firma: "x" }] }, ref)).toEqual([]);
    expect(excepcionesNuevas({ excepciones: [] }, ref)).toEqual([]);
    expect(excepcionesNuevas({ excepciones: [{ emisor: "a", firma: "x" }, { emisor: "b", firma: "y" }] }, ref)).toEqual(["b|y"]);
  });
});

describe("5. el margen de ruido", () => {
  const estable = [3, 4, 3, 5, 4, 3, 4, 4];

  it("con menos puntos que el mínimo dice «sin datos suficientes», y lo explica", () => {
    const r = salDelMargen([1, 2, 3], 10);
    expect(r).toMatchObject({ veredicto: "sin_datos_suficientes", puntos: 3, minimo: MIN_PUNTOS, media: null });
    expect(textoDeRuido(r)).toBe(`sin datos suficientes (3 de ${MIN_PUNTOS} puntos de antes)`);
    expect(salDelMargen(estable, null).veredicto).toBe("sin_datos_suficientes");
    expect(salDelMargen(null, 3).veredicto).toBe("sin_datos_suficientes");
  });
  it("límites a 3 sigmas con el rango móvil medio (XmR)", () => {
    const r = salDelMargen(estable, 4);
    // media 3,75; rangos móviles 1,1,2,1,1,1,0 → media 1; sigma = 1 / 1,128
    expect(r.media).toBe(3.75);
    expect(r.sigma).toBeCloseTo(0.89, 2);
    expect(r.superior).toBeCloseTo(6.41, 2);
    expect(r.inferior).toBeCloseTo(1.09, 2);
    expect(r.veredicto).toBe("dentro");
  });
  it("una cifra que «parece» mejor pero está dentro del margen es ruido; fuera, sube o baja de verdad", () => {
    expect(salDelMargen(estable, 2).veredicto).toBe("dentro");
    expect(salDelMargen(estable, 7).veredicto).toBe("fuera_por_encima");
    expect(salDelMargen(estable, 0).veredicto).toBe("fuera_por_debajo");
    expect(textoDeRuido(salDelMargen(estable, 7))).toMatch(/^sube de verdad \(media 3\.75/);
  });
  it("una serie que nunca se movió: cualquier cambio sale fuera", () => {
    const quieta = Array(MIN_PUNTOS).fill(0);
    expect(salDelMargen(quieta, 0).veredicto).toBe("dentro");
    expect(salDelMargen(quieta, 1).veredicto).toBe("fuera_por_encima");
  });
  it("la línea contable lleva el veredicto del vocabulario", () => {
    const l = lineaDeRuido("x", 4, salDelMargen(estable, 4));
    expect(l).toBe("ruido metrica: x valor: 4 puntos: 8 minimo: 8 media: 3.75 inferior: 1.09 superior: 6.41 veredicto: dentro");
    expect(Object.keys(VEREDICTOS_RUIDO)).toEqual(["dentro", "fuera_por_encima", "fuera_por_debajo", "sin_datos_suficientes"]);
  });
});

describe("el informe semanal: cada cifra junto a su vigilante y su margen", () => {
  it("antesYDespues pone el vigilante al lado y su valor si se mide en el mismo informe", () => {
    const filas = antesYDespues({ cifras: { fondos_sin_diagnostico: 2, reabiertos_clase_mal_definida: 0, ciclos_sobre_presupuesto: 1 }, series: { fondos_sin_diagnostico: [0, 0, 0, 1, 0, 0, 0, 0] }, registro: datos });
    const f = Object.fromEntries(filas.map((x) => [x.id, x]));
    expect(f.fondos_sin_diagnostico.vigilante).toMatchObject({ id: "reabiertos_clase_mal_definida", valor: 0, aqui: true });
    expect(f.fondos_sin_diagnostico.ruido.veredicto).toBe("fuera_por_encima");
    expect(f.ciclos_sobre_presupuesto.vigilante).toMatchObject({ id: metrica("ciclos_sobre_presupuesto").vigilante, aqui: false });
    expect(f.ciclos_sobre_presupuesto.ruido.veredicto).toBe("sin_datos_suficientes");
  });
  it("la tabla y la advertencia salen en el informe", () => {
    const margen = antesYDespues({ cifras: { fondos_sin_diagnostico: 1, reabiertos_clase_mal_definida: 0 }, series: null, registro: datos });
    const md = informe({ indicadores: [], salud: { indicadores: [], filas: [] }, margen, hoy: "2026-10-10" });
    expect(md).toMatch(/### Antes y después, cada cifra con su vigilante/);
    expect(md).toMatch(/\| `fondos_sin_diagnostico` \| 1 \| `reabiertos_clase_mal_definida` = 0 \| sin datos suficientes \(0 de 8 puntos de antes\) \|/);
    expect(md).toMatch(/_Sin datos suficientes en 2 de 2 cifras/);
    expect(md).toMatch(/^ruido metrica: fondos_sin_diagnostico valor: 1 puntos: 0 minimo: 8 media: - inferior: - superior: - veredicto: sin_datos_suficientes$/m);
  });
});
