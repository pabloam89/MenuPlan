/**
 * Qué sabe una casa de cada eje del menú, venga de donde venga (trozo 64 de #1037, tramo 10): del sobre de ficha_casa v2,
 * de la libreta (las filas de `preferencia`, ya proyectadas) o del documento. Puro: lo que se lee lo trae quien llama.
 * Mismo criterio que `falta` de siguientePregunta.js: lo dicho, supuesto o aprendido no se pregunta.
 */
import { TEMAS, VIVE_EJE } from "./caminos.js";
import { leidoDe } from "./estadoDeDato.js";
import { matizDe } from "./notepad.js";
import { presupuestoGuardado } from "./presupuestoCasa.js";
import { DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";
import { falta } from "./siguientePregunta.js";
import { ESTADO_DATO } from "./vocabularios.js";

/** `no_aplica`: el eje no cuenta en esta casa (la etapa del bebé, sin bebé). */
export const ESTADO_EJE = Object.freeze({ SABIDO: "sabido", SUPUESTO: "supuesto", FALTA: "falta", NO_APLICA: "no_aplica" });

const datoDe = (nombre) => DATOS_CASA[nombre] ?? DATOS_PERSONA[nombre];
const esDePersona = (d) => d.entidad === "persona";

/** Un hueco dicho (un campo con ámbito) cuenta: la base puede seguir vacía con la rutina ya contada por días. */
const tieneHueco = (estados, campo, personaId) => [...estados.values()].some((l) => l.campo === campo
  && l.ambito && l.conSobre && (l.personaId ?? null) === (personaId == null ? null : String(personaId)));

function delSobre(nombre, { estados, personas }) {
  const sujetos = esDePersona(datoDe(nombre)) ? personas : [null];
  if (!sujetos.length) return ESTADO_EJE.FALTA;
  const leidos = sujetos.map((id) => ({ id, leido: leidoDe(estados, nombre, id) }));
  if (leidos.some(({ id, leido }) => falta(leido) && !tieneHueco(estados, nombre, id))) return ESTADO_EJE.FALTA;
  return leidos.some(({ leido }) => leido?.estado === ESTADO_DATO.SUPUESTO) ? ESTADO_EJE.SUPUESTO : ESTADO_EJE.SABIDO;
}

function deLaLibreta(prefijo, data) {
  const apuntes = Object.entries(data.notepad?.campos ?? {}).filter(([ruta, c]) => ruta.startsWith(`${prefijo}.`) && c.valor !== undefined);
  if (!apuntes.length) return ESTADO_EJE.FALTA;
  return apuntes.every(([, c]) => matizDe(c) === "supuesto") ? ESTADO_EJE.SUPUESTO : ESTADO_EJE.SABIDO;
}

const tieneValor = (v) => v != null && (typeof v !== "object" || Object.keys(v).length > 0);

function delDocumento(nombre, data) {
  // Sin presupuesto dicho es `null`: lo dijeron. Solo `undefined` es que nadie lo ha dicho (presupuestoCasa.js).
  if (nombre === "presupuesto") return presupuestoGuardado(data) === undefined ? ESTADO_EJE.FALTA : ESTADO_EJE.SABIDO;
  return tieneValor(data[nombre]) ? ESTADO_EJE.SABIDO : ESTADO_EJE.FALTA;
}

function estadoDeEje({ dato, vive }, { estados, data, personas, hayBebe }) {
  const d = datoDe(dato);
  if (d.aplica === "bebe") {
    if (!hayBebe) return ESTADO_EJE.NO_APLICA;
    return (data.members ?? []).some((m) => m[dato]) ? ESTADO_EJE.SABIDO : ESTADO_EJE.FALTA;
  }
  if (vive === VIVE_EJE.SOBRE) return delSobre(dato, { estados, personas });
  return d.libreta ? deLaLibreta(d.libreta, data) : delDocumento(dato, data);
}

/**
 * Pura. El estado de cada eje de los temas, por su dato.
 * `estados`: el Map de estadosDeFichas; sin él, null: sin ficha no se sabe qué falta, y es mejor no preguntar lo que quizá
 * ya se dijo. `data`: el documento con la libreta. `personas`: los ids de quien come. `hayBebe`: si la casa tiene bebé.
 * @returns {Record<string, string> | null}
 */
export function ejesDeCasa({ estados, data = {}, personas = [], hayBebe = false }) {
  if (!estados) return null;
  const ejes = TEMAS.flatMap((t) => t.ejes);
  return Object.fromEntries(ejes.map((e) => [e.dato, estadoDeEje(e, { estados, data, personas, hayBebe })]));
}
