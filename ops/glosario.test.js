import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLASES, canonicoDe, comparar, ficherosDe, leerExcepciones, leerGlosario, medir, pares, patronDe, problemasDeGlosario, prosaDeJson, prosaDeMarkdown, total,
} from "../scripts/lib/glosario.mjs";

/**
 * El glosario del lenguaje de proceso (#469, fondo #455). Vigila:
 *
 *  1. que ops/glosario.json está bien formado: clase del vocabulario, ref que
 *     existe, ningún sinónimo prohibido es término canónico ni se repite entre
 *     términos, y ninguna definición usa un sinónimo prohibido;
 *  2. el control: ningún sinónimo prohibido nuevo en las zonas de cada término;
 *     lo que había al nacer está en ops/glosario-excepciones.json y SOLO BAJA
 *     (literal de partida abajo, como PARES_DE_PARTIDA de .claude/skills.test.js);
 *  3. que CLAUDE.md dice que el glosario es la fuente de las palabras de proceso.
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const G = leerGlosario(RAIZ);
const EXC = leerExcepciones(RAIZ);
const copia = () => JSON.parse(JSON.stringify(G));

// Lo que había el 10 oct 2026 al nacer (#469): 69 apariciones en 40 pares (ruta, sinónimo).
// Estos literales NO se editan para añadir: solo se les quitan líneas o se baja la cifra.
const TOTAL_DE_PARTIDA = 69;
const PARES_DE_PARTIDA = [
  ".claude/PLANTILLA-AGENTE.md: subagente",
  ".claude/PLANTILLA-AGENTE.md: subagentes",
  ".claude/PLANTILLA-SKILL.md: lección",
  ".claude/PLANTILLA-SKILL.md: runbook",
  ".claude/agents/datos.md: incidente",
  ".claude/agents/gobierno.md: incidente",
  ".claude/agents/gobierno.md: worktree",
  ".claude/agents/gobierno.md: worktrees",
  ".claude/agents/revisor.md: bug",
  ".claude/agents/revisor.md: lección",
  ".claude/rules/migraciones.md: worktrees",
  ".claude/skills/1password/SKILL.md: worktree",
  ".claude/skills/causa-raiz/SKILL.md: causa raíz",
  ".claude/skills/estilo-de-respuesta/SKILL.md: subagentes",
  ".claude/skills/estilo-de-respuesta/plantillas/plantillas.md: worktree",
  ".claude/skills/forja-de-skills/SKILL.md: lección",
  ".claude/skills/github/SKILL.md: parche",
  ".claude/skills/github/SKILL.md: runbook",
  ".claude/skills/github/SKILL.md: subagente",
  ".claude/skills/github/SKILL.md: worktree",
  ".claude/skills/github/SKILL.md: worktrees",
  ".claude/skills/github/referencias/app-sesiones.md: runbook",
  ".claude/skills/higiene-de-skills/SKILL.md: lección",
  ".claude/skills/higiene-de-skills/SKILL.md: parche",
  ".claude/skills/issues/SKILL.md: lección",
  ".claude/skills/telegram/SKILL.md: chequeos",
  "CLAUDE.md: lección",
  "CLAUDE.md: runbook",
  "CLAUDE.md: runbooks",
  "CLAUDE.md: subagente",
  "CLAUDE.md: worktrees",
  "docs/ops/FLUJO.md: causa raíz",
  "docs/ops/FLUJO.md: lección",
  "docs/ops/FLUJO.md: runbook",
  "ops/estandares-agentes.json: bug",
  "ops/estandares-agentes.json: bugs",
  "ops/estandares-agentes.json: lección",
  "ops/estandares-agentes.json: runbook",
  "ops/estandares-agentes.json: worktree",
  "ops/estandares-agentes.json: worktrees",
];

describe("el glosario", () => {
  it("está bien formado", () => {
    expect(problemasDeGlosario(G, { existe, leer }), "Corrige ops/glosario.json").toEqual([]);
  });

  it("cubre los términos de proceso que pide el encargo", () => {
    const terminos = G.terminos.map((t) => t.termino);
    for (const t of ["comprobar", "verificar", "probar", "medir", "revisar", "auditar", "juzgar", "caso", "fallo", "fondo", "causa", "encargo", "tarea", "skill", "estándar", "norma", "regla", "criterio", "juez", "revisor", "constructor"]) {
      expect(terminos, t).toContain(t);
    }
  });

  it("las zonas tienen ficheros de verdad", () => {
    for (const [z, pats] of Object.entries(G.zonas)) for (const p of pats) expect(ficherosDe(RAIZ, p).length, `${z}: ${p}`).toBeGreaterThan(0);
    expect(ficherosDe(RAIZ, ".claude/skills/**/*.md")).toContain(".claude/skills/forja-de-skills/referencias/criterios.md");
  });
});

describe("el control: ningún sinónimo prohibido nuevo", () => {
  const { medida, detalle } = medir(RAIZ, G);
  const { nuevas, bajadas } = comparar(medida, EXC);

  it("no hay sinónimos prohibidos nuevos (escribe el término canónico; la lista no crece)", () => {
    const texto = nuevas.map((n) => {
      const d = detalle.filter((x) => x.ruta === n.ruta && x.sinonimo === n.sinonimo);
      return `${n.ruta}: «${n.sinonimo}» → di «${d[0]?.canonico}» (hay ${n.hay}, admitidas ${n.admitidas}; en ${d.map((x) => x.donde).join(", ")})`;
    });
    expect(texto).toEqual([]);
  });

  it("lo arreglado se baja de la lista", () => {
    expect(bajadas.map((b) => `${b.ruta}: «${b.sinonimo}» hay ${b.hay}, admitidas ${b.admitidas}`), "Ya cumple: baja la cifra en ops/glosario-excepciones.json").toEqual([]);
  });

  it("la lista solo baja: ningún par fuera del literal de partida y el total no sube", () => {
    const paresHoy = Object.entries(EXC).flatMap(([r, x]) => Object.keys(x).map((s) => `${r}: ${s}`));
    expect(paresHoy.filter((p) => !PARES_DE_PARTIDA.includes(p)), "Un par nuevo: escribe el término canónico; la lista no crece").toEqual([]);
    expect(total(EXC)).toBeLessThanOrEqual(TOTAL_DE_PARTIDA);
    expect(pares(EXC)).toBeLessThanOrEqual(PARES_DE_PARTIDA.length);
    for (const x of Object.values(EXC)) for (const n of Object.values(x)) expect(Number.isInteger(n) && n > 0).toBe(true);
  });

  it("las claves de la lista son sinónimos prohibidos de verdad", () => {
    const canon = canonicoDe(G);
    for (const [r, x] of Object.entries(EXC)) for (const s of Object.keys(x)) expect(canon.has(s), `${r}: ${s}`).toBe(true);
  });
});

describe("CLAUDE.md y npm run glosario", () => {
  it("CLAUDE.md dice que el glosario es la fuente de las palabras de proceso", () => {
    expect(leer("CLAUDE.md")).toMatch(/`ops\/glosario\.json`/);
  });

  it("npm run glosario existe", () => {
    expect(JSON.parse(leer("package.json")).scripts.glosario).toBe("node scripts/glosario.mjs");
  });
});

// ── Autotest: cada regla falla con datos malos ──────────────────────────────

describe("autotest de la forma", () => {
  const conTermino = (cambio) => { const g = copia(); cambio(g.terminos[0], g); return problemasDeGlosario(g, { existe, leer }); };

  it("una clase fuera del vocabulario", () => {
    expect(Object.keys(CLASES)).toEqual(["accion", "estado", "artefacto", "rol", "campo", "lugar"]);
    expect(conTermino((t) => { t.clase = "verbo"; }).join()).toMatch(/fuera del vocabulario/);
  });

  it("una ref a un fichero que no existe, o a una clave que no está", () => {
    expect(conTermino((t) => { t.ref = { fichero: "scripts/lib/no-existe.mjs", clave: "X" }; }).join()).toMatch(/no existe/);
    expect(conTermino((t) => { t.ref = { fichero: "scripts/lib/issues.mjs", clave: "GRUPOS.inventado" }; }).join()).toMatch(/no contiene «inventado»/);
  });

  it("un sinónimo prohibido que es término canónico", () => {
    expect(conTermino((t) => { t.sinonimos_prohibidos.push("verificar"); }).join()).toMatch(/también término canónico/);
  });

  it("un sinónimo repetido entre dos términos", () => {
    expect(conTermino((t) => { t.sinonimos_prohibidos.push("bug"); }).join()).toMatch(/«bug» ya es sinónimo prohibido de /);
  });

  it("un término repetido, una zona que no existe, un campo de más y una definición larga", () => {
    const g = copia();
    g.terminos.push({ ...g.terminos[0], sinonimos_prohibidos: [] });
    expect(problemasDeGlosario(g, { existe, leer }).join()).toMatch(/término repetido/);
    expect(conTermino((t) => { t.aplica_a = ["inventada"]; }).join()).toMatch(/zona «inventada» no existe/);
    expect(conTermino((t) => { t.sinonimo = "x"; }).join()).toMatch(/campo desconocido/);
    expect(conTermino((t) => { t.definicion = "x".repeat(300); }).join()).toMatch(/definición de 300/);
  });

  it("una definición que usa un sinónimo prohibido", () => {
    expect(conTermino((t) => { t.definicion = "Mirar si hay un bug con evidencia repetible."; }).join()).toMatch(/usa «bug» \(di «fallo»\)/);
  });
});

describe("autotest del control (visto fallar con un sinónimo nuevo)", () => {
  const medirTexto = (ruta, texto) => medir(RAIZ, G, { leer: () => texto, ficheros: (p) => (p === ".claude/skills/**/*.md" ? [ruta] : []) });

  it("un sinónimo nuevo en una skill falla y dice el término canónico", () => {
    const { medida, detalle } = medirTexto(".claude/skills/x/SKILL.md", "# X\n\nAbre el runbook antes.\nUn bug en la guardia.\n");
    expect(comparar(medida, {}).nuevas.map((n) => n.sinonimo).sort()).toEqual(["bug", "runbook"]);
    expect(detalle.find((d) => d.sinonimo === "runbook")).toMatchObject({ canonico: "skill", donde: 3 });
    expect(detalle.find((d) => d.sinonimo === "bug")).toMatchObject({ canonico: "fallo", donde: 4 });
  });

  it("palabra completa y sin mayúsculas: Bug cuenta, debug y auditor-datos no", () => {
    expect("Un Bug.".match(patronDe("bug"))).toHaveLength(1);
    expect("debug, bugs-x, x-bug".match(patronDe("bug"))).toBeNull();
    expect("Lo lleva el WORKTREE".match(patronDe("worktree"))).toHaveLength(1);
    expect("una causa  raíz".match(patronDe("causa raíz"))).toHaveLength(1);
  });

  it("no cuenta código, URLs, rutas, «citas», comentarios ni secciones de historia", () => {
    const md = [
      "# X",
      "`git worktree list` y https://ejemplo.com/runbook y scripts/worktree.mjs",
      "La línea «Runbook: sin novedades» del PR. <!-- un bug -->",
      "```",
      "un bug en un bloque",
      "```",
      "## Lo que falló y por qué",
      "- un bug de entonces",
      "### detalle",
      "- otro bug",
      "## Registro de cambios",
      "- se arregló un bug",
      "## Fuentes y comprobación",
      "un bug que sí cuenta",
    ].join("\n");
    const limpio = prosaDeMarkdown(md);
    expect(limpio.split("\n")).toHaveLength(md.split("\n").length);
    const { detalle } = medirTexto(".claude/skills/x/SKILL.md", md);
    expect(detalle.map((d) => `${d.sinonimo}@${d.donde}`)).toEqual(["bug@14"]);
  });

  it("en un JSON mira los textos y no las claves ni los ids", () => {
    const json = JSON.stringify({ bug: "nada", tareas: [{ id: "arreglar-bug", tarea: "Buscar un bug", fuentes: ["docs/bug.md"] }] });
    expect(prosaDeJson(json).map((x) => x.texto)).toEqual(["nada", "Buscar un bug"]);
  });

  it("una excepción admite su cifra y ni una más", () => {
    expect(comparar({ a: { bug: 2 } }, { a: { bug: 2 } })).toEqual({ nuevas: [], bajadas: [] });
    expect(comparar({ a: { bug: 3 } }, { a: { bug: 2 } }).nuevas).toHaveLength(1);
    expect(comparar({ a: { bug: 1 } }, { a: { bug: 2 } }).bajadas).toHaveLength(1);
    expect(comparar({}, { a: { bug: 2 } }).bajadas).toHaveLength(1);
  });
});
