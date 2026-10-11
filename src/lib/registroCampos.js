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
 *  - tipo: enum | lista_enum | int | decimal | bool | fecha | texto
 *  - vocabulario: nombre en vocabularios.js (VOCABULARIOS) si es enum o
 *    lista_enum; null si no. Nunca una copia de los valores.
 *  - minimo, maximo: el rango de un campo numérico (int o decimal).
 *  - politica: nunca · solo_si_lo_piden · antes_de_usarlo · de_pasada · una_vez.
 *  - seguridad: su tarea entra siempre en lo que lee Lola, sin límite.
 *  - caduca_dias: cuánto vive la pregunta abierta sobre este campo.
 *  - por: si el dato es de cada persona o de la casa entera (etapaBebe: la casa).
 *  - columna: dónde vive ya el valor si el campo tiene columna o tabla propia (persona.edad…); null si
 *    el valor vive en sobre.valor. Es la única lista de "campos con columna": el trigger de sobre y
 *    los dos case de ficha_casa salen de ella (registroCampos.test.js lo comprueba).
 *  - aplica: a quién se le pregunta (todos, o solo a los bebés; la etapa la decide etapaDe en JS).
 *
 * La migración 0097 copia esto en registro_campo; registroCampos.test.js
 * comprueba que el INSERT de la migración y este objeto dicen lo mismo.
 *
 * Los vocabularios de salud (alergias, intolerancias, estados) los lleva otra
 * sesión con su catálogo: `alergias` queda con vocabulario null hasta que exista.
 */

const campo = (c) => ({
  tipo: null, vocabulario: null, minimo: null, maximo: null,
  politica: null, seguridad: false, por: "persona", aplica: "todos", columna: null, caduca_dias: null,
  ...c,
});

export const REGISTRO_CAMPOS = Object.freeze({
  alergias: campo({ tipo: "lista_enum", vocabulario: "alergenos", politica: "una_vez", seguridad: true, columna: "persona_alergia", caduca_dias: 30 }),
  etapaBebe: campo({ tipo: "enum", vocabulario: "etapa_bebe", politica: "antes_de_usarlo", seguridad: true, por: "casa", aplica: "bebe", caduca_dias: 21 }),
  edad: campo({ tipo: "int", minimo: 0, maximo: 120, politica: "nunca", columna: "persona.edad" }),
  nacimiento: campo({ tipo: "fecha", politica: "nunca", columna: "persona.fecha_nacimiento" }),
  sexo: campo({ tipo: "enum", vocabulario: "sexo", politica: "nunca" }),
  colegio: campo({ tipo: "texto", politica: "nunca" }),
  patronSemanas: campo({ tipo: "enum", vocabulario: "patron_semanas", politica: "nunca" }),
});

export const POR = ["persona", "casa"];
export const APLICA = ["todos", "bebe"];

export const TIPOS_CAMPO = ["enum", "lista_enum", "int", "decimal", "bool", "fecha", "ref", "texto"];

/**
 * Vocabularios que la ficha ya referencia y aún no viven en vocabularios.js:
 * los de salud los trae menuplan-09 con su catálogo de alergias. Cuando
 * existan, salen de aquí y entran en VOCABULARIOS.
 */
export const VOCABULARIOS_PENDIENTES = ["alergenos", "estados"];
export const POLITICAS = ["nunca", "solo_si_lo_piden", "antes_de_usarlo", "de_pasada", "una_vez"];

/**
 * Los campos sobre los que una tarea puede preguntar: la lista del CHECK
 * bot_tareas_campo_check de 0080 (aplicada, NOT VALID hasta el VALIDATE a mano).
 */
export const CAMPOS_PREGUNTABLES = Object.keys(REGISTRO_CAMPOS).filter((c) => REGISTRO_CAMPOS[c].politica !== "nunca");
