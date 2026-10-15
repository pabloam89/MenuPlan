/**
 * referenciaIssue.mjs — el único lector de una referencia a un issue (#856, fondo #855).
 *
 * Por qué: la factoría daba por hecho un solo repo. Cada lector (la ficha del fondo,
 * el bloque `encargo`, el `Closes` del CI y el de la guardia, la línea `Casos:`)
 * leía `#n` con su propia expresión, y `#n` solo vale dentro del repo donde está el
 * texto. En cuanto un issue viva en otro repo (paso 7 de #836), una ficha no podría
 * nombrarlo ni un PR cerrarlo. Aquí se lee una vez:
 *
 *   #301                        → { repo: <repoPropio>, numero: 301 }
 *   pabloam89/homenu-panel#301  → { repo: "pabloam89/homenu-panel", numero: 301 }  si está en `repos`
 *   PabloAM89/Homenu-Panel#301  → { error }  (el texto exacto, con sus mayúsculas)
 *   otro/inventado#3            → { error }  (no es un repo de ops/entidades.json)
 *
 * En memoria una referencia es SIEMPRE `{ repo, numero }`, nunca un número suelto:
 * `#301` de este repo y `pabloam89/homenu-panel#301` son issues distintos
 * (`mismaReferencia`).
 *
 * `repoPropio` es un argumento de cada función: el repo donde vive el texto (en el CI,
 * GITHUB_REPOSITORY; en local y en la guardia, `REPO_LOCAL`). `repos` sale de
 * `reposDeProyectos` (scripts/lib/normas.mjs), el único lector de `projects[].repos`;
 * para los scripts, los dos juntos los da `referenciasLocales()` de scripts/lib/fondos.mjs.
 *
 * Vive en .claude/hooks/ y no en scripts/lib/ porque la guardia lo usa, y el grafo de la
 * guardia no sale de esta carpeta (eventos.test.js: una copia de los hooks sin scripts/lib
 * al lado tiene que seguir decidiendo). Es una hoja: no importa nada. Lo importan los
 * scripts como importan casos.mjs. Lo vigila scripts/referencias-issue.test.js, que además
 * barre scripts/ y .claude/hooks/ por si nace otra expresión de `Closes` o de rama → número.
 */

/** Número de issue más alto que se acepta (un número mayor no es de un issue). */
export const MAX_NUMERO = 10_000_000;

/**
 * El repo de esta copia: el `repoPropio` de la guardia y de los scripts en local (en el CI manda GITHUB_REPOSITORY).
 * Las funciones de abajo no lo usan: lo reciben. Era `REPO` de scripts/lib/fotoIssues.mjs, que ahora lo importa
 * de aquí; #835 lo saca a la ficha del proyecto con las demás constantes del repo.
 */
export const REPO_LOCAL = "pabloam89/MenuPlan";

/**
 * Número de issue de una rama (`ops/271-quien-lleva` → 271). La única regla de rama → número (#376, #856): la usan
 * la guardia, el CI (fondos-pr.mjs) y, por scripts/lib/lleva.mjs, el arranque, retirar, las zonas y los eventos.
 * Lo que va tras el guion da igual: `npm run tarea -- datos/0096-aplicada 438` crea `datos/438-0096-aplicada`, y
 * `ux/500-2-columnas` es del #500 (tras el guion hace falta un nombre: `ops/337-` no es de nadie). No son de un issue: un cero delante (el número de una migración,
 * `datos/0087-indices`), más de cinco cifras y una fecha `AAAA-MM` (`fix/2026-10-recetas`: un año 20xx y un mes de
 * 01 a 12). Se arregla aquí y no exigiéndolo en `tarea` (#856): así valen también las ramas que ya existen.
 */
export function numeroDeRama(rama) {
  const r = String(rama ?? "");
  if (/^[a-z]+\/20\d{2}-(?:0[1-9]|1[0-2])(?:-|$)/.test(r)) return null;
  const m = /^[a-z]+\/([1-9]\d{0,4})-[a-z0-9]/.exec(r);
  return m ? Number(m[1]) : null;
}

/**
 * `dueño/repo` tal como lo escribe GitHub: dueño de hasta 39 caracteres, repo de hasta 100. El nombre del repo no
 * empieza por punto ni lleva `..`: así no hay un `dueño/..` que, pegado a una URL de la API, suba de carpeta.
 */
const FUENTE_REPO = String.raw`[A-Za-z0-9-]{1,39}\/(?!\.)(?:(?!\.\.)[A-Za-z0-9._-]){1,100}`;

/**
 * La forma de una referencia en un texto, sin anclas ni grupos con nombre, para
 * construir otras expresiones (la línea `Casos:` de casos.mjs). Lee también un repo
 * que luego no vale: quien la usa pasa cada trozo por `leerReferencia`, que da el error.
 */
export const FUENTE_REFERENCIA = String.raw`(?:${FUENTE_REPO})?#\d{1,8}`;

const UNA = new RegExp(String.raw`^(?:(${FUENTE_REPO}))?#(\d{1,8})$`);

const reposDe = (repos) => (Array.isArray(repos) ? repos : Object.keys(repos ?? {}));

/**
 * Lee una referencia (`#n` o `dueño/repo#n`). → `{ repo, numero }` o `{ error }`.
 * `soloForma`: no mira si el repo es de `repos` (la guardia, que no lee ops/entidades.json: lo mira el CI).
 * Lanza si falta `repoPropio`: es un fallo de quien llama, no del texto.
 */
export function leerReferencia(texto, { repoPropio, repos = [], soloForma = false } = {}) {
  if (!repoPropio) throw new Error("leerReferencia: falta repoPropio (el repo donde vive el texto)");
  const t = String(texto ?? "").trim();
  const m = UNA.exec(t);
  if (!m) return { error: `«${t.slice(0, 60)}» no es una referencia a un issue (#n o dueño/repo#n)` };
  const repo = m[1] ?? repoPropio;
  if (!soloForma && repo !== repoPropio && !reposDe(repos).includes(repo)) {
    return { error: `«${repo.slice(0, 60)}» no es un repo de ops/entidades.json (projects[].repos, escrito exacto, con sus mayúsculas)` };
  }
  const numero = Number(m[2]);
  if (numero < 1 || numero > MAX_NUMERO) return { error: `#${m[2]} no es un número de issue (de 1 a ${MAX_NUMERO})` };
  return { repo, numero };
}

/** Cómo se escribe una referencia en un texto del repo `repoPropio`: `#n` si es suya, `dueño/repo#n` si no. */
export function escribirReferencia({ repo, numero }, repoPropio) {
  return repo === repoPropio ? `#${numero}` : `${repo}#${numero}`;
}

/** ¿Son el mismo issue? Repo Y número: `#301` de un repo no es el `#301` de otro. */
export function mismaReferencia(a, b) {
  return Boolean(a && b) && a.repo === b.repo && a.numero === b.numero;
}

/** El `dueño/repo` de un issue de la API REST, de su `repository_url` (`https://api.github.com/repos/<dueño>/<repo>`). */
export function repoDeIssue(issue) {
  const m = new RegExp(String.raw`^https:\/\/api\.github\.com\/repos\/(${FUENTE_REPO})$`).exec(String(issue?.repository_url ?? ""));
  return m ? m[1] : null;
}

/** Quita los comentarios HTML (la plantilla explica las líneas del PR) y los bloques de código. */
export function limpiarCuerpo(cuerpo) {
  return String(cuerpo ?? "")
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|$(?![\s\S]))/gm, "");
}

/**
 * La única forma de `Closes`: la palabra (close, closes, closed, fix, fixes, fixed,
 * resolve, resolves, resolved; con dos puntos opcionales), espacio o tabulador EN LA
 * MISMA LÍNEA y la referencia, sobre el texto sin comentarios ni bloques de código.
 * `Closes\n#193` no cuenta (lo más estricto: así la guardia y el CI dicen lo mismo).
 */
const CIERRE = new RegExp(String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?[ \t]+(${FUENTE_REFERENCIA})\b`, "gi");

/**
 * Las referencias que cierra un texto, sin repetir. → `[{ repo, numero } | { error, texto }]`:
 * un `Closes` a un repo que no vale sale como error (quien llama decide si falla o lo ignora).
 */
export function leerCierres(texto, opciones) {
  const vistas = [];
  const sal = [];
  for (const m of limpiarCuerpo(texto).matchAll(CIERRE)) {
    const r = leerReferencia(m[1], opciones);
    if (r.error) {
      sal.push({ error: r.error, texto: m[1].slice(0, 120) });
      continue;
    }
    if (vistas.some((v) => mismaReferencia(v, r))) continue;
    vistas.push(r);
    sal.push(r);
  }
  return sal;
}

/**
 * ¿Es una referencia a otro repo que el CI no ha podido leer? Solo un 404 (`issue` null: ghApi da null en un 404) de
 * un repo que no es el propio: no existe o el token del workflow no llega a ese repo (privado), y desde el CI no se
 * distingue. Un 403 (el límite de peticiones) o un 5xx no es esto: sigue el camino de error de la API («relanza»).
 * Decisión del orquestador en #856, a petición de `seguridad`: una referencia que no se ha podido comprobar FALLA;
 * si solo avisara, `Casos: dueño/repo#999999` pasaría el check sin que nadie mirase nada.
 */
export const sinAccesoAOtroRepo = (ref, refs, issue) => issue == null && ref.repo !== refs.repoPropio;

/** Por qué falla una referencia de `sinAccesoAOtroRepo` (la línea `Casos:` y el `Closes` del CI dicen lo mismo). */
export const SIN_ACCESO = "el CI no lo ha podido leer (la API da 404: no existe o el token del workflow no llega a ese repo). Una referencia a otro repo solo se podrá citar cuando el CI tenga acceso a ese repo";

/** El fallo entero: la referencia ya validada (nunca el texto del autor), escrita con `escribirReferencia`, y su porqué. */
export const motivoSinAcceso = (ref, repoPropio) => `${escribirReferencia(ref, repoPropio)}: ${SIN_ACCESO}`;
