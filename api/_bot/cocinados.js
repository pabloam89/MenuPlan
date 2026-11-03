/**
 * Lo cocinado de una casa, en su tabla (`cocinado`, 0109; trozo 22 de #1037). Solo el servidor la escribe: la app
 * llega por api/operacion.js, que mira antes quién es y qué papel tiene.
 */
import { select, insert, borrar, eq } from "./db.js";
import { filaDeCocinado } from "../../src/lib/cocinados.js";

const COLUMNAS = "semana,dia,comida,receta_id";
/** Clave duplicada en Postgres: ese plato ya estaba cocinado en ese hueco (índice cocinado_unico). */
const YA_ESTABA = "23505";

/** Las filas cocinadas de una semana (su lunes). */
export async function cocinadosDeSemana(casa, semana) {
  filaDeCocinado({ semana, dia: "Lun", comida: "Comida", receta_id: "x" });
  return select("cocinado", `household_id=${eq(casa)}&semana=${eq(semana)}`, COLUMNAS);
}

/**
 * Marca (`hecho`) o desmarca un plato cocinado en un hueco. Marcarlo dos veces no duplica (el índice único de la
 * 0109 lo impide y aquí cuenta como hecho); desmarcar lo que no estaba no falla. Lo demás lanza.
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
    if (e?.codigo !== YA_ESTABA) throw e;
  }
  return { hecho: true };
}
