/**
 * Registro de las tareas de Lola: las listas cerradas y las reglas que hoy usa
 * el código, en un solo sitio. De aquí salen los enums de las herramientas de
 * tareas (api/_bot/agente.js), y un test los compara con los CHECK de las
 * migraciones 0076-0078 para que no se separen sin avisar.
 *
 * Sale de la forma que probó la spec de tareas contra Postgres (registro.mjs
 * de esa prueba), recortada a lo que existe hoy. Las columnas v2 de 0080
 * (tipo, campo, persona_id, aplazada con vuelve_at) las escribe el bot solo con
 * BOT_TAREAS_V2 (fase T2); objetivo, decisión y espera, más adelante.
 */
import { REGISTRO_CAMPOS, CAMPOS_PREGUNTABLES } from "./registroCampos.js";

/**
 * De qué va una pregunta en anotar_tarea (`sobre`) → su campo de la ficha. Es
 * la única traducción: «etapa_bebe» solo existe como valor de la herramienta;
 * en la base y en el registro, el campo es `etapaBebe`.
 */
export const SOBRE_A_CAMPO = { alergias: "alergias", etapa_bebe: "etapaBebe", otra: null };
export const sobreDeCampo = (campo) => (campo ? Object.keys(SOBRE_A_CAMPO).find((s) => SOBRE_A_CAMPO[s] === campo) ?? null : null);

export const ENUMS = {
  "bot_tareas.kind": ["seguimiento", "pregunta"],
  "bot_tareas.scope": ["casa", "personal"],
  // «aplazada» existe en la base desde 0080; el código solo la escribe con BOT_TAREAS_V2.
  "bot_tareas.status": ["abierta", "aplazada", "hecha", "descartada", "caducada", "rechazada"],
  // v2 (0080): conviven con kind mientras el bot viejo siga desplegado.
  "bot_tareas.tipo": ["espera", "falta_saber", "decision", "seguimiento"],
  "bot_tareas.resultado": ["aceptada", "mantenida"],
  "bot_tareas.objetivo": ["ideas_plato", "calorias", "generar_menu"],
  // De qué va una pregunta (anotar_tarea.sobre) y cómo se cierra una tarea (cerrar_tarea.estado).
  "anotar_tarea.sobre": Object.keys(SOBRE_A_CAMPO),
  "cerrar_tarea.estado": ["hecha", "descartada", "rechazada"],
  // Con BOT_TAREAS_V2, cerrar_tarea también aplaza («ahora te digo»): 0080 admite «aplazada» y vuelve_at.
  "cerrar_tarea.estado_v2": ["hecha", "descartada", "rechazada", "aplazada"],
};

/**
 * Campos de la ficha que una tarea puede preguntar, o que nunca se preguntan.
 * Viven en registroCampos.js (la fuente de registro_campo); aquí con su nombre
 * de siempre para quien ya los usa.
 */
export const CAMPOS = REGISTRO_CAMPOS;

/** kind viejo → tipo nuevo, el mismo reparto que hace el disparador de 0080. */
export const TIPO_DE_KIND = { pregunta: "falta_saber", seguimiento: "seguimiento" };

/** El prefijo de las claves de estado de hoy («alergias:<id>», «etapa:<id>») → su campo. */
export const CLAVE_A_CAMPO = { alergias: "alergias", etapa: "etapaBebe" };

export const campoDeClave = (clave) => CLAVE_A_CAMPO[String(clave ?? "").split(":")[0]] ?? null;

/** tipo nuevo → kind viejo (lo inverso de TIPO_DE_KIND): espera y decisión no tienen. */
export const KIND_DE_TIPO = Object.fromEntries(Object.entries(TIPO_DE_KIND).map(([kind, tipo]) => [tipo, kind]));
const PREFIJO_DE_CAMPO = Object.fromEntries(Object.entries(CLAVE_A_CAMPO).map(([prefijo, campo]) => [campo, prefijo]));

/**
 * La clave de una tarea, siempre de aquí: el índice único (casa, clave) es lo
 * que para los duplicados, y el bot viejo y el nuevo tienen que calcular la
 * misma. Sale de (tipo, campo, persona o casa, palabras):
 *   · una pregunta sobre un campo de la ficha → «alergias:<persona>», «etapa:<persona>»;
 *   · lo libre → «<kind>:<persona|casa>:<palabras>».
 * Null si no hay de qué sacarla.
 */
export function claveDeTarea({ tipo, campo = null, personaId = null, palabras = [] }) {
  if (campo) return PREFIJO_DE_CAMPO[campo] && personaId ? `${PREFIJO_DE_CAMPO[campo]}:${personaId}` : null;
  const kind = KIND_DE_TIPO[tipo];
  if (!kind || !palabras.length) return null;
  return `${kind}:${personaId ?? "casa"}:${palabras.join("-")}`;
}

/** La persona de una clave (lo inverso de claveDeTarea), para las filas viejas sin persona_id. */
export function personaDeClave(clave) {
  const [prefijo, persona] = String(clave ?? "").split(":");
  if (!persona) return null;
  if (CLAVE_A_CAMPO[prefijo]) return persona;
  return TIPO_DE_KIND[prefijo] && persona !== "casa" ? persona : null;
}

/** Solo los campos que se pueden preguntar caben en bot_tareas.campo (CHECK de 0080). */
export const campoPreguntable = (campo) => (CAMPOS_PREGUNTABLES.includes(campo) ? campo : null);

/** Cuánto vive una tarea sin fecha: lo que diga su campo (registroCampos.caduca_dias) o, si no, su tipo. */
const CADUCA_DIAS_TIPO = { falta_saber: 14, seguimiento: 10 };
export const caducaDias = ({ tipo, campo = null }) => CAMPOS[campo]?.caduca_dias ?? CADUCA_DIAS_TIPO[tipo] ?? 14;

/** ¿La tarea con esta clave es de seguridad? Entonces se lee siempre, fuera del límite. */
export const esDeSeguridad = (clave) => Boolean(CAMPOS[campoDeClave(clave)]?.seguridad);

const normal = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

// Lo que no es de comer: compra, tareas y recordatorios son solo comida.
// Con frontera de palabra: «pilas» no es «pilates», «cita» no es «citara».
const NO_COMIDA = /\b(velas?|pilas?|citas?|medicos?|medica|pediatras?|dentistas?|peluquerias?|regalos?|recados?|tintorerias?|bombillas?|farmacias?|deberes|detergentes?)\b/;

// Preguntas sobre datos de política «nunca»: no se abren aunque Lola lo intente.
const SOBRE_NUNCA = [
  ["edad", /\b(edad|cuantos anos|que anos|anos tiene|cumpleanos|cuando cumple)\b/],
  ["nacimiento", /\b(fecha de nacimiento|cuando nacio|ano de nacimiento)\b/],
  ["sexo", /\b(sexo|genero|chico o chica|nino o nina|hombre o mujer)\b/],
  ["colegio", /\b(a que (colegio|cole)|que (colegio|cole)|cual es (su|el) (colegio|cole)|nombre del (colegio|cole))\b/],
  ["patronSemanas", /\b(custodia|semanas alternas|con quien vive)\b/],
];

/** Null si es de comer; si no, la palabra que lo delata. */
export function noEsComida(texto) {
  const m = normal(texto).match(NO_COMIDA);
  return m ? m[1] : null;
}

/** El campo de política «nunca» del que va una pregunta, o null. */
export function preguntaProhibida(texto) {
  const t = normal(texto);
  const hit = SOBRE_NUNCA.find(([, re]) => re.test(t));
  return hit && CAMPOS[hit[0]]?.politica === "nunca" ? hit[0] : null;
}
