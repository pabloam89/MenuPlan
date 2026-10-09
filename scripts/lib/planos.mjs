/**
 * Los planos se miden con comprobaciones, no con opiniones (#248).
 *
 * `ops/planos.json` dice, para cada plano y cada nivel (1-4), qué criterios
 * tienen que cumplirse. Aquí se evalúa cada criterio y se calcula el nivel:
 * el más alto con todos sus criterios cumplidos y los de los niveles de
 * debajo. Sin dependencias: lo lanza el workflow semanal sin `npm ci`.
 *
 * Cada criterio sale en uno de tres estados (vocabulario cerrado):
 * - `cumple`: comprobado y bien.
 * - `no_cumple`: comprobado y mal.
 * - `sin_comprobar`: hacía falta red (GitHub) o permisos que no hay. Nunca
 *   cuenta como cumplido: por eso hay dos cifras por plano, el `nivel` (solo
 *   con lo comprobado) y el `techo` (si todo lo no comprobado saliera bien).
 *   La medición guardada tiene que caer entre las dos; si no, algo cambió.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { RUTA_BASE as BASE_NORMAS, medirFondo, totalBase } from "./normas.mjs";
import { CONSULTA, leerIssue } from "./issues.mjs";

/** Tipos de criterio. La definición larga vive en `vocabularios.tipos_criterio` de ops/planos.json (un test las compara). */
export const TIPOS_CRITERIO = [
  "fichero_existe",
  "fichero_contiene",
  "test_existe",
  "workflow_activo",
  "regla_github",
  "cifra_umbral",
  "a_juicio",
  "por_definir",
];

/** Campos obligatorios de cada tipo, además de `tipo` y `que` (la frase en llano). */
export const CAMPOS_POR_TIPO = {
  fichero_existe: ["ruta"],
  fichero_contiene: ["ruta", "patron"],
  test_existe: ["ruta"],
  workflow_activo: ["fichero", "disparador"],
  regla_github: ["regla"],
  cifra_umbral: ["medidor", "operador", "umbral"],
  a_juicio: ["quien", "fecha", "cumple", "nota"],
  por_definir: [],
};

/** Estados de un criterio. */
export const ESTADOS_CRITERIO = ["cumple", "no_cumple", "sin_comprobar"];

/** Reglas de GitHub que el script sabe comprobar, con los parámetros que piden. */
export const REGLAS_GITHUB = {
  check_obligatorio: ["rama", "check"],
  sin_push_forzado: ["rama"],
  admins_incluidos: ["rama"],
  secret_scanning: [],
  push_protection: [],
  dependabot_alertas: [],
  dependabot_seguridad: [],
};

/**
 * Quién puede saltarse un ruleset sin que el check deje de contar como
 * obligatorio. Solo la deploy key del cron de Mercadona (PR #240), y es deuda
 * apuntada en #263: el 9 oct dejó staging en rojo. Añadir otro aquí es abrir
 * una puerta: decisión de Pablo.
 */
export const BYPASS_PERMITIDOS = ["DeployKey"];

/** Disparadores de un workflow que se pueden exigir. */
export const DISPARADORES = ["pull_request", "push", "schedule", "workflow_dispatch"];

/** Operadores de `cifra_umbral`. */
export const OPERADORES = { "<=": (a, b) => a <= b, ">=": (a, b) => a >= b, "==": (a, b) => a === b };

/** Quién puede firmar un juicio: un agente de .claude/agents/ o una persona. */
export const PERSONAS = ["pablo", "alvaro", "sesion"];

/**
 * Cifras que el script sabe medir sin red. Cada una devuelve un número.
 * Una cifra nueva se añade aquí, con su test en ops/planos.test.js.
 */
export const MEDIDORES = {
  /** Errores de lint viejos que se toleran (lint-base.json): el trinquete solo baja. */
  errores_lint_base: (raiz) => {
    const base = JSON.parse(readFileSync(join(raiz, "lint-base.json"), "utf8"));
    return Object.values(base).reduce((a, n) => a + Number(n), 0);
  },
  /** Frases normativas que no citan ninguna norma (ops/normas-base.json, #296): el trinquete solo baja. */
  frases_normativas_base: (raiz) => totalBase(JSON.parse(readFileSync(join(raiz, BASE_NORMAS), "utf8"))),
  // Las del fondo (#185, #296) necesitan los issues de GitHub: sin red, null y
  // el criterio sale «sin comprobar». Las define CIFRAS_FONDO de normas.mjs.
  casos_sin_fondo: (raiz, ctx) => cifraDeFondo("casos_sin_fondo", ctx),
  fondos_sin_encargo: (raiz, ctx) => cifraDeFondo("fondos_sin_encargo", ctx),
  fondos_cerrados_sin_test: (raiz, ctx) => cifraDeFondo("fondos_cerrados_sin_test", ctx),
};

/** Una cifra del fondo, o null si no hay issues que leer (sin red). La lectura se hace una vez por medición. */
function cifraDeFondo(cifra, ctx) {
  if (!ctx?.leerIssues) return null;
  ctx.fondo ??= medirFondo(ctx.leerIssues());
  return ctx.fondo[cifra];
}

/** Todos los issues con padre e hijos, por GraphQL (la consulta de scripts/lib/issues.mjs). */
export function leerIssuesGh() {
  const out = [];
  let cursor = null;
  do {
    const args = ["api", "graphql", "-f", `query=${CONSULTA}`];
    if (cursor) args.push("-f", `cursor=${cursor}`);
    const pag = JSON.parse(execFileSync("gh", args, { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] })).data.repository.issues;
    out.push(...pag.nodes.map(leerIssue));
    cursor = pag.pageInfo.hasNextPage ? pag.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

/** «2026-10-09» en Madrid (la hora sale de Node, nunca de `date`: #210). */
export function hoyMadrid(fecha = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(fecha);
}

/** Días enteros entre dos fechas «AAAA-MM-DD». */
export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

const leerSiExiste = (raiz, ruta) => {
  const p = join(raiz, ruta);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

// ── GitHub ────────────────────────────────────────────────────────────────

/**
 * Cliente de `gh api` con caché por ruta. Devuelve { ok, status, json }.
 * Sin `gh`, sin red o sin sesión, `ok: false` y `status: null`: el criterio
 * queda sin comprobar, nunca cumplido.
 */
export function clienteGh() {
  const cache = new Map();
  return (ruta) => {
    if (cache.has(ruta)) return cache.get(ruta);
    let r;
    try {
      const salida = execFileSync("gh", ["api", ruta], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
      r = { ok: true, status: 200, json: salida.trim() ? JSON.parse(salida) : null };
    } catch (e) {
      const texto = `${e.stderr ?? ""}${e.stdout ?? ""}`;
      const m = texto.match(/HTTP (\d{3})/);
      r = { ok: false, status: m ? Number(m[1]) : null, json: null };
    }
    cache.set(ruta, r);
    return r;
  };
}

/**
 * Lee lo que hace falta de GitHub para una regla. `gh` es una función
 * (ruta) => { ok, status, json }; en los tests, una de mentira.
 *
 * Un 403 o un 404 en lo que solo ve un administrador no es «no cumple»: con
 * el token de Actions esas rutas no se pueden leer. Solo se da por «no
 * cumple» si quien pregunta es administrador del repo.
 */
export function evaluarReglaGithub(c, { repo, gh }) {
  const info = gh(`repos/${repo}`);
  if (!info.ok) return { estado: "sin_comprobar", detalle: "no se pudo leer el repo" };
  const esAdmin = info.json?.permissions?.admin === true;
  const sinPermiso = (r) => !r.ok && !(esAdmin && r.status === 404);

  const proteccion = (rama) => gh(`repos/${repo}/branches/${rama}/protection`);
  const reglas = (rama) => gh(`repos/${repo}/rules/branches/${rama}`);
  const bypassDe = (id) => {
    const rs = id == null ? { ok: false } : gh(`repos/${repo}/rulesets/${id}`);
    const lista = rs.ok ? rs.json?.bypass_actors : undefined;
    if (!Array.isArray(lista)) return { estado: "sin_comprobar", detalle: "no se pudieron leer sus bypass_actors" };
    const fuera = lista.filter((a) => !BYPASS_PERMITIDOS.includes(a.actor_type));
    if (fuera.length) return { estado: "no_cumple", detalle: `hay ${fuera.length} actor(es) con bypass fuera de la lista (el detalle, con npm run planos -- --red en local)` };
    return { estado: "cumple", detalle: lista.length ? `bypass solo de ${lista.map((a) => a.actor_type).join(", ")}` : "sin bypass" };
  };
  const seguridad = (campo) => {
    const s = info.json?.security_and_analysis;
    if (!s) return { estado: "sin_comprobar", detalle: "security_and_analysis solo lo ve un administrador" };
    const v = s[campo]?.status;
    return { estado: v === "enabled" ? "cumple" : "no_cumple", detalle: `${campo}: ${v ?? "sin dato"}` };
  };

  switch (c.regla) {
    case "check_obligatorio": {
      const r = reglas(c.rama);
      const ids = r.ok ? [...new Set((r.json ?? []).filter((x) => x.type === "required_status_checks"
        && (x.parameters?.required_status_checks ?? []).some((k) => k.context === c.check)).map((x) => x.ruleset_id))] : [];
      // Un check que alguien se puede saltar no es obligatorio: se miran los bypass de cada ruleset.
      const rulesets = ids.map((id) => ({ id, bypass: bypassDe(id) }));
      const limpio = rulesets.find((x) => x.bypass.estado === "cumple");
      if (limpio) return { estado: "cumple", detalle: `ruleset ${limpio.id} de ${c.rama} exige ${c.check}; ${limpio.bypass.detalle}` };
      const p = proteccion(c.rama);
      const enClasica = p.ok && (p.json?.required_status_checks?.contexts ?? []).includes(c.check);
      if (enClasica) return { estado: "cumple", detalle: `protección de ${c.rama} exige ${c.check}` };
      const dudoso = rulesets.find((x) => x.bypass.estado === "sin_comprobar");
      if (dudoso) return { estado: "sin_comprobar", detalle: `ruleset ${dudoso.id}: ${dudoso.bypass.detalle}` };
      if (!r.ok || sinPermiso(p)) return { estado: "sin_comprobar", detalle: "no se pudieron leer las reglas o la protección" };
      const saltable = rulesets[0];
      if (saltable) return { estado: "no_cumple", detalle: `ruleset ${saltable.id}: ${saltable.bypass.detalle}` };
      return { estado: "no_cumple", detalle: `${c.rama} no exige ${c.check}` };
    }
    case "sin_push_forzado":
    case "admins_incluidos": {
      if (c.regla === "sin_push_forzado") {
        const r = reglas(c.rama);
        if (r.ok && (r.json ?? []).some((x) => x.type === "non_fast_forward")) return { estado: "cumple", detalle: "ruleset non_fast_forward" };
      }
      const p = proteccion(c.rama);
      if (sinPermiso(p)) return { estado: "sin_comprobar", detalle: "la protección de rama solo la lee un administrador" };
      if (!p.ok) return { estado: "no_cumple", detalle: `${c.rama} sin protección` };
      const bien = c.regla === "sin_push_forzado" ? p.json?.allow_force_pushes?.enabled === false : p.json?.enforce_admins?.enabled === true;
      return { estado: bien ? "cumple" : "no_cumple", detalle: `${c.regla} en ${c.rama}` };
    }
    case "secret_scanning":
      return seguridad("secret_scanning");
    case "push_protection":
      return seguridad("secret_scanning_push_protection");
    case "dependabot_seguridad":
      return seguridad("dependabot_security_updates");
    case "dependabot_alertas": {
      const r = gh(`repos/${repo}/vulnerability-alerts`);
      if (r.ok) return { estado: "cumple", detalle: "alertas de Dependabot activas" };
      if (sinPermiso(r)) return { estado: "sin_comprobar", detalle: "solo lo ve un administrador" };
      return { estado: "no_cumple", detalle: "alertas de Dependabot apagadas" };
    }
    default:
      return { estado: "no_cumple", detalle: `regla desconocida: ${c.regla}` };
  }
}

// ── Un criterio ───────────────────────────────────────────────────────────

/**
 * Evalúa un criterio. `ctx`: { raiz, hoy, caducidad, repo, gh } (gh = null
 * sin red). Devuelve { estado, detalle, caducado? }.
 */
export function evaluarCriterio(c, ctx) {
  const { raiz } = ctx;
  switch (c.tipo) {
    case "fichero_existe":
      return existsSync(join(raiz, c.ruta)) ? { estado: "cumple", detalle: c.ruta } : { estado: "no_cumple", detalle: `no existe ${c.ruta}` };
    case "fichero_contiene":
    case "test_existe": {
      const texto = leerSiExiste(raiz, c.ruta);
      if (texto === null) return { estado: "no_cumple", detalle: `no existe ${c.ruta}` };
      if (c.patron && !new RegExp(c.patron, "m").test(texto)) return { estado: "no_cumple", detalle: `${c.ruta} no dice /${c.patron}/` };
      return { estado: "cumple", detalle: c.patron ? `${c.ruta} ~ /${c.patron}/` : c.ruta };
    }
    case "workflow_activo": {
      const ruta = `.github/workflows/${c.fichero}`;
      const texto = leerSiExiste(raiz, ruta);
      if (texto === null) return { estado: "no_cumple", detalle: `no existe ${ruta}` };
      const on = texto.split(/^jobs:/m)[0];
      if (!new RegExp(`^\\s+${c.disparador}:`, "m").test(on)) return { estado: "no_cumple", detalle: `${c.fichero} no se dispara con ${c.disparador}` };
      if (!ctx.gh) return { estado: "sin_comprobar", detalle: `${c.fichero} existe; activo en GitHub, sin red` };
      const r = ctx.gh(`repos/${ctx.repo}/actions/workflows/${c.fichero}`);
      if (!r.ok) return { estado: "sin_comprobar", detalle: `no se pudo leer ${c.fichero} en GitHub` };
      return { estado: r.json?.state === "active" ? "cumple" : "no_cumple", detalle: `${c.fichero}: ${r.json?.state}` };
    }
    case "regla_github":
      if (!ctx.gh) return { estado: "sin_comprobar", detalle: `${c.regla}: necesita red` };
      return evaluarReglaGithub(c, ctx);
    case "cifra_umbral": {
      const medir = MEDIDORES[c.medidor];
      if (!medir) return { estado: "no_cumple", detalle: `medidor desconocido: ${c.medidor}` };
      let valor;
      try {
        valor = medir(raiz, ctx);
        if (valor === null) return { estado: "sin_comprobar", detalle: `${c.medidor}: necesita red` };
      } catch (e) {
        console.warn(`[planos] ${c.medidor}: no se pudo medir: ${e.message}`);
        return { estado: "no_cumple", detalle: `${c.medidor}: no se pudo medir (${e.message})` };
      }
      const bien = OPERADORES[c.operador]?.(valor, c.umbral) ?? false;
      return { estado: bien ? "cumple" : "no_cumple", detalle: `${c.medidor} = ${valor} (debe ser ${c.operador} ${c.umbral})`, valor };
    }
    case "a_juicio": {
      const dias = diasEntre(c.fecha, ctx.hoy);
      const caducado = dias > ctx.caducidad;
      // Un «sí» caducado deja de contar: sin comprobar hasta que alguien lo vuelva a juzgar.
      const estado = !c.cumple ? "no_cumple" : caducado ? "sin_comprobar" : "cumple";
      return { estado, detalle: `${c.quien}, ${c.fecha} (hace ${dias} días${caducado ? ", caducado" : ""})`, caducado };
    }
    case "por_definir":
      return { estado: "no_cumple", detalle: `por construir${c.issue ? ` (#${c.issue})` : ""}` };
    default:
      return { estado: "no_cumple", detalle: `tipo desconocido: ${c.tipo}` };
  }
}

// ── Un plano y el conjunto ────────────────────────────────────────────────

/** Niveles con criterios, de 1 a 4. */
export const NIVELES = [1, 2, 3, 4];

/**
 * El nivel de un plano a partir de los estados de sus criterios por nivel:
 * nivel = el más alto con todo cumplido (y lo de debajo); techo = igual,
 * contando `sin_comprobar` como si cumpliera.
 */
export function nivelDe(estadosPorNivel) {
  let nivel = 0;
  let techo = 0;
  let seguidoNivel = true;
  let seguidoTecho = true;
  for (const n of NIVELES) {
    const estados = estadosPorNivel[n] ?? [];
    seguidoNivel = seguidoNivel && estados.length > 0 && estados.every((e) => e === "cumple");
    seguidoTecho = seguidoTecho && estados.length > 0 && estados.every((e) => e !== "no_cumple");
    if (seguidoNivel) nivel = n;
    if (seguidoTecho) techo = n;
  }
  return { nivel, techo };
}

/**
 * Mide todos los planos. Devuelve un objeto que es la salida de `--json`:
 * { fecha, red, planos: [{ id, nombre, nivel, techo, guardado, cuadra,
 *   criterios: [{ nivel, tipo, que, estado, detalle, caducado }] }],
 *   desajustes, caducados }.
 */
export function medir(datos, { raiz, gh = null, hoy = hoyMadrid(), leerIssues = gh ? leerIssuesGh : null }) {
  const ctx = { raiz, gh, hoy, repo: datos.repo, caducidad: datos.caducidad_juicio_dias, leerIssues };
  const planos = datos.planos.map((p) => {
    const criterios = [];
    const estadosPorNivel = {};
    for (const n of NIVELES) {
      estadosPorNivel[n] = [];
      for (const c of p.niveles[String(n)] ?? []) {
        const r = evaluarCriterio(c, ctx);
        estadosPorNivel[n].push(r.estado);
        criterios.push({ nivel: n, tipo: c.tipo, que: c.que, ...r });
      }
    }
    const { nivel, techo } = nivelDe(estadosPorNivel);
    const guardado = datos.medicion.niveles[String(p.id)];
    return { id: p.id, nombre: p.nombre, nivel, techo, guardado, lanzar: p.lanzar, escalar: p.escalar, cuadra: nivel <= guardado && guardado <= techo, criterios };
  });
  const desajustes = planos.filter((p) => !p.cuadra).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    guardado: p.guardado,
    nivel: p.nivel,
    techo: p.techo,
    sentido: p.techo < p.guardado ? "baja" : "sube",
  }));
  const caducados = planos.flatMap((p) => p.criterios.filter((c) => c.caducado).map((c) => ({ id: p.id, nombre: p.nombre, que: c.que, detalle: c.detalle })));
  return { fecha: hoy, red: Boolean(gh), planos, desajustes, caducados };
}

/** Lo que falta para el siguiente nivel de un plano medido: los criterios de nivel+1 que no cumplen. */
export function faltaParaSiguiente(p) {
  return p.criterios.filter((c) => c.nivel === p.nivel + 1 && c.estado !== "cumple");
}

// ── PLANOS.md ─────────────────────────────────────────────────────────────

export const MARCA_INICIO = "<!-- planos:tabla:inicio (la genera `npm run planos -- --escribir` desde ops/planos.json; no se edita a mano) -->";
export const MARCA_FIN = "<!-- planos:tabla:fin -->";

/** La tabla de PLANOS.md, generada desde ops/planos.json (la medición guardada). */
export function generarTabla(datos) {
  const filas = [
    `Medido el ${datos.medicion.fecha} por \`${datos.medicion.por}\`${datos.medicion.red ? ", con GitHub" : ", sin red"}.`,
    "",
    "| # | Plano | Pregunta | Hoy | Lanzar | Escalar | Agentes |",
    "|---|---|---|---|---|---|---|",
    ...datos.planos.map((p) => `| ${p.id} | ${p.nombre} | ${p.pregunta} | ${datos.medicion.niveles[String(p.id)]} | ${p.lanzar} | ${p.escalar} | ${p.agentes} |`),
  ];
  return filas.join("\n");
}

/** Sustituye el bloque entre marcas. Si no están, error: la tabla tiene que tener su sitio. */
export function sustituirTabla(markdown, tabla) {
  const i = markdown.indexOf(MARCA_INICIO);
  const f = markdown.indexOf(MARCA_FIN);
  if (i < 0 || f < i) throw new Error("PLANOS.md no tiene las marcas de la tabla");
  return `${markdown.slice(0, i + MARCA_INICIO.length)}\n${tabla}\n${markdown.slice(f)}`;
}

/** La tabla que hay hoy en PLANOS.md, entre las marcas. */
export function tablaActual(markdown) {
  const i = markdown.indexOf(MARCA_INICIO);
  const f = markdown.indexOf(MARCA_FIN);
  if (i < 0 || f < i) return null;
  return markdown.slice(i + MARCA_INICIO.length, f).trim();
}

/** El cuerpo del issue semanal cuando algo no cuadra; null si todo cuadra. */
export function cuerpoIssue(m) {
  if (!m.desajustes.length && !m.caducados.length) return null;
  const l = [`Medición del ${m.fecha} (\`npm run planos -- --red\`, workflow \`planos-semanal.yml\`).`, ""];
  if (m.desajustes.length) {
    l.push("## Niveles que no cuadran con la medición guardada", "", "| # | Plano | Guardado | Medido (nivel–techo) | Sentido |", "|---|---|---|---|---|");
    for (const d of m.desajustes) l.push(`| ${d.id} | ${d.nombre} | ${d.guardado} | ${d.nivel}–${d.techo} | ${d.sentido} |`);
    l.push("");
    for (const d of m.desajustes) {
      const p = m.planos.find((x) => x.id === d.id);
      const malos = p.criterios.filter((c) => c.nivel <= Math.max(d.guardado, d.nivel + 1) && c.estado !== "cumple");
      l.push(`**${d.id} · ${d.nombre}:** ${malos.map((c) => `${c.que} (${c.estado}: ${c.detalle})`).join("; ") || "todo cumple hasta el nivel guardado"}`);
    }
    l.push("");
  }
  if (m.caducados.length) {
    l.push("## Juicios caducados (hay que volver a mirarlos)", "");
    for (const c of m.caducados) l.push(`- Plano ${c.id} · ${c.nombre}: ${c.que} (${c.detalle})`);
    l.push("");
  }
  l.push("Qué hacer: si el cambio es real, `npm run planos -- --red --escribir` en una rama y PR (actualiza `ops/planos.json` y la tabla); si es un fallo, se arregla lo que dejó de cumplirse. Un juicio se renueva cambiando su `fecha` y `quien` en `ops/planos.json`.");
  return l.join("\n");
}
