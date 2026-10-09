import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALCANCES, ANTE_FALLO, EJECUTORES, EJECUTORES_DEL_SISTEMA, RIESGOS, VEREDICTOS,
  RUTA_BASE, contarFrases, ficherosNormativos, leerRegistro, medirFrases, nuevaBase, problemasDeDureza, problemasDeForma, recuento,
  subidas, totalBase,
} from "../scripts/lib/normas.mjs";

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

describe("el trinquete de frases normativas", () => {
  const ids = new Set(registro.normas.map((n) => n.id));
  const base = JSON.parse(readFileSync(join(RAIZ, RUTA_BASE), "utf8"));

  it("ninguna frase nueva con «nunca», «siempre», «solo»… sin citar una norma, y ninguna cita a una norma que no existe", () => {
    const { actual, citasMalas } = medirFrases(RAIZ, ids);
    const aviso = "Cita la norma en la misma línea (<!-- norma:<id> -->), dala de alta en ops/normas.json o reescribe la frase. `npm run normas` lo detalla.";
    expect(subidas(actual, base).map((s) => `${s.ruta} «${s.palabra}»: ${s.base} -> ${s.actual}`), aviso).toEqual([]);
    expect(citasMalas, aviso).toEqual([]);
  });

  it("la base no guarda más de lo que hay hoy: lo que baja, se baja (npm run normas -- --base)", () => {
    const { actual } = medirFrases(RAIZ, ids);
    expect(totalBase(nuevaBase(actual, base)), "Ejecuta `npm run normas -- --base` y commitea ops/normas-base.json").toBe(totalBase(base));
  });

  it("recorre CLAUDE.md, las reglas, skills, agentes y comandos, PRINCIPIOS y ops/*.md", () => {
    const f = ficherosNormativos(RAIZ);
    for (const r of ["CLAUDE.md", "docs/datos/PRINCIPIOS.md", "ops/PLANOS.md", ".claude/rules/tests.md", ".claude/skills/github/SKILL.md", ".claude/agents/gobierno.md", ".claude/commands/orquestar.md"]) expect(f).toContain(r);
    expect(f.some((r) => r.startsWith("ops/copias/"))).toBe(false);
  });

  it("una frase nueva sube la cuenta; citando una norma que existe, no", () => {
    const ids1 = new Set(["main-solo-pablo"]);
    expect(contarFrases("Nunca se fusiona a main.", ids1).cuenta).toEqual({ nunca: 1 });
    expect(contarFrases("Nunca se fusiona a main. <!-- norma:main-solo-pablo -->", ids1).cuenta).toEqual({});
    expect(contarFrases("Nunca. <!-- norma:inventada -->", ids1)).toEqual({ cuenta: { nunca: 1 }, citasMalas: ["inventada"] });
    expect(contarFrases("Sólo, MÁXIMO, topes, obligatoria, exigen, OK de Pablo, siempre", ids1).cuenta)
      .toEqual({ solo: 1, maximo: 1, tope: 1, obligatorio: 1, exige: 1, ok_de_pablo: 1, siempre: 1 });
    expect(contarFrases("soloista, topetazo, inexigente", ids1).cuenta).toEqual({});
    expect(subidas({ "CLAUDE.md": { nunca: 3 } }, { "CLAUDE.md": { nunca: 2 } })).toEqual([{ ruta: "CLAUDE.md", palabra: "nunca", actual: 3, base: 2 }]);
  });

  it("la base solo baja salvo que se pida subirla", () => {
    const base0 = { a: { solo: 2 } };
    expect(nuevaBase({ a: { solo: 1 } }, base0)).toEqual({ a: { solo: 1 } });
    expect(nuevaBase({ a: { solo: 3, nunca: 1 } }, base0)).toEqual({ a: { solo: 2 } });
    expect(nuevaBase({ a: { solo: 3 } }, base0, { subir: true })).toEqual({ a: { solo: 3 } });
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
