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
import { diaDeSemana, grupoDePersonas } from "./interprete.js";
import { DIA_LARGO_MINUSCULAS, DIAS_LABORABLES } from "../../src/lib/dias.js";

const PLATO = { primero: "Primero", segundo: "Segundo", postre: "Postre" };

/** [{ dias: { lunes: { primero, segundo, postre }, … } }] → entradas «Lun-Primero». */
function aEntradas(semana) {
  const out = {};
  for (const [dia, platos] of Object.entries(semana?.dias ?? {})) {
    const d = diaDeSemana(dia);
    if (!DIAS_LABORABLES.includes(d) || !platos || platos.sinClase) continue;
    for (const [k, curso] of Object.entries(PLATO)) {
      const v = String(platos[k] ?? "").trim();
      if (v) out[`${d}-${curso}`] = v.slice(0, 120);
    }
  }
  return out;
}

/**
 * Los días sin cole del menú: los que no hay clase en TODAS las semanas (un
 * día fijo, como un miércoles de media jornada) y los que solo faltan en
 * alguna (un festivo). Pura, para el test.
 * @returns {{ siempre: string[], aVeces: string[] }}
 */
export function diasSinClase(semanas = []) {
  const sin = (s) => new Set(Object.entries(s?.dias ?? {}).filter(([, p]) => p?.sinClase).map(([d]) => diaDeSemana(d)).filter(Boolean));
  const porSemana = semanas.map(sin);
  const todos = [...new Set(porSemana.flatMap((x) => [...x]))];
  const siempre = todos.filter((d) => porSemana.length && porSemana.every((x) => x.has(d)));
  return { siempre: DIAS_LABORABLES.filter((d) => siempre.includes(d)), aVeces: DIAS_LABORABLES.filter((d) => todos.includes(d) && !siempre.includes(d)) };
}

export function guardarMenuCole(householdId, { semanas, para }) {
  return conData(householdId, (data, m) => {
    const weeksEntries = (semanas ?? []).map(aEntradas).filter((e) => Object.keys(e).length).slice(0, 6);
    if (!weeksEntries.length) return { texto: "No he sacado ningún plato de ese menú: ¿me lo mandas más de cerca o en PDF?" };
    let scope = "shared";
    let kidId;
    // «todos», «niños», «los peques»… con el intérprete (#958: antes solo
    // valían cuatro formas escritas a mano, y «los peques» no era nadie).
    const grupo = para ? grupoDePersonas(para) : "todos";
    if (grupo !== "todos" && grupo !== "ninos") {
      const x = personaPorNombre(data, para);
      if (!x) return { texto: noEncuentro(data, para) };
      scope = "individual";
      kidId = x.id;
    }
    const schoolMenus = m.replaceSchoolWeeks(data.schoolMenus, { scope, kidId, weeksEntries });
    const platos = weeksEntries.reduce((n, e) => n + Object.keys(e).length, 0);
    // Un día que nunca tiene cole (sinClase en todas las semanas) se enseña
    // al horario: ese día comen en casa. Antes se saltaba, y el horario seguía
    // diciendo «cole» (#958). Un día sin clase solo en alguna semana es un
    // festivo: se pregunta, no se toca el horario de siempre.
    const { siempre, aVeces } = diasSinClase(semanas ?? []);
    const schedule = { ...(data.schedule ?? {}) };
    const quienes = kidId ? [kidId] : (data.members ?? []).map((x) => x.id);
    const liberados = [];
    for (const d of siempre) for (const id of quienes) {
      const k = m.slotKey(id, d, "Comida");
      if (schedule[k] === "cole") { delete schedule[k]; liberados.push(d); }
    }
    const nombres = (lista) => [...new Set(lista)].map((d) => DIA_LARGO_MINUSCULAS[d]).join(", ");
    const avisoSin = [
      liberados.length ? ` Los ${nombres(liberados)} no hay cole: en el horario, ese día comen en casa.` : "",
      aVeces.length ? ` Algún ${nombres(aVeces)} no hay clase (¿festivo?): pregunta qué día exacto, y si comen fuera o en casa, apúntalo con fuera_de_casa o déjalo.` : "",
    ].join("");
    return {
      data: { ...data, schoolMenus, schedule },
      texto: `Menú del cole guardado${kidId ? ` para ${para}` : " para todos los que comen en el cole"}: ${weeksEntries.length} semana(s), ${platos} platos. Al generar, las cenas no repetirán lo del cole.${avisoSin}`,
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
