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

// Campos de un comensal que ya tienen columna o tabla propia.
const CAMPOS_CON_COLUMNA = new Set([
  "id", "name", "age", "homeRole", "alergiasRevisadas", "pesoKg", "alturaCm",
  "allergies", "intolerances", "dietaryStates", "dietaryStatesMeta",
]);

const lista = (v) => (Array.isArray(v) ? v : []);
const textoLimpio = (v) => String(v ?? "").trim();

/**
 * @param {string} householdId
 * @param {any} state  el JSON de household_state.state
 * @returns {{
 *   personas: object[], alergias: object[], intolerancias: object[], estados: object[],
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
  const idsVistos = new Set();

  for (const m of lista(data.members)) {
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
      resto,
    });

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

  return { personas, alergias, intolerancias, estados, grupos, grupoPersona, avisos };
}
