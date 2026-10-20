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
const CODIGO = /^(src|api|scripts|supabase)\/.*\.(m?js|jsx?|tsx?|sql)$/;

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

/**
 * La última línea «Veredicto: …» con UNA sola opción. Una línea con alternativas
 * («pasa | no pasa | no sé») es el encargo, no el informe: no cuenta.
 */
function lineaVeredicto(texto) {
  const t = String(texto ?? "").toLowerCase();
  const validas = [...t.matchAll(/veredicto\s*[:\-–]\s*\**\s*([^\n]*)/g)].filter((m) => !m[1].includes("|"));
  return validas.at(-1) ?? null;
}

/** pasa | no_pasa | no_se | sin_veredicto, a partir del texto del juez. */
export function veredictoDe(texto) {
  const t = String(texto ?? "").toLowerCase();
  const m = lineaVeredicto(t);
  if (m) {
    const v = m[1].trim();
    if (/^no\s+s[eé](?![a-z])/.test(v)) return "no_se";
    if (/^(no\s+pasa|bloque|rechaz|suspend)/.test(v)) return "no_pasa";
    if (/^(pasa|aprob|conforme|ok\b|✅)/.test(v)) return "pasa";
  }
  if (/sin\s+bloqueantes|0\s+bloqueantes|ning[uú]n\s+bloqueante/.test(t)) return "pasa";
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
  let texto = "";
  if (ev.hook_event_name === "SubagentStop") {
    agente = ev.agent_type;
    texto = ev.last_assistant_message;
  } else if (ev.tool_name === "SubagentHandback") {
    agente = ev.agent_type;
    texto = ev.tool_input?.message;
  } else {
    agente = ev.tool_input?.subagent_type;
    const r = ev.tool_response;
    if (r && typeof r === "object" && (r.isAsync === true || r.status === "async_launched")) {
      return agente && JUECES.includes(agente) ? { agente, veredicto: "lanzado", resumen: "lanzado, sin informe" } : null;
    }
    texto = textoDe(r);
  }
  if (!agente || !JUECES.includes(agente)) return null;
  texto = String(texto ?? "");
  const linea = lineaVeredicto(texto)?.[0] ?? texto.split("\n").find((l) => l.trim()) ?? "";
  return { agente, veredicto: veredictoDe(texto), resumen: linea.trim().slice(0, 160) };
}

const CONCLUYENTE = new Set(["pasa", "no_pasa", "no_se"]);

/**
 * entradas: [{ ts, agente, veredicto, resumen }] del registro de la rama.
 * ultimaEdicion: { juez: ms } — cuándo se tocó por última vez un fichero que lo exige.
 * Un juez vale si corrió DESPUÉS de la última edición que lo exige. De sus apuntes,
 * manda el último con veredicto; si no hay, el último sin veredicto claro; si solo hay
 * «lanzado», el juez aún no ha informado.
 */
export function evaluar({ requeridos, entradas, ultimaEdicion }) {
  const filas = [];
  for (const juez of Object.keys(requeridos)) {
    const desde = ultimaEdicion[juez] ?? 0;
    const suyas = entradas.filter((e) => e.agente === juez && e.ts >= desde);
    const ultima = suyas.filter((e) => CONCLUYENTE.has(e.veredicto)).at(-1) ?? suyas.filter((e) => e.veredicto !== "lanzado").at(-1);
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
