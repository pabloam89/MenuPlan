import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { AMBITOS } from "../scripts/lib/ambitos.mjs";
import { FORMA, FORMAS, FORMAS_ANTIGUAS, MAX_DIAS, NORMA_DE_REGLA, RAZONES, RETIRADA_FORMAS_ANTIGUAS, excepcionDe, leerExcepciones } from "../scripts/lib/excepciones.mjs";
import { excepcionesDelPr, lineaContable, normaTocada } from "../scripts/lib/avisosPr.mjs";
import { MIN_EXCEPTUADAS, RESULTADOS_NORMA, contarPorNorma, leerLineasDeNorma, lineaDeNorma, medir, saltosDeLaGuardia } from "../scripts/lib/medicionNormas.mjs";
import { leerRegistro } from "../scripts/lib/normas.mjs";
import { RUTA_CATALOGO, conceptoDeNorma, conceptosDe, leerPrecedencia, ordenLegible, problemasDePrecedencia, rangoDe, resolverChoque, textoDePrecedencia } from "../scripts/lib/precedencia.mjs";
import { RUTA_PRINCIPIOS, leerPrincipiosCasa } from "../scripts/lib/principios.mjs";
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

describe("1. la precedencia por concepto", () => {
  const principios = leerPrincipiosCasa(RAIZ).principios.map((p) => p.id);
  const con = (cambio, n = normas) => { const t = copia(tabla); cambio(t); return problemasDePrecedencia(t, { normas: n, principios }).join("\n"); };
  const norma = (id) => normas.find((n) => n.id === id);

  it("la del repo no tiene problemas: todo ámbito con su concepto y toda norma defendiendo uno", () => {
    expect(problemasDePrecedencia(tabla, { normas, principios }), "Arregla la «precedencia» de ops/principios/_catalogo.json o el campo «concepto» de la norma").toEqual([]);
  });
  it("seguridad > datos de familias > coste > velocidad, y el orden vive solo en el catálogo", () => {
    expect(conceptosDe(tabla)).toEqual(["security", "family-data", "cost", "speed"]);
    expect(ordenLegible(tabla)).toBe("seguridad > datos de familias > coste > velocidad");
    expect(rangoDe(tabla, "security")).toBe(1);
    expect(rangoDe(tabla, "speed")).toBe(4);
    // La prosa generada sale de ahí, no de un texto escrito a mano.
    expect(leer("docs/ops/NORMAS.md")).toContain(ordenLegible(tabla));
    expect(leer("docs/PRINCIPIOS.md")).toContain(ordenLegible(tabla));
  });
  it("cada ámbito tiene un concepto por defecto y toda norma defiende uno con puesto", () => {
    for (const a of Object.keys(AMBITOS)) expect(rangoDe(tabla, tabla.default_concept[a]), a).not.toBeNull();
    for (const n of normas) expect(rangoDe(tabla, conceptoDeNorma(tabla, n)), n.id).not.toBeNull();
  });
  it("toda norma cuyo principio defiende seguridad, datos de familias o coste defiende ese concepto (registro real)", () => {
    const deseado = new Map(Object.entries(tabla.principles).flatMap(([c, ids]) => ids.map((id) => [id, c])));
    const fuera = normas.filter((n) => deseado.has(n.principio) && conceptoDeNorma(tabla, n) !== deseado.get(n.principio)).map((n) => n.id);
    expect(fuera, "Declara su «concepto» en ops/normas.json").toEqual([]);
    // Y las normas que protegen datos de familias en los registros, aunque su principio sea de otra cosa.
    for (const [id, c] of [["texto-ajeno-es-dato", "security"], ["model-least-privilege", "security"], ["family-text-is-data", "security"], ["eventos-sin-campos-prohibidos", "family-data"], ["product-logs-countable-line", "family-data"], ["new-table-closed-to-anon", "security"]]) {
      expect(conceptoDeNorma(tabla, norma(id)), id).toBe(c);
    }
  });
  it("el catálogo está donde lo lee principios.mjs", () => {
    expect(RUTA_CATALOGO).toBe(RUTA_PRINCIPIOS);
  });
  it("cada regla falla con datos malos", () => {
    expect(con((t) => { delete t.default_concept.writing; })).toMatch(/«writing» no tiene concepto por defecto/);
    expect(con((t) => { t.default_concept.nueva = "speed"; })).toMatch(/«nueva» no es un ámbito/);
    expect(con((t) => { t.default_concept.infra = "beauty"; })).toMatch(/no es un concepto/);
    expect(con((t) => { t.concepts.speed.what = "corto"; })).toMatch(/su porqué/);
    expect(con((t) => { delete t.concepts.speed.label; })).toMatch(/nombre legible/);
    expect(con((t) => { t.principles.cost.push("own-identity"); })).toMatch(/un principio defiende un solo concepto/);
    expect(con((t) => { t.principles.cost.push("no-existe"); })).toMatch(/no es un principio de la lista/);
    expect(con((t) => { t.principles.beauty = ["own-identity"]; })).toMatch(/habla de «beauty»/);
    expect(con((t) => { delete t.clash.rule; })).toMatch(/clash\.rule/);
    expect(con((t) => { t.clash.record = "Tests relajados: sí — x"; })).toMatch(/clash\.record/);
    expect(problemasDePrecedencia(undefined).join()).toMatch(/falta/);
    const mal = (cambio) => { const copiaN = normas.map(copia); cambio(copiaN); return con(() => {}, copiaN); };
    expect(mal((ns) => { ns.find((n) => n.id === "texto-ajeno-es-dato").concepto = "beauty"; })).toMatch(/declara el concepto «beauty»/);
    expect(mal((ns) => { ns.find((n) => n.id === "texto-ajeno-es-dato").concepto = "speed"; })).toMatch(/que ya es el de su ámbito/);
    expect(mal((ns) => { delete ns.find((n) => n.id === "texto-ajeno-es-dato").concepto; })).toMatch(/cita el principio «untrusted-text-is-data», que defiende security/);
    expect(mal((ns) => { ns.find((n) => n.id === "sin-git-stash").ambito = "otro"; })).toMatch(/sin-git-stash: no defiende ningún concepto/);
  });
  it("dos normas que chocan: gana el concepto de más arriba, aunque no sea el de su ámbito; el mismo concepto no se resuelve", () => {
    // Un ámbito de coste frente a uno de velocidad: gana el coste.
    const coste = normas.find((n) => n.ambito === "bot" && !n.concepto);
    const vel = normas.find((n) => n.ambito === "process" && !n.concepto);
    expect(resolverChoque(tabla, coste, vel)).toEqual({ gana: coste.id, cede: vel.id });
    // Una norma de proceso que declara seguridad gana a una de coste.
    expect(resolverChoque(tabla, norma("texto-ajeno-es-dato"), coste)).toEqual({ gana: "texto-ajeno-es-dato", cede: coste.id });
    expect(resolverChoque(tabla, coste.id, "texto-ajeno-es-dato", normas)).toEqual({ gana: "texto-ajeno-es-dato", cede: coste.id });
    // La posición del ámbito ya no decide: sin-git-stash (infra) y new-table-closed-to-anon (data) defienden seguridad las dos.
    expect(resolverChoque(tabla, norma("sin-git-stash"), norma("new-table-closed-to-anon")).sinResolver).toBe(true);
    expect(resolverChoque(tabla, "no-existe", coste, normas).sinResolver).toBe(true);
  });
  it("el brief imprime la tabla y la constancia", () => {
    const t = textoDePrecedencia(tabla);
    expect(t).toMatch(/1\. security \(seguridad\) — ámbitos por defecto: infra, api/);
    expect(t).toContain(tabla.clash.record);
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
    expect(FORMAS.single).toContain(FORMA);
  });
  it("varias líneas son varias excepciones; el día de hoy y el límite valen", () => {
    const hasta = new Date(Date.parse(`${HOY}T00:00:00Z`) + MAX_DIAS * 86_400_000).toISOString().slice(0, 10);
    const l = lee([linea("pr-acotado", "motivo bien largo uno", HOY), linea("tests-no-se-relajan", "motivo bien largo dos", hasta)].join("\n"));
    expect(l.validas.map((e) => e.norma)).toEqual(["pr-acotado", "tests-no-se-relajan"]);
  });
  it("no cuenta: caducada, más allá del tope, norma inexistente, motivo corto, fecha irreal o mal escrita", () => {
    const razon = (c) => lee(c).invalidas.map((i) => i.razon);
    expect(razon(linea("pr-acotado", "motivo bien largo", "2026-10-11"))).toEqual(["expired"]);
    expect(razon(linea("pr-acotado", "motivo bien largo", "2027-12-31"))).toEqual(["too_far"]);
    expect(razon(linea("norma-que-no-existe", "motivo bien largo", "2026-10-20"))).toEqual(["unknown_norm"]);
    expect(razon(linea("pr-acotado", "corto", "2026-10-20"))).toEqual(["short_reason"]);
    expect(razon(linea("pr-acotado", "motivo bien largo", "2026-02-30"))).toEqual(["bad_date"]);
    expect(razon("Excepción: pr-acotado — motivo bien largo")).toEqual(["form"]);
    expect(razon("Excepción: pr-acotado")).toEqual(["form"]);
    expect(Object.keys(RAZONES).sort()).toEqual(["bad_date", "expired", "form", "short_reason", "too_far", "unknown_norm"]);
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
    for (const r of retirados) {
      expect(r.pasa_a).toBe("single");
      // La fecha de retirada es una: la del código.
      expect(r.desde, r.valor).toBe(RETIRADA_FORMAS_ANTIGUAS);
    }
    expect(Object.keys(vida.anclados["pr.excepcion_forma"])).toEqual(Object.keys(FORMAS));
    expect(Object.keys(vida.anclados["precedencia.concepto"])).toEqual(conceptosDe(tabla));
    expect(Object.keys(vida.anclados["pr.excepcion_razon"])).toEqual(Object.keys(RAZONES));
    expect(Object.keys(vida.anclados["normas.resultado"])).toEqual(Object.keys(RESULTADOS_NORMA));
  });
  it("las normas de las tres reglas existen, las leen las formas antiguas de la misma lista y las miden y exceptúan el mismo ejecutor, control y sitio", () => {
    for (const n of Object.values(NORMA_DE_REGLA)) expect(ids, n).toContain(n);
    for (const f of FORMAS_ANTIGUAS) expect(f.norma, f.id).toBe(NORMA_DE_REGLA[f.regla]);
    const tres = Object.values(NORMA_DE_REGLA).map((id) => normas.find((n) => n.id === id));
    for (const campo of ["ejecutor", "control", "control_tipo"]) expect(new Set(tres.map((n) => n[campo])).size, campo).toBe(1);
    expect(new Set(tres.map((n) => JSON.stringify(n.donde))).size, "donde").toBe(1);
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
  it("la línea tiene el formato campo: valor, con el vocabulario cerrado en inglés", () => {
    expect(Object.keys(RESULTADOS_NORMA)).toEqual(["ok", "warning", "fail", "exempt", "declared", "unchecked"]);
    expect(lineaDeNorma("pr-acotado", "warning", { pr: 12, detalle: "lines=3000" })).toBe("norma: pr-acotado resultado: warning pr: 12 detalle: lines=3000");
    expect(lineaDeNorma("pr-acotado", "ok")).toBe("norma: pr-acotado resultado: ok pr: - detalle: -");
    expect(() => lineaDeNorma("pr-acotado", "quizá")).toThrow(/vocabulario/);
    expect(() => lineaDeNorma("pr-acotado", "salta")).toThrow(/vocabulario/);
    expect(() => lineaDeNorma("Pr Acotado", "ok")).toThrow(/id de una norma/);
  });
  it("una sola sintaxis: el aviso del CI es la línea de su norma y no deja una segunda `avisos-pr:` para lo mismo", () => {
    expect(lineaContable({ regla: "c1", resultado: "warning", detalle: "lines=3000" }, 12)).toBe("norma: pr-acotado resultado: warning pr: 12 detalle: lines=3000");
    expect(() => lineaContable({ regla: "c9", resultado: "ok", detalle: "x" })).toThrow(/regla/);
    expect(lineaContable({ regla: "c8", resultado: "ok", detalle: "x" })).not.toMatch(/^avisos-pr:/);
  });
  it("lee las líneas de un log de CI, con la marca de tiempo delante, y salta lo que no es", () => {
    const log = "2026-10-12T10:00:00Z norma: pr-acotado resultado: warning pr: 7 detalle: x\nnorma: tests-no-se-relajan resultado: ok pr: - detalle: -\nnorma: x resultado: quizá\nnorma: otra resultado: ok";
    expect(leerLineasDeNorma(log)).toEqual([
      { norma: "pr-acotado", resultado: "warning", pr: "7" }, { norma: "tests-no-se-relajan", resultado: "ok", pr: null }, { norma: "otra", resultado: "ok", pr: null },
    ]);
  });
  it("los eventos de la guardia con `norma` (o el `codigo` de antes) son warning; lo demás y las líneas rotas no", () => {
    const jsonl = [
      JSON.stringify({ evento: "bloqueo_guardia", nombre: "a", norma: "sin-git-add-todo" }),
      JSON.stringify({ evento: "permiso_pedido", nombre: "b", codigo: "sin-git-add-todo" }),
      JSON.stringify({ evento: "skill_cargada", nombre: "github", norma: "sin-git-add-todo" }),
      JSON.stringify({ evento: "bloqueo_guardia", nombre: "c" }),
      "{roto",
    ].join("\n");
    expect(contarPorNorma(saltosDeLaGuardia(jsonl))).toEqual({ "sin-git-add-todo": { ok: 0, warning: 2, fail: 0, exempt: 0, declared: 0 } });
  });
  it("la unidad es el run de un PR: cinco pushes con el mismo resultado cuentan una vez; si cambia el resultado, cuentan los dos", () => {
    const push = { norma: "pr-acotado", resultado: "warning", pr: "7" };
    expect(contarPorNorma(Array.from({ length: 5 }, () => push))["pr-acotado"].warning).toBe(1);
    const c = contarPorNorma([push, push, { norma: "pr-acotado", resultado: "ok", pr: "7" }, { norma: "pr-acotado", resultado: "warning", pr: "8" }])["pr-acotado"];
    expect([c.warning, c.ok]).toEqual([2, 1]);
    // Los eventos de la guardia no llevan pr: cada uno cuenta.
    expect(contarPorNorma([{ norma: "a", resultado: "warning", pr: null }, { norma: "a", resultado: "warning", pr: null }]).a.warning).toBe(2);
    expect(contarPorNorma([{ norma: "a", resultado: "unchecked", pr: "1" }])).toEqual({});
  });
  it("cuenta por norma y dice cuáles nunca saltan, cuáles no tienen dato y cuáles se exceptúan siempre; declared no cuenta como exceptuada", () => {
    const reg = [{ id: "a", ejecutor: "ci" }, { id: "b", ejecutor: "ci" }, { id: "c", ejecutor: "ci" }, { id: "d", ejecutor: "ci" }, { id: "e", ejecutor: "nada" }, { id: "f", ejecutor: "ci" }];
    const l = (norma, resultado, n = 1) => Array.from({ length: n }, () => ({ norma, resultado, pr: null }));
    const lineas = [...l("a", "ok", 2), ...l("b", "ok"), ...l("b", "warning"), ...l("c", "exempt", MIN_EXCEPTUADAS), ...l("f", "declared", MIN_EXCEPTUADAS + 2), ...l("zzz", "warning")];
    const m = medir(reg, contarPorNorma(lineas));
    expect(m.nuncaSaltan).toEqual(["a"]);
    expect(m.exceptuadasSiempre).toEqual(["c"]);
    expect(m.sinDato).toEqual(["d"]);
    expect(m.desconocidas).toEqual(["zzz"]);
    // Con un solo salto entre las excepciones, ya no es «siempre»; un fail cuenta como salto.
    expect(medir(reg, contarPorNorma([...lineas, ...l("c", "fail")])).exceptuadasSiempre).toEqual([]);
  });
  it("una excepción válida de una norma sin regla en el CI deja `declared`, no `exempt`", () => {
    const e = excepcionesDelPr({ cuerpo: "Excepción: zona-con-dueno — coordinado a mano con la otra rama — hasta 2026-10-20", normas, hoy: "2026-10-12", pr: 9 });
    expect(e.lineas).toEqual(["norma: zona-con-dueno resultado: declared pr: 9 detalle: until=2026-10-20"]);
  });
});

describe("4. la forma única está escrita donde se mira", () => {
  it("la plantilla del PR la explica, dice que la fecha es UTC y que solo exime lo que un control del CI consulta", () => {
    const t = leer(".github/pull_request_template.md");
    expect(t).toContain(FORMA);
    expect(t).toContain("UTC");
    expect(t).toMatch(/solo exime de lo que un control del CI consulta/);
    for (const n of Object.values(NORMA_DE_REGLA)) expect(t, n).toContain(n);
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
    expect(leer("docs/PRINCIPIOS.md")).toContain("## Precedencia");
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
