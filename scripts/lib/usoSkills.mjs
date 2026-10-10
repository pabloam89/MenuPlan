/**
 * Cuántas veces se abre cada skill, y quién toca un dominio sin abrir la suya (#397).
 *
 * Pablo, 10 oct 2026: «si tenemos skills, que se usen siempre, porque es
 * nuestro learning path». Para saber si se usan hay que contarlo, y el
 * registro que ya guardan los hooks no sirve: `skill-abierta.mjs` escribe una
 * ficha por sesión y skill en `.git/claude-sesiones/skills/`, que se borra al
 * cerrar la sesión (`fin.mjs`) y a las 48 h. Lo que sí queda son los
 * transcripts de Claude Code (`~/.claude/projects/<carpeta>/*.jsonl`, y los de
 * los subagentes en `<sesión>/subagents/agent-*.jsonl` con su tipo en el
 * `.meta.json`): ahí está cada `Skill`, cada `Read` de un SKILL.md, cada skill
 * precargada o pedida con /nombre, y cada edición y comando. Se cuentan de ahí,
 * sin tocar ningún hook.
 *
 * Límites (dichos también en la salida):
 *  - Solo ve las sesiones de ESTE PC: ni las de Álvaro, ni las de la nube, ni
 *    el CI. En el CI no hay transcripts y la cifra sale «sin comprobar».
 *  - Claude Code borra los transcripts viejos (`cleanupPeriodDays`, 30 días por
 *    defecto): la ventana es de una semana.
 *  - Un comando «de riesgo» se reconoce con el mismo mapa que la guardia
 *    (`.claude/dominios-skills.json`), con sus mismos falsos positivos (un
 *    `git commit -m` que nombra `apply-migration`), menos el texto entre
 *    comillas, que se quita: un comando metido entero entre comillas
 *    (`bash -c "…"`) no se cuenta.
 *  - Una sesión es un fichero; un PR no se puede atar a una sesión con
 *    seguridad (la rama del transcript es la del arranque, y un subagente en
 *    worktree lleva la del padre): por eso no se cuentan PR, sino sesiones.
 *
 * Cada cosa que se cuenta sale como una línea `campo: valor` de vocabulario
 * cerrado (CLAUDE.md, «Pensar en datos»), sin el texto de la conversación.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { cargarMapa, skillsDeComando, skillsDeFicheros } from "../../.claude/hooks/dominios.mjs";

// ── Vocabulario ───────────────────────────────────────────────────────────

/**
 * Cómo se abrió una skill:
 *  - herramienta: la herramienta `Skill`.
 *  - lectura: un `Read` de `.claude/skills/<x>/SKILL.md`.
 *  - orden: la persona escribió /<x> en una sesión.
 *  - precargada: un subagente la trae en el `skills:` de su frontmatter.
 */
export const VIAS = ["herramienta", "lectura", "orden", "precargada"];

/** Las que son una decisión de quien trabaja (precargada es automática: no cuenta para «sin uso»). */
export const VIAS_DELIBERADAS = ["herramienta", "lectura", "orden"];

/** Cómo se tocó un dominio: editando un fichero de sus `rutas` o lanzando uno de sus `comandos`. */
export const TOQUES = ["edicion", "comando"];

export const VENTANA_DIAS = 7;

const HERRAMIENTAS_EDICION = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const HERRAMIENTAS_SHELL = new Set(["Bash", "PowerShell"]);
const NOMBRE = /^[\w-]{1,40}$/;

// ── Un transcript ─────────────────────────────────────────────────────────

/**
 * La ruta de un fichero dentro del repo, con barras normales, o null. Primero
 * por el nombre de la carpeta (MenuPlan, MenuPlan-<tarea> o un worktree de
 * agente); si no, relativa a la carpeta de la sesión.
 */
export function rutaDelRepo(fichero, cwd) {
  const f = String(fichero ?? "").replace(/\\/g, "/");
  const m = f.match(/\/MenuPlan(?:-[\w.-]+)?(?:\/\.claude\/worktrees\/[\w.-]+)?\/(.+)$/i);
  if (m) return m[1];
  const c = String(cwd ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (c && f.toLowerCase().startsWith(`${c.toLowerCase()}/`)) return f.slice(c.length + 1);
  return null;
}

/**
 * Lo que de verdad ejecuta un comando, para casarlo con el mapa sin el ruido
 * que el revisor de #397 contó (102 toques por comando en 7 días, la mayoría
 * texto o lecturas):
 *  - fuera el texto entre comillas (`git commit -m "…apply-migration…"`,
 *    `--body "…"`) y el cuerpo de los heredocs;
 *  - fuera los tramos (`&&`, `||`, `;`, `|`, salto de línea) que solo leen:
 *    cd, ls, cat, grep, sed -n, git diff/log/show/status…, gh pr view…
 * Devuelve los tramos que quedan unidos con « && », o "".
 */
const SOLO_LECTURA =
  /^(?:cd|ls|cat|head|tail|grep|rg|wc|echo|find|pwd|sleep|sed\s+-n|git\s+(?:diff|log|show|status|grep|fetch|ls-files|rev-parse|rev-list|branch|worktree\s+list)|gh\s+(?:pr|issue)\s+(?:view|list|checks|diff)|gh\s+run\s+(?:view|list|watch))(?:\s|$)/;
export function comandoQueCuenta(cmd) {
  const sinTexto = String(cmd ?? "")
    // El cuerpo del heredoc sí se va; lo que sigue a `<<EOF` en su línea (`| gh secret set X`) se queda.
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2(?=\s|$)/g, "$3")
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
  return sinTexto
    .split(/&&|\|\||[;|\n]/)
    .map((t) => t.trim())
    // Las asignaciones de delante (OPS_DB_URL=… node …) se quedan: también casan con el mapa.
    .filter((t) => t && !SOLO_LECTURA.test(t.replace(/^(?:\w+=\S*\s+)+/, "")))
    .join(" && ");
}

/** Los ids de las llamadas que acabaron en error (`tool_result` con is_error): la guardia que niega, el comando que falla. */
function idsConError(mensaje) {
  const c = mensaje?.content;
  if (!Array.isArray(c)) return [];
  return c.filter((p) => p?.type === "tool_result" && p.is_error === true && typeof p.tool_use_id === "string").map((p) => p.tool_use_id);
}

/** Los textos de un mensaje de la persona (string o partes `text`; nunca resultados de herramientas). */
function textosDeUsuario(mensaje) {
  const c = mensaje?.content;
  if (typeof c === "string") return [c];
  if (Array.isArray(c)) return c.filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text);
  return [];
}

/**
 * Lo que pasa en un transcript (texto JSONL), en orden: las skills que se
 * abren y los dominios que se tocan. `skills`: los nombres de las skills que
 * existen (un /orquestar es una orden, no una skill). `esAgente`: si el
 * transcript es de un subagente (lo que llega como orden es su precarga).
 */
export function eventosDeTranscript(texto, { skills, mapa, esAgente = false }) {
  const conocidas = new Set(skills);
  const aperturas = [];
  const toques = [];
  const conError = new Set();
  let sesion = null;
  for (const linea of String(texto).split(/\r?\n/)) {
    if (!linea.trim()) continue;
    let j;
    try {
      j = JSON.parse(linea);
    } catch {
      continue; // a propósito: una línea cortada al escribir el transcript se salta; las demás valen
    }
    sesion ??= typeof j.sessionId === "string" ? j.sessionId : null;
    const cuando = typeof j.timestamp === "string" ? j.timestamp : null;
    if (j.type === "user") {
      for (const id of idsConError(j.message)) conError.add(id);
      for (const t of textosDeUsuario(j.message)) {
        for (const [, nombre] of t.matchAll(/<command-name>\/?([\w-]{1,40})<\/command-name>/g)) {
          if (conocidas.has(nombre)) aperturas.push({ skill: nombre, via: esAgente ? "precargada" : "orden", cuando });
        }
      }
      continue;
    }
    if (j.type !== "assistant" || !Array.isArray(j.message?.content)) continue;
    for (const p of j.message.content) {
      if (p?.type !== "tool_use") continue;
      const datos = p.input ?? {};
      if (p.name === "Skill") {
        const nombre = String(datos.skill ?? datos.name ?? "").trim().replace(/^\//, "").split(":").pop();
        if (conocidas.has(nombre)) aperturas.push({ skill: nombre, via: "herramienta", cuando });
      } else if (p.name === "Read") {
        const nombre = String(datos.file_path ?? "").match(/[\\/]\.claude[\\/]skills[\\/]([\w-]{1,40})[\\/]SKILL\.md$/i)?.[1];
        if (nombre && conocidas.has(nombre)) aperturas.push({ skill: nombre, via: "lectura", cuando });
      } else if (HERRAMIENTAS_EDICION.has(p.name)) {
        const ruta = rutaDelRepo(datos.file_path ?? datos.notebook_path, j.cwd);
        if (ruta) for (const skill of skillsDeFicheros([ruta], mapa)) toques.push({ skill, como: "edicion", cuando, id: p.id });
      } else if (HERRAMIENTAS_SHELL.has(p.name)) {
        for (const skill of skillsDeComando(comandoQueCuenta(datos.command), mapa)) toques.push({ skill, como: "comando", cuando, id: p.id });
      }
    }
  }
  // Lo que acabó en error no tocó nada: la guardia que niega para pedir la
  // skill (el sistema funcionando) y el comando que falla no cuentan.
  return { sesion, aperturas, toques: toques.filter((t) => !conError.has(t.id)).map(({ id, ...t }) => t) };
}

/**
 * Los dominios que una sesión tocó sin haber abierto antes su skill (por
 * cualquier vía, también precargada): uno por skill, el primer toque.
 */
export function tocadosSinSkill({ aperturas, toques }) {
  const fuera = new Map();
  for (const t of toques) {
    if (fuera.has(t.skill)) continue;
    const antes = aperturas.some((a) => a.skill === t.skill && (a.cuando ?? "") <= (t.cuando ?? ""));
    if (!antes) fuera.set(t.skill, t);
  }
  return [...fuera.values()];
}

// ── Las carpetas de transcripts ───────────────────────────────────────────

/** «C:\dev\MenuPlan» → «C--dev-MenuPlan», como nombra Claude Code la carpeta de un proyecto. */
export const nombreDeProyecto = (ruta) => String(ruta).replace(/[^A-Za-z0-9]/g, "-");

/**
 * Los transcripts de este repo modificados desde `desde` (ms): las carpetas de
 * proyecto de la principal y de sus carpetas de trabajo (`<nombre>-<tarea>`),
 * con los de los subagentes. Devuelve [{ fichero, agente }].
 */
export function transcriptsDe(dirProyectos, principal, desde) {
  if (!dirProyectos || !existsSync(dirProyectos)) return null;
  const base = nombreDeProyecto(principal).toLowerCase();
  const out = [];
  const reciente = (f) => {
    try {
      return statSync(f).mtimeMs >= desde;
    } catch {
      return false; // a propósito: un fichero que desaparece mientras se lista (Claude Code limpiando) no cuenta
    }
  };
  for (const proyecto of readdirSync(dirProyectos)) {
    const p = proyecto.toLowerCase();
    if (p !== base && !p.startsWith(`${base}-`)) continue;
    const dir = join(dirProyectos, proyecto);
    for (const f of readdirSync(dir)) {
      const ruta = join(dir, f);
      if (f.endsWith(".jsonl")) {
        if (reciente(ruta)) out.push({ fichero: ruta, agente: "sesion" });
        continue;
      }
      const sub = join(ruta, "subagents");
      if (!existsSync(sub)) continue;
      for (const a of readdirSync(sub)) {
        if (!a.endsWith(".jsonl")) continue;
        const fa = join(sub, a);
        if (!reciente(fa)) continue;
        let agente = "desconocido";
        try {
          const meta = JSON.parse(readFileSync(fa.replace(/\.jsonl$/, ".meta.json"), "utf8"));
          if (typeof meta.agentType === "string" && NOMBRE.test(meta.agentType)) agente = meta.agentType;
        } catch {
          // a propósito: sin .meta.json legible el subagente cuenta como «desconocido»; sus skills siguen contando
        }
        out.push({ fichero: fa, agente });
      }
    }
  }
  return out;
}

// ── El resumen ────────────────────────────────────────────────────────────

/**
 * Junta las sesiones: [{ agente, sesion, aperturas, toques }] → uso por skill
 * y vía, skills sin uso deliberado y dominios tocados sin su skill. Solo
 * cuenta lo que pasó desde `desdeIso`.
 */
export function resumir(sesiones, skills, desdeIso = "") {
  const uso = Object.fromEntries(skills.map((s) => [s, Object.fromEntries([...VIAS.map((v) => [v, 0]), ["total", 0]])]));
  const sinSkill = [];
  let conActividad = 0;
  for (const s of sesiones) {
    const enVentana = (e) => (e.cuando ?? "") >= desdeIso;
    const aperturas = s.aperturas.filter(enVentana);
    const toques = s.toques.filter(enVentana);
    if (aperturas.length || toques.length) conActividad++;
    for (const a of aperturas) {
      uso[a.skill][a.via]++;
      uso[a.skill].total++;
    }
    for (const t of tocadosSinSkill({ aperturas: s.aperturas, toques })) sinSkill.push({ ...t, agente: s.agente, sesion: s.sesion });
  }
  const deliberado = (s) => VIAS_DELIBERADAS.reduce((n, v) => n + uso[s][v], 0);
  return {
    sesiones: sesiones.length,
    conActividad,
    uso,
    sinUso: skills.filter((s) => deliberado(s) === 0),
    sinSkill,
  };
}

/** Las líneas contables: una por apertura y una por dominio tocado sin su skill. */
export function lineas(sesiones, desdeIso = "") {
  const corta = (id) => String(id ?? "sin-id").slice(0, 8);
  const out = [];
  for (const s of sesiones) {
    for (const a of s.aperturas) {
      if ((a.cuando ?? "") < desdeIso) continue;
      out.push(`skill_abierta: ${a.skill} via: ${a.via} agente: ${s.agente} sesion: ${corta(s.sesion)} fecha: ${(a.cuando ?? "").slice(0, 10) || "sin-fecha"}`);
    }
    // Igual que resumir(): el primer toque DENTRO de la ventana sin la skill abierta antes.
    for (const t of tocadosSinSkill({ aperturas: s.aperturas, toques: s.toques.filter((x) => (x.cuando ?? "") >= desdeIso) })) {
      out.push(`dominio_sin_skill: ${t.skill} como: ${t.como} agente: ${s.agente} sesion: ${corta(s.sesion)} fecha: ${(t.cuando ?? "").slice(0, 10) || "sin-fecha"}`);
    }
  }
  return out;
}

/** Las skills que hay (carpetas de `.claude/skills/` con su SKILL.md). */
export function skillsDelRepo(raiz) {
  const dir = join(raiz, ".claude", "skills");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "SKILL.md")))
    .map((d) => d.name)
    .sort();
}

/**
 * La medición de la ventana, leyendo los transcripts de este PC; null si no
 * hay carpeta de transcripts o ninguna sesión en la ventana (en el CI: «sin
 * comprobar», nunca un cero inventado).
 *  - `principal`: la carpeta principal del repo (de ella sale el nombre de proyecto).
 *  - `dirProyectos`: por defecto `~/.claude/projects` (o CLAUDE_CONFIG_DIR/projects).
 */
export function medirUso(raiz, { principal = raiz, dirProyectos = null, ahora = Date.now(), dias = VENTANA_DIAS } = {}) {
  const dirP = dirProyectos ?? join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
  const desde = ahora - dias * 86_400_000;
  const ficheros = transcriptsDe(dirP, principal, desde);
  if (!ficheros?.length) return null;
  const skills = skillsDelRepo(raiz);
  const mapa = cargarMapa(raiz);
  const sesiones = [];
  for (const { fichero, agente } of ficheros) {
    let texto;
    try {
      texto = readFileSync(fichero, "utf8");
    } catch {
      continue; // a propósito: un transcript bloqueado o borrado mientras se lee (EBUSY, EPERM) se salta; su error llevaría la ruta local al detalle del issue
    }
    const ev = eventosDeTranscript(texto, { skills, mapa, esAgente: agente !== "sesion" });
    sesiones.push({ agente, sesion: ev.sesion ?? basename(fichero, ".jsonl"), ...ev });
  }
  if (!sesiones.length) return null;
  const desdeIso = new Date(desde).toISOString();
  return { desde: desdeIso, ...resumir(sesiones, skills, desdeIso), lineas: lineas(sesiones, desdeIso) };
}

// ── Las skills de un encargo ──────────────────────────────────────────────

/**
 * Las skills que hay que abrir para un encargo, sacadas del mapa (nunca a
 * mano): las de las `rutas` que casan con `ficheros` y las de los `comandos`
 * de riesgo que va a lanzar. `precargadas`: las que el agente ya trae en su
 * frontmatter (no hace falta abrirlas, pero se dicen). Lo usan el brief de
 * /orquestar y la rúbrica del `revisor`.
 * Devuelve [{ skill, motivo: "ruta"|"comando", ficheros, precargada }].
 */
export function skillsDelEncargo({ ficheros = [], comandos = [], mapa, precargadas = [] }) {
  const out = new Map();
  const lista = ficheros.map((f) => String(f).replace(/\\/g, "/").replace(/^\.\//, ""));
  for (const skill of skillsDeFicheros(lista, mapa)) {
    const suyos = lista.filter((f) => skillsDeFicheros([f], mapa).includes(skill));
    out.set(skill, { skill, motivo: "ruta", ficheros: suyos, precargada: precargadas.includes(skill) });
  }
  for (const c of comandos) {
    for (const skill of skillsDeComando(c, mapa)) {
      if (!out.has(skill)) out.set(skill, { skill, motivo: "comando", ficheros: [], precargada: precargadas.includes(skill) });
    }
  }
  return [...out.values()].sort((a, b) => a.skill.localeCompare(b.skill));
}

/** Las skills del `skills: [a, b]` del frontmatter de un agente; [] si no existe o el nombre no vale. */
export function precargadasDe(raiz, agente) {
  if (typeof agente !== "string" || !NOMBRE.test(agente)) return [];
  try {
    const md = readFileSync(join(raiz, ".claude", "agents", `${agente}.md`), "utf8").replace(/\r\n/g, "\n");
    const linea = md.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^skills:\s*\[(.*)\]\s*$/m)?.[1] ?? "";
    return linea.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return []; // a propósito: un agente que no existe no trae nada precargado; el brief pide abrirlas todas
  }
}
