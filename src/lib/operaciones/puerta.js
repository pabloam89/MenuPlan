/**
 * La puerta de la tubería de operaciones (plan fichas con estado, trozo 26;
 * arquitectura objetivo, [3] «Comprobar» y D3): una sola, en el servidor,
 * igual para Lola y para la app. Lo que no pasa aquí no llega a la base como
 * dato: la tubería (tuberia.js) lo apunta como operación rechazada.
 *
 * Mira lo que la base no puede saber: el papel de quien pide (aplicar_operacion,
 * 0106, solo comprueba que el autor es de la casa, no si edita) y quién habla
 * (un origen «dicho» lo pone una persona, nunca un cron). Lo del registro que sí
 * sabe la base (que la salud no se supone, quién escribe cada campo, la regla de
 * choque) lo aplica aplicar_operacion una sola vez, y vuelve en `sin_hacer`.
 *
 * Pura: el papel lo trae quien llama (api/operacion.js lo lee de
 * household_members; Lola lo tiene de papelDeQuien).
 */
import { REGISTRO_CAMPOS } from "../registroCampos.js";
import { puede } from "../papeles.js";
import { CANAL_DATO, ORIGENES_DE_LA_FAMILIA, MOTIVO_PUERTA, FALLO_DATO } from "../vocabularios.js";

const deLaFamilia = (origen) => ORIGENES_DE_LA_FAMILIA.includes(origen);

/**
 * Pura. Lo que la puerta tiene contra una operación ya entendida (la forma de
 * operacionDeDato: canal, autor_user_id, datos), o null si pasa.
 * @param {{ canal: string, autor_user_id: string|null, datos: { campo: string, persona_id: string|null, origen: string }[] }} op
 * @param {{ papel: string|null }} quien  el papel en la casa del autor (owner, editor, viewer, ajeno) o null si no es de ella
 * @returns {{ motivo: string, campo: string|null, persona_id: string|null }|null}  motivo de MOTIVOS_PUERTA
 */
export function comprobar(op, { papel }) {
  const contra = (motivo, d = {}) => ({ motivo, campo: d.campo ?? null, persona_id: d.persona_id ?? null });
  const porPersona = op.canal !== CANAL_DATO.SISTEMA || op.autor_user_id != null;
  // Lola y la app hablan por alguien: tiene que ser de la casa y poder editarla. Un lector solo tacha la compra.
  if (porPersona && (op.autor_user_id == null || !puede(papel, "editar_casa"))) return contra(MOTIVO_PUERTA.SIN_PERMISO);
  for (const d of op.datos) {
    // Lo que dice la familia lo dice una persona; un cron o el motor no pueden firmar «dicho».
    if (deLaFamilia(d.origen) && op.autor_user_id == null) return contra(MOTIVO_PUERTA.ORIGEN_NO_VALE, d);
    // Desde una pantalla habla una persona: lo supuesto, visto, derivado o por defecto lo pone el sistema.
    if (op.canal === CANAL_DATO.APP && !deLaFamilia(d.origen)) return contra(MOTIVO_PUERTA.ORIGEN_NO_VALE, d);
    // La salud (alergias, etapa del bebé: `seguridad` en el registro) solo la dice una persona de la casa.
    if (REGISTRO_CAMPOS[d.campo]?.seguridad && !deLaFamilia(d.origen)) return contra(MOTIVO_PUERTA.SALUD_SIN_FAMILIA, d);
  }
  return null;
}

/**
 * Pura. El fallo (FALLOS_DATO) con que se contesta lo que para la puerta: a quien
 * no puede editar, sin_permiso; a lo demás, invalido (no se arregla repitiendo).
 */
export const falloDePuerta = (motivo) => (motivo === MOTIVO_PUERTA.SIN_PERMISO ? FALLO_DATO.SIN_PERMISO : FALLO_DATO.INVALIDO);
