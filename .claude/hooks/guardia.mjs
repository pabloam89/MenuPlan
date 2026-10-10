/**
 * guardia.mjs — el hook que hace cumplir las reglas del CLAUDE.md.
 *
 * Un CLAUDE.md o un agente son texto: una sesión con prisa se los salta. Esto
 * no. Claude Code lo ejecuta ANTES de cada Bash, PowerShell, Edit o Write
 * (PreToolUse, ver .claude/settings.json), le pasa la acción por stdin y
 * obedece lo que devuelve:
 *
 *   deny  → no se hace, y la sesión lee el porqué
 *   ask   → se le pregunta a la persona (los gateways del CLAUDE.md)
 *   nada  → sigue el flujo normal de permisos
 *
 * Cada regla lleva su porqué: si una molesta, se discute y se cambia aquí,
 * con su test en guardia.test.js. Lo que no vale es desactivarla sin decirlo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AYUDA as AYUDA_CASOS, analizarCasos } from "./casos.mjs";
import { cargarMapa, skillsDeComando, unirContinuaciones } from "./dominios.mjs";
import { enStaging as enStagingTodas } from "./migraciones.mjs";
import { anotarSkill, dirSesiones, skillAnotada, tocar } from "./sesiones.mjs";

const deny = (motivo) => ({ decision: "deny", motivo });
const ask = (motivo) => ({ decision: "ask", motivo });

// ── Comandos ───────────────────────────────────────────────────────────────

/** Separa `a && b; c | d` para mirar cada orden por su cuenta. */
const ordenes = (cmd) => cmd.split(/&&|\|\||;|\n|\|/).map((s) => s.trim()).filter(Boolean);

const REGLAS_COMANDO = [
  {
    // main es producción. Ni push ni push forzado, por ninguna variante.
    si: (o) => /^git\s+push\b/.test(o) && /(^|[\s:+])(refs\/heads\/)?main(\s|$)/.test(o),
    da: () => deny("main es producción: no se sube nunca desde una sesión. Abre un PR a staging; el paso a main lo hace Pablo cuando lo pide."),
  },
  {
    // A staging se llega por PR con el CI en verde. GitHub no puede exigirlo
    // todavía porque el cron de Mercadona empuja directo (ver ops/INVENTARIO.md).
    si: (o) => /^git\s+push\b/.test(o) && /(^|[\s:+])(refs\/heads\/)?staging(\s|$)/.test(o),
    da: () => deny("A staging no se sube directo: empuja tu rama y abre un PR a staging; con el CI en verde lo puedes fusionar."),
  },
  {
    si: (o) => /^git\s+push\b/.test(o) && /\s(-f|--force)(\s|$)/.test(o),
    da: () => ask("Push forzado: reescribe la historia de la rama remota. ¿Es tuya y nadie más trabaja en ella?"),
  },
  {
    // El stash es UNO para todos los worktrees: el 7 oct 2026 dos sesiones se
    // cruzaron los cambios con un push/pop simultáneo.
    si: (o) => /^git\s+stash\b/.test(o),
    da: () => deny("git stash es común a todos los worktrees y se cruza con otras sesiones. Usa un worktree aparte o `git show origin/staging:<ruta>` para comparar."),
  },
  {
    // Dos veces se colaron en un commit cambios de otra sesión con `add .`.
    si: (o) => /^git\s+add\s+(.*\s)?(-A|--all|\.|:\/)(\s|$)/.test(o) || /^git\s+commit\s+(.*\s)?-[a-zA-Z]*a[a-zA-Z]*(\s|$)/.test(o),
    da: () => deny("Nada de `git add .`, `-A` ni `commit -a`: mira `git status --short` y añade por nombre solo lo que has tocado tú."),
  },
  {
    // `vite build` a secas se salta el prebuild (catálogo + check:tdz), que es
    // el gate de Vercel. El 22 sep 2026 rompió el despliegue de staging.
    si: (o) => /(^|\s)(npx\s+)?vite\s+build\b/.test(o),
    da: () => deny("Usa `npm run build`: `vite build` a secas se salta el prebuild (validate-catalog + check:tdz), que es lo que corre Vercel."),
  },
  {
    // El 8 oct 2026 tres sesiones abrieron el mismo fallo (#153, #154, #159):
    // la norma pedía buscar antes y nada obligaba. El script busca los parecidos.
    // También con `VAR=x gh …`, `gh.exe` o `gh -R dueño/repo issue create`.
    si: (o) => /^(?:\w+=\S*\s+)*gh(?:\.exe)?\s+(?:(?:-R|--repo)\s+\S+\s+)?issue\s+create\b/.test(o),
    da: () => deny("Los issues se crean con `npm run issues -- --nuevo \"título\" --tipo … --area … --cuerpo <fichero>`: antes de crear enseña los parecidos, y a Pablo le asigna las decisiones. Si ya existe uno, comenta allí."),
  },
  {
    // PowerShell 5.1 escribe UTF-8 con BOM y destroza los acentos.
    si: (o) => /\b(Set-Content|Out-File|Add-Content)\b/i.test(o) && !/\b(temp|tmp|scratchpad)\b/i.test(o),
    da: () => deny("Set-Content/Out-File/Add-Content rompen los acentos y meten BOM en los ficheros del repo. Edita con la herramienta Edit/Write."),
  },
];

// `apply-migration.mjs --si` ya no se niega aquí: lo protege el propio script
// (staging, ensayo reciente y el OK del juez auditor-datos; decidido por Pablo
// el 8 oct 2026). Lo que sí se niega es `--pablo`, que levanta lo que es solo
// suyo (CONTRAE, RLS y permisos de lo existente): lo lanza él con `!`, que no
// pasa por los hooks. Se mira por orden, para que un mensaje de commit que
// nombra el script no cuente. Basta con que la orden diga «pablo» de cualquier
// forma: entre comillas, `--pablo=1` o metido en una variable se colaba (juez
// de seguridad, 8 oct 2026).
const PABLO_EN_APLICAR = {
  si: (o) => /apply-migration\b/.test(o) && /pablo/i.test(o),
  da: () => deny("`--pablo` es solo de Pablo: borra algo con datos o cambia RLS o permisos. Enséñale el ensayo y el veredicto del juez, y dale el comando para que lo lance con `!`."),
};

// El Postgres del panel (Hetzner) corre en un contenedor y no es producción:
// `docker compose exec -T db psql -U panel …`. Solo ESE psql tiene excepción, y
// la excepción es en positivo: el tramo tiene que ser exactamente un `docker
// [compose [-f x]] exec … (db|panel-db-1) psql … -U panel`, y en TODO el comando
// no puede haber nada que lo lleve a otra base. Se mira el comando entero y no
// el tramo: un `;` dentro del SQL entrecomillado, o un `\` al final de línea,
// partían el comando y dejaban el host en un tramo que nadie miraba (juez de
// seguridad, 8 oct 2026). Lo dudoso se niega: es mejor un falso positivo que un
// psql contra producción. Las variables de producción (SUPABASE_DB_URL…) se
// niegan siempre, vayan donde vayan.
const PSQL_DEL_PANEL = /\bdocker\s+(?:compose\s+(?:-f\s+\S+\s+)?)?exec\b[^|;&\n]*?\b(?:db|panel-db-1)\s+psql\b/i;
const ES_USUARIO_PANEL = /\s-U\s+panel\b/;
const OTRA_BASE = new RegExp(
  [
    String.raw`postgres(?:ql)?:\/\/`, // una URL
    String.raw`(?:^|\s)(?:-h|--host)`, // -h, --host, y -h10.1.2.3 pegado
    String.raw`\bhost(?:addr)?\s*=`, // cadena de conexión clave=valor
    String.raw`\bPG(?:HOST|HOSTADDR|SERVICE|SERVICEFILE|PASSFILE)\b`, // destino por entorno
    "supabase",
    String.raw`\$\{?\w*(?:URL|DSN|CONN)\w*`, // una variable de conexión con otro nombre
    "dblink|postgres_fdw",
    String.raw`\$\(|\x60`, // sustitución de comandos: no se ve a dónde va
  ].join("|"),
  "i",
);
// Las continuaciones de línea (`\` o acento grave de PowerShell) se unen antes
// de partir (unirContinuaciones, de dominios.mjs).
const psqlFueraDelPanel = (o) => {
  const c = unirContinuaciones(o);
  const sinOtraBase = !OTRA_BASE.test(c);
  return c
    .split(/&&|\|\||[;|\n]/)
    .some((tramo) => /\bpsql\b/i.test(tramo) && !(PSQL_DEL_PANEL.test(tramo) && ES_USUARIO_PANEL.test(tramo) && sinOtraBase));
};

// El SQL a mano contra la base se niega siempre, no se pregunta: en modo auto
// un «ask» puede resolverlo el clasificador en vez de una persona.
const REGLAS_SQL = [
  {
    // SQL que escribe o cambia permisos contra una base real.
    si: (o) => (/\b(SUPABASE_DB_URL|OPS_DB_URL|pg\.Client|new\s+Client)\b/.test(o) || psqlFueraDelPanel(o))
      && /\b(drop\s+(table|schema|column|function|policy|constraint|index|view|type|trigger)|truncate|delete\s+from|alter\s+(table|type|function|policy)|update\s+[\w."]+\s+set|insert\s+into|grant|revoke|create\s+(table|policy|function|or\s+replace))\b/i.test(o),
    da: () => deny("SQL que escribe, borra o cambia permisos contra producción (es la única base). Va en una migración por `scripts/apply-migration.mjs`; si de verdad hace falta a mano, dale el comando a Pablo para que lo lance con `!`."),
  },
];

/** Ficheros de migración; el grupo 1 es el nombre. */
const RUTA_MIGRACION = String.raw`supabase[\\/]migrations[\\/](\d{4}_[\w-]+)\.sql`;

/**
 * Lo que lee Lola. La regla `.claude/rules/lola.md` solo se carga con
 * Read/Write/Edit, así que por shell se salta sin avisar; y un cambio en lo que
 * lee Lola pide pasar los evals antes de mergear.
 */
const RUTA_LOLA = String.raw`api[\\/]_bot[\\/](?:conocimiento\.md|agente\.js|herramientas[\w.-]*)`;

/**
 * Qué hace un comando de shell con TODOS los ficheros que casan con `ruta`:
 * [{ nombre, como }], con `como` = "escribe" (redirección, tee, sed/perl -i o
 * --in-place, git checkout/restore, node -e con writeFileSync, o el destino de
 * un mv/cp), "mueve" (el origen de un mv) o "borra" (rm). Leer no cuenta: un
 * `>` suelto (el `NR>=251` de un awk, `grep … > /tmp/x`) o el origen de un cp
 * son lecturas, y negarlas eran falsos positivos. Se miran todas las
 * coincidencias: con solo la primera, `echo a > 0090_nueva.sql && echo b >>
 * 0079_aplicada.sql` pasaba.
 */
export function tocaEn(cmd, ruta) {
  const r = [];
  const re = (flags = "") => new RegExp(ruta, flags);
  const anota = (txt, como) => {
    if (como && re().test(txt)) r.push({ nombre: re().exec(txt)[1] ?? txt, como });
  };
  // La redirección cuenta solo si va justo antes de la ruta.
  for (const m of cmd.matchAll(new RegExp(String.raw`>>?\s*["']?(?:[^\s"'|;&<>]*[\\/])?` + ruta, "g"))) anota(m[0], "escribe");
  // node -e escribiendo: su código lleva sus propios `;`, así que se mira entero.
  if (/\bnode\b[^\n]*\s-[ep]\b/.test(cmd) && /\b(?:writeFileSync|appendFileSync)\b/.test(cmd)) {
    for (const m of cmd.matchAll(re("g"))) anota(m[0], "escribe");
  }
  for (const o of ordenes(cmd)) {
    const tokens = [...o.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    const args = tokens.filter((t) => !t.startsWith("-"));
    const orden = tokens[0] === "git" ? `git ${tokens[1]}` : tokens[0];
    const enRuta = args.filter((t) => re().test(t));
    if (!enRuta.length) continue;
    const enSitio = (/^(?:sed|perl)$/.test(orden) && tokens.some((t) => /^-\w*i|^--in-place\b/.test(t)))
      || ["tee", "git checkout", "git restore"].includes(orden);
    if (enSitio) enRuta.forEach((t) => anota(t, "escribe"));
    else if (["mv", "git mv", "cp"].includes(orden)) {
      const destino = args[args.length - 1];
      for (const t of enRuta) anota(t, t === destino ? "escribe" : orden === "cp" ? null : "mueve");
    } else if (["rm", "git rm"].includes(orden)) enRuta.forEach((t) => anota(t, "borra"));
  }
  return r;
}

// ── Migraciones ────────────────────────────────────────────────────────────

/** Las que ESTADO.md da por «sin aplicar» en su tabla de resumen. */
export function sinAplicar(estadoMd) {
  const linea = estadoMd.split("\n").find((l) => /\|\s*\*\*Sin aplicar\*\*\s*\|/.test(l));
  if (!linea) return null;
  return new Set([...linea.matchAll(/`(\d{4}_[\w-]+)`/g)].map((m) => m[1]));
}

/**
 * Una migración está CERRADA si ya está en origin/staging y ESTADO.md no la da
 * por sin aplicar. Una aplicada no se edita: se escribe otra que la corrija,
 * porque producción ya ejecutó la versión vieja y nadie lo notaría.
 */
export function migracionCerrada(nombre, { enStaging, estadoMd, numeroEnStaging = () => null }) {
  if (!enStaging(nombre)) {
    // Nueva en esta rama: se edita libre, salvo que su número ya lo use otra.
    const otra = numeroEnStaging(nombre.slice(0, 4));
    if (otra && otra !== nombre) {
      return `El número ${nombre.slice(0, 4)} ya es de ${otra} en staging. Usa el siguiente libre (te lo dice el arranque de la sesión).`;
    }
    return null;
  }
  const libres = estadoMd ? sinAplicar(estadoMd) : null;
  if (!libres) return `No puedo leer supabase/ESTADO.md para saber si ${nombre} está aplicada. Compruébalo antes de editarla.`;
  if (libres.has(nombre)) return null;
  return `${nombre} ya está aplicada en producción (no figura «sin aplicar» en supabase/ESTADO.md). No se edita: escribe una migración nueva con el siguiente número libre.`;
}

// ── La carpeta principal ───────────────────────────────────────────────────

/**
 * La carpeta donde corre de verdad una orden: la de su `git -C`, la del último
 * `cd` anterior en el comando, o la de la sesión. Las sesiones suelen quedarse
 * en la carpeta principal y hacer `cd C:/dev/MenuPlan-x && …`.
 */
/** Una ruta de Git Bash a Windows: `/c/dev/x` → `c:/dev/x`, `/tmp/x` → la carpeta temporal. */
export function windows(p) {
  return p.replace(/^\/tmp(?=\/|$)/, tmpdir().replace(/\\/g, "/")).replace(/^\/([a-z])\//i, "$1:/");
}

export function carpetaDe(cmd, orden, cwd) {
  const c = orden.match(/^git\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (c) return windows(c[1] ?? c[2] ?? c[3]);
  const hasta = cmd.indexOf(orden);
  const cds = [...cmd.matchAll(/(?:^|&&|;|\n)\s*(?:cd|Set-Location|pushd)\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g)]
    .filter((m) => hasta < 0 || m.index < hasta);
  const ultimo = cds.at(-1);
  return ultimo ? windows(ultimo[1] ?? ultimo[2] ?? ultimo[3]) : cwd;
}

/** Git que cambia la carpeta: añadir, commitear, fusionar o cambiar de rama. */
const GIT_QUE_ESCRIBE = /^git\s+(?:-C\s+(?:"[^"]+"|'[^']+'|\S+)\s+)?(add|commit|merge|rebase|cherry-pick|checkout|switch|reset|restore|revert|am|apply)\b/;
/** Lo que sí vale en la principal: ponerla al día y volver a staging. */
const GIT_DE_MANTENER = /\bmerge\s+(.*\s)?--ff-only\b|\b(checkout|switch)\s+staging\s*$/;

const EN_LA_PRINCIPAL = "Estás en la carpeta principal (C:\\dev\\MenuPlan): es de todas las sesiones y en ella no se trabaja, solo se mira y se lanza `npm run tarea`. Abre la tuya con `npm run tarea -- <area>/<nombre>` y trabaja allí.";

export function contextoReal(raiz, entrada = {}) {
  let deStaging;
  const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim();
  let comunPropio;
  const esPrincipal = (dir) => {
    try {
      comunPropio ??= resolve(git(["-C", raiz, "rev-parse", "--path-format=absolute", "--git-common-dir"])).toLowerCase();
      const [gitDir, comun] = git(["-C", dir, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]).split(/\r?\n/);
      return resolve(gitDir).toLowerCase() === resolve(comun).toLowerCase() && resolve(comun).toLowerCase() === comunPropio;
    } catch {
      // a propósito: fuera de un repo (o si git no contesta) no es la carpeta principal
      return false;
    }
  };
  // El registro de sesiones (para la puerta de lectura de las skills), perezoso:
  // casi ningún comando lo necesita.
  let dirReg;
  const registro = () => (dirReg ??= dirSesiones(raiz) ?? null);
  const idSesion = entrada.session_id;
  return {
    dominios: cargarMapa(raiz),
    skillAbierta: (skill) => skillAnotada(registro(), idSesion, skill),
    marcarSkill: (skill) => anotarSkill(registro(), idSesion, skill, "avisada"),
    // Las skills que un subagente trae precargadas en su frontmatter (`skills: [a, b]`).
    skillsDelAgente: (tipo) => {
      if (typeof tipo !== "string" || !/^[\w-]+$/.test(tipo)) return [];
      try {
        const md = readFileSync(join(raiz, ".claude", "agents", `${tipo}.md`), "utf8").replace(/\r\n/g, "\n");
        const linea = md.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^skills:\s*\[(.*)\]\s*$/m)?.[1] ?? "";
        return linea.split(",").map((s) => s.trim()).filter(Boolean);
      } catch {
        // a propósito: falla abierta — si no se puede leer el agente se pierde saber qué skills trae precargadas; cuesta un reintento de la puerta, mejor que bloquear.
        return [];
      }
    },
    esPrincipal,
    // Un fichero del repo en la carpeta principal. Lo ignorado (.env.local) y la
    // memoria de los agentes, que vive en la carpeta del proyecto, no cuentan.
    rutaEnPrincipal: (ruta) => {
      if (!ruta || /[\\/]\.claude[\\/]agent-memory[\\/]/.test(ruta)) return false;
      let dir = dirname(ruta);
      while (!existsSync(dir)) {
        if (dirname(dir) === dir) return false;
        dir = dirname(dir);
      }
      if (!esPrincipal(dir)) return false;
      try {
        git(["-C", dir, "check-ignore", "-q", ruta]);
        return false; // ignorado
      } catch {
        return true; // a propósito: check-ignore sale con error cuando NO está ignorado; es su respuesta
      }
    },
    numeroEnStaging: (numero) => {
      deStaging ??= enStagingTodas(raiz) ?? [];
      return deStaging.find((n) => n.startsWith(`${numero}_`)) ?? null;
    },
    enStaging: (nombre) => {
      try {
        execFileSync("git", ["-C", raiz, "cat-file", "-e", `origin/staging:supabase/migrations/${nombre}.sql`], { stdio: "ignore" });
        return true;
      } catch {
        return false; // a propósito: cat-file -e sale con error cuando el fichero no está en staging
      }
    },
    estadoMd: existsSync(join(raiz, "supabase", "ESTADO.md")) ? readFileSync(join(raiz, "supabase", "ESTADO.md"), "utf8") : null,
    baseDelPr: (numero) => {
      try {
        const args = ["pr", "view", ...(numero ? [numero] : []), "--json", "baseRefName", "-q", ".baseRefName"];
        return execFileSync("gh", args, { cwd: raiz, encoding: "utf8", timeout: 15000 }).trim();
      } catch {
        return null; // a propósito: null es «no se sabe» y decidir() lo convierte en pregunta (ask)
      }
    },
    ramaDe: (dir = raiz) => {
      try {
        return git(["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]);
      } catch {
        // a propósito: sin rama legible no se exige el Closes (null = no se sabe)
        return null;
      }
    },
    leer: (fichero, dir = raiz) => {
      try {
        return readFileSync(resolve(dir, fichero), "utf8");
      } catch {
        // a propósito: un --body-file ilegible cuenta como cuerpo vacío, y entonces se pide el Closes
        return null;
      }
    },
    // Commits de origin/staging que le faltan a tu rama (tras traerlo). null si no se puede saber.
    atrasoLocal: (dir = raiz) => {
      try {
        execFileSync("git", ["-C", dir, "fetch", "-q", "origin", "staging"], { stdio: "ignore", timeout: 30000 });
        return Number(execFileSync("git", ["-C", dir, "rev-list", "--count", "HEAD..origin/staging"], { encoding: "utf8" }).trim());
      } catch {
        return null; // a propósito: null es «no se sabe» y decidir() lo convierte en pregunta (ask)
      }
    },
    // Ficheros que el PR cambia y que staging también ha cambiado desde que la
    // rama se separó, preguntado a GitHub (la rama puede no estar en local).
    // [] si no va atrasada o no se pisan; null si no se puede saber.
    choquesDelPr: (numero) => {
      try {
        const opts = { cwd: raiz, encoding: "utf8", timeout: 15000 };
        const cabeza = execFileSync("gh", ["pr", "view", ...(numero ? [numero] : []), "--json", "headRefOid", "-q", ".headRefOid"], opts).trim();
        const compara = (de, a) => JSON.parse(execFileSync("gh", ["api", `repos/{owner}/{repo}/compare/${de}...${a}`, "-q", "{atraso: .behind_by, ficheros: [.files[].filename]}"], opts));
        const delPr = compara("staging", cabeza);
        if (delPr.atraso === 0) return [];
        const deStaging = new Set(compara(cabeza, "staging").ficheros);
        return delPr.ficheros.filter((f) => deStaging.has(f));
      } catch {
        return null; // a propósito: null es «no se sabe» y decidir() lo convierte en pregunta (ask)
      }
    },
  };
}

// ── La puerta de lectura de las skills ─────────────────────────────────────

/**
 * Las skills (.claude/skills/) son los runbooks, con lo que ya falló en cada
 * servicio. Se abrían solo si la sesión decidía hacerlo. Aquí, la PRIMERA vez
 * que una sesión lanza un comando de riesgo de un dominio con skill (el mapa:
 * .claude/dominios-skills.json), se le niega con el nombre de la skill; al
 * reintentar pasa. Es un obstáculo, no un candado: una vez por skill y sesión.
 *
 *  - Si la sesión ya abrió la skill (herramienta Skill o Read de su SKILL.md,
 *    anotado por skill-abierta.mjs), pasa a la primera.
 *  - Si es un subagente con la skill en su frontmatter (`skills: [...]`), ya la
 *    tiene en el contexto: cuenta como abierta. El hook solo sabe qué agente es
 *    si Claude Code le pasa `agent_type`; si no, el coste es un reintento.
 *  - Falla abierta: si no se puede anotar el aviso (sin registro, disco, id
 *    raro), NO se niega; una puerta que no recuerda atascaría la sesión.
 */
function puertaDeSkills(cmd, entrada, ctx) {
  if (!ctx.dominios || !ctx.skillAbierta || !ctx.marcarSkill) return null;
  const delAgente = ctx.skillsDelAgente?.(entrada.agent_type) ?? [];
  const faltan = skillsDeComando(cmd, ctx.dominios).filter((s) => !delAgente.includes(s) && !ctx.skillAbierta(s));
  const avisadas = faltan.filter((s) => ctx.marcarSkill(s));
  if (!avisadas.length) return null;
  const lista = avisadas.map((s) => `\`${s}\``).join(" y ");
  const abre = avisadas.map((s) => `Skill con skill: "${s}"`).join(" y ");
  return deny(
    `Este comando es de los que, mal hechos, cuestan caro, y ${avisadas.length > 1 ? "sus dominios tienen" : "su dominio tiene"} runbook con lo que ya falló aquí. ` +
    `Abre antes ${avisadas.length > 1 ? "las skills" : "la skill"} ${lista} (herramienta ${abre}) y reintenta el mismo comando. ` +
    "Este aviso sale una sola vez por skill y sesión: al reintentar pasa.",
  );
}

// ── La decisión ────────────────────────────────────────────────────────────

/**
 * Pura salvo por `ctx`, para poder probarla. Devuelve {decision, motivo} o null.
 */
export function decidir(entrada, ctx) {
  const { tool_name: herramienta, tool_input: datos = {} } = entrada;

  if (herramienta === "Bash" || herramienta === "PowerShell") {
    const cmd = String(datos.command ?? "");
    // «pablo» se mira en el comando entero: `X=--pablo; node …apply-migration… $X`
    // reparte la opción entre dos órdenes.
    if (PABLO_EN_APLICAR.si(cmd)) return PABLO_EN_APLICAR.da(cmd);
    for (const o of ordenes(cmd)) {
      for (const r of REGLAS_COMANDO) if (r.si(o)) return r.da(o);

      // Una sesión, una carpeta: en la principal no se commitea ni se cambia de
      // rama (el 8 oct 2026 había tres sesiones trabajando a la vez en ella).
      if (GIT_QUE_ESCRIBE.test(o) && !GIT_DE_MANTENER.test(o) && ctx.esPrincipal(carpetaDe(cmd, o, entrada.cwd ?? ""))) {
        return deny(EN_LA_PRINCIPAL);
      }

      // Un PR con la rama atrasada respecto a staging choca con lo que acaban
      // de meter otras sesiones, o pasa el CI sin haberlo probado junto (el 8
      // oct 2026, el cableado). Al abrirlo, al día del todo (es barato). Al
      // fusionar, solo si staging ha tocado sus mismos ficheros: staging avanza
      // varios commits cada pocos minutos y exigirlo siempre dejaba los PR sin
      // poder entrar nunca. Lo que no se pisa lo recoge el CI de staging.
      if (/^gh\s+pr\s+create\b/.test(o)) {
        const dir = carpetaDe(cmd, o, entrada.cwd ?? "") || undefined;
        // Rama con issue (`npm run tarea -- ops/x 193` → `ops/193-x`): el PR lo
        // cierra. Sin el `Closes`, el issue se queda abierto y la traza no sabe
        // quién lo arregló (8 oct 2026: ninguna rama vieja tenía issue).
        // `--head ops/x`, `--head "ops/x"` o `--head dueño:ops/x`.
        const rama = o.match(/(?:-H|--head)(?:\s+|=)["']?(?:[\w-]+:)?([^\s"']+)/)?.[1] ?? ctx.ramaDe(dir);
        const issue = rama?.match(/^[a-z]+\/(\d+)-/)?.[1];
        if (issue) {
          // `--body-file f`, `--body-file=f` o `-F f`, con rutas de Git Bash (`/c/…`, `/tmp/…`).
          const fichero = o.match(/(?:-F|--body-file)(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/);
          const cuerpo = fichero ? ctx.leer(windows(fichero[1] ?? fichero[2] ?? fichero[3]), dir) ?? "" : "";
          const texto = `${cmd}\n${cuerpo}`;
          if (!new RegExp(String.raw`\b(close[sd]?|fix(e[sd])?|resolve[sd]?):?\s+#${issue}\b`, "i").test(texto)) {
            return deny(`Tu rama es del issue #${issue}: pon \`Closes #${issue}\` en el cuerpo del PR (y la línea \`Agente: <nombre>\`), para que se cierre al fusionar y quede la traza.`);
          }
        }
        // La línea «Casos:» (#185): cada PR dice qué fallos del camino ha
        // registrado como casos, o por qué no hubo. Solo la forma, sin red: el CI
        // (scripts/casos-pr.mjs) comprueba además que los #n son casos de verdad.
        const ficheroCasos = o.match(/(?:-F|--body-file)(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/);
        const cuerpoCasos = ficheroCasos ? ctx.leer(windows(ficheroCasos[1] ?? ficheroCasos[2] ?? ficheroCasos[3]), dir) ?? "" : "";
        const casos = analizarCasos(`${cmd}\n${cuerpoCasos}`, { enComando: true });
        if (!casos.valida) return deny(`${casos.motivo} ${AYUDA_CASOS} (El CI lo vuelve a comprobar.)`);
        const atraso = ctx.atrasoLocal(dir);
        if (atraso === null) return ask("No he podido comprobar si tu rama tiene lo último de staging. Haz `git fetch origin staging` y `git merge origin/staging` antes de abrir el PR.");
        if (atraso > 0) return deny(`Tu rama va ${atraso} commit(s) por detrás de staging. Antes de abrir el PR: \`git fetch origin staging\`, \`git merge origin/staging\`, resuelve, pasa los tests y empuja.`);
        continue;
      }

      // gh -R/--repo … pr merge: la base no se puede leer de la rama actual.
      if (/^gh\s+(?:-R|--repo)\b[\s\S]*\bpr\s+merge\b/.test(o)) {
        return deny("`gh -R … pr merge` no deja comprobar la base del PR. Fusiona desde la carpeta del repo, con el número del PR.");
      }
      // gh pr edit --base: cambiar la base de un PR a algo que no es staging lo
      // lleva a producción al fusionarlo (juez de seguridad del PR #223).
      const nuevaBase = /^gh\s+pr\s+edit\b/.test(o) ? o.match(/(?:^|\s)(?:--base|-B)(?:\s+|=)?["']?([^\s"']+)/) : null;
      if (nuevaBase && nuevaBase[1] !== "staging") {
        return deny(`Cambiar la base de un PR a ${nuevaBase[1]} lo llevaría fuera de staging. Eso solo lo hace Pablo.`);
      }
      // gh api: fusionar, cambiar la base o borrar por la API se salta todo lo
      // de aquí, también con la skill abierta (re-juicio del PR #223).
      if (/^gh\s+api\b/.test(o) && /\/pulls\/\d+\/merge\b|mergePullRequest|baseRefName|\bbase=|(?:-X|--method)[\s=]*DELETE\b/i.test(o)) {
        return deny("Fusionar, cambiar la base de un PR o borrar por `gh api` se salta la guardia. Usa `gh pr merge <n>` (a staging) o pídeselo a Pablo.");
      }
      // Borrar issues o etiquetas no tiene vuelta atrás.
      if (/^gh\s+(?:issue\s+(?:delete|transfer)|label\s+delete)\b/.test(o)) {
        return deny("Borrar o trasladar un issue, o borrar una etiqueta, no tiene vuelta atrás. Ciérralo o retírala con `npm run issues -- --etiquetas`.");
      }
      // gh pr merge: solo a staging, y con el PR justo detrás de `merge`
      // (número, #número o la URL de este repo). Buscarlo en otro sitio se
      // engañaba con un número en --subject, con '#231' o con el nombre de una
      // rama (re-juicio del PR #223); gh no admite un segundo PR.
      let merge = null;
      if (/^gh\s+pr\s+merge\b/.test(o)) {
        const tras = [...o.replace(/^gh\s+pr\s+merge\b/, "").matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
        const pr = tras[0]?.match(/^(?:#?(\d+)|https:\/\/github\.com\/pabloam89\/MenuPlan\/pull\/(\d+)\/?)$/i);
        if (!pr) return deny("Pon el número del PR justo detrás de `merge` (`gh pr merge 230 --squash`): así la guardia mira el mismo PR que fusiona gh.");
        merge = [o, pr[1] ?? pr[2]];
      }
      if (merge && /(?:^|\s)--auto\b/.test(o)) {
        return deny("`gh pr merge --auto` fusiona más tarde, cuando nadie mira la base. Fusiona a mano con el CI en verde.");
      }
      if (merge) {
        const base = ctx.baseDelPr(merge[1]);
        if (base === null) return ask("No he podido leer la rama base de este PR. Si no es staging, solo Pablo lo fusiona.");
        if (base !== "staging") return deny(`Este PR va contra ${base}, no contra staging. Fusionar fuera de staging solo lo hace Pablo.`);
        const choques = ctx.choquesDelPr(merge[1]);
        if (choques === null) return ask("No he podido comprobar si staging ha tocado lo mismo que este PR. Míralo antes de fusionar.");
        if (choques.length) {
          const lista = choques.slice(0, 5).join(", ") + (choques.length > 5 ? ` y ${choques.length - 5} más` : "");
          return deny(`Desde que se abrió este PR, staging ha cambiado sus mismos ficheros (${lista}): el CI no los ha probado juntos. Ponlo al día (\`gh pr update-branch${merge[1] ? ` ${merge[1]}` : ""}\` o merge de origin/staging y push), espera el CI en verde y fusiona.`);
        }
        continue;
      }
    }
    // El SQL se mira en el comando entero: un `node -e` lleva sus propios `;`.
    for (const r of REGLAS_SQL) if (r.si(cmd)) return r.da(cmd);

    for (const { nombre, como } of tocaEn(cmd, RUTA_MIGRACION)) {
      // Mover o borrar una que no está en staging (salir de un choque de
      // número) es libre: el número que cuenta es el del destino. Si ya está
      // en staging, moverla o borrarla es tocar una aplicada.
      if (como !== "escribe" && !ctx.enStaging(nombre)) continue;
      const motivo = migracionCerrada(nombre, ctx);
      if (motivo) return deny(motivo);
    }
    // La puerta de lectura va la última entre los «no»: una orden que otra regla
    // ya niega no gasta el aviso. Se mira el comando ENTERO (no un tramo).
    const puerta = puertaDeSkills(cmd, entrada, ctx);
    if (puerta) return puerta;
    if (tocaEn(cmd, RUTA_LOLA).length) {
      return ask("Esto escribe en lo que lee Lola desde la shell. Mejor con Edit: así se carga `.claude/rules/lola.md`. Y si cambia lo que lee Lola, pasa los evals (`scripts/bot-evals.mjs`) antes de mergear.");
    }
    return null;
  }

  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(herramienta)) {
    const ruta = String(datos.file_path ?? datos.notebook_path ?? "");
    const m = ruta.match(/supabase[\\/]migrations[\\/](\d{4}_[\w-]+)\.sql$/);
    if (m) {
      const motivo = migracionCerrada(m[1], ctx);
      if (motivo) return deny(motivo);
    }
    if (ctx.rutaEnPrincipal(ruta)) return deny(EN_LA_PRINCIPAL);
    // Los permisos y el código que vigila cada orden (la guardia y lo que
    // importa, y skill-abierta) preguntan: en una carpeta de trabajo hacen
    // efecto en la orden siguiente, sin PR ni juez (juez de seguridad del PR
    // #223). El resto de hooks y sus tests van por PR sin preguntar.
    if (/[\\/]\.claude[\\/](?:settings\.json|hooks[\\/](?:guardia|dominios|migraciones|sesiones|skill-abierta)\.mjs)$/.test(ruta)) {
      return ask("Esto cambia los permisos o el código que vigila cada orden, y en tu carpeta hace efecto ya. Pídele el OK a Pablo.");
    }
    return null;
  }

  return null;
}

// ── Entrada desde Claude Code ──────────────────────────────────────────────

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

const responder = (r) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: r.decision,
      permissionDecisionReason: `[guardia] ${r.motivo}`,
    },
  }));
};

if (esPrincipal) {
  let crudo = "";
  for await (const trozo of process.stdin) crudo += trozo;
  // Sin entrada legible la guardia no puede vigilar: pregunta (#209, decisión
  // de Pablo del 8 oct). Ni deja pasar en silencio ni niega, para que un fallo
  // tonto no pare la sesión.
  let entrada = null;
  try {
    entrada = JSON.parse(crudo);
  } catch (e) {
    console.error(`[guardia] entrada ilegible: ${e.message}`);
  }
  if (!entrada || typeof entrada !== "object") {
    responder(ask("La guardia no ha podido leer esta orden, así que no sabe si es segura. ¿La dejas pasar?"));
    process.exit(0);
  }
  // La raíz del worktree donde se trabaja, no CLAUDE_PROJECT_DIR (que apunta a
  // la carpeta original): el ESTADO.md que vale es el de tu rama.
  const ruta = String(entrada.tool_input?.file_path ?? "");
  const desde = ruta.match(/^(.*?)[\\/]supabase[\\/]migrations[\\/]/)?.[1] || entrada.cwd || process.cwd();
  let raiz = process.env.CLAUDE_PROJECT_DIR || desde;
  try {
    raiz = execFileSync("git", ["-C", desde, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // a propósito: fuera de un repo nos quedamos con la raíz que hay
  }
  try {
    tocar(dirSesiones(raiz), entrada.session_id); // «sigo viva», para el registro de sesiones
  } catch {
    // a propósito: el registro es una ayuda, no un requisito; si falla, el arranque lo dice
  }
  const r = decidir(entrada, contextoReal(raiz, entrada));
  if (r) {
    // La respuesta sale PRIMERO: lo que decide la guardia no puede depender de un módulo de
    // registro que se cuelgue o haga process.exit (juez de seguridad de #340).
    responder(r);
    // El registro de eventos (#340) cuenta cada bloqueo y cada permiso pedido. Import dinámico,
    // dentro de un try y con tope de tiempo: si no carga, falla o se cuelga, la decisión ya salió.
    try {
      const registro = (async () => {
        const { familiaDeGuardia, registrarEvento } = await import("./eventos.mjs");
        registrarEvento({
          evento: r.decision === "deny" ? "bloqueo_guardia" : "permiso_pedido",
          nombre: familiaDeGuardia(r.motivo),
          sesion: entrada.session_id,
          cwd: entrada.cwd || raiz,
        });
      })();
      let temporizador;
      await Promise.race([registro, new Promise((alTiempo) => { temporizador = setTimeout(alTiempo, 3000); })]);
      clearTimeout(temporizador);
    } catch {
      // a propósito: el registro es una ayuda; un fallo suyo no puede cambiar lo que decide la guardia
    }
  }
  process.exit(0);
}
