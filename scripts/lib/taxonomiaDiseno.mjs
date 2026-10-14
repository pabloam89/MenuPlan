/**
 * Taxonomía de diseño (#776, línea 1 de #774): tres vocabularios cerrados (tipos de pantalla, de elemento de interfaz y
 * de flujo) en `ops/diseno/taxonomia.json`, junto a los bloques N1 de `ops/diseno/bloques.json`.
 *
 * Cada tipo es una fila con `id` (inglés en kebab, #566), `grupo`, `plataforma`, `perfil` (los perfiles N2 de
 * `ops/diseno/bloques.json` que lo usan) y su popularidad como dato (`ejemplos_mobile` y `ejemplos_web`, con la fecha
 * de la captura en `captura.fecha`). El nombre en castellano y el «para qué sirve» NO están aquí: viven en el glosario,
 * en un término de clase `tipo` y dominio `diseno` cuyo `en` es el `id` del tipo (el vínculo va en los dos sentidos:
 * un tipo sin término falla, y un término de tipo sin fila también). Una cosa, un sitio.
 *
 * Lo leen `ops/diseno/taxonomia.test.js` (que lo comprueba con todo lo demás), `scripts/diseno/taxonomia.mjs`
 * (las cifras) y `scripts/lib/vocabulariosVida.mjs` (el ciclo de vida de cada vocabulario). Puro: sin red.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const RUTA_TAXONOMIA = "ops/diseno/taxonomia.json";

/** Los tres vocabularios: clave del fichero, nombre en singular, y la entidad que clasifican (`ops/entidades.json`). */
export const VOCABULARIOS_DE_TIPOS = {
  pantallas: { singular: "pantalla", entidad: "pattern" },
  elementos: { singular: "elemento", entidad: "component" },
  flujos: { singular: "flujo", entidad: "pattern" },
};

export const CAMPOS_DE_TIPO = ["id", "grupo", "plataforma", "perfil", "ejemplos_mobile", "ejemplos_web"];
export const PLATAFORMAS = ["mobile", "web", "both"];
const FORMA_ID = /^[a-z]+(-[a-z]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const entero = (v) => Number.isInteger(v) && v > 0;

export const leerTaxonomia = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_TAXONOMIA), "utf8"));
export const leerPerfiles = (raiz) => Object.keys(JSON.parse(readFileSync(join(raiz, "ops/diseno/bloques.json"), "utf8")).perfiles);

/** Todas las filas de tipo, con el vocabulario al que pertenecen. */
export const tiposDe = (datos) => Object.keys(VOCABULARIOS_DE_TIPOS).flatMap((v) => (datos?.[v] ?? []).map((t) => ({ ...t, vocabulario: v })));

/**
 * Los problemas de la taxonomía contra el glosario y los perfiles (lista de textos; vacía si está bien).
 * `glosario`: { terminos } como lo da `leerGlosario`; `perfiles`: los ids de perfil de bloques.json.
 */
export function problemasDeTaxonomia(datos, glosario, perfiles) {
  const p = [];
  if (!FECHA.test(datos?.captura?.fecha ?? "") || Number.isNaN(Date.parse(`${datos.captura.fecha}T00:00:00Z`))) p.push("captura.fecha: falta o no es AAAA-MM-DD");
  if (typeof datos?.captura?.fuente !== "string" || !datos.captura.fuente.trim()) p.push("captura.fuente: vacía");
  if (JSON.stringify(Object.keys(datos?.plataformas ?? {})) !== JSON.stringify(PLATAFORMAS)) p.push(`plataformas: deben ser ${PLATAFORMAS.join(", ")}, en ese orden`);
  for (const [k, v] of Object.entries(datos?.plataformas ?? {})) if (typeof v !== "string" || !v.trim()) p.push(`plataformas.${k}: sin texto`);
  if (!Array.isArray(datos?.limites) || datos.limites.length === 0 || datos.limites.some((x) => typeof x !== "string" || !x.trim())) p.push("limites: lista de textos no vacía (lo que las capturas no cubren)");

  const activos = (glosario?.terminos ?? []).filter((t) => t.estado !== "retirado");
  const porEn = new Map(activos.filter((t) => t.en).map((t) => [t.en, t]));
  const vistos = new Map();
  const usadosPorGrupo = {};

  for (const [v, { singular, entidad }] of Object.entries(VOCABULARIOS_DE_TIPOS)) {
    const grupos = datos?.grupos?.[singular];
    if (!grupos || typeof grupos !== "object" || Object.keys(grupos).length === 0) p.push(`grupos.${singular}: no hay ninguno`);
    for (const [g, que] of Object.entries(grupos ?? {})) {
      if (!FORMA_ID.test(g)) p.push(`grupos.${singular}.${g}: el id no es kebab en inglés`);
      if (typeof que !== "string" || !que.trim()) p.push(`grupos.${singular}.${g}: sin texto`);
    }
    const filas = datos?.[v];
    if (!Array.isArray(filas) || filas.length === 0) { p.push(`${v}: no hay ninguna fila`); continue; }
    for (const t of filas) {
      const q = `${v}.${t?.id}`;
      const extra = Object.keys(t ?? {}).filter((c) => !CAMPOS_DE_TIPO.includes(c));
      const falta = CAMPOS_DE_TIPO.filter((c) => !(c in (t ?? {})));
      if (extra.length) p.push(`${q}: campo desconocido (${extra.join(", ")})`);
      if (falta.length) p.push(`${q}: falta ${falta.join(", ")}`);
      if (typeof t?.id !== "string" || !FORMA_ID.test(t.id)) { p.push(`${q}: el id no es kebab en minúsculas ASCII`); continue; }
      if (vistos.has(t.id)) p.push(`${q}: id repetido (ya está en ${vistos.get(t.id)})`);
      else vistos.set(t.id, v);
      if (!(t.grupo in (grupos ?? {}))) p.push(`${q}: grupo «${t.grupo}» fuera del vocabulario de grupos de ${singular}`);
      else usadosPorGrupo[`${singular}.${t.grupo}`] = true;
      if (!PLATAFORMAS.includes(t.plataforma)) p.push(`${q}: plataforma «${t.plataforma}» fuera del vocabulario (${PLATAFORMAS.join(", ")})`);
      if (!Array.isArray(t.perfil) || t.perfil.length === 0 || new Set(t.perfil).size !== t.perfil.length) p.push(`${q}: perfil es una lista no vacía sin repetir`);
      else {
        for (const x of t.perfil) if (!perfiles.includes(x)) p.push(`${q}: el perfil «${x}» no existe en ops/diseno/bloques.json`);
        if (t.perfil.includes("P1") !== (t.plataforma !== "web")) p.push(`${q}: P1 (móvil) va si y solo si la plataforma no es web`);
        if (t.perfil.includes("P2") !== (t.plataforma !== "mobile")) p.push(`${q}: P2 (escritorio) va si y solo si la plataforma no es mobile`);
        if (t.perfil.includes("P3") && t.plataforma === "mobile") p.push(`${q}: P3 (web de marketing) no va en un tipo solo mobile`);
      }
      const m = t.ejemplos_mobile;
      const w = t.ejemplos_web;
      if (t.plataforma === "web") {
        if (m !== null) p.push(`${q}: un tipo solo web no lleva ejemplos_mobile (null)`);
      } else if (!entero(m)) p.push(`${q}: ejemplos_mobile es un entero positivo en un tipo que usa móvil`);
      if (t.plataforma === "mobile") {
        if (w !== null) p.push(`${q}: un tipo solo mobile no lleva ejemplos_web (null)`);
      } else if (w !== null && !entero(w)) p.push(`${q}: ejemplos_web es un entero positivo o null (no capturado)`);
      // El vínculo con el glosario, tipo → término.
      const term = porEn.get(t.id);
      if (!term) p.push(`${q}: ningún término activo del glosario tiene en «${t.id}»`);
      else {
        if (term.clase !== "tipo") p.push(`${q}: su término «${term.termino}» es de clase ${term.clase}, no tipo`);
        if (term.dominio !== "diseno") p.push(`${q}: su término «${term.termino}» es del dominio ${term.dominio}, no diseno`);
        if (!(term.entidades ?? []).some((e) => e.entidad === entidad && e.relacion === "tipo_de")) p.push(`${q}: su término «${term.termino}» debe nombrar la entidad ${entidad} con tipo_de`);
        const cabeza = porEn.get(datos?.cabezas?.[v]);
        if (cabeza && term.amplio !== cabeza.termino) p.push(`${q}: su término «${term.termino}» debe tener por amplio a «${cabeza.termino}» (la cabeza de ${v})`);
      }
    }
  }
  // La cabeza de cada vocabulario: el término genérico («pantalla», «elemento de interfaz», «flujo»), amplio de todos sus tipos.
  const cabezas = datos?.cabezas ?? {};
  if (JSON.stringify(Object.keys(cabezas)) !== JSON.stringify(Object.keys(VOCABULARIOS_DE_TIPOS))) p.push(`cabezas: deben ser ${Object.keys(VOCABULARIOS_DE_TIPOS).join(", ")}, en ese orden`);
  for (const [v, { entidad }] of Object.entries(VOCABULARIOS_DE_TIPOS)) {
    const en = cabezas[v];
    const cabeza = porEn.get(en);
    if (!cabeza) { p.push(`cabezas.${v}: ningún término activo del glosario tiene en «${en}»`); continue; }
    if (vistos.has(en)) p.push(`cabezas.${v}: «${en}» es también el id de un tipo`);
    if (cabeza.clase !== "tipo" || cabeza.dominio !== "diseno") p.push(`cabezas.${v}: «${cabeza.termino}» debe ser de clase tipo y dominio diseno`);
    if (!(cabeza.entidades ?? []).some((e) => e.entidad === entidad && e.relacion === "tipo_de")) p.push(`cabezas.${v}: «${cabeza.termino}» debe nombrar la entidad ${entidad} con tipo_de`);
    const propios = (datos?.[v] ?? []).map((t) => porEn.get(t.id)?.termino).filter(Boolean).sort();
    const estrechos = [...(cabeza.estrecho ?? [])].sort();
    if (JSON.stringify(propios) !== JSON.stringify(estrechos)) p.push(`cabezas.${v}: «${cabeza.termino}» tiene en estrecho ${estrechos.length} términos y la taxonomía tiene ${propios.length} tipos con término; deben ser los mismos`);
  }
  for (const [singular, grupos] of Object.entries(datos?.grupos ?? {})) for (const g of Object.keys(grupos)) if (!usadosPorGrupo[`${singular}.${g}`]) p.push(`grupos.${singular}.${g}: ningún tipo lo usa (ningún campo sin lector)`);

  // El vínculo en el otro sentido: todo término de tipo del dominio diseno tiene su fila, en el vocabulario de su entidad.
  for (const t of activos) {
    if (t.clase !== "tipo") continue;
    if (Object.values(cabezas).includes(t.en)) continue;
    const donde = t.en ? vistos.get(t.en) : undefined;
    if (t.dominio !== "diseno") p.push(`«${t.termino}»: un término de clase tipo es del dominio diseno (es ${t.dominio})`);
    else if (!donde) p.push(`«${t.termino}»: nombra un tipo y ninguna fila de la taxonomía tiene id «${t.en}»`);
    else if (!(t.entidades ?? []).some((e) => e.entidad === VOCABULARIOS_DE_TIPOS[donde].entidad)) p.push(`«${t.termino}»: su fila está en ${donde} y no nombra la entidad ${VOCABULARIOS_DE_TIPOS[donde].entidad}`);
  }

  // Lo que queda fuera, con su motivo, y que de verdad no está dentro.
  if (!Array.isArray(datos?.fuera) || datos.fuera.length === 0) p.push("fuera: lista no vacía (lo que no entra, con motivo)");
  for (const f of datos?.fuera ?? []) {
    const q = `fuera.${f?.nombre}`;
    if (!Object.values(VOCABULARIOS_DE_TIPOS).some((x) => x.singular === f?.vocabulario)) p.push(`${q}: vocabulario «${f?.vocabulario}» desconocido`);
    if (typeof f?.nombre !== "string" || !f.nombre.trim()) p.push(`${q}: sin nombre`);
    if (typeof f?.motivo !== "string" || f.motivo.trim().length < 10) p.push(`${q}: sin motivo`);
    if (!entero(f?.ejemplos_mobile) && !entero(f?.ejemplos_web)) p.push(`${q}: sin recuento`);
    if (typeof f?.id === "string" && vistos.has(f.id)) p.push(`${q}: está fuera y también dentro (${f.id})`);
    if (typeof f?.id !== "string" || !FORMA_ID.test(f.id)) p.push(`${q}: el id no es kebab`);
  }
  return p;
}

/** Cifras para el informe: tipos por vocabulario y por plataforma. */
export function cifrasDeTaxonomia(datos) {
  const por_vocabulario = {};
  const por_plataforma = Object.fromEntries(PLATAFORMAS.map((x) => [x, { total: 0, ...Object.fromEntries(Object.keys(VOCABULARIOS_DE_TIPOS).map((v) => [v, 0])) }]));
  for (const v of Object.keys(VOCABULARIOS_DE_TIPOS)) {
    por_vocabulario[v] = (datos?.[v] ?? []).length;
    for (const t of datos?.[v] ?? []) {
      if (!por_plataforma[t.plataforma]) continue;
      por_plataforma[t.plataforma][v] += 1;
      por_plataforma[t.plataforma].total += 1;
    }
  }
  return { total: Object.values(por_vocabulario).reduce((a, n) => a + n, 0), por_vocabulario, por_plataforma, fuera: (datos?.fuera ?? []).length };
}

/** Las definiciones de los vocabularios cerrados para ops/vocabularios-vida.json (scripts/lib/vocabulariosVida.mjs). */
export const textosDeTiposDeDiseno = (datos, v) => Object.fromEntries((datos?.[v] ?? []).map((t) => [t.id, ""]));
export const textosDeGruposDeDiseno = (datos, singular) => ({ ...(datos?.grupos?.[singular] ?? {}) });
export const textosDePlataformasDeDiseno = (datos) => ({ ...(datos?.plataformas ?? {}) });
