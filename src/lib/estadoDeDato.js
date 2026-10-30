/**
 * El estado de cada dato de la ficha, leído de ficha_casa v2 (0107; plan
 * fichas con estado, trozo 9): un solo sitio para Lola (api/_bot/fichaRpc.js
 * y ficha.js) y el asistente de la app (wizardRegistry.js).
 *
 * La v2 devuelve, por ficha, cada campo de cada sujeto con su estado
 * (ESTADOS_DATO: vacío, por defecto, supuesto, aprendido, dicho) y su sobre si
 * lo tiene vigente. «Caducado» no es un estado más: es un dato vacío (o por
 * defecto) cuyo sobre ya pasó su `caduca_at`; aquí sale como `caducado`.
 *
 * Mientras un dato siga viviendo en el documento de la casa (hasta que su
 * ficha pase a filas: trozos 10, 12 y 13), el sobre AFINA y no borra: un
 * sujeto sin sobre vigente vale lo que diga el documento. Si no, todas las
 * casas saldrían sin alergias dichas (nadie escribe sobres de salud hasta
 * escribir_persona, trozo 10) y Lola y la app repreguntarían lo ya dicho.
 */
import { ESTADOS_DATO, ESTADO_DE_ORIGEN } from "./vocabularios.js";
import { ESTADOS as ESTADOS_LIBRETA } from "./notepad.js";
import { DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";

const clave = (campo, personaId) => `${campo}|${personaId ?? ""}`;

/**
 * Pura. Un dato de «fichas» leído y comprobado contra el vocabulario: lanza si
 * el estado no es de ESTADOS_DATO o no es el que su origen pide
 * (ESTADO_DE_ORIGEN), porque entonces la base y el código no dicen lo mismo.
 * @returns {{ ficha: string, campo: string, personaId: string|null, estado: string, conSobre: boolean, caducado: boolean, valor: unknown, origen: string|null, bloqueado: boolean }}
 */
function leerDato(d, ficha, ahora = new Date()) {
  if (!d?.campo) throw new Error(`ficha «${ficha}»: un dato sin campo`);
  const donde = `${ficha}.${d.campo}${d.sujeto?.id ? `:${String(d.sujeto.id).slice(0, 8)}` : ""}`;
  if (!ESTADOS_DATO.includes(d.estado)) throw new Error(`${donde}: estado «${d.estado}», que no es de ESTADOS_DATO`);
  const origen = d.origen ?? null;
  if (origen !== null && ESTADO_DE_ORIGEN[origen] !== d.estado) {
    throw new Error(`${donde}: origen «${origen}» con estado «${d.estado}» (ESTADO_DE_ORIGEN dice «${ESTADO_DE_ORIGEN[origen]}»)`);
  }
  // Sin caduca_at, no caduca; con uno que no es una fecha, la base y el código no cuadran: se dice.
  const caduca = d.caduca_at == null ? null : Date.parse(d.caduca_at);
  if (Number.isNaN(caduca)) throw new Error(`${donde}: caduca_at «${d.caduca_at}» no es una fecha`);
  return {
    ficha,
    campo: d.campo,
    personaId: d.sujeto?.tipo === "persona" ? String(d.sujeto.id) : null,
    estado: d.estado,
    conSobre: origen !== null,
    caducado: origen === null && caduca !== null && caduca <= ahora.getTime(),
    valor: d.valor ?? null,
    origen,
    bloqueado: d.bloqueado === true,
  };
}

/**
 * Pura. Las «fichas» de ficha_casa v2 leídas, por (campo, persona). Lanza si
 * el contrato no cuadra (quien llama decide: fichaRpc.js lo apunta y lee como
 * con la v1).
 * @returns {Map<string, ReturnType<typeof leerDato>>}
 */
export function estadosDeFichas(fichas, ahora = new Date()) {
  if (!fichas || typeof fichas !== "object" || Array.isArray(fichas)) throw new Error("«fichas» no es un objeto por ficha");
  const estados = new Map();
  for (const [ficha, datos] of Object.entries(fichas)) {
    if (!Array.isArray(datos)) throw new Error(`ficha «${ficha}»: no es una lista de datos`);
    for (const d of datos) {
      const l = leerDato(d, ficha, ahora);
      estados.set(clave(l.campo, l.personaId), l);
    }
  }
  return estados;
}

/** Pura. El dato leído de un campo y una persona (null para los de la casa), o null si la ficha no lo trae. */
export const leidoDe = (estados, campo, personaId = null) => estados?.get(clave(campo, personaId == null ? null : String(personaId))) ?? null;

// El estado de la ficha visto con los cuatro de la libreta (notepad.js), que son los que pinta el asistente.
const DE_LA_LIBRETA = Object.freeze({ vacio: "vacio", por_defecto: "inferido", supuesto: "inferido", aprendido: "inferido", dicho: "fijado" });

/** Pura. El estado de la libreta (vacio, inferido, delegado, fijado) de un dato leído con sobre. */
function estadoDeLibreta(leido) {
  if (leido.bloqueado) return "fijado";
  if (leido.origen === "delegado") return "delegado";
  return DE_LA_LIBRETA[leido.estado];
}

/**
 * Pura. El estado de la libreta de un dato que puede tener un sobre por sujeto
 * (las alergias, uno por persona), sabiendo `base`, el que da el documento de
 * la casa. Cada sujeto con sobre vigente aporta el suyo; sin él, aporta
 * `base`: el sobre afina y no borra. Con el sobre caducado, lo que diga el
 * documento queda como mucho en «inferido»: hay que confirmar si sigue. Manda
 * el más débil (vacio < inferido < delegado < fijado): una alergia supuesta en
 * una persona no deja la pregunta por contestada aunque las demás estén dichas.
 * @param {(ReturnType<typeof leerDato>|null)[]} leidos uno por sujeto
 * @param {string} base uno de ESTADOS de notepad.js
 */
export function estadoParaLibreta(leidos, base) {
  if (!ESTADOS_LIBRETA.includes(base)) throw new Error(`estadoParaLibreta: «${base}» no es un estado de la libreta`);
  const masDebil = (a, b) => (ESTADOS_LIBRETA.indexOf(b) < ESTADOS_LIBRETA.indexOf(a) ? b : a);
  const de = (l) => (l?.conSobre ? estadoDeLibreta(l) : l?.caducado ? masDebil(base, "inferido") : base);
  return (leidos.length ? leidos : [null]).map(de).reduce(masDebil);
}

// Los campos que solo viven en el sobre (registroFicha.js, `vive: "tabla:sobre"`): no están en el
// documento, así que la ficha de Lola solo los sabe por aquí.
const SOLO_EN_SOBRE = new Set([...Object.values(DATOS_PERSONA), ...Object.values(DATOS_CASA)]
  .filter((d) => d.campo && d.vive === "tabla:sobre").map((d) => d.campo));

// Cómo marca la ficha de Lola cada estado con sobre (la leyenda de conocimiento.md: «Dicho:» y «Supuesto:»).
const MARCA_DE_LOLA = Object.freeze({ dicho: "dicho", aprendido: "supuesto", supuesto: "supuesto" });

/**
 * Pura. Lo que la ficha de Lola dice de los campos que solo viven en el sobre:
 * los que tienen sobre vigente con estado dicho, aprendido o supuesto, con su
 * marca («dicho» o «supuesto»). Lo vacío, lo por defecto y lo caducado no se
 * dicen: no hay nada que la familia haya contado.
 * @returns {{ marca: "dicho"|"supuesto", campo: string, personaId: string|null, valor: unknown }[]}
 */
export function marcasDeLola(estados) {
  return [...(estados?.values() ?? [])]
    .filter((l) => l.conSobre && SOLO_EN_SOBRE.has(l.campo) && MARCA_DE_LOLA[l.estado] && l.valor != null)
    .map((l) => ({ marca: MARCA_DE_LOLA[l.estado], campo: l.campo, personaId: l.personaId, valor: l.valor }));
}
