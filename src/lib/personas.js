/**
 * Persona y salud desde sus filas (plan fichas con estado, trozo 10; #1037).
 *
 * Desde la 0108 la familia vive en `persona`, `persona_*`, `grupo` y
 * `grupo_persona`, y nadie la copia ya desde household_state. La app y Lola
 * la leen con la RPC personas_de_casa y la escriben con escribir_persona, por
 * la tubería del servidor (src/lib/operaciones/tuberia.js, operarPersonas).
 * Aquí, puro y común a los dos lados:
 *
 *   membersDeFilas   lo que devuelve personas_de_casa → { members, groups },
 *                    la forma de siempre de data.members / data.groups, para
 *                    no reescribir de golpe a sus lectores (plan, trozo 10).
 *   cambiosDePersonas  la familia de antes (la leída) y la de ahora → lo que
 *                    hay que mandar a escribir_persona: solo lo que cambió de
 *                    cada persona, quién se fue, y los grupos si cambiaron.
 *
 * Lo que un comensal lleva y no tiene columna (dislikes, alergiasOrigen…) va y
 * vuelve en `resto`, entero. Los invitados de las reglas no son personas.
 * Sustituye a personasTabla.js (el gemelo del trigger de la 0089), que retira
 * el trozo 11.
 */

/** Cada clave de un comensal con columna propia en `persona`, y su columna. */
export const COLUMNA_DE_MIEMBRO = Object.freeze({
  name: "nombre", age: "edad", homeRole: "rol_hogar", alergiasRevisadas: "alergias_revisadas",
  pesoKg: "peso_kg", alturaCm: "altura_cm", useBirthDate: "usa_fecha_nacimiento", birthDate: "fecha_nacimiento",
  stageDetail: "detalle_etapa", notBaby: "no_es_bebe", profileKey: "clave_perfil", avatarKey: "clave_avatar", color: "color",
});

/** Las claves de un comensal que van a las tablas de salud (o se calculan de ellas), no a `resto`. */
const DE_SALUD = ["allergies", "intolerances", "dietaryStates", "dietaryStatesMeta", "healthProfiles", "healthProfile"];
/** Las claves de un comensal con columna o tabla propia; lo demás va a `resto`. Las lee también personasTabla.js. */
export const CAMPOS_CON_COLUMNA = new Set(["id", ...Object.keys(COLUMNA_DE_MIEMBRO), ...DE_SALUD]);

/** Los mismos topes que los CHECK de persona (0079): fuera de ellos, null (y un aviso). */
export const RANGOS = Object.freeze({ edad: [0, 120], peso_kg: [2, 300], altura_cm: [40, 230] });

const lista = (v) => (Array.isArray(v) ? v : []);
const texto = (v) => String(v ?? "").trim();
export const enRango = (v, [min, max]) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// «2020-02-30» tiene la forma pero no existe: la base no lo convertiría a date y abortaría la operación.
export const fechaValida = (v) => {
  if (typeof v !== "string" || !FECHA.test(v)) return null;
  const [a, m, d] = v.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? v : null;
};
const unicos = (xs) => [...new Set(xs.map(texto).filter(Boolean))].sort();
// Un invitado de una regla vive solo en el delta de una generación (reglas.js): no es una persona de la casa.
export const esInvitado = (m) => m?.invitado === true || String(m?.id ?? "").startsWith("inv_");

/** Por qué un comensal o un dato suyo no viaja tal cual a escribir_persona: lo dice quien llama (no se calla). */
export const AVISOS_PERSONA = Object.freeze({
  SIN_ID: "sin_id", ID_REPETIDO: "id_repetido", FUERA_DE_RANGO: "fuera_de_rango", FECHA_NO_VALE: "fecha_no_vale", SIN_NOMBRE: "sin_nombre",
  GRUPO_SIN_ID: "grupo_sin_id", GRUPO_REPETIDO: "grupo_repetido", GRUPO_SIN_NOMBRE: "grupo_sin_nombre", NO_ES_PERSONA: "no_es_persona",
});

/**
 * Cada aviso en palabras, para decirlo a la familia (Lola en el chat, la app en pantalla): lo que no se guardó
 * tal cual. Una entrada por cada AVISOS_PERSONA (personas.test.js).
 */
export const TEXTO_AVISO_PERSONA = Object.freeze({
  [AVISOS_PERSONA.SIN_ID]: "un comensal sin identificador no se ha guardado",
  [AVISOS_PERSONA.ID_REPETIDO]: "un comensal estaba repetido y solo se ha guardado una vez",
  [AVISOS_PERSONA.FUERA_DE_RANGO]: "un número (edad, peso o altura) estaba fuera de lo posible y se ha quedado vacío",
  [AVISOS_PERSONA.FECHA_NO_VALE]: "una fecha de nacimiento no existe y se ha quedado vacía",
  [AVISOS_PERSONA.SIN_NOMBRE]: "una persona nueva sin nombre aún no se ha guardado: falta su nombre",
  [AVISOS_PERSONA.GRUPO_SIN_ID]: "un grupo sin identificador no se ha guardado",
  [AVISOS_PERSONA.GRUPO_REPETIDO]: "un grupo estaba repetido y solo se ha guardado una vez",
  [AVISOS_PERSONA.GRUPO_SIN_NOMBRE]: "un grupo sin nombre se ha guardado como «(sin nombre)»",
  [AVISOS_PERSONA.NO_ES_PERSONA]: "alguien de un grupo no es de la familia y ha salido del grupo",
});

/** Los avisos de cambiosDePersonas en frases, sin repetir; [] si no hay. */
export const textosDeAvisos = (avisos) => [...new Set((avisos ?? []).map((a) => TEXTO_AVISO_PERSONA[a.aviso] ?? a.aviso))];

/**
 * La familia no se pudo leer de personas_de_casa: no es una familia vacía, es no saberla. `fallo`, de FALLOS_DATO
 * cuando se sabe (sin la 0108, rpc_ausente); null si la RPC contestó sin la forma esperada.
 */
export class FamiliaSinLeer extends Error {
  constructor(fallo = null) {
    super(`no he podido leer la familia de la casa (personas_de_casa${fallo ? `: ${fallo}` : " sin {personas, grupos}"})`);
    this.name = "FamiliaSinLeer";
    this.fallo = fallo;
  }
}

/**
 * Una familia (la leída o la de ahora) sin su lista de personas o de grupos, como un documento a medio cargar:
 * no es una familia sin nadie, y tomarla así mandaría borrar a todos.
 */
export class FamiliaIncompleta extends Error {
  constructor(cual) {
    super(`la familia ${cual} no trae members y groups como listas`);
    this.name = "FamiliaIncompleta";
  }
}

/**
 * Pura. Lo que devuelve personas_de_casa (0108) en la forma de data.members y data.groups. Sin esa forma (una
 * lectura fallida o vacía) lanza FamiliaSinLeer: no saber la familia no es una casa sin nadie.
 * @param {{ personas: object[], grupos: object[] }} filas
 * @returns {{ members: object[], groups: object[] }}
 */
export function membersDeFilas(filas) {
  if (!Array.isArray(filas?.personas) || !Array.isArray(filas?.grupos)) throw new FamiliaSinLeer();
  const members = filas.personas.map((p) => {
    const estados = lista(p.estados);
    const meta = Object.fromEntries(estados.filter((e) => e.hasta).map((e) => [e.estado, { hasta: e.hasta }]));
    return {
      ...(p.resto && typeof p.resto === "object" ? p.resto : {}),
      id: p.id,
      name: p.nombre ?? "",
      age: p.edad ?? null,
      homeRole: p.rol_hogar ?? null,
      alergiasRevisadas: p.alergias_revisadas === true,
      ...(p.peso_kg != null ? { pesoKg: Number(p.peso_kg) } : {}),
      ...(p.altura_cm != null ? { alturaCm: Number(p.altura_cm) } : {}),
      useBirthDate: p.usa_fecha_nacimiento === true,
      birthDate: p.fecha_nacimiento ?? "",
      stageDetail: p.detalle_etapa ?? "",
      ...(p.no_es_bebe ? { notBaby: true } : {}),
      ...(p.clave_perfil ? { profileKey: p.clave_perfil } : {}),
      ...(p.clave_avatar ? { avatarKey: p.clave_avatar } : {}),
      ...(p.color ? { color: p.color } : {}),
      allergies: lista(p.alergias),
      intolerances: lista(p.intolerancias),
      dietaryStates: estados.map((e) => e.estado),
      ...(Object.keys(meta).length ? { dietaryStatesMeta: meta } : {}),
      healthProfiles: lista(p.perfiles_salud),
    };
  });
  const groups = filas.grupos.map((g) => ({
    id: g.id,
    label: g.nombre ?? "",
    ...(g.tipo ? { tipo: g.tipo } : {}),
    ...(g.color ? { color: g.color } : {}),
    memberIds: lista(g.personas),
  }));
  return { members, groups };
}

/** El número de una columna con tope (RANGOS) como lo guarda la base: la edad, entera; fuera del tope, null. */
const numeroDeColumna = (col, v) => enRango(col === "edad" && typeof v === "number" ? Math.trunc(v) : v, RANGOS[col]);

/**
 * Pura. Un comensal en la forma de una persona de escribir_persona, entera y limpia (como la copiaba la 0089:
 * fuera de rango o mal formado, null). Sin `id` ni `orden`.
 */
export function filaDeMiembro(m) {
  const meta = m.dietaryStatesMeta && typeof m.dietaryStatesMeta === "object" ? m.dietaryStatesMeta : {};
  return {
    nombre: texto(m.name),
    edad: numeroDeColumna("edad", m.age),
    rol_hogar: texto(m.homeRole) || null,
    alergias_revisadas: m.alergiasRevisadas === true,
    peso_kg: numeroDeColumna("peso_kg", m.pesoKg),
    altura_cm: numeroDeColumna("altura_cm", m.alturaCm),
    usa_fecha_nacimiento: m.useBirthDate === true,
    fecha_nacimiento: fechaValida(m.birthDate),
    detalle_etapa: texto(m.stageDetail) || null,
    no_es_bebe: m.notBaby === true,
    clave_perfil: texto(m.profileKey) || null,
    clave_avatar: texto(m.avatarKey) || null,
    color: texto(m.color) || null,
    resto: Object.fromEntries(Object.entries(m).filter(([k]) => !CAMPOS_CON_COLUMNA.has(k))),
    alergias: unicos(lista(m.allergies)),
    intolerancias: unicos(lista(m.intolerances)),
    estados: unicos(lista(m.dietaryStates)).map((e) => ({ estado: e, hasta: fechaValida(meta[e]?.hasta) })),
    // El perfil antiguo (un texto suelto) cuenta como uno más de la lista.
    perfiles_salud: unicos([...lista(m.healthProfiles), m.healthProfile]),
  };
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Las personas de una lista de comensales (sin invitados); lo que se queda fuera, con su aviso. */
const personasDe = (members, avisos) => {
  const vistos = new Set();
  return lista(members).filter((m) => {
    if (esInvitado(m)) return false;
    const id = texto(m?.id);
    if (!id) {
      avisos.push({ aviso: AVISOS_PERSONA.SIN_ID, persona_id: null });
      return false;
    }
    if (vistos.has(id)) {
      avisos.push({ aviso: AVISOS_PERSONA.ID_REPETIDO, persona_id: id });
      return false;
    }
    vistos.add(id);
    return true;
  });
};
/** Los datos de un comensal que no caben en su columna (van como null), cada uno con su aviso. */
const CON_TOPE = Object.entries(COLUMNA_DE_MIEMBRO).filter(([, col]) => col in RANGOS);
const fueraDeColumna = (m, id) => [
  ...CON_TOPE.filter(([k, col]) => m[k] != null && m[k] !== "" && numeroDeColumna(col, m[k]) == null)
    .map(([k]) => ({ aviso: AVISOS_PERSONA.FUERA_DE_RANGO, persona_id: id, campo: k })),
  ...(typeof m.birthDate === "string" && m.birthDate !== "" && fechaValida(m.birthDate) == null
    ? [{ aviso: AVISOS_PERSONA.FECHA_NO_VALE, persona_id: id, campo: "birthDate" }] : []),
  // El fin de un estado (embarazo hasta…) que no existe va sin fin: el estado sigue, pero sin fecha.
  ...unicos(lista(m.dietaryStates)).filter((e) => {
    const hasta = m.dietaryStatesMeta?.[e]?.hasta;
    return hasta != null && hasta !== "" && fechaValida(hasta) == null;
  }).map((e) => ({ aviso: AVISOS_PERSONA.FECHA_NO_VALE, persona_id: id, campo: `dietaryStatesMeta.${e}` })),
];
/**
 * Los grupos en la forma de escribir_persona. Lo que no viaja tal cual, con su aviso: un grupo sin id o repetido
 * no va (y la 0108 borra el que no viene), uno sin nombre va vacío (la base le pone «(sin nombre)», porque
 * grupo.nombre no admite null), y quien no es persona de la casa sale del grupo. `pendientes`: las personas nuevas
 * que aún no se mandan (sin nombre), que ya tienen su aviso.
 */
const gruposDe = (groups, ids, avisos, pendientes = new Set()) => {
  const vistos = new Set();
  return lista(groups).filter((g) => {
    const id = texto(g?.id);
    if (!id) {
      avisos.push({ aviso: AVISOS_PERSONA.GRUPO_SIN_ID, persona_id: null });
      return false;
    }
    if (vistos.has(id)) {
      avisos.push({ aviso: AVISOS_PERSONA.GRUPO_REPETIDO, persona_id: null, grupo_id: id });
      return false;
    }
    vistos.add(id);
    return true;
  }).map((g, orden) => {
    const id = texto(g.id);
    if (!texto(g.label)) avisos.push({ aviso: AVISOS_PERSONA.GRUPO_SIN_NOMBRE, persona_id: null, grupo_id: id });
    const miembros = unicos(lista(g.memberIds).map(String));
    for (const p of miembros) {
      if (!ids.has(p) && !pendientes.has(p)) avisos.push({ aviso: AVISOS_PERSONA.NO_ES_PERSONA, persona_id: p, grupo_id: id });
    }
    return {
      id, nombre: texto(g.label), tipo: texto(g.tipo) || null,
      color: typeof g.color === "string" ? g.color : null, orden,
      personas: miembros.filter((p) => ids.has(p)),
    };
  });
};

/**
 * Pura. Lo que hay que mandar a escribir_persona para pasar de la familia `antes` (la leída de las filas) a la
 * de `ahora`: de cada persona, solo lo que cambió (una nueva, entera); `borrar` para quien ya no está; y los grupos
 * enteros si cambiaron. Lo que no viaja tal cual va en `avisos` (AVISOS_PERSONA), para que quien llama lo diga:
 * un comensal sin id o repetido no se manda; un dato fuera de rango o una fecha que no existe van como null (la
 * 0108 abortaría la operación entera); una persona nueva sin nombre aún no se manda (el alta la crea vacía y pide
 * el nombre después) y mientras no cuenta en los grupos. Sin members o groups como listas, en cualquiera de las
 * dos, lanza FamiliaIncompleta: no se toma por una familia vacía.
 * @param {{ members: object[], groups: object[] }} antes
 * @param {{ members: object[], groups: object[] }} ahora
 * Los avisos de los grupos, en gruposDe.
 * @returns {{ cambios: { personas: object[], grupos?: object[] } | null, avisos: { aviso: string, persona_id: string|null, campo?: string, grupo_id?: string }[] }}
 */
export function cambiosDePersonas(antes, ahora) {
  for (const [cual, f] of [["leída", antes], ["de ahora", ahora]]) {
    if (!Array.isArray(f?.members) || !Array.isArray(f?.groups)) throw new FamiliaIncompleta(cual);
  }
  const avisos = [];
  const previas = new Map(personasDe(antes.members, avisos).map((m, orden) => [texto(m.id), { ...filaDeMiembro(m), orden }]));
  const actuales = personasDe(ahora?.members, avisos);
  const personas = [];
  const quedan = new Set();
  const pendientes = new Set();
  actuales.forEach((m, orden) => {
    const id = texto(m.id);
    const fila = { ...filaDeMiembro(m), orden };
    avisos.push(...fueraDeColumna(m, id));
    const previa = previas.get(id);
    if (!previa) {
      if (!fila.nombre) {
        avisos.push({ aviso: AVISOS_PERSONA.SIN_NOMBRE, persona_id: id });
        pendientes.add(id);
        return;
      }
      quedan.add(id);
      personas.push({ id, ...fila });
      return;
    }
    quedan.add(id);
    const cambiado = Object.fromEntries(Object.entries(fila).filter(([k, v]) => !igual(v, previa[k])));
    if (Object.keys(cambiado).length) personas.push({ id, ...cambiado });
  });
  for (const id of previas.keys()) if (!actuales.some((m) => texto(m.id) === id)) personas.push({ id, borrar: true });

  const gruposAntes = gruposDe(antes.groups, new Set(previas.keys()), avisos);
  const gruposAhora = gruposDe(ahora?.groups, quedan, avisos, pendientes);
  const cambianGrupos = !igual(gruposAntes, gruposAhora);
  const cambios = personas.length || cambianGrupos ? { personas, ...(cambianGrupos ? { grupos: gruposAhora } : {}) } : null;
  // Lo de la familia leída que no viaja se avisa también; si sigue igual en la de ahora, una sola vez.
  const vistos = new Set();
  const unaVez = avisos.filter((a) => !vistos.has(JSON.stringify(a)) && vistos.add(JSON.stringify(a)));
  return { cambios, avisos: unaVez };
}

/**
 * Pura. Los cambios de cambiosDePersonas con el `orden` de toda la familia: cada persona que queda (la que ya
 * estaba o la que va nueva) lleva su sitio en `ahora.members`, 0, 1, 2…, aunque solo cambiara otra. Así el orden
 * de la base es siempre el de quien guardó la familia entera, sin huecos ni repetidos de altas y bajas sueltas
 * (las filas de antes de la 0108 no tienen orden). Sin cambios, null: no se escribe solo para ordenar.
 * @param {ReturnType<typeof cambiosDePersonas>["cambios"]} cambios
 * @param {{ members?: object[] }} antes
 * @param {{ members?: object[] }} ahora
 */
export function conOrdenDeTodos(cambios, antes, ahora) {
  if (!cambios) return null;
  const previas = new Set(personasDe(antes?.members, []).map((m) => texto(m.id)));
  const enviadas = new Map(cambios.personas.filter((p) => !p.borrar).map((p) => [p.id, p]));
  const quedan = personasDe(ahora?.members, []).map((m) => texto(m.id)).filter((id) => previas.has(id) || enviadas.has(id));
  const orden = new Map(quedan.map((id, i) => [id, i]));
  const personas = cambios.personas.map((p) => (orden.has(p.id) ? { ...p, orden: orden.get(p.id) } : p));
  for (const id of quedan) if (!enviadas.has(id)) personas.push({ id, orden: orden.get(id) });
  return { ...cambios, personas };
}
