import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALCANCES, ANTE_FALLO, CONTROL_TIPOS, EJECUTORES, EJECUTORES_DEL_SISTEMA, RIESGOS, RUTA_MD,
  comprobarNormasPr, contarFrases, esVigilado, ficherosNormativos, generarMd, leerRegistro, lineaNormas, lineasAnadidas, llamadasDeAviso, medirFrases,
  problemasDeAvisos, problemasDeConjunto, problemasDeDureza, problemasDeForma, problemasDeRegistro, recuento, CIFRAS_FONDO, medirFondo,
} from "../scripts/lib/normas.mjs";
import { VEREDICTOS } from "../scripts/lib/escalas.mjs";
import { CONSULTA_CON_MOTIVO, MEDIDORES, evaluarCriterio } from "../scripts/lib/planos.mjs";
import { CONSULTA } from "../scripts/lib/issues.mjs";
import { AVISOS, AVISO_POR_CREDENCIAL, PARTES, textoDeAviso } from "../.claude/hooks/avisos-guardia.mjs";

/**
 * El registro de normas (#296, por campos desde #494). Falla si una norma no pasa la plantilla de
 * regla, si una que se dice dura no lo es, si una de riesgo alto no es dura y nadie la lleva en un
 * issue, si un código que falla cerrado no tiene el test que inyecta el fallo, si un aviso de la
 * guardia no tiene código de una norma que existe, si `control_tipo` se sale de su vocabulario y
 * si docs/ops/NORMAS.md no sale del registro.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registro = leerRegistro(RAIZ);
const planos = JSON.parse(readFileSync(join(RAIZ, "ops/planos.json"), "utf8"));
const ctx = { raiz: RAIZ, planos };
const fuenteGuardia = readFileSync(join(RAIZ, ".claude/hooks/guardia.mjs"), "utf8");
const ADMITIDAS = ["AVISO_POR_CREDENCIAL[cred]"];

// Una norma dura de ejemplo que cumple todo; los casos de abajo la estropean de una en una.
const DURA = {
  id: "ejemplo", nombre: "Tope de ejemplo", sujeto: "endpoint", fuerza: "debe", exigencia: "aplicar un tope diario",
  donde: ["CLAUDE.md"], ejecutor: "codigo_en_ejecucion", alcance: "todos", ante_fallo: "cerrado",
  control: "api/_guard.test.js", control_tipo: "test", test_fallo: { ruta: "api/_guard.test.js", caso: "sin_redis" }, veredicto: "dura", riesgo: "alto", issue: null,
};

describe("vocabulario de normas", () => {
  it("cada valor tiene su definición y los ejecutores del sistema son ejecutores", () => {
    for (const v of [EJECUTORES, ALCANCES, ANTE_FALLO, VEREDICTOS, RIESGOS]) for (const d of Object.values(v)) expect(d.length).toBeGreaterThan(10);
    for (const e of EJECUTORES_DEL_SISTEMA) expect(Object.keys(EJECUTORES)).toContain(e);
    for (const t of Object.values(CONTROL_TIPOS)) expect(t.que.length).toBeGreaterThan(10);
  });
});

describe("ops/normas.json", () => {
  it("cada norma pasa la plantilla de regla, tiene su forma y su vocabulario, y los ids no se repiten", () => {
    expect(problemasDeRegistro(registro)).toEqual([]);
  });

  it("control_tipo está en su vocabulario y cuenta lo mismo que control", () => {
    expect(registro.normas.filter((n) => !(n.control_tipo in CONTROL_TIPOS)).map((n) => n.id)).toEqual([]);
    for (const n of registro.normas) {
      expect(n.control === "juicio", n.id).toBe(n.control_tipo === "juicio");
      if (n.control_tipo === "planos") expect(n.control, n.id).toBe("ops/planos.json");
    }
  });

  it("ninguna norma conserva el campo «texto» de antes", () => {
    expect(registro.normas.filter((n) => "texto" in n || "test" in n).map((n) => n.id)).toEqual([]);
  });

  it("lo que se nombra en «donde» existe (salvo el CLAUDE.md de usuario, que vive fuera)", () => {
    const faltan = registro.normas.flatMap((n) => n.donde.filter((d) => d !== "CLAUDE.md de usuario" && !existsSync(join(RAIZ, d))).map((d) => `${n.id}: ${d}`));
    expect(faltan).toEqual([]);
  });

  it("ninguna norma se dice más dura de lo que es", () => {
    const aviso = "O se arregla lo que falta (ejecutor, alcance, test, issue) o se baja el veredicto en ops/normas.json: una norma dura sin ejecutor es texto.";
    expect(registro.normas.flatMap((n) => problemasDeDureza(n, ctx)), aviso).toEqual([]);
  });

  it("un mismo hecho de GitHub no sostiene dos normas (dos veredictos para lo mismo)", () => {
    expect(problemasDeConjunto(registro.normas)).toEqual([]);
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
    const diff = ["--- a/CLAUDE.md", "+++ b/CLAUDE.md", "@@ -1,0 +5,2 @@", "+a", "+b", "--- a/ops/PLANOS.md", "+++ /dev/null", "@@ -1 +0,0 @@", "-c"].join("\n");
    expect(lineasAnadidas(diff)).toEqual([{ ruta: "CLAUDE.md", linea: 5, texto: "a" }, { ruta: "CLAUDE.md", linea: 6, texto: "b" }]);
    expect(lineaNormas("**Normas:** sin novedades — x y z")).toEqual({ presente: true, motivo: "x y z" });
  });

  it("una línea añadida que empieza por «++ » no se toma por la cabecera de otro fichero", () => {
    // En el diff sale «+++ …»; solo es cabecera justo después de «--- ».
    const diff = ["--- a/CLAUDE.md", "+++ b/CLAUDE.md", "@@ -1,0 +1,2 @@", "+++ Nunca se fusiona a main.", "+b"].join("\n");
    expect(lineasAnadidas(diff)).toEqual([{ ruta: "CLAUDE.md", linea: 1, texto: "++ Nunca se fusiona a main." }, { ruta: "CLAUDE.md", linea: 2, texto: "b" }]);
    expect(comprobarNormasPr({ diff, ids }).ok).toBe(false);
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

  it("la consulta de issues de planos pide stateReason (si issues.mjs cambia, el replace no puede fallar en silencio)", () => {
    expect(CONSULTA_CON_MOTIVO).not.toBe(CONSULTA);
    expect(CONSULTA_CON_MOTIVO).toMatch(/\bstateReason\b/);
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
    expect(problemas({ control: "juicio", control_tipo: "juicio" }).join()).toMatch(/no es una prueba/);
    expect(problemas({ control: "scripts/lib/normas.mjs", control_tipo: "script" }).join()).toMatch(/no es una prueba/);
    expect(problemas({ control: "no/existe.test.js" }).join()).toMatch(/no existe/);
  });

  it("un test de planos vale si ops/planos.json tiene esa regla, y no si no", () => {
    const dePlanos = { ejecutor: "github_regla", control: "ops/planos.json", control_tipo: "planos", test_fallo: undefined };
    expect(problemas({ ...dePlanos, criterio_planos: "check_obligatorio:staging" })).toEqual([]);
    expect(problemas({ ...dePlanos, criterio_planos: "inventada" }).join()).toMatch(/no existe/);
  });

  it("dos normas con la misma comprobación de planos son el mismo hecho; con un fichero de test, no", () => {
    const a = { ...DURA, id: "a", control: "ops/planos.json", control_tipo: "planos", criterio_planos: "check_obligatorio:staging" };
    expect(problemasDeConjunto([a, { ...a, id: "b", veredicto: "semidura" }]).join()).toMatch(/a, b: el mismo hecho/);
    expect(problemasDeConjunto([a, { ...a, id: "b", criterio_planos: "check_obligatorio:main" }])).toEqual([]);
    expect(problemasDeConjunto([{ ...DURA, id: "a" }, { ...DURA, id: "b" }])).toEqual([]);
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

describe("la plantilla de regla en cada norma (#494)", () => {
  const sujetos = registro.sujetos;
  const problemas = (cambios) => problemasDeForma({ ...DURA, ...cambios }, sujetos);

  it("la norma de ejemplo pasa", () => expect(problemas({})).toEqual([]));

  it.each([
    ["una norma con «texto» libre", { texto: "Las evals no pasan de 75 €" }, /«texto» ya no existe/],
    ["un nombre de una palabra", { nombre: "Tope" }, /de 2 a 5 palabras/],
    ["un nombre con punto final", { nombre: "Tope de ejemplo." }, /sin punto final/],
    ["un sujeto fuera del vocabulario", { sujeto: "inventado" }, /sujeto «inventado»/],
    ["una fuerza fuera del vocabulario", { fuerza: "tal vez" }, /fuerza «tal vez»/],
    ["una exigencia con punto final", { exigencia: "aplicar un tope diario." }, /sin punto final/],
    ["una exigencia que no empieza por un verbo en infinitivo", { exigencia: "tope diario de la IA" }, /infinitivo/],
    ["una exigencia de más de 160 caracteres", { exigencia: `aplicar ${"un tope diario ".repeat(12)}` }, /pasa de 160/],
    ["una condición que no empieza por cuando o si", { condicion: "al usar la IA de pago" }, /«condicion»/],
    ["una nota de una palabra", { nota: "corta" }, /«nota»/],
    ["un control_tipo fuera de su vocabulario", { control_tipo: "magia" }, /control_tipo «magia»/],
    ["un control «juicio» con otro tipo", { control: "juicio" }, /pide control_tipo «juicio»/],
    ["un tipo «juicio» con una ruta", { control_tipo: "juicio" }, /pide control «juicio»/],
    ["un tipo «test» que no es un test", { control: "scripts/lib/normas.mjs" }, /pide un fichero \*\.test\.js/],
    ["un tipo «planos» sin su criterio", { control: "ops/planos.json", control_tipo: "planos" }, /lleva «criterio_planos»/],
    ["un criterio de planos sin ser de planos", { criterio_planos: "check_obligatorio:main" }, /solo con control_tipo «planos»/],
    ["un campo desconocido", { texto_viejo: "x" }, /campo desconocido/],
  ])("falla con %s", (_, cambios, trozo) => expect(problemas(cambios).join("\n")).toMatch(trozo));

  it("un sujeto que ninguna norma usa falla: no se infla la lista", () => {
    const r = structuredClone(registro);
    r.sujetos.sobra = { legible: "algo que nadie usa", aplica_a: ["norma"] };
    expect(problemasDeRegistro(r).join("\n")).toMatch(/«sobra» no lo usa ninguna norma/);
  });

  it("el catálogo de recetas y alimentos está dado de alta con sujetos propios", () => {
    const de = (s) => registro.normas.filter((n) => n.sujeto === s || n.sujeto.startsWith(`${s}.`)).length;
    expect(de("receta")).toBeGreaterThan(3);
    expect(de("alimento")).toBeGreaterThan(2);
    expect(registro.normas.map((n) => n.id)).toContain("solo-estrella-se-propone");
  });
});

describe("los avisos de la guardia (#494)", () => {
  it("cada aviso tiene el código de una norma que existe y sus partes fijas", () => {
    expect(problemasDeAvisos(AVISOS, registro.normas, AVISO_POR_CREDENCIAL)).toEqual([]);
  });

  it("cada deny( y ask( de guardia.mjs nombra un aviso que existe, y no hay mensajes escritos a mano", () => {
    const { literales, otras } = llamadasDeAviso(fuenteGuardia, { admitidas: ADMITIDAS });
    expect(literales.length).toBeGreaterThan(30);
    expect(otras, "Un aviso nuevo se da de alta en .claude/hooks/avisos-guardia.mjs, con el código de su norma").toEqual([]);
    expect(literales.filter((id) => !(id in AVISOS))).toEqual([]);
  });

  it("todo aviso se usa: ninguno queda sin llamada en la guardia", () => {
    const { literales } = llamadasDeAviso(fuenteGuardia, { admitidas: ADMITIDAS });
    const usados = new Set([...literales, ...Object.values(AVISO_POR_CREDENCIAL)]);
    expect(Object.keys(AVISOS).filter((id) => !usados.has(id))).toEqual([]);
  });

  it("el mensaje sale con las cuatro partes en su orden, y la norma al final", () => {
    const t = textoDeAviso("push-a-main");
    expect(t.indexOf("Por qué: ")).toBeGreaterThan(0);
    expect(t.indexOf("En su lugar: ")).toBeGreaterThan(t.indexOf("Por qué: "));
    expect(t.indexOf("Pídeselo a: ")).toBeGreaterThan(t.indexOf("En su lugar: "));
    expect(t).toMatch(/\(norma: main-solo-pablo\)$/);
    expect(textoDeAviso("stash")).not.toContain("Pídeselo a");
    for (const id of Object.keys(AVISOS)) expect(textoDeAviso(id, {}), id).toMatch(/Por qué: .+ En su lugar: .+\(norma: [a-z-]+\)$/);
    expect(PARTES).toEqual(["que", "porque", "enSuLugar", "quien"]);
  });

  describe("se ven fallar", () => {
    const normas = registro.normas;
    const aviso = { codigo: "main-solo-pablo", que: "Subir a main desde una sesión", porque: "main es producción", enSuLugar: "abre un PR a staging" };

    it("un aviso sin código", () => {
      const { codigo: _quitado, ...sin } = aviso;
      expect(problemasDeAvisos({ "push-a-main": sin }, normas).join()).toMatch(/sin «codigo»/);
    });
    it("un aviso con un código que no es una norma", () => {
      expect(problemasDeAvisos({ "push-a-main": { ...aviso, codigo: "norma-inventada" } }, normas).join()).toMatch(/no es una norma/);
    });
    it("un aviso al que le falta una parte, con punto final o con un campo de más", () => {
      expect(problemasDeAvisos({ a: { ...aviso, porque: "" } }, normas).join()).toMatch(/falta «porque»/);
      expect(problemasDeAvisos({ a: { ...aviso, enSuLugar: "abre un PR a staging." } }, normas).join()).toMatch(/sin punto final/);
      expect(problemasDeAvisos({ a: { ...aviso, extra: "x" } }, normas).join()).toMatch(/campo desconocido/);
    });
    it("una familia de credenciales que apunta a un aviso inexistente", () => {
      expect(problemasDeAvisos({ a: aviso }, normas, { token: "no-existe" }).join()).toMatch(/no existe/);
    });
    it("un deny escrito a mano o con un aviso sin dar de alta", () => {
      expect(llamadasDeAviso('return deny("Esto no se hace.");').otras).toHaveLength(1);
      expect(llamadasDeAviso("return ask(motivo);").otras).toHaveLength(1);
      expect(llamadasDeAviso('return deny("push-a-main"); return ask("otro-aviso");').literales).toEqual(["push-a-main", "otro-aviso"]);
      expect(llamadasDeAviso("return deny(AVISO_POR_CREDENCIAL[cred]);", { admitidas: ADMITIDAS }).otras).toEqual([]);
    });
  });
});

describe("docs/ops/NORMAS.md sale del registro", () => {
  it("está al día", () => {
    const md = readFileSync(join(RAIZ, RUTA_MD), "utf8");
    expect(md, "NORMAS.md se genera: edita ops/normas.json o los avisos y lanza `npm run normas -- --escribir`").toBe(generarMd(registro, AVISOS));
  });

  it("lleva una fila por norma, con el aviso de la guardia que la cita", () => {
    const md = generarMd(registro, AVISOS);
    for (const n of registro.normas) expect(md, n.id).toContain(`| \`${n.id}\` |`);
    expect(md).toMatch(/\| `main-solo-pablo` \| main \| DEBE \|.*`push-a-main`/);
  });

  it("un cambio en un aviso o en una norma lo descuadra", () => {
    const otro = structuredClone(registro);
    otro.normas[0].nombre = "Otro nombre distinto";
    expect(generarMd(otro, AVISOS)).not.toBe(generarMd(registro, AVISOS));
    expect(generarMd(registro, { ...AVISOS, "push-a-main": { ...AVISOS["push-a-main"], codigo: "sin-git-stash" } })).not.toBe(generarMd(registro, AVISOS));
  });
});
