/**
 * La medición por norma (#621, fondo #618; principio `no-number-without-question`): cada control que salta
 * deja una línea `campo: valor` con el id de la norma y lo que pasó, y un lector las cuenta por norma.
 *
 *     norma: <id> resultado: <ok|warning|fail|exempt|declared|unchecked> pr: <n|-> detalle: <texto|->
 *
 * UNA sola sintaxis para el mismo hecho: esta línea sustituye a la `avisos-pr: regla=… resultado=…` de #576
 * (la regla c1/c8/c12 se deduce de la norma, NORMA_DE_REGLA de scripts/lib/excepciones.mjs) y es la misma que
 * deja «Fondos del PR». El id de la norma se llama `norma` aquí y en los eventos de la guardia.
 *
 * Quién la deja: los avisos del CI (scripts/avisos-pr.mjs) y «Fondos del PR» (scripts/fondos-pr.mjs), en el
 * log del run; la guardia ya anota cada bloqueo, permiso pedido y aviso con la `norma` que lo hace cumplir en el
 * registro local de eventos (.claude/hooks/eventos.mjs): cada uno es un `warning` (hasta #621 el campo se
 * llamaba `codigo`: el lector acepta los dos). La guardia no anota los `ok` (miraría cada orden): de sus normas
 * solo se sabe cuántas veces saltaron. Ninguna línea lleva datos de familias, comandos ni rutas.
 *
 * LA UNIDAD ES EL RUN DE UN PR, no el PR: un PR con 5 pushes deja 5 series de líneas. Para que no inflen las
 * cifras, el lector cuenta una vez por `pr` + `norma` + `resultado` (las líneas sin `pr`, como las de la guardia,
 * son eventos y cuentan todas). Si el resultado cambia entre pushes (primero `warning`, luego `ok`) cuentan los dos:
 * es lo que le pasó a ese PR.
 *
 * Qué cuenta `medir`: por norma, cuántas líneas de cada resultado, y de ahí:
 *   - nunca saltan: se comprobaron (ok > 0) y jamás saltaron (`warning`/`fail`) ni se exceptuaron (`exempt`);
 *   - sin dato: tienen quien las haga cumplir y aún no han dejado ninguna línea que cuente;
 *   - exceptuadas siempre: de las veces que saltaron, todas se dejaron pasar con una excepción (`exempt` desde
 *     MIN_EXCEPTUADAS veces y ningún `warning` ni `fail`).
 * `declared` (una excepción válida de una norma que ningún control del CI consulta) NO cuenta para «exceptuadas
 * siempre»: nadie midió que se incumpliera. `unchecked` (no se pudo mirar) tampoco cuenta nada.
 *
 * Puro: los textos entran por argumento. Lo vigila ops/precedencia.test.js.
 */
export const RESULTADOS_NORMA = {
  ok: "el control miró y la norma se cumplía",
  warning: "el control miró y la norma no se cumplía; avisó sin bloquear (un aviso del CI, un aviso o un bloqueo de la guardia)",
  fail: "el control miró y la norma no se cumplía; bloqueó (un check del CI en rojo)",
  exempt: "se incumplía y una excepción válida del PR lo dejó pasar",
  declared: "el PR declara una excepción válida de una norma que ningún control del CI consulta: no se midió ningún incumplimiento",
  unchecked: "no se pudo mirar (sin diff, sin API, un fallo del script): no cuenta",
};
/** Los que cuentan como «saltó». */
export const QUE_SALTAN = ["warning", "fail"];
/** Desde cuántas excepciones y con cero saltos una norma cuenta como «exceptuada siempre». */
export const MIN_EXCEPTUADAS = 3;
/** Los eventos de la guardia que son un control que saltó (con su `norma`). */
export const EVENTOS_QUE_SALTAN = ["bloqueo_guardia", "permiso_pedido", "aviso_guardia"];

const ID_NORMA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** La línea de una norma; falla si el id, el resultado o el PR no son del vocabulario. */
export function lineaDeNorma(norma, resultado, { pr = null, detalle = null } = {}) {
  if (!ID_NORMA.test(String(norma))) throw new Error(`medición: «${norma}» no es el id de una norma`);
  if (!(resultado in RESULTADOS_NORMA)) throw new Error(`medición: resultado fuera del vocabulario: ${resultado}`);
  const n = /^\d{1,8}$/.test(String(pr ?? "")) ? String(pr) : "-";
  const d = String(detalle ?? "").replace(/[\r\n]+/g, " ").trim() || "-";
  return `norma: ${norma} resultado: ${resultado} pr: ${n} detalle: ${d}`;
}

/** Las líneas de norma de un texto (un log de CI, la salida de un script): [{ norma, resultado, pr }]. */
export function leerLineasDeNorma(texto) {
  const re = /(?:^|\s)norma: ([a-z0-9]+(?:-[a-z0-9]+)*) resultado: (ok|warning|fail|exempt|declared|unchecked)(?: pr: (\d{1,8}|-))?(?=\s|$)/gm;
  return [...String(texto ?? "").matchAll(re)].map((m) => ({ norma: m[1], resultado: m[2], pr: m[3] && m[3] !== "-" ? m[3] : null }));
}

/** Los eventos de la guardia (jsonl) con `norma` (o el `codigo` de antes), como líneas `warning`. Las líneas rotas se saltan. */
export function saltosDeLaGuardia(jsonl) {
  const fuera = [];
  for (const l of String(jsonl ?? "").split(/\r?\n/)) {
    if (!l.trim()) continue;
    let o = null;
    try { o = JSON.parse(l); } catch { continue; /* a propósito: una línea corrupta no cuenta */ }
    const id = o?.norma ?? o?.codigo;
    if (o && EVENTOS_QUE_SALTAN.includes(o.evento) && typeof id === "string" && ID_NORMA.test(id)) fuera.push({ norma: id, resultado: "warning", pr: null });
  }
  return fuera;
}

/** Cuenta por norma: { id: { ok, warning, fail, exempt, declared } }, una vez por pr + norma + resultado (ver la cabecera). */
export function contarPorNorma(lineas) {
  const c = {};
  const vistas = new Set();
  for (const { norma, resultado, pr = null } of lineas) {
    if (resultado === "unchecked") continue;
    if (pr) {
      const k = `${pr}|${norma}|${resultado}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
    }
    (c[norma] ??= { ok: 0, warning: 0, fail: 0, exempt: 0, declared: 0 })[resultado] += 1;
  }
  return c;
}

/**
 * Lo que se pregunta a las cuentas. `normas`: la lista de ops/normas.json; `cuentas`: de contarPorNorma.
 * → { filas, nuncaSaltan, sinDato, exceptuadasSiempre, desconocidas }
 */
export function medir(normas, cuentas) {
  const vacia = { ok: 0, warning: 0, fail: 0, exempt: 0, declared: 0 };
  const filas = normas.map((n) => ({ norma: n.id, ...vacia, ...(cuentas[n.id] ?? {}) }));
  const ids = new Set(normas.map((n) => n.id));
  const salta = (f) => f.warning + f.fail;
  const hechas = (f) => f.ok + salta(f) + f.exempt + f.declared;
  const conEjecutor = new Set(normas.filter((n) => n.ejecutor !== "nada").map((n) => n.id));
  return {
    filas,
    nuncaSaltan: filas.filter((f) => f.ok > 0 && salta(f) === 0 && f.exempt === 0).map((f) => f.norma),
    sinDato: filas.filter((f) => hechas(f) === 0 && conEjecutor.has(f.norma)).map((f) => f.norma),
    exceptuadasSiempre: filas.filter((f) => f.exempt >= MIN_EXCEPTUADAS && salta(f) === 0).map((f) => f.norma),
    desconocidas: Object.keys(cuentas).filter((id) => !ids.has(id)),
  };
}
