/**
 * Registro de las tareas de Lola: las listas cerradas y las reglas que hoy usa
 * el código, en un solo sitio. De aquí salen los enums de las herramientas de
 * tareas (api/_bot/agente.js), y un test los compara con los CHECK de las
 * migraciones 0076-0078 para que no se separen sin avisar.
 *
 * Sale de la forma que probó la spec de tareas contra Postgres (registro.mjs
 * de esa prueba), recortada a lo que existe hoy. Lo que necesita tablas o
 * columnas nuevas (tipo, objetivo, aplazada, decisión, persona) es la fase
 * siguiente.
 */

export const ENUMS = {
  "bot_tareas.kind": ["seguimiento", "pregunta"],
  "bot_tareas.scope": ["casa", "personal"],
  "bot_tareas.status": ["abierta", "hecha", "descartada", "caducada", "rechazada"],
  // De qué va una pregunta (anotar_tarea.sobre) y cómo se cierra una tarea (cerrar_tarea.estado).
  "anotar_tarea.sobre": ["alergias", "etapa_bebe", "otra"],
  "cerrar_tarea.estado": ["hecha", "descartada", "rechazada"],
};

/**
 * Campos de la ficha que una tarea puede preguntar, o que nunca se preguntan.
 * politica: nunca · solo_si_lo_piden · antes_de_usarlo · de_pasada · una_vez.
 * seguridad: su tarea entra siempre en lo que lee Lola, sin límite.
 */
export const CAMPOS = {
  alergias: { politica: "una_vez", seguridad: true, caduca_dias: 30 },
  etapaBebe: { politica: "antes_de_usarlo", seguridad: true, caduca_dias: 21 },
  edad: { politica: "nunca", seguridad: false },
  nacimiento: { politica: "nunca", seguridad: false },
  sexo: { politica: "nunca", seguridad: false },
  colegio: { politica: "nunca", seguridad: false },
  patronSemanas: { politica: "nunca", seguridad: false },
};

/** El prefijo de las claves de estado de hoy («alergias:<id>», «etapa:<id>») → su campo. */
export const CLAVE_A_CAMPO = { alergias: "alergias", etapa: "etapaBebe" };

export const campoDeClave = (clave) => CLAVE_A_CAMPO[String(clave ?? "").split(":")[0]] ?? null;

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
