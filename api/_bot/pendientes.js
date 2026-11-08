/**
 * Tareas abiertas del chat: lo que Lola ha dejado a medias porque necesitaba un
 * dato («recomiéndame algo para Cova» → «¿alguna alergia?»). Viven dentro del
 * mensaje guardado de Lola (content.pendientes), así que no cuestan ninguna
 * consulta ni vuelta extra al modelo.
 *
 * El código crea una tarea cuando la respuesta acaba en pregunta. El modelo
 * cierra una escribiendo ⟪cerrar P1⟫ al final de su respuesta; el código
 * quita esa marca antes de enviarla. Una tarea que ya se mostró dos turnos sin
 * cerrarse se descarta: no se le da vueltas a algo que nadie retomó.
 */

const MAX_ABIERTAS = 5;
const TURNOS_VISIBLE = 2;
const MARCA = /⟪\s*cerrar\s+(P\d+)\s*⟫/gi;
const CUALQUIER_MARCA = /⟪[^⟫]*⟫/g;

/** Pura. Quita emojis, marcas y espacios del final para ver si la frase es una pregunta. */
export function esPregunta(texto) {
  const limpio = String(texto ?? "")
    .replace(CUALQUIER_MARCA, "")
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .trim();
  if (!limpio) return false;
  const ultimoParrafo = limpio.split(/\n\s*\n/).pop();
  return ultimoParrafo.includes("?");
}

/** La frase con la pregunta, como falta que se pide (para el aviso al modelo). */
function faltaDe(texto) {
  const limpio = String(texto ?? "").replace(CUALQUIER_MARCA, "").replace(/\[\[[^\]]*\]\]/g, "").trim();
  const frases = limpio.split(/(?<=[.!?¿¡])\s+/);
  const pregunta = [...frases].reverse().find((f) => f.includes("?")) ?? limpio;
  return pregunta.replace(/\p{Extended_Pictographic}|️|‍/gu, "").trim().slice(0, 160);
}

/** Pura. Lo que la respuesta cierra, sin las marcas. */
export function marcasDe(texto) {
  return [...String(texto ?? "").matchAll(MARCA)].map((m) => m[1].toUpperCase());
}

/**
 * Pura. Del turno de Lola: el texto que se envía (sin marcas), y la lista de
 * tareas que quedan para el siguiente turno.
 * @param {string} dicho  la respuesta tal como la escribió el modelo
 * @param {Array<{id:string, pedido:string, falta:string, vistas:number}>} previas
 * @param {string} pedido  lo que pidió la persona en este turno
 */
export function tramitar(dicho, previas = [], pedido = "", { claveDe = () => null } = {}) {
  const cerradas = new Set(marcasDe(dicho));
  const visible = String(dicho ?? "").replace(CUALQUIER_MARCA, "").replace(/[ \t]+\n/g, "\n").trim();
  const siguen = previas
    .filter((p) => !cerradas.has(p.id))
    .map((p) => ({ ...p, vistas: (p.vistas ?? 0) + 1 }))
    .filter((p) => p.vistas < TURNOS_VISIBLE);
  // Si Lola vuelve a preguntar mientras una tarea sigue abierta, la pregunta es
  // de ESA tarea (otro dato para lo mismo), no una tarea nueva con el «nada» como pedido.
  const pregunta = esPregunta(dicho);
  const ultima = siguen.at(-1);
  if (pregunta && ultima) {
    // La clave sigue a la pregunta de AHORA: si antes faltaban las alergias y
    // ahora falta cómo come, la tarea queda ligada a la etapa, no a lo ya resuelto.
    ultima.falta = faltaDe(dicho);
    ultima.clave = claveDe(ultima.falta);
    ultima.vistas = 0;
    return { visible, pendientes: siguen.slice(-MAX_ABIERTAS) };
  }
  const falta = faltaDe(dicho);
  const nueva = pregunta && pedido.trim()
    ? [{ id: siguiente(previas), pedido: pedido.trim().slice(0, 300), falta, vistas: 0, clave: claveDe(falta) }]
    : [];
  return { visible, pendientes: [...siguen, ...nueva].slice(-MAX_ABIERTAS) };
}

/**
 * Pura. Quita las tareas cuya pregunta de estado ya no está pendiente (la
 * alergia ya se guardó): no hace falta que el modelo las cierre. Las que no
 * dependen del estado se quedan y las cierra el modelo con ⟪cerrar⟫.
 */
export function vigentesSegun(abiertas = [], estaResuelta = () => false) {
  return abiertas.filter((p) => !p.clave || !estaResuelta(p.clave));
}

function siguiente(previas) {
  const n = Math.max(0, ...previas.map((p) => Number(String(p.id).slice(1)) || 0));
  return `P${n + 1}`;
}

/**
 * Pura. El aviso que va delante de lo que dice la persona, solo para el modelo.
 * Vacío si no hay nada abierto.
 */
export function bloqueDe(pendientes = []) {
  if (!pendientes.length) return "";
  const lineas = pendientes.map((p) => `${p.id}: «${p.pedido}» (falta: ${p.falta})`);
  return [
    "[Tareas abiertas de antes. No las ha escrito la persona.]",
    ...lineas,
    "Es lo que te pidieron y aún no has dado. Si lo que dice ahora da lo que faltaba, cúmplela en ESTE turno: guardar el dato no basta, llama a la herramienta que resuelve el pedido (proponer_platos, etc.) y contesta con lo que salga. Luego escribe ⟪cerrar P1⟫ al final. Si cambia de tema, no la cierres: se queda abierta sola.",
  ].join("\n");
}
