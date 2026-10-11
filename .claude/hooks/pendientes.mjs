/**
 * pendientes.mjs — que nada pendiente se quede solo en el chat.
 *
 * Por qué: el 8 oct 2026 la sesión del plan maestro tenía cinco decisiones para
 * Pablo que solo existían en la conversación; se pasaron a issues porque él lo
 * pidió. Si la sesión se hubiera cerrado, se perdían (encargo #207, de #185).
 *
 * Claude Code lo ejecuta cuando la sesión termina de responder (Stop, ver
 * .claude/settings.json). Si su último mensaje (`last_assistant_message`, ver
 * `aMirar`) deja decisiones o pendientes y
 * en toda la sesión no se ha creado ni comentado ningún issue, la frena UNA vez
 * con el recordatorio; la sesión decide si pasarlos a issues o explicar por qué
 * no hace falta. Nunca dos veces por sesión, ni en bucle (`stop_hook_active`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Frases que dicen «esto queda por decidir o por hacer» (sin acentos). */
const PENDIENTE = /decisiones (?:para pablo|pendientes)|quedan? pendientes?|lo dejo pendiente|te toca decidir|falta que decidas/i;
/** Lo que dice que no queda nada: «ninguna», «sin pendientes», «no hay»… */
const NADA = /\b(?:sin|nada|ningun[oa]?|no hay|no quedan?)\b/i;
/** Comandos que dejan rastro en un issue. */
const A_ISSUE = /npm run issues\s+--\s+--nuevo|gh\s+issue\s+(?:create|comment)|--colgar/;

/**
 * ¿Deja el último mensaje pendientes sin issue, y la sesión no ha tocado
 * ninguno? Un pendiente cuenta si lo que lo sigue (el resto de la línea y la
 * lista que cuelga debajo) tiene algo que no cita un `#n` ni dice «ninguna»:
 * la cabecera fija «DECISIONES PENDIENTES: ninguna» del informe de los agentes
 * o «Queda pendiente el #94» no frenan.
 */
export function pendientesSinIssue({ ultimo, comandos }) {
  if (comandos.some((c) => A_ISSUE.test(String(c)))) return false;
  const lineas = String(ultimo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").split("\n");
  return lineas.some((l, i) => {
    const m = PENDIENTE.exec(l);
    if (!m || NADA.test(l.slice(0, m.index + m[0].length))) return false;
    const debajo = [];
    for (const s of lineas.slice(i + 1, i + 16)) {
      if (!s.trim()) break;
      debajo.push(s);
    }
    const items = [l.slice(m.index + m[0].length), ...debajo].map((s) => s.replace(/^[\s:*\-–·.]+/, "").trim()).filter(Boolean);
    if (!items.length) return true;
    return items.some((s) => !/#\d+/.test(s) && !NADA.test(s));
  });
}

/**
 * El transcript (JSONL) ya parseado: una fila por línea, `null` si no era JSON (cortada al
 * escribir). Se parsea UNA vez en el hook y se pasa a todo lo demás (#462): cada función
 * acepta el texto o estas filas.
 */
export function filasDe(jsonl) {
  if (Array.isArray(jsonl)) return jsonl;
  return String(jsonl ?? "").split("\n").map((linea) => {
    try {
      return JSON.parse(linea);
    } catch {
      return null; // a propósito: una línea del transcript que no es JSON se salta
    }
  });
}

/** Del transcript (JSONL): el último texto de Claude y todos los comandos de shell. */
export function leerTranscript(jsonl) {
  let ultimo = "";
  const comandos = [];
  for (const e of filasDe(jsonl)) {
    if (e?.type !== "assistant") continue;
    const partes = Array.isArray(e.message?.content) ? e.message.content : [];
    const texto = partes.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    if (texto.trim()) ultimo = texto;
    for (const p of partes) if (p.type === "tool_use" && p.input?.command) comandos.push(p.input.command);
  }
  return { ultimo, comandos };
}

// ── El freno de los casos (#185) ──────────────────────────────────────────────
//
// «Cuando algo falla: hasta el problema de fondo» (CLAUDE.md) pide registrar
// cada fallo del camino como un caso. El 9 oct 2026 una sesión de siete PR no
// registró ninguno hasta que Pablo lo preguntó. La puerta firme es la línea
// «Casos:» del PR (guardia y CI); esto frena una vez, al terminar, a la sesión
// que tuvo señales de fallo y no dejó rastro de haber registrado nada.

/** Un `[guardia]` que no es un fallo: la puerta de las skills y la de «Casos:» piden algo, no han roto nada. */
const GUARDIA_DE_TRAMITE = /abre antes (?:la|las) skills?|línea «Casos:»|falta la línea|«Casos:/i;

/** Excepciones conocidas: tests flaky ya registrados como caso, que no cuentan como señal. */
export const FLAKY_CONOCIDOS = { "dominios-skills.test.js": "#307" };

/**
 * Las órdenes de un comando, sin ejecutarlo: lo que hay entre `&&`, `;`, `|` y
 * saltos de línea. DEUDA CONOCIDA: parte sin respetar comillas, así que un
 * título con `;`, `|` o `&&` dentro (`--nuevo "a; b" --tipo caso`) se corta y
 * puede no contar como rastro; el coste es que el freno salte una vez de más
 * (y salir de él cuesta una línea). Parsear comillas bien no compensa.
 */
const ordenesDe = (cmd) => String(cmd).split(/&&|\|\||;|\||\n/).map((s) => s.trim()).filter(Boolean);
const LANZA_TESTS = /^(?:\w+=\S+\s+)*(?:npx\s+vitest|npm\s+(?:run\s+)?test|vitest)\b/;
const ES_ISSUES = /^(?:\w+=\S+\s+)*(?:npm\s+run\s+(?:--silent\s+)?issues|node\s+["']?(?:[A-Za-z]:)?(?:\.?[\\/])?(?:[\w.-]+[\\/])*scripts[\\/]issues\.mjs)(?![\w.-])/;
const ES_PR = /^(?:\w+=\S+\s+)*gh\s+pr\s+(?:create|edit)\b/;
const LINEA_CASOS = /\bCasos\s*:\s*(?:#\d|ninguno)/i;

/** ¿Ejecuta este comando de Bash vitest o npm test? (no un grep que los nombre) */
const lanzaTests = (cmd) => ordenesDe(cmd).some((o) => LANZA_TESTS.test(o));

/**
 * ¿Deja este comando un caso registrado? Solo lo que se EJECUTA cuenta:
 *  - `npm run issues -- --nuevo … --tipo caso` o `--colgar`;
 *  - `gh issue comment N` si algún resultado de la sesión mostró ese #N como tipo:caso;
 *  - un `gh pr create|edit` con la línea `Casos:` en el comando o en el fichero de
 *    `--body-file` que la sesión escribió (`escritos`: nombre de fichero → contenido).
 * Escribir `--colgar` en un fichero o buscar «Casos: ninguno» con grep no es rastro.
 */
function dejaCaso(cmd, { escritos, vistosCaso }) {
  for (const o of ordenesDe(cmd)) {
    if (ES_ISSUES.test(o)) {
      // Las opciones se miran sin lo que va entre comillas: `--cuerpo "usa --tipo caso"`
      // no es un tipo. Solo se salva `--tipo "caso"`, que se normaliza antes.
      const opciones = o.replace(/--tipo\s+["'](\w+)["']/g, "--tipo $1").replace(/"[^"]*"|'[^']*'/g, '""');
      if (/--colgar\b/.test(opciones)) return true;
      if (/--nuevo\b/.test(opciones) && /--tipo\s+caso\b/.test(opciones)) return true;
    }
    const c = o.match(/^gh\s+issue\s+comment\s+#?(\d+)/);
    if (c && vistosCaso.has(c[1])) return true;
    if (ES_PR.test(o)) {
      if (LINEA_CASOS.test(cmd)) return true;
      const f = o.match(/(?:-F|--body-file)(?:\s+|=)["']?([^\s"']+)/)?.[1];
      if (f && LINEA_CASOS.test(escritos.get(nombreDe(f)) ?? "")) return true;
    }
  }
  return false;
}

const sinColor = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");
const nombreDe = (ruta) => String(ruta).split(/[\\/]/).pop();
const textoDe = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text ?? "").join("\n") : "");

/**
 * Del transcript: las señales de fallo de la sesión y si dejó rastro de haber
 * registrado casos. Señales (cada una con su origen, para decirlas):
 *  - informe de un agente con `ESTADO: bloqueado|fallo` o un hallazgo `[bloqueante]`;
 *  - vitest en rojo (`FAIL fichero`) en un fichero que la sesión no tocó: un test
 *    que falla y no es el tuyo es un caso; el nuevo que ves fallar, no;
 *  - una denegación de la guardia (salvo las de trámite).
 * → { senales: string[], registrado: boolean }
 */
export function senalesDeFallo(jsonl) {
  const usos = new Map(); // id → { name, command }
  const tocados = new Set();
  const comandos = [];
  const escritos = new Map(); // nombre de fichero → lo último que se escribió con Write
  const resultados = [];
  for (const e of filasDe(jsonl)) {
    const partes = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const p of partes) {
      if (e.type === "assistant" && p.type === "tool_use") {
        usos.set(p.id, { name: p.name, command: p.input?.command ?? "" });
        if (p.input?.command && /^(?:Bash|PowerShell)$/.test(p.name)) comandos.push(p.input.command);
        if (p.input?.content && p.input?.file_path) escritos.set(nombreDe(p.input.file_path), String(p.input.content));
        const f = p.input?.file_path;
        if (f) tocados.add(nombreDe(f));
      } else if (e.type === "user" && p.type === "tool_result") {
        resultados.push({ uso: usos.get(p.tool_use_id), texto: sinColor(textoDe(p.content)), error: p.is_error === true });
      }
    }
  }
  const senales = [];
  for (const { uso, texto, error } of resultados) {
    if (!uso) continue;
    if (/^(?:Agent|Task)$/.test(uso.name)) {
      const m = texto.match(/^\s*ESTADO:\s*(bloqueado|fallo)\b/im);
      if (m) senales.push(`informe de un agente con ESTADO: ${m[1]}`);
      else if (/^\s*-\s*\[bloqueante\]/im.test(texto)) senales.push("informe de un agente con un hallazgo bloqueante");
    } else if (/^(?:Bash|PowerShell)$/.test(uso.name)) {
      if (lanzaTests(uso.command)) {
        const ajenos = [...texto.matchAll(/^\s*FAIL\s+(\S+)/gm)].map((m) => nombreDe(m[1])).filter((f) => !tocados.has(f) && !Object.hasOwn(FLAKY_CONOCIDOS, f));
        if (ajenos.length) senales.push(`vitest en rojo en ${[...new Set(ajenos)].slice(0, 3).join(", ")}, que no tocaste`);
      }
    }
    if (error && /^(?:Bash|PowerShell|Edit|Write|MultiEdit)$/.test(uso.name) && texto.includes("[guardia]") && !GUARDIA_DE_TRAMITE.test(texto)) {
      senales.push(`la guardia te negó un ${uso.name === "Edit" || uso.name === "Write" || uso.name === "MultiEdit" ? "edit" : "comando"}`);
    }
  }
  // Los #N que algún resultado de la sesión mostró como tipo:caso (para `gh issue comment N`).
  const vistosCaso = new Set();
  for (const { texto } of resultados) {
    if (!texto.includes("tipo:caso")) continue;
    for (const m of texto.matchAll(/(?<!\d)#?(\d{1,8})(?!\d)/g)) vistosCaso.add(m[1]);
  }
  return { senales: [...new Set(senales)], registrado: comandos.some((c) => dejaCaso(c, { escritos, vistosCaso })) };
}

/** El mensaje del freno: las señales y qué hacer. Sale una sola vez por sesión. */
export function recordatorioDeCasos(senales) {
  return "[casos] En esta sesión hubo señales de fallo y no hay rastro de ningún caso registrado ni de una línea «Casos:» en un PR:\n"
    + senales.slice(0, 5).map((s) => `- ${s}`).join("\n")
    + "\nCada fallo del camino es un caso (CLAUDE.md, «Cuando algo falla»): analiza su problema de fondo y regístralo con "
    + "`npm run issues -- --nuevo \"…\" --tipo caso --analisis <nuevo|abierto|no-aguanto-roto|no-aguanto-corto|puntual> --area … --cuerpo <fichero>` "
    + "(un puntual lleva su «Puntual porque …»), y pon «Casos: #n» en el PR. "
    + "Si ninguna es un fallo de verdad (un test que viste fallar a propósito, un obstáculo que ya estaba resuelto), "
    + "di en una línea por qué y termina: este aviso no vuelve a salir.";
}

export const RECORDATORIO = "[pendientes] Tu último mensaje deja decisiones o pendientes, y en esta sesión no has creado ni comentado ningún issue. "
  + "El chat se pierde al cerrar: pasa cada decisión a un issue (`npm run issues -- --nuevo \"…\" --tipo decision --area … --cuerpo <fichero>`, que se asigna a Pablo) "
  + "y cada trabajo por hacer a un encargo, o di en una línea por qué no hace falta. Este aviso sale una sola vez por sesión.";

// ── El freno del estado fresco (#462, fondo #231) ─────────────────────────────
//
// Clase: toda afirmación de estado dada de memoria o de un resumen y no de la
// fuente en ese momento (un issue «abierto» que ya estaba cerrado). Este freno
// mira, al terminar, si el mensaje final cuenta el estado de un issue o PR (y, desde
// #579, de un despliegue, de la base de datos o del CI: TEMAS_ESTADO) y si la sesión
// leyó la fuente de ESE tema en los últimos 15 minutos; si no, frena una vez por turno.
// Los subagentes siguen fuera (nota de #579: su informe llega a la sesión como resultado
// de una herramienta y el Stop de un subagente es otro evento; ver el informe del encargo).
//
// ES SEMIDURO: lee TEXTO (como el fondo #174). Un mensaje que cuenta el estado
// sin `#n` junto a la palabra, o con otra palabra de estado, se escapa (falso
// negativo); uno que cita «#12 pendiente» de otra cosa frena una vuelta de más
// (falso positivo). Lo que frena se cuenta en eventos.jsonl (`estado_sin_leer`)
// para medir ambos. Solo la sesión principal: el Stop de un subagente no pasa
// por aquí, y si llega `agent_id` se ignora. Un freno por turno, nunca en bucle.
//
// «Lectura» quiere decir «la sesión escribió una orden que lo parece»
// (`npm run situacion`, `gh issue view`…), no que la fuente respondiera ni que
// su resultado se citara. No se endurece a propósito: comprobar la respuesta
// costaría más falsos frenos que verdades; primero se mide con `estado_sin_leer`.

/** Minutos que dura fresca una lectura de la fuente. */
export const MINUTOS_FRESCA = 15;
/** Motivos del evento (vocabulario cerrado): ninguna lectura en la sesión, o solo una vieja. */
export const MOTIVOS_ESTADO = ["sin-lectura", "lectura-vieja"];

/** Palabras que cuentan el estado de un issue o PR (sin acentos, en minúsculas). */
const PALABRA_ESTADO = "abiert[oa]s?|cerrad[oa]s?|fusionad[oa]s?|mergead[oa]s?|pendientes?|esperando|lo lleva|la lleva|bloquea|bloquead[oa]s?|en curso";
// El número no va pegado a una palabra, ruta o color: `pendientes.mjs:#12` y `#123abc` no son un issue.
const NUM = "(?<![\\w.:/])#\\d+(?!\\w)";
const ESTADO_ANTES = new RegExp(`\\b(?:${PALABRA_ESTADO}).{0,60}${NUM}`);
const ESTADO_DESPUES = new RegExp(`${NUM}.{0,60}\\b(?:${PALABRA_ESTADO})\\b`);

/**
 * Los temas de estado que se vigilan (vocabulario cerrado, #579 / C9 de la auditoría de agentes):
 * issues y PR (el original de #462), despliegue, base de datos y CI. Cada uno tiene sus
 * frases (AFIRMA) y sus lecturas válidas (`temasQueLee`). Un tema nuevo se añade en los dos
 * sitios, aquí y en `TEMAS_ESTADO` de eventos.mjs (lo cruza el test).
 */
export const TEMAS_ESTADO = ["issues-pr", "despliegue", "base", "ci"];

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿Cuenta el mensaje el estado de algún issue o PR? (`#n` y palabra de estado en la misma línea, fuera de bloques de código) */
function afirmaIssuesPr(texto) {
  const limpio = sinAcentos(String(texto ?? "").replace(/```[\s\S]*?```/g, ""));
  return limpio.split("\n").some((l) => ESTADO_ANTES.test(l) || ESTADO_DESPUES.test(l));
}

// Frases de los temas nuevos (sin acentos, en minúsculas). A propósito estrechas: el freno
// cuesta una vuelta a la sesión, así que solo frases de estado presente («está desplegado»,
// «la migración está aplicada», «el CI está verde»), no el nombre suelto de la cosa.
const DESPLEGADO = [
  /\b(?:esta|estan|queda|quedan)\s+(?:ya\s+)?desplegad[oa]s?\b/,
  /\bya\s+(?:esta|estan)\s+en\s+(?:produccion|prod|staging)\b/,
  /\bdespliegue\b.{0,40}\b(?:esta|sigue)\b.{0,20}\b(?:ready|listo|bloqueado|blocked|fallando|fallido|en error|en curso|verde|rojo)\b/,
];
const APLICADA = "(?:esta|estan|queda|quedan)\\s+(?:ya\\s+)?(?:aplicad[oa]s?|sin aplicar|pendientes? de aplicar)";
const MIGRACION = "(?:migracion(?:es)?|\\b0\\d{3}\\b)";
const BASE = [
  new RegExp(`${MIGRACION}.{0,40}\\b${APLICADA}\\b`),
  new RegExp(`\\b${APLICADA}\\b.{0,40}${MIGRACION}`),
  /\bla\s+base(?:\s+de\s+datos)?\s+(?:ya\s+)?(?:tiene|no\s+tiene|contiene|guarda|esta\s+(?:vacia|llena))\b/,
  /\ben\s+produccion\s+hay\s+\d/,
];
const CI = [
  /\bci\b.{0,40}\b(?:verde|rojo|pasa|pasan|falla|fallan|en curso)\b/,
  /\b(?:verde|rojo)\b.{0,20}\bel\s+ci\b/,
  /\bchecks?\b.{0,40}\b(?:verde|rojo|pasan|pasa|fallan|falla|en curso|pendientes)\b/,
];
/** Líneas que hablan del futuro, de esperar, de lo que hay que hacer o de otro día («cuando el CI esté verde», «hay que comprobar que…», «ayer»): no cuentan un estado de ahora. */
const CONDICIONAL = /\b(?:cuando|hasta que|esper\w+|en cuanto|una vez que|si el|para que|hay que|habria que|comprobar que|ayer)\b/;

/** Para los temas nuevos: sin bloques ni trozos de código, y sin citas (líneas que empiezan por «>») y sin preguntas (con «?» o «¿»). */
function lineasSinCodigo(texto) {
  return sinAcentos(String(texto ?? "").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, " "))
    .split("\n").filter((l) => !/^\s*>/.test(l) && !/[?¿]/.test(l));
}

/** Los temas de estado que cuenta el mensaje, en el orden de TEMAS_ESTADO. */
export function temasAfirmados(texto) {
  const lineas = lineasSinCodigo(texto);
  const alguna = (res, descarta) => lineas.some((l) => !(descarta && descarta.test(l)) && res.some((r) => r.test(l)));
  return TEMAS_ESTADO.filter((t) => ({
    "issues-pr": () => afirmaIssuesPr(texto),
    despliegue: () => alguna(DESPLEGADO, CONDICIONAL),
    base: () => alguna(BASE, CONDICIONAL),
    ci: () => alguna(CI, CONDICIONAL),
  })[t]());
}

/** ¿Cuenta el mensaje el estado de algo vigilado (issue o PR, despliegue, base o CI)? */
export function afirmaEstado(texto) {
  return temasAfirmados(texto).length > 0;
}

// Las sesiones llaman a GitHub con la identidad de la App: `node …/token-sesion.mjs -- gh …`; el prefijo no cambia lo que lee `gh`.
const TOKEN_SESION = `(?:node\\s+["']?(?:[A-Za-z]:)?(?:\\.?[\\\\/])?(?:[\\w.-]+[\\\\/])*scripts[\\\\/]token-sesion\\.mjs["']?\\s+--\\s+)?`;
const orden = (cuerpo) => new RegExp(`^(?:\\w+=\\S+\\s+)*${TOKEN_SESION}(?:${cuerpo})`);
const script = (nombre) => `node\\s+["']?(?:[A-Za-z]:)?(?:\\.?[\\\\/])?(?:[\\w.-]+[\\\\/])*scripts[\\\\/]${nombre}\\.mjs(?![\\w.-])`;
const ES_SITUACION = orden(`npm\\s+run\\s+(?:--silent\\s+)?situacion(?![\\w.-])|${script("situacion")}`);
const ES_LECTURA_GH = orden("gh\\s+(?:issue\\s+(?:view|list|status)|pr\\s+(?:view|list|checks|status|diff))\\b");
const ES_GH_API = orden("gh\\s+api\\b");
const ES_GH_RUN = orden("gh\\s+(?:run\\s+(?:list|view|watch)|workflow\\s+(?:list|view))\\b");
const ES_GH_PR_CI = orden("gh\\s+pr\\s+(?:view|checks|status)\\b");
const ES_ESPERA_CI = orden(`npm\\s+run\\s+(?:--silent\\s+)?espera-ci(?![\\w.-])|${script("espera-ci")}`);
const ES_VERIFICAR = orden(`npm\\s+run\\s+(?:--silent\\s+)?verificar-estado(?![\\w.-])|${script("verificar-estado")}`);
const ES_CONSULTA = orden(`npm\\s+run\\s+(?:--silent\\s+)?consulta(?![\\w.-])|${script("consulta")}`);
/** Solo el ENSAYO (sin `--si` ni `--pablo`) lee la base; con cualquiera de los dos la escribe. */
const ES_APPLY = orden(script("apply-migration"));
const ESCRIBE_MIGRACION = /(?:^|\s)--(?:si|pablo)\b/;
const ES_VERCEL = /^(?:\w+=\S+\s+)*(?:npx\s+)?vercel\s+(?:ls|list|inspect|logs)\b/;
const ES_GIT_ORIGIN = /^(?:\w+=\S+\s+)*git\s+(?:-C\s+\S+\s+)?(?:(?:log|show|rev-list|merge-base|cherry|diff|ls-remote|rev-parse)\b.*\borigin\b|branch\b.*\s(?:-r|-a|--remotes|--all)\b)/;
/** Las herramientas de lectura del conector de Vercel (MCP): despliegues y logs; nada que escriba. */
const ES_MCP_VERCEL = /^mcp__.*vercel.*__(?:list_deployments|get_deployment|get_deployment_build_logs|get_runtime_logs|get_runtime_errors)$/i;

const gh_api_lee = (o) => !/(?:-X|--method)\s*=?\s*(?!GET\b)\S+|\s-[fF]\b|--(?:raw-)?field\b|--input\b/i.test(o);

/**
 * Los temas para los que esta orden es una LECTURA de la fuente. Lo que escribe (`--nuevo`,
 * `-X POST`, `-f`) o solo nombra (`grep`, `echo`) no cuenta. `situacion` lee PR y checks;
 * `gh pr checks` y `gh run` leen el CI y los despliegues; `verificar-estado`, `consulta` y
 * `apply-migration` solo en ensayo (sin `--si` ni `--pablo`) leen la base.
 */
function temasQueLee(o) {
  const t = new Set();
  if (ES_SITUACION.test(o)) ["issues-pr", "ci"].forEach((x) => t.add(x));
  if (ES_ISSUES.test(o) && !/--(?:nuevo|colgar|ordenar|etiquetas)\b/.test(o)) t.add("issues-pr");
  if (ES_LECTURA_GH.test(o)) {
    t.add("issues-pr");
    if (ES_GH_PR_CI.test(o)) ["ci", "despliegue"].forEach((x) => t.add(x));
  }
  if (ES_GH_API.test(o) && gh_api_lee(o)) TEMAS_ESTADO.filter((x) => x !== "base").forEach((x) => t.add(x));
  if (ES_GH_RUN.test(o)) ["ci", "despliegue"].forEach((x) => t.add(x));
  if (ES_ESPERA_CI.test(o)) t.add("ci");
  if (ES_VERCEL.test(o) || ES_GIT_ORIGIN.test(o)) t.add("despliegue");
  if (ES_VERIFICAR.test(o) || (ES_APPLY.test(o) && !ESCRIBE_MIGRACION.test(o))) t.add("base");
  if (ES_CONSULTA.test(o) && !/--admin\b[\s\S]*\b(?:insert|update|delete|drop|alter|truncate)\b/i.test(o)) t.add("base");
  return t;
}

/** Lo que el sistema mete como mensaje de usuario sin que Pablo escriba nada (avisos de tareas, salidas de comandos, recordatorios). */
const NO_ES_DE_PABLO = /^\s*<(?:task-notification|bash-|system-reminder|command-|local-command)/;

/** ¿Es este mensaje de usuario algo que escribió Pablo? Ni un resultado de herramienta, ni `isMeta`, ni ruido del sistema. */
function esMensajeDePablo(e) {
  if (e.isMeta === true) return false;
  const c = e.message?.content;
  if (Array.isArray(c)) {
    if (c.length && c.every((p) => p?.type === "tool_result")) return false;
    return !NO_ES_DE_PABLO.test(c.filter((p) => p?.type === "text").map((p) => p.text).join("\n"));
  }
  return !NO_ES_DE_PABLO.test(String(c ?? ""));
}

/**
 * ¿Hay que frenar? → { frena, motivo, turno }
 *  - `afirmaEstado(ultimo)` y ninguna lectura de la fuente con menos de 15 min;
 *  - `motivo`: `lectura-vieja` si hubo alguna lectura pero más antigua, si no `sin-lectura`;
 *  - `turno`: el id del último mensaje real del usuario (para frenar una vez por turno).
 * Un Bash sin `timestamp` en el transcript se toma por reciente (ante la duda, no frenar).
 */
export function estadoSinLeer(jsonl, ultimo, ahora = new Date()) {
  let turno = null;
  const hay = new Set();
  const frescas = new Set();
  const lee = (e, temas) => {
    const t = Date.parse(e.timestamp);
    const fresca = Number.isNaN(t) || ahora.getTime() - t <= MINUTOS_FRESCA * 60_000;
    for (const x of temas) {
      hay.add(x);
      if (fresca) frescas.add(x);
    }
  };
  filasDe(jsonl).forEach((e, i) => {
    if (!e) return;
    const partes = Array.isArray(e.message?.content) ? e.message.content : null;
    if (e.type === "user" && esMensajeDePablo(e)) turno = String(e.uuid ?? `l${i}`);
    if (e.type !== "assistant" || !partes) return;
    for (const p of partes) {
      if (p.type !== "tool_use") continue;
      if (ES_MCP_VERCEL.test(String(p.name))) lee(e, ["despliegue"]);
      if (!/^(?:Bash|PowerShell)$/.test(p.name) || !p.input?.command) continue;
      for (const o of ordenesDe(p.input.command)) lee(e, temasQueLee(o));
    }
  });
  const tema = temasAfirmados(ultimo).find((t) => !frescas.has(t));
  if (!tema) return { frena: false, motivo: null, tema: null, turno };
  return { frena: true, motivo: hay.has(tema) ? "lectura-vieja" : "sin-lectura", tema, turno };
}

/** Qué se cuenta, y con qué se lee, en el aviso de cada tema. */
const AVISO_TEMA = {
  "issues-pr": { de: "un issue o PR", cmd: "npm run situacion" },
  despliegue: { de: "un despliegue", cmd: "vercel ls (o gh run list, o git log origin/staging)" },
  base: { de: "la base de datos", cmd: "node scripts/verificar-estado.mjs (o npm run consulta)" },
  ci: { de: "el CI", cmd: "gh pr checks <n> (o gh run list)" },
};

/** El mensaje del freno, con una línea `campo: valor` que un script puede contar. */
export function recordatorioDeEstado(motivo, tema = "issues-pr") {
  const a = AVISO_TEMA[tema] ?? AVISO_TEMA["issues-pr"];
  return `[estado] Tu mensaje cuenta el estado de ${a.de} y en esta sesión no hay una lectura de la fuente de los últimos `
    + `${MINUTOS_FRESCA} minutos: antes de contar el estado, ejecuta \`${a.cmd}\` y cita su hora. `
    + "Si lo que dijiste no era una afirmación de estado, di en una línea por qué y termina: este aviso no vuelve a salir en este turno.\n"
    + `estado-fresco freno motivo: ${motivo}`;
}

/**
 * Qué mirar, de lo que llega por stdin y del transcript. El último mensaje sale
 * de `last_assistant_message`: el transcript se escribe con retraso y puede no
 * llevar aún el mensaje final del turno (lo dice la documentación de hooks,
 * sección Stop). El transcript solo da los comandos de la sesión y, si el campo
 * no viene (una versión vieja de Claude Code), el último texto como respaldo.
 */
export function aMirar(entrada, transcript) {
  const t = leerTranscript(transcript ?? "");
  return { ultimo: entrada.last_assistant_message ?? t.ultimo, comandos: t.comandos };
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  try {
    let crudo = "";
    for await (const trozo of process.stdin) crudo += trozo;
    const entrada = JSON.parse(crudo);
    if (entrada.stop_hook_active) process.exit(0);
    const dir = join(tmpdir(), "menuplan-pendientes");
    mkdirSync(dir, { recursive: true });
    const id = String(entrada.session_id ?? "x").replace(/\W/g, "");
    const marca = join(dir, `${id}.hecho`);
    const marcaCasos = join(dir, `${id}.casos`);
    const crudoTranscript = entrada.transcript_path && existsSync(entrada.transcript_path) ? readFileSync(entrada.transcript_path, "utf8") : "";
    const transcript = filasDe(crudoTranscript); // se parsea UNA vez y lo reciben los tres frenos
    const mirar = aMirar(entrada, transcript);
    // Cada freno sale una vez por sesión y con su marca; si salen los dos a la vez, primero los pendientes.
    let frenado = false;
    if (!existsSync(marca) && pendientesSinIssue(mirar)) {
      writeFileSync(marca, new Date().toISOString());
      process.stdout.write(JSON.stringify({ decision: "block", reason: RECORDATORIO }));
      frenado = true;
    } else if (!existsSync(marcaCasos)) {
      const { senales, registrado } = senalesDeFallo(transcript);
      if (senales.length && !registrado) {
        writeFileSync(marcaCasos, new Date().toISOString());
        process.stdout.write(JSON.stringify({ decision: "block", reason: recordatorioDeCasos(senales) }));
        frenado = true;
      }
    }
    // El estado fresco (#462): solo la sesión principal, un freno por turno y nunca si ya frenó otro.
    if (!frenado && !entrada.agent_id && !entrada.agent_type) {
      const { frena, motivo, tema, turno } = estadoSinLeer(transcript, mirar.ultimo);
      const { dirFabrica, registrarEvento } = await import("./eventos.mjs");
      // La marca del estado vive en la carpeta de la fábrica (fuera de tmp, que es de todos); las otras dos no se mueven.
      const dirMarcas = join(dirFabrica(), "marcas");
      mkdirSync(dirMarcas, { recursive: true });
      const marcaEstado = join(dirMarcas, `${id}.estado`);
      const yaFrenado = existsSync(marcaEstado) && readFileSync(marcaEstado, "utf8") === String(turno);
      if (frena && !yaFrenado) {
        writeFileSync(marcaEstado, String(turno));
        // Solo se registra un motivo del vocabulario cerrado (y su tema, que eventos.mjs valida) (si no, el freno sale igual pero sin evento).
        if (MOTIVOS_ESTADO.includes(motivo)) registrarEvento({ evento: "estado_sin_leer", nombre: motivo, tema, fuente: "pendientes", sesion: entrada.session_id, cwd: entrada.cwd });
        process.stdout.write(JSON.stringify({ decision: "block", reason: recordatorioDeEstado(motivo, tema) }));
      }
    }
  } catch {
    // a propósito: un recordatorio, no un vigilante; si falla, la sesión termina normal
  }
  process.exit(0);
}
