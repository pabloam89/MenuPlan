#!/usr/bin/env node
/**
 * Cuántas respuestas de Lola dicen que han hecho algo en un turno en el que no
 * se guardó nada (#958, raíz 1: «lo hecho se cuenta en texto»). Solo lee.
 *
 *   node scripts/bot-dice-sin-hacer.mjs            los últimos 15 días
 *   node scripts/bot-dice-sin-hacer.mjs --dias 7
 *
 * 15 días es lo que guarda bot_messages (migración 0065_bot_retencion): más
 * atrás no hay respuestas que cruzar.
 *
 * Cada respuesta (bot_messages, role assistant) se cruza con la medida de su
 * turno (user_events bot_route, mismo chat, de 5 s antes a 2 min después):
 *   · «dice que lo hizo»: el mismo vigilante que corre en el turno
 *     (diceQueGuardo, api/_bot/agente.js);
 *   · «se guardó algo»: lola.guardados si está (lo que llegó de verdad a la
 *     base, desde este PR); si no, alguna herramienta que escribe en
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
import { POLITICA } from "../api/_bot/router.js";

// Los modos de la vía rápida que escriben: los de riesgo «escribe…» en la
// tabla del enrutador, sacados de ella para que no haya una copia que se desfase.
export const MODOS_QUE_ESCRIBEN = Object.entries(POLITICA).filter(([, p]) => /^escribe/.test(p.riesgo)).map(([modo]) => modo);

/** Los días que guarda bot_messages (0065_bot_retencion): el valor sin --dias, y el tope. */
export const DIAS_GUARDADOS = 15;

/**
 * La ventana para cruzar una respuesta con su turno. bot_route se apunta al
 * acabar el turno, casi siempre después del mensaje (hasta 2 min si Lola
 * tarda); y a veces unos ms antes, porque el mensaje se guarda tras enviarse.
 */
export const VENTANA = Object.freeze({ antesMs: 5000, despuesMs: 120000 });

/** Los días pedidos: sin --dias, DIAS_GUARDADOS; un valor que no es un entero de 1 a DIAS_GUARDADOS es un error, no 15 en silencio. */
export function leerDias(argv) {
  const i = argv.indexOf("--dias");
  if (i < 0) return DIAS_GUARDADOS;
  const dias = Number(argv[i + 1]);
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_GUARDADOS) {
    throw new Error(`--dias tiene que ser un entero de 1 a ${DIAS_GUARDADOS} (bot_messages no guarda más); llegó «${argv[i + 1] ?? ""}»`);
  }
  return dias;
}

/**
 * Pura, para el test. `mensajes`: [{ chat, en (ms), texto }]; `rutas`: [{ chat,
 * en (ms), rapida, modo, herramientas: [[nombre, ms]], guardados, recibo: [[acción, hechas, sin hacer]] }].
 * `soloLectura`: las herramientas que no escriben; `dice`: el vigilante.
 */
export function contar(mensajes, rutas, { soloLectura, dice }) {
  const porChat = new Map();
  for (const r of rutas) porChat.set(r.chat, [...(porChat.get(r.chat) ?? []), r]);
  const out = { respuestas: 0, conTurno: 0, dicen: 0, diceSinHecho: 0, diceConAlgoSinHacer: 0, sinTurno: 0 };
  for (const m of mensajes) {
    if (!String(m.texto ?? "").trim()) continue;
    out.respuestas++;
    const ruta = (porChat.get(m.chat) ?? [])
      .filter((r) => r.en >= m.en - VENTANA.antesMs && r.en <= m.en + VENTANA.despuesMs)
      .sort((a, b) => Math.abs(a.en - m.en) - Math.abs(b.en - m.en))[0];
    if (!ruta) { out.sinTurno++; continue; }
    out.conTurno++;
    if (!dice(m.texto)) continue;
    out.dicen++;
    const guardo = ruta.guardados != null
      ? ruta.guardados > 0
      : ruta.rapida ? MODOS_QUE_ESCRIBEN.includes(ruta.modo) : (ruta.herramientas ?? []).some(([n]) => !soloLectura.has(n));
    if (!guardo) out.diceSinHecho++;
    // Con recibo: lo dijo y algo de lo pedido quedó sin hacer.
    else if ((ruta.recibo ?? []).some(([, , sinHacer]) => sinHacer > 0)) out.diceConAlgoSinHacer++;
  }
  return out;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10} %` : "—");

async function main() {
  const dias = leerDias(process.argv);
  // agente.js pide estas dos al cargarse; aquí no se usan (solo se leen sus constantes).
  process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
  const { SOLO_LECTURA, diceQueGuardo } = await import("../api/_bot/agente.js");
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
    const c = contar(mensajes, rutas, { soloLectura: SOLO_LECTURA, dice: diceQueGuardo });
    console.log(`Últimos ${dias} días: ${c.respuestas} respuestas de Lola; ${c.conTurno} cruzadas con su turno (${c.sinTurno} sin medida).`);
    console.log(`Dicen que han hecho algo: ${c.dicen}. De esas, sin nada guardado en el turno: ${c.diceSinHecho} (${pct(c.diceSinHecho, c.conTurno)} de las respuestas cruzadas; ${pct(c.diceSinHecho, c.dicen)} de las que lo dicen).`);
    console.log(`Lo dicen y el recibo tiene algo sin hacer (solo turnos con recibo): ${c.diceConAlgoSinHacer}.`);
  } finally {
    // Un rollback que falla se dice: la conexión se cierra igual.
    await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
