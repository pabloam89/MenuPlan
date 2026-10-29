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
import { motor, normal } from "./menu.js";
import { resultado } from "./resultado.js";

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

// Una semana con menos días que esto no es un menú del cole leído: es un
// trozo. Guardarla PISA la semana entera que hubiera (replaceSchoolWeeks).
export const DIAS_MINIMOS_COLE = 3;

const palabras = (s) => normal(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3);
/** ¿Está el plato en lo que se ve? La mayoría de sus palabras, en el texto. */
function seVe(plato, fuente) {
  const ws = palabras(plato);
  if (!ws.length) return true;
  const hay = new Set(palabras(fuente));
  return ws.filter((w) => hay.has(w) || hay.has(w.replace(/s$/, "")) || hay.has(`${w}s`)).length * 2 >= ws.length;
}

/**
 * Lo que se puede guardar del menú del cole y lo que no. Lo leído de un PDF o
 * de una foto solo existe en el turno en que llega: en el turno del «sí» ya no
 * está, y la herramienta aceptaba cualquier cosa. Así se guardó un plato que
 * no venía en el PDF (#958). Ahora cada plato tiene que estar a la vista: con
 * el adjunto en este mismo mensaje, o escrito por la persona, o en el resumen
 * que Lola enseñó justo antes. Y una semana con menos de DIAS_MINIMOS_COLE días
 * no se guarda: pisaría la que había. Pura, para el test.
 * @param {{ adjunto?: object|null, texto?: string, anterior?: string }} vista
 */
export function semanasDelCole(semanas, { adjunto = null, texto = "", anterior = "" } = {}) {
  const fuente = `${texto ?? ""}\n${anterior ?? ""}`;
  const buenas = [];
  const sinHacer = [];
  for (const [i, s] of (semanas ?? []).slice(0, 6).entries()) {
    const n = (semanas?.length ?? 0) > 1 ? ` (semana ${i + 1})` : "";
    const dias = { ...(s?.dias ?? {}) };
    if (!adjunto) {
      for (const [dia, platos] of Object.entries(dias)) {
        if (!platos || platos.sinClase) continue;
        const limpio = { ...platos };
        for (const k of Object.keys(PLATO)) {
          if (platos[k] && !seVe(platos[k], fuente)) {
            sinHacer.push({ que: `${platos[k]}${n}`, motivo: "no está en lo que me han mandado ni en el resumen: el PDF o la foto solo se lee en el mensaje en que llega" });
            delete limpio[k];
          }
        }
        dias[dia] = limpio;
      }
    }
    const cubiertos = Object.entries(dias).filter(([d, p]) => DIA[d] && p && (p.sinClase || Object.keys(PLATO).some((k) => String(p[k] ?? "").trim()))).length;
    if (cubiertos < DIAS_MINIMOS_COLE) {
      sinHacer.push({ que: `la semana${n}`, motivo: `solo trae ${cubiertos} de 5 días: así pisaría el menú del cole entero; que lo manden otra vez (foto o PDF) y lo leo` });
      continue;
    }
    buenas.push({ dias });
  }
  return { semanas: buenas, sinHacer };
}

export function guardarMenuCole(householdId, { semanas, para }, vista = {}) {
  return conData(householdId, (data, m) => {
    const { semanas: buenas, sinHacer } = semanasDelCole(semanas, vista);
    const weeksEntries = buenas.map(aEntradas).filter((e) => Object.keys(e).length).slice(0, 6);
    if (!weeksEntries.length) {
      const texto = "No he guardado nada del menú del cole: ¿me lo mandas otra vez (más de cerca o en PDF)?";
      return { texto, resultado: resultado({ accion: "cole", sinHacer: sinHacer.length ? sinHacer : [{ que: "el menú del cole", motivo: "no he sacado ningún plato" }] }) };
    }
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
    const texto = `Menú del cole guardado${kidId ? ` para ${para}` : " para todos los que comen en el cole"}: ${weeksEntries.length} semana(s), ${platos} platos. Al generar, las cenas no repetirán lo del cole.`;
    return {
      data: { ...data, schoolMenus },
      texto,
      resultado: resultado({
        accion: "cole", sinHacer,
        hecho: [`${weeksEntries.length} semana${weeksEntries.length > 1 ? "s" : ""}, ${platos} platos${kidId ? ` para ${para}` : ""}`],
        nota: "Al generar, las cenas no repetirán lo del cole.",
      }),
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
