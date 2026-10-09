/**
 * lleva.mjs — «quién lleva qué», sacado del repo y no de deducciones (#271,
 * arreglo de #143; el caso fue #270: nadie sabía quién llevaba #255).
 *
 * Tres piezas, una sola fuente para `tarea`, `retirar`, `issues` y el arranque:
 *
 *  1. La marca en el issue. Un comentario con un marcador oculto
 *     (`<!-- menuplan:lleva rama=… carpeta=… desde=… -->`) que pone
 *     `npm run tarea -- <rama> <n>` y quita `npm run retirar`. Comentario y no
 *     etiqueta: una etiqueta nueva es un ajuste del repo (OK de Pablo) y no
 *     guarda rama, carpeta ni hora; el cuerpo del issue lo escriben otros y
 *     se pisaría. Un comentario por rama, así que dos ramas sobre el mismo
 *     issue se ven (justo lo que hay que ver) y poner la marca dos veces
 *     edita la misma. Sin red, es un aviso y no un error.
 *  2. El inventario de ramas vivas: `git worktree list` más las ramas de
 *     GitHub que no están en staging, con la fecha de su último commit.
 *  3. El cruce encargo → rama/carpeta → antigüedad, y las ramas sin número.
 *
 * Todo lo que toca git o gh recibe la función que lo ejecuta, para probarlo
 * sin red. Una carpeta sin commits desde hace `HORAS_PARADA` sale como
 * «posiblemente parada».
 */
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

import { ahoraEnMadrid } from "./hora.mjs";
import { raices } from "./issues.mjs";

/**
 * Horas sin commits a partir de las cuales una carpeta parece parada. Medido el
 * 9 oct 2026 sobre los commits de las últimas dos semanas que no están en
 * staging: 24 huecos entre commits seguidos de una misma rama, el 87 % de menos
 * de 2 h (mediana 0,5 h, percentil 75 en 0,8 h) y ninguno entre 2 y 4 h. A las
 * 4 h se pasa de «está pensando» a «se ha ido».
 */
export const HORAS_PARADA = 4;

/**
 * Días a partir de los cuales una marca cuya rama ya no se ve (ni carpeta ni
 * GitHub) deja de contar como «lo lleva»: la carpeta la retiró el hook
 * limpiar-worktrees y no `retirar`. Medido el 9 oct 2026 sobre 164 PR
 * fusionados en 30 días: del primer commit al merge, mediana 0 días, percentil
 * 95 en 0,3 y máximo 12,3. A 3 días caben todos menos las excepciones.
 */
export const DIAS_MARCA_ANTIGUA = 3;

/** Ramas que no son de nadie: no se cruzan con encargos ni cuentan como «sin número». */
const AJENAS = /^(main|staging|HEAD)$|^(dependabot|pr|rescate)\/|^ccr-/;

/** Número de issue de una rama (`ops/271-quien-lleva` → 271). Un cero delante es el número de una migración, no un issue. */
export function numeroDeRama(rama) {
  const m = /^[a-z]+\/([1-9]\d*)-/.exec(String(rama ?? ""));
  return m ? Number(m[1]) : null;
}

// ── La marca ──────────────────────────────────────────────────────────────────

const MARCADOR = "menuplan:lleva";

/** El comentario que marca el issue como «lo lleva esta rama». */
export function cuerpoDeMarca({ rama, carpeta, desde = new Date() }) {
  const iso = desde.toISOString();
  return [
    `<!-- ${MARCADOR} rama=${rama} carpeta=${carpeta} desde=${iso} -->`,
    `**Lo lleva** la rama \`${rama}\` (carpeta \`${carpeta}\`), desde el ${ahoraEnMadrid(desde)}.`,
    "",
    "Lo pone `npm run tarea` y lo quita `npm run retirar`; no hace falta tocarlo a mano.",
  ].join("\n");
}

/** Las marcas que hay en los comentarios de un issue: [{ rama, carpeta, desde: Date }]. */
export function leerMarcas(comentarios) {
  const re = new RegExp(`<!-- ${MARCADOR} rama=(\\S+) carpeta=(\\S+) desde=(\\S+) -->`);
  return (comentarios ?? [])
    .map((c) => re.exec(String(c.body ?? c)))
    .filter(Boolean)
    .map((m) => ({ rama: m[1], carpeta: m[2], desde: new Date(m[3]) }));
}

const motivoDe = (e) => String(e?.stderr ?? e?.message ?? e).trim().split("\n")[0];

/** `gh` con tope de tiempo: sin red, que falle pronto y avise. */
export const ghReal = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 });

/** Los comentarios del issue con su id: [{ id, body }]. */
function comentarios(gh, issue) {
  const salida = gh("api", "--paginate", `repos/{owner}/{repo}/issues/${issue}/comments`, "--jq", ".[] | {id: .id, body: .body} | tojson");
  return salida.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/**
 * Pone la marca en el issue; si ya hay una de esa rama, la pone al día (idempotente).
 * Nunca lanza: { ok, aviso }. Sin red o sin permisos, el aviso dice qué hacer.
 */
export function marcar(issue, datos, gh = ghReal) {
  try {
    const cuerpo = cuerpoDeMarca(datos);
    const propia = comentarios(gh, issue).find((c) => leerMarcas([c]).some((m) => m.rama === datos.rama));
    if (propia) gh("api", "-X", "PATCH", `repos/{owner}/{repo}/issues/comments/${propia.id}`, "-f", `body=${cuerpo}`);
    else gh("api", "-X", "POST", `repos/{owner}/{repo}/issues/${issue}/comments`, "-f", `body=${cuerpo}`);
    return { ok: true, aviso: null };
  } catch (e) {
    return { ok: false, aviso: `No he podido marcar #${issue} como «lo lleva ${datos.rama}» (${motivoDe(e)}). Sigue sin la marca; ponla a mano con un comentario cuando haya red.` };
  }
}

/** Quita las marcas de esa rama del issue. Nunca lanza: { ok, quitadas, aviso }. */
export function desmarcar(issue, rama, gh = ghReal) {
  try {
    const suyas = comentarios(gh, issue).filter((c) => leerMarcas([c]).some((m) => m.rama === rama));
    for (const c of suyas) gh("api", "-X", "DELETE", `repos/{owner}/{repo}/issues/comments/${c.id}`);
    return { ok: true, quitadas: suyas.length, aviso: null };
  } catch (e) {
    return { ok: false, quitadas: 0, aviso: `No he podido quitar la marca «lo lleva ${rama}» de #${issue} (${motivoDe(e)}). Bórrala a mano: el comentario que empieza por «Lo lleva».` };
  }
}

// ── El inventario de ramas vivas ──────────────────────────────────────────────

/** Worktrees de `git worktree list --porcelain`: [{ ruta, rama }] (sin los que no tienen rama). */
export function leerWorktrees(porcelana) {
  const out = [];
  for (const bloque of String(porcelana).split(/\n\n+/)) {
    const ruta = bloque.match(/^worktree (.+)$/m)?.[1]?.trim();
    const rama = bloque.match(/^branch refs\/heads\/(.+)$/m)?.[1]?.trim() ?? null;
    if (ruta && rama) out.push({ ruta, rama });
  }
  return out;
}

/**
 * Junta carpetas y ramas de GitHub en una lista: [{ rama, carpeta, remota,
 * ultimo: Date|null, numero }]. La carpeta principal no cuenta; una rama que está
 * en las dos partes sale una vez, con el commit más reciente.
 */
export function inventario({ worktrees, principal, remotas }) {
  const porRama = new Map();
  const norma = (r) => String(r).replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  for (const w of worktrees) {
    if (norma(w.ruta) === norma(principal) || AJENAS.test(w.rama)) continue;
    porRama.set(w.rama, { rama: w.rama, carpeta: basename(w.ruta), remota: false, ultimo: w.ultimo ?? null });
  }
  for (const r of remotas) {
    if (AJENAS.test(r.rama)) continue;
    const ya = porRama.get(r.rama);
    const ultimo = [ya?.ultimo, r.ultimo].filter(Boolean).sort((a, b) => b - a)[0] ?? null;
    porRama.set(r.rama, { rama: r.rama, carpeta: ya?.carpeta ?? null, remota: true, ultimo });
  }
  return [...porRama.values()].map((x) => ({ ...x, numero: numeroDeRama(x.rama) })).sort((a, b) => a.rama.localeCompare(b.rama));
}

/** Lee git (carpetas y ramas de GitHub aún no fusionadas en staging). Lanza si git falla: quien llama decide. */
export function leerInventario(principal, git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 })) {
  const worktrees = leerWorktrees(git("-C", principal, "worktree", "list", "--porcelain")).map((w) => {
    let ultimo = null;
    try {
      ultimo = new Date(git("-C", w.ruta, "log", "-1", "--format=%cI").trim());
    } catch {
      // a propósito: una carpeta que git no sabe leer (borrada a medias) sale sin fecha; no tumba el listado
    }
    return { ...w, ultimo };
  });
  let remotas = [];
  try {
    remotas = git("-C", principal, "for-each-ref", "--no-merged=origin/staging", "--format=%(refname:short)|%(committerdate:iso-strict)", "refs/remotes/origin")
      .split("\n").filter(Boolean)
      .map((l) => {
        const [nombre, fecha] = l.split("|");
        return { rama: nombre.replace(/^origin\//, ""), ultimo: new Date(fecha) };
      });
  } catch {
    // a propósito: sin origin/staging (clon raro) solo se ven las carpetas; el resto del inventario sigue valiendo
  }
  return inventario({ worktrees, principal, remotas });
}

// ── El cruce ──────────────────────────────────────────────────────────────────

const horasDesde = (fecha, ahora) => (fecha ? (ahora - fecha) / 3_600_000 : null);

/**
 * Para cada issue abierto con rama viva o con marca: [{ issue, ramas: [{ rama,
 * carpeta, horas, parada, marcada }] }]. `issue.marcas` son las que el
 * issue guarda en sus comentarios; una marca sin rama que se vea aquí (la
 * carpeta es de otro PC, o no se subió nada) sale con `horas` desde la marca.
 */
export function cruce(issues, ramas, ahora = new Date(), horasParada = HORAS_PARADA) {
  const out = new Map();
  const poner = (n, fila) => {
    if (!out.has(n)) out.set(n, []);
    const lista = out.get(n);
    const ya = lista.find((x) => x.rama === fila.rama);
    if (ya) Object.assign(ya, { marcada: ya.marcada || fila.marcada });
    else lista.push(fila);
  };
  const abiertos = new Map(issues.filter((i) => i.state === "OPEN").map((i) => [i.number, i]));
  for (const r of ramas) {
    if (!r.numero || !abiertos.has(r.numero)) continue;
    const horas = horasDesde(r.ultimo, ahora);
    poner(r.numero, { rama: r.rama, carpeta: r.carpeta, horas, parada: horas != null && horas > horasParada, marcada: false });
  }
  for (const i of abiertos.values()) {
    for (const m of i.marcas ?? []) {
      const vista = ramas.find((r) => r.rama === m.rama);
      // Una marca vieja sin rama es un resto, no «lo lleva» ni «parada» (ver marcasHuerfanas).
      if (!vista && horasDesde(m.desde, ahora) > DIAS_MARCA_ANTIGUA * 24) continue;
      const horas = vista ? horasDesde(vista.ultimo, ahora) : horasDesde(m.desde, ahora);
      poner(i.number, { rama: m.rama, carpeta: m.carpeta, horas, parada: horas != null && horas > horasParada, marcada: true, vista: Boolean(vista) });
    }
  }
  return [...out.entries()].map(([number, lista]) => ({ number, ramas: lista })).sort((a, b) => a.number - b.number);
}

/**
 * Marcas de issues (abiertos o cerrados) cuya rama no se ve y que tienen más de
 * DIAS_MARCA_ANTIGUA días: [{ issue, rama, carpeta, dias }]. Solo se listan;
 * borrar un comentario de un issue es de quien lo pida.
 */
export function marcasHuerfanas(issues, ramas, ahora = new Date()) {
  return issues.flatMap((i) => (i.marcas ?? [])
    .filter((m) => !ramas.some((r) => r.rama === m.rama) && horasDesde(m.desde, ahora) > DIAS_MARCA_ANTIGUA * 24)
    .map((m) => ({ issue: i.number, rama: m.rama, carpeta: m.carpeta, dias: Math.floor(horasDesde(m.desde, ahora) / 24) })));
}

/** Ramas de trabajo sin número de issue: la excepción que tiene que verse. */
export const sinNumero = (ramas) => ramas.filter((r) => !r.numero);

const h = (x) => (x == null ? "sin fecha" : x < 1 ? `${Math.max(1, Math.round(x * 60))} min` : x < 48 ? `${x.toFixed(1).replace(".", ",")} h` : `${Math.round(x / 24)} días`);

/** «rama en carpeta, último commit hace 2,0 h» (+ «posiblemente parada»). */
export function textoDeRama(f) {
  const donde = f.carpeta ? `${f.rama} en ${f.carpeta}` : f.rama;
  const base = f.marcada && f.vista === false ? `${donde}, marcada hace ${h(f.horas)} y sin rama que se vea aquí` : `${donde}, último commit hace ${h(f.horas)}`;
  return f.parada ? `${base}: posiblemente parada` : base;
}

/** Las líneas cortas del arranque: cuántos encargos tienen quién, cuáles parecen parados y qué ramas no tienen issue. */
export function lineasDeLleva(issues, ramas, ahora = new Date()) {
  const lineas = [];
  const filas = cruce(issues, ramas, ahora);
  const paradas = filas.flatMap((f) => f.ramas.filter((r) => r.parada).map((r) => `#${f.number} (${r.carpeta ?? r.rama}, ${h(r.horas)})`));
  const abiertos = issues.filter((i) => i.state === "OPEN" && i.labels.some((l) => l.name === "tipo:encargo")).length;
  const llevados = filas.filter((f) => issues.some((i) => i.number === f.number && i.labels.some((l) => l.name === "tipo:encargo"))).length;
  if (ramas.length || abiertos) lineas.push(`Quién lleva qué: ${llevados} de ${abiertos} encargos abiertos tienen rama viva (\`npm run issues\` dice cuál).`);
  if (paradas.length) lineas.push(`Posiblemente paradas (sin commits desde hace más de ${HORAS_PARADA} h): ${paradas.join("; ")}. Si es tuya, retómala; si no, no la pises sin preguntar.`);
  const sin = sinNumero(ramas);
  if (sin.length) lineas.push(`${sin.length} ramas sin número de issue: ${sin.map((r) => r.rama).join(", ")}. Toda rama no trivial lleva el suyo (\`npm run tarea -- <rama> <n>\`).`);
  return lineas;
}

// ── Parecidos en git (--nuevo y /orquestar) ───────────────────────────────────

/**
 * Ramas y carpetas vivas cuyo nombre se parece a un título: [{ rama, carpeta,
 * horas }]. Un nombre de rama es corto (1 a 3 palabras), así que no vale el
 * índice de Dice de los issues: basta que la mitad de sus palabras estén en el
 * título. Es una pista: la decide quien lee.
 */
export function parecidosEnGit(ramas, titulo, ahora = new Date()) {
  const a = raices(titulo);
  if (!a.size) return [];
  return ramas
    .map((r) => {
      const nombre = r.rama.replace(/^[a-z]+\//, "").replace(/^\d+-/, "");
      const b = raices(nombre.replace(/-/g, " "));
      const comunes = [...b].filter((x) => a.has(x)).length;
      return { r, comunes, parte: b.size ? comunes / b.size : 0 };
    })
    .filter((x) => x.comunes >= 1 && x.parte >= 0.5)
    .map((x) => ({ rama: x.r.rama, carpeta: x.r.carpeta, numero: x.r.numero, horas: horasDesde(x.r.ultimo, ahora) }));
}

/** Cómo se enseña una rama parecida, al lado de los issues parecidos. */
export const lineaParecida = (p) => `  rama ${p.rama}${p.carpeta ? ` en ${p.carpeta}` : " (solo en GitHub)"}  último commit hace ${h(p.horas)}${p.numero ? `  (issue #${p.numero})` : "  (sin número de issue)"}`;
