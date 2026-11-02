/**
 * Qué preguntar y cuándo (plan fichas con estado, trozo 17; #1037): una sola «siguiente pregunta» del catálogo,
 * para Lola y para la app, sacada de los datos de la ficha y no de una lista escrita a mano en cada sitio.
 *
 * Pura. Elige entre los campos de registro_campo (REGISTRO_CAMPOS) que pesan en el menú (`peso_menu`) y que la casa
 * aún no ha dicho: su dato de ficha_casa v2 está vacío, por defecto o caducado (estadosDeFichas, estadoDeDato.js).
 * De más peso a menos; como mucho una por turno (quien la usa la hace y espera la respuesta).
 *
 * La frontera la pone la ficha Trato de quien escribe (trozo 16; arquitectura objetivo, «Responder»):
 *  - profundidad `nada` o ritmo `directo` («hazlo ya»): ninguna; se genera con lo que haya.
 *  - profundidad `preguntar` (el defecto): ninguna todavía; antes se le pregunta si lo preparamos ya o lo afinamos
 *    (PREGUNTA_DE_PROFUNDIDAD), y su respuesta se guarda en su trato.
 *  - `poco`: las LIMITE.poco de más peso; `mucho`: las LIMITE.mucho.
 *
 * Lo de seguridad (alergias, etapa del bebé) no sale de aquí: lo preguntan las tareas «falta saber» de Lola con su
 * política (registroTareas.js, CAMPOS_PREGUNTABLES), sea cual sea el trato; el trozo 34 junta las dos en tareas.
 */
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { leidoDe } from "./estadoDeDato.js";
import { PROFUNDIDAD_TRATO, RITMO_TRATO } from "./vocabularios.js";

/** Cuántas preguntas de afinar, como mucho, según la profundidad del trato. */
export const LIMITE = Object.freeze({
  [PROFUNDIDAD_TRATO.NADA]: 0,
  [PROFUNDIDAD_TRATO.PREGUNTAR]: 0,
  [PROFUNDIDAD_TRATO.POCO]: 2,
  [PROFUNDIDAD_TRATO.MUCHO]: 5,
});

/**
 * La pregunta de cada campo de afinar, en llano. Un campo de afinar sin texto aquí lo dice el test (no se pregunta
 * lo que no se sabe decir). Las respuestas las guarda Lola con su herramienta de siempre (`guarda`).
 */
export const PREGUNTA_DE_CAMPO = Object.freeze({
  meals: { texto: "¿Qué comidas os preparo: solo la cena, comida y cena…?", guarda: "ajustar_cocina" },
  mealStructure: { texto: "A mediodía, ¿primero y segundo o plato único?", guarda: "ajustar_cocina" },
  cookLevel: { texto: "¿Cuánto os apetece cocinar entre semana: lo básico, normal o algo más elaborado?", guarda: "ajustar_cocina" },
  kitchenTools: { texto: "¿Qué aparatos tenéis en la cocina (horno, airfryer, olla rápida…)?", guarda: "ajustar_cocina" },
  pantryMode: { texto: "¿Quieres que el menú aproveche lo que ya tenéis en casa?", guarda: "ajustar_uso_despensa" },
});

/** La pregunta de antes de afinar, con la profundidad por defecto: la respuesta va al trato (ajustar_trato). */
export const PREGUNTA_DE_PROFUNDIDAD = "¿Te lo preparo ya o lo afinamos juntos? Te guío con unas pocas preguntas.";

/** Los campos de afinar: de la casa, con peso en el menú y sin seguridad; de más peso a menos. */
export const CAMPOS_DE_AFINAR = Object.freeze(Object.entries(REGISTRO_CAMPOS)
  .filter(([, r]) => r.peso_menu != null && !r.seguridad && r.por === "casa" && r.ambito.length === 0)
  .sort(([, a], [, b]) => b.peso_menu - a.peso_menu)
  .map(([campo]) => campo));

/** ¿Falta este dato? Sin leer, vacío, por defecto o caducado; lo dicho, supuesto o aprendido ya no se pregunta. */
function falta(leido) {
  if (!leido) return true;
  if (leido.bloqueado) return false;
  return leido.caducado || leido.estado === "vacio" || leido.estado === "por_defecto";
}

/**
 * Pura. Lo que queda por afinar para esta cuenta, en orden, con el límite de su trato. `estados`: el Map de
 * estadosDeFichas (o null: sin ficha, todo falta). `trato`: el de quien escribe ({ ritmo, profundidad }; trato.js),
 * o null (sus defectos: se pregunta antes la profundidad).
 * @returns {{ campo: string, texto: string, guarda: string }[]}
 */
export function preguntasDeAfinar(estados, trato) {
  const profundidad = trato?.profundidad ?? PROFUNDIDAD_TRATO.PREGUNTAR;
  if (trato?.ritmo === RITMO_TRATO.DIRECTO) return [];
  const limite = LIMITE[profundidad] ?? 0;
  if (!limite) return [];
  // El límite elige QUÉ se afina (los de más peso), no cuántos quedan: contestado uno, no entra el siguiente.
  return CAMPOS_DE_AFINAR
    .filter((campo) => PREGUNTA_DE_CAMPO[campo])
    .slice(0, limite)
    .filter((campo) => falta(leidoDe(estados, campo)))
    .map((campo) => ({ campo, ...PREGUNTA_DE_CAMPO[campo] }));
}

/**
 * Pura. La siguiente pregunta para esta cuenta, o null. Con la profundidad sin decir (`preguntar`) y algo por afinar,
 * la de antes de afinar (`campo: null`, se guarda con ajustar_trato).
 * @returns {{ campo: string|null, texto: string, guarda: string } | null}
 */
export function siguientePregunta(estados, trato) {
  const profundidad = trato?.profundidad ?? PROFUNDIDAD_TRATO.PREGUNTAR;
  if (trato?.ritmo === RITMO_TRATO.DIRECTO || profundidad === PROFUNDIDAD_TRATO.NADA) return null;
  if (profundidad === PROFUNDIDAD_TRATO.PREGUNTAR) {
    const algo = CAMPOS_DE_AFINAR.some((c) => PREGUNTA_DE_CAMPO[c] && falta(leidoDe(estados, c)));
    return algo ? { campo: null, texto: PREGUNTA_DE_PROFUNDIDAD, guarda: "ajustar_trato" } : null;
  }
  return preguntasDeAfinar(estados, trato)[0] ?? null;
}

/**
 * Pura. La línea de lo del día para Lola cuando quien escribe ha pedido afinar (profundidad poco o mucho): la
 * siguiente pregunta, una por mensaje, y con qué herramienta se guarda la respuesta. null si no hay que afinar o si
 * no hay estados (sin la ficha de la base no se sabe qué falta: mejor no preguntar lo que quizá ya se dijo).
 * La pregunta de antes de afinar (profundidad `preguntar`) no va aquí: la dice la línea del trato (trato.js) al
 * pedir un menú, y tras el alta, link.js.
 */
export function lineaDeAfinar(estados, trato) {
  if (!estados) return null;
  const p = siguientePregunta(estados, trato);
  if (!p?.campo) return null;
  return `AFINANDO (lo pidió en su trato): la siguiente pregunta, como mucho una por mensaje y sin cortar lo que pida: «${p.texto}». Lo que conteste se guarda con ${p.guarda}. Cuando no quede nada por afinar, deja de preguntar.`;
}
