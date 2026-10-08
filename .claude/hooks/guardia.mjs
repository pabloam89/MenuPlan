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
import { join, resolve } from "node:path";
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

// Escribir en producción se niega siempre, no se pregunta: en modo auto un
// «ask» puede resolverlo el clasificador en vez de una persona. Lo lanza Pablo
// con `!` en su terminal (eso no pasa por los hooks), después de ver el ensayo.
const REGLAS_SQL = [
  {
    // La única vía para tocar la base, y la base es la de producción.
    si: (o) => /apply-migration\.mjs\b/.test(o) && /\s--si(\s|$)/.test(o),
    da: (o) => deny(`Aplicar en PRODUCCIÓN lo lanza Pablo, no una sesión. Enséñale el ensayo y dale el comando para que lo pegue con \`!\`: ${o.trim()}`),
  },
  {
    // SQL que escribe o cambia permisos contra una base real.
    si: (o) => /\b(psql|SUPABASE_DB_URL|OPS_DB_URL|pg\.Client|new\s+Client)\b/.test(o)
      && /\b(drop\s+(table|schema|column|function|policy|constraint|index|view|type|trigger)|truncate|delete\s+from|alter\s+(table|type|function|policy)|update\s+[\w."]+\s+set|insert\s+into|grant|revoke|create\s+(table|policy|function|or\s+replace))\b/i.test(o),
    da: () => deny("SQL que escribe, borra o cambia permisos contra producción (es la única base). Va en una migración por `scripts/apply-migration.mjs`; si de verdad hace falta a mano, dale el comando a Pablo para que lo lance con `!`."),
  },
];

/** Ficheros de migración que un comando de shell escribe, mueve o borra. */
const MIGRACION_EN_COMANDO = /(?:sed\s+-i|>>?|\btee\b|\bmv\b|\brm\b|\bcp\b)[^\n]*?supabase[\\/]migrations[\\/](?<nombre>\d{4}_[\w-]+)\.sql/;

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

function contextoReal(raiz) {
  let deStaging;
  return {
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
    for (const o of ordenes(cmd)) {
      for (const r of REGLAS_COMANDO) if (r.si(o)) return r.da(o);

      // gh pr merge: solo a staging (lo permite settings.local.json de Pablo).
      const merge = o.match(/^gh\s+pr\s+merge\b\s*(\d+)?/);
      if (merge) {
        const base = ctx.baseDelPr(merge[1]);
        if (base === "staging") continue;
        if (base === null) return ask("No he podido leer la rama base de este PR. Si no es staging, solo Pablo lo fusiona.");
        return deny(`Este PR va contra ${base}, no contra staging. Fusionar fuera de staging solo lo hace Pablo.`);
      }
    }
    // El SQL se mira en el comando entero: un `node -e` lleva sus propios `;`.
    for (const r of REGLAS_SQL) if (r.si(cmd)) return r.da(cmd);

    const m = cmd.match(MIGRACION_EN_COMANDO);
    if (m) {
      const motivo = migracionCerrada(m.groups.nombre, ctx);
      if (motivo) return deny(motivo);
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
