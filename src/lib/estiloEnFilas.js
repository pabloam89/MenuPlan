// El estilo de comida de cada menú (`mealStyleByGroup`) en filas de preferencia (trozo 14 de #1037; eje
// estiloComida, la 0117). Una fila por menú: la de su grupo, o la de la casa entera (clave CLAVE_CASA) si no hay
// grupos que elegir; «el estilo de la semana es X». Sin fila, el de por defecto de la pantalla (DEFAULT_MEAL_STYLE,
// Onboarding.jsx). Lo leen la app y Lola al cargar y lo que cambia va con la libreta a escribir_preferencias
// (libretaEnData.js). El estilo solo elige con qué veces arranca cada familia: las veces son de la libreta (freqs).

import { PreferenciaInvalida } from "./preferencias.js";

/** La clave de `mealStyleByGroup` del menú de toda la casa (Onboarding.jsx y Menu.jsx). */
export const CLAVE_CASA = "__global__";

/** La forma de la fila de un estilo. Obligatoria: es lo que la casa eligió, no un gusto que el motor pese. */
export const FORMA_ESTILO = Object.freeze({ nivel: "semana", eje: "estiloComida", medida: "valor", operador: "es", fuerza: "obligatoria" });

const SIN_AMBITO = ["persona_id", "plan_id", "dias", "comidas", "semanas", "salvo_dias", "salvo_comidas", "salvo_semanas", "desde", "hasta"];

/** ¿Es la fila del estilo de un menú? Del grupo o de la casa, sin persona, conjunto ni ámbito. */
export const esFilaDeEstilo = (f) => f?.eje === FORMA_ESTILO.eje && f.operador === FORMA_ESTILO.operador && SIN_AMBITO.every((k) => f[k] == null);

/** Pura. `mealStyleByGroup` de las filas: { [grupo o CLAVE_CASA]: estilo }. Dos estilos para un menú: PreferenciaInvalida. */
export function estilosDeFilas(filas) {
  const estilos = {};
  for (const f of (filas ?? []).filter(esFilaDeEstilo)) {
    const clave = f.grupo_id ?? CLAVE_CASA;
    if (Object.hasOwn(estilos, clave)) throw new PreferenciaInvalida(`dos estilos de comida para el menú ${clave}`);
    estilos[clave] = String(f.valor);
  }
  return estilos;
}

/**
 * Pura. Lo que cambió en `mealStyleByGroup`, como lista de escribir_preferencias: la fila de cada menú que cambia (con
 * el id de la suya, si la hay) o borrarla. Un estilo que no es un id, o de un grupo que no es de la casa: PreferenciaInvalida.
 */
export function cambiosDeEstilos(antes, despues, filas, grupos = []) {
  if (despues === undefined) return [];
  const idDe = new Map((filas ?? []).filter(esFilaDeEstilo).map((f) => [f.grupo_id ?? CLAVE_CASA, f.id]));
  const a = antes ?? {};
  const d = despues ?? {};
  const cambios = [];
  for (const clave of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (a[clave] === d[clave]) continue;
    const id = idDe.get(clave);
    if (d[clave] == null) {
      if (id) cambios.push({ id, borrar: true });
      continue;
    }
    if (typeof d[clave] !== "string" || !d[clave].trim()) throw new PreferenciaInvalida(`el estilo de comida es un id de MEAL_STYLES, no «${d[clave]}»`);
    if (clave !== CLAVE_CASA && !grupos.some((g) => g.id === clave)) throw new PreferenciaInvalida(`el estilo de comida de un menú que no es de la casa (${clave})`);
    cambios.push({ ...(id ? { id } : {}), ...FORMA_ESTILO, grupo_id: clave === CLAVE_CASA ? null : clave, valor: d[clave], cantidad: null, origen: "dicho" });
  }
  return cambios;
}
