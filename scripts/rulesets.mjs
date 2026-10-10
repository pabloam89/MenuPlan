#!/usr/bin/env node
/**
 * rulesets.mjs — los rulesets de `main` y `staging` frente a lo deseado (E4, #330;
 * fondo #326: dueño de código).
 *
 *   node scripts/rulesets.mjs             # solo LEE y enseña la diferencia
 *   node scripts/rulesets.mjs --escribir  # crea o actualiza (SOLO Pablo, con su credencial de administrador)
 *
 * Lo deseado (opción A de #330):
 * - main, dos rulesets: (a) PR y check `tests`, sin bypass para nadie; (b) regla
 *   `update` (restringir actualizaciones) con bypass solo para el rol Administrador,
 *   en modo `pull_request`: solo Pablo fusiona, por el botón del PR. Sin aprobación
 *   de dueño en main: no hace falta, fusiona quien tiene el bypass.
 * - staging: lo de hoy (`tests`, excepción de la deploy key) y, además, PR con la
 *   revisión de dueño de código y 0 aprobaciones: GitHub no deja condicionar una
 *   regla de ruleset por ruta; el filtro por ruta lo pone CODEOWNERS. Sin bypass para
 *   nadie salvo la deploy key (un bypass también saltaría `tests`).
 *
 * Falla cerrado: sin token, sin respuesta, con una respuesta rara o sin permiso de
 * administrador, no escribe nada. No imprime el token ni lo que GitHub devuelva sin
 * pasarlo por `sinSecretos`. El token es GH_TOKEN, GITHUB_TOKEN o `gh auth token`.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const API = "https://api.github.com";
export const REPO = "pabloam89/MenuPlan";
/** El check `tests` es de la app de GitHub Actions (integration_id 15368). */
export const CHECK_TESTS = { context: "tests", integration_id: 15368 };
export const NOMBRE_MAIN = "main: PR y tests";
export const NOMBRE_MAIN_SOLO = "main: solo Pablo fusiona";
export const NOMBRE_STAGING = "staging: tests obligatorios";
/** Rol Administrador del repo en la API de rulesets. */
const ROL_ADMIN = 5;
const ESPERA_MS = 15_000;

const checks = () => ({
  type: "required_status_checks",
  parameters: { strict_required_status_checks_policy: false, do_not_enforce_on_create: false, required_status_checks: [{ ...CHECK_TESTS }] },
});
const revision = (aprobaciones, dueno) => ({
  type: "pull_request",
  parameters: {
    required_approving_review_count: aprobaciones,
    dismiss_stale_reviews_on_push: true,
    require_code_owner_review: dueno,
    require_last_push_approval: false,
    required_review_thread_resolution: false,
  },
});

/** Los tres rulesets deseados. */
export function deseados() {
  const rama = (nombre, ref, rules, bypass) => ({
    name: nombre, target: "branch", enforcement: "active",
    conditions: { ref_name: { include: [`refs/heads/${ref}`], exclude: [] } },
    rules, bypass_actors: bypass,
  });
  return [
    rama(NOMBRE_MAIN, "main", [revision(0, false), checks()], []),
    // «update»: solo quien tiene bypass actualiza la rama; el rol Administrador, y solo por PR.
    // Sin comprobar a 10 oct 2026: el nombre exacto del parámetro (update_allows_fetch_and_merge).
    rama(NOMBRE_MAIN_SOLO, "main", [{ type: "update", parameters: { update_allows_fetch_and_merge: false } }],
      [{ actor_id: ROL_ADMIN, actor_type: "RepositoryRole", bypass_mode: "pull_request" }]),
    // La excepción de la deploy key (el cron de Mercadona empuja con ella) se mantiene tal cual.
    rama(NOMBRE_STAGING, "staging", [checks(), revision(0, true)], [{ actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }]),
  ];
}

const ordenar = (o) => (Array.isArray(o) ? o.map(ordenar) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, ordenar(o[k])])) : o);

/** Forma comparable: solo lo que fijamos (GitHub añade ids, fechas y parámetros por defecto). */
export function normalizar(rs, claves = null) {
  const reglas = (rs.rules ?? []).map((r) => {
    const p = r.parameters ?? {};
    const ref = claves?.get(r.type);
    const parametros = ref ? Object.fromEntries(ref.filter((k) => k in p).map((k) => [k, p[k]])) : p;
    return { type: r.type, parameters: parametros };
  }).sort((a, b) => a.type.localeCompare(b.type));
  const bypass = rs.bypass_actors === undefined ? "sin-ver"
    : rs.bypass_actors.map((b) => ({ actor_id: b.actor_id ?? null, actor_type: b.actor_type, bypass_mode: b.bypass_mode }))
      .sort((a, b) => `${a.actor_type}${a.actor_id}`.localeCompare(`${b.actor_type}${b.actor_id}`));
  return ordenar({
    name: rs.name, target: rs.target, enforcement: rs.enforcement,
    ref_name: { include: [...(rs.conditions?.ref_name?.include ?? [])].sort(), exclude: [...(rs.conditions?.ref_name?.exclude ?? [])].sort() },
    rules: reglas, bypass_actors: bypass,
  });
}

/** Qué claves de cada regla se comparan: las del deseado. */
const clavesDe = (d) => new Map(d.rules.map((r) => [r.type, Object.keys(r.parameters)]));

/** Lista de diferencias legibles entre el ruleset actual y el deseado ([] si cuadra). */
export function diferencias(actual, deseado) {
  if (!actual) return ["no existe"];
  const a = normalizar(actual, clavesDe(deseado));
  const d = normalizar(deseado);
  const fuera = [];
  for (const campo of ["name", "target", "enforcement"]) if (a[campo] !== d[campo]) fuera.push(`${campo}: ${a[campo]} -> ${d[campo]}`);
  if (JSON.stringify(a.ref_name) !== JSON.stringify(d.ref_name)) fuera.push(`ramas: ${JSON.stringify(a.ref_name.include)} -> ${JSON.stringify(d.ref_name.include)}`);
  const tipos = new Set([...a.rules.map((r) => r.type), ...d.rules.map((r) => r.type)]);
  for (const t of [...tipos].sort()) {
    const ra = a.rules.find((r) => r.type === t);
    const rd = d.rules.find((r) => r.type === t);
    if (!ra) fuera.push(`regla ${t}: falta`);
    else if (!rd) fuera.push(`regla ${t}: sobra`);
    else if (JSON.stringify(ra.parameters) !== JSON.stringify(rd.parameters)) fuera.push(`regla ${t}: ${JSON.stringify(ra.parameters)} -> ${JSON.stringify(rd.parameters)}`);
  }
  if (a.bypass_actors === "sin-ver") fuera.push("bypass: sin comprobar (el token no ve los actores; hace falta permiso de administrador)");
  else if (JSON.stringify(a.bypass_actors) !== JSON.stringify(d.bypass_actors)) fuera.push(`bypass: ${JSON.stringify(a.bypass_actors)} -> ${JSON.stringify(d.bypass_actors)}`);
  return fuera;
}

/** Quita de un texto cualquier cosa con forma de token de GitHub o JWT. */
export function sinSecretos(texto, secretos = []) {
  let t = String(texto ?? "");
  for (const s of secretos) if (s && t.includes(s)) t = t.split(s).join("[oculto]");
  return t.replace(/(?:ghs|ghp|gho|ghu|ghr|github_pat)_\w+/g, "[oculto]").replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[oculto]");
}

export class ErrorRulesets extends Error {}

export function tokenDe(env, ejecutarGh = () => execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: ESPERA_MS, stdio: ["ignore", "pipe", "ignore"] })) {
  const t = (env.GH_TOKEN || env.GITHUB_TOKEN || "").trim();
  if (t) return t;
  try { return String(ejecutarGh()).trim(); } catch { return ""; }
}

async function llamar(fetchFn, token, metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetchFn(`${API}/repos/${REPO}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "menuplan-rulesets", ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch (e) {
    throw new ErrorRulesets(`sin respuesta de GitHub: ${sinSecretos(e?.cause?.code || e?.name || "error de red", [token])}`);
  }
  let datos = null;
  try { datos = await r.json(); } catch { datos = null; /* a propósito: un cuerpo que no es JSON no se enseña; el código HTTP basta */ }
  if (!r.ok) {
    const errores = Array.isArray(datos?.errors) ? ` errores: ${sinSecretos(JSON.stringify(datos.errors), [token]).slice(0, 300)}` : "";
    throw new ErrorRulesets(`GitHub respondió ${r.status} en ${metodo} ${ruta || "/"}${datos?.message ? ` («${sinSecretos(datos.message, [token]).slice(0, 120)}»)` : ""}${errores}`);
  }
  return datos;
}

/** Lee todos los rulesets del repo con su detalle. */
export async function leerRulesets(fetchFn, token) {
  const lista = await llamar(fetchFn, token, "GET", "/rulesets?includes_parents=false&per_page=100");
  if (!Array.isArray(lista)) throw new ErrorRulesets("la lista de rulesets no es una lista: no sigo");
  const completos = [];
  for (const r of lista) {
    if (!Number.isInteger(r?.id)) throw new ErrorRulesets("un ruleset sin id: no sigo");
    completos.push(await llamar(fetchFn, token, "GET", `/rulesets/${r.id}`));
  }
  return completos;
}

/** El ruleset actual con el mismo nombre que uno deseado. Solo por nombre: nunca se pisa uno ajeno. */
export function emparejar(actuales, d) {
  return actuales.find((a) => a.name === d.name) ?? null;
}

/** Rulesets de otro nombre que apuntan a la misma rama: se avisa, no se tocan. */
export function ajenosEnLaRama(actuales, deseadosTodos) {
  const nuestros = new Set(deseadosTodos.map((d) => d.name));
  const refs = new Set(deseadosTodos.flatMap((d) => d.conditions.ref_name.include));
  return actuales.filter((a) => !nuestros.has(a.name) && (a.conditions?.ref_name?.include ?? []).some((x) => refs.has(x)));
}

export async function ejecutar({ argv = [], env = {}, fetchFn = fetch, salida = (l) => console.log(l), ejecutarGh } = {}) {
  const desconocidos = argv.filter((a) => !["--escribir"].includes(a));
  if (desconocidos.length) { salida(`rulesets: argumento desconocido (${desconocidos.join(" ")}). Vale --escribir.`); return 2; }
  const escribir = argv.includes("--escribir");
  const token = tokenDe(env, ejecutarGh);
  if (!token) { salida("rulesets: sin token (GH_TOKEN, GITHUB_TOKEN o `gh auth login`). No hago nada."); return 2; }
  const quiero = deseados();
  try {
    if (escribir) {
      const repo = await llamar(fetchFn, token, "GET", "");
      if (repo?.permissions?.admin !== true) {
        salida("rulesets: esta credencial no es de administrador del repo; no escribo nada (--escribir es de Pablo, desde su terminal).");
        return 2;
      }
    }
    const actuales = await leerRulesets(fetchFn, token);
    for (const a of ajenosEnLaRama(actuales, quiero)) salida(`rulesets aviso: «${a.name}» (id ${a.id}) también apunta a una de estas ramas; no lo toco`);
    let cuadra = true;
    const pendientes = [];
    for (const d of quiero) {
      const a = emparejar(actuales, d);
      const dif = diferencias(a, d);
      cuadra &&= dif.length === 0;
      salida(`rulesets ${d.name}: ${dif.length ? "difiere" : "ok"}${a ? ` (id ${a.id})` : ""}`);
      for (const l of dif) salida(`  - ${l}`);
      if (dif.length) pendientes.push({ d, a });
    }
    if (!escribir) {
      if (!cuadra) salida("rulesets: para aplicarlo, Pablo lanza `node scripts/rulesets.mjs --escribir` desde su terminal.");
      return cuadra ? 0 : 1;
    }
    let escritos = 0;
    try {
      for (const { d, a } of pendientes) {
        const r = a ? await llamar(fetchFn, token, "PUT", `/rulesets/${a.id}`, d) : await llamar(fetchFn, token, "POST", "/rulesets", d);
        escritos++;
        salida(`rulesets ${d.name}: ${a ? "actualizado" : "creado"} (id ${r?.id ?? "?"})`);
      }
    } catch (e) {
      if (escritos > 0) {
        salida(`rulesets: se escribieron ${escritos} de ${pendientes.length} y el siguiente falló; estado ahora:`);
        try {
          const ahora = await leerRulesets(fetchFn, token);
          for (const d of quiero) {
            const dif = diferencias(emparejar(ahora, d), d);
            salida(`rulesets ${d.name}: ${dif.length ? "difiere" : "ok"}`);
            for (const l of dif) salida(`  - ${l}`);
          }
        } catch { salida("rulesets: tampoco he podido releer el estado."); }
      }
      throw e;
    }
    const despues = await leerRulesets(fetchFn, token);
    let ok = true;
    for (const d of quiero) {
      const dif = diferencias(emparejar(despues, d), d);
      if (dif.length) { ok = false; salida(`rulesets ${d.name}: tras escribir sigue difiriendo: ${dif.join("; ")}`); }
    }
    salida(ok ? "rulesets: comprobado tras escribir, todo igual que lo deseado." : "rulesets: FALLA la comprobación posterior.");
    return ok ? 0 : 1;
  } catch (e) {
    salida(`rulesets: ${e instanceof ErrorRulesets ? e.message : `error inesperado (${sinSecretos(e?.name, [token])})`}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await ejecutar({ argv: process.argv.slice(2), env: process.env });
}
