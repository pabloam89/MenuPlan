/**
 * Lo que la casa ya sabe y lo que aún falta, como claves estables. Es la única
 * fuente para ligar una pregunta o una tarea a un hueco del estado
 * («alergias:<id>», «etapa:<id>») y para saber si ese hueco ya está resuelto.
 * Todo puro: sin base de datos ni modelo, determinista y rápido.
 */

import { alergiasRevisadas, esBebe } from "./ficha.js";
import { ETAPAS_BEBE } from "../../src/lib/babyStage.js";

export const normalizar = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idDe = (m) => String(m?.id ?? m?.name ?? "");

/** Una persona de la casa por su nombre (o el principio, si es único). */
export function resolverPersona(data = {}, nombre) {
  const n = normalizar(nombre);
  if (!n) return { persona: null };
  const miembros = data.members ?? [];
  const exactos = miembros.filter((m) => normalizar(m.name) === n);
  const porNombre = exactos.length ? exactos : miembros.filter((m) => normalizar(m.name).split(" ")[0] === n.split(" ")[0]);
  if (porNombre.length === 1) return { persona: { id: idDe(porNombre[0]), nombre: porNombre[0].name } };
  if (porNombre.length > 1) return { error: `Hay más de una persona que se llama «${nombre}»: ¿cuál?` };
  return { error: `En la casa no hay nadie que se llame «${nombre}». ¿Quién es?` };
}

const TEMA_ALERGIAS = /\b(alergi\w*|intoleran\w*|celiac\w*|gluten)\b/;
const TEMA_ETAPA = /\b(solidos?|pures?|papillas?|trocitos|trozos|como come|que come|cremas)\b/;

/** El tema de una pregunta, sin modelo: alergias, etapa del bebé, o ninguno. */
export function temaDe(texto) {
  const t = normalizar(texto);
  if (TEMA_ALERGIAS.test(t)) return "alergias";
  if (TEMA_ETAPA.test(t)) return "etapa_bebe";
  return null;
}

/**
 * La clave de estado de una pregunta: a quién se refiere (por nombre, si sale),
 * y si no, al primero que aún tenga ese hueco sin resolver. Null si no es de estado.
 */
export function claveDePregunta(texto, data = {}) {
  const tema = temaDe(texto);
  if (!tema) return null;
  const miembros = data.members ?? [];
  const t = normalizar(texto);
  const nombrado = miembros.find((m) => m?.name && new RegExp(`\\b${escapar(normalizar(m.name).split(" ")[0])}\\b`).test(t));
  const candidatos = tema === "alergias"
    ? miembros.filter((m) => !alergiasRevisadas(data, m) && !(m.allergies ?? []).length)
    : miembros.filter(esBebe);
  const m = nombrado ?? candidatos[0];
  if (!m) return null;
  return `${tema === "alergias" ? "alergias" : "etapa"}:${idDe(m)}`;
}

/**
 * El hueco de una clave de estado ahora: «resuelta» (se cierra como hecha),
 * «sin_persona» (quien era ya no está en la casa: se descarta, no se da por
 * hecha) o «pendiente». Una clave que no es de estado siempre está pendiente.
 */
export function estadoDeClave(clave, data = {}) {
  const [tipo, id] = String(clave ?? "").split(":");
  if (!id || (tipo !== "alergias" && tipo !== "etapa")) return "pendiente";
  // Una casa sin personas es una lectura a medias, no una casa resuelta: no se cierra nada.
  if (!(data?.members ?? []).length) return "pendiente";
  const m = data.members.find((x) => idDe(x) === id);
  if (!m) return "sin_persona";
  if (tipo === "alergias") return alergiasRevisadas(data, m) || (m.allergies ?? []).length ? "resuelta" : "pendiente";
  return !esBebe(m) || ETAPAS_BEBE.includes(data.etapaBebe) ? "resuelta" : "pendiente";
}

/** ¿Está resuelto ese hueco en el estado de ahora? */
export const resuelta = (clave, data = {}) => estadoDeClave(clave, data) === "resuelta";

// El verbo del encargo no cambia qué es: «comprar pan para el sábado» y «pan
// para el sábado» son lo mismo (claveSeguimiento de modelo.mjs v17, menuplan-1e).
// «sin» no está: «pan» y «pan sin gluten» son cosas distintas.
const VACIAS = new Set(("el la los las un una unos unas de del al a y o que en con por para lo le se me te mi tu su ya si no " +
  "hay comprar compra compramos traer trae coger pillar acordarse acuerdate recordar recuerda recuerdame apunta apuntar algo mas").split(" "));

/** Clave de una tarea libre: las palabras con contenido, ordenadas. Dos padres que piden lo mismo con otras palabras de relleno chocan. */
export function claveLibre(kind, texto, paraId = null) {
  const palabras = [...new Set(normalizar(texto).replace(/[^\p{L}\p{N} ]/gu, " ").split(" ").filter((w) => w.length > 2 && !VACIAS.has(w)))].sort().slice(0, 8);
  if (!palabras.length) return null;
  return `${kind}:${paraId ?? "casa"}:${palabras.join("-")}`;
}
