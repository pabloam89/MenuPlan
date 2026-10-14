import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DOMINIOS_OPCIONALES } from "../scripts/lib/ambitos.mjs";
import { leerEstandares, normasDeTarea, tareasDe, textoDeTarea, verticalesPorProyecto } from "../scripts/lib/estandaresAgentes.mjs";
import { cargarNormas, dominiosDeProyecto, problemasDeDominios } from "../scripts/lib/normas.mjs";
import { problemasDeRegla } from "../scripts/lib/regla.mjs";
import { conTareasDeProyecto, leerTareasDeProyecto, problemasDeTareasDeProyecto } from "../scripts/lib/tareasDeProyecto.mjs";
import { LECTORES } from "../scripts/lib/topes.mjs";

/**
 * Toda norma, también la vertical, llega al estándar de una tarea de un agente (#710, decisión de Pablo del 13 oct 2026).
 * Una tarea general vive en el agente y las normas del proyecto le llegan por `--proyecto`; una que solo existe en el proyecto vive
 * en ops/proyectos/<id>/tareas.json. Aquí: esas tareas son válidas, el dominio opcional `bot` se declara por proyecto y lo vertical
 * se escribe como lo de la Base. Cada regla se ve fallar con datos malos (cada caso cambia UNA cosa).
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const entidades = JSON.parse(readFileSync(join(RAIZ, "ops", "entidades.json"), "utf8"));
const proyectos = entidades.projects;
const ids = proyectos.map((p) => p.id);
const datos = leerEstandares(RAIZ);
const carga = cargarNormas(RAIZ);
const registros = leerTareasDeProyecto(RAIZ, ids);
const normas = carga.todas;
const verticales = Object.values(carga.delProyecto).flat();
const delBot = (id) => (carga.delProyecto[id] ?? []).filter((n) => DOMINIOS_OPCIONALES.includes(n.ambito));

const NOMBRES_DE_PROYECTO = new RegExp(`\\b(?:${ids.join("|")})\\b`, "i");
// Los textos de las tareas generales: frase, lo que no hace y sus reglas. Un ejemplo de lo que se escribe en una ficha (ejemplo_bueno/malo) no cuenta.
function nombranProyecto(d) {
  const sinEjemplos = (v) => JSON.stringify(v, (k, x) => (k === "ejemplo_bueno" || k === "ejemplo_malo" ? undefined : x));
  return tareasDe(d).filter(({ tarea }) => NOMBRES_DE_PROYECTO.test(sinEjemplos({ t: tarea.tarea, n: tarea.no_hace, r: tarea.reglas }))).map(({ agente, tarea }) => `${agente}/${tarea.id}`);
}

describe("las tareas que solo existen en un proyecto (#710)", () => {
  it("cada registro de tareas de proyecto es válido: agente que existe, campos, ids, vocabulario y alguna norma que le llega", () => {
    expect(Object.keys(registros).length, "hay un proyecto con tareas propias").toBeGreaterThan(0);
    for (const [id, r] of Object.entries(registros)) {
      expect(problemasDeTareasDeProyecto(r, id, { datos, normas, proyectos: ids, dominios: dominiosDeProyecto(RAIZ, id) }), id).toEqual([]);
    }
  });

  const mal = (cambio) => {
    const r = structuredClone(registros.homenu);
    cambio(r, r.agentes.constructor.tareas[0]);
    return problemasDeTareasDeProyecto(r, "homenu", { datos, normas, proyectos: ids, dominios: dominiosDeProyecto(RAIZ, "homenu") }).join("\n");
  };
  it.each([
    ["un agente que no existe", (r) => { r.agentes.fantasma = r.agentes.constructor; }, /agente «fantasma» no está/],
    ["un project que no es el de la carpeta", (r) => { r.project = "panel"; }, /su «project» es «panel»/],
    ["una tarea con el id de una general del mismo agente", (r, t) => { t.id = "paso-a-main"; }, /ya es una tarea general/],
    ["un id repetido", (r) => { r.agentes.constructor.tareas.push(structuredClone(r.agentes.constructor.tareas[0])); }, /id repetido/],
    ["una acción fuera del vocabulario", (r, t) => { t.accion = "inventar"; }, /acción «inventar» fuera del vocabulario/],
    ["un ámbito fuera del vocabulario", (r, t) => { t.ambitos = ["cocina"]; }, /ámbito «cocina» fuera del vocabulario/],
    ["un campo que no admite (reglas propias)", (r, t) => { t.reglas = []; }, /campo «reglas» no admitido/],
    ["sin lista de lo que no hace", (r, t) => { delete t.no_hace; }, /«no_hace» es una lista/],
    ["una tarea a la que no le llega ninguna norma del proyecto", (r, t) => { t.ambitos = ["infra"]; t.accion = "operar"; delete t.normas; }, /ninguna norma del proyecto le llega/],
    ["una norma citada que no existe", (r, t) => { t.normas = ["no-existe"]; }, /la norma «no-existe» no es una norma del proyecto homenu/],
    ["una norma citada que no es de la acción de la tarea", (r, t) => { t.accion = "decidir"; }, /no se aplica al «decidir»/],
    ["sin ámbitos ni normas citadas", (r, t) => { t.ambitos = []; delete t.normas; }, /«ambitos» es una lista de ámbitos/],
  ])("falla con %s", (_, cambio, esperado) => {
    expect(mal(cambio)).toMatch(esperado);
  });
});

describe("toda norma vertical llega al estándar de una tarea con `--proyecto` (#710; antes 12 sin salida, #704)", () => {
  for (const id of Object.keys(carga.delProyecto)) {
    it(`las normas de ${id} llegan a alguna tarea, general o del proyecto, por su ámbito y su acción`, () => {
      const con = conTareasDeProyecto(datos, registros[id]);
      const { llegan, sinSalida } = verticalesPorProyecto(con, normas, id, dominiosDeProyecto(RAIZ, id));
      expect(sinSalida, "Crea la tarea que falta: general en el agente o del proyecto en su tareas.json").toEqual([]);
      expect(llegan.length).toBe(carga.delProyecto[id].length);
    });
  }

  it("se ve fallar: sin las tareas del proyecto, las normas del catálogo (12 en #714) no llegan a ninguna tarea", () => {
    const { sinSalida } = verticalesPorProyecto(datos, normas, "homenu", dominiosDeProyecto(RAIZ, "homenu"));
    expect(sinSalida).toContain("solo-estrella-se-propone");
    expect(sinSalida).toContain("catalogo-mercadona-minimo");
    expect(sinSalida).toContain("foodid-nulo-mira-las-dos-tablas");
  });

  it("la tarea de un proyecto solo se ve con --proyecto, y trae sus normas por referencia", () => {
    const con = conTareasDeProyecto(datos, registros.homenu);
    const sin = textoDeTarea("constructor", "receta-y-ficha-del-catalogo", datos, { normas, sujetos: carga.sujetos });
    expect(sin).toBeNull();
    const con_ = textoDeTarea("constructor", "receta-y-ficha-del-catalogo", con, { normas, sujetos: carga.sujetos }, { proyecto: "homenu", dominios: ["bot"] });
    expect(con_).toContain("solo-estrella-se-propone");
    expect(con_).toContain("proyecto homenu");
  });

  it("ninguna tarea general nombra un proyecto: ni en su frase, ni en lo que no hace, ni en sus reglas", () => {
    const delProyecto = new Set(Object.values(registros).flatMap((r) => Object.values(r.agentes).flatMap((a) => a.tareas.map((t) => t.id))));
    for (const { tarea } of tareasDe(datos)) expect(delProyecto.has(tarea.id), tarea.id).toBe(false);
    expect(nombranProyecto(datos), "Una tarea general no nombra el proyecto: lo de HoMenu va a ops/proyectos/homenu/").toEqual([]);
  });

  it("se ve fallar: una tarea general que nombra el proyecto en su frase, en lo que no hace o en una regla", () => {
    const con = (cambio) => { const d = structuredClone(datos); cambio(tareasDe(d)[0].tarea); return nombranProyecto(d).length; };
    expect(con((t) => { t.tarea = `${t.tarea} de HoMenu`; })).toBe(1);
    expect(con((t) => { t.no_hace = [...(t.no_hace ?? []), "tocar la base de homenu"]; })).toBe(1);
    expect(con((t) => { t.reglas = [...(t.reglas ?? []), { nombre: "x", practica: "mira HoMenu" }]; })).toBe(1);
  });
});

describe("el dominio `bot` es opcional por proyecto (#710)", () => {
  const tareasDeBot = (con) => tareasDe(con).filter(({ tarea }) => tarea.ambitos.includes("bot"));
  const recibidas = (id, dominios) => {
    const con = conTareasDeProyecto(datos, registros[id]);
    return new Set(tareasDeBot(con).flatMap(({ tarea }) => normasDeTarea(tarea, con, normas, { proyecto: id, dominios }).filter((x) => x.norma?.project === id).map((x) => x.norma.id)));
  };

  it("los dominios que declara un proyecto son opcionales y sus normas de ese ámbito lo exigen", () => {
    expect(problemasDeDominios(carga, proyectos)).toEqual([]);
  });

  it("un proyecto que declara el bot recibe en los briefs de sus tareas del bot todas sus normas del bot", () => {
    for (const id of ids) {
      const debe = delBot(id);
      if (!dominiosDeProyecto(RAIZ, id).includes("bot")) continue;
      expect(debe.length, `${id} declara el bot y no tiene normas del bot`).toBeGreaterThan(0);
      const llegan = recibidas(id, dominiosDeProyecto(RAIZ, id));
      expect(debe.filter((n) => !llegan.has(n.id)).map((n) => n.id)).toEqual([]);
    }
  });

  it("el brief que pega /orquestar (npm run estandar … --proyecto) lleva las normas del bot si el proyecto lo declara y ninguna si no", () => {
    const con = conTareasDeProyecto(datos, registros.homenu);
    const brief = (dominios) => textoDeTarea("constructor", "herramienta-de-lola", con, { normas, sujetos: carga.sujetos }, { proyecto: "homenu", dominios });
    const ids_ = delBot("homenu").filter((n) => n.acciones.some((a) => ["construir", "juzgar"].includes(a))).map((n) => n.id);
    expect(ids_.length).toBeGreaterThan(0);
    for (const id of ids_) expect(brief(["bot"]), id).toContain(`\`${id}\``);
    for (const id of ids_) expect(brief([]), id).not.toContain(`\`${id}\``);
  });

  it("se ve fallar: un proyecto sin el bot declarado no recibe ninguna norma del bot", () => {
    expect([...recibidas("homenu", [])].filter((id) => delBot("homenu").some((n) => n.id === id))).toEqual([]);
  });

  it("se ve fallar: un proyecto con normas del bot y sin declararlo, o con un dominio que no es opcional", () => {
    const sinDeclarar = proyectos.map((p) => (p.id === "homenu" ? { ...p, dominios: [] } : p));
    expect(problemasDeDominios(carga, sinDeclarar).join("\n")).toMatch(/es del dominio opcional «bot» y el proyecto homenu no lo declara/);
    const raro = proyectos.map((p) => (p.id === "homenu" ? { ...p, dominios: ["bot", "data"] } : p));
    expect(problemasDeDominios(carga, raro).join("\n")).toMatch(/el dominio «data» no es opcional/);
    const repetido = proyectos.map((p) => (p.id === "homenu" ? { ...p, dominios: ["bot", "bot"] } : p));
    expect(problemasDeDominios(carga, repetido).join("\n")).toMatch(/repite un dominio/);
  });
});

describe("lo vertical se escribe como la Base (#710): mismos tipos de texto, topes y reglas de redacción", () => {
  it("cada norma de un proyecto pasa la misma guía de redacción que las horizontales", () => {
    for (const n of verticales) expect(problemasDeRegla(n, n.id, carga.sujetos), n.id).toEqual([]);
  });

  it("se ve fallar: una norma vertical mal escrita no pasa", () => {
    const mala = { ...verticales[0], exigencia: "El tope se aplica antes." };
    expect(problemasDeRegla(mala, mala.id, carga.sujetos).length).toBeGreaterThan(0);
  });

  it("las tareas del proyecto se miden con el tope de `tarea.tarea` (npm run topes), igual que las del agente", () => {
    const medidas = new Set(LECTORES["tarea.tarea"](RAIZ));
    for (const r of Object.values(registros)) for (const a of Object.values(r.agentes)) for (const t of a.tareas) expect(medidas.has(t.tarea), t.id).toBe(true);
  });
});
