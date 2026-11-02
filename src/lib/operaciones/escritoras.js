/**
 * Quién escribe fichas en la base (plan fichas con estado, trozo 26): las
 * funciones de la base que lo hacen y las llamadas del código que aún no van
 * por la tubería. Listas cerradas, en un solo sitio: las vigila
 * src/lib/tuberiaUnica.test.js (cuadran con las migraciones y con el código).
 */

/** De la tubería: las RPC por las que pasa toda operación. */
const ESCRITORAS_TUBERIA = Object.freeze({
  aplicar_operacion: "tubería (0106)",
  escribir_dato: "tubería (0106; llama a aplicar_operacion)",
  deshacer_operacion: "tubería (0111): deshace una operación con su inversa",
  escribir_persona: "tubería (0108): la única escritura de persona, persona_* y grupo",
  escribir_preferencias: "tubería (0109): la única escritura de preferencia y plan_preferencias",
});

/**
 * Heredadas: escriben fichas fuera de la tubería, y quién las retira. Vacía desde la 0108 (trozo 10), que
 * retiró persona_sincronizar_casa, persona_reemplazar_casa y el disparador _personas_al_guardar (0079-0089).
 */
export const ESCRITORAS_HEREDADAS = Object.freeze({});

/** Todas las funciones de la base que escriben fichas. */
export const ESCRIBEN_FICHAS = Object.freeze({ ...ESCRITORAS_TUBERIA, ...ESCRITORAS_HEREDADAS });

/** Quién llama hoy a una heredada desde el código (ruta con «/»), y a cuál. Vacía: scripts/backfill-personas.mjs se fue con la 0108. */
export const LLAMADAS_HEREDADAS = Object.freeze({});
