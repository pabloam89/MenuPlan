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

// El veredicto es la ÚLTIMA línea no vacía del informe, sin decoración (espacios, * _ ` > # | viñetas, emojis, \r),
// y debe ser «Veredicto», un separador (: - – — |) y la respuesta. Cualquier otra cosa es sin_veredicto: no se interpreta
// texto libre. El resto de la línea se ignora, salvo que traiga «pasa» y «no pasa» a la vez: eso es el eco del encargo.
const DECORACION = /^[\s*_`>#|•·\-\p{Extended_Pictographic}️‍]+/u;
const ETIQUETA = /^veredicto[\s*_`]*[:\-–—|]\s*(.*)$/iu;
const ultimaLinea = (texto) => String(texto ?? "").split(/\r?\n/).map((l) => l.replace(DECORACION, "").trim()).filter(Boolean).at(-1) ?? "";

/** pasa | no_pasa | no_se | sin_veredicto, a partir del informe del juez. */
export function veredictoDe(texto) {
  const valor = ETIQUETA.exec(ultimaLinea(texto))?.[1].replace(DECORACION, "").replace(/^[«"“']+/, "").toLowerCase();
  if (valor === undefined) return "sin_veredicto";
  if (/\bno\s+pasa\b/.test(valor) && /\bpasa\b/.test(valor.replace(/\bno\s+pasa\b/g, ""))) return "sin_veredicto"; // eco del encargo
  if (/^no\s+pasa(?!\p{L})/u.test(valor)) return "no_pasa";
  if (/^pasa(?!\p{L})/u.test(valor)) return "pasa";
  return /^no\s+sé(?!\p{L})/u.test(valor) || /^no\s+se[\s.!*_`]*$/.test(valor) ? "no_se" : "sin_veredicto";
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
  return { agente, veredicto: veredictoDe(texto), resumen: ultimaLinea(texto).slice(0, 160), ...(agentId ? { agent_id: agentId } : {}) };
}

const CONCLUYENTE = new Set(["pasa", "no_pasa", "no_se"]);

/**
 * entradas: [{ ts, agente, veredicto, resumen }] del registro de la rama.
 * ultimaEdicion: { juez: ms } — cuándo se tocó por última vez un fichero que lo exige.
 * Un juez vale si fue LANZADO después de la última edición que lo exige: lo que juzga es el código
 * que vio al arrancar, no el que había cuando llegó su informe. Si el apunte trae `agent_id` y hay un
 * «lanzado» del mismo juez y el mismo id, el momento del juicio es el de ese lanzamiento; si no, el del apunte.
 * De sus apuntes, un «no pasa» domina a cualquier «pasa» (misma versión del código: ningún cambio entre ambos);
 * si no hay «no pasa», manda el último concluyente (pasa, no sé). Sin concluyente, un informe sin veredicto
 * legible (sin_veredicto) manda sobre el «lanzado»: el juez ya informó, y mal. Solo un «lanzado» sin informe es «lanzado».
 */
export function evaluar({ requeridos, entradas, ultimaEdicion }) {
  const filas = [];
  for (const juez of Object.keys(requeridos)) {
    const desde = ultimaEdicion[juez] ?? 0;
    const delJuez = entradas.filter((e) => e.agente === juez);
    const momento = (e) => (e.agent_id ? delJuez.find((l) => l.veredicto === "lanzado" && l.agent_id === e.agent_id)?.ts : undefined) ?? e.ts;
    const suyas = delJuez.filter((e) => momento(e) >= desde);
    const conc = suyas.filter((e) => CONCLUYENTE.has(e.veredicto));
    const ultima = conc.findLast((e) => e.veredicto === "no_pasa") ?? conc.at(-1) ?? suyas.findLast((e) => e.veredicto === "sin_veredicto") ?? suyas.at(-1);
    const e = ESTADO[ultima ? ultima.veredicto : "falta"] ?? ESTADO.sin_veredicto;
    filas.push({ juez, ...e, nota: e.nota ?? ultima.resumen ?? "" });
  }
  return filas;
}

// El estado de cada veredicto: icono, nota fija (si la hay) y si impide cerrar. «no sé» avisa y no bloquea (decisión documentada).
const ESTADO = {
  falta: { estado: "falta", icono: "❌", bloquea: true, nota: "no ha corrido tras el último cambio" },
  pasa: { estado: "ok", icono: "✅" },
  no_pasa: { estado: "no_pasa", icono: "❌", bloquea: true },
  no_se: { estado: "dudoso", icono: "⚠️", nota: "el juez dice «no sé»" },
  sin_veredicto: { estado: "ilegible", icono: "❌", bloquea: true, nota: "el informe no acaba en una línea Veredicto" },
  lanzado: { estado: "lanzado", icono: "⏳", bloquea: true, nota: "lanzado, sin informe: espera a que acabe" },
};

export function cuadro(filas) {
  return ["Factoría de Álvaro", ...filas.map((f) => `${f.juez.padEnd(10)} ${f.icono} ${f.nota}`.trimEnd())].join("\n");
}

/** Lo que impide cerrar: falta el juez, no ha informado, informó sin veredicto legible o dijo que no pasa. «no sé» avisa, no bloquea. */
export function bloqueantes(filas) {
  return filas.filter((f) => f.bloquea);
}
