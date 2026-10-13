/**
 * Pool de buenas prácticas por agente (parte de #652).
 *
 * `ops/pool/<agente>.json` guarda, para cada agente, las prácticas de su oficio con su fuente y
 * a qué regla de `ops/estandares-agentes.json` responde cada una. `_vocabularios.json` es el
 * vocabulario cerrado (origen, estado, lectura) y la lista de términos de proyecto que una práctica
 * no puede nombrar (la práctica es de oficio; lo concreto vive en la regla). Este es el único lector;
 * `ops/pool.test.js` lo vigila. No se toca `estandares-agentes.json`: la trazabilidad regla → práctica
 * se calcula aquí, desde `cubierta_por`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CARPETA_POOL = "ops/pool";
const VOCABULARIOS = "_vocabularios.json";

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El pool entero: vocabularios y un objeto por agente (el fichero, con su nombre). */
export function leerPool(raiz = RAIZ_REPO) {
  const dir = join(raiz, CARPETA_POOL);
  const vocabularios = JSON.parse(readFileSync(join(dir, VOCABULARIOS), "utf8"));
  const agentes = {};
  for (const n of readdirSync(dir).sort()) {
    if (n === VOCABULARIOS || !n.endsWith(".json")) continue;
    agentes[n.slice(0, -5)] = JSON.parse(readFileSync(join(dir, n), "utf8"));
  }
  return { vocabularios, agentes };
}

/** Las reglas propias de un agente, con su id de trazabilidad «agente/tarea/nombre de regla». */
export function reglasDeAgente(estandares, agente) {
  const tareas = estandares?.agentes?.[agente]?.tareas ?? [];
  return tareas.flatMap((t) => (t.reglas ?? []).map((r) => `${agente}/${t.id}/${r.nombre}`));
}

const esFecha = (s) => typeof s === "string" && FECHA.test(s) && !Number.isNaN(Date.parse(s));

/** ¿Nombra la práctica algún término de proyecto? Devuelve el primero que encuentra. */
export function terminoDeProyecto(texto, terminos) {
  const t = String(texto).toLowerCase();
  return terminos.find((x) => t.includes(x.toLowerCase()));
}

/**
 * Errores del pool contra los estándares: campos, vocabularios, fuentes, trazabilidad.
 * Una práctica `campo` lleva una fuente externa; una `casa`, motivo y fuente de la casa.
 */
export function problemasDePool(pool, estandares) {
  const malos = [];
  const { origenes, estados, lectura, terminos_de_proyecto: terminos } = pool.vocabularios;
  const fuentes = estandares.fuentes ?? {};
  const citadas = new Set();
  const ids = new Set();
  for (const [nombre, f] of Object.entries(pool.agentes)) {
    if (f.agente !== nombre) malos.push(`${nombre}.json: su campo agente dice «${f.agente}»`);
    if (!(nombre in (estandares.agentes ?? {}))) malos.push(`${nombre}.json: no es un agente de estandares-agentes.json`);
    if (!esFecha(f.revisada)) malos.push(`${nombre}.json: revisada no es una fecha AAAA-MM-DD`);
    if (typeof f.campo !== "string" || f.campo.length < 20) malos.push(`${nombre}.json: le falta el campo (el oficio que cubre)`);
    const reglas = new Set(reglasDeAgente(estandares, nombre));
    const cubiertas = new Set();
    for (const p of f.practicas ?? []) {
      const donde = `${nombre}/${p?.id}`;
      if (!ID.test(p?.id ?? "")) malos.push(`${donde}: el id va en minúsculas con guiones`);
      if (ids.has(p?.id)) malos.push(`${donde}: id repetido`);
      ids.add(p?.id);
      if (p?.agente !== nombre) malos.push(`${donde}: su agente es «${p?.agente}» y está en ${nombre}.json`);
      if (typeof p?.practica !== "string" || p.practica.length < 30 || p.practica.length > 260) malos.push(`${donde}: la práctica va en 30 a 260 caracteres`);
      else {
        const t = terminoDeProyecto(p.practica, terminos);
        if (t) malos.push(`${donde}: la práctica nombra «${t}»; es de oficio, no de terreno`);
        if (/\.$/.test(p.practica)) malos.push(`${donde}: la práctica no acaba en punto`);
      }
      if (!(p?.origen in origenes)) malos.push(`${donde}: origen «${p?.origen}» fuera del vocabulario`);
      if (!(p?.estado in estados)) malos.push(`${donde}: estado «${p?.estado}» fuera del vocabulario`);
      if (!esFecha(p?.revisada)) malos.push(`${donde}: sin fecha revisada AAAA-MM-DD`);
      const fu = fuentes[p?.fuente];
      if (!fu) malos.push(`${donde}: la fuente «${p?.fuente}» no está en el catálogo de fuentes`);
      else {
        citadas.add(p.fuente);
        if (p.origen === "campo" && fu.tipo === "casa") malos.push(`${donde}: una práctica de campo cita una fuente de la casa`);
        if (p.origen === "casa" && fu.tipo !== "casa") malos.push(`${donde}: una práctica de casa cita una fuente externa`);
      }
      if (p?.origen === "campo") {
        if (!(p?.lectura in lectura)) malos.push(`${donde}: lectura «${p?.lectura}» fuera del vocabulario`);
        if ("motivo" in p && p.estado !== "descartada") malos.push(`${donde}: una práctica de campo no lleva motivo de casa`);
      }
      if (p?.origen === "casa" && (typeof p.motivo !== "string" || p.motivo.length < 40)) malos.push(`${donde}: una práctica de casa lleva motivo (40 caracteres o más) de por qué no es externa`);
      if (p?.estado === "descartada" && (typeof p.motivo !== "string" || p.motivo.length < 40)) malos.push(`${donde}: descartada sin motivo`);
      if (p?.estado === "cubierta") {
        if (!Array.isArray(p.cubierta_por) || !p.cubierta_por.length) malos.push(`${donde}: cubierta sin cubierta_por`);
        for (const r of p.cubierta_por ?? []) {
          if (!reglas.has(r)) malos.push(`${donde}: cubierta_por «${r}» no es una regla de ${nombre}`);
          cubiertas.add(r);
        }
      } else if ("cubierta_por" in p) malos.push(`${donde}: solo una práctica cubierta lleva cubierta_por`);
    }
    if (f.cierra_reglas === true) for (const r of reglas) if (!cubiertas.has(r)) malos.push(`${nombre}: la regla «${r}» no responde a ninguna práctica`);
  }
  for (const [id, fu] of Object.entries(fuentes)) {
    if (fu?.uso !== undefined && fu.uso !== "pool") malos.push(`fuente «${id}»: uso «${fu.uso}» no es pool`);
    if (fu?.uso === "pool" && !citadas.has(id)) malos.push(`fuente «${id}»: es del pool y ninguna práctica la cita`);
  }
  return malos;
}

/** Cifras de un agente: reglas, reglas con práctica de campo, prácticas por estado y por origen. */
export function cifrasDeAgente(pool, estandares, agente) {
  const f = pool.agentes[agente];
  const reglas = reglasDeAgente(estandares, agente);
  const porEstado = {};
  const porOrigen = {};
  for (const p of f.practicas) {
    porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;
    porOrigen[p.origen] = (porOrigen[p.origen] ?? 0) + 1;
  }
  const deCampo = new Set(f.practicas.filter((p) => p.origen === "campo" && p.estado === "cubierta").flatMap((p) => p.cubierta_por));
  const fuenteActual = (r) => {
    const [, tarea, nombre] = r.split("/");
    const regla = estandares.agentes[agente].tareas.find((t) => t.id === tarea)?.reglas.find((x) => x.nombre === nombre);
    return estandares.fuentes[regla.fuente]?.tipo !== "casa";
  };
  return {
    reglas: reglas.length,
    reglas_con_fuente_externa_hoy: reglas.filter(fuenteActual).length,
    reglas_con_practica_de_campo: reglas.filter((r) => deCampo.has(r)).length,
    practicas: f.practicas.length,
    por_estado: porEstado,
    por_origen: porOrigen,
  };
}
