import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { AMBITOS } from "../scripts/lib/ambitos.mjs";
import { FORMAS, FORMAS_ANTIGUAS, MAX_DIAS, RAZONES, RETIRADA_FORMAS_ANTIGUAS, excepcionDe, leerExcepciones } from "../scripts/lib/excepciones.mjs";
import { NORMA_DE_REGLA, excepcionesDelPr, lineasDeNormas, normaTocada } from "../scripts/lib/avisosPr.mjs";
import { MIN_EXCEPTUADAS, RESULTADOS_NORMA, contarPorNorma, leerLineasDeNorma, lineaDeNorma, medir, saltosDeLaGuardia } from "../scripts/lib/medicionNormas.mjs";
import { leerRegistro } from "../scripts/lib/normas.mjs";
import { CONCEPTOS, RUTA_CATALOGO, conceptoDe, leerPrecedencia, problemasDePrecedencia, rangoDe, resolverChoque, textoDePrecedencia } from "../scripts/lib/precedencia.mjs";
import { RUTA_PRINCIPIOS } from "../scripts/lib/principios.mjs";
import { leerRegistro as leerVida } from "../scripts/lib/vocabulariosVida.mjs";

/**
 * Precedencia entre áreas, una sola forma de excepción y medición por norma (#621, fondo #618).
 *  1. la tabla de precedencia es total (todo ámbito, una vez) y sin empates, y toda norma tiene un ámbito con rango;
 *  2. la excepción tiene una forma; una caducada, de una norma que no existe o mal escrita no cuenta; las formas
 *     de antes valen solo en la transición y están retiradas en ops/vocabularios-vida.json (no borradas);
 *  3. cada aviso del CI deja su línea por norma y el lector las cuenta;
 *  4. la plantilla del PR, tests.yml, la skill github y NORMAS.md dicen la forma única.
 * Cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const tabla = leerPrecedencia(RAIZ);
const normas = leerRegistro(RAIZ).normas;
const ids = normas.map((n) => n.id);
const copia = (o) => JSON.parse(JSON.stringify(o));
const con = (cambio) => { const t = copia(tabla); cambio(t); return problemasDePrecedencia(t, { normas }).join("\n"); };

describe("1. la precedencia entre áreas", () => {
  it("la del repo no tiene problemas: total, sin empates y con rango para toda norma", () => {
    expect(problemasDePrecedencia(tabla, { normas }), "Arregla la «precedencia» de ops/principios/_catalogo.json").toEqual([]);
  });
  it("cada ámbito tiene un puesto distinto y cada norma hereda el de su ámbito", () => {
    const rangos = Object.keys(AMBITOS).map((a) => rangoDe(tabla, a));
    expect(new Set(rangos).size).toBe(Object.keys(AMBITOS).length);
    expect(rangos.every((r) => Number.isInteger(r) && r >= 1)).toBe(true);
    for (const n of normas) expect(rangoDe(tabla, n.ambito), `${n.id} (${n.ambito})`).not.toBeNull();
  });
  it("seguridad > datos de familias > coste > velocidad, en ese orden", () => {
    expect(CONCEPTOS).toEqual(["security", "family-data", "cost", "speed"]);
    const orden = tabla.orden.map((x) => CONCEPTOS.indexOf(x.concepto));
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(conceptoDe(tabla, "infra")).toBe("security");
    expect(conceptoDe(tabla, "data")).toBe("family-data");
    expect(conceptoDe(tabla, "bot")).toBe("cost");
  });
  it("el catálogo está donde lo lee principios.mjs", () => {
    expect(RUTA_CATALOGO).toBe(RUTA_PRINCIPIOS);
  });
  it("cada regla falla con datos malos", () => {
    expect(con((t) => { t.orden.pop(); })).toMatch(/«writing» no tiene puesto/);
    expect(con((t) => { t.orden.push({ area: "infra", concepto: "speed" }); })).toMatch(/sale dos veces/);
    expect(con((t) => { t.orden.push({ area: "nueva", concepto: "speed" }); })).toMatch(/«nueva» no es un ámbito/);
    expect(con((t) => { t.orden[0].concepto = "speed"; })).toMatch(/va antes que el concepto del puesto anterior|orden de los conceptos/);
    expect(con((t) => { t.orden[1].concepto = "beauty"; })).toMatch(/no es un concepto/);
    expect(con((t) => { t.orden = t.orden.filter((x) => x.concepto !== "cost"); })).toMatch(/«bot» no tiene puesto|ningún ámbito defiende «cost»/);
    expect(con((t) => { delete t.conceptos.cost; })).toMatch(/los conceptos son/);
    expect(con((t) => { t.conceptos.speed = "corto"; })).toMatch(/su definición/);
    expect(con((t) => { delete t.choque.regla; })).toMatch(/choque\.regla/);
    expect(con((t) => { t.choque.constancia = "Tests relajados: sí — x"; })).toMatch(/choque\.constancia/);
    expect(problemasDePrecedencia(undefined).join()).toMatch(/falta/);
    expect(problemasDePrecedencia(tabla, { normas: [...normas, { id: "x", ambito: "otro" }] }).join()).toMatch(/norma x: su ámbito «otro» no tiene rango/);
  });
  it("dos normas que chocan: gana la de mayor precedencia; del mismo ámbito, no se resuelve", () => {
    const seg = normas.find((n) => n.ambito === "infra");
    const vel = normas.find((n) => n.ambito === "process");
    expect(resolverChoque(tabla, seg, vel)).toEqual({ gana: seg.id, cede: vel.id });
    expect(resolverChoque(tabla, vel.id, seg.id, normas)).toEqual({ gana: seg.id, cede: vel.id });
    expect(resolverChoque(tabla, seg, normas.find((n) => n.ambito === "infra" && n.id !== seg.id)).sinResolver).toBe(true);
    expect(resolverChoque(tabla, "no-existe", seg, normas).sinResolver).toBe(true);
  });
  it("el brief imprime la tabla y la constancia", () => {
    const t = textoDePrecedencia(tabla);
    expect(t).toMatch(/1\. infra .* security/);
    expect(t).toContain(tabla.choque.constancia);
  });
});

describe("2. una sola forma de excepción", () => {
  const HOY = "2026-10-12";
  const lee = (cuerpo, hoy = HOY) => leerExcepciones(cuerpo, { normas: ids, hoy });
  const linea = (n, m, h) => `Excepción: ${n} — ${m} — hasta ${h}`;

  it("la forma única vale con norma que existe, motivo y caducidad futura", () => {
    const l = lee(linea("pr-acotado", "mueve una carpeta entera sin cambiar su contenido", "2026-10-20"));
    expect(l.validas).toEqual([{ norma: "pr-acotado", motivo: "mueve una carpeta entera sin cambiar su contenido", hasta: "2026-10-20", forma: "unica" }]);
    expect(l.invalidas).toEqual([]);
    expect(FORMAS.unica).toContain("hasta AAAA-MM-DD");
  });
  it("varias líneas son varias excepciones; el día de hoy y el límite valen", () => {
    const hasta = new Date(Date.parse(`${HOY}T00:00:00Z`) + MAX_DIAS * 86_400_000).toISOString().slice(0, 10);
    const l = lee([linea("pr-acotado", "motivo bien largo uno", HOY), linea("tests-no-se-relajan", "motivo bien largo dos", hasta)].join("\n"));
    expect(l.validas.map((e) => e.norma)).toEqual(["pr-acotado", "tests-no-se-relajan"]);
  });
  it("no cuenta: caducada, más allá del tope, norma inexistente, motivo corto, fecha irreal o mal escrita", () => {
    const razon = (c) => lee(c).invalidas.map((i) => i.razon);
    expect(razon(linea("pr-acotado", "motivo bien largo", "2026-10-11"))).toEqual(["vencida"]);
    expect(razon(linea("pr-acotado", "motivo bien largo", "2027-12-31"))).toEqual(["demasiado_lejos"]);
    expect(razon(linea("norma-que-no-existe", "motivo bien largo", "2026-10-20"))).toEqual(["norma_inexistente"]);
    expect(razon(linea("pr-acotado", "corto", "2026-10-20"))).toEqual(["motivo_corto"]);
    expect(razon(linea("pr-acotado", "motivo bien largo", "2026-02-30"))).toEqual(["fecha"]);
    expect(razon("Excepción: pr-acotado — motivo bien largo")).toEqual(["forma"]);
    expect(razon("Excepción: pr-acotado")).toEqual(["forma"]);
    for (const r of ["vencida", "demasiado_lejos", "norma_inexistente", "motivo_corto", "fecha", "forma"]) expect(RAZONES[r], r).toBeTruthy();
    expect(lee(linea("pr-acotado", "motivo bien largo", "2026-10-11")).validas).toEqual([]);
  });
  it("la plantilla del PR, que va en un comentario, no cuenta", () => {
    expect(lee(`<!--\n${linea("pr-acotado", "motivo de la plantilla", "2026-10-20")}\n-->`).validas).toEqual([]);
  });
  it("las formas de antes valen en la transición, con aviso, y dejan de valer el día de la retirada", () => {
    const viejas = "Tests relajados: sí — el test duplicaba otro de la misma zona\nTamaño: grande — mueve una carpeta entera sin cambios\nAprendizaje: skill issues, sección Lo que falló";
    const dentro = lee(viejas, RETIRADA_FORMAS_ANTIGUAS);
    expect(dentro.validas.map((e) => `${e.norma}:${e.forma}`)).toEqual(["tests-no-se-relajan:antigua", "pr-acotado:antigua", "lecciones-a-un-test:antigua"]);
    expect(dentro.antiguas).toHaveLength(3);
    const fuera = lee(viejas, "2026-11-16");
    expect(fuera.validas).toEqual([]);
    expect(fuera.antiguasVencidas).toHaveLength(3);
    expect(excepcionDe(dentro, "pr-acotado").hasta).toBeNull();
  });
  it("las tres formas antiguas están retiradas, no borradas, en ops/vocabularios-vida.json, y la única sigue viva", () => {
    const vida = leerVida(RAIZ);
    const retirados = vida.retirados.filter((r) => r.vocabulario === "pr.excepcion_forma");
    expect(retirados.map((r) => r.valor).sort()).toEqual(FORMAS_ANTIGUAS.map((f) => f.id).sort());
    for (const r of retirados) expect(r.pasa_a).toBe("unica");
    expect(Object.keys(vida.anclados["pr.excepcion_forma"])).toEqual(["unica"]);
    expect(Object.keys(vida.anclados["precedencia.concepto"])).toEqual(CONCEPTOS);
  });
  it("las normas de las tres reglas y de las formas antiguas existen", () => {
    for (const n of [...Object.values(NORMA_DE_REGLA), ...FORMAS_ANTIGUAS.map((f) => f.norma)]) expect(ids, n).toContain(n);
  });
  it("una excepción caducada de una norma DURA que el PR toca falla; si no la toca, o no es dura, solo avisa", () => {
    const dura = normas.find((n) => n.veredicto === "dura" && n.donde?.length);
    const blanda = normas.find((n) => n.id === "pr-acotado");
    const toca = [{ ruta: dura.donde[0], anadidas: [], quitadas: [] }];
    const cuerpo = (n) => linea(n.id, "motivo bien largo y caducado", "2026-10-01");
    expect(excepcionesDelPr({ cuerpo: cuerpo(dura), normas, ficheros: toca, hoy: HOY }).fallos).toHaveLength(1);
    expect(excepcionesDelPr({ cuerpo: cuerpo(dura), normas, ficheros: [], hoy: HOY })).toMatchObject({ fallos: [], avisos: [expect.stringContaining("la caducidad ya ha pasado")] });
    const b = excepcionesDelPr({ cuerpo: cuerpo(blanda), normas, ficheros: [{ ruta: blanda.donde[0], anadidas: [], quitadas: [] }], hoy: HOY });
    expect(b.fallos).toEqual([]);
    expect(b.avisos).toHaveLength(1);
    // Una norma que no existe nunca falla; una vigente, tampoco.
    expect(excepcionesDelPr({ cuerpo: linea("inventada", "motivo bien largo", "2026-10-01"), normas, ficheros: toca, hoy: HOY }).fallos).toEqual([]);
    expect(excepcionesDelPr({ cuerpo: linea(dura.id, "motivo bien largo", "2026-10-20"), normas, ficheros: toca, hoy: HOY }).fallos).toEqual([]);
    expect(normaTocada(dura, toca.map((f) => f.ruta))).toBe(true);
    expect(normaTocada(dura, ["README.md"])).toBe(false);
  });
});

describe("3. cada control que salta deja su línea por norma, y un lector las cuenta", () => {
  it("la línea tiene el formato campo: valor y el vocabulario es cerrado", () => {
    expect(RESULTADOS_NORMA).toEqual(["cumple", "salta", "exceptuada"]);
    expect(lineaDeNorma("pr-acotado", "salta")).toBe("norma: pr-acotado resultado: salta");
    expect(() => lineaDeNorma("pr-acotado", "quizá")).toThrow(/vocabulario/);
    expect(() => lineaDeNorma("Pr Acotado", "salta")).toThrow(/id de una norma/);
  });
  it("lee las líneas de un log de CI, con la marca de tiempo delante, y salta lo que no es", () => {
    const log = "2026-10-12T10:00:00Z norma: pr-acotado resultado: salta\nnorma: tests-no-se-relajan resultado: cumple\nnorma: x resultado: quizá\navisos-pr: regla=c1 resultado=warning";
    expect(leerLineasDeNorma(log)).toEqual([{ norma: "pr-acotado", resultado: "salta" }, { norma: "tests-no-se-relajan", resultado: "cumple" }]);
  });
  it("los avisos del CI dejan una línea por norma: ok cumple, warning salta, exempt exceptuada; unchecked y los bots, nada", () => {
    const avisos = [{ regla: "c1", resultado: "warning", detalle: "x" }, { regla: "c8", resultado: "ok", detalle: "x" }, { regla: "c12", resultado: "exempt", detalle: "closed_funds=#1" }];
    expect(lineasDeNormas(avisos)).toEqual(["norma: pr-acotado resultado: salta", "norma: tests-no-se-relajan resultado: cumple", "norma: lecciones-a-un-test resultado: exceptuada"]);
    expect(lineasDeNormas([{ regla: "c1", resultado: "unchecked", detalle: "reason=no_diff" }, { regla: "c8", resultado: "exempt", detalle: "reason=bot" }])).toEqual([]);
  });
  it("los eventos de la guardia con `codigo` son saltos; lo demás y las líneas rotas no", () => {
    const jsonl = [
      JSON.stringify({ evento: "bloqueo_guardia", nombre: "a", codigo: "sin-git-add-todo" }),
      JSON.stringify({ evento: "permiso_pedido", nombre: "b", codigo: "sin-git-add-todo" }),
      JSON.stringify({ evento: "skill_cargada", nombre: "github", codigo: "sin-git-add-todo" }),
      JSON.stringify({ evento: "bloqueo_guardia", nombre: "c" }),
      "{roto",
    ].join("\n");
    expect(contarPorNorma(saltosDeLaGuardia(jsonl))).toEqual({ "sin-git-add-todo": { cumple: 0, salta: 2, exceptuada: 0 } });
  });
  it("cuenta por norma y dice cuáles nunca saltan, cuáles no tienen dato y cuáles se exceptúan siempre", () => {
    const reg = [{ id: "a", ejecutor: "ci" }, { id: "b", ejecutor: "ci" }, { id: "c", ejecutor: "ci" }, { id: "d", ejecutor: "ci" }, { id: "e", ejecutor: "nada" }];
    const lineas = [
      { norma: "a", resultado: "cumple" }, { norma: "a", resultado: "cumple" },
      { norma: "b", resultado: "cumple" }, { norma: "b", resultado: "salta" },
      ...Array.from({ length: MIN_EXCEPTUADAS }, () => ({ norma: "c", resultado: "exceptuada" })),
      { norma: "zzz", resultado: "salta" },
    ];
    const m = medir(reg, contarPorNorma(lineas));
    expect(m.nuncaSaltan).toEqual(["a"]);
    expect(m.exceptuadasSiempre).toEqual(["c"]);
    expect(m.sinDato).toEqual(["d"]);
    expect(m.desconocidas).toEqual(["zzz"]);
    // Con un solo salto entre las excepciones, ya no es «siempre».
    expect(medir(reg, contarPorNorma([...lineas, { norma: "c", resultado: "salta" }])).exceptuadasSiempre).toEqual([]);
  });
});

describe("4. la forma única está escrita donde se mira", () => {
  const FORMA = "Excepción: <id de norma> — <motivo> — hasta AAAA-MM-DD";
  it("la plantilla del PR la explica", () => {
    expect(leer(".github/pull_request_template.md")).toContain(FORMA);
  });
  it("tests.yml y la skill github la dicen y ya no enseñan las formas de antes como la manera de hacerlo", () => {
    for (const f of [".github/workflows/tests.yml", ".claude/skills/github/SKILL.md"]) {
      const t = leer(f);
      expect(t, f).toContain("Excepción:");
      expect(t, f).toContain("hasta AAAA-MM-DD");
    }
  });
  it("NORMAS.md habla de la excepción, la precedencia y la medición, y PRINCIPIOS.md trae la tabla", () => {
    const n = leer("docs/ops/NORMAS.md");
    expect(n).toContain(FORMA);
    expect(n).toContain("npm run normas -- --medir");
    expect(leer("docs/PRINCIPIOS.md")).toContain("## Precedencia entre áreas");
  });
  it("la medición está en el registro de métricas con su pregunta y su script lector", () => {
    const m = JSON.parse(leer("ops/metricas.json"));
    for (const id of ["normas_nunca_saltan", "normas_exceptuadas_siempre"]) {
      const x = m.metricas.find((y) => y.id === id);
      expect(x?.pregunta, id).toMatch(/^¿.*\?$/);
      expect(existsSync(join(RAIZ, x.emisor)), x.emisor).toBe(true);
    }
    expect(m.lineas.find((l) => l.firma === "norma").lectores[0].ref).toBe("scripts/normas.mjs");
  });
});
