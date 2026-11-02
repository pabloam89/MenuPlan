/**
 * Señales que olvidan (plan fichas con estado, trozo 15; tabla `senal`, 0109).
 *
 * Lo que la casa hace (cambiar un plato, votar, descartar) se cuenta en `senal`: una fila por (casa, eje, valor) con
 * un peso que la base olvida sola de noche (`senal_decaer`, 0109: la fórmula vive allí; aquí solo se lee el peso).
 * Solo aprende en los campos de sesgo de la libreta que tienen valor en el plato (CAMPOS_QUE_APRENDEN): nunca en
 * salud, y nunca sobre lo que la familia dijo, rechazó o puso en una regla (eso manda y no se toca).
 */
import { CAMPOS_POR_ID } from "./notepadFields.js";
import { FORMA_DE_PROYECCION, filaDeApunte, valorDelEje, valorIdDelEje } from "./preferencias.js";
import { CANAL_DATO } from "./vocabularios.js";
import { MOTIVO_CAMBIO } from "./rastro.js";

/** Desde cuánto peso (en valor absoluto) una señal es «aprendido»: tres cambios netos hacia lo mismo, sin olvidar. */
export const UMBRAL_APRENDIDO = 3;

/**
 * Dónde trae el plato el valor de cada campo que aprende: lo mismo que mira sesgoScoreBoost (sesgos.js) para subirlo
 * o bajarlo, y la puerta de cocinas (`r.cocina`, filterRecipes.js) para la cocina; senales.test.js lo compara con
 * sesgoScoreBoost en todo el catálogo. La salsa solo cuenta si la lleva (sesgos.js no mueve los platos sin salsa).
 */
const DEL_PLATO = Object.freeze({
  base: (r) => [r.mainBase, ...(r.basesAparte ?? [])],
  cocina: (r) => [r.cocina],
  tecnica: (r) => [r.tecnica],
  salsa: (r) => (r.llevaSalsa === true ? ["si"] : []),
});

/** Los campos de la libreta que se aprenden de lo que hace la casa: los sesgos que el plato trae escritos. */
const CAMPOS_QUE_APRENDEN = Object.freeze(Object.keys(DEL_PLATO));

/** El campo de la libreta de cada eje que aprende (basePrincipal → base…). */
const CAMPO_DEL_EJE = Object.freeze(Object.fromEntries(CAMPOS_QUE_APRENDEN.map((c) => [CAMPOS_POR_ID[c]?.eje, c])));

/** La acción con que se apunta en `operacion` lo aprendido: con ella se sabe de dónde salió una preferencia vista. */
export const ACCION_APRENDER = "aprender_de_senales";

/** Lo que es «visto» en una preferencia (el origen de lo aprendido; ORIGENES de la tabla preferencia). */
const VISTO = "visto";

const clave = (eje, valor) => `${eje}|${JSON.stringify(valor)}`;

/** Pura. Los (eje, valor) de un plato en los campos que aprenden, solo con valores del dominio de cada campo. */
export function valoresDelPlato(receta) {
  if (!receta) return [];
  return CAMPOS_QUE_APRENDEN.flatMap((c) => {
    const { eje, dominio } = CAMPOS_POR_ID[c];
    return [...new Set(DEL_PLATO[c](receta))].filter((v) => dominio.includes(v)).map((v) => ({ eje, valor: valorDelEje(eje, v) }));
  });
}

/** Por qué se cambió un plato (MOTIVO_CAMBIO, rastro.js) cuando el que entra lo eligió alguien de la casa, no el motor. */
export const MOTIVOS_QUE_ELIGEN = Object.freeze([MOTIVO_CAMBIO.PEDIDO, MOTIVO_CAMBIO.ELECCION, MOTIVO_CAMBIO.MANUAL]);

/**
 * Pura. Las señales de un cambio de plato: −1 por cada valor del que sale; +1 por cada valor del que entra, si lo
 * eligió alguien de la casa (MOTIVOS_QUE_ELIGEN). Lo que está en los dos se anula. Un motivo que no es de
 * MOTIVO_CAMBIO lanza.
 * @returns {{ eje: string, valor: unknown, delta: number }[]}
 */
export function senalesDeCambio({ sale = null, entra = null, motivo }) {
  if (!Object.values(MOTIVO_CAMBIO).includes(motivo)) throw new Error(`senalesDeCambio: motivo «${motivo}» fuera de MOTIVO_CAMBIO`);
  const suma = new Map();
  const anotar = (receta, delta) => {
    for (const { eje, valor } of valoresDelPlato(receta)) {
      const k = clave(eje, valor);
      suma.set(k, { eje, valor, delta: (suma.get(k)?.delta ?? 0) + delta });
    }
  };
  anotar(sale, -1);
  if (MOTIVOS_QUE_ELIGEN.includes(motivo)) anotar(entra, 1);
  return [...suma.values()].filter((s) => s.delta !== 0);
}

/**
 * ¿La puso el sistema al aprender? Vista, por el canal `sistema` (ni Lola ni la app escriben ahí: Lola habla por un
 * chat y una pantalla no puede poner nada visto, puerta.js), de la casa entera y sin ámbito, y sin rechazar.
 */
function esAprendida(f) {
  return f.origen === VISTO && f.canal === CANAL_DATO.SISTEMA && !f.rechazada_at
    && !f.persona_id && !f.grupo_id && !f.plan_id && !f.dias && !f.comidas && !f.semanas && !f.desde && !f.hasta;
}

/**
 * Pura. Lo que hay que pedir a escribir_preferencias para que las preferencias vistas de una casa digan lo que dicen
 * sus señales: crear la de cada señal de la casa que pasa el umbral (`mas` si el peso es positivo, `menos` si no), y
 * borrar la aprendida que ya no lo pasa o que va en el otro sentido. Sobre un eje y valor en el que la familia ya
 * dijo, rechazó o reglamentó algo no se crea nada, y lo aprendido se retira: lo dicho manda.
 * @param {{ user_id?: string|null, eje: string, valor: unknown, peso: number|string }[]} senales  las filas de senal de la casa
 * @param {object[]} preferencias  las de preferencias_de_casa
 * @returns {object[]}  la lista `preferencias` de la operación (vacía si no hay nada que cambiar)
 */
export function vistasDeSenales(senales, preferencias) {
  const aprendidas = new Map();
  const deLaFamilia = new Set();
  for (const f of preferencias ?? []) {
    if (!CAMPO_DEL_EJE[f.eje] || f.nivel !== FORMA_DE_PROYECCION.sesgos.nivel) continue;
    const k = clave(f.eje, f.valor);
    if (esAprendida(f)) aprendidas.set(k, [...(aprendidas.get(k) ?? []), f]);
    else deLaFamilia.add(k);
  }
  const quiere = new Map();
  for (const s of senales ?? []) {
    const peso = Number(s.peso);
    if (!Number.isFinite(peso)) throw new Error(`senal ${s.eje}: peso ilegible ${JSON.stringify(s.peso)}`);
    if (s.user_id || !CAMPO_DEL_EJE[s.eje] || Math.abs(peso) < UMBRAL_APRENDIDO) continue;
    quiere.set(clave(s.eje, s.valor), { eje: s.eje, valor: s.valor, signo: peso > 0 ? 1 : -1 });
  }
  const cambios = [];
  for (const k of new Set([...aprendidas.keys(), ...quiere.keys()])) {
    const q = deLaFamilia.has(k) ? null : quiere.get(k);
    const operador = q ? (q.signo > 0 ? "mas" : "menos") : null;
    const tiene = (aprendidas.get(k) ?? []).filter((f) => {
      if (f.operador === operador) return true;
      cambios.push({ id: f.id, borrar: true, origen: VISTO });
      return false;
    });
    if (!q || tiene.length) continue;
    const campo = CAMPO_DEL_EJE[q.eje];
    cambios.push(filaDeApunte(`${campo}.${valorIdDelEje(q.valor)}`, { valor: q.signo, fuente: VISTO }));
  }
  return cambios;
}

// Cada campo que aprende es un sesgo de la libreta con eje propio (principio 3: mejor fallar al cargar que aprender
// en un campo que la libreta no lee como sesgo, o en dos campos con el mismo eje).
for (const c of CAMPOS_QUE_APRENDEN) {
  if (CAMPOS_POR_ID[c]?.proyecta !== "sesgos") throw new Error(`CAMPOS_QUE_APRENDEN: ${c} no es un sesgo de la libreta`);
}
if (Object.keys(CAMPO_DEL_EJE).length !== CAMPOS_QUE_APRENDEN.length) throw new Error("CAMPOS_QUE_APRENDEN: dos campos con el mismo eje");
