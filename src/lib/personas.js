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
 *                    no reescribir de golpe a sus 224 lectores (plan, trozo 10).
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
const FUERA_DE_RESTO = new Set(["id", ...Object.keys(COLUMNA_DE_MIEMBRO), ...DE_SALUD]);

/** Los mismos topes que los CHECK de persona (0079): fuera de ellos, null. */
export const RANGOS = Object.freeze({ edad: [0, 120], peso_kg: [2, 300], altura_cm: [40, 230] });

const lista = (v) => (Array.isArray(v) ? v : []);
const texto = (v) => String(v ?? "").trim();
const enRango = (v, [min, max]) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// «2020-02-30» tiene la forma pero no existe: la base no lo convertiría a date y abortaría la operación.
const fechaValida = (v) => {
  if (typeof v !== "string" || !FECHA.test(v)) return null;
  const [a, m, d] = v.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? v : null;
};
const unicos = (xs) => [...new Set(xs.map(texto).filter(Boolean))].sort();
const esInvitado = (m) => m?.invitado === true || String(m?.id ?? "").startsWith("inv_");

/**
 * Pura. Lo que devuelve personas_de_casa (0108) en la forma de data.members y data.groups.
 * @param {{ personas?: object[], grupos?: object[] } | null} filas
 * @returns {{ members: object[], groups: object[] }}
 */
export function membersDeFilas(filas) {
  const members = lista(filas?.personas).map((p) => {
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
  const groups = lista(filas?.grupos).map((g) => ({
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
    resto: Object.fromEntries(Object.entries(m).filter(([k]) => !FUERA_DE_RESTO.has(k))),
    alergias: unicos(lista(m.allergies)),
    intolerancias: unicos(lista(m.intolerances)),
    estados: unicos(lista(m.dietaryStates)).map((e) => ({ estado: e, hasta: fechaValida(meta[e]?.hasta) })),
    // El perfil antiguo (un texto suelto) cuenta como uno más de la lista.
    perfiles_salud: unicos([...lista(m.healthProfiles), m.healthProfile]),
  };
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const personasDe = (members) => {
  const vistos = new Set();
  return lista(members).filter((m) => {
    const id = texto(m?.id);
    if (!id || esInvitado(m) || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
};
const gruposDe = (groups, ids) => {
  const vistos = new Set();
  return lista(groups).filter((g) => texto(g?.id) && !vistos.has(texto(g.id)) && vistos.add(texto(g.id)))
    .map((g, orden) => ({
      id: texto(g.id), nombre: texto(g.label) || "(sin nombre)", tipo: texto(g.tipo) || null,
      color: typeof g.color === "string" ? g.color : null, orden,
      personas: unicos(lista(g.memberIds).map(String)).filter((id) => ids.has(id)),
    }));
};

/**
 * Pura. Lo que hay que mandar a escribir_persona para pasar de la familia `antes` (la leída de las filas) a la
 * de `ahora`: de cada persona, solo lo que cambió (una nueva, entera); `borrar` para quien ya no está; y los grupos
 * enteros si cambiaron. Una persona nueva sin nombre aún no se manda (la 0108 la rechazaría): espera a tenerlo,
 * y mientras no cuenta en los grupos. null si no hay nada que mandar.
 * @param {{ members?: object[], groups?: object[] }} antes
 * @param {{ members?: object[], groups?: object[] }} ahora
 * @returns {{ personas: object[], grupos?: object[] } | null}
 */
export function cambiosDePersonas(antes, ahora) {
  const previas = new Map(personasDe(antes?.members).map((m, orden) => [texto(m.id), { ...filaDeMiembro(m), orden }]));
  const actuales = personasDe(ahora?.members);
  const personas = [];
  const quedan = new Set();
  actuales.forEach((m, orden) => {
    const id = texto(m.id);
    const fila = { ...filaDeMiembro(m), orden };
    const previa = previas.get(id);
    if (!previa) {
      if (!fila.nombre) return;
      quedan.add(id);
      personas.push({ id, ...fila });
      return;
    }
    quedan.add(id);
    const cambiado = Object.fromEntries(Object.entries(fila).filter(([k, v]) => !igual(v, previa[k])));
    if (Object.keys(cambiado).length) personas.push({ id, ...cambiado });
  });
  for (const id of previas.keys()) if (!actuales.some((m) => texto(m.id) === id)) personas.push({ id, borrar: true });

  const gruposAntes = gruposDe(antes?.groups, new Set(previas.keys()));
  const gruposAhora = gruposDe(ahora?.groups, quedan);
  const cambianGrupos = !igual(gruposAntes, gruposAhora);
  if (!personas.length && !cambianGrupos) return null;
  return { personas, ...(cambianGrupos ? { grupos: gruposAhora } : {}) };
}
