/**
 * El registro de campos de la ficha de la casa: qué se puede saber de una casa
 * o de una persona, de qué tipo es y cómo se trata. Es la fuente de la tabla
 * catálogo `registro_campo` (modelo de la ficha, spec v17): la tabla se rellena
 * desde aquí y un test compara las dos.
 *
 * Absorbe el antiguo `CAMPOS` de registroTareas.js (política, seguridad,
 * caducidad de la pregunta), que lo sigue exportando con ese nombre.
 *
 * Columnas:
 *  - tipo: enum | lista_enum | int | float | bool | fecha | texto
 *  - vocabulario: nombre en vocabularios.js (VOCABULARIOS) si es enum o
 *    lista_enum; null si no. Nunca una copia de los valores.
 *  - unidad (min, kg, cm, eur, raciones, años…), minimo, maximo: numéricos.
 *  - politica: nunca · solo_si_lo_piden · antes_de_usarlo · de_pasada · una_vez.
 *  - seguridad: su tarea entra siempre en lo que lee Lola, sin límite.
 *  - caduca_dias: cuánto vive la pregunta abierta sobre este campo.
 *  - visibilidad, por, aplica: de la ficha (los rellena su sesión); null hasta entonces.
 *
 * Los vocabularios de salud (alergias, intolerancias, estados) los lleva otra
 * sesión con su catálogo: `alergias` queda con vocabulario null hasta que exista.
 */

const campo = (c) => ({
  tipo: null, vocabulario: null, unidad: null, minimo: null, maximo: null,
  politica: null, visibilidad: null, seguridad: false, por: null, aplica: null, caduca_dias: null,
  ...c,
});

export const REGISTRO_CAMPOS = Object.freeze({
  alergias: campo({ tipo: "lista_enum", vocabulario: "alergenos", politica: "una_vez", seguridad: true, caduca_dias: 30 }),
  etapaBebe: campo({ tipo: "enum", vocabulario: "etapa_bebe", politica: "antes_de_usarlo", seguridad: true, caduca_dias: 21 }),
  edad: campo({ tipo: "int", unidad: "años", minimo: 0, maximo: 120, politica: "nunca" }),
  nacimiento: campo({ tipo: "fecha", politica: "nunca" }),
  sexo: campo({ tipo: "enum", vocabulario: "sexo", politica: "nunca" }),
  colegio: campo({ tipo: "texto", politica: "nunca" }),
  patronSemanas: campo({ tipo: "enum", vocabulario: "patron_semanas", politica: "nunca" }),
});

export const TIPOS_CAMPO = ["enum", "lista_enum", "int", "float", "bool", "fecha", "ref", "texto"];

/**
 * Vocabularios que la ficha ya referencia y aún no viven en vocabularios.js:
 * los de salud los trae menuplan-09 con su catálogo de alergias. Cuando
 * existan, salen de aquí y entran en VOCABULARIOS.
 */
export const VOCABULARIOS_PENDIENTES = ["alergenos", "estados"];
export const POLITICAS = ["nunca", "solo_si_lo_piden", "antes_de_usarlo", "de_pasada", "una_vez"];

/** Los campos sobre los que una tarea puede preguntar (CHECK de bot_tareas.campo en 0080). */
export const CAMPOS_PREGUNTABLES = Object.keys(REGISTRO_CAMPOS).filter((c) => REGISTRO_CAMPOS[c].politica !== "nunca");
