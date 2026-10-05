/**
 * Pura: convierte el estado de una casa (household_state.state) en filas de las
 * tablas persona, persona_alergia, persona_intolerancia, persona_estado, grupo
 * y grupo_persona (migración 0079).
 *
 * No escribe nada: la copia la hace scripts/backfill-personas.mjs. Aquí solo se
 * decide qué va a cada columna, para poder probarlo sin base de datos.
 *
 * Lo que no tiene columna propia se queda en `resto` (jsonb), así que no se
 * pierde nada si los consumidores aún no lo leen de la tabla.
 */

// Campos de un comensal que ya tienen columna o tabla propia. Lo demás (dislikes,
// y cualquier clave desconocida) va a `resto` hasta que tenga su entidad.
const CAMPOS_CON_COLUMNA = new Set([
  "id", "name", "age", "homeRole", "alergiasRevisadas", "pesoKg", "alturaCm",
  "allergies", "intolerances", "dietaryStates", "dietaryStatesMeta",
  "useBirthDate", "birthDate", "stageDetail", "notBaby", "profileKey", "avatarKey", "color",
  "healthProfiles", "healthProfile",
]);

import { DEFAULT_ROSTER_ID } from "./rosters.js";

const lista = (v) => (Array.isArray(v) ? v : []);

// Un hogar tiene varios rosters (grupos de personas que se alternan, p. ej.
// «Otro grupo»). El activo vive en data.members/data.groups; los demás, en
// data.rosters[id].snapshot. Hay que copiarlos todos o las personas de los
// rosters inactivos desaparecen de las tablas.
const fuentesDe = (data) => {
  const activo = data.activeRosterId ?? DEFAULT_ROSTER_ID;
  return [
    { members: data.members, groups: data.groups },
    ...Object.values(data.rosters ?? {})
      .filter((r) => r && r.id !== activo)
      .map((r) => ({ members: r.snapshot?.members, groups: r.snapshot?.groups })),
  ];
};
const todosLosMiembros = (data) => fuentesDe(data).flatMap((f) => lista(f.members));
const todosLosGrupos = (data) => fuentesDe(data).flatMap((f) => lista(f.groups));
const textoLimpio = (v) => String(v ?? "").trim();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} householdId
 * @param {any} state  el JSON de household_state.state
 * @returns {{
 *   personas: object[], alergias: object[], intolerancias: object[], estados: object[], perfilesSalud: object[],
 *   grupos: object[], grupoPersona: object[], avisos: string[]
 * }}
 */
export function filasDeCasa(householdId, state) {
  const data = state?.data ?? {};
  const avisos = [];
  const personas = [];
  const alergias = [];
  const intolerancias = [];
  const estados = [];
  const perfilesSalud = [];
  const idsVistos = new Set();

  for (const m of todosLosMiembros(data)) {
    if (m?.id == null || textoLimpio(m.id) === "") {
      avisos.push("comensal sin id: se omite");
      continue;
    }
    const id = String(m.id);
    if (idsVistos.has(id)) {
      avisos.push(`id de comensal repetido «${id}»: se omite el segundo`);
      continue;
    }
    idsVistos.add(id);

    const resto = Object.fromEntries(Object.entries(m).filter(([k]) => !CAMPOS_CON_COLUMNA.has(k)));
    const edad = Number.isFinite(m.age) ? Math.trunc(m.age) : null;

    personas.push({
      household_id: householdId,
      id,
      nombre: textoLimpio(m.name) || "(sin nombre)",
      edad,
      rol_hogar: m.homeRole ?? null,
      alergias_revisadas: m.alergiasRevisadas === true,
      peso_kg: Number.isFinite(m.pesoKg) ? m.pesoKg : null,
      altura_cm: Number.isFinite(m.alturaCm) ? m.alturaCm : null,
      usa_fecha_nacimiento: m.useBirthDate === true,
      fecha_nacimiento: typeof m.birthDate === "string" && FECHA.test(m.birthDate) ? m.birthDate : null,
      detalle_etapa: textoLimpio(m.stageDetail) || null,
      no_es_bebe: m.notBaby === true,
      clave_perfil: textoLimpio(m.profileKey) || null,
      clave_avatar: textoLimpio(m.avatarKey) || null,
      color: textoLimpio(m.color) || null,
      resto,
    });

    // El perfil antiguo (un texto suelto) cuenta como uno más de la lista nueva.
    const perfiles = new Set([...lista(m.healthProfiles), m.healthProfile].map(textoLimpio).filter(Boolean));
    for (const perfil of perfiles) {
      perfilesSalud.push({ household_id: householdId, persona_id: id, perfil });
    }

    for (const a of new Set(lista(m.allergies).map(textoLimpio).filter(Boolean))) {
      alergias.push({ household_id: householdId, persona_id: id, alergeno: a });
    }
    for (const v of new Set(lista(m.intolerances).map(textoLimpio).filter(Boolean))) {
      intolerancias.push({ household_id: householdId, persona_id: id, valor: v });
    }
    const meta = m.dietaryStatesMeta && typeof m.dietaryStatesMeta === "object" ? m.dietaryStatesMeta : {};
    for (const e of new Set(lista(m.dietaryStates).map(textoLimpio).filter(Boolean))) {
      const hasta = typeof meta[e]?.hasta === "string" && meta[e].hasta ? meta[e].hasta : null;
      estados.push({ household_id: householdId, persona_id: id, estado: e, hasta });
    }
  }

  const idsPersona = new Set(personas.map((p) => p.id));
  const grupos = [];
  const grupoPersona = [];
  const idsGrupo = new Set();

  todosLosGrupos(data).forEach((g, orden) => {
    if (g?.id == null || textoLimpio(g.id) === "") {
      avisos.push("grupo sin id: se omite");
      return;
    }
    const id = String(g.id);
    if (idsGrupo.has(id)) {
      avisos.push(`id de grupo repetido «${id}»: se omite el segundo`);
      return;
    }
    idsGrupo.add(id);
    grupos.push({
      household_id: householdId,
      id,
      nombre: textoLimpio(g.label) || "(sin nombre)",
      color: typeof g.color === "string" ? g.color : null,
      orden,
    });
    for (const pid of new Set(lista(g.memberIds).map(String))) {
      if (!idsPersona.has(pid)) {
        avisos.push(`grupo «${id}» apunta a una persona que no existe («${pid}»): se omite`);
        continue;
      }
      grupoPersona.push({ household_id: householdId, grupo_id: id, persona_id: pid });
    }
  });

  return { personas, alergias, intolerancias, estados, perfilesSalud, grupos, grupoPersona, avisos };
}
