import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REFERENCIA, jsonEnReferenciaAvisando } from "../scripts/lib/forjaReferencia.mjs";
import { ARTEFACTOS, generarMd, leerForja, problemasDeForja } from "../scripts/lib/forja.mjs";
import {
  PARTES_BULLET, RUTA_EXCEPCIONES, bajarExcepciones, faltasDeRondas, leerExcepciones, leerRonda, lineaDeRonda,
  problemasDeExcepciones, problemasDeExcepcionesContraReferencia, problemasDeFormaDeclarada, problemasDePractica, problemasDeRondas,
} from "../scripts/lib/forjaForma.mjs";

/**
 * La forma de cada práctica, la fuente por bullet y las rondas de investigación (#458).
 * Todo es dato en ops/forja.json; aquí se valida. Aplicarlo a los estándares reales es de #454.
 * Falla cuando: la forma declarada no es válida, una práctica no cumple su forma (nº de bullets,
 * estructura y fuente: formal; voz, modo, tiempo y persona: material), un estándar no deja 3 rondas con
 * fuentes y no está en la lista de excepciones, o esa lista sube.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (r) => existsSync(join(RAIZ, r));
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const datos = leerForja(RAIZ);
const clon = () => structuredClone(datos);
const estandares = JSON.parse(leer("ops/estandares-agentes.json"));
const excepciones = leerExcepciones(RAIZ);

const bullet = (extra = {}) => ({
  regla: "Escribe la regla en imperativo y con un verbo concreto",
  porque: "Quien lee actúa sin tener que interpretar quién debe hacerlo",
  ejemplo_bueno: "Usa npm run test antes de abrir el PR",
  ejemplo_malo: "Conviene ejecutar los tests en algún momento",
  fuente: "[F] https://google.github.io/eng-practices/review/reviewer/standard.html",
  ...extra,
});
const practica = (n = 3, extra = {}) => ({ bullets: Array.from({ length: n }, () => bullet(extra)) });
const problemas = (p, d = datos) => problemasDePractica(p, "estandar", d, existe);
const criterios = (p, d = datos) => problemas(p, d).map((x) => x.criterio);

describe("forma_practica: el dato declarado", () => {
  it("es válido y empieza por el estándar", () => {
    expect(problemasDeFormaDeclarada(datos, Object.keys(ARTEFACTOS))).toEqual([]);
    expect(Object.keys(datos.forma_practica)).toEqual(["estandar"]);
    expect(datos.forma_practica.estandar.estructura).toEqual(["regla", "porque", "ejemplo_bueno", "ejemplo_malo"]);
    expect(datos.forma_practica.estandar).toMatchObject({ voz: "activa", fuente_por_bullet: true });
  });
  const mal = (mut, trozo) => {
    const d = clon();
    mut(d.forma_practica.estandar, d);
    expect(problemasDeFormaDeclarada(d, Object.keys(ARTEFACTOS)).join("\n"), trozo).toContain(trozo);
  };
  it("falla con cada campo mal puesto", () => {
    mal((f) => { f.bullets = { min: 5, max: 2 }; }, "max no menor que min");
    mal((f) => { f.bullets = { min: 0, max: 2 }; }, "1 o más");
    mal((f) => { f.estructura = ["regla", "porque"]; }, "regla · porque · ejemplo_bueno · ejemplo_malo");
    mal((f) => { f.fuente_por_bullet = false; }, "fuente_por_bullet");
    mal((f) => { f.voz = "pasiva"; }, "voz");
    mal((f) => { f.modo_tiempo = "futuro"; }, "uno solo, imperativo o presente");
    mal((f) => { f.persona = "primera"; }, "persona");
    mal((f, d) => { d.forma_practica.coche = f; }, "no es un artefacto");
    const d = clon();
    delete d.forma_practica;
    expect(problemasDeFormaDeclarada(d, Object.keys(ARTEFACTOS)).join()).toContain("falta forma_practica");
    const e = clon();
    e.metodo_construccion.rondas_minimas = 0;
    expect(problemasDeFormaDeclarada(e, Object.keys(ARTEFACTOS)).join()).toContain("rondas_minimas");
  });
});

describe("una práctica contra su forma", () => {
  it("una buena pasa", () => expect(problemas(practica(3))).toEqual([]));
  it("el número de bullets es formal: de 2 a 5", () => {
    expect(criterios(practica(1))).toEqual(["practica-numero-de-bullets"]);
    expect(criterios(practica(6))).toEqual(["practica-numero-de-bullets"]);
    expect(problemas(practica(2))).toEqual([]);
    expect(problemas(practica(5))).toEqual([]);
    expect(criterios({})).toEqual(["practica-numero-de-bullets"]);
    expect(problemasDePractica(practica(), "agente", datos, existe)[0].mensaje).toContain("no tiene forma_practica");
  });
  it("la estructura del bullet es formal: sus cuatro partes, ninguna vacía, los ejemplos distintos", () => {
    for (const parte of PARTES_BULLET) {
      const p = practica(3);
      delete p.bullets[1][parte];
      expect(problemas(p).map((x) => x.criterio), parte).toEqual(["practica-estructura-del-bullet"]);
      expect(problemas(p)[0].mensaje).toContain(`falta «${parte}»`);
    }
    const corta = practica(3);
    corta.bullets[0].porque = "corto";
    expect(criterios(corta)).toEqual(["practica-estructura-del-bullet"]);
    const igual = practica(3);
    igual.bullets[0].ejemplo_malo = igual.bullets[0].ejemplo_bueno;
    expect(problemas(igual)[0].mensaje).toContain("el mismo");
    const extra = practica(3);
    extra.bullets[0].comentario = "algo";
    expect(problemas(extra)[0].mensaje).toContain("campo «comentario» no admitido");
  });
  it("la fuente de cada bullet es formal: [F] con https o [I] con una ruta que existe", () => {
    const con = (fuente) => practica(3, { fuente });
    expect(problemas(con("[I] ops/forja.json"))).toEqual([]);
    for (const mala of ["https://x.com/a", "[F] http://x.com/a", "[F] https://x.com", "[X] ops/forja.json", "", undefined]) expect(criterios(con(mala)), String(mala)).toContain("practica-fuente-por-bullet");
    expect(problemas(con("[I] ops/no-existe.md"))[0].mensaje).toContain("que no existe");
    const una = practica(3);
    delete una.bullets[2].fuente;
    expect(problemas(una)[0].mensaje).toContain("bullet 3");
  });
  it("la voz es material: la pasiva con «ser» y la refleja con «se» fallan", () => {
    for (const regla of ["El resultado es revisado por otra persona", "Escribe lo que fue acordado antes", "Se calcula el total antes de abrir el PR"]) {
      const p = practica(3);
      p.bullets[0].regla = regla;
      expect(criterios(p), regla).toContain("practica-voz-activa");
    }
    const porque = practica(3);
    porque.bullets[1].porque = "Así el cambio es aprobado más rápido";
    expect(criterios(porque)).toContain("practica-voz-activa");
    const activa = practica(3);
    activa.bullets[0].regla = "Revisa el resultado con otra persona";
    expect(problemas(activa)).toEqual([]);
  });
  it("el modo, el tiempo y la persona son materiales: un solo imperativo en segunda persona", () => {
    const con = (regla, parte = "regla") => { const p = practica(3); p.bullets[0][parte] = regla; return criterios(p); };
    expect(con("Abrirá el PR con el CI en verde")).toContain("practica-modo-tiempo-persona");
    expect(con("Abrió el PR con el CI en verde")).toContain("practica-modo-tiempo-persona");
    expect(con("Abre el PR y comprobaba el CI")).toContain("practica-modo-tiempo-persona");
    expect(con("El PR lleva el CI en verde")).toContain("practica-modo-tiempo-persona");
    expect(con("Cada PR debe llevar el CI en verde")).toContain("practica-modo-tiempo-persona");
    expect(con("Abre nuestro PR con el CI en verde")).toContain("practica-modo-tiempo-persona");
    expect(con("Así usted sabe qué pasa", "porque")).toContain("practica-modo-tiempo-persona");
    expect(con("Abre el PR con el CI en verde")).toEqual([]);
  });
  /**
   * Las 19 reglas de la revisión del juez (12 de h2 y 7 de h3): antes la heurística marcaba 12 de 19 (11 falsos
   * positivos, contando «estaba» como acierto); ahora solo marca las que tienen un pasado de verdad.
   */
  const DEL_JUEZ = [
    ["Lee el log antes de tocar nada y formula una hipótesis.", "Porque el síntoma engaña si no miras primero el error exacto del CI.", false],
    ["Devuelve el fallo con fichero y error cuando el rojo es del producto.", "Así quien lo hizo sabe dónde mirar sin reproducirlo otra vez.", false],
    ["Prueba con workflow_dispatch en tu rama antes de fiarte del cron.", "El cron solo corre en main y un fallo ahí llega a producción sin que nadie lo vea.", false],
    ["Pon el permiso mínimo en cada workflow.", "Un token con permisos de más convierte un paso comprometido en acceso al repo.", false],
    ["Mira qué hace el script, no qué proveedor trae escrito.", "Porque el nombre engaña y se generó una imagen con el modelo equivocado.", false],
    ["Cuando se acabe el plazo, avisa a Pablo por el issue.", "La alerta se pierde si nadie la ve, y el plazo vence en silencio.", false],
    ["Escribe la fecha que da npm run hora, nunca la de date.", "En Git Bash date devolvió la hora UTC y las horas límite salieron 2 h antes.", false],
    ["Anota el motivo cuando cambió el vocabulario.", "Porque el cambio se pierde si solo queda en el chat y no en el repo.", true],
    ["Aplica la migración que se ensayó hace menos de una hora.", "Un ensayo viejo no vale: el esquema cambió desde entonces.", true],
    ["Cierra el issue con el PR que lo arregla; no lo cierres a mano.", "Así el cierre queda enlazado y cuenta como arreglado en las cifras.", false],
    ["Revisa los tests porque fallaba el de ayer.", "La causa es de antes de ayer, y se vio en el log del martes.", true],
    ["Usa se como clave si el vocabulario lo pide.", "Se trata de un identificador, no de una pasiva.", false],
    ["Revisa la librería y la batería de pruebas.", "Porque lo dice la fuente de la casa en detalle", false],
    ["Lee la tubería del CI.", "Porque lo dice la fuente de la casa en detalle", false],
    ["Actualiza la galería de la ingeniería.", "Porque lo dice la fuente de la casa en detalle", false],
    ["Pregunta a Pablo cuando se te olvide algo.", "Porque lo dice la fuente de la casa en detalle", false],
    ["Pide el permiso: se puede cuando hay PR.", "Porque lo dice la fuente de la casa en detalle", false],
    ["Evita el estaba (nombre propio) en la app.", "Porque lo dice la fuente de la casa en detalle", true],
    ["Cierra lo que se hace en la sesión.", "Porque lo dice la fuente de la casa en detalle", false],
  ];
  it("las 19 reglas del juez: las buenas no se marcan; «se ensayó», «fallaba» y «cambió» sí", () => {
    expect(DEL_JUEZ).toHaveLength(19);
    for (const [regla, porque, marca] of DEL_JUEZ) {
      const p = practica(2);
      p.bullets.forEach((b) => { b.regla = regla; b.porque = porque; });
      const r = problemas(p).filter((x) => /voz|modo/.test(x.criterio));
      expect(r.length > 0, regla).toBe(marca);
    }
    expect(DEL_JUEZ.filter((x) => x[2])).toHaveLength(4);
  });
  it("«se» + verbo solo cuenta si abre la regla, y no con {puede, pueda, trata, te, me, acabe}", () => {
    const con = (regla) => { const p = practica(3); p.bullets[0].regla = regla; return criterios(p); };
    expect(con("Se lee el log antes de tocar nada")).toContain("practica-voz-activa");
    expect(con("Se prueba con workflow_dispatch en la rama")).toContain("practica-voz-activa");
    for (const sana of ["Pide permiso cuando se pueda", "Revisa lo que se trata aparte", "Se puede abrir el PR con el CI en verde", "Se trata de abrir el PR a tiempo", "Se acabe antes de abrir el PR"]) expect(con(sana), sana).not.toContain("practica-voz-activa");
    expect(con("Cierra lo que se hace en la sesión")).not.toContain("practica-voz-activa");
  });
  it("el condicional («-ería») y el «-ó» suelto ya no cuentan como otro tiempo; el futuro y el pasado sí", () => {
    const con = (regla) => { const p = practica(3); p.bullets[0].regla = regla; return criterios(p); };
    for (const sana of ["Mira la librería", "Revisa la categoría", "Compara la ingeniería", "Avisa a Mercadona"]) expect(con(sana), sana).not.toContain("practica-modo-tiempo-persona");
    for (const mala of ["Revisará la cola", "Ensayó la migración", "Cambió el estado", "Fallaban los tests"]) expect(con(mala), mala).toContain("practica-modo-tiempo-persona");
  });
  it("cada criterio que emite existe en la base, con la capa que toca", () => {
    const capas = (id) => datos.criterios.find((c) => c.id === id)?.capa;
    const formales = ["practica-numero-de-bullets", "practica-estructura-del-bullet", "practica-fuente-por-bullet"];
    const materiales = ["practica-voz-activa", "practica-modo-tiempo-persona"];
    for (const id of formales) expect(capas(id), id).toBe("formal");
    for (const id of materiales) expect(capas(id), id).toBe("material");
    const p = practica(1);
    p.bullets[0] = bullet({ fuente: "mala", regla: "El PR es revisado luego y abrirá otro" });
    const r = problemas(p);
    expect(new Set(r.map((x) => x.capa))).toEqual(new Set(["formal", "material"]));
    for (const x of r) expect(x.capa, x.criterio).toBe(capas(x.criterio));
  });
  it("si falta el criterio en la base, la capa lo dice", () => {
    const d = clon();
    d.criterios = d.criterios.filter((c) => c.id !== "practica-voz-activa");
    const p = practica(3);
    p.bullets[0].regla = "El resultado es revisado";
    expect(problemas(p, d)[0].capa).toContain("sin dar de alta");
  });
});

describe("las rondas de investigación", () => {
  const ok = ["ronda: 1 fuentes: 4 cambios: lista inicial de prácticas", "ronda: 2 fuentes: 3 cambios: se descartan dos por ser de un blog", "ronda: 3 fuentes: 2 cambios: se fija la estructura de cada bullet"];
  it("tres o más con fuentes pasan; la línea se escribe y se lee", () => {
    expect(problemasDeRondas(ok, datos)).toEqual([]);
    expect(problemasDeRondas([...ok, "ronda: 4 fuentes: 1 cambios: retoque"], datos)).toEqual([]);
    expect(leerRonda(ok[0])).toEqual({ n: 1, fuentes: 4, cambios: "lista inicial de prácticas" });
    expect(lineaDeRonda(leerRonda(ok[1]))).toBe(ok[1]);
  });
  it("falla con menos de tres, sin fuentes, mal numeradas, mal escritas o sin registro", () => {
    expect(problemasDeRondas(ok.slice(0, 2), datos).join()).toContain("2 rondas con fuentes; el método pide 3");
    expect(problemasDeRondas([ok[0], ok[1], "ronda: 3 fuentes: 0 cambios: nada"], datos).join()).toContain("0 fuentes");
    expect(problemasDeRondas([ok[0], ok[1], "ronda: 3 fuentes: 0 cambios: nada"], datos).join()).toContain("2 rondas con fuentes");
    expect(problemasDeRondas([ok[0], ok[2], ok[1]], datos).join()).toContain("van 1, 2, 3");
    expect(problemasDeRondas([ok[0], ok[1], "ronda 3 con 2 fuentes"], datos).join()).toContain("no tiene la forma");
    expect(problemasDeRondas(undefined, datos).join()).toContain("sin registro de rondas");
    expect(problemasDeRondas([], datos).join()).toContain("0 rondas con fuentes");
    const d = clon();
    d.metodo_construccion.rondas_minimas = 4;
    expect(problemasDeRondas(ok, d).join()).toContain("pide 4");
  });
  it("hoy ningún estándar real lo cumple: todos están en la lista de excepciones, y solo ellos", () => {
    const faltas = faltasDeRondas(estandares, datos);
    expect(Object.keys(faltas).length).toBeGreaterThan(30);
    expect(problemasDeExcepciones(faltas, excepciones.rondas, "sin 3 rondas con fuentes"), "Lanza «npm run forja -- --escribir» para bajar la lista; una falta nueva se corrige, no se añade").toEqual([]);
    expect(excepciones.sembrado).toBe(true);
  });
  it("un estándar con sus rondas deja de ser falta; uno nuevo sin ellas, sí", () => {
    const e = structuredClone(estandares);
    const [agente, ag] = Object.entries(e.agentes).find(([, a]) => a.tareas[0].reglas);
    ag.tareas[0].rondas = ok;
    expect(faltasDeRondas(e, datos)[`estandar:${agente}/${ag.tareas[0].id}`]).toBeUndefined();
    expect(problemasDeExcepciones(faltasDeRondas(e, datos), excepciones.rondas, "x").join()).toContain("Baja la excepción");
    ag.tareas.push({ id: "tarea-nueva", tarea: "Una tarea nueva sin rastro de rondas", reglas: [{}] });
    expect(problemasDeExcepciones(faltasDeRondas(e, datos), excepciones.rondas, "x").join()).toContain(`${agente}/tarea-nueva`);
  });
  it("una tarea sin reglas (sin estándar escrito) no cuenta; una común sin rondas, sí (#516)", () => {
    const e = { agentes: { uno: { tareas: [{ id: "una", tarea: "Una tarea sin estándar todavía" }] } } };
    expect(faltasDeRondas(e, datos)).toEqual({});
    expect(faltasDeRondas({ agentes: {}, comunes: { una: { reglas: [{}] }, otra: { reglas: [{}], rondas: ok } } }, datos)).toEqual({ "estandar:comun/una": 1 });
  });
});

describe("las excepciones solo bajan", () => {
  it("más faltas que las toleradas, o menos y la lista sin bajar, falla", () => {
    expect(problemasDeExcepciones({ a: 1 }, { a: 1 }, "x")).toEqual([]);
    expect(problemasDeExcepciones({ a: 2 }, { a: 1 }, "x").join()).toContain("solo baja");
    expect(problemasDeExcepciones({ b: 1 }, {}, "x").join()).toContain("se toleran 0");
    expect(problemasDeExcepciones({}, { a: 1 }, "x").join()).toContain("Baja la excepción");
    expect(problemasDeExcepciones({ a: 1 }, { a: 0 }, "x").join()).toContain("entero de 1 o más");
  });
  it("bajar nunca sube ni añade, salvo la siembra inicial", () => {
    expect(bajarExcepciones({ a: 1, b: 5, c: 1 }, { a: 3, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(bajarExcepciones({ a: 1 }, { a: 3, z: 1 })).toEqual({ a: 1 });
    expect(bajarExcepciones({ a: 1, b: 2 }, {}, { sembrar: true })).toEqual({ a: 1, b: 2 });
  });
  it("contra la referencia: ninguna excepción nueva ni más alta", () => {
    expect(problemasDeExcepcionesContraReferencia({ a: 1 }, { a: 1, b: 1 })).toEqual([]);
    expect(problemasDeExcepcionesContraReferencia({ a: 2 }, { a: 1 }).join()).toContain("sube de 1 a 2");
    expect(problemasDeExcepcionesContraReferencia({ n: 1 }, { a: 1 }).join()).toContain("excepción nueva");
  });
});

const REF = REFERENCIA();
const enRef = jsonEnReferenciaAvisando(RAIZ, REF, RUTA_EXCEPCIONES, "excepciones");
describe(`las excepciones contra ${REF}`, () => {
  it.skipIf(!enRef || !enRef.sembrado)("no suben", () => {
    expect(problemasDeExcepcionesContraReferencia(excepciones.rondas, enRef.rondas)).toEqual([]);
  });
});

describe("los criterios de esta parte en la base", () => {
  const ids = ["practica-numero-de-bullets", "practica-estructura-del-bullet", "practica-fuente-por-bullet", "practica-voz-activa", "practica-modo-tiempo-persona", "estandar-rondas-de-investigacion", "vocabulario-canonico"];
  it("están dados de alta, con su capa y su control", () => {
    const por = (id) => datos.criterios.find((c) => c.id === id);
    for (const id of ids) expect(por(id), id).toBeDefined();
    for (const id of ids.slice(0, 3)) expect(por(id).capa).toBe("formal");
    for (const id of ids.slice(3)) expect(por(id).capa).toBe("material");
    for (const id of ids.slice(0, 6)) expect(por(id).control).toBe("ops/forja-forma.test.js");
  });
  it("vocabulario-canonico lo vigila el glosario de #469", () => {
    const c = datos.criterios.find((x) => x.id === "vocabulario-canonico");
    expect(c).toMatchObject({ capa: "material", control: "ops/glosario.test.js", aplica_a: ["skill", "estandar"], tipos: "todos" });
    expect(c).not.toHaveProperty("pendiente_de");
    expect(c).not.toHaveProperty("control_pendiente");
  });
  it("un criterio pendiente falla si está mal puesto o si su fichero ya existe", () => {
    // Un criterio provisional de mentira: su control lo da otro encargo y aún no existe.
    const futuro = "ops/futuro.test.js";
    const provisional = (c) => Object.assign(c, { control: "juicio", pendiente_de: "#999", control_pendiente: futuro });
    const f = (mut, trozo, existeX = existe) => {
      const d = clon();
      const c = provisional(d.criterios.find((x) => x.id === "vocabulario-canonico"));
      mut(c);
      expect(problemasDeForja(d, existeX).join("\n"), trozo).toContain(trozo);
    };
    const bien = clon();
    provisional(bien.criterios.find((x) => x.id === "vocabulario-canonico"));
    expect(problemasDeForja(bien, existe)).toEqual([]);
    f((c) => { delete c.pendiente_de; }, "van juntos");
    f((c) => { delete c.control_pendiente; }, "van juntos");
    f((c) => { c.pendiente_de = "999"; }, "pendiente_de es el issue");
    f((c) => { c.control_pendiente = ""; }, "control_pendiente es la ruta");
    f((c) => { c.control = "ops/forja.json"; }, "lleva control «juicio»");
    f((c) => { c.motivo_pendiente = "falta_decision"; }, "solo está pendiente de su control (falta_herramienta)");
    f((c) => { c.motivo_pendiente = "sin_mirar"; }, "motivo_pendiente «sin_mirar» no está en el vocabulario");
    f(() => {}, `ya existe ${futuro}`, (r) => existe(r) || r === futuro);
    f((c) => { delete c.pendiente_de; delete c.control_pendiente; }, "lo vigila un fichero, no «juicio»");
    expect(generarMd(bien)).toContain("provisional: lo da #999");
  });
  it("un criterio subjetivo pendiente (#457) lleva su issue y un motivo cerrado, y sigue con control «juicio»", () => {
    const sub = datos.criterios.find((x) => x.id === "solo-lo-que-el-modelo-no-sabe");
    expect(sub).toMatchObject({ capa: "subjetiva", control: "juicio", motivo_pendiente: "falta_herramienta" });
    expect(problemasDeForja(datos, existe)).toEqual([]);
    const f = (mut, trozo) => {
      const d = clon();
      mut(d.criterios.find((x) => x.id === sub.id));
      expect(problemasDeForja(d, existe).join("\n"), trozo).toContain(trozo);
    };
    f((c) => { delete c.motivo_pendiente; }, "pendiente_de y motivo_pendiente van juntos");
    f((c) => { delete c.pendiente_de; }, "pendiente_de y motivo_pendiente van juntos");
    f((c) => { c.motivo_pendiente = "otra_version"; }, "no está en el vocabulario");
    f((c) => { c.pendiente_de = "517"; }, "pendiente_de es el issue");
    f((c) => { c.control_pendiente = "ops/forja.json"; }, "ya existe ops/forja.json");
    expect(generarMd(datos)).toContain(`Pendiente (falta_herramienta): lo da ${sub.pendiente_de}.`);
  });
  it("FORJA.md recoge la forma, el método y el control del glosario", () => {
    const md = leer("docs/ops/FORJA.md");
    expect(md).toBe(generarMd(datos));
    expect(md).toContain("## La forma de una práctica");
    expect(md).toContain("regla · porque · ejemplo_bueno · ejemplo_malo");
    expect(md).toContain("## Método de construcción");
    expect(md).toContain("Se comprueba con: `ops/glosario.test.js`");
  });
});
