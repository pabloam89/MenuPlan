/**
 * zonas.mjs — qué ramas vivas llevan qué ficheros, leído por la guardia en cada
 * edición (#506, fondo #504).
 *
 * Varias sesiones editaban a la vez los mismos ficheros centrales (`ops/forja.json`,
 * `CLAUDE.md`…) y lo coordinaban por mensajes entre sesiones, que no dejan rastro.
 * Aquí no hay un registro escrito a mano: las zonas se DERIVAN de git. Cada rama
 * con carpeta de trabajo (`git worktree list`) lleva los ficheros que ya cambió
 * frente a origin/staging (commiteados o no) y los que reservó al abrir la tarea
 * (`npm run tarea -- … --zona <fichero>`, que lo guarda en `branch.<rama>.zona` de
 * la configuración de git y se va solo al borrar la rama). Su issue sale del
 * nombre de la rama.
 *
 * Calcularlo cuesta unos `git` por carpeta, demasiado para cada edición. Por eso
 * lo calcula `scripts/lib/zonas.mjs` en segundo plano y lo deja en
 * `<.git común>/claude-sesiones/zonas.json`; la guardia solo lee ese fichero y, si
 * está viejo, lanza el cálculo sin esperarlo. Con una foto de más de
 * `VIDA_MAX_MS`, o sin ella, no avisa (falla abierta: es un aviso, no un candado).
 *
 * Solo módulos de Node: la guardia no puede depender de nada que falle al cargar.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Pasada esta edad, la guardia pide otra foto (sin esperarla) y sigue con la que hay. */
export const VIDA_FRESCA_MS = 2 * 60 * 1000;
/**
 * Pasada esta edad, la foto no vale para avisar. 30 min: una rama que empieza a
 * tocar un fichero tarda como mucho eso en verse, y una sesión que acaba de
 * abrir no se queda sin aviso más que en su primera edición.
 */
export const VIDA_MAX_MS = 30 * 60 * 1000;
/** Mientras exista un candado más joven que esto, nadie lanza otro cálculo. */
export const VIDA_CANDADO_MS = 60 * 1000;

export const FICHERO_ZONAS = "zonas.json";
const CANDADO = "zonas.lock";
const VISTAS = "zonas-vistas";
/** El registro contable de avisos, en la carpeta de la fábrica (fuera del repo). */
export const FICHERO_LINEAS = "zonas.log";

/** Cómo lleva una rama un fichero: lo cambió ya o lo reservó al abrir la tarea. */
export const COMO_LLEVA = ["cambiado", "reservado"];

const norma = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** La foto de zonas y su edad, o null si no hay o no se lee. */
export function leerZonas(dirReg, ahora = Date.now()) {
  if (!dirReg) return null;
  try {
    const fichero = join(dirReg, FICHERO_ZONAS);
    const datos = JSON.parse(readFileSync(fichero, "utf8"));
    if (!datos || !Array.isArray(datos.ramas)) return null;
    const hecho = Date.parse(datos.hecho);
    return { datos, edadMs: Number.isFinite(hecho) ? ahora - hecho : Infinity };
  } catch {
    return null; // a propósito: sin foto (aún no calculada o a medio escribir) no se avisa; falla abierta
  }
}

/** Escribe la foto de golpe (fichero temporal y renombrar): la guardia nunca lee una a medias. */
export function escribirZonas(dirReg, datos) {
  mkdirSync(dirReg, { recursive: true });
  const tmp = join(dirReg, `${FICHERO_ZONAS}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(datos));
  renameSync(tmp, join(dirReg, FICHERO_ZONAS));
}

/** ¿Una reserva cubre esta ruta? Un fichero exacto o una carpeta acabada en «/». */
export const cubre = (reserva, rutaRel) => {
  const r = String(reserva);
  return r.endsWith("/") ? rutaRel.startsWith(r) : rutaRel === r;
};

/**
 * Las OTRAS ramas que llevan `rutaRel`: [{ rama, carpeta, issue, desde, como }].
 * La propia es la rama cuya carpeta contiene `rutaAbs`; sin `rutaAbs`, ninguna
 * se excluye. Pura.
 */
export function otrasRamas(datos, rutaRel, rutaAbs = null) {
  if (!datos?.ramas || !rutaRel) return [];
  const abs = rutaAbs ? norma(rutaAbs) : null;
  const out = [];
  for (const r of datos.ramas) {
    if (abs && r.ruta && (abs === norma(r.ruta) || abs.startsWith(`${norma(r.ruta)}/`))) continue;
    const como = (r.ficheros ?? []).includes(rutaRel) ? "cambiado" : (r.reservadas ?? []).some((x) => cubre(x, rutaRel)) ? "reservado" : null;
    if (como) out.push({ rama: r.rama, carpeta: r.carpeta ?? null, issue: r.issue ?? null, desde: r.desde ?? null, como });
  }
  return out;
}

/** Lanza el cálculo de la foto en otro proceso, sin esperarlo. true si lo lanzó. */
export function refrescarEnSegundoPlano(dirReg, { ahora = Date.now(), script = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "lib", "zonas.mjs") } = {}) {
  try {
    const candado = join(dirReg, CANDADO);
    if (existsSync(candado) && ahora - statSync(candado).mtimeMs < VIDA_CANDADO_MS) return false;
    mkdirSync(dirReg, { recursive: true });
    writeFileSync(candado, String(process.pid));
    const hijo = spawn(process.execPath, [script, "--refrescar", resolve(dirReg)], { detached: true, stdio: "ignore", windowsHide: true });
    hijo.on("error", () => {});
    hijo.unref();
    return true;
  } catch {
    return false; // a propósito: sin poder lanzar el cálculo la guardia sigue sin aviso; falla abierta
  }
}

/**
 * Lo que necesita la guardia: las otras ramas que llevan el fichero, o [] si no
 * hay foto válida. Si la foto es vieja (o no existe), pide otra sin esperarla.
 */
export function consultarZona(dirReg, rutaAbs, rutaRel, { ahora = Date.now(), refrescar = refrescarEnSegundoPlano } = {}) {
  if (!dirReg || !rutaRel) return [];
  const foto = leerZonas(dirReg, ahora);
  if (!foto || foto.edadMs > VIDA_FRESCA_MS) refrescar(dirReg, { ahora });
  if (!foto || foto.edadMs > VIDA_MAX_MS) return [];
  return otrasRamas(foto.datos, rutaRel, rutaAbs);
}

const sesionValida = (id) => typeof id === "string" && /^[\w-]{6,80}$/.test(id);

/**
 * Anota que esta sesión ya fue avisada de este fichero. true solo la PRIMERA vez
 * (el aviso sale una vez por fichero y sesión); false si ya estaba o si no se
 * puede anotar (sin registro no se avisa: un aviso que no recuerda se repetiría
 * en cada edición).
 */
export function anotarVista(dirReg, sesion, rutaRel) {
  if (!dirReg || !sesionValida(sesion) || !rutaRel) return false;
  try {
    const dir = join(dirReg, VISTAS);
    const fichero = join(dir, `${sesion}.json`);
    const ya = existsSync(fichero) ? JSON.parse(readFileSync(fichero, "utf8")) : [];
    if (ya.includes(rutaRel)) return false;
    mkdirSync(dir, { recursive: true });
    writeFileSync(fichero, JSON.stringify([...ya, rutaRel]));
    return true;
  } catch {
    return false; // a propósito: sin poder recordar no se avisa (se repetiría en cada edición); falla abierta
  }
}

/** Horas sin tocarse a partir de las cuales la ficha de avisos de una sesión se borra (la de sesiones.mjs). */
export const CADUCA_VISTAS_H = 48;

/** Borra las fichas de avisos de sesiones que ya no existen. Lo llama el cálculo en segundo plano. Devuelve cuántas. */
export function barrerVistas(dirReg, ahora = Date.now()) {
  let n = 0;
  try {
    const dir = join(dirReg, VISTAS);
    if (!existsSync(dir)) return 0;
    for (const f of readdirSync(dir)) {
      const fichero = join(dir, f);
      if ((ahora - statSync(fichero).mtimeMs) / 3_600_000 > CADUCA_VISTAS_H) {
        rmSync(fichero, { force: true });
        n++;
      }
    }
  } catch {
    // a propósito: es limpieza; si falla, las fichas viejas se quedan hasta la próxima y no pasa nada
  }
  return n;
}

const horas = (desde, ahora) => {
  const t = Date.parse(desde);
  return Number.isFinite(t) ? (ahora - t) / 3_600_000 : null;
};
/** «40 min», «3,5 h», «2 días» o «sin fecha». */
export const haceCuanto = (h) => (h == null ? "sin fecha" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h / 24)} días`);

/** «la rama `ops/x` (#504, con cambios, desde hace 3,0 h)», hasta tres y «y n más». */
export function listaDeRamas(otras, ahora = Date.now()) {
  const una = (o) => {
    const h = horas(o.desde, ahora);
    const datos = [o.issue ? `#${o.issue}` : "sin issue", o.como === "reservado" ? "reservado al abrir la tarea" : "con cambios", h == null ? "sin fecha" : `desde hace ${haceCuanto(h)}`];
    return `la rama \`${o.rama}\` (${datos.join(", ")})`;
  };
  const mas = otras.length > 3 ? ` y ${otras.length - 3} más` : "";
  return otras.slice(0, 3).map(una).join("; ") + mas;
}

/** La línea contable de un aviso: `ts: … zona: <fichero> rama: <otra> issue: #n aviso: si`. Una por rama. */
export function lineasDeAviso({ fichero, otras }, ahora = new Date()) {
  return otras.map((o) => `ts: ${ahora.toISOString()} zona: ${fichero} rama: ${o.rama} issue: ${o.issue ? `#${o.issue}` : "-"} como: ${o.como} aviso: si`);
}

/** Añade las líneas al registro de la fábrica. NUNCA lanza: true si escribió. */
export function anotarLineas(dirFabrica, lineas) {
  try {
    if (!lineas.length) return false;
    mkdirSync(dirFabrica, { recursive: true });
    appendFileSync(join(dirFabrica, FICHERO_LINEAS), `${lineas.join("\n")}\n`);
    return true;
  } catch {
    return false; // a propósito: el registro es una ayuda; un fallo no puede romper la guardia
  }
}
