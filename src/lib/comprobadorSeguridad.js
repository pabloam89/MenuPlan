/**
 * Comprobador de seguridad de alergias: dada una casa y un menú, dice si el
 * menú respeta las alergias de cada miembro, y por qué no si no lo respeta.
 *
 * Es una función pura: no lee base de datos ni red. Todo entra por parámetros,
 * y lo que sale son códigos de un enum, nunca texto libre.
 *
 * Alcance de esta versión: alergias UE (la clase `alergeno`). Intolerancias,
 * estados y perfiles de salud vienen después, con sus propias reglas.
 *
 * ── Política aplicada (docs/alergias/04-politica.md) ─────────────────────────
 * · Un alérgeno declarado («contiene») bloquea siempre.
 * · Un «puede contener» también bloquea: las trazas no se toleran en alergias.
 * · Un ingrediente sin datos NO se da por seguro: queda como NO_VERIFICADO y el
 *   resultado no es `ok`.
 */

/** Presencias que sabe leer el comprobador. Cualquier otra cosa cuenta como no verificada. */
export const PRESENCIA = Object.freeze({
  CONTIENE: "contiene",
  PUEDE_CONTENER: "puede_contener",
  AUSENTE: "ausente",
});

/** Códigos de incumplimiento. Son el único texto que sale del comprobador. */
export const CODIGO = Object.freeze({
  ALERGENO_DECLARADO: "ALERGENO_DECLARADO",
  ALERGENO_PUEDE_CONTENER: "ALERGENO_PUEDE_CONTENER",
  NO_VERIFICADO: "NO_VERIFICADO",
});

/**
 * @typedef {Object} Miembro
 * @property {string} id
 * @property {string[]} alergias   ids de alérgenos UE (p. ej. "gluten", "leche")
 *
 * @typedef {Object} Casa
 * @property {Miembro[]} miembros
 *
 * @typedef {Object} Receta
 * @property {string} id
 * @property {string[]} ingredientes  ids de ingrediente
 *
 * @typedef {Record<string, Record<string, string>>} Hechos
 *   ingredienteId → { alérgeno: presencia }. Un ingrediente que no aparece en
 *   el mapa es «sin datos».
 *
 * @typedef {Object} Incumplimiento
 * @property {string} codigo        un valor de CODIGO
 * @property {string} miembroId
 * @property {string} recetaId
 * @property {string} ingredienteId
 * @property {string} alergeno
 *
 * @typedef {Object} Resultado
 * @property {boolean} ok           true solo si no hay incumplimientos
 * @property {Incumplimiento[]} incumplimientos
 */

/**
 * @param {Casa} casa
 * @param {Receta[]} menu           recetas del menú (por id)
 * @param {Hechos} hechos           datos ingrediente → alérgeno
 * @returns {Resultado}
 */
export function comprobarSeguridad(casa, menu, hechos) {
  const incumplimientos = [];
  const vistos = new Set();

  for (const miembro of casa?.miembros ?? []) {
    const alergias = miembro.alergias ?? [];
    if (alergias.length === 0) continue;

    for (const receta of menu ?? []) {
      for (const ingredienteId of receta.ingredientes ?? []) {
        const datos = hechos?.[ingredienteId];

        if (!datos) {
          // Sin datos no hay forma de saber si es seguro: no se da por bueno.
          const clave = `${miembro.id}|${receta.id}|${ingredienteId}|*`;
          if (!vistos.has(clave)) {
            vistos.add(clave);
            incumplimientos.push({
              codigo: CODIGO.NO_VERIFICADO,
              miembroId: miembro.id,
              recetaId: receta.id,
              ingredienteId,
              alergeno: "",
            });
          }
          continue;
        }

        for (const alergeno of alergias) {
          const presencia = datos[alergeno];
          let codigo = null;
          if (presencia === PRESENCIA.CONTIENE) codigo = CODIGO.ALERGENO_DECLARADO;
          else if (presencia === PRESENCIA.PUEDE_CONTENER) codigo = CODIGO.ALERGENO_PUEDE_CONTENER;
          else if (presencia === undefined) codigo = CODIGO.NO_VERIFICADO;
          // PRESENCIA.AUSENTE o cualquier otro valor conocido: sin incumplimiento.

          if (codigo) {
            incumplimientos.push({
              codigo,
              miembroId: miembro.id,
              recetaId: receta.id,
              ingredienteId,
              alergeno,
            });
          }
        }
      }
    }
  }

  return { ok: incumplimientos.length === 0, incumplimientos };
}
