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
import { puede, PAPELES } from "../papeles.js";
import {
  CANAL_DATO, ORIGENES_DE_LA_FAMILIA, MOTIVO_PUERTA, FALLO_DATO, OPERADOR_PREFERENCIA as OP, MOMENTO_CHOQUE,
  RESPUESTA_CHOQUE as R, CRITERIO_CHOQUE as CR,
} from "../vocabularios.js";
import { claseDe, alcanceDe, resolverChoque } from "../choques.js";

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

/** Los operadores que no pueden cumplirse a la vez sobre el mismo eje y valor; los de cantidad, solo si no caben. */
const OPUESTO = Object.freeze({ [OP.MAS]: OP.MENOS, [OP.MENOS]: OP.MAS, [OP.ES]: OP.NO_ES, [OP.NO_ES]: OP.ES, [OP.AL_MENOS]: OP.COMO_MUCHO, [OP.COMO_MUCHO]: OP.AL_MENOS });
const CON_CANTIDAD = [OP.AL_MENOS, OP.COMO_MUCHO];
const cortan = (x, y) => !x || !y || x.some((v) => y.includes(v));
const sujetoDe = (p) => p.persona_id ?? p.grupo_id ?? null;
// Lo dicho por otra persona lo dijo alguien que edita la casa (la puerta no deja otra cosa): el menor papel que puede.
const QUIEN_EDITA = PAPELES.filter((p) => puede(p, "editar_casa")).at(-1);

/** Pura. ¿Se contradicen dos filas de preferencia? Mismo eje, nivel y valor, sujetos y ámbitos que se cruzan, operadores opuestos. */
export function seContradicen(a, b) {
  if (a.eje !== b.eje || a.nivel !== b.nivel || JSON.stringify(a.valor ?? null) !== JSON.stringify(b.valor ?? null)) return false;
  if (OPUESTO[a.operador] !== b.operador) return false;
  if (CON_CANTIDAD.includes(a.operador)) {
    const [minimo, maximo] = a.operador === OP.AL_MENOS ? [a.cantidad, b.cantidad] : [b.cantidad, a.cantidad];
    if (!(Number(minimo) > Number(maximo))) return false; // «al menos 2» y «como mucho 3» caben
  }
  // Lo de la casa entera se cruza con todo; dos personas o dos grupos distintos, no.
  if (sujetoDe(a) && sujetoDe(b) && sujetoDe(a) !== sujetoDe(b)) return false;
  return cortan(a.dias, b.dias) && cortan(a.comidas, b.comidas) && cortan(a.semanas, b.semanas);
}

/** Un lado del choque (choques.js) de una fila de preferencia: su clase, fuerza, quién la dijo y su alcance. */
function ladoDe(p, { autor, papel, at }) {
  return {
    clase: claseDe({ origen: p.origen ?? ORIGENES_DE_LA_FAMILIA[0] }),
    fuerza: p.fuerza,
    autor, papel: autor ? papel : null, // lo visto o supuesto no tiene autor
    ...alcanceDe(p),
    vigente: !p.hasta || p.hasta >= String(at).slice(0, 10),
    at: p.updated_at ?? at,
  };
}

/**
 * Pura. Cada par que se contradice entre `nuevas` (la operación) y `guardadas` (preferencias_de_casa), resuelto
 * (resolverChoque). Lo que la operación cambia, borra o rechaza, y lo ya rechazado, no cuenta. Cambiar una fila a su
 * contraria (mismo id) choca con lo que era, salvo en una pantalla (`delante`: lo guardado se ve y cambiarlo es
 * decidir). `nueva` es su posición en `nuevas`; `guardada`, el id. Sin valores. `quien`: { autor, papel, at, delante }.
 */
export function choquesAlGuardar(nuevas, guardadas, { autor, papel, at, delante = false }) {
  const tocadas = new Set(nuevas.map((p) => p.id).filter(Boolean));
  const vivas = (guardadas ?? []).filter((g) => !g.rechazada_at);
  const deLaFamiliaP = (p) => deLaFamilia(p.origen ?? ORIGENES_DE_LA_FAMILIA[0]);
  const out = [];
  nuevas.forEach((p, i) => {
    if (p.borrar || p.rechazar) return;
    const nueva = ladoDe({ ...p, updated_at: at }, { autor: deLaFamiliaP(p) ? autor : null, papel, at });
    for (const g of vivas) {
      if (g.id === p.id ? delante : tocadas.has(g.id)) continue;
      if (!seContradicen(p, g)) continue;
      const dichaPor = deLaFamiliaP(g) ? g.dicho_by ?? null : null;
      const guardada = ladoDe(g, { autor: dichaPor, papel: dichaPor === autor ? papel : QUIEN_EDITA, at });
      // De la casa: lo guardado lo dijo otra persona. Se pregunta a quien tiene autoridad, no a quien escribe.
      const de_la_casa = !!guardada.autor && guardada.autor !== nueva.autor;
      out.push(resolverChoque(nueva, guardada, { de_la_casa }, { momento: MOMENTO_CHOQUE.AL_GUARDAR, nueva: i, guardada: g.id }));
    }
  });
  return out;
}

/**
 * Pura. Lo que se escribe tras los choques: la nueva que pierde, o que hay que preguntar o decidir, se aparta (lo
 * dicho por otro no se pisa en silencio); la vieja que pierde por tiempo se borra en la misma operación; lo que gana
 * por alcance convive. Devuelve { preferencias, apartadas } (`apartadas`: posiciones en `nuevas`).
 */
export function trasLosChoques(nuevas, choques) {
  const SE_APLICA = [R.APLICAR_EN_SILENCIO, R.APLICAR_Y_AVISAR];
  const apartadas = new Set(choques.filter((c) => c.gana !== "a" || !SE_APLICA.includes(c.respuesta)).map((c) => c.nueva));
  // La que se cambia en la misma operación (mismo id) no se borra: se reescribe.
  const cambiadas = new Set(nuevas.map((p) => p.id).filter(Boolean));
  const retirar = [...new Set(choques.filter((c) => !apartadas.has(c.nueva) && c.criterio === CR.TIEMPO && !cambiadas.has(c.guardada)).map((c) => c.guardada))];
  return {
    preferencias: [...nuevas.filter((_, i) => !apartadas.has(i)), ...retirar.map((id) => ({ id, borrar: true }))],
    apartadas: [...apartadas].sort((a, b) => a - b),
  };
}
