/**
 * leer.mjs — convierte líneas de transcripción y apuntes del registro en cifras.
 *
 * Todo es puro salvo el acumulador que se les pasa (`nuevoResumen`): no leen ficheros, no
 * miran el reloj (la hora entra como argumento) y no devuelven NUNCA el contenido de los
 * mensajes: solo cifras, nombres de hooks y de agentes, y los motivos de bloqueo cortados
 * a 80 caracteres. El panel es de solo lectura.
 */

export const MAX_MOTIVO = 80;
export const SESIONES_VISIBLES = 15;
// Las fuentes de lectura: vocabulario cerrado. Cada error de lectura dice de cuál es.
export const FUENTES = ["transcripciones", "settings", "copia", "registro", "precios", "subagentes"];
// Lo que una foto de coste puede pasarse de la vida observada de su sesión antes de tratarla como «no cuadra»
const MARGEN_FOTO_MS = 600000;
// Los jueces de la factoría (los mismos de factorias/alvaro/lib/reglas.mjs: allí no se exporta la lista).
const JUECES = ["revisor", "qa", "evaluador"];

// ---- v1: En directo, semáforo y rondas. Todos los umbrales y vocabularios cerrados, en un solo sitio ----
export const VENTANA_DIRECTO_MS = 30 * 60000; // «En directo» enseña los últimos 30 minutos
export const MAX_EVENTOS = 300; // tope de filas de «En directo» (se quedan las más nuevas)
export const TIPOS_EVENTO = ["agente_lanzado", "juez_lanzado", "juez_informo", "hook_bloqueo", "turno_terminado"];
// Lo que un juez puede decir (los de reglas.mjs). Cualquier otra cosa que traiga el registro sale como sin_veredicto: no se pinta texto libre.
export const VEREDICTOS = ["pasa", "no_pasa", "no_se", "sin_veredicto"];
export const UMBRALES_HOOKS_VIVOS = { okMs: 10 * 60000, avisoMs: 60 * 60000 }; // verde por debajo de okMs, ámbar por debajo de avisoMs, rojo más
// Un juez «lanzado» sin informe de hace más que esto ya no se da por «en marcha» (se perdió o se cortó): no cuenta como ronda abierta.
export const RONDA_ABIERTA_MAX_MS = 2 * 3600e3;
export const MAX_RAMAS = 12;
export const MAX_MARCAS = 40; // marcas por rama que se enseñan (las más nuevas); el total de rondas sigue siendo el real
// Para el COSTE, «juez» es más ancho que para el registro: los cinco agentes que revisan (el resto de subagentes son «otros»)
export const AGENTES_JUEZ = ["revisor", "qa", "evaluador", "seguridad", "auditor-datos"];
// Lo que tiene que traer cada modelo de precios.json (USD por millón de tokens)
export const CAMPOS_PRECIO = ["entrada", "salida", "lecturaCache", "escrituraCache5m", "escrituraCache1h"];
// El cierre con error y el adjunto del mismo bloqueo se anotan en el mismo instante; esto es lo que se tolera de diferencia
const VENTANA_PAREJA_BLOQUEO_MS = 5000;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const num0 = (v) => num(v) ?? 0;
const texto = (v) => (typeof v === "string" ? v : null);
// Modelo y tipo de subagente salen a la página: solo caracteres de un nombre y 40 como mucho.
export const limpio = (v) => String(v).replace(/[^\w.:-]/g, "_").slice(0, 40);

/** Acumulador de UN fichero de transcripción. */
export function nuevoResumen() {
  return {
    rotas: 0,
    hooks: new Map(), // clave → { ts, sesion, evento, comando, ms }
    bloqueos: new Map(), // uuid → { ts, sesion, evento, comando, texto }
    cierres: new Map(), // uuid del resumen de cierre → { ts, sesion, ms: suma de la duración de sus hooks (null si ninguna), errores: cuántos hookErrors trae }
    msgs: new Map(), // message.id → { ts, sesion, modelo, lado, entrada, salida, cacheLeida, cacheCreada }
    agentes: new Map(), // id del tool_use → { ts, sesion, tipo }
    costes: new Map(), // sesión → su ÚLTIMA foto cost-state { costeUSD (solo para saber si la foto está vacía y cuál es la más completa; no se enseña), totalMs, apiMs, herramientasMs }
    sesiones: new Map(), // sesión → { minTs, maxTs, rama, carpeta, asist: líneas del asistente }
  };
}

/** Una línea de transcripción (texto) al acumulador. Una línea rota se cuenta y se salta. */
export function procesarLinea(r, linea) {
  if (!linea || !linea.trim()) return;
  let o;
  try {
    o = JSON.parse(linea);
  } catch {
    r.rotas++;
    return;
  }
  if (o === null || typeof o !== "object" || Array.isArray(o)) {
    r.rotas++;
    return;
  }
  const sesion = texto(o.sessionId);
  const ts = Date.parse(o.timestamp);
  const tsOk = Number.isFinite(ts) ? ts : null;
  if (sesion) {
    const m = r.sesiones.get(sesion) ?? { minTs: null, maxTs: null, rama: null, carpeta: null, asist: 0 };
    if (tsOk !== null) {
      m.minTs = Math.min(m.minTs ?? tsOk, tsOk);
      m.maxTs = Math.max(m.maxTs ?? tsOk, tsOk);
    }
    if (texto(o.gitBranch)) m.rama = o.gitBranch;
    if (texto(o.cwd)) m.carpeta = o.cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
    r.sesiones.set(sesion, m);
  }

  if (o.type === "assistant") {
    const msg = o.message ?? {};
    if (sesion) {
      r.sesiones.get(sesion).asist++;
    }
    const id = texto(msg.id) ?? texto(o.uuid);
    if (id) {
      // la misma respuesta se repite en varias líneas: se cuenta una vez, con lo mayor de cada cifra
      const u = msg.usage ?? {};
      const previo = r.msgs.get(id);
      const nuevo = { ts: tsOk, sesion, modelo: msg.model === "<synthetic>" ? null : limpio(texto(msg.model) ?? "(sin modelo)"), lado: o.isSidechain === true, entrada: num0(u.input_tokens), salida: num0(u.output_tokens), cacheLeida: num0(u.cache_read_input_tokens), cacheCreada: num0(u.cache_creation_input_tokens), cache1h: num0(u.cache_creation?.ephemeral_1h_input_tokens) };
      if (previo) for (const k of ["entrada", "salida", "cacheLeida", "cacheCreada", "cache1h"]) nuevo[k] = Math.max(nuevo[k], previo[k]);
      r.msgs.set(id, nuevo);
    }
    if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b && b.type === "tool_use" && b.name === "Agent") r.agentes.set(texto(b.id) ?? `${o.uuid}#${r.agentes.size}`, { ts: tsOk, sesion, tipo: texto(b.input?.subagent_type) === null ? null : limpio(b.input.subagent_type) });
      }
    }
  } else if (o.type === "system" && o.subtype === "stop_hook_summary") {
    const clave = texto(o.uuid) ?? `${tsOk}#${r.hooks.size}`;
    const infos = Array.isArray(o.hookInfos) ? o.hookInfos : [];
    infos.forEach((h, i) => r.hooks.set(`${clave}#${i}`, { ts: tsOk, sesion, evento: "Stop", comando: texto(h?.command), ms: num(h?.durationMs) }));
    // Del cierre solo se guarda cuántos errores trae, nunca su texto
    const duraciones = infos.map((h) => num(h?.durationMs)).filter((x) => x !== null);
    r.cierres.set(clave, { ts: tsOk, sesion, ms: duraciones.length ? duraciones.reduce((a, b) => a + b, 0) : null, errores: Array.isArray(o.hookErrors) ? o.hookErrors.length : 0 });
  } else if (o.type === "attachment" && o.attachment && typeof o.attachment === "object") {
    const a = o.attachment;
    const clave = texto(o.uuid) ?? `${tsOk}#${r.hooks.size + r.bloqueos.size}`;
    // Los hook_success de Stop se saltan: ya vienen en el resumen de cierre (si no, se contarían dos veces).
    if (a.type === "hook_success" && a.hookEvent !== "Stop") r.hooks.set(clave, { ts: tsOk, sesion, evento: texto(a.hookEvent) ?? "(sin evento)", comando: texto(a.command), ms: num(a.durationMs) });
    else if (a.type === "hook_blocking_error") {
      const e = a.blockingError ?? {};
      r.bloqueos.set(clave, { ts: tsOk, sesion, evento: texto(a.hookEvent) ?? "(sin evento)", comando: texto(e.command), texto: texto(e.blockingError) ?? "(sin texto)" });
    }
  } else if (o.type === "cost-state" && sesion) {
    // Una foto esporádica de Claude Code (no un contador final): manda la última, y se anota si luego hubo más mensajes
    r.costes.set(sesion, { costeUSD: num(o.totalCostUSD), totalMs: num(o.totalDuration), apiMs: num(o.totalAPIDuration), herramientasMs: num(o.totalToolDuration) });
  }
}

/** Apuntes del registro de jueces (una línea JSON por apunte). */
export function parsearRegistro(contenido) {
  const entradas = [];
  let rotas = 0;
  for (const l of String(contenido).split("\n")) {
    if (!l.trim()) continue;
    try {
      const o = JSON.parse(l);
      if (o && typeof o === "object" && !Array.isArray(o)) entradas.push(o);
      else rotas++;
    } catch {
      rotas++;
    }
  }
  return { entradas, rotas };
}

/** De settings.json solo la clave `hooks`: [{ evento, comando }]. Lanza si el JSON está roto. */
export function leerDeclarados(contenido) {
  const hooks = JSON.parse(contenido)?.hooks;
  if (!hooks || typeof hooks !== "object") return [];
  const sal = [];
  for (const [evento, grupos] of Object.entries(hooks)) {
    for (const g of Array.isArray(grupos) ? grupos : []) {
      for (const h of Array.isArray(g?.hooks) ? g.hooks : []) if (typeof h?.command === "string") sal.push({ evento, comando: h.command });
    }
  }
  return sal;
}

/** Quita lo que cambia de un PC a otro ($HOME, ruta real, ${CLAUDE_PROJECT_DIR}, barras) para comparar comandos. */
export function normalizarComando(cmd, home) {
  let s = String(cmd ?? "(sin comando)").replace(/\\/g, "/");
  const h = String(home ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (h) s = s.split(h).join("<H>");
  return s
    .replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, "<P>")
    .replace(/\$\{?HOME\}?/g, "<H>")
    .replace(/(^|[\s"'=])~\//g, "$1<H>/")
    .replace(/\s+/g, " ")
    .trim();
}

export function rutaCorta(norm) {
  return /(?:<[HP]>|[^\s"'|&;()])[^\s"'|&;()]*\.(?:mjs|cjs|js|sh|py|ps1)(?![\w])/.exec(norm)?.[0] ?? null;
}

export function nombreCorto(norm) {
  const ruta = rutaCorta(norm);
  if (ruta) return ruta.split("/").pop();
  if (norm === "callback") return "callback (interno de Claude Code)";
  return norm.length > 40 ? norm.slice(0, 40) + "…" : norm;
}

/** instalado y repo: { "hooks/x.mjs": sha256 }. */
export function compararCopias(instalado, repo) {
  const nombres = (a, b) => Object.keys(a).filter((k) => !(k in b)).sort();
  const difieren = Object.keys(repo).filter((k) => k in instalado && instalado[k] !== repo[k]).sort();
  const faltanInstalada = nombres(repo, instalado);
  const sobranInstalada = nombres(instalado, repo);
  return { ok: !difieren.length && !faltanInstalada.length && !sobranInstalada.length, difieren, faltanInstalada, sobranInstalada };
}

// ---- La hora de Madrid ----
const RELOJ_MADRID = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
// Cuánto adelanta Madrid a UTC en ese instante (1 h en invierno, 2 h en verano)
const desfaseMadrid = (ms) => {
  const p = Object.fromEntries(RELOJ_MADRID.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
/** Las 00:00 de Madrid del día de `ms`, como instante. El desfase se mide en la propia medianoche: el día que cambia la hora dura 23 o 25 h. */
export function inicioDiaMadrid(ms) {
  const desfase = desfaseMadrid(ms);
  const pared = new Date(ms + desfase); // el reloj de pared de Madrid, leído como si fuera UTC
  const medianocheDePared = Date.UTC(pared.getUTCFullYear(), pared.getUTCMonth(), pared.getUTCDate());
  return medianocheDePared - desfaseMadrid(medianocheDePared - desfase);
}

const DIA_MADRID = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
/** El día (AAAA-MM-DD) de Madrid de un instante. */
export const diaMadrid = (ms) => DIA_MADRID.format(ms);

/** precios.json: lanza si no tiene la forma esperada (un precio que falta nunca se lee como 0). Un modelo en null = sin precio, a propósito. */
export function validarPrecios(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("precios.json: tiene que ser un objeto");
  for (const k of ["fecha", "fuente"]) if (typeof p[k] !== "string" || !p[k]) throw new Error(`precios.json: falta «${k}»`);
  if (!p.modelos || typeof p.modelos !== "object" || Array.isArray(p.modelos)) throw new Error("precios.json: falta «modelos»");
  for (const [nombre, v] of Object.entries(p.modelos)) {
    if (v === null) continue;
    for (const c of CAMPOS_PRECIO) if (typeof v?.[c] !== "number" || !(v[c] >= 0)) throw new Error(`precios.json: el modelo ${nombre} no tiene «${c}» numérico`);
  }
  return p;
}

/**
 * Los bloqueos de hooks vistos por dos vías sin contarlos dos veces: el adjunto hook_blocking_error (trae el hook)
 * y el resumen de cierre con hookErrors (no dice cuál). Se anotan en el mismo instante: un cierre con errores
 * absorbe los adjuntos de su misma sesión a menos de 5 s (cada adjunto, de un solo cierre), y los errores que
 * ningún adjunto cubre salen como bloqueos con hook null. adjuntos: [{ts,sesion,comando}], cierres: [{ts,sesion,errores}].
 */
export function unirBloqueos(adjuntos, cierres) {
  const validos = adjuntos.filter((a) => a.ts !== null && a.ts !== undefined);
  const usados = new Set();
  const sueltos = [];
  for (const c of cierres.filter((x) => x.errores > 0 && x.ts !== null && x.ts !== undefined).sort((a, b) => a.ts - b.ts)) {
    let cubiertos = 0;
    validos.forEach((a, i) => {
      if (!usados.has(i) && a.sesion === c.sesion && Math.abs(a.ts - c.ts) <= VENTANA_PAREJA_BLOQUEO_MS) {
        usados.add(i);
        cubiertos++;
      }
    });
    for (let k = cubiertos; k < c.errores; k++) sueltos.push({ ts: c.ts, sesion: c.sesion, comando: null });
  }
  return [...validos, ...sueltos].sort((a, b) => a.ts - b.ts);
}

const veredictoCerrado = (v) => (VEREDICTOS.includes(v) ? v : "sin_veredicto");
const sesionCorta = (s) => (s === null || s === undefined ? null : limpio(s).slice(0, 8));

/**
 * «En directo»: los sucesos de los últimos 30 min, el más nuevo primero. Campos cerrados; ni descripciones, ni prompts,
 * ni mensajes, ni el resumen del registro: solo tipo de agente, nombre del hook, veredicto de la lista cerrada, ids y duraciones.
 * directos: resúmenes de transcripción (con eso basta lo reciente); entradas: apuntes del registro [{..., rama}].
 */
function construirEventos({ ahora, directos, entradas, home }) {
  const desde = ahora - VENTANA_DIRECTO_MS;
  const dentro = (ts) => ts !== null && ts !== undefined && ts >= desde;
  const sal = [];
  const poner = (ts, tipo, o = {}) => sal.push({ ts, hora: iso(ts), tipo, agente: o.agente ?? null, hook: o.hook ?? null, veredicto: o.veredicto ?? null, agentId: o.agentId ?? null, duracionMs: o.duracionMs ?? null, sesion: sesionCorta(o.sesion) });

  // Los jueces salen del registro («juez lanzado»), no de aquí: así no hay dos filas por el mismo lanzamiento
  for (const a of unir(directos.map((r) => r.agentes)).values()) if (dentro(a.ts) && !JUECES.includes(a.tipo)) poner(a.ts, "agente_lanzado", { agente: a.tipo, sesion: a.sesion });
  const cierres = [...unir(directos.map((r) => r.cierres)).values()];
  const adjuntos = [...unir(directos.map((r) => r.bloqueos)).values()].map((b) => ({ ts: b.ts, sesion: b.sesion, comando: b.comando }));
  for (const b of unirBloqueos(adjuntos, cierres)) if (dentro(b.ts)) poner(b.ts, "hook_bloqueo", { hook: b.comando === null ? null : nombreCorto(normalizarComando(b.comando, home)), sesion: b.sesion });
  // Un cierre con errores es un bloqueo (el turno sigue), no un turno terminado
  for (const c of cierres) if (c.errores === 0 && dentro(c.ts)) poner(c.ts, "turno_terminado", { duracionMs: c.ms, sesion: c.sesion });

  const lanzados = new Map(); // rama|agent_id → ts del primer «lanzado»
  for (const e of entradas) if (e.veredicto === "lanzado" && e.agent_id && !lanzados.has(`${e.rama}|${e.agent_id}`)) lanzados.set(`${e.rama}|${e.agent_id}`, e.ts);
  for (const e of entradas) {
    if (!JUECES.includes(e.agente) || !dentro(e.ts)) continue; // el registro viejo también apunta a constructores
    const id = e.agent_id ? limpio(e.agent_id) : null;
    if (e.veredicto === "lanzado") poner(e.ts, "juez_lanzado", { agente: limpio(e.agente), agentId: id, sesion: e.sesion });
    else {
      const t0 = e.agent_id ? lanzados.get(`${e.rama}|${e.agent_id}`) : undefined;
      poner(e.ts, "juez_informo", { agente: limpio(e.agente), agentId: id, veredicto: veredictoCerrado(e.veredicto), duracionMs: t0 !== undefined && e.ts >= t0 ? e.ts - t0 : null, sesion: e.sesion });
    }
  }
  return sal
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_EVENTOS)
    .map(({ ts: _ts, ...resto }) => resto);
}

/**
 * Rondas por rama: una marca por informe concluyente de juez (y una por «lanzado» sin informe), en orden. Una ronda es un
 * informe de juez en esa rama; no se sabe a qué PR pertenece. Devuelve TODAS las ramas con algún juez (el semáforo cuenta en todas).
 */
function construirRamas({ ahora, entradas, costeAgente, T, P }) {
  const porRama = new Map();
  for (const e of entradas) porRama.set(e.rama, [...(porRama.get(e.rama) ?? []), e]);
  const sal = [];
  for (const [rama, es] of porRama) {
    const lanzados = new Map(); // agent_id → { ts, agente }
    for (const e of es) if (e.veredicto === "lanzado" && JUECES.includes(e.agente) && e.agent_id && !lanzados.has(e.agent_id)) lanzados.set(e.agent_id, { ts: e.ts, agente: e.agente });
    const informes = new Map(); // agent_id → marca (si un id tiene varios apuntes, manda el último)
    const sinId = [];
    for (const e of es) {
      if (e.veredicto === "lanzado" || !JUECES.includes(e.agente)) continue;
      const t0 = e.agent_id ? lanzados.get(e.agent_id)?.ts : undefined;
      const marca = { ts: e.ts, agente: limpio(e.agente), veredicto: veredictoCerrado(e.veredicto), ms: t0 !== undefined && e.ts >= t0 ? e.ts - t0 : null, abierta: false, fiable: Boolean(e.agent_id), ...(costeAgente(e.agent_id ? limpio(e.agent_id) : null) ?? { tokens: null, costeUSD: null, tokensSinPrecio: null }) };
      if (e.agent_id) informes.set(e.agent_id, marca);
      else sinId.push(marca);
    }
    const abiertas = [...lanzados].filter(([id]) => !informes.has(id)).map(([, l]) => ({ ts: l.ts, agente: limpio(l.agente), veredicto: "lanzado", ms: null, abierta: ahora - l.ts <= RONDA_ABIERTA_MAX_MS, fiable: true, tokens: null, costeUSD: null, tokensSinPrecio: null }));
    const concluyentes = [...informes.values(), ...sinId];
    if (!concluyentes.length && !abiertas.length) continue;
    const marcas = [...concluyentes, ...abiertas].sort((a, b) => a.ts - b.ts);
    const medidos = concluyentes.filter((m) => m.ms !== null);
    const conDato = concluyentes.filter((m) => m.tokens !== null); // las rondas cuyo juez tiene transcripción
    const suma = (xs) => redondear(xs.reduce((n, x) => n + x, 0));
    sal.push({
      ultimoMs: marcas.at(-1).ts,
      abiertas: abiertas.filter((m) => m.abierta).length,
      rama: limpio(rama),
      rondas: concluyentes.length,
      tiempoMs: medidos.length ? medidos.reduce((n, m) => n + m.ms, 0) : null,
      ultimo: iso(marcas.at(-1).ts),
      tokens: T || !conDato.length ? null : suma(conDato.map((m) => m.tokens)),
      costeUSD: T || P || !conDato.some((m) => m.costeUSD !== null) ? null : suma(conDato.map((m) => m.costeUSD ?? 0)),
      tokensSinPrecio: T || P || !conDato.length ? null : suma(conDato.map((m) => m.tokensSinPrecio)),
      rondasConCoste: T ? null : conDato.length,
      masMarcas: Math.max(0, marcas.length - MAX_MARCAS),
      marcas: marcas.slice(-MAX_MARCAS).map(({ ts, ...resto }) => ({ ...resto, ts: iso(ts) })),
    });
  }
  return sal.sort((a, b) => b.ultimoMs - a.ultimoMs);
}

const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const unir = (mapas) => {
  const sal = new Map();
  for (const m of mapas) for (const [k, v] of m) if (!sal.has(k)) sal.set(k, v);
  return sal;
};
const top = (cuenta, n) => [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, n);

const redondear = (x) => Math.round(x * 1e9) / 1e9; // quita el ruido de la coma flotante
const porcentaje = (parte, total) => Math.round((parte / total) * 1000) / 10;

/**
 * Tokens y coste estimado, por día de Madrid, categoría (jueces / otros subagentes / sesión principal), sesión, rama y agente.
 * Un mensaje cuenta una vez (por message.id, lo del subagente antes que lo de la principal). Un modelo sin precio da sus tokens
 * y «sin precio» (null): el coste que sale es un mínimo y tokensSinPrecio dice cuánto falta. Nunca se usa cost-state.
 * Devuelve { coste (null si cae transcripciones), costeAgente(agentId) → { tokens, costeUSD, tokensSinPrecio } | null }.
 */
function construirCoste({ corte, rs, sesiones, subagentes, precios, T, P }) {
  const precioDe = (modelo) => (precios && Object.hasOwn(precios.modelos, modelo) ? precios.modelos[modelo] : null); // «constructor» o «toString» no son precios
  const costeMsg = (m) => {
    const p = precioDe(m.modelo);
    if (!p) return null;
    const c1h = Math.min(m.cache1h, m.cacheCreada); // sin desglose en el uso, todo va a la tarifa de 5 min
    return (m.entrada * p.entrada + m.salida * p.salida + m.cacheLeida * p.lecturaCache + (m.cacheCreada - c1h) * p.escrituraCache5m + c1h * p.escrituraCache1h) / 1e6;
  };
  const cubo = () => ({ tokens: 0, usd: 0, conPrecio: 0, sinPrecio: 0, ultimo: null });
  const sumar = (c, m, tk, usd) => {
    c.tokens += tk;
    if (usd === null) c.sinPrecio += tk;
    else {
      c.usd += usd;
      c.conPrecio += tk;
    }
    c.ultimo = Math.max(c.ultimo ?? 0, m.ts);
  };
  const cerrar = (c) => ({ tokens: c.tokens, costeUSD: P || (c.tokens > 0 && c.conPrecio === 0) ? null : redondear(c.usd), tokensSinPrecio: P ? null : c.sinPrecio });

  const primeraRama = (r) => [...r.sesiones.values()].find((x) => x.rama)?.rama ?? null;
  const lista = [];
  const vistos = new Set();
  const poner = (id, m, categoria, sesion, rama, agentId) => {
    if (vistos.has(id) || m.modelo === null || m.ts === null || m.ts < corte) return;
    vistos.add(id);
    lista.push({ m, categoria, sesion, rama, agentId });
  };
  for (const s of subagentes) {
    const categoria = AGENTES_JUEZ.includes(s.tipo) ? "jueces" : "otros";
    const rama = sesiones.get(s.sesionPadre)?.rama ?? primeraRama(s.resumen);
    for (const [id, m] of s.resumen.msgs) poner(id, m, categoria, s.sesionPadre, rama, s.agentId);
  }
  for (const r of rs) for (const [id, m] of r.msgs) poner(id, m, "principal", m.sesion, sesiones.get(m.sesion)?.rama ?? null, null);

  const nuevoGrupo = () => ({ jueces: cubo(), otros: cubo(), principal: cubo(), total: cubo() });
  const grupos = { total: nuevoGrupo(), dia: new Map(), sesion: new Map(), rama: new Map() };
  const porAgente = new Map();
  const sinPrecio = new Set();
  const enGrupo = (mapa, clave, extra) => mapa.get(clave) ?? mapa.set(clave, { ...nuevoGrupo(), ...extra }).get(clave);
  for (const { m, categoria, sesion, rama, agentId } of lista) {
    const tk = m.entrada + m.salida + m.cacheLeida + m.cacheCreada;
    const usd = costeMsg(m);
    if (usd === null) sinPrecio.add(m.modelo);
    const destinos = [grupos.total, enGrupo(grupos.dia, diaMadrid(m.ts), { dia: diaMadrid(m.ts) }), enGrupo(grupos.sesion, sesion ?? "(sin sesión)", { sesion: limpio(sesion ?? "?").slice(0, 8), rama }), enGrupo(grupos.rama, rama ?? "", { rama })];
    for (const g of destinos) for (const c of [g[categoria], g.total]) sumar(c, m, tk, usd);
    if (agentId) sumar(porAgente.get(agentId) ?? porAgente.set(agentId, cubo()).get(agentId), m, tk, usd);
  }
  const cerrarGrupo = (g) => ({ jueces: cerrar(g.jueces), otros: cerrar(g.otros), principal: cerrar(g.principal), total: cerrar(g.total) });
  const pct = (g) => {
    const c = cerrarGrupo(g);
    return { c, pctJueces: P || !c.jueces.costeUSD || !c.total.costeUSD ? (c.jueces.costeUSD === 0 && c.total.costeUSD ? 0 : null) : porcentaje(c.jueces.costeUSD, c.total.costeUSD) };
  };
  const reparto = (valor) => {
    const t = grupos.total;
    const v = ["jueces", "otros", "principal"].map((k) => valor(t[k]));
    const suma = v.reduce((n, x) => n + (x ?? 0), 0);
    return v.every((x) => x === null) || !suma ? null : { jueces: porcentaje(v[0] ?? 0, suma), otros: porcentaje(v[1] ?? 0, suma), principal: porcentaje(v[2] ?? 0, suma) };
  };
  const recientes = (mapa, n) => [...mapa.values()].sort((a, b) => b.total.ultimo - a.total.ultimo).slice(0, n);
  const coste = T
    ? null
    : {
        precios: P || !precios ? null : { fecha: precios.fecha, fuente: precios.fuente },
        lineasRotas: subagentes.reduce((n, s) => n + s.resumen.rotas, 0),
        modelosSinPrecio: P ? null : [...sinPrecio].sort(),
        repartoTokens: reparto((c) => c.tokens),
        repartoCoste: P ? null : reparto((c) => (c.conPrecio ? c.usd : null)),
        total: cerrarGrupo(grupos.total),
        porDia: [...grupos.dia.values()].sort((a, b) => a.dia.localeCompare(b.dia)).map((g) => ({ dia: g.dia, ...cerrarGrupo(g) })),
        porSesion: recientes(grupos.sesion, SESIONES_VISIBLES).map((g) => ({ sesion: g.sesion, rama: g.rama === null ? null : limpio(g.rama), ultimo: iso(g.total.ultimo), ...pct(g).c, pctJueces: pct(g).pctJueces })),
        porRama: recientes(grupos.rama, MAX_RAMAS).map((g) => ({ rama: g.rama === null ? null : limpio(g.rama), ultimo: iso(g.total.ultimo), ...pct(g).c, pctJueces: pct(g).pctJueces })),
      };
  const costeAgente = (id) => (T || !id || !porAgente.has(id) ? null : cerrar(porAgente.get(id)));
  return { coste, costeAgente };
}

/**
 * Las cifras de la página. ficheros: [{ ruta, mtimeMs, resumen }] ya limitados a la ventana por fecha
 * de modificación; aquí se filtran además los eventos por su propia hora.
 * Errores por fuente: cada error lleva su `fuente` (FUENTES). Todo valor derivado de una fuente caída sale null, aquí y no en la
 * página (que solo pinta lo que le dan): transcripciones → todo lo visto en ellas; settings → lo declarado, sinHuella y rojo;
 * copia → la comparación; registro → los jueces. «En directo» (eventos) depende de transcripciones y de registro; el semáforo,
 * de las fuentes de cada lámpara. directo: resúmenes con lo reciente (por defecto, los mismos de ficheros).
 */
export function agregar({ ahora, dias, ficheros, directo, subagentes = [], precios = null, proyectos = null, registros, declarados, copia, home, errores }) {
  const corte = ahora - dias * 864e5;
  const [T, S, C, R, P, B] = FUENTES.map((f) => errores.some((x) => x.fuente === f)); // cuáles han caído
  const de = (cae, valor) => (cae ? null : valor);
  const dentro = (ts) => ts === null || ts >= corte;
  const orden = [...ficheros].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const rs = orden.map((f) => f.resumen);

  // Sesiones: se funden las de varios ficheros (una sesión reanudada deja copias)
  const sesiones = new Map();
  const costes = new Map();
  for (const r of rs) {
    for (const [id, m] of r.sesiones) {
      const s = sesiones.get(id);
      if (!s) sesiones.set(id, { ...m });
      else {
        s.asist += m.asist;
        s.minTs = Math.min(s.minTs ?? m.minTs, m.minTs ?? s.minTs);
        const nuevaMax = m.maxTs !== null && (s.maxTs === null || m.maxTs >= s.maxTs);
        s.maxTs = Math.max(s.maxTs ?? -Infinity, m.maxTs ?? -Infinity);
        if (nuevaMax) {
          s.rama = m.rama ?? s.rama;
          s.carpeta = m.carpeta ?? s.carpeta;
        }
      }
    }
    // De varias fotos de una misma sesión, la más completa (la de mayor coste interno: nunca baja)
    for (const [id, c] of r.costes) if (!costes.has(id) || (c.costeUSD ?? -1) >= (costes.get(id).costeUSD ?? -1)) costes.set(id, c);
  }
  const enVentana = [...sesiones].filter(([, s]) => s.maxTs !== null && s.maxTs >= corte);

  const hookEv = [...unir(rs.map((r) => r.hooks)).values()].filter((e) => dentro(e.ts));
  const bloqueoEv = [...unir(rs.map((r) => r.bloqueos)).values()].filter((e) => dentro(e.ts));
  const msgs = [...unir(rs.map((r) => r.msgs)).values()].filter((e) => dentro(e.ts));
  const agentes = [...unir(rs.map((r) => r.agentes)).values()].filter((e) => dentro(e.ts));

  // ---- Qué se activa y qué no ----
  const clave = (evento, comando) => `${evento}|${normalizarComando(comando, home)}`;
  const filas = new Map();
  const fila = (evento, comando) => {
    const k = clave(evento, comando);
    if (!filas.has(k)) {
      const norm = normalizarComando(comando, home);
      filas.set(k, { evento, nombre: nombreCorto(norm), ruta: rutaCorta(norm), declarado: false, veces: 0, ultimaMs: null, ms: [], bloqueos: 0 });
    }
    return filas.get(k);
  };
  for (const d of S ? [] : declarados ?? []) fila(d.evento, d.comando).declarado = true;
  for (const e of hookEv) {
    const f = fila(e.evento, e.comando);
    f.veces++;
    if (e.ts !== null) f.ultimaMs = Math.max(f.ultimaMs ?? 0, e.ts);
    if (e.ms !== null) f.ms.push(e.ms);
  }
  for (const e of bloqueoEv) fila(e.evento, e.comando).bloqueos++;
  const hooks = [...filas.values()]
    .map((f) => {
      const sinHuella = de(S, f.declarado && f.veces === 0);
      // en rojo solo los de Stop: los demás eventos casi no dejan huella en la transcripción, y «sin huella» no es «no se activó»
      return { evento: f.evento, nombre: f.nombre, ruta: f.ruta, declarado: de(S, f.declarado), veces: f.veces, ultima: iso(f.ultimaMs), mediaMs: media(f.ms), maxMs: f.ms.length ? Math.max(...f.ms) : null, bloqueos: f.bloqueos, sinHuella, rojo: sinHuella && f.evento === "Stop" }; // null si sinHuella es null
    })
    .sort((a, b) => Number(b.rojo) - Number(a.rojo) || Number(b.sinHuella) - Number(a.sinHuella) || b.veces - a.veces || a.nombre.localeCompare(b.nombre));

  // ---- Tiempos ----
  const hooksMsDe = new Map();
  for (const e of hookEv) if (e.sesion && e.ms !== null) hooksMsDe.set(e.sesion, (hooksMsDe.get(e.sesion) ?? 0) + e.ms);
  // cost-state es una foto: con coste 0 en una sesión con mensajes está vacía (sin dato), y si dura más
  // que la vida observada de la sesión su total no es fiable. El coste de la foto ya no se enseña (el coste es el estimado desde tokens).
  const fotoDe = (id) => {
    const c = costes.get(id);
    const s = sesiones.get(id);
    if (!c || (c.costeUSD === 0 && s.asist > 0)) return null;
    // Si su duración no cuadra con la transcripción, solo el total deja de ser fiable
    return c.totalMs !== null && s.minTs !== null && c.totalMs > s.maxTs - s.minTs + MARGEN_FOTO_MS ? { ...c, totalMs: null, noCuadra: true } : c;
  };
  const tiempos = [...enVentana]
    .sort((a, b) => b[1].maxTs - a[1].maxTs)
    .slice(0, SESIONES_VISIBLES)
    .map(([id, s]) => {
      const c = fotoDe(id);
      return { sesion: id.slice(0, 8), rama: s.rama, carpeta: s.carpeta, ultimo: iso(s.maxTs), totalMs: c?.totalMs ?? null, apiMs: c?.apiMs ?? null, herramientasMs: c?.herramientasMs ?? null, hooksMs: hooksMsDe.get(id) ?? null, noCuadra: c?.noCuadra === true };
    });

  // ---- Registro de jueces ----
  const entradas = [];
  for (const reg of registros) {
    for (const e of reg.entradas) if (Number.isFinite(e.ts) && e.ts >= corte) entradas.push({ ...e, rama: reg.rama });
  }
  const sinAgentId = entradas.filter((e) => !e.agent_id).length;
  const noJueces = entradas.filter((e) => !JUECES.includes(e.agente)).length;
  const registroAntiguo = { aviso: sinAgentId > 0 || noJueces > 0, sinAgentId, noJueces, apuntes: entradas.length };

  const informes = new Map(); // rama|agente → { claves, sinId }
  for (const e of entradas) {
    if (e.veredicto === "lanzado" || !JUECES.includes(e.agente)) continue; // solo jueces: el registro viejo también apunta a constructores
    const k = `${e.rama}|${e.agente}`;
    const g = informes.get(k) ?? { rama: e.rama, agente: e.agente, claves: new Set(), sinAgentId: 0 };
    g.claves.add(e.agent_id ?? `${e.veredicto}|${e.ts}`);
    if (!e.agent_id) g.sinAgentId++;
    informes.set(k, g);
  }
  const relanzados = [...informes.values()].filter((g) => g.claves.size > 1).map((g) => ({ rama: g.rama, agente: g.agente, informes: g.claves.size, sinAgentId: g.sinAgentId })).sort((a, b) => b.informes - a.informes);

  const lanzados = new Map();
  for (const e of entradas) if (e.veredicto === "lanzado" && e.agent_id && !lanzados.has(`${e.rama}|${e.agent_id}`)) lanzados.set(`${e.rama}|${e.agent_id}`, e.ts);
  const juicios = new Map();
  for (const e of entradas) {
    const t0 = lanzados.get(`${e.rama}|${e.agent_id}`);
    if (e.veredicto !== "lanzado" && e.agent_id && t0 !== undefined && e.ts >= t0) juicios.set(`${e.rama}|${e.agent_id}`, { rama: e.rama, agente: e.agente, veredicto: e.veredicto, ms: e.ts - t0, ts: e.ts });
  }
  const juicioLista = [...juicios.values()].sort((a, b) => b.ts - a.ts);

  // ---- Ineficiencias ----
  const bloqueoPor = new Map();
  for (const e of bloqueoEv) {
    const k = clave(e.evento, e.comando);
    const g = bloqueoPor.get(k) ?? { evento: e.evento, nombre: nombreCorto(normalizarComando(e.comando, home)), n: 0, cuenta: new Map() };
    g.n++;
    const motivo = e.texto.replace(/\s+/g, " ").trim().slice(0, MAX_MOTIVO);
    g.cuenta.set(motivo, (g.cuenta.get(motivo) ?? 0) + 1);
    bloqueoPor.set(k, g);
  }
  const bloqueos = [...bloqueoPor.values()].sort((a, b) => b.n - a.n).map((g) => ({ evento: g.evento, nombre: g.nombre, n: g.n, motivos: top(g.cuenta, 3).map(([texto, n]) => ({ texto, n })) }));

  const tokens = new Map();
  for (const m of msgs) {
    if (m.modelo === null) continue; // los modelos sintéticos son ruido
    const t = tokens.get(m.modelo) ?? { modelo: m.modelo, mensajes: 0, entrada: 0, salida: 0, cacheLeida: 0, cacheCreada: 0 };
    t.mensajes++;
    for (const k of ["entrada", "salida", "cacheLeida", "cacheCreada"]) t[k] += m[k];
    tokens.set(m.modelo, t);
  }
  const lanzadosPorTipo = new Map();
  for (const a of agentes) lanzadosPorTipo.set(a.tipo, (lanzadosPorTipo.get(a.tipo) ?? 0) + 1);

  const ultimo = enVentana.reduce((m, [, x]) => Math.max(m, x.maxTs), -Infinity);

  // ---- v1: coste ESTIMADO a precio de API (nunca el totalCostUSD de las fotos) ----
  const { coste, costeAgente } = construirCoste({ corte, rs, sesiones, subagentes, precios, T: T || B, P }); // el coste suma lo de transcripciones y subagentes

  // ---- v1: En directo, rondas por tarea y semáforo ----
  const eventos = construirEventos({ ahora, directos: directo ?? rs, entradas, home });
  const todasRamas = construirRamas({ ahora, entradas, costeAgente, T: T || B, P });
  const abiertas = todasRamas.reduce((n, x) => n + x.abiertas, 0); // en todas las ramas, no solo en las que se enseñan
  const ramas = todasRamas.slice(0, MAX_RAMAS).map(({ ultimoMs: _u, abiertas: _a, ...resto }) => resto);
  const desdeMedianoche = inicioDiaMadrid(ahora);
  const bloqueosHoy = unirBloqueos(
    [...unir(rs.map((r) => r.bloqueos)).values()].map((b) => ({ ts: b.ts, sesion: b.sesion, comando: b.comando })),
    [...unir(rs.map((r) => r.cierres)).values()],
  ).filter((b) => b.ts >= desdeMedianoche);
  const edad = Number.isFinite(ultimo) ? ahora - ultimo : Infinity;
  const nivelHooks = copia.ok === false ? "mal" : edad < UMBRALES_HOOKS_VIVOS.okMs ? "ok" : edad < UMBRALES_HOOKS_VIVOS.avisoMs ? "aviso" : "mal";
  const semaforo = {
    hooksVivos: de(T || C, { nivel: nivelHooks, ultimo: Number.isFinite(ultimo) ? iso(ultimo) : null, copiaOk: copia.ok }),
    bloqueosHoy: de(T, { nivel: bloqueosHoy.length ? "aviso" : "ok", total: bloqueosHoy.length, identificados: bloqueosHoy.filter((b) => b.comando !== null).length }),
    rondasAbiertas: de(R, { nivel: abiertas ? "aviso" : "ok", n: abiertas }),
  };

  return {
    directoMin: VENTANA_DIRECTO_MS / 60000,
    proyectos: de(T, proyectos), // qué carpetas de proyecto entran (el filtro y cuántas), nunca sus nombres
    semaforo,
    eventos: de(T || R, eventos),
    ramas: de(R, ramas),
    coste,
    estado: {
      ultimoEvento: de(T, Number.isFinite(ultimo) ? iso(ultimo) : null),
      sesiones: de(T, enVentana.length),
      lineasRotas: de(T, rs.reduce((n, r) => n + r.rotas, 0)),
      copia: de(C, copia),
      registroAntiguo: de(R, registroAntiguo),
    },
    ficheros: { total: de(T, ficheros.length) },
    hooks: de(T, hooks),
    tiempos: de(T, tiempos),
    jueces: { tiempos: de(R, juicioLista.slice(0, 20).map((j) => ({ rama: j.rama, agente: j.agente, veredicto: j.veredicto, ms: j.ms, ts: iso(j.ts) }))) },
    ineficiencias: {
      bloqueos: de(T, bloqueos),
      relanzados: de(R, relanzados),
      tokens: de(T, [...tokens.values()].sort((a, b) => b.mensajes - a.mensajes)),
      subagentes: de(T, [...lanzadosPorTipo].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n)),
      mensajesSubagente: de(T, msgs.filter((m) => m.lado).length),
    },
    errores,
  };
}
