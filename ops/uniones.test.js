import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { AMBITOS, AMBITO_DE_REGLA, ambitosDeFichero } from "../scripts/lib/ambitos.mjs";
import { globARegex } from "../scripts/lib/vecinos.mjs";
import { MIN_PALABRAS_COPIA, cargarSkill, nombresDeSkills, parsearSkill, problemasDeNormasDeSkill } from "../scripts/lib/skills.mjs";
import {
  TECHO_NORMAS_SIN_JUEZ, TECHO_REGLAS_QUE_NO_SON_NORMA, accionesDeConsulta, juecesPorNorma, normaReescrita, parecido, problemasDeEmparejamiento, reglasDelCatalogo, leerEstandares, normasDeTarea, normasHuerfanas, verticalesEnEstandares, problemasDeUnionesEstandar, tareasDe,
} from "../scripts/lib/estandaresAgentes.mjs";
import { PROYECTOS, PROYECTOS_CON_NORMAS } from "../scripts/lib/zonasProyecto.mjs";
import { cargarNormas, leerRegistro, problemasDeProyectos, sinControlDeTest } from "../scripts/lib/normas.mjs";
import { leerN2 } from "../scripts/lib/estandaresN2.mjs";
import { TECHO_PRINCIPIOS_QUE_REPITEN, TECHO_SIN_NORMA, leerPrincipiosCasa, principiosQueRepitenSuNorma, problemasDeUniones } from "../scripts/lib/principios.mjs";

/**
 * Las uniones entre la lista de principios y el registro de normas (#619, fondo #618). Falla si:
 *  1. una norma no cita ningún principio, o cita uno que no está en la lista;
 *  2. un principio (propio o de un catálogo delegado) no lo cita ninguna norma y no está en principios_sin_norma con su motivo;
 *  3. un principio de principios_sin_norma ya tiene norma (la lista tiene que bajar);
 *  4. la lista pasa de TECHO_SIN_NORMA (solo baja: el test la pide igual a la cifra de hoy; desde #620 los
 *     catálogos delegados no tienen techo aparte, todos sus principios tienen norma);
 *  5. una norma con ejecutor «nada» no tiene issue (sin red, solo un número; que sea un encargo o una decisión
 *     abiertos lo mira el CI, scripts/fondos-pr.mjs);
 *  6. una norma lleva una acción que no es de ops/estandares-agentes.json, o fuera de su orden.
 * Y entre los estándares y las normas (#620):
 *  7. un estándar cita una norma que no existe, o una regla suya reescribe una norma (se le parece desde
 *     UMBRAL_REESCRITURA, o se llama igual) sin estar en reglas_que_no_son_norma con su motivo;
 *  8. una norma vigilada por juicio no la cita ningún estándar de juez, ni está en normas_sin_juez;
 *  9. el constructor y el juez de un mismo ámbito no reciben las mismas normas de ese ámbito;
 * 10. un fichero del repo no cae en ningún ámbito (el mapa fichero → ámbito de ambitos.mjs);
 * 11. una skill no dice en su cabecera a qué normas sirve, cita una que no está en esa lista o que no existe,
 *     o contiene la frase de una norma en vez de citarla.
 * Al final, cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerPrincipiosCasa(RAIZ);
const normas = leerRegistro(RAIZ).normas;
const excepciones = { sinNorma: datos.sin_norma };

describe("principios y normas", () => {
  it("cada norma cita un principio que existe, cada principio tiene norma o motivo, y nada sin ejecutor queda sin issue", () => {
    expect(problemasDeUniones(datos.principios, normas, excepciones)).toEqual([]);
  });

  it("el techo de principios sin norma es la cifra de hoy, y ningún delegado queda sin norma (#620)", () => {
    expect(Object.keys(datos.sin_norma)).toHaveLength(TECHO_SIN_NORMA);
    for (const d of Object.values(datos.delegados)) expect("sin_norma" in d).toBe(false);
    const citados = new Set(normas.map((n) => n.principio));
    expect(datos.principios.filter((p) => p.catalogo && !citados.has(p.id)).map((p) => p.id)).toEqual([]);
  });

  it("los principios propios de código, infra, datos y proceso tienen todos su norma", () => {
    const sinNorma = datos.principios.filter((p) => ["code", "infra", "data", "process"].includes(p.area) && p.id in datos.sin_norma);
    expect(sinNorma.map((p) => p.id)).toEqual([]);
  });
});

describe("un principio dice el porqué y no repite su norma (#620, ronda 2)", () => {
  it("las parejas principio ↔ norma que se parecen no pasan del techo, que es la cifra de hoy", () => {
    const hoy = principiosQueRepitenSuNorma(datos.principios, normas);
    expect(hoy.length, hoy.map((x) => `${x.principio} ↔ ${x.norma} ${x.parecido.toFixed(2)}`).join("\n")).toBe(TECHO_PRINCIPIOS_QUE_REPITEN);
  });
  it("se ve fallar: un enunciado que copia su norma sube la cifra", () => {
    const n = normas.find((x) => x.id === "sin-git-stash");
    const copia = datos.principios.map((p) => (p.id === n.principio ? { ...p, enunciado: `Nadie va a ${n.exigencia}.` } : p));
    expect(principiosQueRepitenSuNorma(copia, normas).length).toBeGreaterThan(TECHO_PRINCIPIOS_QUE_REPITEN);
  });
});

describe("se ven fallar", () => {
  const P = [{ id: "a-principle" }, { id: "b-principle" }, { id: "c-delegated", catalogo: "ops/x/", area: "product" }];
  const conC = (cambios = {}) => ({ id: "otra-c", principio: "c-delegated", ejecutor: "ci", issue: null, acciones: ["construir"], ...cambios });
  const N = (cambios = {}) => ({ id: "una-norma", principio: "a-principle", ejecutor: "ci", issue: null, acciones: ["construir"], ...cambios });
  const sin = { "b-principle": "Motivo de ejemplo con veinte caracteres o más" };
  const problemas = (normasX, sinX = sin, techo = 1) => problemasDeUniones(P, [...normasX, conC()], { sinNorma: sinX }, { techo }).join("\n");

  it("los datos de ejemplo pasan", () => expect(problemas([N()])).toBe(""));

  it("una norma sin principio", () => expect(problemas([N({ principio: undefined })])).toMatch(/no cita ningún principio/));
  it("una norma que cita un principio que no existe", () => expect(problemas([N({ principio: "inventado" })])).toMatch(/«inventado», que no está en la lista/));
  it("un principio sin norma ni motivo", () => expect(problemas([N()], {})).toMatch(/principio b-principle: ninguna norma lo cita/));
  it("un principio exceptuado que ya tiene norma", () => expect(problemas([N(), N({ id: "otra", principio: "b-principle" })])).toMatch(/b-principle: ya lo cita otra; quítalo/));
  it("una excepción sin motivo o de un principio que no existe", () => {
    expect(problemas([N()], { "b-principle": "corto" })).toMatch(/lleva su motivo/);
    expect(problemas([N()], { ...sin, inventado: "Motivo de ejemplo con veinte caracteres" }, 2)).toMatch(/«inventado» no es un principio/);
  });
  it("una norma de otro ámbito que cita un principio de un paquete opcional (#710)", () => {
    const Q = [...P, { id: "d-bot", dominio: "bot" }];
    const con = (normas) => problemasDeUniones(Q, [...normas, conC(), N({ id: "n-d", principio: "d-bot", ambito: "bot" })], { sinNorma: sin }, { techo: 1 }).join("\n");
    expect(con([N()])).toBe("");
    expect(con([N(), N({ id: "diseno-a", principio: "d-bot", ambito: "diseno" })])).toMatch(/norma diseno-a: cita el principio «d-bot», del paquete opcional «bot», y su ámbito es «diseno»/);
  });
  it("una acción que no es de los estándares, o fuera de su orden", () => {
    expect(problemas([N({ acciones: ["programar"] })])).toMatch(/la acción «programar» no está/);
    expect(problemas([N({ acciones: ["juzgar", "construir"] })])).toMatch(/«acciones» va en el orden/);
  });
  it("más principios propios sin norma que el techo", () => expect(problemas([N()], sin, 0)).toMatch(/1 principios sin norma y el techo es 0/));
  it("un principio delegado sin norma falla como uno propio, salvo que esté en la lista con su motivo (#620)", () => {
    const sinC = problemasDeUniones(P, [N()], { sinNorma: sin }, { techo: 1 }).join("\n");
    expect(sinC).toMatch(/principio c-delegated: ninguna norma lo cita; .* \(es de ops\/x\/\)/);
    expect(problemasDeUniones(P, [N()], { sinNorma: { ...sin, "c-delegated": "Motivo de ejemplo con veinte caracteres" } }, { techo: 2 }).join("\n")).toBe("");
  });

  it("una norma sin ejecutor y sin issue; con un número, pasa (el tipo y el estado los mira el CI)", () => {
    expect(problemas([N({ ejecutor: "nada" })])).toMatch(/ejecutor nada\) y no tiene issue/);
    expect(problemas([N({ ejecutor: "nada", issue: 624 })])).toBe("");
  });

  it("sobre el registro de verdad: quitar un principio, vaciar un issue o colgar una norma sin issue falla", () => {
    const sinPrincipio = normas.map((n, i) => (i === 0 ? { ...n, principio: undefined } : n));
    expect(problemasDeUniones(datos.principios, sinPrincipio, excepciones).join("\n")).toMatch(new RegExp(`norma ${normas[0].id}: no cita`));
    const nada = normas.find((n) => n.ejecutor === "nada");
    const sinIssue = normas.map((n) => (n === nada ? { ...n, issue: null } : n));
    expect(problemasDeUniones(datos.principios, sinIssue, excepciones).join("\n")).toMatch(new RegExp(`norma ${nada.id}: nadie la hace cumplir`));
  });
});

describe("los estándares citan normas y no las reescriben (#620)", () => {
  const estandares = leerEstandares(RAIZ);
  const clon = () => structuredClone(estandares);

  it("ninguna norma citada falta, ninguna regla reescribe una norma y toda norma a juicio tiene juez o motivo", () => {
    expect(problemasDeUnionesEstandar(estandares, normas)).toEqual([]);
  });

  it("los techos de las dos listas de excepciones son la cifra de hoy: si baja la lista, baja el techo", () => {
    expect(Object.keys(estandares.reglas_que_no_son_norma ?? {})).toHaveLength(TECHO_REGLAS_QUE_NO_SON_NORMA);
    expect(Object.keys(estandares.normas_sin_juez ?? {})).toHaveLength(TECHO_NORMAS_SIN_JUEZ);
  });

  it("el constructor y el juez de un mismo ámbito reciben las mismas normas de ese ámbito", () => {
    expect(problemasDeEmparejamiento(estandares, normas)).toEqual([]);
    const tareas = tareasDe(estandares);
    // Las parejas que pide el encargo: el código (las C) y la infraestructura (las I) tienen constructor y juez.
    for (const a of ["code", "infra"]) {
      expect(tareas.some((x) => x.tarea.accion === "construir" && x.tarea.ambitos.includes(a)), `${a}: constructor`).toBe(true);
      expect(tareas.some((x) => x.tarea.accion === "juzgar" && x.tarea.ambitos.includes(a)), `${a}: juez`).toBe(true);
    }
    expect(accionesDeConsulta("construir")).toEqual(accionesDeConsulta("juzgar"));
  });

  it("cada fichero del repo cae en algún ámbito", () => {
    const ficheros = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" }).split("\0").filter(Boolean);
    expect(ficheros.length).toBeGreaterThan(1000);
    expect(ficheros.filter((f) => !ambitosDeFichero(f).length)).toEqual([]);
    expect(ambitosDeFichero("api/_guard.js")).toEqual(["code", "api"]);
    expect(ambitosDeFichero(".claude/hooks/guardia.mjs")).toEqual(["code", "infra"]);
    expect(ambitosDeFichero("supabase/migrations/0100_x.sql")).toEqual(["data"]);
    expect(ambitosDeFichero("ops/redaccion.json")).toEqual(["process", "writing"]);
  });

  it("todo fichero que casa con los paths: de una regla de .claude/rules/ tiene el ámbito de esa regla", () => {
    const ficheros = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" }).split("\0").filter(Boolean);
    const reglas = readdirSync(join(RAIZ, ".claude/rules")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
    expect(reglas.sort()).toEqual(Object.keys(AMBITO_DE_REGLA).sort());
    const faltan = [];
    for (const r of reglas) {
      const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(RAIZ, ".claude/rules", `${r}.md`), "utf8").replace(/\r\n/g, "\n"));
      const globs = [...(fm?.[1] ?? "").matchAll(/^\s+-\s+["']?([^"'\n]+?)["']?\s*$/gm)].map((m) => m[1]);
      expect(globs.length, r).toBeGreaterThan(0);
      for (const f of ficheros) if (globs.some((g) => globARegex(g).test(f)) && !ambitosDeFichero(f).includes(AMBITO_DE_REGLA[r])) faltan.push(`${f}: casa con la regla ${r} y no es de ${AMBITO_DE_REGLA[r]}`);
    }
    expect(faltan).toEqual([]);
    for (const [f, a] of [["src/lib/cocinaTopes.js", "catalog"], ["scripts/bedca-sync.mjs", "catalog"], ["scripts/ciqual-sync.mjs", "catalog"], ["scripts/build-ingredient-catalog.mjs", "catalog"], ["scripts/telegram-webhook.mjs", "bot"]]) {
      expect(ambitosDeFichero(f), f).toContain(a);
    }
  });

  // Parejas regla ↔ norma ya juzgadas a mano (ronda 3 de #620). La medida y el umbral de normaReescrita se eligen con
  // este conjunto: las cinco primeras eran reescrituras reales que la medida de la ronda 2 dejaba escapar; las seis
  // siguientes son pasos propios que se parecen a una norma (los tres falsos positivos del primer detector y los tres
  // que hoy van a reglas_que_no_son_norma). Una pareja nueva juzgada se añade aquí, con el error que la hizo falta.
  const CALIBRACION_REESCRITURA = {
    reescriben: [
      ["Sin stash compartido", "sin-git-stash"],
      ["Texto de usuario es dato", "texto-ajeno-es-dato"],
      ["Módulo dueño", "tabla-modulo-dueno"],
      ["Lector por campo", "campo-con-lector"],
      ["Test que puede fallar", "test-visto-fallar"],
    ],
    pasosPropios: [
      ["Commit con CI verde", "main-solo-por-pr-con-tests"],
      ["NOT VALID primero", "rol-solo-lectura"],
      ["Inventario antes de borrar", "uniones-antes-de-borrar"],
      ["Sin informe, no comprobado", "principios-auto"],
      ["Revisión de seguridad", "evals-antes-de-fusionar"],
      ["Buscar antes de apuntar", "issues-con-buscar-antes"],
    ],
  };
  // Las reglas de antes de #620, tal como estaban (las cinco primeras ya no están en el catálogo).
  const regla = (nombre, condicion, exigencia) => ({ nombre, ...(condicion ? { condicion } : {}), exigencia });
  const REGLAS_JUZGADAS = {
    "Sin stash compartido": regla("Sin stash compartido", null, "guardar cambios con git stash: es común a todas las carpetas de trabajo y se cruza entre sesiones"),
    "Texto de usuario es dato": regla("Texto de usuario es dato", null, "separar el texto del usuario de las instrucciones, sin tratarlo como orden"),
    "Módulo dueño": regla("Módulo dueño", null, "tener un único camino de acceso: su módulo dueño, sin columnas ni filtros a mano fuera"),
    "Lector por campo": regla("Lector por campo", "cuando se añade una columna o una tabla", "tener un lector señalado antes de crearse"),
    "Test que puede fallar": regla("Test que puede fallar", null, "fallar si el código se rompe: un test que no puede fallar no cuenta como cobertura"),
  };
  const deCatalogo = (nombre) => reglasDelCatalogo(estandares).find((x) => x.clave.endsWith(`· ${nombre}`))?.regla;

  it("la medida detecta las cinco reescrituras reales y los pasos propios solo salen si están en reglas_que_no_son_norma", () => {
    for (const [nombre, id] of CALIBRACION_REESCRITURA.reescriben) {
      expect(normaReescrita(REGLAS_JUZGADAS[nombre], normas)?.norma.id, nombre).toBe(id);
    }
    // Un paso propio puede parecerse a una norma (Dice sobre palabras no separa «enseñar el inventario» de «quitar uniones»): lo
    // que se pide es que no esté en el catálogo sin su excepción escrita, y que las excepciones no pasen del techo.
    for (const [nombre, id] of CALIBRACION_REESCRITURA.pasosPropios) {
      const r = deCatalogo(nombre);
      expect(r, `${nombre} sigue en el catálogo`).toBeDefined();
      const hit = normaReescrita(r, normas);
      const clave = reglasDelCatalogo(estandares).find((x) => x.regla === r).clave;
      if (hit) expect(estandares.reglas_que_no_son_norma[clave], `${nombre} ↔ ${id} se parece y no tiene su excepción`).toBeDefined();
    }
    const detectados = CALIBRACION_REESCRITURA.pasosPropios.filter(([nombre]) => normaReescrita(deCatalogo(nombre), normas)).length;
    expect(detectados, "falsos positivos de la medida sobre los seis pasos propios").toBeLessThanOrEqual(4);
  });

  it("se ve fallar: la medida de la ronda 2 (Dice del texto y nombre desde 0,8) dejaba escapar las cinco", () => {
    const antes = (r, n) => Math.max(parecido(`${r.condicion ?? ""} ${r.exigencia}`, `${n.condicion ?? ""} ${n.exigencia}`), parecido(r.nombre, n.nombre) >= 0.8 ? 1 : 0);
    const escapan = CALIBRACION_REESCRITURA.reescriben.filter(([nombre, id]) => antes(REGLAS_JUZGADAS[nombre], normas.find((n) => n.id === id)) < 0.5);
    expect(escapan.map((x) => x[0])).toEqual(CALIBRACION_REESCRITURA.reescriben.map((x) => x[0]));
  });

  describe("se ven fallar", () => {
    const con = (cambia, opciones) => { const d = clon(); cambia(d); return problemasDeUnionesEstandar(d, normas, opciones).join("\n"); };
    const visto = normas.find((n) => n.id === "test-visto-fallar");
    const copia = { ...estandares.agentes.constructor.tareas[0].reglas[0], nombre: "Prueba antes de fiarse", condicion: visto.condicion, exigencia: visto.exigencia };

    it("una tarea o una común que cita una norma que no existe", () => {
      expect(con((d) => { d.agentes.constructor.tareas[11].normas = ["norma-inventada"]; })).toMatch(/constructor\/modelar-antes-de-sql: cita la norma «norma-inventada», que no existe/);
      expect(con((d) => { d.comunes["tests-de-lo-tocado"].normas.push("otra-inventada"); })).toMatch(/común tests-de-lo-tocado: cita la norma «otra-inventada»/);
    });
    it("una regla que copia una norma, o que se llama igual que una", () => {
      expect(con((d) => { d.agentes.constructor.tareas[0].reglas.push(copia); })).toMatch(/constructor\/flujo-rama-pr-staging · Prueba antes de fiarse: reescribe la norma «test-visto-fallar» \(parecido 1\.00\)/);
      expect(con((d) => { d.comunes["informe-comun"].reglas[0].nombre = "Test visto fallar"; })).toMatch(/común informe-comun · Test visto fallar: reescribe la norma «test-visto-fallar»/);
    });
    it("una excepción con su motivo deja pasar la regla; una que ya no hace falta, o sin motivo, falla", () => {
      const clave = "constructor/flujo-rama-pr-staging · Prueba antes de fiarse";
      const techos = { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA + 1, juicio: TECHO_NORMAS_SIN_JUEZ };
      expect(con((d) => { d.agentes.constructor.tareas[0].reglas.push(copia); d.reglas_que_no_son_norma[clave] = "test-visto-fallar: motivo de ejemplo con más de quince caracteres"; }, { techos })).toBe("");
      expect(con((d) => { d.reglas_que_no_son_norma[clave] = "test-visto-fallar: motivo de ejemplo con más de quince caracteres"; }, { techos })).toMatch(/no es una regla del catálogo/);
      const vieja = Object.keys(estandares.reglas_que_no_son_norma)[0];
      expect(con((d) => { d.reglas_que_no_son_norma[vieja] = "corto"; })).toMatch(/el valor es «<norma>: motivo»/);
      expect(con(() => {}, { umbral: 0.99 })).toMatch(/ya no se parece a ninguna norma; quítala/);
    });
    it("una norma vigilada por juicio que ningún juez cita", () => {
      expect(juecesPorNorma(estandares, normas)["migrated-screen-pixel-identical"]).toContain("qa/comprobar-design-system");
      expect(con((d) => { for (const t of d.agentes.qa.tareas) t.ambitos = t.ambitos.filter((a) => a !== "diseno"); })).toMatch(/norma migrated-screen-pixel-identical: la vigila un juicio y ningún estándar de juez la cita/);
      expect(con((d) => { d.agentes.seguridad.tareas.find((t) => t.id === "auditar-secretos").normas = []; })).toMatch(/norma repo-publico-sin-detalle: la vigila un juicio y ningún estándar de juez la cita/);
    });
    it("una norma en normas_sin_juez que ya tiene juez, que no existe o que no es de juicio; y el techo", () => {
      expect(con((d) => { d.normas_sin_juez["test-visto-fallar"] = "Motivo de ejemplo con veinte caracteres"; }, { techos: { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA, juicio: 7 } })).toMatch(/normas_sin_juez «test-visto-fallar»: ya la cita/);
      expect(con((d) => { d.normas_sin_juez["inventada"] = "Motivo de ejemplo con veinte caracteres"; }, { techos: { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA, juicio: 7 } })).toMatch(/«inventada»: no es una norma/);
      expect(con((d) => { d.normas_sin_juez["tope-diario-ia"] = "Motivo de ejemplo con veinte caracteres"; }, { techos: { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA, juicio: 7 } })).toMatch(/«tope-diario-ia»: no la vigila un juicio/);
      expect(con((d) => { d.normas_sin_juez["inventada"] = "Motivo de ejemplo con veinte caracteres"; })).toMatch(/normas_sin_juez: 4 y el techo es 3; la lista solo baja/);
    });
    it("el constructor y el juez de un ámbito dejan de recibir lo mismo si la consulta no los empareja", () => {
      const sinPareja = problemasDeEmparejamiento(estandares, normas, { deConsulta: (a) => [a] }).join("\n");
      expect(sinPareja).toMatch(/infra: constructor\/[\w-]+ y revisor\/revisar-diff no reciben las mismas normas/);
      expect(sinPareja).toMatch(/code: /);
    });
  });
});

describe("las skills citan normas y no las contienen (#620)", () => {
  const skills = nombresDeSkills(RAIZ).map((n) => cargarSkill(n, RAIZ));

  it("cada skill dice a qué normas sirve, cita solo esas y no copia la frase de ninguna", () => {
    expect(skills.length).toBeGreaterThanOrEqual(15);
    expect(skills.flatMap((sk) => problemasDeNormasDeSkill(sk, normas))).toEqual([]);
    for (const sk of skills) expect(parsearSkill(sk.texto).meta.metadata.normas.length, sk.nombre).toBeGreaterThan(0);
  });

  describe("se ven fallar", () => {
    const sk = skills.find((x) => x.nombre === "alta-de-secreto");
    const con = (texto, extra = sk.extra) => problemasDeNormasDeSkill({ ...sk, texto, extra }, normas).join("\n");
    const norma = normas.find((n) => n.id === "secretos-de-repo");

    it("una skill sin la lista de normas en la cabecera", () => {
      expect(con(sk.texto.replace(/^ {2}normas: .*\n/m, ""))).toMatch(/metadata\.normas es la lista de las normas a las que sirve/);
    });
    it("una norma de la cabecera que no existe", () => {
      expect(con(sk.texto.replace(/^( {2}normas: \[)/m, "$1norma-inventada, "))).toMatch(/metadata\.normas cita «norma-inventada», que no está/);
    });
    it("una cita en el texto, o en una capa, que no está en la cabecera", () => {
      expect(con(sk.texto.replace(/^( {2}normas: \[)secretos-ok-pablo, /m, "$1"))).toMatch(/SKILL\.md cita la norma «secretos-ok-pablo» y no está en metadata\.normas/);
      expect(con(sk.texto, { ...sk.extra, "referencias/x.md": "Algo <!-- norma:sin-git-stash -->" })).toMatch(/referencias\/x\.md cita la norma «sin-git-stash»/);
    });
    it("una skill que copia la frase de una norma, aunque cambie tildes o mayúsculas", () => {
      expect(norma.exigencia.split(" ").length).toBeGreaterThanOrEqual(MIN_PALABRAS_COPIA - 1);
      const copia = normas.find((n) => n.id === "secretos-ok-pablo");
      expect(con(`${sk.texto}\nCada secreto debe ${copia.exigencia.toUpperCase()}.\n`)).toMatch(/contiene la frase de la norma «secretos-ok-pablo»/);
      const otra = normas.find((n) => n.id === "test-visto-fallar");
      expect(con(sk.texto, { ...sk.extra, "referencias/y.md": `Un test nuevo ha de ${otra.exigencia}.` })).toMatch(/contiene la frase de la norma «test-visto-fallar»/);
    });
  });
});

describe("toda norma horizontal llega a algún agente (#683, #704, fondo #652)", () => {
  const estandares = leerEstandares(RAIZ);
  const TECHOS = JSON.parse(readFileSync(join(RAIZ, "ops/normas-techos.json"), "utf8"));
  const excepciones = TECHOS.normas_huerfanas_excepciones ?? {};
  const sinExcepcion = (ids) => ids.filter((id) => !(id in excepciones));

  it("ninguna norma horizontal queda sin tarea que la reciba, salvo las de la lista de excepciones (vacía desde #704)", () => {
    expect(sinExcepcion(normasHuerfanas(estandares, normas)), "Mapéala a la tarea del agente que corresponda (ámbito o `normas`)").toEqual([]);
  });

  it("la lista de excepciones solo tiene normas horizontales que existen y siguen huérfanas, con motivo, y su techo es su tamaño", () => {
    const huerfanas = normasHuerfanas(estandares, normas);
    for (const [id, motivo] of Object.entries(excepciones)) {
      expect(normas.find((n) => n.id === id)?.lado, `${id}: una vertical no va aquí`).toBe("horizontal");
      expect(huerfanas, `${id}: ya la recibe una tarea, quítala de la lista`).toContain(id);
      expect(motivo.length, `${id}: motivo`).toBeGreaterThan(20);
    }
    expect(Object.keys(excepciones)).toHaveLength(TECHOS.normas_huerfanas);
  });

  it("se ve fallar: una norma nueva sin ámbito de ninguna tarea, y una citada que deja de ser huérfana", () => {
    const nueva = { id: "norma-de-ejemplo", ambito: "catalog", acciones: ["construir"], lado: "horizontal" };
    expect(normasHuerfanas(estandares, [...normas, nueva])).toContain("norma-de-ejemplo");
    const citada = structuredClone(estandares);
    citada.agentes.constructor.tareas[0].normas = [...(citada.agentes.constructor.tareas[0].normas ?? []), "norma-de-ejemplo"];
    expect(normasHuerfanas(citada, [...normas, nueva])).not.toContain("norma-de-ejemplo");
    // un juez del ámbito no basta: la acción tiene que ser la de la norma
    expect(normasHuerfanas(estandares, [...normas, { ...nueva, id: "otra", ambito: "code", acciones: ["operar"] }])).toContain("otra");
  });
});

describe("las normas del proyecto no van en un estándar horizontal (#704, fondo #652)", () => {
  const estandares = leerEstandares(RAIZ);
  const carga = cargarNormas(RAIZ);
  const proyectos = PROYECTOS_CON_NORMAS;
  const TECHOS = JSON.parse(readFileSync(join(RAIZ, "ops/normas-techos.json"), "utf8"));
  const sinTest = TECHOS.verticales_sin_test_excepciones ?? {};

  it("toda norma tiene lado; ops/normas.json solo lleva horizontales y cada vertical vive en el registro de su proyecto, con un project válido", () => {
    for (const n of normas) expect(["horizontal", "vertical"], `${n.id}: lado`).toContain(n.lado);
    expect(problemasDeProyectos(carga, proyectos)).toEqual([]);
    expect(Object.keys(carga.delProyecto).length, "hay al menos un registro de proyecto").toBeGreaterThan(0);
  });

  it("ningún estándar horizontal (tarea, común ni N2) lista una norma vertical: 0 por construcción, sin techo", () => {
    expect(verticalesEnEstandares(estandares, normas)).toEqual([]);
    for (const c of Object.values(leerN2(RAIZ).combinaciones)) for (const id of c.normas) expect(normas.find((n) => n.id === id)?.lado, `${id} en un N2`).toBe("horizontal");
    expect("verticales_en_estandares" in TECHOS, "el techo se eliminó: ahora es 0 por construcción").toBe(false);
  });

  it("cada vertical acaba en un test: de código con un *.test.js que existe, de juez con su test_del_juez o dentro del techo juez_sin_test_del_juez; las que no, en una lista que solo baja", () => {
    const verticales = Object.values(carga.delProyecto).flatMap((p) => p.normas ?? p);
    expect(verticales.length, "hay verticales que mirar").toBeGreaterThan(0);
    const fuera = sinControlDeTest(verticales, RAIZ).map((n) => n.id);
    expect(fuera.filter((id) => !(id in sinTest)), "Dale un test a su control, o ponla en verticales_sin_test_excepciones con su motivo").toEqual([]);
    for (const [id, motivo] of Object.entries(sinTest)) {
      expect(fuera, `${id}: ya acaba en un test, quítala de la lista y baja el techo`).toContain(id);
      expect(motivo.length, `${id}: motivo`).toBeGreaterThan(20);
    }
    expect(Object.keys(sinTest)).toHaveLength(TECHOS.verticales_sin_test);
    expect("verticales_sin_salida" in TECHOS, "llegar a una tarea con --proyecto no tiene excepciones: lo vigila ops/tareas-de-proyecto.test.js (#710)").toBe(false);
  });

  it("se ve fallar el control sin test: un control de código que no es un test, o que no existe, y un test del juez declarado que no existe", () => {
    const codigo = { id: "x", control_procesador: "codigo", control: "api/_bot/voz.test.js" };
    expect(sinControlDeTest([codigo], RAIZ)).toEqual([]);
    expect(sinControlDeTest([{ ...codigo, control: "api/_bot/voz.js" }], RAIZ)).toHaveLength(1);
    expect(sinControlDeTest([{ ...codigo, control: "api/_bot/noexiste.test.js" }], RAIZ)).toHaveLength(1);
    const juez = { id: "y", control_procesador: "juez", test_del_juez: null };
    expect(sinControlDeTest([juez], RAIZ)).toEqual([]);
    expect(sinControlDeTest([{ ...juez, test_del_juez: "ops/no-existe.test.js" }], RAIZ)).toHaveLength(1);
  });

  it("se ve fallar: una vertical citada por una tarea horizontal, una vertical en el registro horizontal y un project desconocido", () => {
    const vertical = normas.find((n) => n.lado === "vertical");
    const citada = structuredClone(estandares);
    citada.agentes.constructor.tareas[0].normas = [...(citada.agentes.constructor.tareas[0].normas ?? []), vertical.id];
    expect(verticalesEnEstandares(citada, normas)).toContain(vertical.id);
    const mal = structuredClone(carga);
    mal.horizontales = [...mal.horizontales, { ...vertical, project: undefined }];
    expect(problemasDeProyectos(mal, proyectos).join("\n")).toMatch(/su lado es «vertical»/);
    const otro = structuredClone(carga);
    otro.ficheros.homenu.normas[0] = { ...otro.ficheros.homenu.normas[0], project: "inventado" };
    expect(problemasDeProyectos(otro, proyectos).join("\n")).toMatch(/«inventado» no es un proyecto/);
  });

  it("la factoría es un proyecto, pero lo horizontal lo marca `lado`: ni un registro ops/proyectos/factoria/ ni una vertical con project factoria (#748)", () => {
    expect(PROYECTOS).toContain("factoria");
    expect(PROYECTOS_CON_NORMAS).toEqual(PROYECTOS.filter((p) => p !== "factoria"));
    // lo que de verdad hay: ninguna norma vertical dice factoria
    expect(carga.todas.filter((n) => n.lado === "vertical" && n.project === "factoria").map((n) => n.id)).toEqual([]);
    // con datos de mentira: la carpeta factoria y una vertical con project factoria fallan con la lista derivada por defecto
    const vertical = normas.find((n) => n.lado === "vertical");
    const carpeta = structuredClone(carga);
    carpeta.ficheros.factoria = { project: "factoria", normas: [{ ...vertical, project: "factoria" }] };
    const malos = problemasDeProyectos(carpeta).join("\n");
    expect(malos).toMatch(/ops\/proyectos\/factoria\/normas.json: «factoria» no es un proyecto con normas/);
    expect(malos).toMatch(/«project» «factoria» no es un proyecto con normas/);
    const dentro = structuredClone(carga);
    dentro.ficheros.homenu.normas[0] = { ...dentro.ficheros.homenu.normas[0], project: "factoria" };
    expect(problemasDeProyectos(dentro).join("\n")).toMatch(/«project» «factoria» no es un proyecto con normas/);
  });

  it("sin --proyecto no llega nada vertical, y con --proyecto llegan las de su ámbito y su acción", () => {
    const t = estandares.agentes.constructor.tareas.find((x) => x.id === "herramienta-de-lola");
    expect(normasDeTarea(t, estandares, normas).filter((x) => x.norma?.lado === "vertical")).toEqual([]);
    const con = normasDeTarea(t, estandares, normas, { proyecto: "homenu" }).filter((x) => x.norma?.lado === "vertical");
    expect(con.length).toBeGreaterThan(0);
    for (const x of con) expect(x.norma.project).toBe("homenu");
    expect(normasDeTarea(t, estandares, normas, { proyecto: "panel" }).filter((x) => x.norma?.lado === "vertical")).toEqual([]);
  });
});
