#!/usr/bin/env node
/**
 * El vigía de Lola (#267): una pasada cada 15 min desde GitHub Actions
 * (.github/workflows/vigia-lola.yml).
 *
 *   1. Lee las líneas `bot_fallo` de producción de los últimos minutos (las
 *      mismas que cuenta `npm run fallos`) y las pasa por las reglas de
 *      src/lib/vigia.js: un incidente se abre al pasar un umbral y se cierra
 *      cuando se calma. Un aviso al abrir y otro al cerrar, no uno por fallo.
 *   2. Llama al canario (api/bot/canario.js): salud en cada pasada, un turno
 *      con modelo cada pocas horas. Dos pasadas seguidas fallando abren
 *      incidente; una buena lo cierra.
 *   3. Una vez al día, a partir de las 9 de Madrid, el resumen con las cifras.
 *   4. Si ha habido un hueco sin pasadas, lo dice (`vigia_parado`).
 *
 * El estado (incidentes abiertos, cuándo fue la última pasada) va en un JSON
 * que el workflow guarda en la caché de Actions entre pasadas: sin tabla. Si
 * la caché se pierde, lo peor es un aviso repetido.
 *
 *   node scripts/vigia.mjs                        una pasada de verdad
 *   node scripts/vigia.mjs --fichero logs.jsonl   con un export de logs (prueba local)
 *   node scripts/vigia.mjs --ahora 2026-10-09T10:00:00Z
 *   node scripts/vigia.mjs --estado ruta.json     (por defecto .vigia/estado.json)
 *   node scripts/vigia.mjs --sin-canario          no llama al canario
 *   node scripts/vigia.mjs --seco                 no manda nada a Telegram, solo el log
 *
 * Del entorno: VERCEL_TOKEN (leer los logs), CANARIO_URL y BOT_CRON_SECRET
 * (el canario), AVISOS_TELEGRAM_TOKEN y AVISOS_TELEGRAM_CHAT (el grupo de
 * avisos) y GITHUB_SERVER_URL, GITHUB_REPOSITORY y GITHUB_RUN_ID (el enlace
 * al run). Sin el token de avisos (plan B) todo sigue igual y el aviso sale
 * solo en el log.
 *
 * Ningún aviso lleva datos de familias: cifras, motivos y sitios de los
 * vocabularios cerrados, y enlaces. El texto de los fallos «otro» no sale
 * nunca de aquí. Cada aviso deja una línea `vigia_aviso` para contarlos.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { fallosDe, paginar, tandaDeVercel } from "./bot-fallos.mjs";
import { VIGIA, minutosALeer } from "../src/lib/vigia.js";
import { MOTIVOS_FALLO, SITIOS_FALLO, TIPOS_AVISO_VIGIA, CHEQUEOS_CANARIO, MOTIVOS_CANARIO } from "../src/lib/vocabularios.js";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
/** Lo que se guarda de historia para el resumen: algo más de un día. */
const HISTORIA_MS = 26 * HORA;

/** Las claves de incidente que no son reglas de fallos. */
export const CLAVES_PROPIAS = ["canario", "canario_modelo", "logs"];

export function estadoVacio() {
  return {
    version: 1,
    ultimaVez: null,
    abiertos: {},
    seguidos: {},
    ultimoModelo: null,
    ultimoResumen: null,
    pendientes: [],
    historia: { pasadas: [], canario: [], incidentes: [] },
  };
}

/** El estado guardado, completado con lo que le falte (una versión vieja, un JSON roto). */
export function normalizarEstado(e) {
  const v = estadoVacio();
  if (!e || typeof e !== "object" || e.version !== 1) return v;
  return { ...v, ...e, historia: { ...v.historia, ...(e.historia ?? {}) } };
}

const sitioLimpio = (s) => (SITIOS_FALLO.includes(s) ? s : "sin_sitio");
const motivoLimpio = (m) => (MOTIVOS_FALLO.includes(m) ? m : "otro");

/** Los fallos que cuenta una regla entre dos instantes. */
function deLaRegla(fallos, regla, desde, hasta) {
  return fallos.filter((f) => typeof f.ts === "number" && f.ts > desde && f.ts <= hasta
    && regla.motivos.includes(motivoLimpio(f.motivo)) && (!regla.soloGraves || f.grave));
}

/** Los tres sitios con más fallos, de mayor a menor. */
function sitiosTop(fallos, n = 3) {
  const c = {};
  for (const f of fallos) c[sitioLimpio(f.donde)] = (c[sitioLimpio(f.donde)] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([s]) => s);
}

/**
 * Las reglas de fallos: qué incidentes se abren, cuáles se cierran y cuáles
 * siguen. Pura.
 * @returns {{ avisos: object[], abiertos: object, cerrados: object[] }}
 */
export function evaluarReglas({ fallos, ahora, reglas = VIGIA.reglas, abiertos = {} }) {
  const avisos = [];
  const cerrados = [];
  const siguen = { ...abiertos };
  for (const r of reglas) {
    const enVentana = deLaRegla(fallos, r, ahora - r.ventanaMin * MIN, ahora);
    const enCalma = deLaRegla(fallos, r, ahora - r.calmaMin * MIN, ahora).length;
    const abierto = siguen[r.clave];
    if (!abierto && enVentana.length >= r.abrirDesde) {
      siguen[r.clave] = { tipo: "fallos", desde: ahora, pico: enVentana.length };
      avisos.push({ tipo: "incidente_abierto", clave: r.clave, n: enVentana.length, ventanaMin: r.ventanaMin, umbral: r.abrirDesde, sitios: sitiosTop(enVentana), motivos: r.motivos });
    } else if (abierto && enCalma < r.cerrarBajoDe) {
      delete siguen[r.clave];
      cerrados.push({ clave: r.clave, desde: abierto.desde, hasta: ahora });
      avisos.push({ tipo: "incidente_resuelto", clave: r.clave, duroMin: Math.round((ahora - abierto.desde) / MIN), pico: abierto.pico, ventanaMin: r.ventanaMin, motivos: r.motivos });
    } else if (abierto) {
      siguen[r.clave] = { ...abierto, pico: Math.max(abierto.pico ?? 0, enVentana.length) };
    }
  }
  return { avisos, abiertos: siguen, cerrados };
}

/**
 * Una comprobación que se repite cada pasada (el canario, la lectura de logs):
 * abre incidente tras `fallosParaAbrir` fallos seguidos y lo cierra con el
 * primer acierto. Pura.
 * @param {{ ok: boolean, fallan?: object[] }} resultado
 */
export function evaluarSeguidos({ clave, resultado, ahora, estado, fallosParaAbrir = VIGIA.canario.fallosParaAbrir }) {
  const abiertos = { ...estado.abiertos };
  const seguidos = { ...estado.seguidos };
  const avisos = [];
  const cerrados = [];
  const abierto = abiertos[clave];
  if (resultado.ok) {
    seguidos[clave] = 0;
    if (abierto) {
      delete abiertos[clave];
      cerrados.push({ clave, desde: abierto.desde, hasta: ahora });
      avisos.push({ tipo: "incidente_resuelto", clave, duroMin: Math.round((ahora - abierto.desde) / MIN) });
    }
  } else {
    seguidos[clave] = (seguidos[clave] ?? 0) + 1;
    if (!abierto && seguidos[clave] >= fallosParaAbrir) {
      abiertos[clave] = { tipo: clave, desde: ahora, fallan: resultado.fallan ?? [] };
      avisos.push({ tipo: "incidente_abierto", clave, seguidos: seguidos[clave], fallan: resultado.fallan ?? [] });
    }
  }
  return { avisos, estado: { ...estado, abiertos, seguidos }, cerrados };
}

/** ¿Toca el turno con modelo del canario en esta pasada? */
export function tocaModelo(estado, ahora, config = VIGIA) {
  const ultimo = estado.ultimoModelo;
  if (!ultimo) return true;
  const desde = ahora - ultimo;
  // Margen de media pasada: los cron de GitHub no llegan siempre en punto.
  const margen = (config.cadaMin / 2) * MIN;
  // Falló una vez: se confirma en la pasada siguiente, sin esperar horas.
  if ((estado.seguidos?.canario_modelo ?? 0) > 0 && !estado.abiertos?.canario_modelo) return true;
  // Con el incidente abierto, cada hora: para saber pronto que ha vuelto.
  if (estado.abiertos?.canario_modelo) return desde >= HORA - margen;
  return desde >= config.canario.modeloCadaHoras * HORA - margen;
}

const enMadrid = (ms, opciones) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", ...opciones }).format(new Date(ms));
const fechaMadrid = (ms) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date(ms));
const horaMadrid = (ms) => enMadrid(ms, { hour: "2-digit", minute: "2-digit", hour12: false });

/** ¿Toca el resumen diario? La primera pasada desde la hora del resumen, una vez por día de Madrid. */
export function tocaResumen(estado, ahora, config = VIGIA) {
  const hoy = fechaMadrid(ahora);
  const hora = Number(enMadrid(ahora, { hour: "2-digit", hour12: false }));
  return hora >= config.resumen.horaMadrid && estado.ultimoResumen !== hoy;
}

/** El resumen diario a partir de los fallos de las últimas 24 h y de la historia guardada. Pura. */
export function resumenDiario({ fallos, ahora, estado, config = VIGIA, logs = "ok" }) {
  const dia = fallos.filter((f) => typeof f.ts === "number" && f.ts > ahora - DIA && f.ts <= ahora);
  const porMotivo = {};
  for (const f of dia) porMotivo[motivoLimpio(f.motivo)] = (porMotivo[motivoLimpio(f.motivo)] ?? 0) + 1;
  const h = estado.historia;
  const canario = h.canario.filter((c) => c.t > ahora - DIA);
  const tokens = canario.reduce((s, c) => s + (c.tokens ?? 0), 0);
  const usd = canario.reduce((s, c) => s + (c.usd ?? 0), 0);
  return {
    tipo: "resumen_diario",
    fecha: fechaMadrid(ahora),
    logs,
    total: dia.length,
    graves: dia.filter((f) => f.grave).length,
    porMotivo: Object.entries(porMotivo).sort((a, b) => b[1] - a[1]),
    sitios: sitiosTop(dia.filter((f) => f.grave)),
    incidentes: h.incidentes.filter((i) => i.desde > ahora - DIA).length,
    abiertos: Object.keys(estado.abiertos),
    canarioSalud: { ok: canario.filter((c) => c.nivel === "salud" && c.ok).length, total: canario.filter((c) => c.nivel === "salud").length },
    canarioModelo: { ok: canario.filter((c) => c.nivel === "modelo" && c.ok).length, total: canario.filter((c) => c.nivel === "modelo").length },
    canarioUsd: Math.round(usd * 1000) / 1000,
    canarioTokens: tokens,
    pasadas: h.pasadas.filter((t) => t > ahora - DIA).length,
    esperadas: Math.round(DIA / (config.cadaMin * MIN)),
  };
}

/**
 * Una pasada entera, sin tocar nada de fuera: con lo leído (fallos, canario)
 * y el estado anterior, qué avisos salen y cuál es el estado nuevo. Pura.
 * @param {{ ahora: number, fallos: object[] | null, logs: "ok" | "sin_configurar" | string,
 *   canario: { salud?: object | null, modelo?: object | null }, estado: object, config?: object }} p
 *   `fallos` null: no se han podido leer (`logs` dice por qué).
 */
export function pasada({ ahora, fallos, logs = "ok", canario = {}, estado: anterior, config = VIGIA }) {
  let estado = normalizarEstado(anterior);
  const avisos = [];
  const cerrados = [];
  // 1. El latido: un hueco largo desde la última pasada.
  if (estado.ultimaVez && ahora - estado.ultimaVez > config.huecoMin * MIN) {
    avisos.push({ tipo: "vigia_parado", desde: estado.ultimaVez, hasta: ahora, minutos: Math.round((ahora - estado.ultimaVez) / MIN) });
  }
  // 2. Los logs: sin poder leerlos, el vigía está ciego, y eso es un incidente.
  if (fallos) {
    const r = evaluarReglas({ fallos, ahora, reglas: config.reglas, abiertos: estado.abiertos });
    avisos.push(...r.avisos);
    cerrados.push(...r.cerrados);
    estado = { ...estado, abiertos: r.abiertos };
  }
  const deLogs = evaluarSeguidos({
    clave: "logs", ahora, estado,
    resultado: fallos ? { ok: true } : { ok: false, fallan: [{ chequeo: "logs", motivo: logs }] },
    // Sin configurar (falta el token de Vercel) no es un tropiezo: se dice ya.
    fallosParaAbrir: logs === "sin_configurar" ? 1 : config.canario.fallosParaAbrir,
  });
  avisos.push(...deLogs.avisos);
  cerrados.push(...deLogs.cerrados);
  estado = deLogs.estado;
  // 3. El canario.
  const historiaCanario = [];
  for (const [nivel, clave] of [["salud", "canario"], ["modelo", "canario_modelo"]]) {
    const res = canario[nivel];
    if (nivel === "modelo" && res !== undefined) estado = { ...estado, ultimoModelo: ahora };
    if (!res || res.omitido) continue;
    const fallan = (res.chequeos ?? []).filter((c) => !c.ok).map((c) => ({ chequeo: c.chequeo, motivo: c.motivo }));
    const r = evaluarSeguidos({ clave, ahora, estado, resultado: { ok: Boolean(res.ok) && !fallan.length, fallan }, fallosParaAbrir: config.canario.fallosParaAbrir });
    avisos.push(...r.avisos);
    cerrados.push(...r.cerrados);
    estado = r.estado;
    historiaCanario.push({ t: ahora, nivel, ok: Boolean(res.ok) && !fallan.length, ...(res.tokens ? { tokens: res.tokens } : {}), ...(res.usd ? { usd: res.usd } : {}) });
  }
  // 4. La historia, recortada, y el resumen si toca.
  const corte = ahora - HISTORIA_MS;
  const h = estado.historia;
  estado = {
    ...estado,
    ultimaVez: ahora,
    historia: {
      pasadas: [...h.pasadas.filter((t) => t > corte), ahora],
      canario: [...h.canario.filter((c) => c.t > corte), ...historiaCanario],
      incidentes: [...h.incidentes.filter((i) => (i.hasta ?? i.desde) > corte), ...cerrados],
    },
  };
  if (tocaResumen(estado, ahora, config)) {
    avisos.push(resumenDiario({ fallos: fallos ?? [], ahora, estado, config, logs: fallos ? "ok" : logs }));
    estado = { ...estado, ultimoResumen: fechaMadrid(ahora) };
  }
  return { avisos, estado };
}

// ── Los textos ────────────────────────────────────────────────────────────

/** Qué quiere decir cada motivo, en llano. */
export const FRASE_MOTIVO = {
  red: "cortes de red hasta la base",
  tiempo: "la base tarda demasiado",
  sin_sesion: "una clave no vale (401)",
  permiso: "permisos denegados (403)",
  no_existe: "falta una tabla, columna o función (¿migración sin aplicar?)",
  conflicto: "choques al guardar",
  datos_invalidos: "datos que la base rechaza",
  limite: "límite de uso (429)",
  servidor: "la base o un servicio da error 5xx",
  telegram: "Telegram rechaza mensajes",
  modelo: "la IA (Anthropic) no contesta bien",
  otro: "errores sin clasificar",
};

/** Qué quiere decir cada chequeo del canario, en llano. */
export const FRASE_CHEQUEO = {
  canario: "el canario no contesta",
  webhook_guardia: "el webhook acepta llamadas sin secreto",
  webhook_vivo: "el webhook no responde",
  webhook_info: "Telegram ve mal el webhook",
  base: "no se puede leer la casa de prueba",
  via_rapida: "la vía rápida falla",
  modelo: "Lola (con modelo) no contesta bien",
  logs: "el vigía no puede leer los logs de Vercel",
};

const FRASE_CLAVE = {
  canario: "Canario de Lola (salud)",
  canario_modelo: "Canario de Lola (turno con modelo)",
  logs: "El vigía, sin logs",
};

const nombreDeClave = (clave, config = VIGIA) => {
  if (FRASE_CLAVE[clave]) return FRASE_CLAVE[clave];
  const r = config.reglas.find((x) => x.clave === clave);
  if (!r) return clave;
  if (r.motivos.length === MOTIVOS_FALLO.length) return "Fallos de Lola (todos los motivos)";
  return `Fallos de Lola: ${r.motivos.map((m) => FRASE_MOTIVO[m] ?? m).join(", ")}`;
};

const duracion = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const deFalla = (f) => `${FRASE_CHEQUEO[f.chequeo] ?? f.chequeo}${f.motivo ? ` (${f.motivo})` : ""}`;

/**
 * El texto de un aviso, corto y en llano, con sus enlaces. Solo con lo que
 * trae el aviso (cifras y vocabulario): nada de familias.
 * @param {{ logs?: string, run?: string | null }} enlaces
 */
export function textoDe(aviso, enlaces = {}, config = VIGIA) {
  const pie = [enlaces.logs ? `Logs: ${enlaces.logs}` : null, enlaces.run ? `Run: ${enlaces.run}` : null].filter(Boolean).join("\n");
  const con = (l) => [...l, ...(pie ? ["", pie] : [])].join("\n");
  switch (aviso.tipo) {
    case "incidente_abierto": {
      if (aviso.n != null) {
        const donde = aviso.sitios?.length ? `Sobre todo en: ${aviso.sitios.join(", ")}.` : null;
        return con([`🔴 ${nombreDeClave(aviso.clave, config)}`, `${aviso.n} fallos graves en ${aviso.ventanaMin} min (avisa desde ${aviso.umbral}).`, donde].filter(Boolean));
      }
      const fallan = (aviso.fallan ?? []).map(deFalla);
      return con([`🔴 ${nombreDeClave(aviso.clave, config)}`, fallan.length ? `Falla: ${fallan.join("; ")}.` : null, `${aviso.seguidos} pasadas seguidas.`].filter(Boolean));
    }
    case "incidente_resuelto":
      return con([`🟢 Resuelto: ${nombreDeClave(aviso.clave, config)}`, `Duró ${duracion(aviso.duroMin)}${aviso.pico != null ? `; el pico, ${aviso.pico} fallos en ${aviso.ventanaMin} min` : ""}.`]);
    case "vigia_parado":
      return con([`🟡 El vigía estuvo parado ${duracion(aviso.minutos)} (de ${horaMadrid(aviso.desde)} a ${horaMadrid(aviso.hasta)}).`, "Lo de ese rato no ha saltado como incidente: sale en el resumen del día."]);
    case "resumen_diario": {
      const l = [`📋 Lola, últimas 24 h (${aviso.fecha})`];
      if (aviso.logs !== "ok") l.push(`Fallos: sin datos (${FRASE_CHEQUEO.logs}: ${aviso.logs}).`);
      else {
        l.push(`Fallos: ${aviso.total} (${aviso.graves} graves).`);
        if (aviso.porMotivo.length) l.push(`Por motivo: ${aviso.porMotivo.map(([m, n]) => `${m} ${n}`).join(", ")}.`);
        if (aviso.sitios.length) l.push(`Donde más: ${aviso.sitios.join(", ")}.`);
      }
      l.push(`Incidentes cerrados: ${aviso.incidentes}. Abiertos ahora: ${aviso.abiertos.length ? aviso.abiertos.join(", ") : "ninguno"}.`);
      if (aviso.canarioSalud.total) {
        l.push(`Canario: salud ${aviso.canarioSalud.ok}/${aviso.canarioSalud.total} bien; con modelo ${aviso.canarioModelo.ok}/${aviso.canarioModelo.total} (${aviso.canarioTokens} tokens, ~${aviso.canarioUsd.toFixed(2)} $).`);
      } else l.push("Canario: sin configurar o sin pasadas.");
      l.push(`Vigía: ${aviso.pasadas} de ${aviso.esperadas} pasadas. Si mañana no llega este resumen, el vigía está parado.`);
      return con(l);
    }
    default:
      return con([`Aviso del vigía: ${aviso.tipo}`]);
  }
}

/** La línea estructurada de un aviso: tipo, clave y cifras, para contar cuántos hubo. */
export function lineaDe(aviso, enviado) {
  const l = { evento: "vigia_aviso", tipo: TIPOS_AVISO_VIGIA.includes(aviso.tipo) ? aviso.tipo : "otro", clave: aviso.clave ?? null, enviado };
  if (aviso.n != null) l.n = aviso.n;
  if (aviso.duroMin != null) l.duro_min = aviso.duroMin;
  if (aviso.minutos != null) l.minutos = aviso.minutos;
  if (aviso.fallan) l.fallan = aviso.fallan.map((f) => f.chequeo);
  if (aviso.tipo === "resumen_diario") Object.assign(l, { total: aviso.total, graves: aviso.graves, pasadas: aviso.pasadas });
  return JSON.stringify(l);
}

// ── Lo de fuera: Telegram, el canario, los logs ───────────────────────────

/**
 * Manda un texto al grupo de avisos. Sin token o sin chat no manda nada (plan
 * B): el aviso queda en el log. Nunca imprime la URL (lleva el token).
 * @returns {Promise<{ enviado: boolean, motivo?: string }>}
 */
export async function enviarAviso(texto, { token, chat, pedir = fetch } = {}) {
  if (!token || !chat) return { enviado: false, motivo: "sin_configurar" };
  try {
    const res = await pedir(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { enviado: true };
    return { enviado: false, motivo: `http_${res.status}` };
  } catch (e) {
    return { enviado: false, motivo: e?.name === "TimeoutError" ? "tiempo" : "red" };
  }
}

/** El motivo de un fallo al llamar al canario, por su HTTP o su error. */
export function motivoHttp(status) {
  if (status === 401) return "sin_sesion";
  if (status === 403) return "permiso";
  if (status === 404) return "no_existe";
  if (status === 408 || status === 504) return "tiempo";
  if (status === 429) return "limite";
  if (status >= 500) return "servidor";
  return "otro";
}

/**
 * Llama al canario y devuelve lo que dice, o un fallo del propio canario.
 * Solo se queda con lo que está en los vocabularios: lo demás lo ignora.
 */
export async function llamarCanario(nivel, { url, secreto, pedir = fetch, config = VIGIA } = {}) {
  if (!url || !secreto) return null;
  const plazo = nivel === "modelo" ? config.canario.plazoModeloMs : config.canario.plazoSaludMs;
  try {
    const res = await pedir(`${url}${url.includes("?") ? "&" : "?"}nivel=${nivel}`, {
      method: "POST", headers: { Authorization: `Bearer ${secreto}` }, signal: AbortSignal.timeout(plazo),
    });
    if (!res.ok) return { ok: false, chequeos: [{ chequeo: "canario", ok: false, motivo: motivoHttp(res.status) }] };
    const j = await res.json();
    const chequeos = (Array.isArray(j?.chequeos) ? j.chequeos : [])
      .filter((c) => CHEQUEOS_CANARIO.includes(c?.chequeo))
      .map((c) => ({ chequeo: c.chequeo, ok: Boolean(c.ok), motivo: [...MOTIVOS_FALLO, ...MOTIVOS_CANARIO].includes(c.motivo) ? c.motivo : (c.ok ? null : "otro") }));
    const u = j?.uso ?? null;
    const tokens = u ? ["in", "out", "cr", "cw"].reduce((s, k) => s + (Number(u[k]) || 0), 0) : 0;
    return { ok: Boolean(j?.ok), chequeos, ...(tokens ? { tokens, usd: costeUsd(u, j?.modelo) } : {}) };
  } catch (e) {
    return { ok: false, chequeos: [{ chequeo: "canario", ok: false, motivo: e?.name === "TimeoutError" ? "tiempo" : "red" }] };
  }
}

/** Lo que costó un turno, en dólares, con las tarifas de Anthropic de hoy (las mismas que scripts/bot-evals.mjs). */
export function costeUsd(u, modelo = "") {
  const p = /haiku/.test(modelo) ? [1, 5, 0.1, 1.25] : /opus/.test(modelo) ? [5, 25, 0.5, 6.25] : [3, 15, 0.3, 3.75];
  const n = (k) => Number(u?.[k]) || 0;
  return (n("in") * p[0] + n("out") * p[1] + n("cr") * p[2] + n("cw") * p[3]) / 1e6;
}

/** Los fallos de producción de los últimos `minutos`, o por qué no se han podido leer. */
function leerLogs({ fichero, ahora, minutos, entorno }) {
  if (fichero) return { fallos: fallosDe(readFileSync(fichero, "utf8")), logs: "ok" };
  if (!process.env.VERCEL_TOKEN && process.env.GITHUB_ACTIONS) return { fallos: null, logs: "sin_configurar" };
  try {
    const r = paginar(tandaDeVercel(entorno), { desde: ahora - minutos * MIN, hasta: ahora });
    return { fallos: fallosDe(r.contenido), logs: "ok", completo: r.completo };
  } catch (e) {
    // El mensaje lleva el stderr de la CLI: al log no, que es público; solo que falló.
    console.error("[vigia] logs: no se han podido leer");
    return { fallos: null, logs: /ENOENT|not found|no se reconoce/i.test(String(e?.message)) ? "sin_configurar" : "otro" };
  }
}

function argumentos(argv) {
  const a = { estado: ".vigia/estado.json", fichero: null, ahora: Date.now(), canario: true, seco: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--estado") a.estado = argv[++i];
    else if (k === "--fichero") a.fichero = argv[++i];
    else if (k === "--ahora") a.ahora = Date.parse(argv[++i]);
    else if (k === "--sin-canario") a.canario = false;
    else if (k === "--seco") a.seco = true;
    else throw new Error(`No conozco «${k}». Mira la cabecera de scripts/vigia.mjs.`);
  }
  if (!Number.isFinite(a.ahora)) throw new Error("--ahora es una fecha ISO");
  return a;
}

function leerEstado(ruta) {
  if (!existsSync(ruta)) return estadoVacio();
  try {
    return normalizarEstado(JSON.parse(readFileSync(ruta, "utf8")));
  } catch {
    console.warn("[vigia] estado ilegible: se empieza de cero"); // a propósito: lo peor es un aviso repetido
    return estadoVacio();
  }
}

async function main() {
  const a = argumentos(process.argv.slice(2));
  const config = VIGIA;
  const anterior = leerEstado(a.estado);
  const ahora = a.ahora;
  // Con resumen, las 24 h; si no, la ventana más larga de las reglas.
  const minutos = tocaResumen(anterior, ahora, config) ? config.retencionLogsMin : minutosALeer(config);
  // Dónde está Lola de verdad: el webhook puede apuntar a staging (preview) y
  // no a producción. La variable VIGIA_ENTORNO del repo manda sobre el valor
  // de src/lib/vigia.js.
  const entorno = process.env.VIGIA_ENTORNO || config.entorno;
  if (!["production", "preview"].includes(entorno)) throw new Error("VIGIA_ENTORNO es production o preview");
  const { fallos, logs } = leerLogs({ fichero: a.fichero, ahora, minutos, entorno });

  const destino = { url: process.env.CANARIO_URL, secreto: process.env.BOT_CRON_SECRET, config };
  const canario = {};
  if (a.canario) {
    canario.salud = await llamarCanario("salud", destino);
    // Si el propio canario no contesta, el turno con modelo tampoco: sería el mismo aviso dos veces.
    const contesta = canario.salud && !canario.salud.chequeos.some((c) => c.chequeo === "canario");
    if (contesta && tocaModelo(anterior, ahora, config)) canario.modelo = await llamarCanario("modelo", destino);
  }

  const { avisos, estado } = pasada({ ahora, fallos, logs, canario, estado: anterior, config });

  const { GITHUB_SERVER_URL: gh, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: run } = process.env;
  const enlaces = { logs: config.enlaces.logs, run: gh && repo && run ? `${gh}/${repo}/actions/runs/${run}` : null };
  const telegram = a.seco ? {} : { token: process.env.AVISOS_TELEGRAM_TOKEN, chat: process.env.AVISOS_TELEGRAM_CHAT };

  // Lo que no salió la vez anterior va primero, con su número de intentos.
  const cola = [...(anterior.pendientes ?? []), ...avisos.map((aviso) => ({ aviso, intentos: 0 }))];
  const pendientes = [];
  for (const { aviso, intentos } of cola) {
    const texto = textoDe(aviso, enlaces, config);
    const r = await enviarAviso(texto, telegram);
    console.log(lineaDe(aviso, r.enviado));
    if (!r.enviado) {
      console.log(texto); // plan B: el aviso, en el log (sin datos de familias)
      if (r.motivo !== "sin_configurar" && intentos + 1 < config.reintentosAviso) pendientes.push({ aviso, intentos: intentos + 1 });
    }
  }

  const canarioDe = (r) => (r === undefined ? "no_toca" : r === null ? "sin_configurar" : r.ok && !r.chequeos.some((c) => !c.ok) ? "ok" : "fallo");
  console.log(JSON.stringify({
    evento: "vigia_pasada", logs, fallos: fallos?.length ?? null, avisos: avisos.length,
    abiertos: Object.keys(estado.abiertos), canario_salud: canarioDe(canario.salud), canario_modelo: canarioDe(canario.modelo),
  }));

  mkdirSync(dirname(a.estado), { recursive: true });
  writeFileSync(a.estado, JSON.stringify({ ...estado, pendientes }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(`[vigia] ${e.message}`); process.exit(1); });
}
