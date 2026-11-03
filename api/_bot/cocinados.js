/**
 * Lo cocinado de una casa, en su tabla (`cocinado`, 0109; trozo 22 de #1037). Solo el servidor la escribe: la app
 * llega por api/operacion.js, que mira antes quién es y qué papel tiene.
 */
import { select, insert, borrar, eq } from "./db.js";
import { esDuplicado } from "./entradas.js";
import { filaDeCocinado } from "../../src/lib/cocinados.js";

const COLUMNAS = "semana,dia,comida,receta_id";

/** Las filas cocinadas de una semana (su lunes, ya comprobado con filaDeCocinado por quien llama). */
export async function cocinadosDeSemana(casa, semana) {
  return select("cocinado", `household_id=${eq(casa)}&semana=${eq(semana)}`, COLUMNAS);
}

/**
 * Marca (`hecho`) o desmarca un plato cocinado en un hueco (`fila`, ya comprobada con filaDeCocinado por quien
 * llama). Marcarlo dos veces no duplica (el índice único de la 0109 lo impide y aquí cuenta como hecho: esDuplicado,
 * el «ya estaba» de todo el bot); desmarcar lo que no estaba no falla. Lo demás lanza.
 */
export async function ponerCocinado(casa, fila, hecho) {
  const f = filaDeCocinado(fila);
  if (!hecho) {
    await borrar("cocinado", `household_id=${eq(casa)}&semana=${eq(f.semana)}&dia=${eq(f.dia)}&comida=${eq(f.comida)}&receta_id=${eq(f.receta_id)}`);
    return { hecho: false };
  }
  try {
    await insert("cocinado", [{ household_id: casa, ...f }]);
  } catch (e) {
    if (!esDuplicado(e)) throw e;
  }
  return { hecho: true };
}
