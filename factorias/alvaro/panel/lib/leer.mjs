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
// Los jueces de la factoría (los mismos de factorias/alvaro/lib/reglas.mjs: allí no se exporta la lista).
const JUECES = ["revisor", "qa", "evaluador"];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const num0 = (v) => num(v) ?? 0;
const texto = (v) => (typeof v === "string" ? v : null);
// Modelo y tipo de subagente salen a la página: solo caracteres de un nombre y 40 como mucho.
const limpio = (v) => String(v).replace(/[^\w.:-]/g, "_").slice(0, 40);

/** Acumulador de UN fichero de transcripción. */
export function nuevoResumen() {
  return {
    lineas: 0,
    rotas: 0,
    hooks: new Map(), // clave → { ts, sesion, evento, comando, ms }
    bloqueos: new Map(), // uuid → { ts, sesion, evento, comando, texto }
    cierres: new Map(), // uuid → { ts, sesion, errores, impidio }
    msgs: new Map(), // message.id → { ts, sesion, modelo, lado, entrada, salida, cacheLeida, cacheCreada }
    agentes: new Map(), // id del tool_use → { ts, sesion, tipo }
    costes: new Map(), // sesión → su ÚLTIMA foto cost-state { costeUSD, totalMs, apiMs, herramientasMs, tras: líneas del asistente posteriores }
    sesiones: new Map(), // sesión → { maxTs, rama, carpeta, asist: líneas del asistente }
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
  r.lineas++;
  const sesion = texto(o.sessionId);
  const ts = Date.parse(o.timestamp);
  const tsOk = Number.isFinite(ts) ? ts : null;
  if (sesion) {
    const m = r.sesiones.get(sesion) ?? { maxTs: null, rama: null, carpeta: null, asist: 0 };
    if (tsOk !== null) m.maxTs = m.maxTs === null ? tsOk : Math.max(m.maxTs, tsOk);
    if (texto(o.gitBranch)) m.rama = o.gitBranch;
    if (texto(o.cwd)) m.carpeta = o.cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
    r.sesiones.set(sesion, m);
  }

  if (o.type === "assistant") {
    const msg = o.message ?? {};
    if (sesion) {
      r.sesiones.get(sesion).asist++;
      if (r.costes.has(sesion)) r.costes.get(sesion).tras++; // la foto de coste ya no es lo último de la sesión
    }
    const id = texto(msg.id) ?? texto(o.uuid);
    if (id) {
      // la misma respuesta se repite en varias líneas: se cuenta una vez, con lo mayor de cada cifra
      const u = msg.usage ?? {};
      const previo = r.msgs.get(id);
      const nuevo = { ts: tsOk, sesion, modelo: msg.model === "<synthetic>" ? null : limpio(texto(msg.model) ?? "(sin modelo)"), lado: o.isSidechain === true, entrada: num0(u.input_tokens), salida: num0(u.output_tokens), cacheLeida: num0(u.cache_read_input_tokens), cacheCreada: num0(u.cache_creation_input_tokens) };
      if (previo) for (const k of ["entrada", "salida", "cacheLeida", "cacheCreada"]) nuevo[k] = Math.max(nuevo[k], previo[k]);
      r.msgs.set(id, nuevo);
    }
    if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b && b.type === "tool_use" && b.name === "Agent") r.agentes.set(texto(b.id) ?? `${o.uuid}#${r.agentes.size}`, { ts: tsOk, sesion, tipo: texto(b.input?.subagent_type) === null ? null : limpio(b.input.subagent_type) });
      }
    }
  } else if (o.type === "system" && o.subtype === "stop_hook_summary") {
    const clave = texto(o.uuid) ?? `${tsOk}#${r.cierres.size}`;
    (Array.isArray(o.hookInfos) ? o.hookInfos : []).forEach((h, i) => r.hooks.set(`${clave}#${i}`, { ts: tsOk, sesion, evento: "Stop", comando: texto(h?.command), ms: num(h?.durationMs) }));
    r.cierres.set(clave, { ts: tsOk, sesion, errores: Array.isArray(o.hookErrors) ? o.hookErrors.length : 0, impidio: o.preventedContinuation === true });
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
    r.costes.set(sesion, { costeUSD: num(o.totalCostUSD), totalMs: num(o.totalDuration), apiMs: num(o.totalAPIDuration), herramientasMs: num(o.totalToolDuration), tras: 0 });
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

const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const unir = (mapas) => {
  const sal = new Map();
  for (const m of mapas) for (const [k, v] of m) if (!sal.has(k)) sal.set(k, v);
  return sal;
};
const top = (cuenta, n) => [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * Las cifras de la página. ficheros: [{ ruta, mtimeMs, resumen }] ya limitados a la ventana por fecha
 * de modificación; aquí se filtran además los eventos por su propia hora.
 * declarados: null si no se pudo leer settings.json (entonces no se juzga «no visto»).
 */
export function agregar({ ahora, dias, ficheros, registros, declarados, copia, home, errores }) {
  const corte = ahora - dias * 864e5;
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
        const nuevaMax = m.maxTs !== null && (s.maxTs === null || m.maxTs >= s.maxTs);
        s.maxTs = Math.max(s.maxTs ?? -Infinity, m.maxTs ?? -Infinity);
        if (nuevaMax) {
          s.rama = m.rama ?? s.rama;
          s.carpeta = m.carpeta ?? s.carpeta;
        }
      }
    }
    for (const [id, c] of r.costes) costes.set(id, c); // el fichero más reciente manda
  }
  const enVentana = [...sesiones].filter(([, s]) => s.maxTs !== null && s.maxTs >= corte);

  const hookEv = [...unir(rs.map((r) => r.hooks)).values()].filter((e) => dentro(e.ts));
  const bloqueoEv = [...unir(rs.map((r) => r.bloqueos)).values()].filter((e) => dentro(e.ts));
  const cierreEv = [...unir(rs.map((r) => r.cierres)).values()].filter((e) => dentro(e.ts));
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
  for (const d of declarados ?? []) fila(d.evento, d.comando).declarado = true;
  for (const e of hookEv) {
    const f = fila(e.evento, e.comando);
    f.veces++;
    if (e.ts !== null) f.ultimaMs = Math.max(f.ultimaMs ?? 0, e.ts);
    if (e.ms !== null) f.ms.push(e.ms);
  }
  for (const e of bloqueoEv) fila(e.evento, e.comando).bloqueos++;
  const hooks = [...filas.values()]
    .map((f) => ({ evento: f.evento, nombre: f.nombre, ruta: f.ruta, declarado: f.declarado, veces: f.veces, ultima: iso(f.ultimaMs), mediaMs: media(f.ms), maxMs: f.ms.length ? Math.max(...f.ms) : null, bloqueos: f.bloqueos, sinHuella: declarados !== null && f.declarado && f.veces === 0 }))
    // en rojo solo los de Stop: los demás eventos casi no dejan huella en la transcripción, y «sin huella» no es «no se activó»
    .map((h) => ({ ...h, rojo: h.sinHuella && h.evento === "Stop" }))
    .sort((a, b) => Number(b.rojo) - Number(a.rojo) || Number(b.sinHuella) - Number(a.sinHuella) || b.veces - a.veces || a.nombre.localeCompare(b.nombre));

  // ---- Tiempos ----
  const hooksMsDe = new Map();
  for (const e of hookEv) if (e.sesion && e.ms !== null) hooksMsDe.set(e.sesion, (hooksMsDe.get(e.sesion) ?? 0) + e.ms);
  // Una foto con coste 0 en una sesión con mensajes del asistente es una foto vacía: sin dato, nunca «$0».
  const porCoste = (id) => {
    const c = costes.get(id) ?? null;
    return c && c.costeUSD === 0 && sesiones.get(id).asist > 0 ? null : c;
  };
  // Cálculo, no medida: solo si hay API y herramientas medidas (con 0 la foto es de antes de que hubiera nada)
  const resta = (c) => (c && c.totalMs !== null && c.apiMs > 0 && c.herramientasMs > 0 ? c.totalMs - c.apiMs - c.herramientasMs : null);
  const tiempos = [...enVentana]
    .sort((a, b) => b[1].maxTs - a[1].maxTs)
    .slice(0, SESIONES_VISIBLES)
    .map(([id, s]) => {
      const c = porCoste(id);
      return { sesion: id.slice(0, 8), rama: s.rama, carpeta: s.carpeta, ultimo: iso(s.maxTs), totalMs: c?.totalMs ?? null, apiMs: c?.apiMs ?? null, herramientasMs: c?.herramientasMs ?? null, hooksMs: hooksMsDe.get(id) ?? 0, esperaMs: resta(c), costeUSD: c?.costeUSD ?? null, fotoAtrasada: (c?.tras ?? 0) > 0 };
    });

  // ---- Registro de jueces ----
  const entradas = [];
  let registroRotas = 0;
  for (const reg of registros) {
    registroRotas += reg.rotas;
    for (const e of reg.entradas) if (Number.isFinite(e.ts) && e.ts >= corte) entradas.push({ ...e, rama: reg.rama });
  }
  const sinAgentId = entradas.filter((e) => !e.agent_id).length;
  const noJueces = entradas.filter((e) => !JUECES.includes(e.agente)).length;
  const registroAntiguo = { aviso: copia.ok === false || sinAgentId > 0 || noJueces > 0, sinAgentId, noJueces, apuntes: entradas.length, lineasRotas: registroRotas };

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
  const porAgente = new Map();
  for (const j of juicioLista) porAgente.set(j.agente, [...(porAgente.get(j.agente) ?? []), j.ms]);

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
  const subagentes = new Map();
  for (const a of agentes) subagentes.set(a.tipo, (subagentes.get(a.tipo) ?? 0) + 1);

  const costePorSesion = enVentana
    .map(([id, s]) => ({ sesion: id.slice(0, 8), rama: s.rama, carpeta: s.carpeta, costeUSD: porCoste(id)?.costeUSD ?? null, fotoAtrasada: (porCoste(id)?.tras ?? 0) > 0 }))
    .filter((c) => c.costeUSD !== null)
    .sort((a, b) => b.costeUSD - a.costeUSD);

  const ultimo = enVentana.reduce((m, [, s]) => Math.max(m, s.maxTs), -Infinity);
  return {
    estado: {
      ultimoEvento: Number.isFinite(ultimo) ? iso(ultimo) : null,
      sesiones: enVentana.length,
      lineasRotas: rs.reduce((n, r) => n + r.rotas, 0),
      copia,
      registroAntiguo,
      declaradosLeidos: declarados !== null,
    },
    hooks,
    tiempos,
    jueces: {
      tiempos: juicioLista.slice(0, 20).map((j) => ({ rama: j.rama, agente: j.agente, veredicto: j.veredicto, ms: j.ms, ts: iso(j.ts) })),
      porAgente: [...porAgente].map(([agente, ms]) => ({ agente, n: ms.length, mediaMs: media(ms), maxMs: Math.max(...ms) })),
    },
    ineficiencias: {
      bloqueos,
      cierres: { resumenesConError: cierreEv.filter((c) => c.errores > 0).length, errores: cierreEv.reduce((n, c) => n + c.errores, 0), impidieronContinuar: cierreEv.filter((c) => c.impidio).length },
      relanzados,
      costes: { total: costePorSesion.reduce((n, c) => n + c.costeUSD, 0), sesiones: costePorSesion.slice(0, SESIONES_VISIBLES) },
      tokens: [...tokens.values()].sort((a, b) => b.mensajes - a.mensajes),
      subagentes: [...subagentes].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
      mensajesSubagente: msgs.filter((m) => m.lado).length,
    },
    errores,
  };
}
