/**
 * Las referencias rotas de toda la base (trozo 35 de #1037): lee, con la consulta que le den (solo lectura), las
 * preferencias, las tareas vivas y las personas de cada casa, y pasa cada casa por src/lib/referenciasRotas.js.
 * La usan el informe (scripts/referencias-rotas.mjs) y la cifra `referencias_rotas` (scripts/lib/cifrasModelo.js).
 *
 * Las personas de una casa son las filas de `persona` más los `members` del documento (household_state.state.data):
 * una casa que aún no tiene sus personas en filas no tendría a nadie, y todas sus tareas saldrían rotas sin estarlo.
 * Una casa con tareas y sin ninguna persona conocida no se mira: se cuenta aparte (`sinPersonas`).
 */
import { referenciasRotas } from "../../src/lib/referenciasRotas.js";

/** @param {(sql: string) => Promise<object[]>} consultar */
export async function rotasDeLaBase(consultar) {
  const preferencias = await consultar("select household_id, id, eje, valor from public.preferencia where rechazada_at is null");
  const tareas = await consultar(`select household_id, id, tipo, campo, persona_id, clave, para_member, asignado_member
                                    from public.bot_tareas where status in ('abierta', 'aplazada')
                                     and coalesce(tipo, '') <> 'recordatorio'`);
  const personas = await consultar("select household_id, id from public.persona");
  const miembros = await consultar(`select h.household_id, m->>'id' as id
                                      from public.household_state h, jsonb_array_elements(coalesce(h.state->'data'->'members', '[]'::jsonb)) m
                                     where m ? 'id'`);
  const porCasa = new Map();
  const casa = (id) => {
    if (!porCasa.has(id)) porCasa.set(id, { preferencias: [], tareas: [], personas: new Set() });
    return porCasa.get(id);
  };
  for (const p of preferencias) casa(p.household_id).preferencias.push(p);
  for (const t of tareas) casa(t.household_id).tareas.push(t);
  for (const p of [...personas, ...miembros]) casa(p.household_id).personas.add(p.id);

  const rotas = [];
  let sinPersonas = 0;
  for (const [id, d] of porCasa) {
    if (!d.personas.size && d.tareas.length) sinPersonas++;
    const r = referenciasRotas({ preferencias: d.preferencias, tareas: d.personas.size ? d.tareas : [], personas: [...d.personas] });
    for (const x of r) rotas.push({ casa: id, ...x });
  }
  return { rotas, miradas: { preferencias: preferencias.length, tareas: tareas.length, casas: porCasa.size }, sinPersonas };
}
