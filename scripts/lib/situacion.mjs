/**
 * situacion.mjs — el estado real de lo que varias sesiones cambian a la vez,
 * con su hora y la fuente de cada bloque (#459, encargo del fondo #231).
 *
 * Por qué: las sesiones daban el estado de memoria o de un resumen y el estado
 * cambia en minutos. Aquí cada bloque se lee de GitHub o de git en el momento
 * y, si su fuente falla, dice «sin ver: <motivo>»: nunca vacío ni rellenado.
 *
 * Lógica pura: las fuentes llegan como funciones (`gh` y `git` reales en
 * scripts/situacion.mjs, de mentira en el test). Reutiliza lo que ya existe:
 * la hora de lib/hora.mjs, el cruce rama/encargo de lib/lleva.mjs y el
 * limpiador de texto de fuera de lib/textoExterno.mjs.
 *
 * Decisiones abiertas: se enseña la fecha del último comentario y no se dice
 * quién espera a quién; las sesiones usan la cuenta de Pablo y el autor del
 * comentario no distingue (matiz del fondo #231, #326).
 */
import { ahoraEnMadrid, diaMadrid } from "./hora.mjs";
import { HORAS_PARADA, cruce, textoDeRama } from "./lleva.mjs";
import { limpiarTexto } from "./textoExterno.mjs";

/** Horas hacia atrás que cuenta «fusionado hace poco». */
export const HORAS_FUSIONADO = 6;

/** Los bloques en orden, con la fuente que se enseña en la cabecera. */
export const BLOQUES = [
  { id: "prs", titulo: "PR abiertos", fuente: "gh pr list + git (origin/staging)" },
  { id: "fusionados", titulo: `Fusionado en las últimas ${HORAS_FUSIONADO} h`, fuente: "gh pr list --state merged" },
  { id: "ramas", titulo: "Carpetas y ramas vivas", fuente: "git worktree + ramas de origin no fusionadas" },
  { id: "decisiones", titulo: "Decisiones abiertas", fuente: "gh issue list --label tipo:decision" },
  { id: "fondos", titulo: "Fondos y sus encargos", fuente: "GitHub GraphQL (issues) + marcas «lo lleva»" },
  { id: "contradicciones", titulo: "Contradicciones", fuente: "GitHub GraphQL (issues) cruzado con git" },
];

export function cabecera(ahora = new Date()) {
  return [
    `Situación, ${ahoraEnMadrid(ahora)}`,
    "Leído ahora de GitHub y git; nada de memoria. Fuentes:",
    ...BLOQUES.map((b) => `  - ${b.titulo}: ${b.fuente}`),
  ].join("\n");
}

/** «CI verde», «CI rojo», «CI en curso» o «sin CI», de los checks de un PR. */
export function estadoCI(checks) {
  const c = checks ?? [];
  if (!c.length) return "sin CI";
  const malo = (x) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED"].includes(String(x.conclusion ?? x.state ?? "").toUpperCase());
  if (c.some(malo)) return "CI rojo";
  const curso = (x) => String(x.status ?? "COMPLETED").toUpperCase() !== "COMPLETED" || ["PENDING", "EXPECTED"].includes(String(x.state ?? "").toUpperCase());
  if (c.some(curso)) return "CI en curso";
  return "CI verde";
}

const horasDesde = (fecha, ahora) => (ahora - new Date(fecha)) / 3_600_000;
const hs = (x) => (x < 1 ? `${Math.max(1, Math.round(x * 60))} min` : x < 48 ? `${x.toFixed(1).replace(".", ",")} h` : `${Math.round(x / 24)} días`);
const t = (texto) => limpiarTexto(texto, 70);
const motivoDe = (e) => limpiarTexto(String(e?.stderr ?? e?.message ?? e).split("\n")[0], 120) || "motivo desconocido";

/** Lee una fuente sin dejar que su fallo tumbe lo demás: { datos } o { motivo }. */
function leer(fuente) {
  try {
    return { datos: fuente() };
  } catch (e) {
    return { motivo: motivoDe(e) };
  }
}

const sinVer = (r) => [`  sin ver: ${r.motivo}`];
const ninguno = (que) => [`  ${que}`];

function bloquePrs(r, atrasada) {
  if (!r.datos) return sinVer(r);
  if (!r.datos.length) return ninguno("ninguno abierto");
  return r.datos.map((p) => {
    let al = "";
    try {
      al = atrasada(p.headRefName) ? "atrasada respecto a origin/staging" : "al día con origin/staging";
    } catch (e) {
      al = `atraso sin ver: ${motivoDe(e)}`;
    }
    return `  #${p.number} ${t(p.title)} (${limpiarTexto(p.headRefName, 60)}): ${estadoCI(p.checks)}, ${al}`;
  });
}

function bloqueFusionados(r, ahora) {
  if (!r.datos) return sinVer(r);
  const f = r.datos.filter((p) => p.mergedAt && horasDesde(p.mergedAt, ahora) <= HORAS_FUSIONADO);
  if (!f.length) return ninguno(`ninguno en las últimas ${HORAS_FUSIONADO} h`);
  return f.map((p) => `  #${p.number} ${t(p.title)}: hace ${hs(horasDesde(p.mergedAt, ahora))}`);
}

const rama = (x, horas, marcada = false) => textoDeRama({
  rama: limpiarTexto(x.rama, 60), carpeta: x.carpeta ? limpiarTexto(x.carpeta, 60) : null, horas, parada: horas != null && horas > HORAS_PARADA, marcada, vista: x.vista,
});

function bloqueRamas(r, ahora) {
  if (!r.datos) return sinVer(r);
  if (!r.datos.length) return ninguno("ninguna rama ni carpeta viva");
  return r.datos.map((x) => `  ${rama(x, x.ultimo ? horasDesde(x.ultimo, ahora) : null)}${x.carpeta ? "" : " (solo en GitHub)"}`);
}

function bloqueDecisiones(r, ahora) {
  if (!r.datos) return sinVer(r);
  if (!r.datos.length) return ninguno("ninguna decisión abierta");
  return r.datos.map((d) => {
    const ultimo = d.ultimoComentario
      ? `último comentario hace ${hs(horasDesde(d.ultimoComentario, ahora))} (${diaMadrid(new Date(d.ultimoComentario))})`
      : `sin comentarios (abierta hace ${hs(horasDesde(d.createdAt, ahora))})`;
    return `  #${d.number} ${t(d.title)}: ${ultimo}`;
  });
}

const esTipo = (x, tipo) => (x.labels ?? []).some((l) => l.name === `tipo:${tipo}`) || x.tipo === tipo;

function bloqueFondos(issues, ramas, ahora) {
  if (!issues.datos) return sinVer(issues);
  const fondos = issues.datos.filter((i) => i.state === "OPEN" && esTipo(i, "fondo"));
  if (!fondos.length) return ninguno("ningún fondo abierto");
  const cruzado = ramas.datos ? new Map(cruce(issues.datos, ramas.datos, ahora).map((f) => [f.number, f.ramas])) : null;
  const lineas = [];
  for (const f of fondos) {
    const enc = (f.hijos ?? []).filter((h) => esTipo(h, "encargo"));
    const abiertos = enc.filter((h) => h.state === "OPEN");
    const cerrados = enc.length - abiertos.length;
    lineas.push(`  #${f.number} ${t(f.title)}: ${abiertos.length} ${abiertos.length === 1 ? "abierto" : "abiertos"}, ${cerrados} ${cerrados === 1 ? "cerrado" : "cerrados"}`);
    for (const h of abiertos) {
      const quien = cruzado === null
        ? "quién lo lleva: sin ver (no se leyeron las ramas)"
        : (cruzado.get(h.number) ?? []).map((x) => `lo lleva ${rama(x, x.horas, x.marcada)}`).join("; ") || "nadie lo lleva (sin marca ni rama)";
      lineas.push(`    #${h.number}: ${quien}`);
    }
  }
  return lineas;
}

function bloqueContradicciones(issues, ramas, ahora) {
  if (!issues.datos) return sinVer(issues);
  const lineas = [];
  for (const i of issues.datos.filter((x) => x.state === "OPEN")) {
    const pr = (i.prs ?? []).find((p) => p.mergedAt);
    if (pr) lineas.push(`  #${i.number} sigue abierto y su PR #${pr.number} está fusionado: ciérralo o reábrelo con motivo`);
  }
  if (ramas.datos) {
    for (const f of cruce(issues.datos, ramas.datos, ahora)) {
      for (const x of f.ramas.filter((y) => y.marcada && y.vista === false)) {
        lineas.push(`  #${f.number} se marcó como «lo lleva ${limpiarTexto(x.rama, 60)}» hace ${hs(x.horas)} pero no hay esa rama viva`);
      }
    }
  } else {
    lineas.push(`  encargos «lo lleva» sin rama viva: sin ver (${ramas.motivo})`);
  }
  return lineas.length ? lineas : ninguno("ninguna contradicción");
}

/**
 * El texto entero. `fuentes`: { prsAbiertos, atrasada(rama), fusionados,
 * ramas, decisiones, issues }, cada una una función síncrona que lanza si falla.
 */
export function situacion(fuentes, ahora = new Date()) {
  const ramas = leer(fuentes.ramas);
  const issues = leer(fuentes.issues);
  const cuerpo = {
    prs: bloquePrs(leer(fuentes.prsAbiertos), fuentes.atrasada),
    fusionados: bloqueFusionados(leer(fuentes.fusionados), ahora),
    ramas: bloqueRamas(ramas, ahora),
    decisiones: bloqueDecisiones(leer(fuentes.decisiones), ahora),
    fondos: bloqueFondos(issues, ramas, ahora),
    contradicciones: bloqueContradicciones(issues, ramas, ahora),
  };
  return [cabecera(ahora), ...BLOQUES.flatMap((b) => ["", `${b.titulo} (${b.fuente})`, ...cuerpo[b.id]])].join("\n");
}
