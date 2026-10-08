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
  return no;
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
 * causa, dónde quedó el arreglo y cuántos días tardaron en cerrarse.
 */
export function resumen(issues) {
  const abiertos = issues.filter((i) => String(i.state).toUpperCase() === "OPEN");
  const lecciones = issues.filter((i) => porGrupo((i.labels ?? []).map((l) => l.name ?? l)).tipo.has("leccion"));
  const porTipo = {};
  for (const i of abiertos) for (const t of porGrupo((i.labels ?? []).map((l) => l.name ?? l)).tipo) porTipo[t] = (porTipo[t] ?? 0) + 1;
  const causas = {};
  for (const i of lecciones) {
    const g = porGrupo((i.labels ?? []).map((l) => l.name ?? l));
    for (const c of g.causa.size ? g.causa : ["(sin causa)"]) {
      const fila = (causas[c] ??= { total: 0, abiertas: 0, diasCierre: [], arreglos: {} });
      fila.total++;
      // Por el estado, no por closedAt: uno reabierto puede conservarlo.
      if (String(i.state).toUpperCase() === "CLOSED" && i.closedAt) {
        fila.diasCierre.push(dias(i.createdAt, i.closedAt));
        for (const a of g.arreglo) fila.arreglos[a] = (fila.arreglos[a] ?? 0) + 1;
      } else fila.abiertas++;
    }
  }
  for (const f of Object.values(causas)) f.medianaDias = mediana(f.diasCierre);
  return {
    porTipo,
    causas,
    malClasificados: issues.map((i) => ({ number: i.number, title: i.title, faltan: faltas(i) })).filter((x) => x.faltan.length),
  };
}
