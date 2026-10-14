/**
 * ladosFicheros.mjs — el lado de cada skill, regla por carpeta, comando, spec y documento (#710, PR 8 del programa
 * #652). Horizontal: vale para cualquier proyecto (la casa). Vertical: solo vale para HoMenu. Duda: no se puede
 * decidir con lo que hay, y se dice por qué.
 *
 * Antes el lado de estas capas se deducía de la zona de ops/zonas.json (factoría / producto / mixto). Una zona no es
 * un lado, así que ahora cada fichero lo lleva escrito en el registro `ops/lados-ficheros.json` (el campo de los
 * registros de datos, aquí en uno solo porque son ficheros de texto sin cabecera de campos). Lo vigila
 * ops/lados-ficheros.test.js con las funciones puras de este módulo:
 *  - todo fichero de una capa tiene su lado, y no sobra ninguna entrada (`fallosDeRegistro`);
 *  - ninguna pieza horizontal cita una vertical (`citasDeHorizontalAVertical`);
 *  - una skill de servicio es horizontal (el método) y sus datos del proyecto viven en una ficha vertical
 *    (`ops/proyectos/<id>/servicios/<skill>.md`), que el agente recibe por referencia (`--proyecto`).
 * Puro salvo `cargarLados`, que lee el registro.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const RUTA_LADOS = "ops/lados-ficheros.json";
export const LADOS = ["horizontal", "vertical", "duda"];
export const CAPAS_DE_LADOS = ["skills", "reglas", "comandos", "specs", "documentos"];

/** Ficha de proyecto de una skill de servicio: ops/proyectos/<id>/servicios/<skill>.md */
export const FICHA = /^ops\/proyectos\/([^/]+)\/servicios\/([^/]+)\.md$/;

/** A qué capa pertenece un fichero del repo (null si a ninguna de las que llevan lado). */
export function capaDe(ruta) {
  if (/^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(ruta)) return "skills";
  if (/^\.claude\/rules\/[^/]+\.md$/.test(ruta)) return "reglas";
  if (/^\.claude\/commands\/[^/]+\.md$/.test(ruta)) return "comandos";
  if (/^specs\/.+\.md$/.test(ruta)) return "specs";
  if (/^docs\/.+\.md$/.test(ruta) || /^[^/]+\.md$/.test(ruta) || FICHA.test(ruta)) return "documentos";
  return null;
}

/** El valor de una entrada es «horizontal», «vertical» o { lado, razon }. */
export const ladoDeEntrada = (e) => (typeof e === "string" ? e : e?.lado);
export const razonDeEntrada = (e) => (typeof e === "string" ? "" : String(e?.razon ?? ""));

export function cargarLados(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_LADOS), "utf8"));
}

/** Lado de un fichero según el registro: { lado, razon } o null si no está. */
export function ladoDe(ruta, registro) {
  const capa = capaDe(ruta);
  const e = capa ? registro.capas?.[capa]?.[ruta] : undefined;
  return e === undefined ? null : { lado: ladoDeEntrada(e), razon: razonDeEntrada(e) };
}

/** Las capas de una skill (referencias, técnicas…) que son datos del proyecto: lista del registro. */
export const capasDelProyecto = (registro) => registro.capas_de_skill_del_proyecto ?? [];

/** Carpeta de la skill a la que pertenece un fichero de `.claude/skills/<skill>/…` (null si no es de una skill). */
export const skillDe = (ruta) => ruta.match(/^\.claude\/skills\/([^/]+)\//)?.[1] ?? null;

/**
 * Los fallos del registro frente a los ficheros del repo. `ficheros`: rutas relativas con «/».
 * Cada fichero de una capa tiene entrada; ninguna entrada es de un fichero que no existe o de otra capa; el lado es
 * uno de los tres; una duda lleva razón con sentido; las capas del proyecto existen, viven en la carpeta de una skill
 * horizontal y no son SKILL.md; cada ficha de proyecto tiene su skill y es vertical.
 */
export function fallosDeRegistro(registro, ficheros) {
  const fallos = [];
  const existen = new Set(ficheros);
  const capas = registro.capas ?? {};
  for (const c of Object.keys(capas)) if (!CAPAS_DE_LADOS.includes(c)) fallos.push(`capa «${c}» desconocida (valen: ${CAPAS_DE_LADOS.join(", ")})`);
  for (const f of ficheros) {
    const c = capaDe(f);
    if (c && capas[c]?.[f] === undefined) fallos.push(`${f}: sin lado en ${RUTA_LADOS} (capa ${c})`);
  }
  for (const [c, lista] of Object.entries(capas)) {
    for (const [ruta, e] of Object.entries(lista)) {
      if (!existen.has(ruta)) fallos.push(`${ruta}: está en ${RUTA_LADOS} y ya no existe`);
      else if (capaDe(ruta) !== c) fallos.push(`${ruta}: está en la capa «${c}» y es de «${capaDe(ruta)}»`);
      const lado = ladoDeEntrada(e);
      if (!LADOS.includes(lado)) fallos.push(`${ruta}: lado «${lado}» no válido (${LADOS.join(", ")})`);
      if (lado === "duda" && razonDeEntrada(e).length <= 15) fallos.push(`${ruta}: duda sin razón`);
    }
  }
  const lado = (r) => (capaDe(r) ? ladoDe(r, registro)?.lado : null);
  for (const r of capasDelProyecto(registro)) {
    const s = skillDe(r);
    if (!existen.has(r)) fallos.push(`${r}: capa del proyecto que ya no existe`);
    else if (!s || r.endsWith("/SKILL.md") || r.endsWith("/casos.json")) fallos.push(`${r}: no es una capa (referencias, técnicas, scripts, plantillas) de una skill`);
    else if (lado(`.claude/skills/${s}/SKILL.md`) !== "horizontal") fallos.push(`${r}: la skill ${s} no es horizontal; sus ficheros ya son de su lado`);
  }
  for (const f of ficheros) {
    const m = f.match(FICHA);
    if (!m) continue;
    if (lado(f) !== "vertical") fallos.push(`${f}: una ficha de proyecto es vertical`);
    if (!existen.has(`.claude/skills/${m[2]}/SKILL.md`)) fallos.push(`${f}: no hay skill «${m[2]}» a la que sirva`);
    else if (lado(`.claude/skills/${m[2]}/SKILL.md`) !== "horizontal") fallos.push(`${f}: la skill ${m[2]} no es horizontal; una ficha de proyecto sirve a una skill de la casa`);
  }
  return fallos;
}

/** Todas las rutas con lado vertical: las de las capas, las capas del proyecto de una skill y las fichas. */
export function verticales(registro) {
  const v = new Set(capasDelProyecto(registro));
  for (const lista of Object.values(registro.capas ?? {})) for (const [r, e] of Object.entries(lista)) if (ladoDeEntrada(e) === "vertical") v.add(r);
  return v;
}

/** Los nombres de las skills verticales (se citan como «skill `telegram`»). */
export function skillsVerticales(registro) {
  return Object.entries(registro.capas?.skills ?? {}).filter(([, e]) => ladoDeEntrada(e) === "vertical").map(([r]) => skillDe(r));
}

/**
 * Qué ficheros son horizontales: los de las capas con lado horizontal y, de cada skill horizontal, su SKILL.md y
 * sus capas (menos las del proyecto). `ficheros`: rutas del repo; `leer(ruta)`: su texto.
 */
export function ficherosHorizontales(registro, ficheros) {
  const v = verticales(registro);
  const skillsH = new Set(Object.entries(registro.capas?.skills ?? {}).filter(([, e]) => ladoDeEntrada(e) === "horizontal").map(([r]) => skillDe(r)));
  return ficheros.filter((f) => {
    const c = capaDe(f);
    if (c) return ladoDe(f, registro)?.lado === "horizontal";
    const s = skillDe(f);
    return !!s && skillsH.has(s) && !v.has(f) && /\.md$/.test(f);
  });
}

/**
 * Citas de una pieza horizontal a una vertical: la ruta de un fichero vertical en su texto, o «skill `x`» de una
 * skill vertical. Devuelve una cadena «fichero → citado» por cita (sin repetir), ordenada.
 */
export function citasDeHorizontalAVertical(registro, ficheros, leer) {
  const vert = [...verticales(registro)].sort();
  const skillsV = skillsVerticales(registro);
  const citas = [];
  for (const f of ficherosHorizontales(registro, ficheros)) {
    const t = leer(f);
    for (const r of vert) if (r !== f && t.includes(r)) citas.push(`${f} → ${r}`);
    for (const s of skillsV) if (new RegExp("skills?\\s+`" + s + "`|skills/" + s + "/").test(t)) citas.push(`${f} → skill ${s}`);
  }
  return [...new Set(citas)].sort();
}
