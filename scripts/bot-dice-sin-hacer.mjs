#!/usr/bin/env node
/**
 * Cuántas respuestas de Lola dicen que han hecho algo en un turno en el que no
 * se guardó nada (#958, raíz 1: «lo hecho se cuenta en texto»). Solo lee.
 *
 *   node scripts/bot-dice-sin-hacer.mjs            los últimos 15 días (lo que guarda bot_messages)
 *   node scripts/bot-dice-sin-hacer.mjs --dias 7
 *
 * Cada respuesta (bot_messages, role assistant) se cruza con la medida de su
 * turno (user_events bot_route, mismo chat, hasta 2 min después):
 *   · «dice que lo hizo»: el mismo vigilante que corre en el turno
 *     (api/_bot/resultado.js diceQueGuardo);
 *   · «se guardó algo»: lola.guardados si está (desde el 29 oct 2026, lo que
 *     llegó de verdad a la base); si no, alguna herramienta que escribe en
 *     lola.herramientas, o una vía rápida que escribe (modo).
 * Sin textos en la salida: solo cifras (el repo es público).
 *
 * Mismas barreras que scripts/consulta.mjs: el usuario de solo lectura y una
 * transacción read only.
 */
import pg from "pg";
import { pathToFileURL } from "node:url";
import { leerEnv } from "./lib/env.mjs";
import { conexionDeConsulta, motivoUsuarioIncorrecto } from "./lib/rolLectura.mjs";
import { diceQueGuardo } from "../api/_bot/resultado.js";
import { POLITICA } from "../api/_bot/router.js";

// Los modos de la vía rápida que escriben: los de riesgo «escribe…» en la
// tabla del enrutador, sacados de ella para que no haya una copia que se desfase.
export const MODOS_QUE_ESCRIBEN = Object.entries(POLITICA).filter(([, p]) => /^escribe/.test(p.riesgo)).map(([modo]) => modo);
const VENTANA_MS = 120000;

/**
 * Pura, para el test. `mensajes`: [{ chat, en (ms), texto }]; `rutas`: [{ chat,
 * en (ms), rapida, modo, herramientas: [[nombre, ms]], guardados, recibo: [[acción, hechas, sin hacer]] }].
 * @param {Set<string>} soloLectura  las herramientas que no escriben
 */
export function contar(mensajes, rutas, soloLectura) {
  const porChat = new Map();
  for (const r of rutas) porChat.set(r.chat, [...(porChat.get(r.chat) ?? []), r]);
  const out = { respuestas: 0, conTurno: 0, dicen: 0, diceSinHecho: 0, diceConAlgoSinHacer: 0, sinTurno: 0 };
  for (const m of mensajes) {
    if (!String(m.texto ?? "").trim()) continue;
    out.respuestas++;
    const ruta = (porChat.get(m.chat) ?? [])
      .filter((r) => r.en >= m.en - 5000 && r.en <= m.en + VENTANA_MS)
      .sort((a, b) => Math.abs(a.en - m.en) - Math.abs(b.en - m.en))[0];
    if (!ruta) { out.sinTurno++; continue; }
    out.conTurno++;
    if (!diceQueGuardo(m.texto)) continue;
    out.dicen++;
    const guardo = ruta.guardados != null
      ? ruta.guardados > 0
      : ruta.rapida ? MODOS_QUE_ESCRIBEN.includes(ruta.modo) : (ruta.herramientas ?? []).some(([n]) => !soloLectura.has(n));
    if (!guardo) out.diceSinHecho++;
    // Desde el recibo (29 oct 2026): lo dijo y algo de lo pedido quedó sin hacer.
    else if ((ruta.recibo ?? []).some(([, , sinHacer]) => sinHacer > 0)) out.diceConAlgoSinHacer++;
  }
  return out;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10} %` : "—");

async function main() {
  const i = process.argv.indexOf("--dias");
  const dias = i > 0 ? Number(process.argv[i + 1]) || 15 : 15;
  process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
  const { SOLO_LECTURA } = await import("../api/_bot/agente.js");
  const { url, aviso, rol } = conexionDeConsulta((k) => leerEnv(k), { admin: false });
  if (aviso) console.error(aviso);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: [quien] } = await client.query("select current_user as yo");
    const mal = motivoUsuarioIncorrecto(rol, quien.yo);
    if (mal) throw new Error(mal);
    await client.query("begin read only");
    await client.query("set local statement_timeout = '15s'");
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const { rows: ms } = await client.query({
      text: "select chat_id, created_at, content->>'texto' as texto from bot_messages where role = 'assistant' and created_at > $1 and coalesce(content->>'tipo', '') = ''",
      values: [desde],
    });
    const { rows: rs } = await client.query({
      text: "select metadata, created_at from user_events where event = 'bot_route' and created_at > $1 and coalesce((metadata->>'sombra')::boolean, false) = false",
      values: [desde],
    });
    const mensajes = ms.map((m) => ({ chat: String(m.chat_id), en: Date.parse(m.created_at), texto: m.texto }));
    const rutas = rs.map(({ metadata: x, created_at }) => ({
      chat: String(x?.chat ?? ""), en: Date.parse(created_at), rapida: x?.rapida === true, modo: x?.modo ?? null,
      herramientas: x?.lola?.herramientas ?? [], guardados: x?.lola?.guardados ?? null, recibo: x?.lola?.recibo ?? null,
    }));
    const c = contar(mensajes, rutas, SOLO_LECTURA);
    console.log(`Últimos ${dias} días: ${c.respuestas} respuestas de Lola; ${c.conTurno} cruzadas con su turno (${c.sinTurno} sin medida).`);
    console.log(`Dicen que han hecho algo: ${c.dicen}. De esas, sin nada guardado en el turno: ${c.diceSinHecho} (${pct(c.diceSinHecho, c.conTurno)} de las respuestas cruzadas; ${pct(c.diceSinHecho, c.dicen)} de las que lo dicen).`);
    console.log(`Lo dicen y el recibo tiene algo sin hacer (solo turnos con recibo, desde el 29 oct 2026): ${c.diceConAlgoSinHacer}.`);
  } finally {
    await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
