/**
 * Lo que la casa ya sabe y lo que aún falta, como claves estables. Es la única
 * fuente para ligar una pregunta o una tarea a un hueco del estado
 * («alergias:<id>», «etapa:<id>») y para saber si ese hueco ya está resuelto.
 * Todo puro: sin base de datos ni modelo, determinista y rápido.
 */

import { alergiasRevisadas, esBebe } from "./ficha.js";
import { ETAPAS_BEBE } from "../../src/lib/babyStage.js";
import { claveDeTarea, campoDeClave, personaDeClave, TIPO_DE_KIND } from "../../src/lib/registroTareas.js";

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

/** El campo de la ficha del que va una pregunta, sin modelo: alergias, etapaBebe, o ninguno. */
export function temaDe(texto) {
  const t = normalizar(texto);
  if (TEMA_ALERGIAS.test(t)) return "alergias";
  if (TEMA_ETAPA.test(t)) return "etapaBebe";
  return null;
}

/**
 * De qué campo y de quién es una pregunta de estado: a quién se refiere (por
 * nombre, si sale), y si no, al primero que aún tenga ese hueco sin resolver.
 * Null si no es de estado.
 * @returns {{ campo: string, personaId: string } | null}
 */
export function preguntaDeEstado(texto, data = {}) {
  const campo = temaDe(texto);
  if (!campo) return null;
  const miembros = data.members ?? [];
  const t = normalizar(texto);
  const nombrado = miembros.find((m) => m?.name && new RegExp(`\\b${escapar(normalizar(m.name).split(" ")[0])}\\b`).test(t));
  const candidatos = campo === "alergias"
    ? miembros.filter((m) => !alergiasRevisadas(data, m) && !(m.allergies ?? []).length)
    : miembros.filter(esBebe);
  const m = nombrado ?? candidatos[0];
  return m ? { campo, personaId: idDe(m) } : null;
}

/** La clave de estado de una pregunta («alergias:<id>», «etapa:<id>»), o null. */
export function claveDePregunta(texto, data = {}) {
  const p = preguntaDeEstado(texto, data);
  return p ? claveDeTarea({ tipo: "falta_saber", ...p }) : null;
}

/**
 * El hueco de un campo de una persona ahora: «resuelta» (se cierra como
 * hecha), «sin_persona» (quien era ya no está en la casa: se descarta, no se
 * da por hecha) o «pendiente». Sin campo de estado, siempre pendiente.
 */
export function estadoDeCampo(campo, personaId, data = {}) {
  if (!personaId || (campo !== "alergias" && campo !== "etapaBebe")) return "pendiente";
  // Una casa sin personas es una lectura a medias, no una casa resuelta: no se cierra nada.
  if (!(data?.members ?? []).length) return "pendiente";
  const m = data.members.find((x) => idDe(x) === personaId);
  if (!m) return "sin_persona";
  if (campo === "alergias") return alergiasRevisadas(data, m) || (m.allergies ?? []).length ? "resuelta" : "pendiente";
  return !esBebe(m) || ETAPAS_BEBE.includes(data.etapaBebe) ? "resuelta" : "pendiente";
}

/** Lo mismo desde una clave de estado («alergias:<id>»): filas viejas y pendientes del mensaje. */
export const estadoDeClave = (clave, data = {}) => estadoDeCampo(campoDeClave(clave), personaDeClave(clave), data);

/** ¿Está resuelto ese hueco en el estado de ahora? */
export const resuelta = (clave, data = {}) => estadoDeClave(clave, data) === "resuelta";

// El verbo del encargo no cambia qué es: «comprar pan para el sábado» y «pan
// para el sábado» son lo mismo (claveSeguimiento de modelo.mjs v17, menuplan-1e).
// «sin» no está: «pan» y «pan sin gluten» son cosas distintas.
const VACIAS = new Set(("el la los las un una unos unas de del al a y o que en con por para lo le se me te mi tu su ya si no " +
  "hay comprar compra compramos traer trae coger pillar acordarse acuerdate recordar recuerda recuerdame apunta apuntar algo mas").split(" "));

/** Clave de una tarea libre: las palabras con contenido, ordenadas. Dos padres que piden lo mismo con otras palabras de relleno chocan. */
export const palabrasDe = (texto) =>
  [...new Set(normalizar(texto).replace(/[^\p{L}\p{N} ]/gu, " ").split(" ").filter((w) => w.length > 2 && !VACIAS.has(w)))].sort().slice(0, 8);

export const claveLibre = (kind, texto, paraId = null) =>
  claveDeTarea({ tipo: TIPO_DE_KIND[kind], personaId: paraId, palabras: palabrasDe(texto) });
