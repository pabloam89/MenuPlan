/**
 * Referencias rotas de una casa (trozo 35 de #1037; #958 G, «borrar una persona deja restos»): filas de preferencia o
 * tareas que apuntan a algo que ya no existe. Pura: recibe la foto de la casa y devuelve la lista; no escribe nada.
 * Quién la usa: scripts/referencias-rotas.mjs (el informe, solo lectura) y el barrido del cron (api/_bot/caducidades.js,
 * una vez por hora), que con correccionesDeRotas corrige lo obvio y pregunta lo dudoso (decisión de Pablo, 4 nov 2026).
 *
 * Lo que se mira, porque es lo que hoy puede quedar colgando (3 nov 2026):
 *   · una preferencia con un valor que ya no está en el vocabulario de su eje (`vocabulario` de EJES, axisRegistry.js);
 *   · una tarea cuya persona, «para» o encargado ya no es de la casa (`para_member` y `asignado_member` no tienen FK;
 *     `persona_id` sí, con `on delete cascade`, así que esa no se rompe, pero también se mira por si llega sin ella);
 *   · una tarea sobre un campo que ya no está en el registro (REGISTRO_CAMPOS).
 * Lo que no, con su porqué: recetas (ningún eje de `preferencia` guarda un id de receta) y valores retirados de un
 * vocabulario (RETIRADOS está vacío; las columnas de vocabulario tienen su CHECK). Si eso cambia, entra aquí.
 *
 * Cada rota dice qué se hace con ella (ACCION_DE_ROTA), nunca un fallo callado: o una corrección declarada o una
 * pregunta a la familia.
 */

import { EJE_POR_ID } from "../data/axisRegistry.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { campoDeClave, personaDeClave } from "./registroTareas.js";
import { valorIdDelEje } from "./preferencias.js";
import { porNombre } from "./vocabularios.js";

/** Qué clase de referencia rota es. Vocabulario cerrado. */
export const TIPOS_ROTA = ["valor_fuera_del_eje", "persona_ausente", "campo_desconocido"];
export const TIPO_ROTA = porNombre(TIPOS_ROTA);

/** Qué se hace con cada una: corregirla sola (y decirlo) o preguntar a la familia. */
export const ACCIONES_ROTA = ["corregir", "preguntar"];
export const ACCION_ROTA = porNombre(ACCIONES_ROTA);
export const ACCION_DE_ROTA = Object.freeze({
  // Un valor que el eje ya no conoce no se puede adivinar: se pregunta qué quería decir.
  [TIPO_ROTA.VALOR_FUERA_DEL_EJE]: ACCION_ROTA.PREGUNTAR,
  // Una tarea de alguien que ya no está en la casa no tiene a quién preguntar: se descarta (o se le quita el encargado).
  [TIPO_ROTA.PERSONA_AUSENTE]: ACCION_ROTA.CORREGIR,
  // Un campo que salió del registro ya no se pregunta: la tarea se descarta.
  [TIPO_ROTA.CAMPO_DESCONOCIDO]: ACCION_ROTA.CORREGIR,
});

const rota = (donde, fila, tipo, ref) => ({ donde, id: fila.id ?? null, tipo, ref, accion: ACCION_DE_ROTA[tipo] });

/**
 * Pura. Las filas de `preferencia` cuyo valor ya no está en el vocabulario de su eje (comparado como texto: la fila
 * guarda texto y hay vocabularios de números, como `nova`, donde valorValido diría que «1» no es 1). Un eje sin vocabulario, un eje que ya no existe en el registro (eso lo para la FK de `eje`) o un valor con forma de
 * regla («grupo:carne», «tecnica:frito», que se leen como regla en reglasEnFilas.js) no cuentan.
 */
export function rotasDePreferencias(filas = []) {
  const out = [];
  for (const f of filas ?? []) {
    if (f?.valor == null || !EJE_POR_ID.has(f.eje)) continue;
    const valor = valorIdDelEje(f.valor);
    if (valor.includes(":")) continue;
    if (EJE_POR_ID.get(f.eje)?.tipo === "booleano") continue;
    const vocabulario = EJE_POR_ID.get(f.eje).vocabulario;
    if (Array.isArray(vocabulario) && !vocabulario.map(String).includes(valor)) out.push(rota("preferencia", f, TIPO_ROTA.VALOR_FUERA_DEL_EJE, `${f.eje}=${valor}`));
  }
  return out;
}

/**
 * Pura. Las tareas abiertas que apuntan a una persona que ya no es de la casa (por `persona_id`, la clave, «para» o
 * encargado) o a un campo que ya no está en el registro. `personas`: los ids de las personas de la casa; `null`
 * si no se conocen (no se ha podido leer a nadie): entonces no se mira la persona, porque todas saldrían rotas sin
 * estarlo, pero el campo sí, que no depende de ellas.
 */
export function rotasDeTareas(tareas = [], personas = []) {
  const deLaCasa = personas == null ? null : new Set(personas.map(String));
  const out = [];
  for (const t of tareas ?? []) {
    const quienes = deLaCasa == null ? []
      : [t.persona_id, personaDeClave(t.clave), t.para_member, t.asignado_member].filter((x) => x != null && x !== "");
    const fuera = quienes.find((p) => !deLaCasa.has(String(p)));
    // Solo falta el encargado (lo demás es de la casa): se le quita el encargado y la tarea sigue.
    const soloEncargado = fuera != null && String(fuera) === String(t.asignado_member)
      && quienes.filter((p) => !deLaCasa.has(String(p))).every((p) => String(p) === String(t.asignado_member));
    if (fuera != null) out.push({ ...rota("tarea", t, TIPO_ROTA.PERSONA_AUSENTE, String(fuera)), ...(soloEncargado ? { soloEncargado: true } : {}) });
    const campo = t.campo ?? campoDeClave(t.clave);
    if (campo != null && !REGISTRO_CAMPOS[campo]) out.push(rota("tarea", t, TIPO_ROTA.CAMPO_DESCONOCIDO, String(campo)));
  }
  return out;
}

/**
 * Pura. Qué se hace con las rotas de una casa (ACCION_DE_ROTA), en tres listas sin repetidos:
 *   · descartar: las tareas de alguien que ya no está o sobre un campo que ya no existe (ya no hay a quién ni qué
 *     preguntar);
 *   · sinEncargado: las tareas en las que solo falta el encargado: se le quita y la tarea sigue;
 *   · preguntar: las preferencias con un valor que su eje ya no conoce, con lo que hace falta para preguntarlo
 *     (`preferencias`: las filas de la casa, de donde sale la persona).
 * Una tarea que hay que descartar no sale también en sinEncargado.
 */
export function correccionesDeRotas(rotas = [], preferencias = []) {
  const descartar = new Set();
  const sinEncargado = new Set();
  const preguntar = [];
  const porId = new Map((preferencias ?? []).map((f) => [String(f.id), f]));
  for (const x of rotas ?? []) {
    if (x.donde === "tarea" && x.accion === ACCION_ROTA.CORREGIR) (x.soloEncargado ? sinEncargado : descartar).add(x.id);
    if (x.donde === "preferencia" && x.accion === ACCION_ROTA.PREGUNTAR) {
      const f = porId.get(String(x.id));
      const [eje, valor] = x.ref.split("=");
      preguntar.push({ preferenciaId: x.id, eje, valor, personaId: f?.persona_id ?? null });
    }
  }
  for (const id of descartar) sinEncargado.delete(id);
  return { descartar: [...descartar], sinEncargado: [...sinEncargado], preguntar };
}

/** Pura. Todas las de una casa: `{ preferencias, tareas, personas }` (filas tal cual de la base; `personas: null`, sin leer). */
export function referenciasRotas({ preferencias = [], tareas = [], personas = [] } = {}) {
  return [...rotasDePreferencias(preferencias), ...rotasDeTareas(tareas, personas)];
}
