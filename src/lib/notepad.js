/**
 * La libreta (notepad).
 *
 * Lo que la app sabe de esta casa, y —esto es lo importante— DE DÓNDE lo sabe.
 *
 * ── Por qué no guarda valores ─────────────────────────────────────────────
 * La tentación era copiar aquí `freqs`, `allergies` y compañía y declarar la
 * libreta "fuente de la verdad". Eso crea dos sitios con el mismo dato, y dos
 * sitios con el mismo dato siempre acaban diciendo cosas distintas.
 *
 * Así que la libreta es un ACOMPAÑANTE: guarda, por campo, quién puso ese
 * valor y si está confirmado. El valor sigue viviendo donde ya vivía
 * (`data.freqs`, `data.allergies`…). Para los ejes que no existían todavía
 * —sesgo de cocina, de técnica— sí es su casa, porque no hay nada que duplicar.
 * Cada fila del registro dice cuál de los dos casos es.
 *
 * ── Los cuatro estados ────────────────────────────────────────────────────
 * No es "relleno o vacío". El mismo 2 en `pescado` significa cuatro cosas:
 *
 *   fijado     Lo dijiste tú. Se respeta y no se pregunta.
 *   inferido   Lo dedujimos de tu texto. Se pinta pre-rellenado PARA QUE LO
 *              CONFIRMES — nunca llega al planner como si lo hubieras dicho.
 *   delegado   "Lo que tú veas". No es un hueco: es permiso.
 *   vacío      No sabemos nada. Se pregunta, o cae a un default visible.
 *
 * `bloqueado` es aparte y es más fuerte que todo: un tema descartado a mano no
 * vuelve a preguntarse nunca, que es distinto de saltárselo hoy.
 *
 * ── Procedencia ───────────────────────────────────────────────────────────
 * Cada escritura del panel guarda la FRASE que la causó y su fecha. Sirve para
 * tres cosas a la vez: deshacer, explicar ("está así porque dijiste…") y que
 * el usuario pueda desmentirlo. Es casi todo el trabajo de confianza del panel
 * por muy poco código.
 */

import { z } from "zod";

/** De dónde salió un valor. */
export const ORIGENES = ["texto", "pregunta", "default", "perfil", "arquetipo"];

/** Los cuatro estados de un campo, tal y como los ve el resto de la app. */
export const ESTADOS = ["vacio", "inferido", "delegado", "fijado"];

export const NOTEPAD_VERSION = 1;

const ProcedenciaSchema = z.object({
  // La frase literal del usuario. Se guarda entera y sin tocar: es lo que se
  // le enseña de vuelta, y reescribirla sería justo lo que rompe la confianza.
  frase: z.string().max(500),
  fecha: z.string(),          // ISO local, YYYY-MM-DD
});

const CampoSchema = z.object({
  origen: z.enum(["texto", "pregunta", "default", "perfil", "arquetipo"]),
  confirmado: z.boolean().default(false),
  delegado: z.boolean().default(false),
  bloqueado: z.boolean().default(false),
  procedencia: ProcedenciaSchema.optional(),
  // El valor anterior, para poder deshacer mañana y no solo en los dos
  // segundos que dura un toast.
  anterior: z.unknown().optional(),
});

export const NotepadSchema = z.object({
  v: z.literal(NOTEPAD_VERSION),
  campos: z.record(z.string(), CampoSchema),
});

/** Una libreta vacía. Vacía no es rota: es el estado inicial de todos. */
export function libretaVacia() {
  return { v: NOTEPAD_VERSION, campos: {} };
}

/**
 * El estado de un campo, que es la pregunta que se hace la UI.
 *
 * Necesita el valor actual además de la libreta porque "vacío" no es una
 * anotación: es la ausencia de una. Un campo del que la libreta no sabe nada
 * pero que tiene valor está en `default` — hay algo que enseñar, y hay que
 * enseñarlo como suposición, no como decisión del usuario.
 */
export function estadoDe(notepad, path, valorActual) {
  const campo = notepad?.campos?.[path];
  if (!campo) return valorActual == null ? "vacio" : "inferido";
  if (campo.bloqueado) return "fijado";
  if (campo.delegado) return "delegado";
  if (campo.origen === "pregunta" || campo.confirmado) return "fijado";
  if (campo.origen === "default") return valorActual == null ? "vacio" : "inferido";
  return "inferido";
}

/** ¿Se puede volver a preguntar por esto? Un no-go dice que no, para siempre. */
export function sePuedePreguntar(notepad, path) {
  const campo = notepad?.campos?.[path];
  if (!campo) return true;
  return !campo.bloqueado && !campo.delegado && !campo.confirmado;
}

/**
 * Anota una escritura. Devuelve una libreta NUEVA — nunca muta la que recibe,
 * porque estas llegan del estado de React y mutarlas se traga los re-renders.
 */
export function anotar(notepad, path, { origen, frase, fecha, anterior, confirmado = false }) {
  const base = notepad?.v === NOTEPAD_VERSION ? notepad : libretaVacia();
  const previo = base.campos[path];
  return {
    ...base,
    campos: {
      ...base.campos,
      [path]: {
        origen,
        confirmado,
        delegado: false,
        // Un campo bloqueado sigue bloqueado: escribir no desbloquea. Para eso
        // está `desbloquear`, que es un gesto explícito del usuario.
        bloqueado: previo?.bloqueado ?? false,
        ...(frase ? { procedencia: { frase, fecha } } : {}),
        // Solo se guarda el valor anterior de la PRIMERA escritura de una
        // tanda: si no, dos cambios seguidos dejarían "anterior" apuntando al
        // penúltimo y el deshacer no volvería al principio.
        ...(anterior !== undefined && previo?.anterior === undefined
          ? { anterior }
          : previo?.anterior !== undefined
            ? { anterior: previo.anterior }
            : {}),
      },
    },
  };
}

/** "Lo que tú veas": resuelto, no vacío. Es lo único que acorta el wizard. */
export function delegar(notepad, path) {
  const base = notepad?.v === NOTEPAD_VERSION ? notepad : libretaVacia();
  return {
    ...base,
    campos: {
      ...base.campos,
      [path]: { ...base.campos[path], origen: "pregunta", confirmado: false, delegado: true, bloqueado: false },
    },
  };
}

/** Un no-go: no se vuelve a preguntar. Distinto de saltárselo hoy. */
export function bloquear(notepad, path) {
  const base = notepad?.v === NOTEPAD_VERSION ? notepad : libretaVacia();
  return {
    ...base,
    campos: {
      ...base.campos,
      [path]: { ...base.campos[path], origen: base.campos[path]?.origen ?? "pregunta", bloqueado: true, delegado: false, confirmado: true },
    },
  };
}

/** Confirmar lo inferido: pasa de "creo que" a "me lo dijiste". */
export function confirmar(notepad, path) {
  const campo = notepad?.campos?.[path];
  if (!campo) return notepad;
  return { ...notepad, campos: { ...notepad.campos, [path]: { ...campo, confirmado: true } } };
}

/** Olvidar una anotación — el deshacer del panel. El valor lo repone quien llama. */
export function olvidar(notepad, path) {
  if (!notepad?.campos?.[path]) return notepad;
  const campos = { ...notepad.campos };
  delete campos[path];
  return { ...notepad, campos };
}

/**
 * La frase que explica por qué un campo está como está, o null si no hay nada
 * que contar. Es el "recibo" del panel, y sale gratis de la procedencia.
 */
export function porQue(notepad, path) {
  const p = notepad?.campos?.[path]?.procedencia;
  return p ? `Porque dijiste «${p.frase}» el ${p.fecha}` : null;
}

/** Migra o descarta una libreta de versión desconocida. */
export function normalizar(raw) {
  if (!raw || typeof raw !== "object") return libretaVacia();
  const parsed = NotepadSchema.safeParse(raw);
  // Una libreta corrupta se tira entera: son metadatos: perderlos degrada la
  // explicación, no los datos. Arrastrar basura sería peor.
  return parsed.success ? parsed.data : libretaVacia();
}
