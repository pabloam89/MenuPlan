/**
 * El mapeo término → entidad del glosario (F1 de #652, docs/ops/BASE-FORJA.md §10).
 *
 * Cada término activo puede nombrar de 0 a N entidades del registro (`ops/entidades.json`) con
 * `entidades: [{ entidad, relacion }]`; la relación la fija la clase del término
 * (`RELACION_POR_CLASE` de glosario.mjs, y su forma la vigila `problemasDeGlosario`). Un artefacto
 * que ninguna entidad nombra dice por qué con `sin_entidad` (`MOTIVOS_SIN_ENTIDAD`). Aquí se miran
 * las cosas que solo se ven con el registro delante:
 *
 *  1. la entidad que nombra un término existe (activa o retirada: `judge`, `rule` y otras siguen en el
 *     registro) y un retirado no se nombra a sí mismo en otro sitio;
 *  2. si una entidad activa lleva `term`, ese término la nombra, y si el `en` de un término es el id de
 *     una entidad activa, también;
 *  3. toda entidad activa que no es vertical la nombra algún término (el glosario es de proceso: las
 *     verticales llevan el suyo en su proyecto);
 *  4. `sin_entidad: retirado` solo en un término cuya entidad se retiró, y ningún artefacto declara
 *     `sin_entidad` si una entidad activa lo nombra.
 *
 * Lo lee `ops/glosario-mapeo.test.js` y la skill `higiene-de-vocabulario` (códigos `termino-sin-entidad` y
 * `entidad-sin-termino`). Solo lee datos que se le pasan: sin red ni ficheros.
 */
import { activos } from "./glosario.mjs";

/** Los términos activos que nombran una entidad, y la entidad → términos que la nombran. */
export function terminosPorEntidad(glosario) {
  const por = new Map();
  for (const t of activos(glosario)) for (const x of t.entidades ?? []) por.set(x.entidad, [...(por.get(x.entidad) ?? []), t.termino]);
  return por;
}

/** Artefactos activos que ni nombran entidad ni dicen su motivo (código `termino-sin-entidad`). */
export const terminosSinEntidad = (glosario) => activos(glosario).filter((t) => t.clase === "artefacto" && !t.entidades?.length && !t.sin_entidad).map((t) => t.termino);

/** Entidades activas no verticales que ningún término nombra (código `entidad-sin-termino`). */
export function entidadesSinTermino(glosario, registro) {
  const por = terminosPorEntidad(glosario);
  return registro.entities.filter((e) => e.status === "active" && e.scope !== "vertical" && !por.has(e.id)).map((e) => e.id);
}

/** Todos los problemas del mapeo contra el registro de entidades (lista de textos; vacía si está bien). */
export function problemasDeMapeo(glosario, registro) {
  const p = [];
  const porId = new Map(registro.entities.map((e) => [e.id, e]));
  const ts = activos(glosario);
  for (const t of ts) {
    for (const x of t.entidades ?? []) if (!porId.has(x.entidad)) p.push(`${t.termino}: la entidad «${x.entidad}» no existe en ops/entidades.json`);
    const ids = (t.entidades ?? []).map((x) => x.entidad);
    if (t.en && porId.get(t.en)?.status === "active" && !ids.includes(t.en)) p.push(`${t.termino}: su en «${t.en}» es una entidad activa y el término no la nombra en entidades`);
    if (t.sin_entidad === "retirado" && !registro.entities.some((e) => e.status === "retired" && e.term === t.termino)) p.push(`${t.termino}: sin_entidad retirado, pero ninguna entidad retirada lleva este término`);
  }
  for (const e of registro.entities) {
    if (e.status !== "active" || e.term == null) continue;
    const t = ts.find((x) => x.termino === e.term);
    if (t && !(t.entidades ?? []).some((x) => x.entidad === e.id)) p.push(`${e.term}: la entidad ${e.id} lo lleva en term y el término no la nombra en entidades`);
    if (t?.sin_entidad) p.push(`${e.term}: dice sin_entidad pero la entidad ${e.id} lo nombra`);
  }
  for (const id of entidadesSinTermino(glosario, registro)) p.push(`${id}: entidad activa no vertical que ningún término nombra (entidad-sin-termino)`);
  for (const t of terminosSinEntidad(glosario)) p.push(`${t}: artefacto sin entidad ni motivo (termino-sin-entidad)`);
  return p;
}

/** Cifras del mapeo, para el informe: términos con entidad, sin entidad (con motivo) y entidades nombradas. */
export function cifrasDeMapeo(glosario, registro) {
  const ts = activos(glosario);
  const por = terminosPorEntidad(glosario);
  const motivos = {};
  for (const t of ts) if (t.sin_entidad) motivos[t.sin_entidad] = (motivos[t.sin_entidad] ?? 0) + 1;
  return {
    terminos: ts.length,
    con_entidad: ts.filter((t) => t.entidades?.length).length,
    sin_entidad: ts.filter((t) => t.sin_entidad).length,
    sin_mapeo: ts.filter((t) => !t.entidades?.length && !t.sin_entidad).length,
    entidades_activas: registro.entities.filter((e) => e.status === "active").length,
    entidades_nombradas: [...por.keys()].filter((id) => registro.entities.find((e) => e.id === id)?.status === "active").length,
    motivos,
  };
}
