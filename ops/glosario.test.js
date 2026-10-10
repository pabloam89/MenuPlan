import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REFERENCIA, jsonEnReferencia } from "../scripts/lib/forjaReferencia.mjs";
import { RUTA_VOCABULARIOS, leerRegistro, redefinicionesDelGlosario } from "../scripts/lib/vocabulariosVida.mjs";
import { JUICIOS, MAX_CANDIDATOS, MOTIVOS_JUICIO, aJuzgar, candidatos, leerJuicios, lineaCandidato, pendientesDeJuicios, problemasDeJuicios, prosaDeZonas } from "../scripts/lib/glosarioCandidatos.mjs";
import {
  CLASES, ESTADOS_TERMINO, EXCEPCIONES_FORMA, RUTA_GLOSARIO, canonicoDe, cifrasDeForma, faltaDeForma, problemasDeRelaciones, problemasDeVidaGlosario, comparar, ficherosDe, leerExcepciones, leerGlosario, medir, patronDe, plano, problemasDeGlosario, prosaDeJson, prosaDeMarkdown, sobrePartida, total,
} from "../scripts/lib/glosario.mjs";

/**
 * El glosario del lenguaje de proceso (#469, fondo #455). Vigila:
 *
 *  1. que ops/glosario.json está bien formado: clase del vocabulario, ref que
 *     existe, ningún sinónimo prohibido es término canónico ni se repite entre
 *     términos, y ninguna definición usa un sinónimo prohibido;
 *  2. el control: ningún sinónimo prohibido nuevo en las zonas de cada término;
 *     lo que había al nacer está en ops/glosario-excepciones.json y SOLO BAJA
 *     par a par (literal PARTIDA abajo, con la cifra de cada par: no vale subir
 *     uno a cambio de bajar otro);
 *  3. que CLAUDE.md dice que el glosario es la fuente de las palabras de proceso;
 *  4. el ciclo de vida (#481): cada término está activo o retirado (con su pasa_a), y
 *     contra origin/staging ninguno desaparece ni vuelve de retirado a activo. Plan B:
 *     sin git o sin la referencia, contra TERMINOS_FIJADOS (los del nacimiento).
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const G = leerGlosario(RAIZ);
const EXC = leerExcepciones(RAIZ);
const copia = () => JSON.parse(JSON.stringify(G));

// Lo que había el 10 oct 2026 al nacer (#469): 78 apariciones en 46 pares «ruta: sinónimo».
// Este literal NO se edita para añadir ni para subir: solo se quitan líneas o se baja la cifra.
const PARTIDA = {
  ".claude/PLANTILLA-AGENTE.md: subagente": 1,
  ".claude/PLANTILLA-AGENTE.md: subagentes": 1,
  ".claude/PLANTILLA-SKILL.md: lección": 3,
  ".claude/PLANTILLA-SKILL.md: runbook": 2,
  ".claude/agents/datos.md: incidente": 1,
  ".claude/agents/gobierno.md: incidente": 2,
  ".claude/agents/gobierno.md: worktree": 1,
  ".claude/agents/gobierno.md: worktrees": 4,
  ".claude/agents/revisor.md: bug": 2,
  ".claude/agents/revisor.md: lección": 7,
  ".claude/commands/backend-review.md: reporte": 1,
  ".claude/commands/orquestar.md: bug": 1,
  ".claude/commands/orquestar.md: subagente": 2,
  ".claude/commands/orquestar.md: worktree": 3,
  ".claude/commands/orquestar.md: worktrees": 1,
  ".claude/rules/migraciones.md: worktrees": 1,
  ".claude/skills/1password/SKILL.md: worktree": 3,
  ".claude/skills/causa-raiz/SKILL.md: causa raíz": 1,
  ".claude/skills/estilo-de-respuesta/SKILL.md: subagentes": 1,
  ".claude/skills/estilo-de-respuesta/plantillas/plantillas.md: worktree": 1,
  ".claude/skills/forja-de-skills/SKILL.md: lección": 1,
  ".claude/skills/github/SKILL.md: parche": 1,
  ".claude/skills/github/SKILL.md: runbook": 1,
  ".claude/skills/github/SKILL.md: subagente": 2,
  ".claude/skills/github/SKILL.md: worktree": 1,
  ".claude/skills/github/SKILL.md: worktrees": 1,
  ".claude/skills/github/referencias/app-sesiones.md: runbook": 1,
  ".claude/skills/higiene-de-skills/SKILL.md: lección": 1,
  ".claude/skills/higiene-de-skills/SKILL.md: parche": 1,
  ".claude/skills/issues/SKILL.md: lección": 1,
  ".claude/skills/telegram/SKILL.md: chequeos": 1,
  "CLAUDE.md: lección": 3,
  "CLAUDE.md: runbook": 1,
  "CLAUDE.md: runbooks": 1,
  "CLAUDE.md: subagente": 1,
  "CLAUDE.md: worktrees": 2,
  "docs/ops/FLUJO.md: causa raíz": 1,
  "docs/ops/FLUJO.md: lección": 1,
  "docs/ops/FLUJO.md: runbook": 2,
  "ops/estandares-agentes.json: bug": 2,
  "ops/estandares-agentes.json: bugs": 1,
  "ops/estandares-agentes.json: lección": 6,
  "ops/estandares-agentes.json: runbook": 2,
  "ops/estandares-agentes.json: worktree": 1,
  "ops/estandares-agentes.json: worktrees": 2,
  "ops/normas.json: lecciones": 1,
};

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

  it("la lista solo baja, par a par: ningún par fuera de la partida ni por encima de su cifra", () => {
    expect(sobrePartida(EXC, PARTIDA), "Escribe el término canónico; la lista no crece ni se reparte").toEqual([]);
    for (const x of Object.values(EXC)) for (const n of Object.values(x)) expect(Number.isInteger(n) && n > 0).toBe(true);
    expect(total(EXC)).toBeLessThanOrEqual(Object.values(PARTIDA).reduce((s, n) => s + n, 0));
  });

  it("las claves de la lista son sinónimos prohibidos de verdad", () => {
    const canon = canonicoDe(G);
    for (const [r, x] of Object.entries(EXC)) for (const s of Object.keys(x)) expect(canon.has(s), `${r}: ${s}`).toBe(true);
  });
});

// Los términos del 10 oct 2026, al añadir el ciclo de vida (#481). NO se edita: un término no se borra, se retira.
const TERMINOS_FIJADOS = [
  "comprobar", "verificar", "validar", "probar", "ensayar", "medir", "revisar", "auditar", "juzgar",
  "diagnosticar", "registrar", "fusionar", "aplicar", "retirar", "podar", "gateway", "fallo", "falta", "aviso",
  "caso", "caso de prueba", "fondo", "causa", "causa de escape", "clase", "aprendizaje", "encargo", "tarea",
  "tarea de agente", "decisión", "arreglo", "issue", "ficha", "evidencia", "hallazgo", "defecto", "informe",
  "skill", "capa", "plantilla", "regla", "norma", "estándar", "criterio", "control", "mecanismo", "barrera",
  "guardia", "hook", "test", "vocabulario", "vigilante", "sesión", "agente", "constructor", "juez", "revisor",
  "orquestador", "dueño", "persona", "carpeta de trabajo", "carpeta principal", "staging", "producción",
  "zona",
];
const REF = REFERENCIA();
const glosarioRef = jsonEnReferencia(RAIZ, REF, RUTA_GLOSARIO);
if (!glosarioRef) console.info(`[glosario] ciclo de vida contra ${REF}: sin git o sin la referencia; se compara con TERMINOS_FIJADOS`);

describe("el ciclo de vida: un término se retira, no se borra", () => {
  it("cada término lleva estado activo o retirado", () => {
    expect(Object.keys(ESTADOS_TERMINO)).toEqual(["activo", "retirado"]);
    for (const t of G.terminos) expect(Object.keys(ESTADOS_TERMINO), t.termino).toContain(t.estado);
  });
  it(`nada de ${glosarioRef ? REF : "la lista fijada"} desaparece ni vuelve de retirado`, () => {
    expect(problemasDeVidaGlosario(G, glosarioRef ?? TERMINOS_FIJADOS), "Un término no se borra: estado «retirado» y pasa_a").toEqual([]);
  });
  it("la lista fijada también se respeta aunque haya referencia", () => {
    expect(problemasDeVidaGlosario(G, TERMINOS_FIJADOS)).toEqual([]);
  });
  // Plan B: sin referencia no hay definiciones con que comparar (la lista fijada solo trae nombres) y se salta.
  it.skipIf(!glosarioRef)(`cada definición distinta de la de ${REF} tiene su redefinición registrada`, () => {
    const registroRef = jsonEnReferencia(RAIZ, REF, RUTA_VOCABULARIOS);
    expect(redefinicionesDelGlosario(G, glosarioRef, leerRegistro(RAIZ), registroRef), `Si cambias una definición sin cambiar su significado, añade {termino, desde, motivo} a «redefiniciones» de ${RUTA_VOCABULARIOS}`).toEqual([]);
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

describe("relaciones y forma de la definición (#481)", () => {
  it("las relaciones están bien y la mayoría de términos tiene alguna", () => {
    expect(problemasDeRelaciones(G.terminos)).toEqual([]);
    const c = cifrasDeForma(G);
    expect(c.con_relaciones / c.terminos, "Un término nuevo dice con cuál se relaciona").toBeGreaterThanOrEqual(0.8);
  });

  it("toda definición tiene la forma «un/una X que Y», salvo las excepciones, que solo bajan", () => {
    expect(G.terminos.filter((t) => faltaDeForma(t) && !EXCEPCIONES_FORMA.includes(t.termino)).map((t) => `${t.termino}: ${faltaDeForma(t)}`)).toEqual([]);
    // La partida de las excepciones de forma (10 oct 2026): ninguna. NO se edita para añadir.
    const PARTIDA_FORMA = [];
    expect(EXCEPCIONES_FORMA.filter((x) => !PARTIDA_FORMA.includes(x)), "La lista de excepciones de forma no crece: reescribe la definición").toEqual([]);
    for (const x of EXCEPCIONES_FORMA) expect(faltaDeForma(G.terminos.find((t) => t.termino === x)), `${x} ya cumple: quítalo de EXCEPCIONES_FORMA`).not.toBeNull();
  });
});

describe("autotest de relaciones y forma", () => {
  const conTermino = (nombre, cambio) => { const g = copia(); cambio(g.terminos.find((t) => t.termino === nombre), g); return problemasDeGlosario(g, { existe, leer }); };

  it("una referencia a un término que no existe, a sí mismo o a un retirado", () => {
    expect(conTermino("revisor", (t) => { t.amplio = "inventado"; }).join()).toMatch(/amplio «inventado», que no es un término activo/);
    expect(conTermino("fallo", (t) => { t.relacionado = ["fallo"]; }).join()).toMatch(/relacionado apunta a sí mismo/);
    expect(conTermino("fallo", (t, g) => { Object.assign(g.terminos.find((x) => x.termino === "hallazgo"), { estado: "retirado", pasa_a: "defecto" }); }).join()).toMatch(/«hallazgo», que no es un término activo/);
    expect(conTermino("fallo", (t) => { Object.assign(t, { estado: "retirado", pasa_a: "caso" }); }).join()).toMatch(/fallo: un retirado no lleva relaciones/);
  });

  it("amplio sin su estrecho, estrecho sin su amplio, y relacionado no recíproco", () => {
    expect(conTermino("ensayar", (t, g) => { g.terminos.find((x) => x.termino === "probar").estrecho = undefined; delete g.terminos.find((x) => x.termino === "probar").estrecho; }).join()).toMatch(/ensayar: amplio «probar», pero probar no lo tiene en estrecho/);
    expect(conTermino("hook", (t) => { t.estrecho = ["guardia", "test"]; }).join()).toMatch(/hook: estrecho «test», pero el amplio de test no es hook/);
    expect(conTermino("podar", (t) => { t.relacionado = ["retirar", "aplicar"]; }).join()).toMatch(/podar: relacionado con «aplicar», pero aplicar no lo tiene/);
  });

  it("amplio de otra clase, un ciclo, y el mismo término como amplio y relacionado", () => {
    expect(conTermino("caso", (t, g) => { t.amplio = "fallo"; g.terminos.find((x) => x.termino === "fallo").estrecho = ["caso"]; }).join()).toMatch(/caso: amplio «fallo» es de clase estado/);
    expect(conTermino("comprobar", (t) => { t.amplio = "verificar"; }).join()).toMatch(/ciclo en amplio/);
    expect(conTermino("revisor", (t, g) => { t.relacionado = ["juez"]; g.terminos.find((x) => x.termino === "juez").relacionado.push("revisor"); }).join()).toMatch(/«juez» es amplio o estrecho y también relacionado/);
    expect(conTermino("revisor", (t) => { t.amplio = ["juez"]; }).join()).toMatch(/amplio es un término, no una lista/);
  });

  it("la forma: sin artículo + sustantivo, sin «que», infinitivo solo en acciones", () => {
    expect(faltaDeForma({ clase: "artefacto", definicion: "Algo que pasa." })).toMatch(/artículo \+ sustantivo/);
    expect(faltaDeForma({ clase: "artefacto", definicion: "Lo que pasa." })).toMatch(/artículo \+ sustantivo/);
    expect(faltaDeForma({ clase: "artefacto", definicion: "Un fichero con su test." })).toMatch(/«que …»/);
    expect(faltaDeForma({ clase: "artefacto", definicion: "Un fichero ¿qué? con aunque." })).toMatch(/«que …»/);
    expect(faltaDeForma({ clase: "artefacto", definicion: "Un fichero que vitest ejecuta." })).toBeNull();
    expect(faltaDeForma({ clase: "accion", definicion: "Ejecutar algo que se quiere ver." })).toBeNull();
    expect(faltaDeForma({ clase: "rol", definicion: "Ejecutar algo que se quiere ver." })).toMatch(/artículo/);
    expect(conTermino("zona", (t) => { t.definicion = "Conjunto de ficheros por sus rutas, sin más."; }).join()).toMatch(/zona: la definición no empieza por artículo/);
  });

  it("con amplio, el género de la definición es ese amplio", () => {
    expect(faltaDeForma({ clase: "rol", amplio: "juez", definicion: "El juez que busca fallos." })).toBeNull();
    expect(faltaDeForma({ clase: "rol", amplio: "juez", definicion: "Un agente que busca fallos." })).toMatch(/no empieza por su amplio «juez»|no empieza por su amplio \(«juez»\)/);
    expect(faltaDeForma({ clase: "accion", amplio: "probar", definicion: "Probar algo que no deja efecto." })).toBeNull();
    expect(faltaDeForma({ clase: "accion", amplio: "probar", definicion: "Ejecutar algo que no deja efecto." })).toMatch(/su amplio/);
    expect(faltaDeForma({ clase: "campo", amplio: "causa", definicion: "La causa que explica por qué." })).toBeNull();
    expect(conTermino("revisor", (t) => { t.definicion = "Un agente que busca fallos reales en un diff."; }).join()).toMatch(/revisor: la definición no empieza por su amplio/);
  });
});

describe("autotest de las redefiniciones del glosario", () => {
  const conDef = (termino, definicion) => { const g = copia(); g.terminos.find((t) => t.termino === termino).definicion = definicion; return g; };
  const redef = { termino: "zona", desde: "2026-10-10", motivo: "Se precisa qué cuenta como zona" };

  it("cambiar una definición sin registrarla falla; registrada, pasa; una vieja no vale", () => {
    const g = conDef("zona", "El conjunto de rutas que mira un control del glosario.");
    expect(redefinicionesDelGlosario(g, G, { redefiniciones: [] }, null).join()).toMatch(/zona: su definición ha cambiado respecto a la referencia sin una redefinición/);
    expect(redefinicionesDelGlosario(g, G, { redefiniciones: [redef] }, null)).toEqual([]);
    expect(redefinicionesDelGlosario(g, G, { redefiniciones: [redef] }, { redefiniciones: [redef] }).join()).toMatch(/zona: su definición ha cambiado/);
    expect(redefinicionesDelGlosario(G, G, { redefiniciones: [] }, null)).toEqual([]);
  });

  it("solo cambiar espacios o mayúsculas no es redefinir; registrar un término que no existe, sí falla", () => {
    const z = G.terminos.find((t) => t.termino === "zona").definicion;
    expect(redefinicionesDelGlosario(conDef("zona", `  ${z.toUpperCase()} `), G, { redefiniciones: [] }, null)).toEqual([]);
    expect(redefinicionesDelGlosario(G, G, { redefiniciones: [{ ...redef, termino: "inventado" }] }, null).join()).toMatch(/redefinición de un término que no existe/);
  });
});

describe("autotest del ciclo de vida", () => {
  const conTermino = (cambio) => { const g = copia(); cambio(g.terminos.find((t) => t.termino === "fallo"), g); return problemasDeGlosario(g, { existe, leer }); };

  it("un estado fuera del vocabulario, un retirado sin pasa_a o con pasa_a muerto, y pasa_a en un activo", () => {
    expect(conTermino((t) => { t.estado = "obsoleto"; }).join()).toMatch(/estado «obsoleto» fuera del vocabulario/);
    expect(conTermino((t) => { t.estado = "retirado"; }).join()).toMatch(/retirado sin pasa_a/);
    expect(conTermino((t) => { t.estado = "retirado"; t.pasa_a = "inventado"; }).join()).toMatch(/pasa_a «inventado», que no es un término activo/);
    expect(conTermino((t) => { t.pasa_a = "caso"; }).join()).toMatch(/pasa_a solo va en un término retirado/);
  });

  it("borrar un término falla; retirarlo con pasa_a no", () => {
    const g = copia();
    g.terminos = g.terminos.filter((t) => t.termino !== "fallo");
    expect(problemasDeVidaGlosario(g, G).join()).toMatch(/fallo: estaba en el glosario y ha desaparecido/);
    expect(problemasDeVidaGlosario(g, TERMINOS_FIJADOS).join()).toMatch(/fallo: estaba en el glosario/);
    const r = copia();
    Object.assign(r.terminos.find((t) => t.termino === "zona"), { estado: "retirado", pasa_a: "regla" });
    expect(problemasDeVidaGlosario(r, G)).toEqual([]);
    expect(problemasDeGlosario(r, { existe, leer }).filter((x) => /pasa_a|estado/.test(x))).toEqual([]);
  });

  it("un retirado que vuelve a activo (reutilizar el nombre) falla", () => {
    const ref = copia();
    Object.assign(ref.terminos.find((t) => t.termino === "fallo"), { estado: "retirado", pasa_a: "caso" });
    expect(problemasDeVidaGlosario(G, ref).join()).toMatch(/fallo: estaba retirado y vuelve a activo/);
  });

  it("el nombre de un retirado cuenta como sinónimo prohibido de su pasa_a", () => {
    const g = copia();
    Object.assign(g.terminos.find((t) => t.termino === "hallazgo"), { estado: "retirado", pasa_a: "defecto" });
    expect(canonicoDe(g).get("hallazgo")).toBe("defecto");
    const { detalle } = medir(RAIZ, g, { leer: () => "Un hallazgo del juez.\n", ficheros: (p) => (p === ".claude/skills/**/*.md" ? [".claude/skills/x/SKILL.md"] : []) });
    expect(detalle.map((d) => `${d.sinonimo}→${d.canonico}`)).toEqual(["hallazgo→defecto"]);
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
    expect(plano("una causa  raíz").match(patronDe("causa raíz"))).toHaveLength(1);
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

  it("el trinquete es por par: subir un par compensando otro falla, y un par nuevo también", () => {
    const partida = { "a: bug": 2, "b: runbook": 2 };
    expect(sobrePartida({ a: { bug: 2 }, b: { runbook: 1 } }, partida)).toEqual([]);
    expect(sobrePartida({ a: { bug: 3 }, b: { runbook: 1 } }, partida)).toEqual(["a: bug: 3 sobre 2 de partida"]);
    expect(sobrePartida({ a: { bug: 1, worktree: 1 } }, partida)).toEqual(["a: worktree: no está en la partida"]);
  });

  it("sin tildes: «leccion» y «LECCIÓN» cuentan como «lección»", () => {
    expect(plano("Lección")).toBe("leccion");
    const { detalle } = medirTexto(".claude/skills/x/SKILL.md", "Una leccion y una LECCIÓN.\n");
    expect(detalle.map((d) => d.sinonimo)).toEqual(["lección", "lección"]);
  });

  it("una palabra con «/» solo se ignora si parece ruta", () => {
    const { detalle } = medirTexto(".claude/skills/x/SKILL.md", "Un bug/fallo; ver a/b/bug y bug.md/x y ./bug y ~/bug\n");
    expect(detalle.map((d) => d.sinonimo)).toEqual(["bug"]);
  });

  it("un bloque sangrado con 4 espacios es código, pero la continuación de una lista no", () => {
    const md = ["Texto.", "", "    git worktree list", "    un bug", "", "Fuera.", "- punto", "", "    sigue el punto con un bug"].join("\n");
    const { detalle } = medirTexto(".claude/skills/x/SKILL.md", md);
    expect(detalle.map((d) => `${d.sinonimo}@${d.donde}`)).toEqual(["bug@9"]);
  });

  it("una excepción admite su cifra y ni una más", () => {
    expect(comparar({ a: { bug: 2 } }, { a: { bug: 2 } })).toEqual({ nuevas: [], bajadas: [] });
    expect(comparar({ a: { bug: 3 } }, { a: { bug: 2 } }).nuevas).toHaveLength(1);
    expect(comparar({ a: { bug: 1 } }, { a: { bug: 2 } }).bajadas).toHaveLength(1);
    expect(comparar({}, { a: { bug: 2 } }).bajadas).toHaveLength(1);
  });
});

// ── Revisión periódica: candidatos a término (#481) ─────────────────────────

describe("candidatos a término y sus juicios", () => {
  it("los juicios de ops/glosario-candidatos.json están bien formados", () => {
    expect(problemasDeJuicios(leerJuicios(RAIZ), G)).toEqual([]);
  });

  it("sobre el repo: salen candidatos con su cifra y la lista para juzgar respeta el tope", () => {
    const todos = candidatos(prosaDeZonas(RAIZ, G), G, { juicios: leerJuicios(RAIZ) });
    const lista = aJuzgar(todos);
    for (const tipo of ["palabra", "par"]) expect(lista.filter((c) => c.tipo === tipo).length).toBeLessThanOrEqual(MAX_CANDIDATOS[tipo]);
    for (const c of lista) expect(lineaCandidato(c)).toMatch(/^candidato: [a-z ]+ apariciones: \d+ ficheros: \d+$/);
  });
});

describe("autotest de los candidatos", () => {
  // Siete ficheros de mentira en cinco zonas: lo que sale en todos pasa un umbral de prueba.
  const UMB = { palabra: { apariciones: 5, ficheros: 5, zonas: 3 }, par: { apariciones: 5, ficheros: 5, zonas: 3 } };
  const trozos = (texto) => ["a", "b", "c", "d", "e", "f", "g"].map((x, i) => ({ ruta: `${x}.md`, zona: `z${i % 5}`, texto }));

  it("cuenta una palabra repetida que no está en el glosario, y no la que ya está (también en plural)", () => {
    const r = candidatos(trozos("La ventana de observación y los casos y los juzgados."), G, { umbral: UMB });
    expect(r.map((c) => c.candidato)).toContain("ventana");
    expect(r.map((c) => c.candidato)).not.toContain("casos");
    expect(r.find((c) => c.candidato === "ventana")).toMatchObject({ apariciones: 7, ficheros: 7, zonas: 5, tipo: "palabra" });
  });

  it("los falsos parientes de una palabra del glosario sí cuentan; su familia, no", () => {
    const r = candidatos(trozos("principio constante normalización información guardar contrato normativa; comprueba fondos revisores guardias"), G, { umbral: UMB }).map((c) => c.candidato);
    for (const w of ["principio", "constante", "normalizacion", "informacion", "guardar", "contrato", "normativa"]) expect(r, w).toContain(w);
    for (const w of ["comprueba", "fondos", "revisores", "guardias"]) expect(r, w).not.toContain(w);
  });

  it("no cuenta palabras vacías, ni lo que va en código o entre «»", () => {
    const md = prosaDeMarkdown("Cuando sigue `ventana` y «ventana» y\n```\nventana\n```\n");
    const r = candidatos(trozos(md), G, { umbral: UMB });
    expect(r.map((c) => c.candidato)).toEqual([]);
  });

  it("junta singular y plural, y cuenta los pares «a b» y «a de b»", () => {
    const r = candidatos(trozos("Una ventana, dos ventanas. El texto libre. La lista de tareas."), G, { umbral: UMB });
    expect(r.find((c) => c.candidato === "ventana").apariciones).toBe(14);
    expect(r.map((c) => c.candidato)).not.toContain("ventanas");
    expect(r.filter((c) => c.tipo === "par").map((c) => c.candidato).sort()).toEqual(["lista de tareas", "texto libre"]);
  });

  it("no pasa el umbral lo que está en pocos ficheros o pocas zonas", () => {
    const pocas = ["a", "b", "c", "d", "e", "f", "g"].map((x) => ({ ruta: `${x}.md`, zona: "z0", texto: "ventana ventana" }));
    expect(candidatos(pocas, G, { umbral: UMB })).toEqual([]);
  });

  it("lo juzgado deja de salir; el mismo juicio y motivo tres veces es una regla propuesta", () => {
    const j = (candidato, juicio = "nada", motivo = "uso_general") => ({ candidato, juicio, motivo, detalle: `${candidato}: se usa en su sentido de diccionario`, fecha: "2026-10-10" });
    expect(candidatos(trozos("Una ventana."), G, { umbral: UMB, juicios: [j("ventana")] })).toEqual([]);
    const { reglas, sinTermino } = pendientesDeJuicios([j("lista"), j("linea"), j("texto"), j("codigo", "nada", "jerga_de_servicio"), j("pieza", "termino_nuevo", "significado_propio")], G);
    expect(reglas).toEqual([{ juicio_y_motivo: "nada: uso_general", candidatos: ["lista", "linea", "texto"] }]);
    expect(sinTermino).toEqual(["pieza"]);
  });

  it("los juicios: vocabulario, motivo cerrado de su juicio, detalle, fecha y sinonimo_de que existe", () => {
    expect(Object.keys(JUICIOS)).toEqual(["termino_nuevo", "sinonimo", "nada"]);
    expect(Object.keys(MOTIVOS_JUICIO)).toEqual(Object.keys(JUICIOS));
    expect(Object.keys(MOTIVOS_JUICIO.nada)).toEqual(["uso_general", "nombre_propio", "jerga_de_servicio", "gramatical"]);
    const base = { candidato: "ventana", juicio: "nada", motivo: "uso_general", detalle: "Se usa en su sentido de diccionario", fecha: "2026-10-10" };
    const p = (x) => problemasDeJuicios([{ ...base, ...x }], G).join();
    expect(p({})).toBe("");
    expect(p({ juicio: "quizas" })).toMatch(/juicio «quizas» fuera del vocabulario/);
    expect(p({ motivo: "Palabra de uso general" })).toMatch(/motivo «Palabra de uso general» fuera del vocabulario de nada/);
    expect(p({ motivo: "nombre_largo" })).toMatch(/fuera del vocabulario de nada/);
    expect(p({ detalle: "corto" })).toMatch(/15 caracteres/);
    expect(p({ fecha: "ayer" })).toMatch(/AAAA-MM-DD/);
    expect(p({ juicio: "sinonimo", motivo: "nombre_largo", sinonimo_de: "inventado" })).toMatch(/sinonimo_de «inventado»/);
    expect(p({ juicio: "sinonimo", motivo: "nombre_largo", sinonimo_de: "fondo" })).toBe("");
    expect(p({ sinonimo_de: "fondo" })).toMatch(/solo va con el juicio sinonimo/);
    expect(problemasDeJuicios([base, { ...base, candidato: "VENTANA" }], G).join()).toMatch(/juzgado dos veces/);
  });
});
