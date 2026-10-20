/**
 * reglas.mjs — qué jueces tocan según lo que cambió, y qué dijeron.
 * Lógica pura (sin disco ni git): la usan los hooks y su test.
 *
 * Mínimo a propósito (principio 0 del núcleo): tres jueces, los que Álvaro
 * necesita hoy. Más jueces se añaden aquí solo con un caso real que los pida.
 */

const ES_TEST = /(\.test\.[mc]?[jt]sx?$|\.snap$|__snapshots__\/)/;
const BOT = /^api\/(_bot|bot)\/|^api\/_prompts\.js$/;
const PANTALLA = /^src\/.*\.(jsx?|tsx?|css)$/;
const CODIGO = /^(src|api|scripts|supabase|factorias)\/.*\.(m?js|jsx?|tsx?|sql)$/;

/** Para cada juez, los ficheros cambiados que lo exigen. */
export function juecesRequeridos(ficheros) {
  const f = ficheros.map((x) => x.replace(/\\/g, "/"));
  const noTest = f.filter((x) => !ES_TEST.test(x));
  const por = {
    evaluador: noTest.filter((x) => BOT.test(x)),
    qa: noTest.filter((x) => PANTALLA.test(x)),
    revisor: f.filter((x) => CODIGO.test(x)),
  };
  return Object.fromEntries(Object.entries(por).filter(([, v]) => v.length));
}

const JUECES = ["revisor", "qa", "evaluador"];

// Una línea EMPIEZA por «Veredicto»: admite delante espacios, citas (>), viñetas, negrita, almohadillas o la barra
// de una tabla; detrás, un separador («:», «-», «–» o la barra de la tabla). Una cita en mitad de una frase no cuenta.
const EMPIEZA_POR_VEREDICTO = /^[\s>*_#|\-–]*veredicto[\s*_]*[:\-–|][\s*_|]*(.*)$/i;

/** Cuántas de las tres respuestas posibles ofrece un texto (≥2: es el encargo, no un informe). */
function opcionesOfrecidas(v) {
  const noPasa = /\bno\s+pasa\b/.test(v);
  const noSe = /\bno\s+s[eé](?![a-z])/.test(v);
  const pasa = /(^|[^a-z])(?<!no\s)pasa(?![a-z])/.test(v);
  return [pasa, noPasa, noSe].filter(Boolean).length;
}

/**
 * La ÚLTIMA línea que empieza por «Veredicto» y da UNA respuesta: { linea, valor } o null.
 * Una línea con varias opciones («pasa | no pasa | no sé») es el encargo, no el informe: no cuenta;
 * una con una sola («no pasa | 2 bloqueantes») sí, aunque lleve «|».
 */
function lineaVeredicto(texto) {
  const validas = String(texto ?? "")
    .split("\n")
    .flatMap((linea) => {
      const m = EMPIEZA_POR_VEREDICTO.exec(linea);
      const valor = m?.[1].toLowerCase().replace(/^[\s*_«"']+/, "");
      return m && opcionesOfrecidas(valor) < 2 ? [{ linea: linea.trim(), valor }] : [];
    });
  return validas.at(-1) ?? null;
}

/** pasa | no_pasa | no_se | sin_veredicto, a partir del texto del juez. */
export function veredictoDe(texto) {
  const t = String(texto ?? "").toLowerCase();
  const m = lineaVeredicto(t);
  if (m) {
    const v = m.valor;
    if (/^no\s+s[eé](?![a-z])/.test(v)) return "no_se";
    if (/^(no\s+pasa|bloque|rechaz|suspend)/.test(v)) return "no_pasa";
    if (/^(pasa|aprob|conforme|ok\b|✅)/.test(v)) return "pasa";
  }
  if (/sin\s+bloqueantes|\b0\s+bloqueantes|ning[uú]n\s+bloqueante/.test(t)) return "pasa";
  return "sin_veredicto";
}

const textoDe = (r) => {
  if (r == null) return "";
  if (typeof r === "string") return r;
  const c = r.content ?? r.result ?? r;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n");
  return JSON.stringify(c);
};

/**
 * Qué apuntar de un evento de hook: { agente, veredicto, resumen } o null.
 * Tres fuentes del informe de un juez (documentadas en la referencia de hooks):
 * - SubagentStop: `agent_type` y `last_assistant_message` (el texto final del subagente, también en segundo plano).
 * - PostToolUse de SubagentHandback: el informe es `tool_input.message` (si el subagente lo entrega por ahí).
 * - PostToolUse de Agent: en primer plano trae el texto; en segundo plano (`status: "async_launched"`)
 *   solo avisa del lanzamiento y repite el encargo, así que queda «lanzado», nunca un veredicto.
 */
export function apunteDe(ev) {
  let agente;
  let agentId;
  let texto = "";
  if (ev.hook_event_name === "SubagentStop") {
    agente = ev.agent_type;
    agentId = ev.agent_id;
    texto = ev.last_assistant_message;
  } else if (ev.tool_name === "SubagentHandback") {
    agente = ev.agent_type;
    agentId = ev.agent_id;
    texto = ev.tool_input?.message;
  } else {
    agente = ev.tool_input?.subagent_type;
    const r = ev.tool_response;
    agentId = r && typeof r === "object" ? (r.agentId ?? r.agent_id) : undefined;
    if (r && typeof r === "object" && (r.isAsync === true || r.status === "async_launched")) {
      return agente && JUECES.includes(agente) ? { agente, veredicto: "lanzado", resumen: "lanzado, sin informe", ...(agentId ? { agent_id: agentId } : {}) } : null;
    }
    texto = textoDe(r);
  }
  if (!agente || !JUECES.includes(agente)) return null;
  texto = String(texto ?? "");
  const linea = lineaVeredicto(texto)?.linea ?? texto.split("\n").find((l) => l.trim()) ?? "";
  return { agente, veredicto: veredictoDe(texto), resumen: linea.trim().slice(0, 160), ...(agentId ? { agent_id: agentId } : {}) };
}

const CONCLUYENTE = new Set(["pasa", "no_pasa", "no_se"]);

/**
 * entradas: [{ ts, agente, veredicto, resumen }] del registro de la rama.
 * ultimaEdicion: { juez: ms } — cuándo se tocó por última vez un fichero que lo exige.
 * Un juez vale si fue LANZADO después de la última edición que lo exige: lo que juzga es el código
 * que vio al arrancar, no el que había cuando llegó su informe. Si el apunte trae `agent_id` y hay un
 * «lanzado» del mismo juez y el mismo id, el momento del juicio es el de ese lanzamiento; si no, el del apunte.
 * De sus apuntes, manda el último con veredicto concluyente (pasa, no pasa, no sé). Mientras no haya
 * ninguno y exista un «lanzado», el estado sigue siendo «lanzado» (un «sin veredicto» de SubagentStop
 * no lo sustituye); solo «sin veredicto» y nunca lanzado es «dudoso».
 */
export function evaluar({ requeridos, entradas, ultimaEdicion }) {
  const filas = [];
  for (const juez of Object.keys(requeridos)) {
    const desde = ultimaEdicion[juez] ?? 0;
    const delJuez = entradas.filter((e) => e.agente === juez);
    const momento = (e) => (e.agent_id ? delJuez.find((l) => l.veredicto === "lanzado" && l.agent_id === e.agent_id)?.ts : undefined) ?? e.ts;
    const suyas = delJuez.filter((e) => momento(e) >= desde);
    const ultima = suyas.filter((e) => CONCLUYENTE.has(e.veredicto)).at(-1) ?? (suyas.some((e) => e.veredicto === "lanzado") ? undefined : suyas.at(-1));
    if (!ultima && suyas.length) filas.push({ juez, estado: "lanzado", nota: "lanzado, sin informe: espera a que acabe" });
    else if (!ultima) filas.push({ juez, estado: "falta", nota: "no ha corrido tras el último cambio" });
    else if (ultima.veredicto === "no_pasa") filas.push({ juez, estado: "no_pasa", nota: ultima.resumen ?? "" });
    else if (ultima.veredicto === "pasa") filas.push({ juez, estado: "ok", nota: ultima.resumen ?? "" });
    else filas.push({ juez, estado: "dudoso", nota: ultima.veredicto === "no_se" ? "el juez dice «no sé»" : "sin veredicto en formato claro" });
  }
  return filas;
}

const ICONO = { ok: "✅", falta: "❌", lanzado: "⏳", no_pasa: "❌", dudoso: "⚠️" };

export function cuadro(filas) {
  return ["Factoría de Álvaro", ...filas.map((f) => `${f.juez.padEnd(10)} ${ICONO[f.estado]} ${f.nota}`.trimEnd())].join("\n");
}

/** Lo que impide cerrar: falta el juez, no ha informado o dijo que no pasa. Lo dudoso avisa, no bloquea. */
export function bloqueantes(filas) {
  return filas.filter((f) => f.estado === "falta" || f.estado === "lanzado" || f.estado === "no_pasa");
}
