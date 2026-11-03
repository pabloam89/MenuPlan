/**
 * La ficha Trato (plan fichas con estado, trozo 16; #1037): cómo quiere la persona de cada cuenta que le hable Lola.
 * Es de la cuenta y no de la persona (los niños no tienen cuenta; la pareja puede querer otro ritmo), y se guarda en
 * el sobre de la persona de esa cuenta (accountMemberIdByUser, miembroDeCuentaId).
 *
 * Los cuatro datos, con su vocabulario y su defecto, salen del registro (registroFicha.js, `ficha: "trato"`):
 *  - tratoRitmo (ritmos_trato): directo (decide y avisa) o guiado (paso a paso); defecto guiado.
 *  - tratoProfundidad (profundidades_trato): cuánto se afina antes de generar; defecto preguntar (trozo 17).
 *  - tratoFotos (bool): si quiere fotos de los platos; defecto sí. Mandarlas en el menú es otro trozo (#1030).
 *  - tratoLargo (largos_trato): corto o largo; defecto corto.
 *
 * Lo lee Lola en cada turno de ficha_casa v2 (0116), que ya trae (fichaRpc.js): la ficha «trato» con un elemento por
 * persona y campo, con su sobre o su defecto. Plan B: sin la 0119 (o sin la ficha, o sin persona de la cuenta), los
 * defectos del registro; nunca falla el turno por esto. Lo escribe ajustar_trato (agente.js) con escribirDato:
 * sin la 0119, la base lo rechaza (FK de sobre.campo) y el recibo lo dice como «sin hacer».
 *
 * Lo aprendido (señales: «hazlo ya» repetido, mensajes que se cortan) aún no lo escribe nadie: llega con las
 * señales de la cuenta (registro «senal»), en otro trozo.
 */
import { DATOS_PERSONA } from "../../src/lib/registroFicha.js";
import { resultado } from "./resultado.js";
import { FICHA, CANAL_DATO, REF_OPERACION, RITMO_TRATO, PROFUNDIDAD_TRATO, LARGO_TRATO, ORIGEN, ESTADO_DATO } from "../../src/lib/vocabularios.js";
import { esquemaDato } from "../../src/lib/esquemaHerramienta.js";
import { miembroDeCuentaId } from "../../src/lib/stages.js";
import { PAPEL } from "../../src/lib/papeles.js";

/** Los campos de la ficha Trato, en el orden del registro. */
export const CAMPOS_TRATO = Object.freeze(Object.entries(DATOS_PERSONA)
  .filter(([, d]) => d.ficha === FICHA.TRATO && d.campo).map(([k]) => k));

/** El nombre corto de cada campo en el trato leído (y en la herramienta). */
export const CORTO = Object.freeze({ tratoRitmo: "ritmo", tratoProfundidad: "profundidad", tratoFotos: "fotos", tratoLargo: "largo" });

/** Las claves del trato en la ficha de ajustar_trato (lo que escribe) y su esquema (un parámetro por nombre corto). */
export const ESCRIBE_TRATO = Object.freeze(CAMPOS_TRATO.map((c) => `members.${c}`));
export const ESQUEMA_TRATO = Object.freeze(Object.fromEntries(CAMPOS_TRATO.map((c) => [CORTO[c], esquemaDato(`members.${c}`)])));

/**
 * La persona de la cuenta que escribe, o null. El `accountMemberId` compartido solo vale de respaldo para el titular
 * (owner): una cuenta cotitular sin su entrada no es el titular, y su trato no se guarda ni se lee en el de él.
 */
export const personaDeLaCuenta = (data, userId, papel) => miembroDeCuentaId(data, userId, { esTitular: papel === PAPEL.OWNER });

/** El trato de quien no ha dicho nada: los defectos del registro. */
export const TRATO_POR_DEFECTO = Object.freeze(Object.fromEntries(CAMPOS_TRATO.map((c) => [CORTO[c], DATOS_PERSONA[c].defecto])));

/**
 * Pura. El trato de una persona en la ficha de ficha_casa (la que lee fichaRpc.js), con lo que dijo y el defecto en
 * lo demás. `dicho`: los campos (cortos) con sobre vigente. Sin ficha, sin la ficha «trato» o sin persona, todo por
 * defecto (plan B, sin la 0119).
 * @returns {{ ritmo: string, profundidad: string, fotos: boolean, largo: string, dicho: string[] }}
 */
export function tratoDeFicha(ficha, personaId) {
  const trato = { ...TRATO_POR_DEFECTO, dicho: [] };
  const lista = ficha?.fichas?.[FICHA.TRATO];
  if (personaId == null || !Array.isArray(lista)) return trato;
  for (const d of lista) {
    if (!CAMPOS_TRATO.includes(d?.campo) || String(d?.sujeto?.id ?? "") !== String(personaId)) continue;
    const corto = CORTO[d.campo];
    const vigente = d.estado !== ESTADO_DATO.VACIO && d.estado !== ESTADO_DATO.POR_DEFECTO && d.valor != null;
    if (!vigente) continue;
    trato[corto] = d.valor;
    trato.dicho.push(corto);
  }
  return trato;
}

const RITMO = {
  [RITMO_TRATO.DIRECTO]: "directo: decide tú lo que no sea de seguridad y avisa en una línea; pregunta solo lo que no se puede deducir",
  [RITMO_TRATO.GUIADO]: "guiado: ve paso a paso y, antes de decidir algo que no es obvio, pregúntale",
};
const PROFUNDIDAD = {
  [PROFUNDIDAD_TRATO.NADA]: "al pedir un menú, hazlo ya, sin preguntas antes",
  [PROFUNDIDAD_TRATO.POCO]: "al pedir un menú, como mucho una o dos preguntas antes",
  [PROFUNDIDAD_TRATO.MUCHO]: "al pedir un menú, afinad antes con unas preguntas (de una en una)",
  [PROFUNDIDAD_TRATO.PREGUNTAR]: "al pedir un menú, si no está claro, pregúntale si lo preparas ya o lo afináis juntos",
};
const LARGO = {
  [LARGO_TRATO.CORTO]: "mensajes cortos, lo justo",
  [LARGO_TRATO.LARGO]: "puedes explicar más, con el porqué",
};

/**
 * Pura. La línea del trato para la ficha del turno (delDia): cómo hablarle a quien escribe. Dice si cada cosa la dijo
 * él o es lo de por defecto, para que Lola no lo trate como una orden suya.
 */
export function lineaDelTrato(trato) {
  const t = trato ?? { ...TRATO_POR_DEFECTO, dicho: [] };
  const de = (c) => (t.dicho?.includes(c) ? " (lo dijo)" : "");
  const partes = [
    `ritmo ${RITMO[t.ritmo] ?? RITMO[TRATO_POR_DEFECTO.ritmo]}${de("ritmo")}`,
    `${PROFUNDIDAD[t.profundidad] ?? PROFUNDIDAD[TRATO_POR_DEFECTO.profundidad]}${de("profundidad")}`,
    `${LARGO[t.largo] ?? LARGO[TRATO_POR_DEFECTO.largo]}${de("largo")}`,
    t.fotos === false ? `no quiere fotos de los platos${de("fotos")}` : null,
  ].filter(Boolean);
  return `TRATO CON QUIEN ESCRIBE (se cambia con ajustar_trato si lo pide): ${partes.join("; ")}. La seguridad (alergias, salud) se pregunta siempre, sea cual sea el trato.`;
}

/**
 * Pura. Los datos de la operación de ajustar_trato: uno por campo pedido, de la persona de la cuenta, dichos.
 * `pedido` con los nombres cortos (ritmo, profundidad, fotos, largo); lo que no viene, no se toca.
 */
export function datosDelTrato(pedido, personaId) {
  return CAMPOS_TRATO
    .filter((c) => pedido?.[CORTO[c]] !== undefined && pedido[CORTO[c]] !== null)
    .map((c) => ({ campo: c, persona_id: String(personaId), valor: pedido[CORTO[c]], origen: ORIGEN.DICHO }));
}

/** Cómo se nombra cada campo en el recibo («✅ Trato con Lola: ritmo directo»). */
const ETIQUETA = Object.freeze({ ritmo: "ritmo", profundidad: "cuánto afinar", fotos: "fotos", largo: "largo de los mensajes" });
const valorEnTexto = (corto, v) => (corto === "fotos" ? (v ? "sí" : "no") : String(v));

/**
 * Escribe el trato de quien escribe (ajustar_trato) y devuelve su RESULTADO (resultado.js, trozo 27): lo guardado,
 * campo a campo, y lo que no, con su porqué. `escribir` es escribirDato de datos.js (inyectado: los tests no van a la
 * base); nunca lanza por la base (operar no lanza).
 */
export async function guardarTrato(pedido, { householdId, personaId, autor, op, escribir, clave }) {
  const pedidos = CAMPOS_TRATO.filter((c) => pedido?.[CORTO[c]] != null).map((c) => CORTO[c]);
  const queDe = (corto) => `${ETIQUETA[corto]} ${valorEnTexto(corto, pedido[corto])}`;
  if (personaId == null) {
    return resultado({ accion: "trato", sinHacer: pedidos.map((c) => ({ que: queDe(c), motivo: "no sé quién de la casa eres" })),
      nota: "Pregúntale quién es de la casa (o que lo marque en la app, en Mi perfil) y vuelve a guardarlo." });
  }
  const datos = datosDelTrato(pedido, personaId);
  if (!datos.length) return resultado({ accion: "trato", nota: "No ha dicho qué cambiar del trato (ritmo, cuánto afinar, fotos o largo)." });
  const r = await escribir({
    casa: householdId,
    clave,
    accion: op?.herramienta ?? "ajustar_trato",
    canal: autor?.canal ?? CANAL_DATO.TELEGRAM,
    // Sin mensaje, sin ref: escribirDato lo rechaza (DatoInvalido) y sale «sin hacer», como en casa.js.
    ref: { tipo: REF_OPERACION.MENSAJE, id: op?.mid ?? null },
    autor: { user_id: autor?.user_id ?? null, persona_id: String(personaId) },
    datos,
  }, { papel: autor?.papel ?? null });
  const hechos = new Set((r?.hecho ?? []).map((d) => CORTO[d?.campo]).filter(Boolean));
  const motivoDe = new Map((r?.sin_hacer ?? []).map((d) => [CORTO[d?.campo], d?.motivo]));
  const porque = r?.guardado || hechos.size ? null : (r?.fallo ?? r?.estado ?? "no se pudo guardar");
  return resultado({
    accion: "trato",
    hecho: pedidos.filter((c) => hechos.has(c)).map(queDe),
    sinHacer: pedidos.filter((c) => !hechos.has(c)).map((c) => ({ que: queDe(c), motivo: motivoDe.get(c) ?? porque ?? "sin motivo" })),
  });
}
