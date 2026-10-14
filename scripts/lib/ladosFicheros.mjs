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
 * Ningún id de proyecto está escrito aquí (decisión de Pablo, 14 oct 2026: la casa escala a cualquier número de
 * proyectos): los ids salen de la lista única (`projects` de ops/entidades.json) y cada pieza vertical dice de cuál
 * con `project: <id>`. Una ficha es vertical por su ruta y la carpeta dice su proyecto: no se lista.
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

export const proyectoDeEntrada = (e) => (typeof e === "string" ? undefined : e?.project);

/**
 * Lado de un fichero según el registro: { lado, razon, project } o null si no está. Una ficha de proyecto no se lista:
 * es vertical y su proyecto es el de su carpeta.
 */
export function ladoDe(ruta, registro) {
  const ficha = ruta.match(FICHA);
  if (ficha) return { lado: "vertical", razon: "ficha de proyecto", project: ficha[1] };
  const capa = capaDe(ruta);
  const e = capa ? registro.capas?.[capa]?.[ruta] : undefined;
  return e === undefined ? null : { lado: ladoDeEntrada(e), razon: razonDeEntrada(e), project: proyectoDeEntrada(e) };
}

/** Las capas de una skill (referencias, técnicas…) que son datos de un proyecto: { ruta: id del proyecto } del registro. */
export const capasDelProyectoConId = (registro) => registro.capas_de_skill_del_proyecto ?? {};
export const capasDelProyecto = (registro) => Object.keys(capasDelProyectoConId(registro));

/** Carpeta de la skill a la que pertenece un fichero de `.claude/skills/<skill>/…` (null si no es de una skill). */
export const skillDe = (ruta) => ruta.match(/^\.claude\/skills\/([^/]+)\//)?.[1] ?? null;

/**
 * Los fallos del registro frente a los ficheros del repo. `ficheros`: rutas relativas con «/».
 * Cada fichero de una capa tiene entrada; ninguna entrada es de un fichero que no existe o de otra capa; el lado es
 * uno de los tres; una duda lleva razón con sentido; las capas del proyecto existen, viven en la carpeta de una skill
 * horizontal y no son SKILL.md; cada ficha de proyecto tiene su skill y es vertical.
 */
export function fallosDeRegistro(registro, ficheros, ids = null) {
  const fallos = [];
  const existen = new Set(ficheros);
  const capas = registro.capas ?? {};
  for (const c of Object.keys(capas)) if (!CAPAS_DE_LADOS.includes(c)) fallos.push(`capa «${c}» desconocida (valen: ${CAPAS_DE_LADOS.join(", ")})`);
  for (const f of ficheros) {
    const c = capaDe(f);
    if (c && !FICHA.test(f) && capas[c]?.[f] === undefined) fallos.push(`${f}: sin lado en ${RUTA_LADOS} (capa ${c})`);
  }
  for (const [c, lista] of Object.entries(capas)) {
    for (const [ruta, e] of Object.entries(lista)) {
      if (FICHA.test(ruta)) fallos.push(`${ruta}: una ficha de proyecto no se lista, es vertical por su ruta`);
      else if (!existen.has(ruta)) fallos.push(`${ruta}: está en ${RUTA_LADOS} y ya no existe`);
      else if (capaDe(ruta) !== c) fallos.push(`${ruta}: está en la capa «${c}» y es de «${capaDe(ruta)}»`);
      const lado = ladoDeEntrada(e);
      if (!LADOS.includes(lado)) fallos.push(`${ruta}: lado «${lado}» no válido (${LADOS.join(", ")})`);
      if (lado === "duda" && razonDeEntrada(e).length <= 15) fallos.push(`${ruta}: duda sin razón`);
      // El lado vertical dice de qué proyecto con `project` (un id de la lista única); lo demás no lleva proyecto.
      const proyecto = proyectoDeEntrada(e);
      if (lado === "vertical" && !proyecto) fallos.push(`${ruta}: vertical sin \`project\` (de qué proyecto es)`);
      if (lado !== "vertical" && proyecto) fallos.push(`${ruta}: lleva project «${proyecto}» y su lado es «${lado}»: solo lo vertical es de un proyecto`);
      if (proyecto && ids && !ids.includes(proyecto)) fallos.push(`${ruta}: project «${proyecto}» no está en la lista de proyectos (${ids.join(", ")})`);
    }
  }
  const lado = (r) => (capaDe(r) ? ladoDe(r, registro)?.lado : null);
  for (const [r, id] of Object.entries(capasDelProyectoConId(registro))) {
    const s = skillDe(r);
    if (ids && !ids.includes(id)) fallos.push(`${r}: capa del proyecto «${id}», que no está en la lista de proyectos (${ids.join(", ")})`);
    if (!existen.has(r)) fallos.push(`${r}: capa del proyecto que ya no existe`);
    else if (!s || r.endsWith("/SKILL.md") || r.endsWith("/casos.json")) fallos.push(`${r}: no es una capa (referencias, técnicas, scripts, plantillas) de una skill`);
    else if (lado(`.claude/skills/${s}/SKILL.md`) !== "horizontal") fallos.push(`${r}: la skill ${s} no es horizontal; sus ficheros ya son de su lado`);
  }
  for (const f of ficheros) {
    const m = f.match(FICHA);
    if (!m) continue;
    if (ids && !ids.includes(m[1])) fallos.push(`${f}: la carpeta «${m[1]}» no es un proyecto de la lista (${ids.join(", ")})`);
    if (!existen.has(`.claude/skills/${m[2]}/SKILL.md`)) fallos.push(`${f}: no hay skill «${m[2]}» a la que sirva`);
    else if (lado(`.claude/skills/${m[2]}/SKILL.md`) !== "horizontal") fallos.push(`${f}: la skill ${m[2]} no es horizontal; una ficha de proyecto sirve a una skill de la casa`);
  }
  return fallos;
}

/** Las skills de servicio (`tipo: servicio` en su SKILL.md) horizontales, por nombre. `leer(ruta)`: su texto. */
export function skillsDeServicio(registro, ficheros, leer) {
  return ficheros.filter((f) => capaDe(f) === "skills" && ladoDe(f, registro)?.lado === "horizontal")
    .filter((f) => /^\s{2}tipo:\s*servicio\s*$/m.test(leer(f))).map(skillDe).sort();
}

/**
 * Las fichas de servicio frente a la lista de proyectos (#710, escala): cada proyecto declara en `servicios` las skills de
 * servicio que usa y de cada una tiene su ficha `ops/proyectos/<id>/servicios/<skill>.md`; una ficha sin declarar, un servicio
 * declarado que no es una skill de servicio y una skill de servicio que ningún proyecto usa son fallos. `proyectos`: las
 * entradas de `projects`; `servicio`: nombres de skills de servicio (`skillsDeServicio`). Recorre TODOS los proyectos.
 */
export function fallosDeServicios(proyectos, ficheros, servicio) {
  const fallos = [];
  const ids = proyectos.map((p) => p.id);
  const existen = new Set(ficheros);
  for (const p of proyectos) {
    const decl = p.servicios ?? [];
    if (!Array.isArray(decl) || new Set(decl).size !== decl.length) { fallos.push(`proyecto ${p.id}: «servicios» es una lista sin repetidos`); continue; }
    for (const s of decl) {
      if (!servicio.includes(s)) fallos.push(`proyecto ${p.id}: declara el servicio «${s}», que no es una skill de servicio horizontal (${servicio.join(", ")})`);
      else if (!existen.has(`ops/proyectos/${p.id}/servicios/${s}.md`)) fallos.push(`proyecto ${p.id}: el servicio «${s}» no tiene su ficha ops/proyectos/${p.id}/servicios/${s}.md`);
    }
  }
  for (const f of ficheros) {
    const m = f.match(FICHA);
    if (!m) continue;
    const p = proyectos.find((x) => x.id === m[1]);
    if (!p) fallos.push(`${f}: la carpeta «${m[1]}» no es un proyecto de la lista (${ids.join(", ")})`);
    else if (!(p.servicios ?? []).includes(m[2])) fallos.push(`${f}: ficha sin servicio declarado: el proyecto ${m[1]} no lista «${m[2]}» en \`servicios\``);
  }
  for (const s of servicio) if (!proyectos.some((p) => (p.servicios ?? []).includes(s))) fallos.push(`skill de servicio «${s}»: ningún proyecto la usa (sin ficha en ninguno)`);
  return fallos;
}

/** Todas las rutas con lado vertical: las de las capas, las capas del proyecto de una skill y las fichas (de `ficheros`). */
export function verticales(registro, ficheros = []) {
  const v = new Set([...capasDelProyecto(registro), ...ficheros.filter((f) => FICHA.test(f))]);
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
  const v = verticales(registro, ficheros);
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
  const vert = [...verticales(registro, ficheros)].sort();
  const skillsV = skillsVerticales(registro);
  const citas = [];
  for (const f of ficherosHorizontales(registro, ficheros)) {
    const t = leer(f);
    for (const r of vert) if (r !== f && t.includes(r)) citas.push(`${f} → ${r}`);
    for (const s of skillsV) if (new RegExp("skills?\\s+`" + s + "`|skills/" + s + "/").test(t)) citas.push(`${f} → skill ${s}`);
  }
  return [...new Set(citas)].sort();
}
