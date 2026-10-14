/**
 * escalaProyectos.mjs — la prueba de que la factoría escala (principio `scales-by-design`, norma `pieza-vale-con-un-proyecto-mas`).
 *
 * Un tercer proyecto, el SINTÉTICO (scripts/fixtures/proyecto-sintetico/), que no existe en ningún registro real. Se copia a una
 * raíz temporal junto a ops/, docs/ y .claude/, y con esa raíz se ejecutan los lectores y vigilantes que recorren proyectos
 * (normas, tareas de proyecto, estándares, glosario, principios, topes e inventario de lados). Cada SONDA devuelve una lista de
 * problemas: vacía = la pieza vale con un proyecto más sin tocarla. Las del primer grupo (SONDAS) deben salir vacías hoy; las
 * del segundo (SONDAS_CONOCIDAS) son la auditoría medida de lo que aún solo vale para los proyectos reales: su cifra tiene techo
 * en ops/normas-techos.json y solo baja.
 *
 * Contar los literales de id de proyecto que quedan escritos a mano (código, registros y tests) NO es de aquí: lo mide el vigilante de
 * ataduras de #795 (scripts/lib/atadurasProyecto.mjs, techos en ops/techos-lados.json). Esta prueba mide el comportamiento: qué
 * pieza deja de valer cuando la lista tiene un proyecto más.
 *
 * No toca el repo: todo ocurre en una carpeta temporal que borra `limpiar()`.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { activos, leerGlosario, leerGlosarioDeProyecto, problemasDeGlosario, problemasDeLadosDelGlosario } from "./glosario.mjs";
import { calcular, nombraProyecto } from "./inventarioVertical.mjs";
import { cargarNormas, controlExiste, dominiosDeProyecto, problemasDeDominios, problemasDeProyectos, problemasDeRegistro } from "./normas.mjs";
import { existeEn, leerCatalogoPropio, leerPrincipiosCasa, leerPrincipiosDeProyecto, leerTextoEn, problemasDePrincipios } from "./principios.mjs";
import { conTareasDeProyecto, leerTareasDeProyecto, problemasDeTareasDeProyecto } from "./tareasDeProyecto.mjs";
import { leerEstandares, normasDeTarea, tareasDe } from "./estandaresAgentes.mjs";
import { LECTORES } from "./topes.mjs";
import { PROYECTOS } from "./zonasProyecto.mjs";
import { proyectoDe } from "../../.claude/hooks/eventos.mjs";

export const RUTA_FIXTURE = "scripts/fixtures/proyecto-sintetico";
/** Lo que se copia a la raíz temporal: los registros y lo que sus rutas citan. */
export const COPIAS = ["ops", "docs", ".claude", "specs", "CLAUDE.md"];

/** Su entrada de `projects` (sin el comentario) y su id, leídos del fixture. */
export function leerSintetico(raiz) {
  const { $comentario, ...entrada } = JSON.parse(readFileSync(join(raiz, RUTA_FIXTURE, "proyecto.json"), "utf8"));
  return entrada;
}

/**
 * Crea la raíz temporal con el proyecto sintético dado de alta: su entrada en ops/entidades.json y su carpeta en
 * ops/proyectos/<id>/. Es un repositorio git propio (el inventario de lados lista los ficheros con git). `limpiar()` la borra.
 */
export function crearRaizSintetica(raiz) {
  const entrada = leerSintetico(raiz);
  const tmp = mkdtempSync(join(tmpdir(), "escala-sintetico-"));
  for (const c of COPIAS) cpSync(join(raiz, c), join(tmp, c), { recursive: true });
  cpSync(join(raiz, RUTA_FIXTURE), join(tmp, "ops", "proyectos", entrada.id), { recursive: true });
  rmSync(join(tmp, "ops", "proyectos", entrada.id, "proyecto.json"));
  const ent = JSON.parse(readFileSync(join(tmp, "ops", "entidades.json"), "utf8"));
  ent.projects.push(entrada);
  writeFileSync(join(tmp, "ops", "entidades.json"), `${JSON.stringify(ent, null, 2)}\n`);
  execFileSync("git", ["init", "-q"], { cwd: tmp, stdio: "ignore", windowsHide: true });
  execFileSync("git", ["add", "-A"], { cwd: tmp, stdio: "ignore", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return { tmp, id: entrada.id, entrada, limpiar: () => rmSync(tmp, { recursive: true, force: true }) };
}

const leerJson = (raiz, ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));

/** Lo que casi todas las sondas necesitan, leído de la raíz (con el sintético dentro). */
function contexto(tmp, id, raiz = tmp) {
  const entidades = leerJson(tmp, "ops/entidades.json");
  return { tmp, raiz, id, entidades, entrada: leerSintetico(raiz), ids: entidades.projects.map((p) => p.id), carga: cargarNormas(tmp), datos: leerEstandares(tmp) };
}

/** ¿Lee la pieza el registro del proyecto sintético? Si no, la sonda no mide nada y debe fallar, no pasar en vacío. */
const falta = (cosa, id, hay) => (hay ? [] : [`${cosa}: no ha leído nada del proyecto «${id}» (¿solo mira los proyectos reales?)`]);

/** El mensaje del glosario cuando valida el project contra la lista de proyectos escrita en código (es una sonda conocida, no una de las que pasan). */
const ES_LISTA_EN_CODIGO = /no es un proyecto de ops\/entidades\.json/;

/** Sondas que deben salir vacías: la pieza ya vale con un proyecto más. */
export const SONDAS = {
  "normas del proyecto: dónde vive cada una, dominios, forma y control": ({ tmp, id, ids, carga, entidades }) => {
    const planos = leerJson(tmp, "ops/planos.json");
    return [
      ...falta("normas", id, carga.delProyecto[id]?.length),
      ...problemasDeProyectos(carga, ids),
      ...problemasDeDominios(carga, entidades.projects),
      ...problemasDeRegistro({ ...carga.registro, normas: carga.todas }),
      ...(carga.delProyecto[id] ?? []).filter((n) => !controlExiste(n, { raiz: tmp, planos })).map((n) => `${n.id}: su control no existe`),
    ];
  },
  "tareas del proyecto: registro válido y con alguna norma que le llega": ({ tmp, id, ids, carga, datos }) => {
    const registros = leerTareasDeProyecto(tmp, ids);
    return [
      ...falta("tareas", id, registros[id]),
      ...Object.entries(registros).flatMap(([i, r]) => problemasDeTareasDeProyecto(r, i, { datos, normas: carga.todas, proyectos: ids, dominios: dominiosDeProyecto(tmp, i) })),
    ];
  },
  "estándar por proyecto: le llegan las suyas y a ninguna tarea las de otro": ({ tmp, id, ids, carga, datos }) => {
    const registro = leerTareasDeProyecto(tmp, ids)[id];
    const conProyecto = conTareasDeProyecto(datos, registro);
    const dominios = dominiosDeProyecto(tmp, id);
    const malos = [];
    for (const { agente, tarea } of tareasDe(conProyecto)) {
      const llegan = normasDeTarea(tarea, conProyecto, carga.todas, { proyecto: id, dominios, deConsulta: (a) => [a] }).map((x) => x.norma).filter(Boolean);
      for (const n of llegan) if (n.lado === "vertical" && n.project !== id) malos.push(`${agente}/${tarea.id}: con --proyecto ${id} le llega la norma «${n.id}», del proyecto ${n.project}`);
    }
    const suyas = carga.delProyecto[id] ?? [];
    for (const n of suyas) {
      const llega = tareasDe(conProyecto).some(({ tarea }) => normasDeTarea(tarea, conProyecto, carga.todas, { proyecto: id, dominios, deConsulta: (a) => [a] }).some((x) => x.norma?.id === n.id));
      if (!llega) malos.push(`${n.id}: ninguna tarea la recibe con --proyecto ${id}`);
    }
    return [...falta("estándar", id, suyas.length), ...malos];
  },
  "glosario: lado, forma y términos del proyecto": ({ tmp, id, entidades }) => {
    const entero = leerGlosario(tmp);
    const delProyecto = leerGlosarioDeProyecto(tmp);
    const casa = entero.terminos.filter((t) => !t.project);
    return [
      ...falta("glosario", id, delProyecto[id]?.terminos?.length),
      ...problemasDeLadosDelGlosario(casa, delProyecto, entidades).filter((m) => !ES_LISTA_EN_CODIGO.test(m)),
      ...problemasDeGlosario(entero),
      ...(activos(entero).some((t) => t.project === id) ? [] : [`glosario: el término de «${id}» no entra en el glosario entero`]),
    ];
  },
  "principios: registro del proyecto, forma y norma que lo cita": ({ tmp, raiz, id, ids, carga }) => {
    const proyectos = leerPrincipiosDeProyecto(tmp);
    const propio = leerCatalogoPropio(tmp);
    const casa = leerPrincipiosCasa(tmp);
    const lista = casa.principios;
    // Las rutas que citan los principios se comprueban en el repo real (la raíz temporal no copia scripts/ ni src/) y en la temporal (el fixture).
    const ctx = { existe: (r) => existeEn(tmp)(r) || existeEn(raiz)(r), leerTexto: (r) => (existeEn(tmp)(r) ? leerTextoEn(tmp)(r) : leerTextoEn(raiz)(r)) };
    const mios = (proyectos[id]?.principios ?? []).map((p) => p.id);
    return [
      ...falta("principios", id, mios.length),
      ...problemasDePrincipios(propio, lista, { ...ctx, proyectos, validos: ids }),
      ...mios.filter((p) => !(carga.delProyecto[id] ?? []).some((n) => n.principio === p)).map((p) => `${p}: ninguna norma del proyecto lo cita`),
      ...(lista.some((p) => p.project === id) ? [] : [`principios: el de «${id}» no entra en la lista única`]),
    ];
  },
  "topes: los textos del proyecto entran en lo que mide `npm run topes`": ({ tmp, id, carga }) => {
    const norma = carga.delProyecto[id]?.[0];
    const termino = leerGlosarioDeProyecto(tmp)[id]?.terminos?.[0];
    return [
      ...(LECTORES["norma.exigencia"](tmp).includes(norma?.exigencia) ? [] : [`norma.exigencia: no mide la norma del proyecto «${id}»`]),
      ...(LECTORES["termino.definicion"](tmp).includes(termino?.definicion) ? [] : [`termino.definicion: no mide el término del proyecto «${id}»`]),
    ];
  },
  "inventario de lados: cuenta como vertical lo que cuelga del proyecto": ({ tmp, id, carga }) => {
    const filas = Object.fromEntries(calcular(tmp).filas.map((f) => [f.unidad, f]));
    const verticales = Object.values(carga.delProyecto).flat().length;
    const fila = filas["normas verticales (ops/proyectos/<id>/normas.json)"];
    return [
      ...(fila?.total === verticales ? [] : [`normas verticales: el inventario cuenta ${fila?.total}, hay ${verticales} (¿no recorre todos los proyectos?)`]),
      ...falta("inventario", id, (filas["principios del proyecto (ops/proyectos/<id>/principios/)"]?.total ?? 0) > 0),
    ];
  },
};

/**
 * Sondas que hoy FALLAN, medidas con el proyecto sintético: cada una es una pieza que solo vale para los proyectos reales.
 * Su recuento (líneas de problema) tiene techo en ops/normas-techos.json (`escala_fallos_con_un_proyecto_mas`) y solo baja.
 */
export const SONDAS_CONOCIDAS = {
  "la lista de proyectos de la factoría se lee de ops/entidades.json (no se escribe en scripts/lib/zonasProyecto.mjs)": ({ ids }) =>
    ids.filter((i) => !PROYECTOS.includes(i)).map((i) => `zonasProyecto.PROYECTOS no tiene «${i}»: dar de alta un proyecto obliga a editar código`),
  "un evento de otro proyecto se registra con su proyecto (.claude/hooks/eventos.mjs)": ({ id }) => {
    const sale = proyectoDe({ MENUPLAN_PROYECTO: id });
    return sale === id ? [] : [`eventos.proyectoDe con MENUPLAN_PROYECTO=${id} devuelve «${sale}»: el evento se cuenta como de otro proyecto`];
  },
  "el glosario valida el project de un término contra la lista de ops/entidades.json (no contra PROYECTOS_CON_NORMAS)": ({ tmp, entidades }) =>
    problemasDeLadosDelGlosario(leerGlosario(tmp).terminos.filter((t) => !t.project), leerGlosarioDeProyecto(tmp), entidades).filter((m) => ES_LISTA_EN_CODIGO.test(m)),
  "`npm run topes` mide las tareas de un proyecto nuevo (scripts/lib/topes.mjs)": ({ tmp, id }) => {
    const texto = leerTareasDeProyecto(tmp, [id])[id]?.agentes?.constructor?.tareas?.[0]?.tarea;
    return LECTORES["tarea.tarea"](tmp).includes(texto) ? [] : [`tarea.tarea: no mide la tarea del proyecto «${id}»: lee los proyectos de una lista escrita en código`];
  },
  "el detector de «nombra el proyecto» reconoce el nombre del proyecto nuevo (scripts/lib/inventarioVertical.mjs)": ({ entrada }) => {
    return nombraProyecto(`El ${entrada.name} cambia`) ? [] : [`nombraProyecto no reconoce «${entrada.name}»: la lista de nombres está escrita a mano para un solo proyecto`];
  },
};

/** Ejecuta un grupo de sondas: [{ sonda, problemas }]. Una excepción cuenta como problema (la pieza no aguanta). */
export function ejecutar(grupo, ctx) {
  return Object.entries(grupo).map(([sonda, f]) => {
    try { return { sonda, problemas: f(ctx) }; } catch (e) { return { sonda, problemas: [`falla con el proyecto sintético: ${String(e.message).split("\n")[0]}`] }; }
  });
}

export { contexto };
