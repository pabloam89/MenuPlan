#!/usr/bin/env node
/**
 * Los fallos de Lola que apuntan los probadores con /fallo (api/_bot/reporte.js). Solo lee.
 *
 *   npm run fallos:lola              los últimos 7 días
 *   npm run fallos:lola -- --dias 30
 *
 * Por cada reporte: cuándo (hora de Madrid), quién, el tipo, lo que esperaba, el mensaje de Lola
 * reportado, lo que se le dijo justo antes y las herramientas que llamó en ese turno (de su fila
 * bot_route). Al final, cuántos de cada tipo. Sale por la terminal y a ningún otro sitio: lleva lo
 * que se habla con familias, y el repo y sus issues son públicos. Los textos duran 15 días (la
 * retención de 0065); el tipo y las herramientas se quedan.
 *
 * Mismas barreras que scripts/consulta.mjs: el usuario de solo lectura y una transacción read only.
 */
import pg from "pg";
import { pathToFileURL } from "node:url";
import { leerEnv } from "./lib/env.mjs";
import { conexionDeConsulta, motivoUsuarioIncorrecto } from "./lib/rolLectura.mjs";
import { leerDias as leerDiasDe } from "./bot-enlaces.mjs";
import { TIPOS_REPORTE } from "../src/lib/vocabularios.js";
import { EVENTO_REPORTE, ETIQUETAS_REPORTE } from "../api/_bot/reporte.js";

/** Los días sin --dias. */
export const DIAS_POR_DEFECTO = 7;
/** Un reporte que se quedó sin tipo (se abrió /fallo y no se pulsó ningún botón). */
export const SIN_TIPO = "sin_tipo";

export const leerDias = (argv) => (argv.includes("--dias") ? leerDiasDe(argv) : DIAS_POR_DEFECTO);

// AAAA-MM-DD HH:MM en Madrid (sv-SE da ese formato fijo, sin depender de cómo escriba la fecha cada ICU).
const MADRID = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });
const hora = (iso) => MADRID.format(new Date(iso));
const una = (s, n = 200) => (s ? String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, n) : null);

/**
 * Pura, para el test. `reportes`: filas bot_reporte ({ id, created_at, metadata }); `rutas`: sus filas
 * bot_route ({ id, metadata }), en cualquier orden.
 * @returns {{ lineas: object[], porTipo: Record<string, number> }}  `porTipo` trae todos los de
 *   TIPOS_REPORTE (0 si no salió) y SIN_TIPO. Un tipo fuera de la lista es un error, no se cuenta aparte.
 */
export function resumir(reportes, rutas = []) {
  const porTipo = Object.fromEntries([...TIPOS_REPORTE, SIN_TIPO].map((t) => [t, 0]));
  const rutaDe = new Map(rutas.map((r) => [String(r.id), r.metadata ?? {}]));
  const lineas = [...reportes].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).map((f) => {
    const m = f.metadata ?? {};
    const tipo = m.tipo ?? SIN_TIPO;
    if (!(tipo in porTipo)) throw new Error(`tipo fuera de la lista en el reporte ${f.id}: «${tipo}»`);
    porTipo[tipo]++;
    const ruta = m.ruta_id != null ? rutaDe.get(String(m.ruta_id)) ?? null : null;
    return {
      cuando: hora(f.created_at),
      quien: m.quien ?? m.telegram_id ?? "?",
      tipo,
      esperaba: m.texto ?? null,
      lola: m.ultima ?? null,
      antes: m.anterior ?? ruta?.texto ?? null,
      herramientas: ruta?.lola?.herramientas?.map((h) => (Array.isArray(h) ? h[0] : h)) ?? null,
      turno: ruta ? m.ruta_enlace : null,
    };
  });
  return { lineas, porTipo };
}

/** El texto para la terminal. */
export function pintar({ lineas, porTipo }, dias) {
  const out = [`Últimos ${dias} días: ${lineas.length} ${lineas.length === 1 ? "fallo apuntado" : "fallos apuntados"} con /fallo.`];
  for (const l of lineas) {
    out.push("", `${l.cuando} · ${l.quien} · ${l.tipo}${ETIQUETAS_REPORTE[l.tipo] ? ` (${ETIQUETAS_REPORTE[l.tipo]})` : ""}`);
    out.push(`  Esperaba: ${una(l.esperaba) ?? "—"}`);
    out.push(`  Lola: ${una(l.lola, 400) ? `«${una(l.lola, 400)}»` : "— (ya borrado o sin leer)"}`);
    out.push(`  Antes: ${una(l.antes) ? `«${una(l.antes)}»` : "—"}`);
    out.push(`  Herramientas: ${l.herramientas == null ? "— (sin turno enlazado)" : l.herramientas.join(", ") || "ninguna"}${l.turno ? ` [turno por ${l.turno}]` : ""}`);
  }
  out.push("", `Por tipo: ${Object.entries(porTipo).map(([t, n]) => `${t} ${n}`).join(", ")}.`);
  return out.join("\n");
}

async function main() {
  const dias = leerDias(process.argv);
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
    const { rows: reportes } = await client.query({
      text: "select id, created_at, metadata from user_events where event = $1 and created_at > $2",
      values: [EVENTO_REPORTE, desde],
    });
    const ids = reportes.map((r) => r.metadata?.ruta_id).filter((x) => x != null).map(String);
    const { rows: rutas } = ids.length
      ? await client.query({ text: "select id, metadata from user_events where event = 'bot_route' and id = any($1::bigint[])", values: [ids] })
      : { rows: [] };
    console.log(pintar(resumir(reportes, rutas), dias));
  } finally {
    // Un rollback que falla se dice: la conexión se cierra igual.
    await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
