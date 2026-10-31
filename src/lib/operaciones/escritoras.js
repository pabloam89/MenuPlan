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
});

/** Heredadas: escriben fichas fuera de la tubería, y quién las retira. */
export const ESCRITORAS_HEREDADAS = Object.freeze({
  persona_sincronizar_casa: "heredada (0081-0082): la retira la 0108, trozo 10",
  persona_reemplazar_casa: "heredada (0079; delega en persona_sincronizar_casa): la retira la 0108, trozo 10",
  _personas_al_guardar: "heredada: disparador de household_state (0089) que copia members a persona_*; lo retira la 0108, trozo 10",
});

/** Todas las funciones de la base que escriben fichas. */
export const ESCRIBEN_FICHAS = Object.freeze({ ...ESCRITORAS_TUBERIA, ...ESCRITORAS_HEREDADAS });

/** Quién llama hoy a una heredada desde el código (ruta con «/»), y a cuál. */
export const LLAMADAS_HEREDADAS = Object.freeze({ "scripts/backfill-personas.mjs": "persona_reemplazar_casa" });
