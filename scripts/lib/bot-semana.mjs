/**
 * Las cuentas de la mejora semanal de Lola, sin base de datos: reciben los
 * eventos del bot (user_events, event like 'bot_%') y devuelven medidas,
 * semáforo e informe. Las usan scripts/bot-semanal.mjs (el informe),
 * scripts/lola-feedback.mjs (los huecos) y scripts/bot-medidas.mjs (precios).
 *
 * Un evento es { created_at, event, m } con m = metadata. Sirve igual con
 * texto (local, .env.local) que sin él (la vista ops.bot_events del workflow).
 */

import { esCorreccion } from "../../api/_bot/senales.js";

// USD por millón de tokens: REVISARLOS contra la tarifa publicada de
// Anthropic. Se aplican al leer, no al apuntar.
export const PRECIOS = {
  haiku: { in: 1, out: 5, cr: 0.1, cw: 1.25 },
  sonnet: { in: 3, out: 15, cr: 0.3, cw: 3.75 },
  opus: { in: 5, out: 25, cr: 0.5, cw: 6.25 },
};
export const precioDe = (modelo = "") => PRECIOS[Object.keys(PRECIOS).find((k) => String(modelo).includes(k)) ?? "sonnet"];
export const usd = (u, p) => (u ? ((u.in ?? 0) * p.in + (u.out ?? 0) * p.out + (u.cr ?? 0) * p.cr + (u.cw ?? 0) * p.cw) / 1e6 : 0);

/** Percentil p (0-100) de los números finitos de xs; null si no hay ninguno. */
export function pct(xs, p) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))];
}

const tanto = (n, de) => (de ? (100 * n) / de : null);
// Lo siguiente del mismo chat, en menos de esto, cuenta como reacción al turno.
const VENTANA_MS = 3 * 60_000;

/** Turnos reales del enrutador (los de sombra no los vio nadie). */
const turnosDe = (eventos) => eventos.filter((e) => e.event === "bot_route" && !e.m?.sombra);

/**
 * Los turnos que la persona corrigió justo después (mismo chat, < 3 min):
 * «no, eso no», deshacer… Con `corrige` apuntado al vuelo (telegram.js) o,
 * en filas antiguas, calculado del texto si aún está.
 * @returns {Set<object>} los eventos corregidos
 */
export function corregidos(eventos) {
  const turnos = turnosDe(eventos).filter((e) => e.m?.chat);
  const out = new Set();
  for (const [i, e] of turnos.entries()) {
    const sig = turnos.slice(i + 1).find((x) => x.m.chat === e.m.chat);
    if (!sig || Date.parse(sig.created_at) - Date.parse(e.created_at) > VENTANA_MS) continue;
    const corrige = sig.m.modo === "deshacer" || (sig.m.corrige ?? esCorreccion(sig.m.texto, sig.m.ultima));
    if (corrige) out.add(e);
  }
  return out;
}

/**
 * Las medidas de un periodo.
 * @param {{ created_at: string, event: string, m: object }[]} eventos
 * @param {{ busquedaParecidoMinimo?: number|null }} [objetivos]
 */
export function medir(eventos, objetivos = {}) {
  const turnos = turnosDe(eventos);
  const rapidas = turnos.filter((e) => e.m.rapida);
  const deLola = turnos.filter((e) => !e.m.rapida);
  const conLola = deLola.filter((e) => e.m.lola);
  const contar = (ev) => eventos.filter((e) => e.event === ev).length;
  const corr = corregidos(eventos);

  // Coste: lo cancelado (ganó la vía rápida) no trae uso; se estima con la
  // mediana de lo que entra en la primera llamada de Lola (bot-medidas.mjs).
  const primeras = conLola.map((e) => e.m.lola.primera).filter(Boolean);
  const med = (k) => pct(primeras.map((p) => p[k] ?? 0), 50) ?? 0;
  const estimada = { in: med("in"), cr: med("cr"), cw: med("cw"), out: 0 };
  const conMedida = turnos.filter((e) => "lola_cancelada" in e.m);
  let coste = 0;
  for (const { m } of conMedida) {
    coste += usd(m.router_uso, PRECIOS.haiku);
    if (m.lola?.uso) coste += usd(m.lola.uso, precioDe(m.lola.modelo));
    else if (m.lola_cancelada) coste += usd(estimada, PRECIOS.sonnet);
  }

  const busquedas = eventos.filter((e) => e.event === "bot_busqueda");
  const porVector = busquedas.filter((e) => e.m.via === "vectores" && Number.isFinite(e.m.parecido));
  const minimo = objetivos.busquedaParecidoMinimo;
  const flojas = busquedas.filter((e) => e.m.n === 0 || (Number.isFinite(minimo) && e.m.via === "vectores" && e.m.parecido < minimo));

  return {
    uso: {
      turnos: turnos.length,
      rapidaPct: tanto(rapidas.length, turnos.length),
      chats: new Set(turnos.map((e) => e.m.chat).filter(Boolean)).size || null,
    },
    latencia: {
      primerTextoRapidaP50Ms: pct(rapidas.map((e) => e.m.primer_ms ?? e.m.ms), 50),
      primerTextoRapidaP95Ms: pct(rapidas.map((e) => e.m.primer_ms ?? e.m.ms), 95),
      primerTextoLolaP50Ms: pct(deLola.map((e) => e.m.primer_ms), 50),
      primerTextoLolaP95Ms: pct(deLola.map((e) => e.m.primer_ms), 95),
      turnoLolaP95Ms: pct(deLola.map((e) => e.m.ms), 95),
      enrutadorP50Ms: pct(turnos.map((e) => e.m.router_ms), 50),
    },
    calidad: {
      corregidasPct: tanto(corr.size, turnos.length),
      noEntiendePct: tanto(contar("bot_not_understood"), deLola.length),
      supervisor: contar("bot_supervisor"),
      fallosHerramienta: contar("bot_tool_error"),
      // Dijo que guardó sin guardar: los que se corrigieron solos en la segunda
      // vuelta y los que no (sigue = true), que son los que pierden datos.
      dijoQueGuardo: contar("bot_claimed_unsaved"),
      sinGuardarFinal: eventos.filter((e) => e.event === "bot_claimed_unsaved" && e.m?.sigue === true).length,
      errores: contar("bot_error"),
      planBPct: tanto(conLola.filter((e) => e.m.lola.planB).length, conLola.length),
      vueltasMedia: conLola.length ? conLola.reduce((a, e) => a + (e.m.lola.vueltas ?? 0), 0) / conLola.length : null,
    },
    busqueda: {
      n: busquedas.length,
      vaciasPct: tanto(busquedas.filter((e) => e.m.n === 0).length, busquedas.length),
      parecidoP10: pct(porVector.map((e) => e.m.parecido), 10),
      parecidoP50: pct(porVector.map((e) => e.m.parecido), 50),
      flojasPct: tanto(flojas.length, busquedas.length),
    },
    coste: {
      totalUsd: coste,
      porTurnoUsd: conMedida.length ? coste / conMedida.length : null,
    },
  };
}

// ── Semáforo ────────────────────────────────────────────────────────────────
// Cada objetivo de scripts/bot-objetivos.json: dónde está la medida y si el
// límite es un máximo o un mínimo.
const OBJETIVOS = {
  primerTextoRapidaP95Ms: ["latencia.primerTextoRapidaP95Ms", "max", "Primer texto, vía rápida (p95)", "ms"],
  primerTextoLolaP95Ms: ["latencia.primerTextoLolaP95Ms", "max", "Primer texto, Lola (p95)", "ms"],
  turnoLolaP95Ms: ["latencia.turnoLolaP95Ms", "max", "Turno entero, Lola (p95)", "ms"],
  corregidasMaxPct: ["calidad.corregidasPct", "max", "Turnos corregidos", "%"],
  noEntiendeMaxPct: ["calidad.noEntiendePct", "max", "«No te he entendido»", "%"],
  planBMaxPct: ["calidad.planBPct", "max", "Contestó el modelo de reserva", "%"],
  dijoQueGuardoMax: ["calidad.dijoQueGuardo", "max", "Dijo que guardó sin guardar (corregido solo)", ""],
  sinGuardarFinalMax: ["calidad.sinGuardarFinal", "max", "Dijo que guardó y no guardó nunca", ""],
  busquedaFlojaMaxPct: ["busqueda.flojasPct", "max", "Búsquedas flojas o vacías", "%"],
  costePorTurnoMaxUsd: ["coste.porTurnoUsd", "max", "Coste por turno", "$"],
};
const leer = (o, ruta) => ruta.split(".").reduce((x, k) => x?.[k], o);

/** [{ clave, nombre, valor, limite, ok }] — ok null si falta la medida o el objetivo. */
export function semaforo(medidas, objetivos = {}) {
  return Object.entries(OBJETIVOS).map(([clave, [ruta, tipo, nombre, unidad]]) => {
    const valor = leer(medidas, ruta);
    const limite = objetivos[clave];
    const ok = valor == null || !Number.isFinite(limite) ? null : tipo === "max" ? valor <= limite : valor >= limite;
    return { clave, nombre, unidad, valor, limite: Number.isFinite(limite) ? limite : null, ok };
  });
}

// ── Informe ─────────────────────────────────────────────────────────────────
function fmt(v, unidad) {
  if (v == null) return "—";
  if (unidad === "ms") return `${(v / 1000).toFixed(1)} s`;
  if (unidad === "%") return `${v.toFixed(1)} %`;
  if (unidad === "$") return `$${v.toFixed(4)}`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
function delta(a, b, unidad) {
  if (a == null || b == null) return "";
  const d = a - b;
  if (Math.abs(d) < 1e-9) return " (=)";
  return ` (${d > 0 ? "+" : "−"}${fmt(Math.abs(d), unidad)})`;
}

/**
 * El informe en Markdown. SOLO números: va a un issue de un repo público.
 * @param {{ actual: object, anterior: object|null, objetivos: object, huecos?: Record<string, number>|null, desde: string, hasta: string }} p
 */
export function informe({ actual, anterior, objetivos, huecos = null, desde, hasta }) {
  const s = semaforo(actual, objetivos);
  const sa = anterior ? semaforo(anterior, objetivos) : [];
  const mal = s.filter((x) => x.ok === false);
  const icono = (ok) => (ok === true ? "✅" : ok === false ? "❌" : "⚪");
  const l = [];
  l.push(`## Lola — semana del ${desde} al ${hasta}`);
  l.push("");
  l.push(`${actual.uso.turnos} turnos${actual.uso.chats ? ` en ${actual.uso.chats} chats` : ""} · ${fmt(actual.uso.rapidaPct, "%")} por la vía rápida${anterior ? ` · semana anterior: ${anterior.uso.turnos} turnos` : ""}`);
  l.push("");
  l.push(mal.length ? `**${mal.length} objetivo(s) sin cumplir:** ${mal.map((x) => x.nombre).join(", ")}.` : "Todos los objetivos medidos se cumplen.");
  l.push("");
  l.push("| | Medida | Esta semana | Objetivo | Cambio |");
  l.push("|---|---|---|---|---|");
  for (const [i, x] of s.entries()) {
    l.push(`| ${icono(x.ok)} | ${x.nombre} | ${fmt(x.valor, x.unidad)} | ${x.limite == null ? "sin fijar" : `≤ ${fmt(x.limite, x.unidad)}`} | ${delta(x.valor, sa[i]?.valor, x.unidad).trim() || "—"} |`);
  }
  l.push("");
  l.push("<details><summary>Más detalle</summary>");
  l.push("");
  l.push(`- Primer texto p50: vía rápida ${fmt(actual.latencia.primerTextoRapidaP50Ms, "ms")}, Lola ${fmt(actual.latencia.primerTextoLolaP50Ms, "ms")} · enrutador p50 ${fmt(actual.latencia.enrutadorP50Ms, "ms")}`);
  l.push(`- Lola: ${fmt(actual.calidad.vueltasMedia)} llamadas al modelo por turno · supervisor frenó ${actual.calidad.supervisor} · fallos de herramienta ${actual.calidad.fallosHerramienta} · errores ${actual.calidad.errores}`);
  l.push(`- Búsqueda de recetas: ${actual.busqueda.n} búsquedas · vacías ${fmt(actual.busqueda.vaciasPct, "%")} · parecido p10 ${fmt(actual.busqueda.parecidoP10)} / p50 ${fmt(actual.busqueda.parecidoP50)}${objetivos.busquedaParecidoMinimo == null ? " (sin umbral de «floja» todavía: se fija mirando esta distribución)" : ""}`);
  l.push(`- Coste total: ${fmt(actual.coste.totalUsd, "$")}`);
  l.push("");
  l.push("</details>");
  if (huecos) {
    l.push("");
    l.push(`**Huecos detectados:** ${Object.entries(huecos).map(([k, n]) => `${k} ${n}`).join(" · ") || "ninguno"}. Se revisan en local con \`node scripts/lola-feedback.mjs --sugerir\` (los textos no salen de la base de datos).`);
  }
  return l.join("\n");
}

// ── Huecos ──────────────────────────────────────────────────────────────────

/**
 * Los turnos sospechosos de Lola, con su texto (solo en local: el texto se
 * borra a los 15 días y nunca va a GitHub). Lo del enrutador lo saca
 * scripts/router-feedback.mjs; aquí, lo que es de Lola.
 * `sinTexto`: cuenta también los que ya no tienen texto (la vista del
 * workflow no lo trae), para el recuento del informe.
 * @returns {{ texto: string|null, ultima: string|null, motivos: string[], cuando: string, extra?: object }[]}
 */
export function huecosDeLola(eventos, objetivos = {}, { sinTexto = false } = {}) {
  const corr = corregidos(eventos);
  const minimo = objetivos.busquedaParecidoMinimo;
  const lento = objetivos.turnoLolaP95Ms;
  const huecos = [];
  const anadir = (e, motivo, extra) => {
    if (!e.m?.texto && !sinTexto) return;
    huecos.push({ texto: e.m?.texto ?? null, ultima: e.m.ultima ?? null, motivos: [motivo], cuando: e.created_at, ...(extra ? { extra } : {}) });
  };
  for (const e of eventos) {
    if (e.event === "bot_route" && !e.m?.sombra && !e.m?.rapida) {
      if (corr.has(e)) anadir(e, "corregida");
      if (Number.isFinite(lento) && e.m.ms > lento) anadir(e, "lenta", { ms: e.m.ms, herramientas: e.m.lola?.herramientas ?? null });
      if (e.m.lola?.planB) anadir(e, "plan B");
    }
    if (e.event === "bot_not_understood") anadir(e, "no entiende");
    if (e.event === "bot_supervisor") anadir(e, "supervisor", { herramienta: e.m.herramienta });
    if (e.event === "bot_claimed_unsaved") anadir(e, "dijo que guardó");
    if (e.event === "bot_busqueda" && (e.m.n === 0 || (Number.isFinite(minimo) && e.m.via === "vectores" && e.m.parecido < minimo))) {
      anadir(e, e.m.n === 0 ? "búsqueda vacía" : "búsqueda floja", { via: e.m.via, parecido: e.m.parecido });
    }
  }
  // Un mismo texto con varios motivos, una sola vez.
  const porTexto = new Map();
  for (const [i, h] of huecos.entries()) {
    const k = h.texto ? normal(h.texto) : `#${i}`;
    const ya = porTexto.get(k);
    if (ya) ya.motivos = [...new Set([...ya.motivos, ...h.motivos])];
    else porTexto.set(k, h);
  }
  return [...porTexto.values()];
}

/** Cuántos huecos por motivo (lo único de los huecos que va al informe). */
export function contarHuecos(huecos) {
  const n = {};
  for (const h of huecos) for (const m of h.motivos) n[m] = (n[m] ?? 0) + 1;
  return n;
}

export const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[¿?¡!.,]/g, "").trim();
