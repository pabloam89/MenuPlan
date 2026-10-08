/**
 * El aviso de la víspera: la noche antes, solo si hay algo que preparar.
 *
 *   · legumbres secas que hay que poner en remojo para mañana;
 *   · un plato del congelador que hay que sacar;
 *   · mañana es su día de batch cooking (lo pedido y el rato).
 *
 * Si no hay nada de eso, no se manda nada: un aviso que no pide hacer nada es
 * ruido, y el ruido hace que se quite.
 *
 * Solo para quien lo acepta (como cualquier recordatorio: Lola lo OFRECE y lo
 * crea con su sí). Vive en bot_reminders como uno diario con tipo
 * TIPO_VISPERA (y el texto VISPERA, que es lo que miraba el bot de antes); al
 * vencer, api/bot/recordatorios.js monta el mensaje con avisoDeVispera en vez
 * de mandar el texto.
 *
 * Sin el motor: las recetas salen de las guardadas con el menú (aiRecipes).
 */

import { fallaCon } from "./avisar.js";
import { cargarCasa } from "./casa.js";
import { select, update } from "./db.js";
import { crearRecordatorio } from "./recordatorios.js";
import { batchCooking } from "./ficha.js";
import { IDS_COMIDAS, comida as delCatalogo } from "../../src/lib/comidas.js";
import { diaDeISO } from "../../src/lib/dias.js";
import { slotUsesFreezer } from "../../src/lib/freezer.js";

/**
 * El texto con el que se guarda el aviso en bot_reminders. Ya no lo identifica
 * (eso es TIPO_VISPERA), pero se sigue escribiendo igual: el bot desplegado
 * antes de la 0085 lo reconoce por el texto, y el disparador de la 0085 pone
 * el tipo a los que él crea sin tipo.
 */
export const VISPERA = "Aviso de la víspera";
/** bot_reminders.tipo del aviso (uno de TIPOS_RECORDATORIO). */
export const TIPO_VISPERA = "vispera";

const diaDeFecha = diaDeISO;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Lo que va a remojo la noche antes. Las lentejas no; lo de bote o ya cocido, tampoco.
const REMOJO = /\b(garbanzos?|alubias?|jud[ií]as? (blancas?|pintas?|rojas?|de careta)|fabes|frijol(es)?)\b/i;
const YA_LISTO = /\b(cocid[oa]s?|de bote|en conserva|lata|tarro)\b/i;

const quitarTildes = (s) => String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Lo que hay que hacer esta noche para mañana, o null si nada. Pura.
 * @param {object} casa  la de cargarCasa (state, semanas)
 * @param {string} manana  fecha ISO de mañana
 * @returns {string | null}  HTML de Telegram
 */
export function avisoDeVispera(casa, manana) {
  const data = casa?.state?.data ?? {};
  const dia = diaDeFecha(manana);
  const recetas = new Map();
  for (const r of casa?.state?.aiRecipes ?? []) {
    if (!r?.id) continue;
    recetas.set(r.id, r);
    recetas.set(String(r.id).split("__").pop(), r);
  }
  const receta = (id) => (id ? recetas.get(id) ?? recetas.get(String(id).split("__").pop()) : null);

  const remojo = new Map(); // ingrediente → para qué plato
  const congelador = new Set();
  const semana = (casa?.semanas ?? []).find((w) => w.weekStart <= manana && manana <= w.weekEnd);
  for (const plan of Object.values(semana?.plan ?? {})) {
    if (!plan || typeof plan !== "object") continue;
    for (const c of IDS_COMIDAS) {
      const hueco = plan[`${dia}-${c}`];
      if (!hueco) continue;
      for (const id of [hueco.firstRecipeId, hueco.recipeId].filter(Boolean)) {
        const r = receta(id);
        if (!r) continue;
        if (slotUsesFreezer(hueco, id)) { congelador.add(r.name); continue; }
        for (const ing of r.ingredients ?? []) {
          const nombre = String(ing?.name ?? ing?.ingredient ?? "");
          const m = REMOJO.exec(quitarTildes(nombre)) ?? REMOJO.exec(nombre);
          if (m && !YA_LISTO.test(quitarTildes(nombre))) {
            const clave = m[0].toLowerCase();
            if (!remojo.has(clave)) remojo.set(clave, `${r.name} (${delCatalogo(c)?.nombre ?? c.toLowerCase()})`);
          }
        }
      }
    }
  }

  const lineas = [];
  const plural = (x) => (/s$/.test(x) ? x : /l$/.test(x) ? `${x}es` : `${x}s`);
  for (const [que, para] of remojo) lineas.push(`🫘 Pon en remojo los ${esc(plural(que))} esta noche: mañana toca ${esc(para)}.`);
  for (const plato of congelador) lineas.push(`🧊 Saca del congelador ${esc(plato)}: se come mañana.`);
  const bc = batchCooking(data);
  if (bc?.dia === dia) lineas.push(`🥘 Mañana es tu día de batch cooking: ${esc(bc.que)} (${esc(bc.manos)} de manos).`);
  if (!lineas.length) return null;
  return `🌙 <b>Para mañana</b>\n\n${lineas.join("\n")}`;
}

/** El aviso de una casa para mañana (fecha de Madrid), o null. */
export async function avisoDeVisperaDe(householdId, hoyISO) {
  const casa = await cargarCasa(householdId).catch(fallaCon("vispera/casa", null));
  if (!casa) return null;
  const d = new Date(`${hoyISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return avisoDeVispera(casa, d.toISOString().slice(0, 10));
}

/**
 * Activa (o cambia de hora) el aviso de la víspera en este chat, o lo quita.
 * Solo con el sí de la persona: Lola lo ofrece una vez (conocimiento.md).
 */
export async function avisoVispera(chat, { activar = true, hora = "20:30" } = {}) {
  // La hora se mira ANTES de quitar el que había: con una hora mal escrita se
  // quedaba sin aviso y sin decirlo.
  if (activar && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return "Dime la hora como HH:MM (por ejemplo 20:30).";
  const enChat = `chat_id=eq.${encodeURIComponent(String(chat.chatId))}&status=eq.pending&tipo=eq.${TIPO_VISPERA}`;
  const ya = await select("bot_reminders", enChat, "id");
  // Si quitar el de antes falla, lanza: mejor un error que dos avisos cada noche.
  if (ya.length) await update("bot_reminders", enChat, { status: "cancelled" });
  if (!activar) return ya.length ? "Quitado: ya no te aviso la víspera." : "No tenías el aviso de la víspera puesto.";
  // La próxima vez que toque esa hora en España: hoy si aún no ha pasado.
  const ahora = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const [hoy, horaAhora] = ahora.split(" ");
  const d = new Date(`${hoy}T12:00:00Z`);
  if (horaAhora >= hora) d.setUTCDate(d.getUTCDate() + 1);
  const r = await crearRecordatorio(chat, { texto: VISPERA, cuando: `${d.toISOString().slice(0, 10)}T${hora}`, repite: "diario", tipo: TIPO_VISPERA });
  if (!/^Recordatorio creado/.test(r)) return r;
  return `Hecho: cada noche a las ${hora} miro el menú de mañana y, si hay algo que preparar (remojo, sacar algo del congelador, tu día de batch cooking), te aviso. Si no hay nada, no te escribo.`;
}
