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
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { enStaging as enStagingTodas } from "./migraciones.mjs";
import { dirSesiones, tocar } from "./sesiones.mjs";

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
// Las continuaciones de línea (`\` o acento grave de PowerShell) se unen antes de partir.
const unirContinuaciones = (o) => o.replace(/[\\\x60]\r?\n\s*/g, " ");
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
export function carpetaDe(cmd, orden, cwd) {
  const windows = (p) => p.replace(/^\/([a-z])\//i, "$1:/");
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

function contextoReal(raiz) {
  let deStaging;
  const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim();
  let comunPropio;
  const esPrincipal = (dir) => {
    try {
      comunPropio ??= resolve(git(["-C", raiz, "rev-parse", "--path-format=absolute", "--git-common-dir"])).toLowerCase();
      const [gitDir, comun] = git(["-C", dir, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]).split(/\r?\n/);
      return resolve(gitDir).toLowerCase() === resolve(comun).toLowerCase() && resolve(comun).toLowerCase() === comunPropio;
    } catch {
      return false;
    }
  };
  return {
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
        return true;
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
        return false;
      }
    },
    estadoMd: existsSync(join(raiz, "supabase", "ESTADO.md")) ? readFileSync(join(raiz, "supabase", "ESTADO.md"), "utf8") : null,
    baseDelPr: (numero) => {
      try {
        const args = ["pr", "view", ...(numero ? [numero] : []), "--json", "baseRefName", "-q", ".baseRefName"];
        return execFileSync("gh", args, { cwd: raiz, encoding: "utf8", timeout: 15000 }).trim();
      } catch {
        return null;
      }
    },
    // Commits de origin/staging que le faltan a tu rama (tras traerlo). null si no se puede saber.
    atrasoLocal: (dir = raiz) => {
      try {
        execFileSync("git", ["-C", dir, "fetch", "-q", "origin", "staging"], { stdio: "ignore", timeout: 30000 });
        return Number(execFileSync("git", ["-C", dir, "rev-list", "--count", "HEAD..origin/staging"], { encoding: "utf8" }).trim());
      } catch {
        return null;
      }
    },
    // Lo mismo para la rama de un PR, preguntado a GitHub (la rama puede no estar en local).
    atrasoDelPr: (numero) => {
      try {
        const opts = { cwd: raiz, encoding: "utf8", timeout: 15000 };
        const cabeza = execFileSync("gh", ["pr", "view", ...(numero ? [numero] : []), "--json", "headRefOid", "-q", ".headRefOid"], opts).trim();
        const n = Number(execFileSync("gh", ["api", `repos/{owner}/{repo}/compare/staging...${cabeza}`, "-q", ".behind_by"], opts).trim());
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    },
  };
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
      // oct 2026, el cableado). Se mira al abrirlo y otra vez al fusionarlo.
      if (/^gh\s+pr\s+create\b/.test(o)) {
        const atraso = ctx.atrasoLocal(carpetaDe(cmd, o, entrada.cwd ?? "") || undefined);
        if (atraso === null) return ask("No he podido comprobar si tu rama tiene lo último de staging. Haz `git fetch origin staging` y `git merge origin/staging` antes de abrir el PR.");
        if (atraso > 0) return deny(`Tu rama va ${atraso} commit(s) por detrás de staging. Antes de abrir el PR: \`git fetch origin staging\`, \`git merge origin/staging\`, resuelve, pasa los tests y empuja.`);
        continue;
      }

      // gh pr merge: solo a staging (lo permite settings.local.json de Pablo).
      const merge = o.match(/^gh\s+pr\s+merge\b\s*(\d+)?/);
      if (merge) {
        const base = ctx.baseDelPr(merge[1]);
        if (base === null) return ask("No he podido leer la rama base de este PR. Si no es staging, solo Pablo lo fusiona.");
        if (base !== "staging") return deny(`Este PR va contra ${base}, no contra staging. Fusionar fuera de staging solo lo hace Pablo.`);
        const atraso = ctx.atrasoDelPr(merge[1]);
        if (atraso === null) return ask("No he podido comprobar si la rama del PR tiene lo último de staging. Míralo antes de fusionar.");
        if (atraso > 0) return deny(`La rama del PR va ${atraso} commit(s) por detrás de staging: el CI no ha probado tu cambio junto a lo último. Ponla al día (\`gh pr update-branch${merge[1] ? ` ${merge[1]}` : ""}\` o merge de origin/staging y push), espera el CI en verde y fusiona.`);
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
    if (/[\\/]\.claude[\\/](settings\.json|hooks[\\/])/.test(ruta)) {
      return ask("Esto cambia los permisos o los hooks compartidos de todas las sesiones. Pide el OK de Pablo.");
    }
    return null;
  }

  return null;
}

// ── Entrada desde Claude Code ──────────────────────────────────────────────

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  let crudo = "";
  for await (const trozo of process.stdin) crudo += trozo;
  let entrada;
  try {
    entrada = JSON.parse(crudo);
  } catch {
    process.exit(0); // sin entrada legible no hay nada que vigilar
  }
  // La raíz del worktree donde se trabaja, no CLAUDE_PROJECT_DIR (que apunta a
  // la carpeta original): el ESTADO.md que vale es el de tu rama.
  const ruta = String(entrada.tool_input?.file_path ?? "");
  const desde = ruta.match(/^(.*?)[\\/]supabase[\\/]migrations[\\/]/)?.[1] || entrada.cwd || process.cwd();
  let raiz = process.env.CLAUDE_PROJECT_DIR || desde;
  try {
    raiz = execFileSync("git", ["-C", desde, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // fuera de un repo: nos quedamos con lo que hay
  }
  try {
    tocar(dirSesiones(raiz), entrada.session_id); // «sigo viva», para el registro de sesiones
  } catch {
    // el registro es una ayuda, no un requisito
  }
  const r = decidir(entrada, contextoReal(raiz));
  if (r) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: r.decision,
        permissionDecisionReason: `[guardia] ${r.motivo}`,
      },
    }));
  }
  process.exit(0);
}
