/**
 * Clasificación de los issues de MenuPlan: una sola fuente.
 *
 * De aquí salen las etiquetas de GitHub (`npm run issues -- --etiquetas`),
 * las opciones de los formularios de `.github/ISSUE_TEMPLATE/` (un test
 * comprueba que coinciden), la tabla de `npm run issues` y lo que el arranque
 * enseña a cada sesión.
 *
 * Por qué: lo que falla en una sesión se perdía en el chat al cerrarla, y
 * arreglarlo caso a caso no aprende nada. Cada fallo se analiza hasta su
 * problema de fondo; los casos cuelgan de él como evidencia y los encargos,
 * como el trabajo para arreglarlo. Así se cuenta qué problema duele más y qué
 * arreglos no aguantan.
 *
 *   problema de fondo (tipo:fondo)   qué falla y su arreglo general
 *     ├─ caso (tipo:caso)            dónde se ha visto: la evidencia
 *     └─ encargo (tipo:encargo)      una parte del arreglo, con su dueño
 *
 * Todo caso se analiza y acaba en una de cuatro respuestas (`analisis:`):
 *   nuevo             no había problema de fondo: se abre uno
 *   abierto           cuelga de uno abierto: más evidencia, más prioridad
 *   no-aguanto-roto   cuelga de uno cerrado: su arreglo se rompió después
 *   no-aguanto-corto  cuelga de uno cerrado: su arreglo tapó casos, no la clase
 *   puntual           no puede repetirse (o repetirlo no hace daño), y se dice
 *                     por qué; se apunta igual para que la revisión semanal vea
 *                     si tres «puntuales» eran un patrón
 *
 * Poca y fija a propósito: una clasificación que crece sin control deja de
 * rellenarse igual y ya no se puede contar. Una categoría nueva se añade aquí,
 * con su descripción, y en el formulario que la use.
 */

import { limpiarTexto } from "./textoExterno.mjs";

export const GRUPOS = {
  tipo: {
    color: "1d76db",
    obligatorio: true,
    valores: {
      fondo: "Problema de fondo: qué falla y su arreglo general. De él cuelgan casos y encargos",
      caso: "Un fallo concreto, analizado: cuelga de su problema de fondo o es puntual con su porqué",
      encargo: "Trabajo por hacer, con dueño; si es parte de un arreglo, cuelga de su problema de fondo",
      decision: "Espera a que decida Pablo (o Álvaro): pregunta, opciones y recomendación",
    },
  },
  analisis: {
    titulo: "Análisis",
    color: "fbca04",
    obligatorio: (tipos) => tipos.has("caso"),
    valores: {
      nuevo: "No había problema de fondo: se abrió uno para este caso",
      abierto: "Su problema de fondo estaba abierto: un caso más",
      "no-aguanto-roto": "Su problema de fondo estaba cerrado y el arreglo se rompió después",
      "no-aguanto-corto": "Su problema de fondo estaba cerrado y el arreglo no cubría la clase entera",
      puntual: "No puede repetirse, o repetirlo no hace daño; el issue dice por qué",
    },
  },
  causa: {
    titulo: "Causa",
    color: "d93f0b",
    // El problema de fondo lleva la causa; un caso la hereda. El puntual, que
    // no cuelga de nada, la lleva él para que la revisión pueda agruparlos.
    obligatorio: (tipos, g) => tipos.has("fondo") || (tipos.has("caso") && g.analisis.has("puntual")),
    valores: {
      "vigilante-falso": "Un vigilante (guardia, script, CI) bloqueó algo que estaba bien",
      "vigilante-hueco": "Un vigilante dejó pasar algo que estaba mal",
      entorno: "Lo local no es igual que el CI o que producción (PATH, flags, Windows, red)",
      "dos-fuentes": "La misma regla o dato escrito en dos sitios, que acaban diciendo cosas distintas",
      "error-silencioso": "Un error que se traga sin dejar aviso (catch vacío, exception when others, «se calla»)",
      coordinacion: "Sesiones que se pisan, duplican trabajo o pierden un aviso",
      "modelo-datos": "Una tabla, una FK o un dato que no cuadra con su uso",
      codigo: "Un fallo de lógica en el producto",
      "sin-comprobar": "Algo se dio por cierto (en un issue, un comentario o una respuesta) sin comprobarlo contra el código o los datos",
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
    // Se pone al cerrar un problema de fondo: dónde QUEDÓ, no dónde se pensaba
    // ponerlo. Por eso no tiene `titulo` (no sale de un desplegable): si se
    // pusiera al abrir, la tabla contaría intenciones y no resultados.
    obligatorioAlCerrar: (tipos) => tipos.has("fondo"),
    valores: {
      test: "Quedó en un test",
      guardia: "Quedó en la guardia (.claude/hooks/guardia.mjs)",
      script: "Quedó en un script que lo comprueba (tarea, retirar, apply-migration…)",
      regla: "Quedó en CLAUDE.md o en .claude/rules/",
      skill: "Quedó en un runbook de .claude/skills/",
      ninguno: "No hace falta, y el issue dice por qué",
    },
  },
  control: {
    color: "c5def5",
    // Lo pone el workflow `fondos` (#337), no una persona: por eso no tiene
    // `titulo` (no sale de un desplegable) ni es obligatoria.
    valores: {
      ok: "La ficha del fondo pasa los controles del workflow fondos",
      falla: "La ficha del fondo tiene errores: el comentario del workflow fondos dice cuáles",
    },
  },
};

const PREFIJOS = Object.keys(GRUPOS);

/** Todas las etiquetas: [{ name, color, description }]. */
export function etiquetas() {
  return Object.entries(GRUPOS).flatMap(([grupo, g]) =>
    Object.entries(g.valores).map(([v, description]) => ({ name: `${grupo}:${v}`, color: g.color, description })),
  );
}

/** Etiquetas con nuestros prefijos que ya no están en GRUPOS (para retirarlas). */
export function etiquetasSobrantes(nombres) {
  const vale = new Set(etiquetas().map((e) => e.name));
  return nombres.filter((n) => PREFIJOS.includes(String(n).split(":")[0]) && String(n).includes(":") && !vale.has(n));
}

const nombres = (labels) => (labels ?? []).map((l) => l?.name ?? l);
const cerrado = (i) => String(i?.state).toUpperCase() === "CLOSED";

/** { tipo: Set, causa: Set, … } a partir de los nombres de etiqueta. */
export function porGrupo(lista) {
  const out = Object.fromEntries(PREFIJOS.map((g) => [g, new Set()]));
  for (const n of lista) {
    const [g, v] = String(n).split(":");
    if (out[g] && v) out[g].add(v);
  }
  return out;
}

const grupos = (i) => porGrupo(nombres(i.labels));

/** ¿Justifica el cuerpo por qué es puntual? (formulario o texto libre) */
export function justificaPuntual(body) {
  const b = String(body ?? "");
  const form = /^###\s+Por qué es puntual\s*\n+\s*(\S[^\n]*)/im.exec(b)?.[1];
  if (form && !/^_No response_/.test(form)) return true;
  return /\bpuntual porque\b/i.test(b);
}

/** Qué le falta a un issue para estar bien clasificado y trazado. */
export function faltas(issue) {
  const g = grupos(issue);
  const no = [];
  for (const [grupo, def] of Object.entries(GRUPOS)) {
    const pide = typeof def.obligatorio === "function" ? def.obligatorio(g.tipo, g) : def.obligatorio;
    const pideAlCerrar = cerrado(issue) && def.obligatorioAlCerrar?.(g.tipo);
    if ((pide || pideAlCerrar) && g[grupo].size === 0) no.push(grupo);
  }
  if (g.tipo.size > 1) no.push("tipo (más de uno)");
  if (g.analisis.size > 1) no.push("analisis (más de uno)");
  const viejas = etiquetasSobrantes(nombres(issue.labels));
  if (viejas.length) no.push(`reclasificar: ${viejas.join(", ")} ya no existe${viejas.length > 1 ? "n" : ""}`);

  if (g.tipo.has("caso")) {
    if (g.analisis.has("puntual")) {
      if (!justificaPuntual(issue.body)) no.push("por qué es puntual («Puntual porque …»)");
      if (issue.padre) no.push(`puntual pero cuelga de #${issue.padre.number}: o no es puntual, o descuélgalo`);
    } else if (g.analisis.size && issue.padre !== undefined) {
      // Analizado como parte de algo: tiene que colgar de su problema de fondo.
      if (!issue.padre || issue.padre.tipo !== "fondo") no.push("su problema de fondo (npm run issues -- --colgar <caso> <fondo>)");
    }
  }

  if (g.tipo.has("fondo")) {
    if (!/arreglo general/i.test(String(issue.body ?? ""))) no.push("el arreglo general en el cuerpo");
    if (cerrado(issue)) {
      if (issue.prs && !issue.prs.length && !g.arreglo.has("ninguno")) {
        no.push("PR del arreglo («Closes #n» en el PR, o «PR #n» al cerrar)");
      }
      const pendientes = (issue.hijos ?? []).filter((h) => h.tipo === "encargo" && !cerrado(h));
      if (pendientes.length) no.push(`encargos abiertos (${pendientes.map((h) => `#${h.number}`).join(", ")})`);
    }
  }
  return no;
}

/**
 * Etiquetas y padre que se deducen de lo que se rellenó en un formulario:
 * GitHub pone la de tipo, pero los desplegables quedan como texto bajo su
 * título («### Causa\n\nvigilante-falso — …»): cuenta la primera palabra.
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

/**
 * Al colgar un caso de un fondo cerrado, ¿se reabre el fondo? Solo si el caso
 * es la prueba de que el arreglo no aguantó: pasó después de cerrarlo, o
 * alguien ya lo analizó como `no-aguanto-*`. Un caso viejo que se reordena
 * (reclasificar lecciones, juntar fondos) no reabre nada: la reapertura queda
 * para siempre en el historial y contaría un «no aguantó» que no pasó.
 */
export function debeReabrir(hijo, fondo) {
  const g = grupos(hijo);
  if (!g.tipo.has("caso") || !cerrado(fondo)) return false;
  if ([...g.analisis].some((a) => a.startsWith("no-aguanto"))) return true;
  return Boolean(fondo.closedAt && hijo.createdAt && new Date(hijo.createdAt) > new Date(fondo.closedAt));
}

/** Etiquetas del formulario que faltan, solo de los grupos que el issue aún no tiene. */
export function etiquetasQueFaltan(issue) {
  const g = grupos(issue);
  return etiquetasDeFormulario(issue.body).filter((e) => g[e.split(":")[0]].size === 0);
}

/** El «#n» del campo «De qué problema de fondo» de un formulario, o null. */
export function fondoDeFormulario(body) {
  const m = /^###\s+De qué problema de fondo\s*\n+\s*#?(\d+)/im.exec(String(body ?? ""));
  return m ? Number(m[1]) : null;
}

// ── Lectura de GitHub ─────────────────────────────────────────────────────────

/** Consulta GraphQL de una página de issues con todo lo que se traza. */
export const CONSULTA = `query($cursor: String) {
  repository(owner: "pabloam89", name: "MenuPlan") {
    issues(first: 100, after: $cursor, states: [OPEN, CLOSED], orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number title state createdAt closedAt body authorAssociation
        labels(first: 20) { nodes { name } }
        assignees(first: 5) { nodes { login } }
        reaperturas: timelineItems(itemTypes: [REOPENED_EVENT], last: 1) { totalCount nodes { ... on ReopenedEvent { createdAt } } }
        closedByPullRequestsReferences(first: 5, includeClosedPrs: true) {
          nodes { number headRefName mergedAt body author { login } }
        }
        comments(last: 10) { nodes { body authorAssociation createdAt } }
        parent { number state labels(first: 20) { nodes { name } } }
        subIssues(first: 50) {
          nodes {
            number state createdAt labels(first: 20) { nodes { name } }
            closedByPullRequestsReferences(first: 3, includeClosedPrs: true) { nodes { mergedAt body } }
          }
        }
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

const tipoDe = (labels) => [...porGrupo(nombres(labels)).tipo][0] ?? null;

/**
 * Un nodo de la consulta, plano. Los PR que lo cierran son los enlazados con
 * «Closes #n»; si no hay, se buscan «PR #n» en los últimos comentarios (lo que
 * se escribe al cerrar a mano). Esos no traen rama ni agente.
 */
export function leerIssue(n) {
  let prs = (n.closedByPullRequestsReferences?.nodes ?? [])
    .filter((p) => p.mergedAt)
    .map((p) => ({ number: p.number, rama: p.headRefName, autor: p.author?.login ?? null, agente: agenteDe(p.body), mergedAt: p.mergedAt }));
  if (!prs.length && cerrado(n)) {
    // Pendiente en #313: este «PR #n» sale de comentarios de cualquiera (no se filtra por authorAssociation).
    const citados = (n.comments?.nodes ?? []).flatMap((c) => [...String(c.body).matchAll(/\bPR\s+#(\d+)/gi)].map((m) => Number(m[1])));
    prs = [...new Set(citados)].map((number) => ({ number, rama: null, autor: null, agente: null, mergedAt: null }));
  }
  const ref = (x) => ({
    number: x.number, state: x.state, createdAt: x.createdAt ?? null, tipo: tipoDe(x.labels?.nodes),
    labels: (x.labels?.nodes ?? []).map((l) => ({ name: l.name })),
    // El agente del PR fusionado que cerró este hijo (un encargo): de ahí sale
    // quién arregló el fondo cuando el fondo se cierra a mano.
    agente: (x.closedByPullRequestsReferences?.nodes ?? []).filter((p) => p.mergedAt).map((p) => agenteDe(p.body)).at(-1) ?? null,
  });
  return {
    id: n.id,
    number: n.number,
    title: n.title,
    state: n.state,
    createdAt: n.createdAt,
    closedAt: n.closedAt,
    body: n.body,
    asociacion: n.authorAssociation ?? null,
    labels: (n.labels?.nodes ?? []).map((l) => ({ name: l.name })),
    asignados: (n.assignees?.nodes ?? []).map((a) => a.login),
    reaperturas: n.reaperturas?.totalCount ?? 0,
    ultimaReapertura: n.reaperturas?.nodes?.at(-1)?.createdAt ?? null,
    prs,
    padre: n.parent ? ref(n.parent) : null,
    hijos: (n.subIssues?.nodes ?? []).map(ref),
  };
}

// ── Cuentas ───────────────────────────────────────────────────────────────────

const dias = (a, b) => (new Date(b) - new Date(a)) / 86_400_000;

function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Un problema de fondo con lo que cuelga de él. */
export function fichaDeFondo(f) {
  const hijos = f.hijos ?? [];
  const casos = hijos.filter((h) => h.tipo === "caso");
  const encargos = hijos.filter((h) => h.tipo === "encargo");
  const analisis = (h) => porGrupo(nombres(h.labels)).analisis;
  const g = grupos(f);
  // Quién lo arregló: el PR que cerró el fondo o, si se cerró a mano (lo
  // normal: se cierra al acabar sus encargos), el del último encargo cerrado.
  const agente = (f.prs ?? []).filter((p) => p.agente).at(-1)?.agente
    ?? encargos.filter((h) => cerrado(h) && h.agente).at(-1)?.agente ?? null;
  return {
    number: f.number,
    title: f.title,
    abierto: !cerrado(f),
    causa: [...g.causa][0] ?? null,
    area: [...g.area][0] ?? null,
    casos: casos.length,
    casosAbiertos: casos.filter((h) => !cerrado(h)).length,
    encargosHechos: encargos.filter(cerrado).length,
    encargos: encargos.length,
    reaperturas: f.reaperturas ?? 0,
    noAguanto: {
      roto: casos.filter((h) => analisis(h).has("no-aguanto-roto")).length,
      corto: casos.filter((h) => analisis(h).has("no-aguanto-corto")).length,
    },
    agente,
    diasCierre: cerrado(f) && f.closedAt ? dias(f.createdAt, f.closedAt) : null,
  };
}

/**
 * Cuentas para aprender:
 * - problemas de fondo, ordenados por cuántos casos tienen (dónde duele);
 * - por causa: fondos, casos, puntuales, reaperturas y días hasta cerrar;
 * - por agente que cerró el fondo: cuántos, cuántos no aguantaron y por qué;
 * - los puntuales, para que la revisión vea si eran un patrón;
 * - lo que está sin clasificar o sin trazar.
 */
export function resumen(issues) {
  const porTipo = {};
  for (const i of issues.filter((x) => !cerrado(x))) for (const t of grupos(i).tipo) porTipo[t] = (porTipo[t] ?? 0) + 1;

  const fondos = issues.filter((i) => grupos(i).tipo.has("fondo")).map(fichaDeFondo)
    .sort((a, b) => Number(b.abierto) - Number(a.abierto) || b.casos - a.casos || b.reaperturas - a.reaperturas);
  const puntuales = issues.filter((i) => grupos(i).tipo.has("caso") && grupos(i).analisis.has("puntual"));

  const causas = {};
  const fila = (c) => (causas[c ?? "(sin causa)"] ??= { fondos: 0, casos: 0, puntuales: 0, reaperturas: 0, diasCierre: [], arreglos: {} });
  for (const i of issues.filter((x) => grupos(x).tipo.has("fondo"))) {
    const f = fichaDeFondo(i);
    const c = fila(f.causa);
    c.fondos++;
    c.casos += f.casos;
    c.reaperturas += f.reaperturas;
    if (f.diasCierre != null) c.diasCierre.push(f.diasCierre);
    for (const a of grupos(i).arreglo) c.arreglos[a] = (c.arreglos[a] ?? 0) + 1;
  }
  for (const p of puntuales) fila([...grupos(p).causa][0]).puntuales++;

  const agentes = {};
  for (const f of fondos.filter((x) => x.agente)) {
    const a = (agentes[f.agente] ??= { fondos: 0, roto: 0, corto: 0, diasCierre: [] });
    a.fondos++;
    a.roto += f.noAguanto.roto;
    a.corto += f.noAguanto.corto;
    if (f.diasCierre != null) a.diasCierre.push(f.diasCierre);
  }
  for (const x of [...Object.values(causas), ...Object.values(agentes)]) x.medianaDias = mediana(x.diasCierre);

  return {
    porTipo,
    fondos,
    causas,
    agentes,
    puntuales: puntuales.map((p) => ({ number: p.number, title: p.title, causa: [...grupos(p).causa][0] ?? null, createdAt: p.createdAt })),
    malClasificados: issues.map((i) => ({ number: i.number, title: i.title, faltan: faltas(i) })).filter((x) => x.faltan.length),
  };
}

// ── La línea «Casos:» de los PR fusionados (#185) ────────────────────────────

/** Consulta de los últimos PR fusionados: solo número, cuerpo y fecha. */
export const CONSULTA_PR = `query {
  repository(owner: "pabloam89", name: "MenuPlan") {
    pullRequests(first: 50, states: MERGED, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number body mergedAt author { login } }
    }
  }
}`;

/**
 * Cuántos PR fusionados registran casos, cuántos dicen «ninguno» y cuántos no
 * tienen la línea (los anteriores a la norma, o de un bot). Es la medida de si
 * el paso «Cuando algo falla» se cumple: un porcentaje alto de «ninguno» pide
 * mirar los motivos. `analizar` es analizarCasos (se inyecta para no atar la
 * lib a los hooks).
 */
export function medirCasos(prs, analizar) {
  const r = { total: 0, conCasos: 0, ninguno: 0, sinLinea: 0, casosCitados: 0 };
  for (const p of prs) {
    if (/\[bot\]$/.test(p.author?.login ?? "")) continue;
    r.total++;
    const a = analizar(p.body);
    if (!a.valida) r.sinLinea++;
    else if (a.ninguno) r.ninguno++;
    else {
      r.conCasos++;
      r.casosCitados += a.numeros.length;
    }
  }
  return r;
}

// ── Antes de crear: los parecidos ─────────────────────────────────────────────
//
// El 8 oct 2026 tres sesiones abrieron el mismo fallo (#153, #154, #159) con el
// primero ya abierto: la norma pedía buscar y nada obligaba. `npm run issues --
// --nuevo` busca con esto antes de crear (la guardia niega `gh issue create`),
// y el aviso al editar (`.claude/hooks/avisos.mjs`) usa `ficherosNombrados`.

/** Quien decide: las decisiones se le asignan para que le lleguen. */
export const PABLO = "pabloam89";

const VACIAS = new Set([
  "para", "pero", "como", "cuando", "donde", "desde", "hasta", "sobre", "entre", "este", "esta", "esto", "estos", "estas",
  "ese", "esa", "eso", "esos", "esas", "aqui", "ahora", "todo", "toda", "todos", "todas", "otro", "otra", "otros", "otras",
  "porque", "aunque", "solo", "sola", "tambien", "nada", "algo", "cada", "mismo", "misma", "sigue", "siempre", "nunca",
  "hace", "hacer", "puede", "pueden", "tiene", "tienen", "queda", "quedan", "ser", "esta", "estan", "hay", "sin", "con",
]);

/** Raíces de las palabras con peso: sin acentos, sin vacías, 4+ letras, cortadas a 5 (carpeta = carpetas). */
export function raices(texto) {
  const limpio = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^\[[^\]]*\]\s*/, "");
  return new Set((limpio.match(/[a-z0-9]+/g) ?? []).filter((p) => p.length >= 4 && !VACIAS.has(p)).map((p) => p.slice(0, 5)));
}

/** Nombres de fichero que salen en todas partes y no distinguen nada. */
const COMUNES = new Set(["claude.md", "skill.md", "readme.md", "package.json", "package-lock.json", "index.js", "index.jsx", "estado.md"]);

/** Los ficheros que nombra un texto, por su nombre (`guardia.mjs`), sin los comunes. */
export function ficherosNombrados(texto) {
  // Sin ReDoS (ronda 3 de #384): el lookbehind obliga a empezar al principio de cada palabra y el tope de
  // 120 caracteres acota el retroceso; una palabra de 60 KB sin punto ya no cuesta segundos.
  const m = String(texto ?? "").match(/(?<![\w.-])[\w.-]{1,120}\.(?:mjs|cjs|js|jsx|ts|tsx|json|md|sql|yml|yaml|css)\b/gi) ?? [];
  return new Set(m.map((f) => f.replace(/^.*[\\/]/, "").toLowerCase()).filter((f) => !COMUNES.has(f)));
}

/**
 * Los issues que se parecen a uno nuevo, de más a menos: [{ number, title,
 * state, parecido }]. Parecido = palabras del título en común (Dice), más un
 * empujón si nombran el mismo fichero. Abiertos y cerrados: uno cerrado que se
 * repite es un arreglo que no aguantó, y eso también hay que verlo.
 */
export function parecidos(issues, { titulo, cuerpo = "" }, { minimo = 0.45, max = 5 } = {}) {
  const a = raices(titulo);
  const fa = ficherosNombrados(`${titulo}\n${cuerpo}`);
  if (!a.size) return [];
  return issues
    .map((i) => {
      const b = raices(i.title);
      const comunes = [...a].filter((x) => b.has(x)).length;
      const dice = b.size ? (2 * comunes) / (a.size + b.size) : 0;
      const fb = ficherosNombrados(`${i.title}\n${i.body ?? ""}`);
      const fichero = [...fa].some((f) => fb.has(f)) ? 0.15 : 0;
      return { number: i.number, title: i.title, state: i.state, parecido: Math.round((dice + fichero) * 100) / 100 };
    })
    .filter((x) => x.parecido >= minimo)
    .sort((x, y) => y.parecido - x.parecido)
    .slice(0, max);
}

/** Los issues abiertos que nombran un fichero, por su nombre. */
export function issuesQueNombran(issues, ruta) {
  const nombre = String(ruta ?? "").replace(/^.*[\\/]/, "").toLowerCase();
  if (!nombre || COMUNES.has(nombre)) return [];
  return issues.filter((i) => String(i.state ?? "OPEN").toUpperCase() === "OPEN" && ficherosNombrados(`${i.title}\n${i.body ?? ""}`).has(nombre));
}

/** Las líneas que el arranque enseña a cada sesión (vacío si no hay nada). */
export function avisoDeArranque(issues) {
  const r = resumen(issues);
  const n = (t) => r.porTipo[t] ?? 0;
  const lineas = [];
  const partes = [[n("decision"), "decisiones esperando a Pablo"], [n("encargo"), "encargos (mira si el tuyo ya lo tiene alguien)"], [n("fondo"), "problemas de fondo"]]
    .filter(([k]) => k).map(([k, que]) => `${k} ${que}`);
  if (partes.length) lineas.push(`Issues abiertos: ${partes.join("; ")}. Detalle: \`npm run issues\`.`);
  const top = r.fondos.filter((f) => f.abierto && f.casos).slice(0, 3);
  if (top.length) lineas.push(`Problemas de fondo que más se repiten: ${top.map((f) => `#${f.number} ${limpiarTexto(f.title.replace(/^\[[^\]]+\]\s*/, ""))} (${f.casos} casos)`).join("; ")}. Si lo que haces toca uno, arregla el fondo, no solo el caso.`);
  const sueltos = r.malClasificados.filter((m) => m.faltan.some((x) => x.startsWith("su problema de fondo"))).length;
  if (sueltos) lineas.push(`${sueltos} casos sin colgar de su problema de fondo: \`npm run issues\`.`);
  const viejos = r.malClasificados.filter((m) => m.faltan.some((x) => x.startsWith("reclasificar"))).length;
  if (viejos) lineas.push(`${viejos} issues con etiquetas que ya no existen, por reclasificar: \`npm run issues\`.`);
  return lineas;
}

// ── El formato de un encargo (#338) ──────────────────────────────────────────

/**
 * Los campos de la ficha de un encargo: un bloque de código `encargo` de líneas
 * `clave: valor` en el cuerpo, como la ficha del fondo. Es la referencia común de
 * las skills `causa-raiz` y `plan-de-arreglo` (y de las que vengan): ninguna la
 * copia, citan `docs/ops/ENCARGO.md`, que sale de aquí con `npm run flujo --
 * --escribir`; el formulario `3-encargo.yml` lleva la misma plantilla y
 * `scripts/encargo.test.js` vigila que los tres digan lo mismo.
 *
 * Lo que se puede deducir no es campo (cada dato en un solo sitio): el escalón
 * sale del `mecanismo` (ops/mecanismos.json) y «automático» es que ese escalón
 * sea de los que no necesitan que nadie se acuerde (ESCALONES_AUTOMATICOS).
 */
export const TIPOS_ACCION = {
  preventivo: "Impide que la clase vuelva a pasar",
  detectivo: "Avisa en cuanto vuelve a pasar",
  correctivo: "Arregla las instancias que ya hay (el barrido)",
};

/** Escalones de la escalera (ops/flujo.json) que se cumplen sin que nadie se acuerde. */
export const ESCALONES_AUTOMATICOS = ["bloqueo", "test_ci"];

/** Como mucho tantos encargos por fondo, y al menos uno preventivo y automático (FLUJO.md, P06.4). */
export const MAX_ENCARGOS_POR_FONDO = 3;

/** Los campos de la ficha del encargo, en orden. `obligatorio`: true, false o el texto de cuándo. */
export const CAMPOS_ENCARGO = [
  { clave: "fondo", vale: "`#n` del fondo del que cuelga", obligatorio: true },
  { clave: "tipo_accion", vale: Object.keys(TIPOS_ACCION).map((v) => `\`${v}\``).join(", "), obligatorio: true },
  { clave: "mecanismo", vale: "un `id` de `ops/mecanismos.json`; su escalón sale de ahí", obligatorio: true },
  { clave: "por_que_no_mas_alto", vale: "texto: por qué no se usa un mecanismo de un escalón más alto", obligatorio: "si el escalón no es el primero (bloqueo)" },
  { clave: "clase", vale: "texto: qué parte de la clase del fondo cubre", obligatorio: true },
  { clave: "depende_de", vale: "`#n, #m` o `ninguno`", obligatorio: true },
  { clave: "constructor", vale: "un agente de `.claude/agents/` o `sesión`", obligatorio: true },
  { clave: "juez", vale: "un agente juez de `.claude/agents/`, distinto del constructor", obligatorio: true },
  { clave: "verificacion", vale: "ruta del fichero que prueba la clase (un `*.test.js` si el escalón es test_ci)", obligatorio: true },
  { clave: "hecho_cuando", vale: "texto: lo que se ve cuando está hecho", obligatorio: true },
  { clave: "ficheros", vale: "rutas que toca, separadas por coma", obligatorio: false },
];

/** La plantilla del bloque, vacía: la del formulario y la de la referencia. */
export function plantillaEncargo() {
  return ["```encargo", ...CAMPOS_ENCARGO.map((c) => `${c.clave}:`), "```"].join("\n");
}

/** `docs/ops/ENCARGO.md` entero. Se genera; no se edita a mano. */
export function formatoEncargoMd() {
  const si = (o) => (o === true ? "sí" : o === false ? "no" : o);
  return [
    "# El formato de un encargo",
    "",
    "<!-- Generado desde scripts/lib/issues.mjs con `npm run flujo -- --escribir`. No se edita a mano: scripts/encargo.test.js lo compara. -->",
    "",
    "Referencia común de las skills de oficio (`causa-raiz`, `plan-de-arreglo`) para escribir un encargo (`tipo:encargo`) que cuelga de un fondo. El cuerpo lleva el bloque de abajo (el formulario de encargo lo trae) además del «Qué».",
    "",
    "| Clave | Vale | Obligatoria |",
    "|---|---|---|",
    ...CAMPOS_ENCARGO.map((c) => `| \`${c.clave}\` | ${c.vale} | ${si(c.obligatorio)} |`),
    "",
    "Tipos de acción:",
    "",
    ...Object.entries(TIPOS_ACCION).map(([k, v]) => `- \`${k}\`: ${v}.`),
    "",
    `**Automático** quiere decir que el escalón de su mecanismo es ${ESCALONES_AUTOMATICOS.map((e) => `\`${e}\``).join(" o ")}: se cumple sin que nadie se acuerde. Un fondo lleva como mucho ${MAX_ENCARGOS_POR_FONDO} encargos, y al menos uno es \`preventivo\` y automático.`,
    "",
    "Plantilla:",
    "",
    plantillaEncargo(),
    "",
  ].join("\n");
}
