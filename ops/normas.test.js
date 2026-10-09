import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALCANCES, ANTE_FALLO, EJECUTORES, EJECUTORES_DEL_SISTEMA, RIESGOS, VEREDICTOS,
  comprobarNormasPr, contarFrases, esVigilado, ficherosNormativos, leerRegistro, lineaNormas, lineasAnadidas, medirFrases,
  problemasDeDureza, problemasDeForma, recuento, CIFRAS_FONDO, medirFondo,
} from "../scripts/lib/normas.mjs";
import { MEDIDORES, evaluarCriterio } from "../scripts/lib/planos.mjs";

/**
 * El registro de normas (#296). Falla si una norma que se dice dura no lo es,
 * si una de riesgo alto no es dura y nadie la lleva en un issue, y si un
 * código que falla cerrado no tiene el test que inyecta el fallo.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registro = leerRegistro(RAIZ);
const planos = JSON.parse(readFileSync(join(RAIZ, "ops/planos.json"), "utf8"));
const ctx = { raiz: RAIZ, planos };

// Una norma dura de ejemplo que cumple todo; los casos de abajo la estropean de una en una.
const DURA = {
  id: "ejemplo", texto: "x", donde: ["CLAUDE.md"], ejecutor: "codigo_en_ejecucion", alcance: "todos", ante_fallo: "cerrado",
  test: "api/_guard.test.js", test_fallo: { ruta: "api/_guard.test.js", caso: "sin_redis" }, veredicto: "dura", riesgo: "alto", issue: null,
};

describe("vocabulario de normas", () => {
  it("cada valor tiene su definición y los ejecutores del sistema son ejecutores", () => {
    for (const v of [EJECUTORES, ALCANCES, ANTE_FALLO, VEREDICTOS, RIESGOS]) for (const d of Object.values(v)) expect(d.length).toBeGreaterThan(10);
    for (const e of EJECUTORES_DEL_SISTEMA) expect(Object.keys(EJECUTORES)).toContain(e);
  });
});

describe("ops/normas.json", () => {
  it("cada norma tiene su forma y su vocabulario, y los ids no se repiten", () => {
    expect(registro.normas.flatMap(problemasDeForma)).toEqual([]);
    const ids = registro.normas.map((n) => n.id);
    expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
  });

  it("lo que se nombra en «donde» existe (salvo el CLAUDE.md de usuario, que vive fuera)", () => {
    const faltan = registro.normas.flatMap((n) => n.donde.filter((d) => d !== "CLAUDE.md de usuario" && !existsSync(join(RAIZ, d))).map((d) => `${n.id}: ${d}`));
    expect(faltan).toEqual([]);
  });

  it("ninguna norma se dice más dura de lo que es", () => {
    const aviso = "O se arregla lo que falta (ejecutor, alcance, test, issue) o se baja el veredicto en ops/normas.json: una norma dura sin ejecutor es texto.";
    expect(registro.normas.flatMap((n) => problemasDeDureza(n, ctx)), aviso).toEqual([]);
  });

  it("el recuento cuadra con el total", () => {
    const r = recuento(registro.normas);
    expect(Object.values(r.veredicto).reduce((a, b) => a + b, 0)).toBe(r.total);
    expect(Object.values(r.riesgo).reduce((a, b) => a + b, 0)).toBe(r.total);
  });
});

describe("frases normativas", () => {
  const ids = new Set(registro.normas.map((n) => n.id));

  it("ninguna cita del repo apunta a una norma que no existe", () => {
    expect(medirFrases(RAIZ, ids).citasMalas, "Corrige el id o da de alta la norma en ops/normas.json").toEqual([]);
  });

  it("recorre CLAUDE.md, las reglas, skills, agentes y comandos, PRINCIPIOS y ops/*.md, y esVigilado dice lo mismo", () => {
    const f = ficherosNormativos(RAIZ);
    for (const r of ["CLAUDE.md", "docs/datos/PRINCIPIOS.md", "ops/PLANOS.md", ".claude/rules/tests.md", ".claude/skills/github/SKILL.md", ".claude/agents/gobierno.md", ".claude/commands/orquestar.md"]) expect(f).toContain(r);
    expect(f.some((r) => r.startsWith("ops/copias/"))).toBe(false);
    expect(f.filter((r) => !esVigilado(r))).toEqual([]);
    for (const r of ["ops/copias/LEEME.md", "src/x.md", ".claude/hooks/x.md", "ops/normas.json"]) expect(esVigilado(r)).toBe(false);
  });

  it("cuenta las palabras fuertes (sin «solo») y una cita cubre su palabra, no la línea entera", () => {
    const ids1 = new Set(["main-solo-pablo", "sin-git-stash"]);
    expect(contarFrases("Nunca se fusiona a main.", ids1).cuenta).toEqual({ nunca: 1 });
    expect(contarFrases("Nunca se fusiona a main. <!-- norma:main-solo-pablo -->", ids1).cuenta).toEqual({});
    expect(contarFrases("Nunca a main <!-- norma:main-solo-pablo --> y siempre con tests.", ids1).cuenta).toEqual({ siempre: 1 });
    expect(contarFrases("Nunca a main <!-- norma:main-solo-pablo --> y nunca stash <!-- norma:sin-git-stash -->", ids1).cuenta).toEqual({});
    expect(contarFrases("Nunca. <!-- norma:inventada -->", ids1)).toEqual({ cuenta: { nunca: 1 }, citasMalas: ["inventada"] });
    expect(contarFrases("Sólo, MÁXIMO, topes, obligatoria, exigen, OK de Pablo, siempre", ids1).cuenta)
      .toEqual({ maximo: 1, tope: 1, obligatorio: 1, exige: 1, ok_de_pablo: 1, siempre: 1 });
    expect(contarFrases("soloista, topetazo, inexigente, nuncamente", ids1).cuenta).toEqual({});
  });
});

describe("el paso del CI: solo las líneas añadidas del PR (scripts/normas-pr.mjs)", () => {
  const ids = new Set(["main-solo-pablo"]);
  const diffDe = (ruta, anadidas, quitadas = []) => [
    `diff --git a/${ruta} b/${ruta}`, `--- a/${ruta}`, `+++ b/${ruta}`, "@@ -10,1 +10,2 @@",
    ...quitadas.map((l) => `-${l}`), ...anadidas.map((l) => `+${l}`),
  ].join("\n");

  it("una línea nueva con «nunca» sin cita falla, con su fichero y su línea", () => {
    const r = comprobarNormasPr({ diff: diffDe("CLAUDE.md", ["Nunca se despliega un viernes."]), ids });
    expect(r.ok).toBe(false);
    expect(r.sueltas).toEqual([{ ruta: "CLAUDE.md", linea: 10, palabras: ["nunca"] }]);
    expect(r.motivo).toMatch(/CLAUDE\.md:10/);
    expect(r.motivo).toMatch(/Normas: sin novedades/);
  });

  it("con la cita pasa; con «Normas: sin novedades — motivo» pasa; sin motivo, no", () => {
    expect(comprobarNormasPr({ diff: diffDe("CLAUDE.md", ["Nunca a main. <!-- norma:main-solo-pablo -->"]), ids }).ok).toBe(true);
    const diff = diffDe("CLAUDE.md", ["Nunca se despliega un viernes."]);
    expect(comprobarNormasPr({ diff, cuerpo: "Texto\n\nNormas: sin novedades — es una lección, no una norma\n", ids }).ok).toBe(true);
    expect(comprobarNormasPr({ diff, cuerpo: "Normas: sin novedades - consejo de estilo", ids }).ok).toBe(true);
    expect(comprobarNormasPr({ diff, cuerpo: "Normas: sin novedades", ids }).ok).toBe(false);
    expect(comprobarNormasPr({ diff, cuerpo: "<!-- Normas: sin novedades — ejemplo de la plantilla -->", ids }).ok).toBe(false);
    expect(comprobarNormasPr({ diff, cuerpo: "```\nNormas: sin novedades — en un bloque\n```", ids }).ok).toBe(false);
  });

  it("no mira lo borrado, ni ficheros fuera de la lista, ni «solo»; exentos los bots", () => {
    expect(comprobarNormasPr({ diff: diffDe("CLAUDE.md", ["Una línea neutra."], ["Nunca jamás."]), ids }).ok).toBe(true);
    expect(comprobarNormasPr({ diff: diffDe("src/App.jsx", ["// nunca"]), ids }).ok).toBe(true);
    expect(comprobarNormasPr({ diff: diffDe("ops/copias/LEEME.md", ["Nunca."]), ids }).ok).toBe(true);
    expect(comprobarNormasPr({ diff: diffDe(".claude/skills/github/SKILL.md", ["Solo lo lanza Pablo."]), ids }).ok).toBe(true);
    expect(comprobarNormasPr({ diff: diffDe("CLAUDE.md", ["Nunca."]), autor: "dependabot[bot]", ids }).ok).toBe(true);
  });

  it("una cita a una norma que no existe falla aunque el PR diga «sin novedades»", () => {
    const r = comprobarNormasPr({ diff: diffDe("CLAUDE.md", ["Nunca. <!-- norma:inventada -->"]), cuerpo: "Normas: sin novedades — x y z", ids });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/inventada/);
  });

  it("lineasAnadidas lleva la cuenta de la línea y salta ficheros borrados", () => {
    const diff = ["+++ b/CLAUDE.md", "@@ -1,0 +5,2 @@", "+a", "+b", "+++ /dev/null", "@@ -1 +0,0 @@", "-c"].join("\n");
    expect(lineasAnadidas(diff)).toEqual([{ ruta: "CLAUDE.md", linea: 5, texto: "a" }, { ruta: "CLAUDE.md", linea: 6, texto: "b" }]);
    expect(lineaNormas("**Normas:** sin novedades — x y z")).toEqual({ presente: true, motivo: "x y z" });
  });
});

describe("la medición del fondo", () => {
  const caso = (n, extra = {}) => ({ number: n, state: "OPEN", labels: [{ name: "tipo:caso" }], padre: null, hijos: [], ...extra });
  const fondo = (n, extra = {}) => ({ number: n, state: "OPEN", labels: [{ name: "tipo:fondo" }], padre: null, hijos: [], ...extra });

  it("cuenta cada cifra solo con lo que le toca, y nada en vacío", () => {
    expect(medirFondo([])).toEqual({ casos_sin_fondo: 0, fondos_sin_encargo: 0, fondos_cerrados_sin_test: 0 });
    const issues = [
      caso(1), // sin fondo: cuenta
      caso(2, { labels: [{ name: "tipo:caso" }, { name: "analisis:puntual" }] }), // puntual: no
      caso(3, { padre: { number: 10, tipo: "fondo" } }), // colgado: no
      caso(4, { padre: { number: 99, tipo: "encargo" } }), // colgado de algo que no es un fondo: cuenta
      caso(5, { state: "CLOSED" }), // cerrado: no
      fondo(10, { hijos: [{ number: 3, tipo: "caso" }] }), // sin encargo: cuenta
      fondo(11, { hijos: [{ number: 12, tipo: "encargo", state: "CLOSED" }] }), // con encargo: no
      fondo(13, { state: "CLOSED", labels: [{ name: "tipo:fondo" }, { name: "arreglo:regla" }] }), // cerrado sin test: cuenta
      fondo(14, { state: "CLOSED", labels: [{ name: "tipo:fondo" }] }), // cerrado sin etiqueta: cuenta
      fondo(15, { state: "CLOSED", labels: [{ name: "tipo:fondo" }, { name: "arreglo:test" }] }), // con test: no
      fondo(16, { state: "CLOSED", labels: [{ name: "tipo:fondo" }, { name: "arreglo:guardia" }] }), // regla de la guardia: no
      fondo(17, { state: "CLOSED", stateReason: "NOT_PLANNED" }), // «no se hará»: no es un arreglo, no cuenta
      fondo(18, { state: "CLOSED", stateReason: "DUPLICATE" }), // duplicado: no cuenta
    ];
    expect(medirFondo(issues)).toEqual({ casos_sin_fondo: 2, fondos_sin_encargo: 1, fondos_cerrados_sin_test: 2 });
  });

  it("cada cifra tiene su definición y su medidor en planos, y sin red sale sin comprobar", () => {
    for (const k of Object.keys(CIFRAS_FONDO)) expect(Object.keys(MEDIDORES)).toContain(k);
    const sinRed = evaluarCriterio({ tipo: "cifra_umbral", medidor: "casos_sin_fondo", operador: "<=", umbral: 0, que: "x" }, { raiz: RAIZ });
    expect(sinRed.estado).toBe("sin_comprobar");
    const conRed = { raiz: RAIZ, leerIssues: () => [caso(1), caso(2)] };
    expect(evaluarCriterio({ tipo: "cifra_umbral", medidor: "casos_sin_fondo", operador: "<=", umbral: 1, que: "x" }, conRed).estado).toBe("no_cumple");
    expect(evaluarCriterio({ tipo: "cifra_umbral", medidor: "casos_sin_fondo", operador: "<=", umbral: 2, que: "x" }, { ...conRed, fondo: undefined }).estado).toBe("cumple");
  });
});

describe("las reglas de dureza fallan cuando deben", () => {
  const problemas = (cambios) => problemasDeDureza({ ...DURA, ...cambios }, ctx);

  it("la norma de ejemplo pasa", () => expect(problemas({})).toEqual([]));

  it("dura con un ejecutor que no es del sistema", () => {
    for (const ejecutor of ["guardia", "clasificador", "script_propio", "persona", "nada"]) {
      expect(problemas({ ejecutor, test_fallo: undefined }).join()).toMatch(/no es del sistema/);
    }
  });

  it("dura que no alcanza a todos, que falla abierta o sin test", () => {
    expect(problemas({ alcance: "solo_claude" }).join()).toMatch(/solo alcanza/);
    expect(problemas({ ante_fallo: "abierto" }).join()).toMatch(/ante un fallo/);
    expect(problemas({ test: null }).join()).toMatch(/sin test/);
    expect(problemas({ test: "no/existe.test.js" }).join()).toMatch(/no existe/);
  });

  it("un test de planos vale si ops/planos.json tiene esa regla, y no si no", () => {
    expect(problemas({ ejecutor: "github_regla", test: "planos:check_obligatorio:staging", test_fallo: undefined })).toEqual([]);
    expect(problemas({ ejecutor: "github_regla", test: "planos:inventada", test_fallo: undefined }).join()).toMatch(/no existe/);
  });

  it("riesgo alto sin ser dura y sin issue", () => {
    expect(problemas({ veredicto: "semidura" }).join()).toMatch(/riesgo alto/);
    expect(problemas({ veredicto: "semidura", issue: 1 })).toEqual([]);
  });

  it("código en ejecución que falla cerrado sin el test que inyecta el fallo", () => {
    expect(problemas({ test_fallo: undefined }).join()).toMatch(/test_fallo/);
    expect(problemas({ test_fallo: { ruta: "no/existe.test.js", caso: "x" } }).join()).toMatch(/no existe/);
    expect(problemas({ test_fallo: { ruta: "api/_guard.test.js", caso: "caso que ningún test nombra" } }).join()).toMatch(/no nombra/);
  });
});
