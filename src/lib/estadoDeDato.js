/**
 * El estado de cada dato de la ficha, leído de ficha_casa v2 (0107; plan
 * fichas con estado, trozo 9): un solo sitio para Lola (api/_bot/fichaRpc.js
 * y ficha.js) y, después, el asistente de la app (wizardRegistry.js).
 *
 * La v2 devuelve, por ficha, cada campo de cada sujeto con su estado
 * (ESTADOS_DATO: vacío, por defecto, supuesto, aprendido, dicho) y su sobre si
 * lo tiene vigente.
 *
 * Mientras un dato siga viviendo en el documento de la casa (hasta que su
 * ficha pase a filas: trozos 10, 12 y 13), el sobre AFINA y no borra: un
 * sujeto sin sobre vigente vale lo que diga el documento. Si no, todas las
 * casas saldrían sin alergias dichas (nadie escribe sobres de salud hasta
 * escribir_persona, trozo 10) y Lola y la app repreguntarían lo ya dicho.
 */
import { ESTADOS_DATO, ESTADO_DE_ORIGEN } from "./vocabularios.js";
import { DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";

const clave = (campo, personaId) => `${campo}|${personaId ?? ""}`;

/**
 * Pura. Un dato de «fichas» leído y comprobado contra el vocabulario: lanza si
 * el estado no es de ESTADOS_DATO o no es el que su origen pide
 * (ESTADO_DE_ORIGEN), porque entonces la base y el código no dicen lo mismo.
 * @returns {{ ficha: string, campo: string, personaId: string|null, estado: string, conSobre: boolean, valor: unknown, origen: string|null, bloqueado: boolean }}
 */
function leerDato(d, ficha) {
  if (!d?.campo) throw new Error(`ficha «${ficha}»: un dato sin campo`);
  const donde = `${ficha}.${d.campo}${d.sujeto?.id ? `:${String(d.sujeto.id).slice(0, 8)}` : ""}`;
  if (!ESTADOS_DATO.includes(d.estado)) throw new Error(`${donde}: estado «${d.estado}», que no es de ESTADOS_DATO`);
  const origen = d.origen ?? null;
  if (origen !== null && ESTADO_DE_ORIGEN[origen] !== d.estado) {
    throw new Error(`${donde}: origen «${origen}» con estado «${d.estado}» (ESTADO_DE_ORIGEN dice «${ESTADO_DE_ORIGEN[origen]}»)`);
  }
  return {
    ficha,
    campo: d.campo,
    personaId: d.sujeto?.tipo === "persona" ? String(d.sujeto.id) : null,
    estado: d.estado,
    conSobre: origen !== null,
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
export function estadosDeFichas(fichas) {
  if (!fichas || typeof fichas !== "object" || Array.isArray(fichas)) throw new Error("«fichas» no es un objeto por ficha");
  const estados = new Map();
  for (const [ficha, datos] of Object.entries(fichas)) {
    if (!Array.isArray(datos)) throw new Error(`ficha «${ficha}»: no es una lista de datos`);
    for (const d of datos) {
      const l = leerDato(d, ficha);
      estados.set(clave(l.campo, l.personaId), l);
    }
  }
  return estados;
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
