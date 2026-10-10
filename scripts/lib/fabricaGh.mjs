/**
 * Lo que `npm run fabrica` pide a GitHub (#424, fondo #326), en dos consultas ligeras
 * en vez de la `CONSULTA` entera de `npm run issues`.
 *
 * Por qué: fabrica solo usa de cada issue el número, el estado y las etiquetas; y de
 * los fondos, además, el cuerpo (la ficha), las reaperturas y los hijos con sus
 * etiquetas. La consulta de `issues.mjs` pedía también comentarios, PR que cierran
 * y los hijos de todos los issues: 107 puntos por página (321 con 3 páginas, medido
 * el 10 oct 2026) y el informe diario del panel se quedaba sin cuota con varias
 * sesiones activas. GitHub cobra por lo que PUEDE devolver la consulta (los
 * `first:` pedidos), no por lo que devuelve: por eso los fondos se piden en
 * páginas de 10 y solo los hijos de los fondos.
 *
 * Medido el 10 oct 2026: todos los issues (262), 1 punto por página de 100; los fondos
 * (22), 5 puntos por página de 10. Total ~18 puntos frente a ~321.
 */
import { leerIssue } from "./issues.mjs";

const ETIQUETAS = "labels(first: 10) { nodes { name } }";

/** Número, estado y etiquetas de todos los issues. */
export const CONSULTA_TODOS = `query($cursor: String) {
  repository(owner: "pabloam89", name: "MenuPlan") {
    issues(first: 100, after: $cursor, states: [OPEN, CLOSED]) {
      pageInfo { hasNextPage endCursor }
      nodes { number state ${ETIQUETAS} }
    }
  }
}`;

/** Los fondos con ficha, reaperturas e hijos. Páginas de 10: el coste sale de los `first:` pedidos. */
export const CONSULTA_FONDOS = `query($cursor: String) {
  repository(owner: "pabloam89", name: "MenuPlan") {
    issues(first: 10, after: $cursor, states: [OPEN, CLOSED], labels: ["tipo:fondo"]) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number state body ${ETIQUETAS}
        reaperturas: timelineItems(itemTypes: [REOPENED_EVENT]) { totalCount }
        subIssues(first: 50) { totalCount nodes { number state ${ETIQUETAS} } }
      }
    }
  }
}`;

/**
 * Une las dos lecturas con la forma de `leerIssue()`: los hijos de cada fondo salen de
 * su `subIssues` y a cada hijo se le pone su padre, como hacía la consulta completa.
 */
export function unirNodos(todos, fondos) {
  const padreDe = new Map();
  for (const f of fondos) for (const h of f.subIssues?.nodes ?? []) padreDe.set(h.number, { number: f.number, state: f.state, labels: f.labels });
  const fondoPorNumero = new Map(fondos.map((f) => [f.number, f]));
  const numeros = new Set(todos.map((n) => n.number));
  // Un fondo que la primera lectura no vio (creado entre las dos) también cuenta.
  const nodos = [...todos, ...fondos.filter((f) => !numeros.has(f.number))];
  return nodos.map((n) => leerIssue({ ...n, ...(fondoPorNumero.get(n.number) ?? {}), parent: padreDe.get(n.number) ?? null }));
}

/** Aviso de los fondos con más hijos de los que caben en la página (no debería pasar: el mayor tiene 22 de 50). */
export function fondosTruncados(fondos) {
  return fondos.filter((f) => (f.subIssues?.totalCount ?? 0) > (f.subIssues?.nodes?.length ?? 0)).map((f) => f.number);
}

// ── Límite de GitHub ──────────────────────────────────────────────────────────

/** ¿Es un error de límite de peticiones (cuota o límite secundario)? */
export const esLimite = (e) => /rate limit|abuse|secondary/i.test(String(e?.stderr ?? e?.message ?? ""));

/** Segundos que pide esperar el error (`retry-after: n` o «wait n seconds»), o null. */
export function segundosDeEspera(e) {
  const m = /retry[- ]after:?\s*(\d{1,5})|wait\s+(\d{1,5})\s+seconds?/i.exec(String(e?.stderr ?? e?.message ?? ""));
  return m ? Number(m[1] ?? m[2]) : null;
}

export const ESPERA_BASE_S = 30;
export const ESPERA_MAX_S = 120;

/**
 * Pide con reintentos SOLO si el fallo es de límite: espera lo que diga el error (con
 * tope) o 30, 60 s… y a la tercera se rinde con el error original. `dormir(ms)` es
 * síncrono para poder probarlo. Un error que no es de límite se propaga a la primera.
 */
export function conEsperaDeLimite(pedir, { veces = 3, dormir = dormirSync, aviso = () => {} } = {}) {
  for (let i = 1; ; i++) {
    try {
      return pedir();
    } catch (e) {
      if (!esLimite(e) || i >= veces) throw e;
      const s = Math.min(segundosDeEspera(e) ?? ESPERA_BASE_S * i, ESPERA_MAX_S);
      aviso(`GitHub limita las peticiones; espero ${s} s (intento ${i} de ${veces})`);
      dormir(s * 1000);
    }
  }
}

function dormirSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
