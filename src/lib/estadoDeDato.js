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
import { rutinaDeFichas } from "./rutina.js";

/** La versión de ficha_casa que trae «fichas», el estado de cada dato (0107); la 1 no lo trae. */
export const FICHA_CON_ESTADO = 2;
/** Las versiones de ficha_casa que se saben leer: la 1 (0097) y la de FICHA_CON_ESTADO. */
export const VERSIONES_FICHA = Object.freeze([1, FICHA_CON_ESTADO]);

/**
 * La clave de un dato leído: campo, persona y, si es el sobre de un hueco (un campo con ámbito, 0116), su ámbito.
 * La base de un campo con ámbito (ambito null) y los campos sin ámbito van por campo y persona, que es lo que
 * busca leidoDe; cada hueco, aparte, sin pisar a la base ni a otro hueco.
 */
const ambitoEnClave = (ambito) => (ambito ? JSON.stringify(Object.keys(ambito).sort().map((k) => [k, ambito[k]])) : "");
const clave = (campo, personaId, ambito = null) => `${campo}|${personaId ?? ""}|${ambitoEnClave(ambito)}`;

/**
 * Pura. Un dato de «fichas» leído y comprobado contra el vocabulario: lanza si
 * el estado no es de ESTADOS_DATO o no es el que su origen pide
 * (ESTADO_DE_ORIGEN), porque entonces la base y el código no dicen lo mismo.
 * `ambito`: el del hueco (0116), o null en la base y en los campos sin ámbito; uno que no es un objeto lanza.
 * @returns {{ ficha: string, campo: string, personaId: string|null, ambito: object|null, estado: string, conSobre: boolean, caducado: boolean, valor: unknown, origen: string|null, bloqueado: boolean }}
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
  const ambito = d.ambito ?? null;
  if (ambito !== null && (typeof ambito !== "object" || Array.isArray(ambito))) throw new Error(`${donde}: un ámbito que no es un objeto`);
  return {
    ficha,
    campo: d.campo,
    personaId: d.sujeto?.tipo === "persona" ? String(d.sujeto.id) : null,
    ambito,
    estado: d.estado,
    conSobre: origen !== null,
    caducado: origen === null && caduca !== null && caduca <= ahora.getTime(),
    valor: d.valor ?? null,
    origen,
    bloqueado: d.bloqueado === true,
  };
}

/**
 * Pura. Las «fichas» de ficha_casa v2 leídas, por (campo, persona, ámbito). Lanza si
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
      const k = clave(l.campo, l.personaId, l.ambito);
      // Dos elementos con la misma clave: la base y el código no dicen lo mismo (uno taparía al otro).
      if (estados.has(k)) throw new Error(`ficha «${ficha}»: «${l.campo}» sale dos veces para el mismo sujeto y hueco`);
      estados.set(k, l);
    }
  }
  return estados;
}

/**
 * Pura. El dato leído de un campo y una persona (null para los de la casa), o null si la ficha no lo trae. En un
 * campo con ámbito, su base (lo que vale donde nadie ha dicho nada); sus huecos los lee rutina.js.
 */
export const leidoDe = (estados, campo, personaId = null) => estados?.get(clave(campo, personaId == null ? null : String(personaId))) ?? null;

/**
 * Los datos de la casa (claves de `data` y campos de registro_campo, por = 'casa') que ya se guardan con sobre
 * (trozo 12 de #1037): la app (casaDatos.js) y Lola (api/_bot/casa.js) los leen de ficha_casa v2 y los escriben
 * con escribirDato, no en household_state. Aquí y no en casaDatos.js, que es del navegador, para que Lola lea la
 * misma lista. Sale del registro (los de la casa con `vive: "tabla:sobre"` y sin ámbito, deLaCasa en
 * registroFicha.js), en su orden: un dato pasa al sobre marcándolo allí, en un solo sitio.
 */
export const CAMPOS_CASA_CON_SOBRE = Object.freeze(Object.entries(DATOS_CASA)
  .filter(([, d]) => d.entidad === "casa" && d.vive === "tabla:sobre" && d.ambito.length === 0).map(([k]) => k));

/**
 * Los datos de `data` con ámbito que viven en sus sobres por hueco (trozo 13: quién come dónde, cómo es cada hueco,
 * los días de cada semana, la estructura de cada grupo): un mapa en `data` (rutina.js), un sobre por hueco en la base.
 */
export const CAMPOS_CON_AMBITO_CON_SOBRE = Object.freeze(Object.entries(DATOS_CASA)
  .filter(([, d]) => d.vive === "tabla:sobre" && d.ambito.length > 0).map(([k]) => k));

/**
 * Las fichas de ficha_casa v2 donde vienen los de CAMPOS_CASA_CON_SOBRE y CAMPOS_CON_AMBITO_CON_SOBRE (la v2
 * agrupa por ficha): la Casa (trozo 12) y la Rutina (trozo 13). Sale de la ficha de cada uno en el registro.
 */
export const FICHAS_CASA_CON_SOBRE = Object.freeze([...new Set([...CAMPOS_CASA_CON_SOBRE, ...CAMPOS_CON_AMBITO_CON_SOBRE]
  .map((c) => DATOS_CASA[c].ficha))]);

/**
 * Pura. Los de CAMPOS_CASA_CON_SOBRE que la ficha trae, leídos (su sobre o el defecto del registro). Los que no
 * trae (registro_campo aún sin ellos: la 0112 sin aplicar) no salen: siguen en el documento. Una lista sin valor
 * (kitchenTools: nadie dijo nada y el registro no tiene defecto) se lee vacía, como la deja la app al normalizar:
 * leída como null, la app la pasaría a [] y la guardaría como dicha sin que nadie la dijera.
 */
export const datosConSobre = (estados) => CAMPOS_CASA_CON_SOBRE.map((campo) => leidoDe(estados, campo)).filter(Boolean)
  .map((l) => (l.valor == null && DATOS_CASA[l.campo]?.tipo === "lista_enum" ? { ...l, valor: [] } : l));

/**
 * Pura. Lo que la app y Lola leen de los sobres de la casa, de los elementos de ficha_casa v2 (los de
 * FICHAS_CASA_CON_SOBRE): `{ [campo]: { valor, conSobre } }`. Los de CAMPOS_CASA_CON_SOBRE, por datosConSobre; los
 * de CAMPOS_CON_AMBITO_CON_SOBRE, su mapa de `data` con lo dicho en cada hueco (rutinaDeFichas, rutina.js), y
 * `conSobre` si algún hueco está dicho. Lo que la ficha no trae no sale: sigue en el documento (sin la 0112 o la
 * 0113; los de ámbito, sin la 0116). Lanza si no cuadra (estadosDeFichas, rutinaDeFichas).
 */
export function leidosConSobre(elementos) {
  const simples = datosConSobre(estadosDeFichas({ casa: elementos })).map((l) => [l.campo, { valor: l.valor, conSobre: l.conSobre }]);
  const mapas = Object.entries(rutinaDeFichas(elementos)).filter(([campo]) => CAMPOS_CON_AMBITO_CON_SOBRE.includes(campo))
    .map(([campo, mapa]) => [campo, { valor: mapa, conSobre: Object.keys(mapa).length > 0 }]);
  return Object.fromEntries([...simples, ...mapas]);
}

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
// documento, así que la ficha de Lola solo los sabe por aquí. Los de CAMPOS_CASA_CON_SOBRE no: Lola los lee
// en el documento de la casa, que casa.js rellena con su sobre, y la ficha los dice cada uno en su línea
// (Nivel, Aparatos, Súper, Presupuesto…); aquí saldrían otra vez como «Dicho: cookLevel: …». Los de
// CAMPOS_CON_AMBITO_CON_SOBRE tampoco: casa.js pone su mapa en el documento y la ficha dice el horario de ahí.
const SOLO_EN_SOBRE = new Set([...Object.values(DATOS_PERSONA), ...Object.values(DATOS_CASA)]
  .filter((d) => d.campo && d.vive === "tabla:sobre" && !CAMPOS_CASA_CON_SOBRE.includes(d.campo) && !CAMPOS_CON_AMBITO_CON_SOBRE.includes(d.campo))
  .map((d) => d.campo));

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

/**
 * Pura. ¿Es la ficha de ficha_casa que sabemos leer? null si sí; si no, el motivo (lo que falta o tiene otra
 * forma). La comprueban Lola (fichaRpc.js) y la lectura de la app (api/_bot/datos.js).
 */
export function fichaSinContrato(f) {
  if (!VERSIONES_FICHA.includes(f?.v)) return `v=${f?.v ?? "?"} (se espera v=${VERSIONES_FICHA.join(" o v=")})`;
  if (!Number.isFinite(Number(f.casa?.rev))) return "sin casa.rev";
  for (const k of ["personas", "faltan", "tareas", "callados"]) if (!Array.isArray(f[k])) return `sin «${k}»`;
  if (f.v === FICHA_CON_ESTADO) {
    try {
      estadosDeFichas(f.fichas);
    } catch (e) {
      // a propósito: el motivo vuelve a quien llama, que lo escribe en el log
      return `v=2 con «fichas» que no cuadran: ${e.message}`;
    }
  }
  return null;
}
