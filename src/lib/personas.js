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

/** La lectura de personas_de_casa no tiene la forma esperada: no es una familia vacía, es no saberla. */
export class FamiliaSinLeer extends Error {
  constructor() {
    super("personas_de_casa no devolvió {personas, grupos}");
    this.name = "FamiliaSinLeer";
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

/**
 * Pura. Un comensal en la forma de una persona de escribir_persona, entera y limpia (como la copiaba la 0089:
 * fuera de rango o mal formado, null). Sin `id` ni `orden`.
 */
export function filaDeMiembro(m) {
  const meta = m.dietaryStatesMeta && typeof m.dietaryStatesMeta === "object" ? m.dietaryStatesMeta : {};
  return {
    nombre: texto(m.name),
    edad: enRango(typeof m.age === "number" ? Math.trunc(m.age) : null, RANGOS.edad),
    rol_hogar: texto(m.homeRole) || null,
    alergias_revisadas: m.alergiasRevisadas === true,
    peso_kg: enRango(m.pesoKg, RANGOS.peso_kg),
    altura_cm: enRango(m.alturaCm, RANGOS.altura_cm),
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
const NUMEROS = [["age", "edad"], ["pesoKg", "peso_kg"], ["alturaCm", "altura_cm"]];
const fueraDeColumna = (m, id) => [
  ...NUMEROS.filter(([k, col]) => m[k] != null && m[k] !== ""
      && enRango(col === "edad" && typeof m[k] === "number" ? Math.trunc(m[k]) : m[k], RANGOS[col]) == null)
    .map(([k]) => ({ aviso: AVISOS_PERSONA.FUERA_DE_RANGO, persona_id: id, campo: k })),
  ...(typeof m.birthDate === "string" && m.birthDate !== "" && fechaValida(m.birthDate) == null
    ? [{ aviso: AVISOS_PERSONA.FECHA_NO_VALE, persona_id: id, campo: "birthDate" }] : []),
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
 * el nombre después) y mientras no cuenta en los grupos.
 * @param {{ members?: object[], groups?: object[] }} antes
 * @param {{ members?: object[], groups?: object[] }} ahora
 * Los avisos de los grupos, en gruposDe.
 * @returns {{ cambios: { personas: object[], grupos?: object[] } | null, avisos: { aviso: string, persona_id: string|null, campo?: string, grupo_id?: string }[] }}
 */
export function cambiosDePersonas(antes, ahora) {
  const avisos = [];
  const previas = new Map(personasDe(antes?.members, []).map((m, orden) => [texto(m.id), { ...filaDeMiembro(m), orden }]));
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

  const gruposAntes = gruposDe(antes?.groups, new Set(previas.keys()), []);
  const gruposAhora = gruposDe(ahora?.groups, quedan, avisos, pendientes);
  const cambianGrupos = !igual(gruposAntes, gruposAhora);
  const cambios = personas.length || cambianGrupos ? { personas, ...(cambianGrupos ? { grupos: gruposAhora } : {}) } : null;
  return { cambios, avisos };
}
