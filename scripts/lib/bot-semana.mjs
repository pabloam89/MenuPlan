/**
 * Las cuentas de la mejora semanal de Lola, sin base de datos: reciben los
 * eventos del bot (user_events, event like 'bot_%') y devuelven medidas,
 * semáforo e informe. Las usan scripts/bot-semanal.mjs (el informe),
 * scripts/lola-feedback.mjs (los huecos) y scripts/bot-medidas.mjs (precios).
 *
 * Un evento es { created_at, event, m } con m = metadata. Sirve igual con
 * texto (local, .env.local) que sin él (la vista ops.bot_events del workflow).
 */

import { esCorreccionMedida } from "../../api/_bot/senales.js";
import { ORIGEN_PESADO } from "../../api/_bot/medidaTurno.js";
import { PRECIOS as PRECIOS_BASE } from "./evals.mjs";

// USD por millón de tokens. Los precios viven en UN sitio (PRECIOS de
// scripts/lib/evals.mjs); aquí solo se reordenan por nombre. Escribir caché
// cuesta 1,25× la entrada a 5 min y 2× a 1 h (#909: antes todo iba a 1,25× y
// el coste de Lola salía ~0,002 $/turno corto). Lola escribe casi todo a 1 h
// (CACHE_FIJA), el enrutador a 5 min. Se aplican al leer, no al apuntar.
export const PRECIOS = Object.fromEntries(
  Object.entries(PRECIOS_BASE).map(([k, [i, o, cr, cw, cw1h]]) => [k, { in: i, out: o, cr, cw, cw1h }]),
);
export const precioDe = (modelo = "") => PRECIOS[Object.keys(PRECIOS).find((k) => String(modelo).includes(k)) ?? "sonnet"];
/** Coste de un uso {in,out,cr,cw}. `ttl`: «1h» (Lola, por defecto) o «5m» (enrutador). */
export const usd = (u, p, { ttl = "1h" } = {}) =>
  u ? ((u.in ?? 0) * p.in + (u.out ?? 0) * p.out + (u.cr ?? 0) * p.cr + (u.cw ?? 0) * (ttl === "5m" ? p.cw : p.cw1h)) / 1e6 : 0;

/** Percentil p (0-100) de los números finitos de xs; null si no hay ninguno. */
export function pct(xs, p) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))];
}

const tanto = (n, de) => (de ? (100 * n) / de : null);
const suma = (xs) => xs.reduce((a, x) => a + (Number(x) || 0), 0);

/**
 * Lo que esperó el turno por las herramientas de Lola. Desde #910 el bot
 * apunta el tiempo de reloj (`lola.herramientas_reloj_ms`: las lecturas a la
 * vez y las escrituras en fila no se suman). Las filas anteriores solo traen
 * lo que duró cada una, y sumarlas cuenta de más en cuanto hay escrituras en
 * fila (la que espera su turno lleva dentro la espera de las anteriores, desde
 * ac4bdcc3, 2 oct 2026): para ellas la suma es una cota por arriba.
 */
export const herramientasMs = (lola) => lola.herramientas_reloj_ms ?? suma((lola.herramientas ?? []).map(([, ms]) => ms));
/** Lo que tardaron las llamadas al modelo: el tiempo de sus llamadas menos las herramientas que corren entre ellas. */
export const modeloMs = (lola) => Math.max(0, suma((lola.llamadas ?? []).map(([ms]) => ms)) - herramientasMs(lola));

/**
 * Lo que costó la llamada de Lola que se canceló (ganó la vía rápida), en USD.
 * Con el uso real si el turno lo trae (`lola.uso`: acabó antes de cortarla;
 * `lola_cancelada_uso`: lo que llevaba pagado al cortarla) y, si no, la
 * estimación con la mediana de la primera llamada de los turnos que sí acabaron.
 * @returns {{ usd: number, estimado: boolean }}
 */
export function costeDeCancelada(m, estimada) {
  if (m.lola?.uso) return { usd: usd(m.lola.uso, precioDe(m.lola.modelo)), estimado: false };
  if (m.lola_cancelada_uso) return { usd: usd(m.lola_cancelada_uso, PRECIOS.sonnet), estimado: false };
  return { usd: usd(estimada, PRECIOS.sonnet), estimado: true };
}
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
    const corrige = sig.m.modo === "deshacer" || (sig.m.corrige ?? esCorreccionMedida(sig.m.texto, sig.m.ultima));
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
  // El alta, las fotos y los PDF (bot_route sin_enrutador, desde #910) son
  // trabajo distinto de un mensaje de texto: se miden aparte para no mezclar un
  // PDF de 20 s con los p95 de los turnos de texto, que es lo que tiene objetivo.
  const pesados = deLola.filter((e) => ORIGEN_PESADO.has(e.m.sin_enrutador));
  const deTexto = deLola.filter((e) => !ORIGEN_PESADO.has(e.m.sin_enrutador));
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
  // Las canceladas, aparte: cuántas, con qué uso (medido al cortar o estimado) y cuánto.
  const canceladas = { n: 0, medidas: 0, estimadas: 0, usd: 0 };
  for (const { m } of conMedida) {
    coste += usd(m.router_uso, PRECIOS.haiku, { ttl: "5m" });
    if (m.lola_cancelada) {
      const c = costeDeCancelada(m, estimada);
      coste += c.usd;
      canceladas.n++;
      canceladas[c.estimado ? "estimadas" : "medidas"]++;
      canceladas.usd += c.usd;
    } else if (m.lola?.uso) coste += usd(m.lola.uso, precioDe(m.lola.modelo));
  }

  // Dónde se va el tiempo de Lola (lola.llamadas, desde el 3 oct 2026): el
  // modelo es lo que tardan sus llamadas menos las herramientas que corren
  // entre ellas; el resto del turno (enrutador, cargar la casa, Telegram) es
  // lo que queda hasta `ms`.
  const conLlamadas = deTexto.filter((e) => e.m.lola && Array.isArray(e.m.lola.llamadas) && e.m.lola.llamadas.length);
  const llamadas = conLlamadas.flatMap((e) => e.m.lola.llamadas);
  // De los turnos que llamaron a alguna herramienta, cuántos traen el tiempo de reloj (el resto, la suma).
  const conHerramientas = conLlamadas.filter((e) => (e.m.lola.herramientas ?? []).length > 0);
  const conReloj = conHerramientas.filter((e) => e.m.lola.herramientas_reloj_ms != null).length;
  // Lo que cada turno esperó en la cola de su chat, y el import del motor en frío.
  const esperasCola = turnos.map((e) => e.m.espera_cola_ms);
  const motorFrio = turnos.map((e) => e.m.motor_frio).filter(Number.isFinite);
  // De dónde vino cada turno: el enrutador, o el motivo por el que Lola contestó sin él.
  const porOrigen = {};
  for (const e of turnos) { const o = e.m.sin_enrutador ?? "enrutador"; porOrigen[o] = (porOrigen[o] ?? 0) + 1; }

  const busquedas = eventos.filter((e) => e.event === "bot_busqueda");
  const porVector = busquedas.filter((e) => e.m.via === "vectores" && Number.isFinite(e.m.parecido));
  const minimo = objetivos.busquedaParecidoMinimo;
  const flojas = busquedas.filter((e) => e.m.n === 0 || (Number.isFinite(minimo) && e.m.via === "vectores" && e.m.parecido < minimo));

  return {
    uso: {
      turnos: turnos.length,
      rapidaPct: tanto(rapidas.length, turnos.length),
      chats: new Set(turnos.map((e) => e.m.chat).filter(Boolean)).size || null,
      // Lector: «Más detalle» del informe. Cuántos turnos por origen (bot_route sin_enrutador).
      porOrigen,
      // Lola cancelada porque ganó la vía rápida: % de los turnos y, en coste.canceladas, cuánto cuesta.
      canceladasPct: tanto(canceladas.n, turnos.length),
      // Turnos en que un import del motor (core.mjs, ~10 MB) cayó dentro del turno.
      motorFrioN: motorFrio.length,
    },
    latencia: {
      primerTextoRapidaP50Ms: pct(rapidas.map((e) => e.m.primer_ms ?? e.m.ms), 50),
      primerTextoRapidaP95Ms: pct(rapidas.map((e) => e.m.primer_ms ?? e.m.ms), 95),
      primerTextoLolaP50Ms: pct(deTexto.map((e) => e.m.primer_ms), 50),
      primerTextoLolaP95Ms: pct(deTexto.map((e) => e.m.primer_ms), 95),
      turnoLolaP95Ms: pct(deTexto.map((e) => e.m.ms), 95),
      // El alta, las fotos y los PDF, aparte (lector: «Más detalle»).
      adjuntosYAltasP50Ms: pct(pesados.map((e) => e.m.ms), 50),
      adjuntosYAltasP95Ms: pct(pesados.map((e) => e.m.ms), 95),
      // Lo que el mensaje esperó en la cola de su chat antes de que empezara su turno
      // (bot_route espera_cola_ms): un PDF o un turno largo delante lo dejan en silencio.
      esperaColaP50Ms: pct(esperasCola, 50),
      esperaColaP95Ms: pct(esperasCola, 95),
      // La de las fotos y los PDF es otra cosa: solo el candado del chat, sin la ráfaga de 1 s
      // (bot_route espera_candado_ms). No se mezcla con la de arriba.
      esperaCandadoP50Ms: pct(turnos.map((e) => e.m.espera_candado_ms), 50),
      esperaCandadoP95Ms: pct(turnos.map((e) => e.m.espera_candado_ms), 95),
      // El primer import del motor en frío, cuando cae dentro de un turno (bot_route motor_frio).
      motorFrioP50Ms: pct(motorFrio, 50),
      enrutadorP50Ms: pct(turnos.map((e) => e.m.router_ms), 50),
      // Lo que tarda el turno en poder arrancar al enrutador y a Lola.
      contextoP50Ms: pct(turnos.map((e) => e.m.contexto_ms), 50),
      // Desglose de los turnos de Lola (null hasta que haya turnos con llamadas).
      modeloP50Ms: pct(conLlamadas.map((e) => modeloMs(e.m.lola)), 50),
      // De reloj desde #910; en las filas viejas, la suma (herramientasMs). `herramientasRelojN`: cuántas ya son de reloj.
      herramientasP50Ms: pct(conLlamadas.map((e) => herramientasMs(e.m.lola)), 50),
      herramientasRelojN: conReloj,
      herramientasN: conHerramientas.length,
      restoP50Ms: pct(conLlamadas.map((e) => Math.max(0, e.m.ms - suma(e.m.lola.llamadas.map(([ms]) => ms)))), 50),
      tokensSalidaPorLlamadaP50: pct(llamadas.map(([, out]) => out), 50),
      primerTrozoP50Ms: pct(llamadas.map(([, , t]) => t), 50),
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
      // La Lola especulativa cortada: n, con uso medido al cortar o acabado, con uso estimado, y su coste.
      canceladas,
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

// ── Privado o grupo ─────────────────────────────────────────────────────────
// Dónde ocurre cada evento: en un chat de dos (privado) o en un grupo de
// Telegram, donde escriben varios, la vía rápida está más limitada (router.js
// POLITICA.enGrupo) y Lola tiene que saber a quién contesta. Lo apunta el bot
// en `esGrupo` (bot_route desde el 1 oct 2026; el resto de eventos y los
// atajos, desde el 3 oct). Sin el dato, «sinDato»: nunca se supone.

/** "grupo" | "privado" | null (el evento no dice dónde fue). */
export const lugarDe = (e) => (e?.m?.esGrupo === true ? "grupo" : e?.m?.esGrupo === false ? "privado" : null);

/** Los eventos repartidos por dónde ocurrieron. */
export function porLugar(eventos) {
  const r = { privado: [], grupo: [], sinDato: [] };
  for (const e of eventos) r[lugarDe(e) ?? "sinDato"].push(e);
  return r;
}

/** Las medidas de cada lugar, y cuántos eventos no dicen dónde fueron. */
export function medirPorLugar(eventos, objetivos = {}) {
  const l = porLugar(eventos);
  const grupo = medir(l.grupo, objetivos);
  const turnosGrupo = turnosDe(l.grupo);
  return {
    privado: medir(l.privado, objetivos),
    // En grupo, además: cuántos turnos tenían a más de una persona escribiendo.
    grupo: { ...grupo, uso: { ...grupo.uso, variosAutoresPct: tanto(turnosGrupo.filter((e) => e.m.variosAutores).length, turnosGrupo.length) } },
    sinDato: l.sinDato.length,
  };
}

/**
 * El informe en Markdown. SOLO números: va a un issue de un repo público.
 * @param {{ actual: object, anterior: object|null, objetivos: object, huecos?: Record<string, number>|null, lugares?: ReturnType<typeof medirPorLugar>|null, desde: string, hasta: string }} p
 */
export function informe({ actual, anterior, objetivos, huecos = null, lugares = null, desde, hasta }) {
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
  if (lugares && (lugares.privado.uso.turnos || lugares.grupo.uso.turnos)) {
    const { privado: p, grupo: g } = lugares;
    const fila = (nombre, ruta, unidad) => {
      const v = (m) => ruta.split(".").reduce((x, k) => x?.[k], m);
      return `| ${nombre} | ${fmt(v(p), unidad)} | ${fmt(v(g), unidad)} |`;
    };
    l.push("");
    l.push("**Privado frente a grupo**");
    l.push("");
    l.push("| Medida | Privado | Grupo |");
    l.push("|---|---|---|");
    l.push(fila("Turnos", "uso.turnos"));
    l.push(fila("Chats", "uso.chats"));
    l.push(fila("Por la vía rápida", "uso.rapidaPct", "%"));
    l.push(fila("Primer texto, vía rápida (p95)", "latencia.primerTextoRapidaP95Ms", "ms"));
    l.push(fila("Primer texto, Lola (p50)", "latencia.primerTextoLolaP50Ms", "ms"));
    l.push(fila("Primer texto, Lola (p95)", "latencia.primerTextoLolaP95Ms", "ms"));
    l.push(fila("Turno entero, Lola (p95)", "latencia.turnoLolaP95Ms", "ms"));
    l.push(fila("Turnos corregidos", "calidad.corregidasPct", "%"));
    l.push(fila("Dijo que guardó sin guardar", "calidad.dijoQueGuardo"));
    l.push(fila("Fallos de herramienta", "calidad.fallosHerramienta"));
    l.push(fila("Coste por turno", "coste.porTurnoUsd", "$"));
    l.push(`| Turnos con varias personas escribiendo | — | ${fmt(g.uso.variosAutoresPct, "%")} |`);
    if (lugares.sinDato) l.push(`\nEventos que no dicen dónde ocurrieron (de antes del 3 oct 2026), fuera de las dos columnas: ${lugares.sinDato}.`);
  }
  l.push("");
  l.push("<details><summary>Más detalle</summary>");
  l.push("");
  l.push(`- Primer texto p50: vía rápida ${fmt(actual.latencia.primerTextoRapidaP50Ms, "ms")}, Lola ${fmt(actual.latencia.primerTextoLolaP50Ms, "ms")} · enrutador p50 ${fmt(actual.latencia.enrutadorP50Ms, "ms")} · arranque del turno p50 ${fmt(actual.latencia.contextoP50Ms, "ms")}`);
  if (actual.latencia.modeloP50Ms != null) {
    const { herramientasRelojN: nReloj, herramientasN: nHerr } = actual.latencia;
    const reloj = !nHerr ? "" : nReloj >= nHerr ? " (de reloj)" : ` (de reloj en ${nReloj} de ${nHerr} turnos con herramientas, el resto sumadas)`;
    l.push(`- Dónde se va el tiempo de Lola (p50 por turno): modelo ${fmt(actual.latencia.modeloP50Ms, "ms")} · herramientas ${fmt(actual.latencia.herramientasP50Ms, "ms")}${reloj} · resto ${fmt(actual.latencia.restoP50Ms, "ms")} · ${fmt(actual.latencia.tokensSalidaPorLlamadaP50)} tokens de salida por llamada · primer trozo de texto a ${fmt(actual.latencia.primerTrozoP50Ms, "ms")} de empezar la llamada`);
  }
  l.push(`- Lola: ${fmt(actual.calidad.vueltasMedia)} llamadas al modelo por turno · supervisor frenó ${actual.calidad.supervisor} · fallos de herramienta ${actual.calidad.fallosHerramienta} · errores ${actual.calidad.errores}`);
  l.push(`- Búsqueda de recetas: ${actual.busqueda.n} búsquedas · vacías ${fmt(actual.busqueda.vaciasPct, "%")} · parecido p10 ${fmt(actual.busqueda.parecidoP10)} / p50 ${fmt(actual.busqueda.parecidoP50)}${objetivos.busquedaParecidoMinimo == null ? " (sin umbral de «floja» todavía: se fija mirando esta distribución)" : ""}`);
  l.push(`- Coste total: ${fmt(actual.coste.totalUsd, "$")}`);
  l.push("- «Turnos corregidos» usa desde #910 el criterio estrecho (esCorreccionMedida); las filas anteriores traen el corrige del criterio viejo, más amplio: la serie se parte ahí, no comparar tal cual con semanas anteriores.");
  const c = actual.coste.canceladas;
  if (c?.n) l.push(`- Lola especulativa cancelada (ganó la vía rápida): ${fmt(actual.uso.canceladasPct, "%")} de los turnos · ${c.medidas} con uso medido, ${c.estimadas} estimados · ${fmt(c.usd, "$")} (${fmt(c.usd / c.n, "$")} cada una)`);
  const origenes = Object.entries(actual.uso.porOrigen ?? {}).filter(([o]) => o !== "enrutador").sort((a, b) => b[1] - a[1]);
  if (origenes.length) l.push(`- Turnos sin pasar por el enrutador: ${origenes.map(([o, n]) => `${o} ${n}`).join(" · ")}${actual.latencia.adjuntosYAltasP95Ms != null ? ` · alta, fotos y PDF (aparte de los p95 de arriba): p50 ${fmt(actual.latencia.adjuntosYAltasP50Ms, "ms")}, p95 ${fmt(actual.latencia.adjuntosYAltasP95Ms, "ms")}` : ""}`);
  if (actual.latencia.esperaCandadoP50Ms != null) l.push(`- Espera de fotos y PDF por el candado del chat (sin la ráfaga de 1 s): p50 ${fmt(actual.latencia.esperaCandadoP50Ms, "ms")} · p95 ${fmt(actual.latencia.esperaCandadoP95Ms, "ms")}`);
  if (actual.latencia.esperaColaP50Ms != null) l.push(`- Espera de los mensajes de texto en la cola del chat (incluye la ráfaga de 1 s): p50 ${fmt(actual.latencia.esperaColaP50Ms, "ms")} · p95 ${fmt(actual.latencia.esperaColaP95Ms, "ms")}`);
  if (actual.uso.motorFrioN) l.push(`- Motor en frío (import de core.mjs dentro del turno): ${actual.uso.motorFrioN} turnos · p50 ${fmt(actual.latencia.motorFrioP50Ms, "ms")}`);
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
    huecos.push({ texto: e.m?.texto ?? null, ultima: e.m.ultima ?? null, motivos: [motivo], cuando: e.created_at, lugar: lugarDe(e), ...(extra ? { extra } : {}) });
  };
  for (const e of eventos) {
    if (e.event === "bot_route" && !e.m?.sombra && !e.m?.rapida) {
      if (corr.has(e)) anadir(e, "corregida");
      if (Number.isFinite(lento) && e.m.ms > lento && !ORIGEN_PESADO.has(e.m.sin_enrutador)) anadir(e, "lenta", { ms: e.m.ms, herramientas: e.m.lola?.herramientas ?? null });
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
