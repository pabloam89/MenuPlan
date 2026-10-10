/**
 * El glosario del lenguaje de proceso (#469, fondo #455): una palabra, un
 * significado. El dato es `ops/glosario.json`; lo que ya incumplía al nacer, en
 * `ops/glosario-excepciones.json` (solo baja). Lo vigila `ops/glosario.test.js`
 * y lo enseña `npm run glosario` (`scripts/glosario.mjs`).
 *
 * El control es léxico: busca los sinónimos prohibidos de cada término, como
 * palabra completa y sin mayúsculas, en las zonas de su `aplica_a`. No ve el
 * mal uso de un término canónico (p. ej. «verificar» fuera del paso 8): eso es
 * del `revisor`.
 *
 * Lo que NO se mira, a propósito:
 *  - bloques de código, código en línea, comentarios HTML, URLs y rutas: son
 *    identificadores, no prosa (`git worktree`, `scripts/verificar-estado.mjs`).
 *    Una palabra pegada a «/» solo es ruta si lo parece: con extensión, empezando
 *    por «.», «/» o «~», o con más de una «/» («bug/fallo» sí se mira);
 *  - los bloques sangrados con 4 espacios tras una línea en blanco (código de
 *    Markdown), salvo que sigan a una lista, donde son su continuación;
 *  - lo que va entre comillas «»: es una mención o una cita (de Pablo, de una
 *    salida, de una línea del PR como «Runbook:»), no un uso de la palabra.
 *    Es un agujero aceptado: un sinónimo usado de verdad entre «» no se ve.
 *
 * Se compara sin tildes ni mayúsculas: «leccion» es «lección».
 *  - las secciones de historia («Lo que falló y por qué», «Registro de
 *    cambios»): cuentan lo que pasó con las palabras de entonces;
 *  - en un JSON, las claves y los campos de identificadores y rutas.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const RUTA_GLOSARIO = "ops/glosario.json";
export const RUTA_EXCEPCIONES = "ops/glosario-excepciones.json";

/** Clase de un término (vocabulario cerrado). */
export const CLASES = {
  accion: "Un verbo del proceso: lo que alguien o algo hace",
  estado: "Cómo está algo o qué gravedad tiene",
  artefacto: "Una cosa que existe en el repo o en GitHub: un fichero, un issue, un bloque",
  rol: "Quién hace algo: una persona, una sesión, un agente o un vigilante",
  campo: "Una clave de una ficha o de un catálogo, con su significado",
  lugar: "Dónde vive algo: una carpeta, una rama, un entorno",
};

/** Valor de `aplica_a` que vale por todas las zonas. */
export const TODAS = "todas";

/** Secciones de historia: no se miran. */
export const SECCIONES_DE_HISTORIA = ["Lo que falló y por qué", "Registro de cambios"];

/** En un JSON de una zona, campos que son identificadores o rutas, no prosa. */
export const CAMPOS_NO_PROSA = ["id", "fuentes", "origen", "ref", "test", "donde"];

/**
 * Ciclo de vida de un término (#481, fondo #479): un término no se borra ni se
 * reutiliza con otro significado. Se retira y dice a cuál pasa (`pasa_a`, un
 * término activo). El nombre de un retirado pasa a contar como sinónimo
 * prohibido de su `pasa_a` en las zonas de este (el control lo busca).
 */
export const ESTADOS_TERMINO = {
  activo: "Se usa: es la palabra canónica de su significado",
  retirado: "Ya no se usa: se dice su pasa_a; el nombre queda para que nadie lo reutilice",
};

export const CAMPOS_TERMINO = ["termino", "estado", "clase", "definicion", "sinonimos_prohibidos", "aplica_a"];
export const CAMPOS_TERMINO_OPCIONALES = ["pasa_a", "amplio", "estrecho", "relacionado", "ref", "nota"];

/**
 * Relaciones entre términos (#481), las de un tesauro (ISO 25964, SKOS): `amplio` es el
 * término genérico (uno, de la misma clase: «revisor» es un «juez»), `estrecho` sus
 * específicos y `relacionado` los que se citan juntos sin ser uno caso del otro. Todas
 * son referencias a términos activos que existen, y recíprocas: si A tiene amplio B,
 * B tiene A en estrecho; si A está relacionado con B, B con A.
 */
export const RELACIONES = {
  amplio: "El término genérico, de la misma clase: este es un caso de aquel",
  estrecho: "Los términos específicos: cada uno es un caso de este",
  relacionado: "Términos que se citan juntos sin ser uno caso del otro",
};

/**
 * Forma de la definición (ISO 704: género próximo + diferencia): «un/una X que Y».
 * Se comprueba con una heurística: empieza por artículo + sustantivo (o, en un verbo de
 * clase accion, por un infinitivo, que es su género) y contiene «que» como palabra.
 * No ve si el género es el bueno: eso es del revisor.
 */
export const ARTICULOS = ["un", "una", "el", "la", "los", "las"];
const NO_SUSTANTIVO = new Set(["que", "de", "del", "en", "con", "por", "para", "a", "y", "o", "se", "lo", "su", "sus"]);
/** Las definiciones que no tienen la forma: SOLO BAJA (el test la compara con su partida). Hoy, ninguna. */
export const EXCEPCIONES_FORMA = [];

/** Si la definición tiene la forma «un/una X que Y». Devuelve null si la tiene, o el motivo. */
export function faltaDeForma(t) {
  const d = String(t.definicion ?? "").trim();
  const [p1 = "", p2 = ""] = d.split(/\s+/).map((x) => x.replace(/[^\p{L}]/gu, "").toLowerCase());
  const conArticulo = ARTICULOS.includes(p1) && p2.length > 1 && !NO_SUSTANTIVO.has(p2);
  const infinitivo = t.clase === "accion" && /^\p{L}+(ar|er|ir)$/u.test(p1);
  if (!conArticulo && !infinitivo) return t.clase === "accion" ? "no empieza por un infinitivo ni por artículo + sustantivo" : "no empieza por artículo + sustantivo («un/una X»)";
  if (!/(?<!\p{L})que(?!\p{L})/iu.test(d)) return "no dice la diferencia con «que …»";
  return null;
}

const activo = (t) => t.estado !== "retirado";

/** Los términos activos. */
export const activos = (g) => (g.terminos ?? []).filter(activo);
/** Una definición es una sola idea corta. */
export const MAX_DEFINICION = 220;

export function leerGlosario(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_GLOSARIO), "utf8"));
}

export function leerExcepciones(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_EXCEPCIONES), "utf8")).excepciones;
}

const normal = (s) => String(s).toLowerCase().normalize("NFC");
/** Sin tildes ni mayúsculas: la forma en que se compara. */
export const plano = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Expresión de una palabra completa: ni letras, ni cifras, ni `_` ni `-` a los lados (así `auditor-datos` no es `auditor`). */
export function patronDe(palabra) {
  const cuerpo = escapar(plano(palabra)).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${cuerpo}(?![\\p{L}\\p{N}_-])`, "giu");
}

/** Lo que no se dice de un término: sus sinónimos y, si está retirado, también su nombre. */
export const prohibidosDe = (t) => (activo(t) ? t.sinonimos_prohibidos ?? [] : [normal(t.termino), ...(t.sinonimos_prohibidos ?? [])]);

/** Sinónimo (o nombre retirado) → término canónico. Un retirado manda a su pasa_a. */
export function canonicoDe(glosario) {
  const m = new Map();
  for (const t of glosario.terminos) for (const s of prohibidosDe(t)) m.set(normal(s), activo(t) ? t.termino : t.pasa_a);
  return m;
}
/** Comprueba la forma del glosario. Devuelve una lista de problemas en texto (vacía si está bien). */
export function problemasDeGlosario(g, { existe = () => true, leer = () => null } = {}) {
  const p = [];
  const zonas = Object.keys(g.zonas ?? {});
  if (zonas.length === 0) p.push("zonas: no hay ninguna");
  for (const [z, pats] of Object.entries(g.zonas ?? {})) {
    if (!Array.isArray(pats) || pats.length === 0) p.push(`zona ${z}: sin rutas`);
  }
  const terminos = g.terminos ?? [];
  if (terminos.length === 0) p.push("terminos: no hay ninguno");
  const canonicos = new Set(terminos.map((t) => plano(t.termino)));
  const nombresActivos = new Set(terminos.filter(activo).map((t) => t.termino));
  const vistos = new Map();
  const sinonimoDe = new Map();
  for (const t of terminos) {
    const id = t.termino ?? "(sin término)";
    for (const c of CAMPOS_TERMINO) if (!(c in t)) p.push(`${id}: falta ${c}`);
    for (const c of Object.keys(t)) if (![...CAMPOS_TERMINO, ...CAMPOS_TERMINO_OPCIONALES].includes(c)) p.push(`${id}: campo desconocido ${c}`);
    if (vistos.has(normal(id))) p.push(`${id}: término repetido`);
    vistos.set(normal(id), true);
    if ("estado" in t && !(t.estado in ESTADOS_TERMINO)) p.push(`${id}: estado «${t.estado}» fuera del vocabulario (${Object.keys(ESTADOS_TERMINO).join(", ")})`);
    if (t.estado === "retirado") {
      if (!t.pasa_a) p.push(`${id}: retirado sin pasa_a (di a qué término activo pasa)`);
      else if (!nombresActivos.has(t.pasa_a)) p.push(`${id}: pasa_a «${t.pasa_a}», que no es un término activo`);
    } else if ("pasa_a" in t) p.push(`${id}: pasa_a solo va en un término retirado`);
    if (!(t.clase in CLASES)) p.push(`${id}: clase «${t.clase}» fuera del vocabulario (${Object.keys(CLASES).join(", ")})`);
    if (typeof t.definicion !== "string" || t.definicion.trim().length < 10) p.push(`${id}: definición vacía`);
    else if (t.definicion.length > MAX_DEFINICION) p.push(`${id}: definición de ${t.definicion.length} caracteres (máximo ${MAX_DEFINICION})`);
    if (!Array.isArray(t.sinonimos_prohibidos)) p.push(`${id}: sinonimos_prohibidos no es una lista`);
    for (const s of t.sinonimos_prohibidos ?? []) {
      const n = plano(s);
      if (normal(s) !== s) p.push(`${id}: el sinónimo «${s}» va en minúsculas`);
      if (canonicos.has(n)) p.push(`${id}: «${s}» es sinónimo prohibido y también término canónico`);
      if (sinonimoDe.has(n)) p.push(`${id}: «${s}» ya es sinónimo prohibido de ${sinonimoDe.get(n)}`);
      sinonimoDe.set(n, id);
    }
    if (!Array.isArray(t.aplica_a) || t.aplica_a.length === 0) p.push(`${id}: aplica_a vacío`);
    for (const z of t.aplica_a ?? []) if (z !== TODAS && !zonas.includes(z)) p.push(`${id}: la zona «${z}» no existe`);
    if (t.ref !== undefined) {
      const { fichero, clave } = t.ref ?? {};
      if (!fichero || !clave) p.push(`${id}: ref sin fichero o sin clave`);
      else if (!existe(fichero)) p.push(`${id}: ref a ${fichero}, que no existe`);
      else {
        const texto = leer(fichero);
        if (texto != null) for (const parte of clave.split(".")) if (!texto.includes(parte)) p.push(`${id}: ref ${fichero} no contiene «${parte}»`);
      }
    }
  }
  p.push(...problemasDeRelaciones(terminos));
  for (const t of terminos) {
    const falta = faltaDeForma(t);
    if (falta && !EXCEPCIONES_FORMA.includes(t.termino)) p.push(`${t.termino}: la definición ${falta} (ISO 704: «un/una X que Y»)`);
  }
  // El glosario se cumple a sí mismo: ninguna definición usa un sinónimo prohibido ni un término retirado.
  const prohibidos = canonicoDe({ terminos });
  for (const t of terminos) {
    for (const [s, canon] of prohibidos) {
      if (patronDe(s).test(plano(limpiarProsa(String(t.definicion ?? ""))))) p.push(`${t.termino}: su definición usa «${s}» (di «${canon}»)`);
    }
  }
  return p;
}

/** Las relaciones: referencias a términos activos, recíprocas, de la misma clase en amplio y sin ciclos. */
export function problemasDeRelaciones(terminos) {
  const p = [];
  const por = new Map(terminos.map((t) => [t.termino, t]));
  const vivo = (n) => por.has(n) && activo(por.get(n));
  for (const t of terminos) {
    const id = t.termino;
    if ("amplio" in t && typeof t.amplio !== "string") p.push(`${id}: amplio es un término, no una lista`);
    for (const c of ["estrecho", "relacionado"]) if (c in t && (!Array.isArray(t[c]) || t[c].length === 0)) p.push(`${id}: ${c} es una lista no vacía`);
    const refs = [...(typeof t.amplio === "string" ? [["amplio", t.amplio]] : []), ...["estrecho", "relacionado"].flatMap((c) => (Array.isArray(t[c]) ? t[c].map((x) => [c, x]) : []))];
    for (const [c, x] of refs) {
      if (x === id) p.push(`${id}: ${c} apunta a sí mismo`);
      else if (!vivo(x)) p.push(`${id}: ${c} «${x}», que no es un término activo`);
    }
    if (!activo(t) && refs.length) p.push(`${id}: un retirado no lleva relaciones (van en su pasa_a)`);
    if (typeof t.amplio === "string" && vivo(t.amplio)) {
      const a = por.get(t.amplio);
      if (a.clase !== t.clase) p.push(`${id}: amplio «${t.amplio}» es de clase ${a.clase} y este de ${t.clase}`);
      if (!(a.estrecho ?? []).includes(id)) p.push(`${id}: amplio «${t.amplio}», pero ${t.amplio} no lo tiene en estrecho`);
    }
    for (const x of Array.isArray(t.estrecho) ? t.estrecho : []) if (vivo(x) && por.get(x).amplio !== id) p.push(`${id}: estrecho «${x}», pero el amplio de ${x} no es ${id}`);
    for (const x of Array.isArray(t.relacionado) ? t.relacionado : []) {
      if (vivo(x) && !(por.get(x).relacionado ?? []).includes(id)) p.push(`${id}: relacionado con «${x}», pero ${x} no lo tiene en relacionado`);
      if (x === t.amplio || (t.estrecho ?? []).includes(x)) p.push(`${id}: «${x}» es amplio o estrecho y también relacionado`);
    }
    // Sin ciclos en amplio.
    const vistos = new Set([id]);
    for (let a = t.amplio; typeof a === "string" && por.has(a); a = por.get(a).amplio) {
      if (vistos.has(a)) { p.push(`${id}: ciclo en amplio (${[...vistos, a].join(" → ")})`); break; }
      vistos.add(a);
    }
  }
  return p;
}

/** Cuántos términos tienen alguna relación, y cuántas definiciones no tienen la forma. */
export function cifrasDeForma(g) {
  const ts = activos(g);
  return {
    terminos: ts.length,
    con_relaciones: ts.filter((t) => t.amplio || t.estrecho?.length || t.relacionado?.length).length,
    sin_forma: ts.filter((t) => faltaDeForma(t)).length,
    excepciones_forma: EXCEPCIONES_FORMA.length,
  };
}

const enBlanco = (s) => s.replace(/[^\n]/g, " ");

/**
 * Deja en blanco lo que no es prosa (sin mover las líneas): código en línea,
 * comentarios HTML, URLs, rutas y lo que va entre «».
 */
export function limpiarProsa(texto) {
  return texto
    .replace(/<!--[\s\S]*?-->/g, enBlanco)
    .replace(/`[^`\n]*`/g, enBlanco)
    .replace(/https?:\/\/\S+/g, enBlanco)
    .replace(/«[^»]{0,600}»/g, enBlanco)
    .replace(/[^\s«»()`"'[\]|]*[/\\][^\s«»()`"'[\]|]*/g, (m) => (pareceRuta(m) ? enBlanco(m) : m));
}

/** Una palabra con «/» es ruta si tiene extensión, empieza por «.», «/» o «~», o tiene más de una barra. */
export function pareceRuta(token) {
  const t = token.replace(/[.,;:)]+$/, "");
  return /^[.~/\\]/.test(t) || /\.[A-Za-z0-9]{1,6}(?=[/\\]|$)/.test(t) || (t.match(/[/\\]/g) ?? []).length > 1;
}

/** Un Markdown sin bloques de código ni secciones de historia, y con `limpiarProsa`. */
export function prosaDeMarkdown(md) {
  const lineas = md.replace(/\r\n/g, "\n").split("\n");
  const fuera = [];
  let valla = null;
  let historia = null; // nivel de la cabecera de historia abierta
  let sangrado = false; // dentro de un bloque de código sangrado
  let previa = ""; // la línea anterior
  let antesDelBlanco = ""; // la última línea con texto antes de la anterior
  const esLista = (x) => /^\s*([-*+]|\d+[.)])\s/.test(x) || /^( {2,}|\t)\S/.test(x);
  for (const l of lineas) {
    const anterior = previa;
    const contexto = antesDelBlanco;
    previa = l;
    if (anterior.trim() !== "") antesDelBlanco = anterior;
    const esSangrada = /^( {4}|\t)/.test(l);
    if (!valla && sangrado) {
      if (esSangrada || l.trim() === "") { fuera.push(""); continue; }
      sangrado = false;
    }
    if (!valla && esSangrada && anterior.trim() === "" && !esLista(contexto)) {
      sangrado = true;
      fuera.push("");
      continue;
    }
    const v = /^\s*(```|~~~)/.exec(l);
    if (valla) {
      fuera.push("");
      if (v && v[1] === valla) valla = null;
      continue;
    }
    if (v) { valla = v[1]; fuera.push(""); continue; }
    const cab = /^(#{1,6})\s+(.*)$/.exec(l);
    if (cab) {
      const nivel = cab[1].length;
      if (historia !== null && nivel <= historia) historia = null;
      if (historia === null && SECCIONES_DE_HISTORIA.some((s) => cab[2].trim().startsWith(s))) historia = nivel;
    }
    fuera.push(historia !== null ? "" : l);
  }
  return limpiarProsa(fuera.join("\n"));
}

/** Los textos de un JSON que son prosa: [{ donde, texto }], sin claves ni campos de CAMPOS_NO_PROSA. */
export function prosaDeJson(texto) {
  const salida = [];
  const andar = (v, donde, clave) => {
    if (typeof v === "string") { if (!CAMPOS_NO_PROSA.includes(clave)) salida.push({ donde, texto: limpiarProsa(v) }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => andar(x, `${donde}[${i}]`, clave)); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) andar(x, donde ? `${donde}.${k}` : k, k);
  };
  andar(JSON.parse(texto), "", "");
  return salida;
}

/** Busca los sinónimos en un texto ya limpio. Devuelve [{ sinonimo, donde }]. */
export function apariciones(trozos, sinonimos) {
  const r = [];
  for (const { donde, texto: original } of trozos) {
    const texto = plano(original);
    for (const s of sinonimos) {
      const re = patronDe(s);
      let m;
      while ((m = re.exec(texto)) !== null) {
        const linea = typeof donde === "number" ? donde + texto.slice(0, m.index).split("\n").length - 1 : donde;
        r.push({ sinonimo: s, donde: linea });
      }
    }
  }
  return r;
}

/** Ficheros de una ruta con comodines sencillos: `a/**\/*.md`, `a/*.md` o un fichero. */
export function ficherosDe(raiz, patron) {
  if (!patron.includes("*")) return existsSync(join(raiz, patron)) ? [patron] : [];
  const corte = patron.lastIndexOf("/", patron.indexOf("*"));
  const base = patron.slice(0, corte);
  const resto = patron.slice(corte + 1);
  const recursivo = resto.startsWith("**/");
  const ext = resto.replace(/^\*\*\//, "").replace(/^\*/, "");
  const fuera = [];
  const andar = (dir) => {
    if (!existsSync(dir)) return;
    for (const n of readdirSync(dir)) {
      const ruta = join(dir, n);
      if (statSync(ruta).isDirectory()) { if (recursivo) andar(ruta); continue; }
      if (n.endsWith(ext)) fuera.push(relative(raiz, ruta).split(sep).join("/"));
    }
  };
  andar(join(raiz, base));
  return fuera.sort();
}

/** Las zonas de un término, como lista de ids. */
const zonasDe = (t, g) => (t.aplica_a.includes(TODAS) ? Object.keys(g.zonas) : t.aplica_a);

/**
 * Mide el repo: { medida: { ruta: { sinonimo: n } }, detalle: [{ ruta, sinonimo, canonico, donde }] }.
 * `leer(ruta)` permite medir textos de mentira en los tests.
 */
export function medir(raiz, g, { leer = (r) => readFileSync(join(raiz, r), "utf8"), ficheros: listar = (p) => ficherosDe(raiz, p) } = {}) {
  const canon = canonicoDe(g);
  const cache = new Map();
  const ficheros = (p) => { if (!cache.has(p)) cache.set(p, listar(p)); return cache.get(p); };
  const sinonimosPorRuta = new Map();
  for (const t of g.terminos) {
    for (const z of zonasDe(t, g)) {
      for (const p of g.zonas[z]) {
        for (const ruta of ficheros(p)) {
          if (!sinonimosPorRuta.has(ruta)) sinonimosPorRuta.set(ruta, new Set());
          for (const s of prohibidosDe(t)) sinonimosPorRuta.get(ruta).add(normal(s));
        }
      }
    }
  }
  const medida = {};
  const detalle = [];
  for (const [ruta, sins] of [...sinonimosPorRuta].sort(([a], [b]) => a.localeCompare(b))) {
    if (sins.size === 0) continue;
    const texto = leer(ruta);
    const trozos = ruta.endsWith(".json") ? prosaDeJson(texto) : [{ donde: 1, texto: prosaDeMarkdown(texto) }];
    for (const a of apariciones(trozos, [...sins])) {
      medida[ruta] ??= {};
      medida[ruta][a.sinonimo] = (medida[ruta][a.sinonimo] ?? 0) + 1;
      detalle.push({ ruta, sinonimo: a.sinonimo, canonico: canon.get(a.sinonimo), donde: a.donde });
    }
  }
  return { medida, detalle };
}

/** Compara la medida con las excepciones: lo que sube (nuevo) y lo que ya bajó (hay que quitarlo de la lista). */
export function comparar(medida, excepciones) {
  const nuevas = [];
  const bajadas = [];
  const rutas = new Set([...Object.keys(medida), ...Object.keys(excepciones)]);
  for (const ruta of [...rutas].sort()) {
    const m = medida[ruta] ?? {};
    const e = excepciones[ruta] ?? {};
    for (const s of new Set([...Object.keys(m), ...Object.keys(e)])) {
      const hay = m[s] ?? 0;
      const admitidas = e[s] ?? 0;
      if (hay > admitidas) nuevas.push({ ruta, sinonimo: s, hay, admitidas });
      else if (hay < admitidas) bajadas.push({ ruta, sinonimo: s, hay, admitidas });
    }
  }
  return { nuevas, bajadas };
}

/**
 * El trinquete por par: cada par «ruta: sinónimo» de la lista tiene que estar en
 * la partida y con una cifra igual o menor. Devuelve los pares que la pasan.
 * Así no vale subir un par a cambio de bajar otro.
 */
export function sobrePartida(excepciones, partida) {
  const fuera = [];
  for (const [ruta, x] of Object.entries(excepciones)) {
    for (const [s, n] of Object.entries(x)) {
      const par = `${ruta}: ${s}`;
      if (!(par in partida)) fuera.push(`${par}: no está en la partida`);
      else if (n > partida[par]) fuera.push(`${par}: ${n} sobre ${partida[par]} de partida`);
    }
  }
  return fuera;
}

/** Suma de una tabla { ruta: { sinonimo: n } }. */
export const total = (tabla) => Object.values(tabla).reduce((a, x) => a + Object.values(x).reduce((b, n) => b + n, 0), 0);
/** Cuántos pares (ruta, sinónimo) tiene. */
export const pares = (tabla) => Object.values(tabla).reduce((a, x) => a + Object.keys(x).length, 0);

/** Excepciones por término canónico: { termino: n }. */
export function excepcionesPorTermino(g, excepciones) {
  const canon = canonicoDe(g);
  const r = Object.fromEntries(g.terminos.map((t) => [t.termino, 0]));
  for (const x of Object.values(excepciones)) for (const [s, n] of Object.entries(x)) r[canon.get(s) ?? s] = (r[canon.get(s) ?? s] ?? 0) + n;
  return r;
}

/** Excepciones por zona: { zona: n }. Una ruta cuenta en la primera zona que la incluye. */
export function excepcionesPorZona(g, excepciones, { ficheros }) {
  const zonaDe = new Map();
  for (const [z, pats] of Object.entries(g.zonas)) for (const p of pats) for (const r of ficheros(p)) if (!zonaDe.has(r)) zonaDe.set(r, z);
  const r = {};
  for (const [ruta, x] of Object.entries(excepciones)) {
    const z = zonaDe.get(ruta) ?? "(fuera de zona)";
    r[z] = (r[z] ?? 0) + Object.values(x).reduce((a, n) => a + n, 0);
  }
  return r;
}

/** Texto de un término para `npm run glosario -- <término>`. */
export function textoTermino(t, g, excepciones) {
  const n = excepcionesPorTermino(g, excepciones)[t.termino] ?? 0;
  const l = [`${t.termino} (${t.clase}${t.estado === "retirado" ? `, retirado: di «${t.pasa_a}»` : ""}): ${t.definicion}`];
  if (t.sinonimos_prohibidos.length) l.push(`  no se dice: ${t.sinonimos_prohibidos.join(", ")}`);
  const rel = ["amplio", "estrecho", "relacionado"].filter((k) => t[k]).map((k) => `${k}: ${[t[k]].flat().join(", ")}`);
  if (rel.length) l.push(`  ${rel.join("; ")}`);
  if (t.nota) l.push(`  nota: ${t.nota}`);
  if (t.ref) l.push(`  ref: ${t.ref.fichero} (${t.ref.clave})`);
  l.push(`  aplica a: ${t.aplica_a.join(", ")}`);
  l.push(`  excepciones: ${n}`);
  return l.join("\n");
}

/**
 * El ciclo de vida contra una referencia (origin/staging, #481): ningún término de la
 * referencia desaparece (se retira con su pasa_a) y ninguno retirado allí vuelve a
 * activo (sería reutilizar su nombre con otro significado). `ref` es el glosario de la
 * referencia, o una lista de nombres fijada en el test cuando no hay git.
 */
export function problemasDeVidaGlosario(actual, ref) {
  const p = [];
  const ahora = new Map((actual.terminos ?? []).map((t) => [plano(t.termino), t]));
  const antes = Array.isArray(ref) ? ref.map((termino) => ({ termino, estado: "activo" })) : ref.terminos ?? [];
  for (const t of antes) {
    const x = ahora.get(plano(t.termino));
    if (!x) p.push(`${t.termino}: estaba en el glosario y ha desaparecido; no se borra: estado «retirado» y pasa_a`);
    else if (t.estado === "retirado" && x.estado !== "retirado") p.push(`${t.termino}: estaba retirado y vuelve a activo; un nombre retirado no se reutiliza (usa otro término)`);
  }
  return p;
}
