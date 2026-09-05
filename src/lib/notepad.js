/**
 * La libreta (notepad).
 *
 * Lo que la app sabe de esta casa: el valor de cada eje y —esto es lo que la
 * hace distinta de un objeto de config— DE DÓNDE salió ese valor.
 *
 * ── Una sola casa ─────────────────────────────────────────────────────────
 * Todo eje vive aquí. La primera versión de este módulo guardaba solo los
 * metadatos y dejaba los valores donde ya estaban (`data.freqs`), para no
 * duplicar. Era peor: obligaba a decidir, eje por eje, en cuál de los dos
 * sitios vivía cada cosa. Esa regla no escala — a la tercera pregunta nueva ya
 * no te acuerdas de dónde estaba `cocina`.
 *
 * El miedo a duplicar se resuelve sin partir nada: `data.freqs` y compañía
 * pasan a ser una PROYECCIÓN (ver `proyectar`), calculada desde aquí. Hay un
 * único sitio donde se escribe y un único sitio donde está la verdad; lo que
 * leen `aiPlanner` y `filterRecipes` es una vista, no una copia.
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
 * `bloqueado` es aparte y más fuerte: un tema descartado a mano no vuelve a
 * preguntarse nunca, que es distinto de saltárselo hoy.
 *
 * ── Procedencia ───────────────────────────────────────────────────────────
 * Cada escritura del panel guarda la FRASE que la causó y su fecha. Sirve para
 * deshacer, para explicar ("está así porque dijiste…") y para que el usuario
 * pueda desmentirlo: casi todo el trabajo de confianza del panel por muy poco
 * código.
 */

import { z } from "zod";

export const ORIGENES = ["texto", "pregunta", "default", "perfil", "arquetipo"];
export const ESTADOS = ["vacio", "inferido", "delegado", "fijado"];
export const NOTEPAD_VERSION = 1;

const ProcedenciaSchema = z.object({
  // La frase literal del usuario, entera y sin tocar: es lo que se le enseña
  // de vuelta, y reescribirla sería justo lo que rompe la confianza.
  frase: z.string().max(500),
  fecha: z.string(),
});

const CampoSchema = z.object({
  valor: z.unknown(),
  origen: z.enum(["texto", "pregunta", "default", "perfil", "arquetipo"]),
  confirmado: z.boolean().default(false),
  delegado: z.boolean().default(false),
  bloqueado: z.boolean().default(false),
  procedencia: ProcedenciaSchema.optional(),
  // El valor original, para poder deshacer mañana y no solo en los dos
  // segundos que dura un toast.
  anterior: z.unknown().optional(),
});

export const NotepadSchema = z.object({
  v: z.literal(NOTEPAD_VERSION),
  campos: z.record(z.string(), CampoSchema),
});

export function libretaVacia() {
  return { v: NOTEPAD_VERSION, campos: {} };
}

const base = (n) => (n?.v === NOTEPAD_VERSION ? n : libretaVacia());

/** El valor de un eje, o `porDefecto` si la libreta no sabe nada de él. */
export function valorDe(notepad, path, porDefecto = undefined) {
  const campo = notepad?.campos?.[path];
  return campo && campo.valor !== undefined ? campo.valor : porDefecto;
}

/** El estado de un campo, que es la pregunta que se hace la UI. */
export function estadoDe(notepad, path) {
  const campo = notepad?.campos?.[path];
  if (!campo) return "vacio";
  if (campo.bloqueado) return "fijado";
  if (campo.delegado) return "delegado";
  if (campo.origen === "pregunta" || campo.confirmado) return "fijado";
  // Un default es algo que enseñar, pero como suposición: darlo por dicho sería
  // atribuirle al usuario una decisión que no tomó.
  return "inferido";
}

/** ¿Se puede volver a preguntar por esto? Un no-go dice que no, para siempre. */
export function sePuedePreguntar(notepad, path) {
  const campo = notepad?.campos?.[path];
  if (!campo) return true;
  return !campo.bloqueado && !campo.delegado && !campo.confirmado;
}

/**
 * Escribe un valor. Devuelve una libreta NUEVA — nunca muta la que recibe,
 * porque estas llegan del estado de React y mutarlas se traga los re-renders.
 */
export function poner(notepad, path, valor, { origen, frase, fecha, confirmado = false } = {}) {
  const b = base(notepad);
  const previo = b.campos[path];
  return {
    ...b,
    campos: {
      ...b.campos,
      [path]: {
        valor,
        origen: origen ?? "texto",
        confirmado,
        delegado: false,
        // Escribir no desbloquea: si no, cualquier frase del panel reabriría un
        // tema que el usuario cerró a propósito.
        bloqueado: previo?.bloqueado ?? false,
        ...(frase ? { procedencia: { frase, fecha } } : {}),
        // Solo se guarda el valor de la PRIMERA escritura de una tanda: si no,
        // dos cambios seguidos dejarían el deshacer a medio camino.
        ...(previo?.anterior !== undefined
          ? { anterior: previo.anterior }
          : previo?.valor !== undefined
            ? { anterior: previo.valor }
            : {}),
      },
    },
  };
}

/** "Lo que tú veas": resuelto, no vacío. Es lo único que acorta el wizard. */
export function delegar(notepad, path) {
  const b = base(notepad);
  const previo = b.campos[path];
  return {
    ...b,
    campos: {
      ...b.campos,
      [path]: { ...previo, valor: previo?.valor, origen: "pregunta", confirmado: false, delegado: true, bloqueado: false },
    },
  };
}

/** Un no-go: no se vuelve a preguntar. Distinto de saltárselo hoy. */
export function bloquear(notepad, path) {
  const b = base(notepad);
  const previo = b.campos[path];
  return {
    ...b,
    campos: {
      ...b.campos,
      [path]: { ...previo, origen: previo?.origen ?? "pregunta", bloqueado: true, delegado: false, confirmado: true },
    },
  };
}

/** Confirmar lo inferido: pasa de "creo que" a "me lo dijiste". */
export function confirmar(notepad, path) {
  const campo = notepad?.campos?.[path];
  if (!campo) return notepad;
  return { ...notepad, campos: { ...notepad.campos, [path]: { ...campo, confirmado: true } } };
}

/** El deshacer del panel: vuelve al valor original y quita la anotación. */
export function deshacer(notepad, path) {
  const campo = notepad?.campos?.[path];
  if (!campo) return notepad;
  const campos = { ...notepad.campos };
  if (campo.anterior === undefined) delete campos[path];
  else campos[path] = { ...campo, valor: campo.anterior, anterior: undefined, procedencia: undefined };
  return { ...notepad, campos };
}

/** Olvidar del todo, sin reponer nada. */
export function olvidar(notepad, path) {
  if (!notepad?.campos?.[path]) return notepad;
  const campos = { ...notepad.campos };
  delete campos[path];
  return { ...notepad, campos };
}

/** Por qué un campo está como está, o null. Es el recibo, y sale gratis. */
export function porQue(notepad, path) {
  const p = notepad?.campos?.[path]?.procedencia;
  return p ? `Porque dijiste «${p.frase}» el ${p.fecha}` : null;
}

/**
 * La vista que esperan los consumidores de siempre.
 *
 * `aiPlanner` lee `data.freqs` y `data.freqsByGroup` desde antes de que la
 * libreta existiera, y no hace falta migrarlos: se calculan de aquí. Así hay
 * un único sitio donde se escribe, y lo que leen los demás es una proyección,
 * nunca una copia que se pueda desincronizar.
 *
 * Lo `delegado` NO se proyecta: "lo que tú veas" es permiso para que decida el
 * planner, no un número que imponerle.
 */
export function proyectar(notepad) {
  const freqs = {};
  const freqsByGroup = {};
  const sesgos = {};
  const excluidos = [];
  const favoritos = [];

  for (const [path, campo] of Object.entries(notepad?.campos ?? {})) {
    if (campo.delegado || campo.valor === undefined) continue;
    const [campoId, valorId, ...resto] = path.split(".");
    const grupo = resto.find((p) => p.startsWith("@"))?.slice(1);

    if (campoId === "freqs") {
      if (grupo) {
        (freqsByGroup[grupo] ??= {})[valorId] = campo.valor;
      } else {
        freqs[valorId] = campo.valor;
      }
    } else if (campoId === "excluidos") {
      if (campo.valor) excluidos.push(valorId);
    } else if (campoId === "favoritos") {
      if (campo.valor) favoritos.push(valorId);
    } else {
      // base, cocina, tecnica, salsa, esfuerzo — ejes de sesgo, sin consumidor
      // todavía: los estrenará el panel.
      (sesgos[campoId] ??= {})[valorId] = campo.valor;
    }
  }

  return { freqs, freqsByGroup, sesgos, excluidos, favoritos };
}

/**
 * Migración de un solo sentido: mete en la libreta lo que el usuario ya
 * contestó en el wizard antes de que esto existiera.
 *
 * Entran como `pregunta` porque eso es literalmente lo que pasó — las
 * contestó en una pantalla. Marcarlas `default` las dejaría a merced de que el
 * panel las pisara sin avisar, y no serían suyas.
 *
 * El valor no cambia: `proyectar()` sobre el resultado devuelve exactamente
 * los mismos `freqs` que había. Para el usuario, cero diferencia.
 */
export function importarDeData(data, notepad = libretaVacia()) {
  let n = base(notepad);
  for (const [familia, valor] of Object.entries(data?.freqs ?? {})) {
    const path = `freqs.${familia}`;
    if (n.campos[path]) continue;   // la libreta manda: no se pisa lo ya escrito
    n = poner(n, path, valor, { origen: "pregunta", confirmado: true });
  }
  for (const [grupo, freqs] of Object.entries(data?.freqsByGroup ?? {})) {
    for (const [familia, valor] of Object.entries(freqs ?? {})) {
      const path = `freqs.${familia}.@${grupo}`;
      if (n.campos[path]) continue;
      n = poner(n, path, valor, { origen: "pregunta", confirmado: true });
    }
  }
  return n;
}

/** Migra o descarta una libreta de versión desconocida. */
export function normalizar(raw) {
  if (!raw || typeof raw !== "object") return libretaVacia();
  const parsed = NotepadSchema.safeParse(raw);
  // Una libreta corrupta se tira entera. Duele menos de lo que parece: se
  // reconstruye con `importarDeData` desde lo que el wizard ya guardó.
  return parsed.success ? parsed.data : libretaVacia();
}
