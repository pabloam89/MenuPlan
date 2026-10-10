import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCIONES, ORIGENES, PENDIENTES_ADMITIDOS, RUTA_MD, agentesEnDisco, conSeccion, contar, extraerSeccion, fraseDeEstandar,
  RUTA_JUICIO, bajarJuicioMaximo, contarJuicio, generarMd, juicioMaximoEnStaging, leerEstandares, leerJuicioMaximo, problemasDeEstandares,
  problemasDeJuicio, renderSeccion, reglasDeTarea, textoDeComun, textoDeTarea,
} from "../scripts/lib/estandaresAgentes.mjs";
import { problemasDeRegla } from "../scripts/lib/regla.mjs";

/**
 * Un estándar por tarea de cada agente, por campos (#413, fondo #416; #516, fondo #488). El catálogo es
 * ops/estandares-agentes.json; la sección «Tareas y su estándar» de cada agente y docs/ops/ESTANDARES.md
 * se generan de él. Falla si una regla no pasa problemasDeRegla, si una acción está fuera de su vocabulario,
 * si un control no es un fichero que existe ni juicio, si un agente tiene tareas sin estándar, si una tarea
 * lleva más reglas de las que admite la forma de práctica de la forja o si ESTANDARES.md no coincide con lo
 * generado.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerEstandares(RAIZ);
const agentes = agentesEnDisco(RAIZ);
const clon = () => JSON.parse(JSON.stringify(datos));
const textoAgente = (n) => readFileSync(join(RAIZ, ".claude", "agents", `${n}.md`), "utf8").replace(/\r\n/g, "\n");
const todasLasTareas = Object.entries(datos.agentes).flatMap(([a, ag]) => ag.tareas.map((t) => ({ agente: a, ...t, reglas: t.reglas ?? [] })));
const todasLasReglas = [
  ...todasLasTareas.flatMap((t) => t.reglas.map((r) => ({ donde: `${t.agente}/${t.id}`, r }))),
  ...Object.entries(datos.comunes).flatMap(([id, c]) => c.reglas.map((r) => ({ donde: `común ${id}`, r }))),
];

describe("ops/estandares-agentes.json", () => {
  it("el catálogo cumple todas las reglas", () => {
    expect(problemasDeEstandares(datos, agentes, RAIZ)).toEqual([]);
  });

  it("cada regla pasa problemasDeRegla con el vocabulario de sujetos del catálogo", () => {
    expect(todasLasReglas.length).toBeGreaterThan(150);
    for (const { donde, r } of todasLasReglas) expect(problemasDeRegla(r, donde, datos.sujetos), donde).toEqual([]);
  });

  it("cada tarea y cada común tiene una acción del vocabulario cerrado, y no sobra ninguna acción", () => {
    for (const t of todasLasTareas) expect(ACCIONES, `${t.agente}/${t.id}`).toContain(t.accion);
    for (const [id, c] of Object.entries(datos.comunes)) expect(ACCIONES, `común ${id}`).toContain(c.accion);
    const usadas = new Set(todasLasTareas.map((t) => t.accion));
    expect([...ACCIONES].sort()).toEqual([...usadas].sort());
    expect(ACCIONES).toEqual(["construir", "juzgar", "diagnosticar", "operar", "medir", "documentar", "decidir"]);
    expect(ORIGENES).toEqual(["mision", "disparadores", "metodo", "entregables"]);
  });

  it("el control de cada regla es un fichero que existe o juicio", () => {
    for (const { donde, r } of todasLasReglas) {
      if (r.control === "juicio") continue;
      expect(existsSync(join(RAIZ, r.control)), `${donde}: ${r.control}`).toBe(true);
      expect(r.control, `${donde}: un control es un test, un hook, un script o un workflow`).toMatch(/\.(m?js|jsx|cjs|ya?ml)$/);
    }
    // Lo que hoy vigila una persona o un LLM sigue a la vista: es el trabajo que queda para convertirlo en mecanismo.
    const juicio = todasLasReglas.filter(({ r }) => r.control === "juicio").length;
    expect(juicio).toBeGreaterThan(0);
    expect(juicio).toBeLessThan(todasLasReglas.length);
    expect(contarJuicio(datos)).toBe(juicio);
  });

  it("el recuento de reglas a juicio es igual al ancla, y el ancla solo baja respecto a origin/staging (#527)", () => {
    const anclado = leerJuicioMaximo(RAIZ);
    expect(anclado, `${RUTA_JUICIO} trae juicio_maximo`).not.toBeNull();
    const enStaging = juicioMaximoEnStaging(RAIZ);
    expect(problemasDeJuicio(datos, anclado, enStaging)).toEqual([]);
  });

  it("el trinquete falla si hay una regla a juicio de más o de menos, si el ancla sube o si falta", () => {
    const hoy = contarJuicio(datos);
    const sinControl = clon();
    sinControl.agentes.gobierno.tareas[0].reglas.find((r) => r.control !== "juicio").control = "juicio";
    expect(contarJuicio(sinControl)).toBe(hoy + 1);
    expect(problemasDeJuicio(sinControl, hoy).join("\n")).toContain("el ancla es");
    expect(problemasDeJuicio(datos, hoy + 1, hoy + 1).join("\n")).toContain("bájala con");
    expect(problemasDeJuicio(datos, hoy + 3, hoy).join("\n")).toContain("mayor que el de origin/staging");
    expect(problemasDeJuicio(datos, null).join("\n")).toContain("falta o no trae");
    expect(problemasDeJuicio(datos, hoy, hoy)).toEqual([]);
    // Si origin/staging no se puede leer, no se inventa un tope y se avisa por stderr.
    const avisos = [];
    const consola = console.error; console.error = (m) => avisos.push(m);
    try { expect(juicioMaximoEnStaging(RAIZ, () => { throw new Error("sin ref"); })).toBeNull(); } finally { console.error = consola; }
    expect(avisos.join("\n")).toContain("se salta la comparación con staging");
    expect(problemasDeJuicio(datos, hoy, null)).toEqual([]);
  });

  it("--escribir baja el tope al recuento y nunca lo sube", () => {
    const hoy = contarJuicio(datos);
    const tmp = mkdtempSync(join(tmpdir(), "juicio-"));
    try {
      mkdirSync(join(tmp, "ops"));
      writeFileSync(join(tmp, RUTA_JUICIO), JSON.stringify({ juicio_maximo: hoy + 10 }));
      expect(bajarJuicioMaximo(tmp, datos)).toBe(hoy);
      expect(leerJuicioMaximo(tmp)).toBe(hoy);
      writeFileSync(join(tmp, RUTA_JUICIO), JSON.stringify({ juicio_maximo: hoy - 5 }));
      expect(bajarJuicioMaximo(tmp, datos)).toBe(hoy - 5);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  it("ningún agente tiene tareas sin estándar y la lista de pendientes está en cero", () => {
    expect(PENDIENTES_ADMITIDOS).toEqual([]);
    expect(Object.keys(datos.agentes).sort()).toEqual(agentes);
    for (const t of todasLasTareas) expect(t.reglas?.length, `${t.agente}/${t.id}: sin estándar`).toBeGreaterThan(0);
    expect(contar(datos).pendientes).toBe(0);
  });

  it("las 66 tareas de los 9 agentes, con los cinco agentes que estaban pendientes completos", () => {
    expect(todasLasTareas).toHaveLength(66);
    for (const n of ["diseno", "lola", "qa", "evaluador", "auditor-datos"]) expect(datos.agentes[n].tareas.length, n).toBeGreaterThanOrEqual(5);
    expect(datos.agentes.gobierno.tareas.map((t) => t.id)).toContain("catalogo-de-ops-con-test");
  });

  it("las once tareas compartidas están una sola vez como comunes y cada una la usa al menos una tarea", () => {
    expect(Object.keys(datos.comunes).sort()).toEqual([
      "base-solo-lectura", "buscar-lo-ya-apuntado", "capturas-375-420", "causa-frente-a-sintoma", "comprobar-design-system",
      "donde-vive-el-dato", "evals-antes-despues", "informe-comun", "medir-antes-despues", "rls-escribe-datos-audita-seguridad", "tests-de-lo-tocado",
    ]);
    const citadas = new Set(todasLasTareas.flatMap((t) => t.comunes ?? []));
    for (const id of Object.keys(datos.comunes)) expect(citadas.has(id), id).toBe(true);
    // Una común no se copia en cada agente: ninguna regla de una tarea repite el nombre de una regla común.
    const nombresComunes = new Set(Object.values(datos.comunes).flatMap((c) => c.reglas.map((r) => r.nombre)));
    for (const t of todasLasTareas) for (const r of t.reglas) expect(nombresComunes.has(r.nombre), `${t.agente}/${t.id}: ${r.nombre} ya es una común`).toBe(false);
  });

  it("la cifra: tareas, reglas, comunes y fuentes externas y de la casa", () => {
    const c = contar(datos);
    expect(c.total).toBe(66);
    expect(c.conEstandar).toBe(66);
    expect(c.reglas).toBe(todasLasTareas.reduce((s, t) => s + t.reglas.length, 0));
    expect(c.comunes).toBe(11);
    expect(c.reglasComunes).toBe(Object.values(datos.comunes).reduce((s, x) => s + x.reglas.length, 0));
    expect(c.fuentes.externas + c.fuentes.casa).toBe(Object.keys(datos.fuentes).length);
    expect(Object.values(c.porAccion).reduce((a, b) => a + b, 0)).toBe(66);
  });

  it("todas las tareas nuevas de #516 dejan el rastro de tres rondas de investigación", () => {
    const nuevos = ["diseno", "lola", "qa", "evaluador", "auditor-datos"];
    for (const t of todasLasTareas.filter((x) => nuevos.includes(x.agente) || x.id === "catalogo-de-ops-con-test")) expect(t.rondas?.length, `${t.agente}/${t.id}`).toBe(3);
    for (const [id, c] of Object.entries(datos.comunes)) expect(c.rondas?.length, `común ${id}`).toBe(3);
  });
});

describe("las reglas se ven fallar (cada una con un catálogo estropeado a propósito)", () => {
  const falla = (cambia, trozo, ags = agentes) => {
    const d = clon();
    cambia(d);
    expect(problemasDeEstandares(d, ags, RAIZ).join("\n")).toContain(trozo);
  };
  const regla = (d) => d.agentes.datos.tareas[0].reglas[0];

  // La plantilla de regla (regla.mjs)
  it("una regla con la exigencia mal escrita (no pasa problemasDeRegla)", () => falla((d) => { regla(d).exigencia = "El modelo se describe antes."; }, "«exigencia» empieza en minúscula"));
  it("una regla con un sujeto fuera del vocabulario", () => falla((d) => { regla(d).sujeto = "inventado"; }, "sujeto «inventado» no está en el vocabulario"));
  it("una regla con una fuerza fuera del vocabulario", () => falla((d) => { regla(d).fuerza = "obligatorio"; }, "fuerza «obligatorio» no está en el vocabulario"));
  it("una regla con un nombre de una sola palabra", () => falla((d) => { regla(d).nombre = "Diseño"; }, "«nombre» tiene de 2 a 5 palabras"));
  it("una regla con la prosa antigua en un campo texto", () => falla((d) => { regla(d).texto = "Una frase suelta"; }, "«texto» ya no existe"));
  it("una regla con un campo que no existe", () => falla((d) => { regla(d).comprueba = ["algo"]; }, "campo «comprueba» no admitido"));
  it("una regla sin porque", () => falla((d) => { delete regla(d).porque; }, "falta «porque»"));
  it("una regla con el ejemplo bueno igual que el malo", () => falla((d) => { regla(d).ejemplo_malo = regla(d).ejemplo_bueno; }, "el ejemplo bueno y el malo son el mismo"));
  it("una regla sin ejemplo malo suficiente", () => falla((d) => { regla(d).ejemplo_malo = "no"; }, "falta «ejemplo_malo»"));
  it("dos reglas con el mismo nombre en una tarea", () => falla((d) => { d.agentes.datos.tareas[0].reglas[1].nombre = d.agentes.datos.tareas[0].reglas[0].nombre; }, "nombre repetido en la tarea"));

  // La acción y el origen (vocabularios cerrados)
  it("una acción fuera de su vocabulario", () => falla((d) => { d.agentes.datos.tareas[0].accion = "inventar"; }, "acción «inventar» no está en el vocabulario"));
  it("una tarea sin acción", () => falla((d) => { delete d.agentes.datos.tareas[0].accion; }, "acción «undefined» no está en el vocabulario"));
  it("una común con una acción fuera de su vocabulario", () => falla((d) => { d.comunes["informe-comun"].accion = "escribir"; }, "común informe-comun: acción «escribir»"));
  it("un origen que no es una sección del agente", () => falla((d) => { d.agentes.datos.tareas[0].origen = "Identidad"; }, "origen «Identidad» no está en el vocabulario"));
  it("un origen que el agente no tiene como sección", () => falla((d) => { d.origenes.mision = "Una sección inventada"; }, "el agente no tiene la sección «Una sección inventada»"));

  // El control (comprueba)
  it("un control que apunta a un fichero que no existe", () => falla((d) => { regla(d).control = "scripts/no-existe.mjs"; }, "el control scripts/no-existe.mjs no existe en el repo"));
  it("un control que es un documento y no un mecanismo", () => falla((d) => { regla(d).control = "docs/ops/FLUJO.md"; }, "no es un test, un hook, un script ni un workflow"));
  it("un control en prosa", () => falla((d) => { regla(d).control = "se revisa a mano de vez en cuando"; }, "no es un test, un hook, un script ni un workflow"));
  it("una regla sin control", () => falla((d) => { delete regla(d).control; }, "falta «control»"));

  // Tareas sin estándar y cuántas reglas
  it("una tarea sin reglas", () => falla((d) => { d.agentes.lola.tareas[0].reglas = []; }, "lola/herramienta-de-lola: sin estándar"));
  it("un agente con todas sus tareas sin estándar", () => falla((d) => { for (const t of d.agentes.qa.tareas) delete t.reglas; }, "qa/recorrer-flujo-en-navegador: sin estándar"));
  it("una tarea con más reglas que el máximo de la forma de práctica", () => falla((d) => { const t = d.agentes.datos.tareas[0]; t.reglas = Array.from({ length: 6 }, (_, i) => ({ ...t.reglas[0], nombre: `Regla número ${i + 1}` })); }, "6 reglas propias; la forma de práctica de la forja pide 5 como mucho"));
  it("una tarea con menos reglas que el mínimo, contando las comunes", () => falla((d) => { const t = d.agentes.qa.tareas.find((x) => x.id === "comprobar-design-system"); t.comunes = []; }, "1 reglas con las comunes; la forma de práctica de la forja pide 2 o más"));
  it("una tarea que conserva el estándar en prosa", () => falla((d) => { d.agentes.datos.tareas[0].estandar = "x".repeat(80); }, "campo «estandar» no admitido"));
  it("una tarea que conserva la lista comprueba", () => falla((d) => { d.agentes.datos.tareas[0].comprueba = ["una comprobación suelta"]; }, "campo «comprueba» no admitido"));
  it("un agente con estado: ya no hay pendientes", () => falla((d) => { d.agentes.qa.estado = "pendiente"; }, "qa: campo «estado» no admitido"));

  // Las comunes
  it("una común que no existe", () => falla((d) => { d.agentes.datos.tareas[0].comunes = ["no-existe"]; }, "la común «no-existe» no existe en comunes"));
  it("una común que ninguna tarea cita", () => falla((d) => { d.comunes.sobra = { ...d.comunes["informe-comun"] }; }, "común sobra: ninguna tarea la cita"));
  it("una común con una sola regla", () => falla((d) => { d.comunes["informe-comun"].reglas = [d.comunes["informe-comun"].reglas[0]]; }, "común informe-comun: 1 reglas; la forma de práctica de la forja pide 2 o más"));

  // Agentes y tareas
  it("un agente nuevo sin su lista de tareas", () => falla(() => {}, "agente-nuevo: el agente existe y no tiene su lista", [...agentes, "agente-nuevo"]));
  it("una entrada sin su agente", () => falla((d) => { d.agentes.fantasma = d.agentes.datos; }, "fantasma: está en ops/estandares-agentes.json y no existe"));
  it("menos de tres tareas", () => falla((d) => { d.agentes.datos.tareas = d.agentes.datos.tareas.slice(0, 2); }, "datos: la lista de tareas tiene al menos tres"));
  it("un id repetido", () => falla((d) => { d.agentes.datos.tareas[1].id = d.agentes.datos.tareas[0].id; }, "id repetido"));
  it("una tarea sin descripción de lo que se hace", () => falla((d) => { d.agentes.datos.tareas[0].tarea = ""; }, "«tarea» dice qué se hace"));
  it("una tarea sin lo que no hace", () => falla((d) => { delete d.agentes.datos.tareas[0].no_hace; }, "«no_hace» es una lista"));

  // Las fuentes
  it("una fuente que no está en el catálogo", () => falla((d) => { regla(d).fuente = "no-existe"; }, "la fuente «no-existe» no está en el catálogo"));
  it("una fuente en una web que no es documentación admitida", () => falla((d) => { d.fuentes["gg-estandar"].url = "https://blog.example.com/x"; }, "blog.example.com no es una documentación admitida"));
  it("una fuente en http", () => falla((d) => { d.fuentes["gg-estandar"].url = "http://google.github.io/eng-practices/"; }, "la url va en https"));
  it("una fuente de la casa con una ruta que no existe", () => falla((d) => { d.fuentes["casa-claude"].ruta = "no/existe.md"; }, "la ruta no/existe.md no existe en el repo"));
  it("una fuente de la casa con url", () => falla((d) => { d.fuentes["casa-claude"].url = "https://x.org"; }, "lleva ruta y no url"));
  it("una fuente que ninguna regla cita", () => falla((d) => { d.fuentes.sobra = { nombre: "Una fuente que sobra en el catálogo", url: "https://sre.google/x" }; }, "fuente «sobra»: ninguna regla la cita"));

  it("un agente en la lista de pendientes, que está en cero", () => {
    expect(PENDIENTES_ADMITIDOS).toEqual([]);
  });
});

describe("la sección «Tareas y su estándar» de cada agente sale del catálogo", () => {
  it.each(agentes)("%s: su sección es la generada y no hay tarea sin estándar ni estándar sin tarea", (n) => {
    const seccion = extraerSeccion(textoAgente(n));
    expect(seccion, `${n}: falta «## Tareas y su estándar» (npm run estandar -- --escribir)`).not.toBeNull();
    const enMd = [...seccion.matchAll(/^- `([a-z0-9-]+)` — /gm)].map((m) => m[1]);
    const enJson = datos.agentes[n].tareas.map((t) => t.id);
    expect(enMd.filter((x) => !enJson.includes(x)), `${n}: tareas en el agente que no están en el catálogo`).toEqual([]);
    expect(enJson.filter((x) => !enMd.includes(x)), `${n}: tareas del catálogo que el agente no lista`).toEqual([]);
    expect(seccion, `${n}: la sección no coincide con la generada (npm run estandar -- --escribir)`).toBe(renderSeccion(n, datos));
  });

  it("cada tarea sale con su acción en la lista del agente", () => {
    const seccion = extraerSeccion(textoAgente("gobierno"));
    expect(seccion).toContain("- `flujo-rama-pr-staging` — Llevar un cambio de su rama a staging por PR con el CI en verde, mirando el estado real de origin/staging (acción: operar)");
  });

  it("generar es idempotente y sustituye sin duplicar", () => {
    const base = "## 10. Hecho\n\nalgo\n";
    const una = conSeccion(base, renderSeccion("gobierno", datos));
    expect(conSeccion(una, renderSeccion("gobierno", datos))).toBe(una);
    expect(una.match(/## Tareas y su estándar/g)).toHaveLength(1);
    expect(conSeccion(una, "## Tareas y su estándar\n\ncambiada")).toContain("cambiada");
  });
});

describe("docs/ops/ESTANDARES.md sale del catálogo", () => {
  const md = readFileSync(join(RAIZ, RUTA_MD), "utf8").replace(/\r\n/g, "\n");

  it("coincide con lo generado (npm run estandar -- --escribir)", () => {
    expect(md).toBe(generarMd(datos));
  });

  it("falla si se estropea el catálogo, la tabla o una celda", () => {
    const d = clon();
    d.agentes.datos.tareas[0].reglas[0].exigencia = "describir otra cosa distinta antes del SQL";
    expect(generarMd(d)).not.toBe(md);
    expect(md.replace("| datos |", "| datoz |")).not.toBe(generarMd(datos));
    expect(`${md}\nuna línea escrita a mano\n`).not.toBe(generarMd(datos));
  });

  it("lleva una fila por regla, con agente, tarea, acción, frase, control y fuente", () => {
    const filas = md.split("\n").filter((l) => /^\| (gobierno|datos|revisor|seguridad|diseno|lola|qa|evaluador|auditor-datos) \| `/.test(l));
    expect(filas).toHaveLength(contar(datos).reglas);
    const [agente, tarea, accion, frase, control, fuente] = filas[0].split(" | ").map((x) => x.replace(/^\| /, ""));
    expect(agente).toBe("gobierno");
    expect(tarea).toBe("`flujo-rama-pr-staging`");
    expect(ACCIONES).toContain(accion);
    expect(frase).toContain("**Rama y estado desde origin.** Cada rama de trabajo DEBE salir de origin/staging");
    expect(control).toBe("juicio");
    expect(fuente).toMatch(/^\[F\] \[/);
    const comunes = md.split("\n").filter((l) => /^\| `[a-z0-9-]+` \| (construir|juzgar|diagnosticar|operar|medir|documentar|decidir) \|/.test(l));
    expect(comunes).toHaveLength(contar(datos).reglasComunes);
  });

  it("la frase de cada regla sale de sus campos y no lleva el control", () => {
    const r = datos.agentes.gobierno.tareas[0].reglas[0];
    expect(fraseDeEstandar(r, datos.sujetos)).toBe("**Rama y estado desde origin.** Cada rama de trabajo DEBE salir de origin/staging con una sola tarea y, para saber si un cambio está en staging, leerse en origin/staging tras git fetch.");
  });
});

describe("npm run estandar", () => {
  it("está en package.json y da el estándar con la línea que pega /orquestar", () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
    expect(pkg.scripts.estandar).toMatch(/scripts\/estandares-agentes\.mjs/);
    const out = execFileSync("node", ["scripts/estandares-agentes.mjs", "gobierno", "flujo-rama-pr-staging"], { cwd: RAIZ, encoding: "utf8" });
    expect(out).toContain("ESTÁNDAR A CUMPLIR: gobierno/flujo-rama-pr-staging");
    expect(out).toMatch(/Acción: operar/);
    expect(out).toMatch(/Reglas \(cada una con su control y su fuente\):/);
    expect(out).toMatch(/Control: juicio/);
    expect(out).toMatch(/Control: script scripts\/fondos-pr\.mjs/);
    expect(out).toMatch(/No hace:/);
    expect(out).toMatch(/Fuente: \[F\] https:\/\//);
  });

  it("de una tarea con comunes pega también las reglas comunes", () => {
    const out = textoDeTarea("diseno", "pantalla-con-tokens", datos);
    expect(out).toContain("Común comprobar-design-system");
    expect(out).toContain("Objetivo táctil");
    expect(reglasDeTarea(datos.agentes.diseno.tareas[0], datos).length).toBeGreaterThan(datos.agentes.diseno.tareas[0].reglas.length);
  });

  it("de una tarea que no existe, nada; de una común, su estándar", () => {
    expect(textoDeTarea("gobierno", "no-existe", datos)).toBeNull();
    expect(textoDeTarea("nadie", "x", datos)).toBeNull();
    expect(textoDeComun("no-existe", datos)).toBeNull();
    expect(textoDeComun("base-solo-lectura", datos)).toContain("ESTÁNDAR COMÚN: base-solo-lectura");
    const out = execFileSync("node", ["scripts/estandares-agentes.mjs", "comunes"], { cwd: RAIZ, encoding: "utf8" });
    expect(out.split("\n").filter(Boolean)).toHaveLength(11);
  });

  it("la cifra sale por --contar", () => {
    const out = execFileSync("node", ["scripts/estandares-agentes.mjs", "--contar"], { cwd: RAIZ, encoding: "utf8" });
    expect(out).toContain("TOTAL 66/66 tareas con estándar; 0 pendientes");
  });
});
