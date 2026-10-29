/**
 * El menú del cole desde el chat: foto o PDF que el agente lee, y se guarda
 * donde lo guarda la app (`data.schoolMenus`, con `replaceSchoolWeeks` de
 * src/lib/schoolMenu.js). El motor lo usa para no repetir en la cena lo que
 * los niños comieron en el cole (aiPlanner, getSchoolDish).
 *
 * Por días de la semana, no por fechas: Lun…Vie × Primero/Segundo/Postre. Si
 * el cole rota varias semanas, se guardan en orden: la primera vale para la
 * semana en que se guardan (o la siguiente, si es fin de semana), y a partir
 * de ahí rotan por fecha (`lunesSemana1`, indiceSemanaCole; #958).
 */

import { conData, personaPorNombre, noEncuentro } from "./ajustes.js";
import { cargarCasa } from "./casa.js";
import { motor } from "./menu.js";
import { diaDeSemana, grupoDePersonas, normal } from "./interprete.js";
import { DIA_LARGO_MINUSCULAS, DIAS_LABORABLES } from "../../src/lib/dias.js";
import { resultado } from "./resultado.js";

const PLATO = { primero: "Primero", segundo: "Segundo", postre: "Postre" };

// Una semana con menos días que esto no es un menú del cole leído: es un
// trozo. Guardarla PISA la semana entera que hubiera (replaceSchoolWeeks).
export const DIAS_MINIMOS_COLE = 3;

// ¿Está el plato a la vista? La mitad o más de sus palabras de 4 letras o más
// (las cortas son «con», «de», «al»), en el texto; con o sin la -s del plural.
const palabras = (s) => normal(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
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
    const cubiertos = Object.entries(dias).filter(([d, p]) => DIAS_LABORABLES.includes(diaDeSemana(d)) && p && (p.sinClase || Object.keys(PLATO).some((k) => String(p[k] ?? "").trim()))).length;
    if (cubiertos < DIAS_MINIMOS_COLE) {
      sinHacer.push({ que: `la semana${n}`, motivo: `solo trae ${cubiertos} de 5 días: así pisaría el menú del cole entero; que lo manden otra vez (foto o PDF) y lo leo` });
      continue;
    }
    buenas.push({ dias });
  }
  return { semanas: buenas, sinHacer };
}

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

/** @param {{ adjunto?: object|null, texto?: string, anterior?: string }} [vista]  lo que está a la vista en el turno (semanasDelCole) */
export function guardarMenuCole(householdId, { semanas: pedidas, para }, vista = {}) {
  return conData(householdId, (data, m) => {
    const { semanas, sinHacer } = semanasDelCole(pedidas, vista);
    const weeksEntries = semanas.map(aEntradas).filter((e) => Object.keys(e).length).slice(0, 6);
    if (!weeksEntries.length) {
      const nada = sinHacer.length ? sinHacer : [{ que: "el menú del cole", motivo: "no he sacado ningún plato: mándamelo más de cerca o en PDF" }];
      return { texto: "No he guardado nada del menú del cole.", resultado: resultado({ accion: "cole", sinHacer: nada }) };
    }
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
    const { siempre, aVeces } = diasSinClase(semanas);
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
    const texto = `Menú del cole guardado${kidId ? ` para ${para}` : " para todos los que comen en el cole"}: ${weeksEntries.length} semana(s), ${platos} platos. Al generar, las cenas no repetirán lo del cole.${avisoSin}`;
    return {
      data: { ...data, schoolMenus, schedule },
      texto,
      // El recibo (#958): lo guardado y lo que no, con su porqué.
      resultado: resultado({
        accion: "cole", sinHacer,
        hecho: [`${weeksEntries.length} semana${weeksEntries.length > 1 ? "s" : ""}, ${platos} platos${kidId ? ` para ${para}` : ""}`],
        nota: `Al generar, las cenas no repetirán lo del cole.${avisoSin}`,
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
