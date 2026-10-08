/**
 * Clasificación de los issues de MenuPlan: una sola fuente.
 *
 * De aquí salen las etiquetas de GitHub (`npm run issues -- --etiquetas`),
 * las opciones de los formularios de `.github/ISSUE_TEMPLATE/` (un test
 * comprueba que coinciden) y la tabla de `npm run issues`.
 *
 * Por qué: lo que falla en una sesión se perdía en el chat al cerrarla. Un
 * issue sobrevive al reinicio, lo ven Álvaro y las sesiones de la nube, y con
 * las mismas etiquetas siempre se puede contar qué falla más y cuánto se
 * tarda en dejarlo arreglado.
 *
 * Poca y fija a propósito: una clasificación que crece sin control deja de
 * rellenarse igual y ya no se puede contar. Una categoría nueva se añade aquí,
 * con su descripción, y en el formulario que la use.
 */

export const GRUPOS = {
  tipo: {
    color: "1d76db",
    obligatorio: true,
    valores: {
      leccion: "Algo falló o casi falla: falta que la lección quede en un test, la guardia, una regla o una skill",
      decision: "Espera a que decida Pablo (o Álvaro): pregunta, opciones y recomendación",
      encargo: "Trabajo por hacer, con quién lo coge, para no duplicarlo entre sesiones",
    },
  },
  causa: {
    titulo: "Causa",
    color: "d93f0b",
    obligatorio: (tipos) => tipos.has("leccion"),
    valores: {
      "vigilante-falso": "Un vigilante (guardia, script, CI) bloqueó algo que estaba bien",
      "vigilante-hueco": "Un vigilante dejó pasar algo que estaba mal",
      entorno: "Lo local no es igual que el CI o que producción (PATH, flags, Windows, red)",
      limpieza: "Algo automático se quedó a medias sin avisar (carpetas, ramas, crons)",
      coordinacion: "Sesiones que se pisan, duplican trabajo o pierden un aviso",
      "modelo-datos": "Una tabla, una FK o un dato que no cuadra con su uso",
      codigo: "Un fallo de lógica en el producto",
    },
  },
  area: {
    titulo: "Área",
    color: "0e8a16",
    obligatorio: true,
    valores: {
      datos: "Esquema, migraciones, Supabase",
      lola: "El bot",
      ui: "La app: pantallas e iconos",
      catalogo: "Recetas, alimentos y nutrición",
      motor: "Planificador y solver",
      ops: "Git, CI, hooks, scripts, servicios",
    },
  },
  arreglo: {
    color: "5319e7",
    // Se pone al cerrar una lección: dónde QUEDÓ, no dónde se pensaba ponerlo.
    // Por eso no tiene `titulo` (no sale de un desplegable del formulario):
    // si se pusiera al abrir, la tabla contaría intenciones y no resultados.
    obligatorioAlCerrar: (tipos) => tipos.has("leccion"),
    valores: {
      test: "Quedó en un test",
      guardia: "Quedó en la guardia (.claude/hooks/guardia.mjs)",
      script: "Quedó en un script que lo comprueba (tarea, retirar, apply-migration…)",
      regla: "Quedó en CLAUDE.md o en .claude/rules/",
      skill: "Quedó en un runbook de .claude/skills/",
      ninguno: "No hace falta, y el issue dice por qué",
    },
  },
};

/** Todas las etiquetas: [{ name, color, description }]. */
export function etiquetas() {
  return Object.entries(GRUPOS).flatMap(([grupo, g]) =>
    Object.entries(g.valores).map(([v, description]) => ({ name: `${grupo}:${v}`, color: g.color, description })),
  );
}

/** { tipo: Set, causa: Set, … } a partir de los nombres de etiqueta. */
export function porGrupo(nombres) {
  const out = Object.fromEntries(Object.keys(GRUPOS).map((g) => [g, new Set()]));
  for (const n of nombres) {
    const [g, v] = String(n).split(":");
    if (out[g] && v) out[g].add(v);
  }
  return out;
}

/** Qué le falta a un issue para estar bien clasificado. */
export function faltas(issue) {
  const g = porGrupo((issue.labels ?? []).map((l) => l.name ?? l));
  const cerrado = String(issue.state).toUpperCase() === "CLOSED";
  const no = [];
  for (const [grupo, def] of Object.entries(GRUPOS)) {
    const pide = typeof def.obligatorio === "function" ? def.obligatorio(g.tipo) : def.obligatorio;
    const pideAlCerrar = cerrado && def.obligatorioAlCerrar?.(g.tipo);
    if ((pide || pideAlCerrar) && g[grupo].size === 0) no.push(grupo);
  }
  if (g.tipo.size > 1) no.push("tipo (más de uno)");
  // Una lección cerrada enlaza el PR que la arregló, salvo que no hiciera falta
  // arreglo. Solo se mira si se conocen los PR (vienen de leerIssue).
  if (cerrado && g.tipo.has("leccion") && !g.arreglo.has("ninguno") && issue.prs && !issue.prs.length) {
    no.push("PR del arreglo («Closes #n» en el PR, o «PR #n» al cerrar)");
  }
  return no;
}

// ── Trazabilidad: lo que se deduce de GitHub sin rellenar nada ────────────────

/** Consulta GraphQL de una página de issues con todo lo que se traza. */
export const CONSULTA = `query($cursor: String) {
  repository(owner: "pabloam89", name: "MenuPlan") {
    issues(first: 100, after: $cursor, states: [OPEN, CLOSED], orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title state createdAt closedAt body
        labels(first: 20) { nodes { name } }
        assignees(first: 5) { nodes { login } }
        reaperturas: timelineItems(itemTypes: [REOPENED_EVENT]) { totalCount }
        closedByPullRequestsReferences(first: 5, includeClosedPrs: true) {
          nodes { number headRefName mergedAt body author { login } }
        }
        comments(last: 3) { nodes { body } }
        parent { number }
      }
    }
  }
}`;

/**
 * Quién arregló: la línea «Agente: gobierno» del PR. Sin ella, «sesión»
 * (la sesión principal, sin agente). Un nombre que no es de .claude/agents/
 * se cuenta tal cual: mejor verlo raro en la tabla que perderlo.
 */
export function agenteDe(body) {
  return /^\s*Agente:\s*`?([\w-]+)/im.exec(String(body ?? ""))?.[1].toLowerCase() ?? "sesión";
}

/**
 * Un nodo de la consulta, plano. Los PR que lo cierran son los enlazados con
 * «Closes #n»; si no hay, se buscan «PR #n» en los últimos comentarios (lo que
 * se escribe al cerrar a mano). Esos no traen rama ni agente.
 */
export function leerIssue(n) {
  let prs = (n.closedByPullRequestsReferences?.nodes ?? [])
    .filter((p) => p.mergedAt)
    .map((p) => ({ number: p.number, rama: p.headRefName, autor: p.author?.login ?? null, agente: agenteDe(p.body), mergedAt: p.mergedAt }));
  if (!prs.length && String(n.state).toUpperCase() === "CLOSED") {
    const citados = (n.comments?.nodes ?? []).flatMap((c) => [...String(c.body).matchAll(/\bPR\s+#(\d+)/gi)].map((m) => Number(m[1])));
    prs = [...new Set(citados)].map((number) => ({ number, rama: null, autor: null, agente: null, mergedAt: null }));
  }
  return {
    number: n.number,
    title: n.title,
    state: n.state,
    createdAt: n.createdAt,
    closedAt: n.closedAt,
    body: n.body,
    labels: (n.labels?.nodes ?? []).map((l) => ({ name: l.name })),
    asignados: (n.assignees?.nodes ?? []).map((a) => a.login),
    reaperturas: n.reaperturas?.totalCount ?? 0,
    prs,
    padre: n.parent?.number ?? null,
  };
}

/**
 * Etiquetas que se deducen de lo que se rellenó en un formulario: GitHub pone
 * la de tipo, pero los desplegables quedan como texto bajo su título
 * («### Causa\n\nvigilante-falso — …»): cuenta la primera palabra.
 */
export function etiquetasDeFormulario(body) {
  const out = [];
  for (const [grupo, def] of Object.entries(GRUPOS)) {
    if (!def.titulo) continue;
    const m = new RegExp(`^###\\s+${def.titulo}\\s*\\n+\\s*([\\w-]+)`, "im").exec(String(body ?? ""));
    if (m && def.valores[m[1]]) out.push(`${grupo}:${m[1]}`);
  }
  return out;
}

const dias = (a, b) => (new Date(b) - new Date(a)) / 86_400_000;

function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Cuentas para aprender: abiertos por tipo y, de las lecciones, cuántas por
 * causa y por agente que las arregló: dónde quedó el arreglo, cuántos días
 * tardaron en cerrarse y cuántas veces se reabrieron (arreglo que no aguantó).
 */
export function resumen(issues) {
  const abiertos = issues.filter((i) => String(i.state).toUpperCase() === "OPEN");
  const lecciones = issues.filter((i) => porGrupo((i.labels ?? []).map((l) => l.name ?? l)).tipo.has("leccion"));
  const porTipo = {};
  for (const i of abiertos) for (const t of porGrupo((i.labels ?? []).map((l) => l.name ?? l)).tipo) porTipo[t] = (porTipo[t] ?? 0) + 1;
  const causas = {};
  const agentes = {};
  for (const i of lecciones) {
    const g = porGrupo((i.labels ?? []).map((l) => l.name ?? l));
    // Por el estado, no por closedAt: uno reabierto puede conservarlo.
    const cerrada = String(i.state).toUpperCase() === "CLOSED" && i.closedAt;
    for (const c of g.causa.size ? g.causa : ["(sin causa)"]) {
      const fila = (causas[c] ??= { total: 0, abiertas: 0, reaperturas: 0, diasCierre: [], arreglos: {} });
      fila.total++;
      fila.reaperturas += i.reaperturas ?? 0;
      if (cerrada) {
        fila.diasCierre.push(dias(i.createdAt, i.closedAt));
        for (const a of g.arreglo) fila.arreglos[a] = (fila.arreglos[a] ?? 0) + 1;
      } else fila.abiertas++;
    }
    // Quién la arregló: el agente del último PR fusionado que la cierra. Una
    // reabierta cuenta para quien la cerró antes: su arreglo no aguantó.
    const pr = (i.prs ?? []).filter((p) => p.agente).at(-1);
    if (pr && (cerrada || i.reaperturas)) {
      const fila = (agentes[pr.agente] ??= { arregladas: 0, reaperturas: 0, diasCierre: [] });
      fila.arregladas++;
      fila.reaperturas += i.reaperturas ?? 0;
      if (cerrada) fila.diasCierre.push(dias(i.createdAt, i.closedAt));
    }
  }
  for (const f of [...Object.values(causas), ...Object.values(agentes)]) f.medianaDias = mediana(f.diasCierre);
  return {
    porTipo,
    causas,
    agentes,
    malClasificados: issues.map((i) => ({ number: i.number, title: i.title, faltan: faltas(i) })).filter((x) => x.faltan.length),
  };
}
