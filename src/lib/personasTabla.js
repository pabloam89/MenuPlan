/**
 * Pura: convierte el estado de una casa (household_state.state) en filas de las
 * tablas persona, persona_alergia, persona_intolerancia, persona_estado, grupo
 * y grupo_persona (migración 0079).
 *
 * No escribe nada. La copia de cada guardado la hace la base: el trigger de la
 * migración 0089 (`_persona_filas_de_estado`) es el gemelo en SQL de esta
 * función, y `supabase/personasAlGuardar.test.js` compara los dos. Esta sigue
 * sirviendo a scripts/backfill-personas.mjs y es la referencia: si cambia
 * algo aquí, cambia allí.
 *
 * Solo la familia activa (data.members / data.groups). Desde el 8 oct 2026 no
 * hay varios rosters: los aparcados en data.rosters son datos viejos que no se
 * copian, y los invitados de las reglas (`invitado: true`) no son de la casa.
 *
 * Lo que no tiene columna propia se queda en `resto` (jsonb), así que no se
 * pierde nada si los consumidores aún no lo leen de la tabla.
 */

// Campos de un comensal que ya tienen columna o tabla propia. Lo demás (dislikes,
// y cualquier clave desconocida) va a `resto` hasta que tenga su entidad.
export const CAMPOS_CON_COLUMNA = new Set([
  "id", "name", "age", "homeRole", "alergiasRevisadas", "pesoKg", "alturaCm",
  "allergies", "intolerances", "dietaryStates", "dietaryStatesMeta",
  "useBirthDate", "birthDate", "stageDetail", "notBaby", "profileKey", "avatarKey", "color",
  "healthProfiles", "healthProfile",
]);

// Los mismos topes que los CHECK de persona (0079): fuera de ellos, null, que
// la fila entera no se pierda por un dato raro.
export const RANGOS = { edad: [0, 120], peso_kg: [2, 300], altura_cm: [40, 230] };

const lista = (v) => (Array.isArray(v) ? v : []);
const textoLimpio = (v) => String(v ?? "").trim();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const enRango = (v, [min, max]) => (Number.isFinite(v) && v >= min && v <= max ? v : null);
// «2020-02-30» tiene la forma pero no existe: la base no lo convertiría a date.
const fechaValida = (v) => {
  if (typeof v !== "string" || !FECHA.test(v)) return null;
  const [a, m, d] = v.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? v : null;
};
// Un invitado de una regla vive solo en el delta de una generación (reglas.js);
// si alguno llegara al JSON guardado, no es una persona de la casa.
const esInvitado = (m) => m.invitado === true || String(m.id).startsWith("inv_");

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

  for (const m of lista(data.members)) {
    if (m?.id == null || textoLimpio(m.id) === "") {
      avisos.push("comensal sin id: se omite");
      continue;
    }
    if (esInvitado(m)) continue;
    const id = String(m.id);
    if (idsVistos.has(id)) {
      avisos.push(`id de comensal repetido «${id}»: se omite el segundo`);
      continue;
    }
    idsVistos.add(id);

    const resto = Object.fromEntries(Object.entries(m).filter(([k]) => !CAMPOS_CON_COLUMNA.has(k)));
    const edad = enRango(Number.isFinite(m.age) ? Math.trunc(m.age) : null, RANGOS.edad);

    personas.push({
      household_id: householdId,
      id,
      nombre: textoLimpio(m.name) || "(sin nombre)",
      edad,
      rol_hogar: m.homeRole ?? null,
      alergias_revisadas: m.alergiasRevisadas === true,
      peso_kg: enRango(m.pesoKg, RANGOS.peso_kg),
      altura_cm: enRango(m.alturaCm, RANGOS.altura_cm),
      usa_fecha_nacimiento: m.useBirthDate === true,
      fecha_nacimiento: fechaValida(m.birthDate),
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
      const hasta = fechaValida(meta[e]?.hasta);
      estados.push({ household_id: householdId, persona_id: id, estado: e, hasta });
    }
  }

  const idsPersona = new Set(personas.map((p) => p.id));
  const grupos = [];
  const grupoPersona = [];
  const idsGrupo = new Set();

  lista(data.groups).forEach((g, orden) => {
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
