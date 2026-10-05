/**
 * El menú del cole desde el chat: foto o PDF que el agente lee, y se guarda
 * donde lo guarda la app (`data.schoolMenus`, con `replaceSchoolWeeks` de
 * src/lib/schoolMenu.js). El motor lo usa para no repetir en la cena lo que
 * los niños comieron en el cole (aiPlanner, getSchoolDish).
 *
 * Por días de la semana, no por fechas: Lun…Vie × Primero/Segundo/Postre. Si
 * el cole rota varias semanas, se guardan en orden y la primera es la que
 * vale para la semana que se planifica.
 */

import { conData, personaPorNombre, noEncuentro } from "./ajustes.js";
import { cargarCasa } from "./casa.js";
import { motor } from "./menu.js";

const DIA = { lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue", viernes: "Vie" };
const PLATO = { primero: "Primero", segundo: "Segundo", postre: "Postre" };

/** [{ dias: { lunes: { primero, segundo, postre }, … } }] → entradas «Lun-Primero». */
function aEntradas(semana) {
  const out = {};
  for (const [dia, platos] of Object.entries(semana?.dias ?? {})) {
    const d = DIA[dia];
    if (!d || !platos || platos.sinClase) continue;
    for (const [k, curso] of Object.entries(PLATO)) {
      const v = String(platos[k] ?? "").trim();
      if (v) out[`${d}-${curso}`] = v.slice(0, 120);
    }
  }
  return out;
}

export function guardarMenuCole(householdId, { semanas, para }) {
  return conData(householdId, (data, m) => {
    const weeksEntries = (semanas ?? []).map(aEntradas).filter((e) => Object.keys(e).length).slice(0, 6);
    if (!weeksEntries.length) return { texto: "No he sacado ningún plato de ese menú: ¿me lo mandas más de cerca o en PDF?" };
    let scope = "shared";
    let kidId;
    if (para && !["todos", "todas", "los niños", "ninos"].includes(String(para).toLowerCase())) {
      const x = personaPorNombre(data, para);
      if (!x) return { texto: noEncuentro(data, para) };
      scope = "individual";
      kidId = x.id;
    }
    const schoolMenus = m.replaceSchoolWeeks(data.schoolMenus, { scope, kidId, weeksEntries });
    const platos = weeksEntries.reduce((n, e) => n + Object.keys(e).length, 0);
    return {
      data: { ...data, schoolMenus },
      texto: `Menú del cole guardado${kidId ? ` para ${para}` : " para todos los que comen en el cole"}: ${weeksEntries.length} semana(s), ${platos} platos. Al generar, las cenas no repetirán lo del cole.`,
    };
  });
}

export async function verMenuCole(householdId) {
  const casa = await cargarCasa(householdId);
  const m = await motor();
  const sm = m.normalizeSchoolMenus(casa?.state?.data?.schoolMenus);
  const semana = sm.weeks?.[0];
  const lineas = [];
  const pintar = (entries, quien) => {
    for (const d of m.SCHOOL_DAYS) {
      const p = m.SCHOOL_COURSES.map((c) => entries?.[`${d}-${c}`]).filter(Boolean);
      if (p.length) lineas.push(`${quien}${d}: ${p.join(", ")}`);
    }
  };
  pintar(semana?.shared, "");
  const miembros = casa?.state?.data?.members ?? [];
  for (const [id, entries] of Object.entries(semana?.byMember ?? {})) {
    pintar(entries, `(${miembros.find((x) => x.id === id)?.name ?? "?"}) `);
  }
  if (!lineas.length) return "No hay menú del cole guardado.";
  return `Menú del cole (semana 1 de ${sm.weeks.length}):\n${lineas.join("\n")}`;
}
