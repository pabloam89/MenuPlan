/**
 * La charla que ve el modelo, montada desde bot_messages. Pura.
 *
 * Dos trampas que esto evita:
 *   · La pregunta y la respuesta de un turno se guardan en la misma inserción
 *     y comparten created_at al microsegundo. Ordenar solo por hora las dejaba
 *     al azar, y casi siempre salía «respuesta, pregunta»: cada pregunta acababa
 *     emparejada con la respuesta a la siguiente. Se desempata por id (orden de
 *     inserción).
 *   · Un «mañana» dicho el viernes no es el mañana del domingo. Cada mensaje de
 *     otro día lleva su fecha delante, para que el modelo lo lea en su día.
 */

import { nombreDia, diaDeFechaUTC, isoDeCasa } from "../../src/lib/dias.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const diaMadrid = (iso) => isoDeCasa({ ahora: new Date(iso) });

/** «viernes 2 de octubre», del día AAAA-MM-DD. */
export function fechaLarga(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${nombreDia(diaDeFechaUTC(d), { minusculas: true })} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** Orden de inserción, del más nuevo al más viejo: hora y, si empatan, id. */
export const ORDEN = "created_at.desc,id.desc";

/**
 * @param {Array<{id:number, role:string, content:object, created_at:string}>} filas  de más nueva a más vieja (ORDEN)
 * @param {string} hoy  AAAA-MM-DD en Madrid
 * @returns {{ historia: Array<{role:string, content:string}>, pendientes: Array }}
 */
export function montarMemoria(filas = [], hoy) {
  const vivas = [...filas];
  // Solo lo posterior al último «empezar de nuevo».
  const corte = vivas.findIndex((f) => f.content?.corte);
  if (corte !== -1) vivas.length = corte;
  // Lo último que dijo Lola trae sus tareas abiertas (pendientes.js).
  const pendientes = vivas.find((f) => f.role === "assistant")?.content?.pendientes ?? [];
  const turnos = vivas.reverse()
    .map((f) => {
      const texto = String(f.content?.texto ?? "");
      if (!texto) return null;
      const dia = f.created_at ? diaMadrid(f.created_at) : hoy;
      // Solo los de la persona: la fecha es para leer bien SU «mañana»; a Lola no se le pone, que la copiaría.
      const conFecha = f.role === "user" && dia !== hoy ? `[Escrito el ${fechaLarga(dia)}] ${texto}` : texto;
      return { role: f.role, content: conFecha };
    })
    .filter(Boolean);
  // Alternar user/assistant empezando por user, como pide la API.
  while (turnos.length && turnos[0].role !== "user") turnos.shift();
  const limpios = [];
  for (const t of turnos) {
    if (limpios.length && limpios[limpios.length - 1].role === t.role) limpios[limpios.length - 1].content += `\n${t.content}`;
    else limpios.push(t);
  }
  if (limpios.length && limpios[limpios.length - 1].role === "user") limpios.pop();
  return { historia: limpios, pendientes };
}
