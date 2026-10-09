import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ALCANCES_FALLO, DIAGNOSTICAN } from "../scripts/lib/flujo.mjs";
import { GRUPOS } from "../scripts/lib/issues.mjs";
import {
  ALCANCES, CATALOGO, CAUSAS, JUECES, RANGOS, TOPE_RONDAS, celdas, generarTabla, pipelineSugerido, presupuestoDe, problemas, textoDe,
} from "../scripts/lib/presupuestos.mjs";

/**
 * El catálogo de presupuestos (#339, fase D de #334) no se puede quedar en
 * prosa ni quedar a medias. Este test vigila:
 *
 *  1. que ops/presupuestos.json tenga la forma y el vocabulario cerrado;
 *  2. que CADA celda alcance × tipo de causa salga con un presupuesto, en rango
 *     y con jueces del vocabulario (celda a celda, no «en general»);
 *  3. que /orquestar lea el catálogo y no lleve sus números escritos;
 *  4. que el comando `npm run presupuesto` rechace lo que no conoce.
 *
 * Y, abajo, un autotest: cada regla falla con datos malos. Sin tiempo ni red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leerTexto = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const reglas = (lista) => [...new Set(lista.map((x) => x.split(":")[0]))].sort();

describe("el catálogo: forma y vocabulario", () => {
  it("no tiene ningún problema", () => {
    expect(problemas(CATALOGO), "Corrige ops/presupuestos.json y vuelve a lanzar").toEqual([]);
  });

  it("alcances y causas vienen de sus fuentes, no se copian", () => {
    expect(ALCANCES).toEqual(Object.keys(ALCANCES_FALLO));
    expect(CAUSAS).toEqual(Object.keys(GRUPOS.causa.valores));
    expect(Object.keys(CATALOGO.por_alcance)).toEqual(ALCANCES);
    for (const c of Object.keys(CATALOGO.por_causa)) expect(CAUSAS, `por_causa nombra «${c}»`).toContain(c);
    for (const b of Object.values(CATALOGO.por_alcance)) expect(Object.keys(DIAGNOSTICAN)).toContain(b.diagnostica);
  });

  it("los jueces del vocabulario son exactamente los agentes con «Tipo: juez»", () => {
    const dir = join(RAIZ, ".claude", "agents");
    const jueces = readdirSync(dir).filter((f) => f.endsWith(".md"))
      .filter((f) => /^Tipo:\s*juez\s*$/m.test(readFileSync(join(dir, f), "utf8")))
      .map((f) => f.replace(/\.md$/, ""));
    expect([...JUECES].sort(), "Si nace o se retira un juez, actualiza JUECES en scripts/lib/presupuestos.mjs").toEqual(jueces.sort());
  });

  it("el tope de rondas del catálogo es el duro: ninguna celda lo pasa", () => {
    expect(RANGOS.rondas_max[1]).toBe(TOPE_RONDAS);
    for (const { alcance, causa } of celdas()) expect(presupuestoDe(alcance, causa).rondas_max, `${alcance} × ${causa}`).toBeLessThanOrEqual(TOPE_RONDAS);
  });

  it("deja el hueco de recalibración y la fecha para la fase F (#340)", () => {
    expect(CATALOGO.recalibracion.fase).toBe("#340");
    expect(CATALOGO.recalibracion.como.length).toBeGreaterThan(40);
    // Mientras sean valores iniciales no hay fecha; al calibrar, hay fecha y valores_iniciales pasa a false.
    expect(CATALOGO.valores_iniciales === (CATALOGO.calibrado_el === null)).toBe(true);
  });
});

describe("cada celda alcance × tipo de causa tiene su presupuesto", () => {
  const todas = celdas();
  it("hay una celda por cada alcance y cada causa", () => {
    expect(todas).toHaveLength(ALCANCES.length * CAUSAS.length);
    expect(new Set(todas.map((c) => `${c.alcance}|${c.causa}`)).size).toBe(todas.length);
  });

  it.each(todas.map((c) => [`${c.alcance} × ${c.causa}`, c]))("%s", (_nombre, { alcance, causa }) => {
    const p = presupuestoDe(alcance, causa);
    expect(p, "la celda no sale con presupuesto").not.toBeNull();
    for (const [campo, [min, max]] of Object.entries(RANGOS)) {
      expect(Number.isInteger(p[campo]), campo).toBe(true);
      expect(p[campo], campo).toBeGreaterThanOrEqual(min);
      expect(p[campo], campo).toBeLessThanOrEqual(max);
    }
    expect(Object.keys(DIAGNOSTICAN)).toContain(p.diagnostica);
    for (const j of p.jueces_obligatorios) expect(JUECES).toContain(j);
    expect(p.jueces_min, "nunca menos jueces que los obligatorios").toBeGreaterThanOrEqual(p.jueces_obligatorios.length);
    expect(typeof p.reproducir_en_ci).toBe("boolean");
    expect(pipelineSugerido(p).length).toBeGreaterThan(4);
  });

  it("una combinación desconocida no tiene presupuesto (no se inventa)", () => {
    expect(presupuestoDe("galaxia", "codigo")).toBeNull();
    expect(presupuestoDe("local", "inventada")).toBeNull();
    expect(presupuestoDe("__proto__", "codigo")).toBeNull();
    expect(presupuestoDe(undefined, undefined)).toBeNull();
  });

  it("una causa sobrescribe al alcance: modelo-datos pide al auditor de datos, vigilante-* al revisor y entorno, el CI", () => {
    for (const alcance of ALCANCES) {
      expect(presupuestoDe(alcance, "modelo-datos").jueces_obligatorios).toEqual(["auditor-datos"]);
      expect(presupuestoDe(alcance, "vigilante-falso").jueces_obligatorios).toEqual(["revisor"]);
      expect(presupuestoDe(alcance, "vigilante-hueco").jueces_obligatorios).toEqual(["revisor"]);
      expect(presupuestoDe(alcance, "entorno").reproducir_en_ci).toBe(true);
      expect(presupuestoDe(alcance, "codigo").jueces_obligatorios).toEqual([]);
      expect(presupuestoDe(alcance, "codigo").reproducir_en_ci).toBe(false);
    }
  });

  it("un alcance mayor nunca recibe menos jueces, hipótesis ni tiempo que uno menor", () => {
    for (const causa of CAUSAS) {
      const [l, m, t] = ALCANCES.map((a) => presupuestoDe(a, causa));
      for (const c of ["hipotesis_en_paralelo_max", "jueces_min", "minutos_orientativos"]) {
        expect(m[c], `${causa} ${c}`).toBeGreaterThanOrEqual(l[c]);
        expect(t[c], `${causa} ${c}`).toBeGreaterThanOrEqual(m[c]);
      }
    }
  });

  it("la sobrescritura de una causa gana al alcance (con un catálogo de prueba)", () => {
    const c = structuredClone(CATALOGO);
    c.por_causa.codigo = { jueces_min: 3, minutos_orientativos: 200, jueces_obligatorios: ["seguridad"] };
    const p = presupuestoDe("local", "codigo", c);
    expect(p).toMatchObject({ jueces_min: 3, minutos_orientativos: 200, jueces_obligatorios: ["seguridad"] });
    expect(p.de_la_causa).toEqual(["jueces_min", "minutos_orientativos", "jueces_obligatorios"]);
    expect(problemas(c)).toEqual([]);
  });

  it("la salida del pipeline nombra al auditor, el CI y el issue de decisión cuando toca", () => {
    expect(textoDe(presupuestoDe("modulo", "modelo-datos"))).toContain("auditor-datos");
    expect(pipelineSugerido(presupuestoDe("local", "entorno")).join("\n")).toMatch(/CI/);
    expect(pipelineSugerido(presupuestoDe("local", "codigo")).join("\n")).not.toMatch(/CI/);
    expect(pipelineSugerido(presupuestoDe("transversal", "codigo")).join("\n")).toMatch(/paralelo/);
    expect(pipelineSugerido(presupuestoDe("local", "codigo")).join("\n")).toMatch(/decisión asignado a Pablo/);
  });
});

// ── /orquestar lee el catálogo y no lleva sus números ─────────────────────────

// El 1 solo se vigila en cifras: «uno», «un» y «una» son pronombres y artículos de cada frase.
const PALABRAS = {
  2: ["dos"], 3: ["tres"], 4: ["cuatro"], 5: ["cinco"], 10: ["diez"], 15: ["quince"], 20: ["veinte"],
  30: ["treinta"], 45: ["cuarenta y cinco"], 60: ["sesenta"], 90: ["noventa"], 120: ["ciento veinte"],
};

/** Los valores numéricos del catálogo (alcances y causas), sin repetir. */
function valoresNumericos(catalogo) {
  const v = new Set();
  for (const b of Object.values(catalogo.por_alcance)) for (const c of Object.keys(RANGOS)) v.add(b[c]);
  for (const s of Object.values(catalogo.por_causa)) for (const c of Object.keys(RANGOS)) if (c in s) v.add(s[c]);
  return [...v].sort((a, b) => a - b);
}

/** Los números del catálogo que aparecen sueltos en un texto, en cifras o en palabras. Un `#334` o `v2` no cuentan. */
function numerosSueltos(texto, valores) {
  const halladas = [];
  for (const m of texto.matchAll(/(?<![\w#./-])(\d+)(?![\w])/g)) if (valores.includes(Number(m[1]))) halladas.push(m[1]);
  for (const v of valores) for (const palabra of PALABRAS[v] ?? []) if (new RegExp(`(?<![\\p{L}\\p{N}_])${palabra}(?![\\p{L}\\p{N}_])`, "iu").test(texto)) halladas.push(palabra);
  return halladas;
}

/** La sección «Triaje» de /orquestar: entre su cabecera y la siguiente. */
function seccionTriaje(md) {
  const a = md.indexOf("## 0. Triaje");
  const b = md.indexOf("\n## ", a + 1);
  return a < 0 ? null : md.slice(a, b < 0 ? undefined : b);
}

describe("/orquestar: el triaje lee el catálogo y no lleva sus números", () => {
  const md = leerTexto(".claude/commands/orquestar.md");
  const triaje = seccionTriaje(md);

  it("tiene el triaje como primer paso, antes de dimensionar", () => {
    expect(triaje, "falta la sección «## 0. Triaje» en orquestar.md").not.toBeNull();
    expect(md.indexOf("## 0. Triaje")).toBeLessThan(md.indexOf("## 1. Dimensiona"));
  });

  it("nombra el comando, el script y el catálogo", () => {
    expect(triaje).toContain("npm run presupuesto");
    expect(triaje).toContain("scripts/presupuesto.mjs");
    expect(triaje).toContain("ops/presupuestos.json");
    expect(JSON.parse(leerTexto("package.json")).scripts.presupuesto).toBe("node scripts/presupuesto.mjs");
  });

  it("fija alcance y tipo con datos: MODULOS.json, casos parecidos, segunda vez", () => {
    expect(triaje).toContain("ops/MODULOS.json");
    expect(triaje).toContain("npm run issues");
    expect(triaje).toMatch(/segunda\s+vez/);
    for (const a of ALCANCES) expect(triaje, a).toContain(`\`${a}\``);
  });

  it("dice quién itera según el alcance y deja la skill causa-raiz «cuando exista»", () => {
    expect(triaje).toMatch(/agente del dominio/);
    expect(triaje).toMatch(/diagnosticadores en paralelo/);
    expect(triaje).toMatch(/causa-raiz`\s+cuando\s+exista/);
  });

  it("pide contar las rondas en la ficha del fondo y escalar con un issue de decisión", () => {
    expect(triaje).toContain("`rondas`");
    expect(triaje).toContain("rondas-excedidas");
    expect(triaje).toMatch(/tipo:decision/);
  });

  it("ningún número del catálogo aparece suelto en el triaje (ni en cifras ni en palabras)", () => {
    const valores = valoresNumericos(CATALOGO);
    expect(valores.length).toBeGreaterThan(3);
    expect(numerosSueltos(triaje, valores), "Quita el número de orquestar.md: sale de `npm run presupuesto`").toEqual([]);
  });

  it("todo valor numérico del catálogo tiene su forma en letras en PALABRAS (salvo el 1, que son artículos)", () => {
    for (const v of valoresNumericos(CATALOGO)) {
      if (v !== 1) expect(PALABRAS[v], `el valor ${v} del catálogo no tiene su forma en letras en PALABRAS: el test no vería «${v}» escrito con letras`).toBeDefined();
    }
    // Nota: el resto de secciones de orquestar.md no se escanean (el 1, el 2 y el 3 son la tabla de planos y las listas numeradas: falsos positivos).
  });

  it("el detector de números sueltos ve lo que debe y no se asusta de lo demás", () => {
    const v = [1, 2, 3, 15, 30, 60];
    expect(numerosSueltos("hasta 3 hipótesis", v)).toEqual(["3"]);
    expect(numerosSueltos("unos treinta minutos", v)).toEqual(["treinta"]);
    expect(numerosSueltos("dos rondas y 15 min", v)).toEqual(["15", "dos"]);
    expect(numerosSueltos("el plan #334, la fase C (#338), v2, ops/x1.json, ninguno, tres4", v)).toEqual([]);
    expect(numerosSueltos("una pasada y un juez", v)).toEqual([]);
  });
});

// ── El comando ────────────────────────────────────────────────────────────────

const correr = (...args) => spawnSync(process.execPath, ["scripts/presupuesto.mjs", ...args], { cwd: RAIZ, encoding: "utf8" });

describe("npm run presupuesto", () => {
  it("imprime el presupuesto y el pipeline de una celda válida", () => {
    const r = correr("transversal", "modelo-datos");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("presupuesto: alcance=transversal causa=modelo-datos");
    expect(r.stdout).toContain("jueces_obligatorios: auditor-datos");
    expect(r.stdout).toContain("Pipeline sugerido:");
    expect(r.stdout).toContain(`rondas_max=${presupuestoDe("transversal", "modelo-datos").rondas_max}`);
  });

  it("--json devuelve la celda resuelta", () => {
    const r = correr("local", "entorno", "--json");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(JSON.parse(JSON.stringify(presupuestoDe("local", "entorno"))));
  });

  it("--tabla lista todas las celdas", () => {
    const r = correr("--tabla");
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n")).toHaveLength(celdas().length);
  });

  it.each([
    ["alcance desconocido", ["galaxia", "codigo"], /alcance «galaxia» desconocido/],
    ["causa desconocida", ["local", "inventada"], /causa «inventada» desconocida/],
    ["sin causa", ["local"], /Uso: npm run presupuesto/],
    ["sin nada", [], /Uso: npm run presupuesto/],
    ["demasiados argumentos", ["local", "codigo", "extra"], /Uso: npm run presupuesto/],
  ])("rechaza %s con código 1 y la lista de valores", (_n, args, esperado) => {
    const r = correr(...args);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(esperado);
    expect(r.stderr).toContain("alcances:");
    expect(r.stderr).toContain("causas:");
    expect(r.stdout).toBe("");
  });
});

describe("el test de cada norma del tope de rondas ejercita su regla", () => {
  it("la norma rondas-tope-duro y P07.4 apuntan al test que nombra rondas-excedidas", () => {
    const norma = JSON.parse(leerTexto("ops/normas.json")).normas.find((n) => n.id === "rondas-tope-duro");
    const o = JSON.parse(leerTexto("ops/flujo.json")).pasos.flatMap((p) => p.obligaciones).find((x) => x.id === "P07.4");
    for (const test of [norma.test, o.test]) {
      expect(test).toBe("scripts/fondos-rondas.test.js");
      expect(leerTexto(test), "el test de la obligación tiene que nombrar su regla").toContain(o.contiene);
    }
  });
});

describe("docs/ops/FLUJO.md enseña la tabla del catálogo", () => {
  it("la tabla de presupuestos está en el documento, tal como sale del JSON", () => {
    expect(leerTexto("docs/ops/FLUJO.md")).toContain(generarTabla());
  });
  it("flujo.json ya no guarda los presupuestos (una sola fuente)", () => {
    expect(JSON.parse(leerTexto("ops/flujo.json"))).not.toHaveProperty("presupuestos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Autotest: cada regla falla con datos malos. Cada caso cambia UNA cosa.

/** [regla que debe saltar, qué se rompe, cómo se rompe]. */
const MALOS = [
  ["alcance", "un alcance sin presupuesto", (c) => { delete c.por_alcance.transversal; }],
  ["alcance", "alcances en otro orden", (c) => { c.por_alcance = { modulo: c.por_alcance.modulo, local: c.por_alcance.local, transversal: c.por_alcance.transversal }; }],
  ["campo", "un campo que el alcance no tiene", (c) => { c.por_alcance.local.inventado = 1; }],
  ["campo", "es_no_es que no es verdadero o falso", (c) => { c.por_alcance.local.es_no_es = "si"; }],
  ["diagnostica", "quien diagnostica fuera del vocabulario", (c) => { c.por_alcance.local.diagnostica = "el_becario"; }],
  ["diagnostica", "varias hipótesis en paralelo con quien diagnostica solo", (c) => { c.por_alcance.modulo.hipotesis_en_paralelo_max = 2; }],
  ["rango", "tres rondas permitidas (el tope es el duro)", (c) => { c.por_alcance.local.rondas_max = TOPE_RONDAS + 1; }],
  ["rango", "cero minutos", (c) => { c.por_alcance.local.minutos_orientativos = 0; }],
  ["rango", "una cifra que no es entera", (c) => { c.por_alcance.local.jueces_min = 1.5; }],
  ["rango", "una causa con más hipótesis de las admitidas", (c) => { c.por_causa.entorno = { hipotesis_en_paralelo_max: 9 }; }],
  ["monotonia", "un alcance mayor con menos tiempo que el menor", (c) => { c.por_alcance.transversal.minutos_orientativos = 5; }],
  ["monotonia", "un alcance mayor con menos jueces que el menor", (c) => { c.por_alcance.modulo.jueces_min = 3; c.por_alcance.transversal.jueces_min = 2; }],
  ["causa", "una causa que no es de issues.mjs", (c) => { c.por_causa.inventada = { jueces_min: 2 }; }],
  ["campo", "una causa que sobrescribe lo que no puede (el diagnosticador)", (c) => { c.por_causa.codigo = { diagnostica: "orquestador_con_diagnosticadores" }; }],
  ["campo", "reproducir_en_ci que no es verdadero o falso", (c) => { c.por_causa.entorno.reproducir_en_ci = "si"; }],
  ["juez", "un juez inventado", (c) => { c.por_causa["modelo-datos"].jueces_obligatorios = ["auditor-de-la-luna"]; }],
  ["juez", "un constructor como juez", (c) => { c.por_causa["modelo-datos"].jueces_obligatorios = ["datos"]; }],
  ["juez", "jueces obligatorios vacíos", (c) => { c.por_causa["modelo-datos"].jueces_obligatorios = []; }],
  ["juez", "un juez repetido", (c) => { c.por_causa["modelo-datos"].jueces_obligatorios = ["revisor", "revisor"]; }],
  ["celda", "más jueces obligatorios que el máximo admitido", (c) => { c.por_causa["modelo-datos"].jueces_obligatorios = ["revisor", "qa", "seguridad", "evaluador"]; }],
  ["calibracion", "valores iniciales con fecha de calibrado", (c) => { c.calibrado_el = "2026-10-20"; }],
  ["calibracion", "calibrado sin fecha", (c) => { c.valores_iniciales = false; }],
  ["calibracion", "sin el hueco de recalibración", (c) => { delete c.recalibracion; }],
  ["calibracion", "recalibración sin la fase que la hace", (c) => { c.recalibracion.fase = "pronto"; }],
];

describe("presupuestos.json: el test distingue lo bueno de lo malo", () => {
  it.each(MALOS)("%s · %s", (regla, _quien, romper) => {
    const malo = structuredClone(CATALOGO);
    romper(malo);
    expect(reglas(problemas(malo))).toContain(regla);
  });

  it("los datos de verdad no disparan ninguna regla", () => {
    expect(problemas(structuredClone(CATALOGO))).toEqual([]);
  });

  it("un catálogo calibrado con fecha es válido", () => {
    const c = structuredClone(CATALOGO);
    c.valores_iniciales = false;
    c.calibrado_el = "2026-11-02";
    expect(problemas(c)).toEqual([]);
  });
});
