/**
 * Fuente documental: la entidad única `source` (#681, parte de #652).
 *
 * Antes había dos catálogos de fuentes: las ~111 de `ops/estandares-agentes.json` (con id, nombre, url,
 * tipo, ruta y uso) y las que cada principio llevaba escritas dentro (`{ marca, url | ruta }`). Ahora hay
 * UNA lista, la carpeta `ops/fuentes-documentales/` (un fichero por fuente, como los demás catálogos
 * partidos), y todo lo demás la cita por id:
 *  - un principio: `fuentes: [{ marca, fuente: <id> }]` (la marca es de la cita: la misma dirección puede
 *    ser F en un principio y S en otro);
 *  - una regla de estándar y una práctica del pool: `fuente: <id>`;
 *  - una norma llega a sus fuentes por su principio (`principio`), no las repite.
 *
 * Cada fuente lleva `fecha_alta`, `revisada` (si | no) y `fecha_revision`: «revisada» quiere decir que alguien
 * la ha leído y la dirección responde; la revisión caduca a los 90 días. El reloj no pone en rojo `npm test`
 * (lo mismo que la caducidad de las skills, `scripts/lib/skills.mjs`): el test de `ops/fuentes-documentales.test.js`
 * avisa de las caducadas y de las sin revisar, y falla solo si hay MÁS sin revisar que `TECHO_SIN_REVISAR`
 * (que solo baja) o si el catálogo está mal formado.
 *
 * Quién lee: `leerEstandares` (la vista `fuentes` de siempre, sin las de uso «principio»), el lector de
 * principios (`resolverCitas`) y el pool. Este módulo solo importa `catalogos.mjs`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { leerCatalogo } from "./catalogos.mjs";

export const RUTA_FUENTES = "ops/fuentes-documentales/";

/** Quién cita la fuente: `regla` (sin uso escrito), `pool` o `principio`. */
export const USOS = ["pool", "principio"];
export const TIPOS = ["externa", "casa"];
export const REVISADA = ["si", "no"];
/** Estados de revisión (vocabulario cerrado), calculados a una fecha. */
export const ESTADOS_REVISION = ["vigente", "proxima", "caducada", "sin_revisar"];

/** Plazo de la revisión, como el de las skills: 90 días (la vida de los tokens que caducan antes). */
export const PLAZO_REVISION_DIAS = 90;
/** Desde cuántos días antes de caducar sale «próxima» (igual que las skills). */
export const AVISO_ANTES_DIAS = 14;
/**
 * Cuántas fuentes sin revisar admite el catálogo (a 13 oct 2026, al crearlo). SOLO BAJA: cada fuente que se
 * revisa baja el techo; una fuente nueva entra ya revisada, o el test falla.
 */
export const TECHO_SIN_REVISAR = 98;

const DIA_MS = 86_400_000;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CAMPOS = ["id", "nombre", "tipo", "url", "ruta", "uso", "project", "fecha_alta", "revisada", "fecha_revision"];
const esFecha = (s) => typeof s === "string" && FECHA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const aMs = (s) => Date.parse(`${s}T00:00:00Z`);

/** El catálogo entero: { version, plazo_revision_dias, fuentes: [ ... ] }. */
export const leerFuentes = (raiz) => leerCatalogo(raiz, RUTA_FUENTES);

/** Mapa id → fuente. */
export const mapaDeFuentes = (catalogo) => new Map((catalogo?.fuentes ?? []).map((f) => [f.id, f]));

/**
 * La vista que lee `leerEstandares` en `fuentes`: id → { nombre, tipo?, url | ruta, uso? } con la forma de
 * siempre (una externa no escribe su tipo) y sin las fuentes que solo cita un principio.
 */
export function vistaParaEstandares(catalogo) {
  const fuera = {};
  for (const f of catalogo?.fuentes ?? []) {
    if (f.uso === "principio") continue;
    const v = { nombre: f.nombre };
    if (f.tipo === "casa") v.tipo = "casa";
    if (f.url) v.url = f.url; else v.ruta = f.ruta;
    if (f.uso) v.uso = f.uso;
    fuera[f.id] = v;
  }
  return fuera;
}

/**
 * Las citas de un principio, de `{ marca, fuente: id }` a `{ marca, url | ruta }`: la forma que leen sus
 * validadores y sus documentos. Una cita con un id que no existe queda tal cual (la ve el test del catálogo).
 */
export function resolverCitas(citas, mapa) {
  if (!Array.isArray(citas)) return citas;
  return citas.map((c) => {
    const f = c && typeof c === "object" ? mapa.get(c.fuente) : null;
    if (!f) return c;
    return { marca: c.marca, ...(f.url ? { url: f.url } : { ruta: f.ruta }) };
  });
}

/** Un catálogo de principios (propio o de producto) con sus fuentes resueltas. */
export function conFuentesResueltas(raiz, catalogo) {
  const mapa = mapaDeFuentes(leerFuentes(raiz));
  return { ...catalogo, principios: (catalogo.principios ?? []).map((p) => ({ ...p, fuentes: resolverCitas(p.fuentes, mapa) })) };
}

/** Estado de revisión de una fuente a una fecha: { estado, dias }. Función pura, como `caducidad` de las skills. */
export function estadoDeRevision(f, hoy = new Date(), plazo = PLAZO_REVISION_DIAS) {
  if (f?.revisada !== "si" || !esFecha(f.fecha_revision)) return { estado: "sin_revisar", dias: null };
  const dias = Math.floor((hoy.getTime() - aMs(f.fecha_revision)) / DIA_MS);
  const estado = dias > plazo ? "caducada" : dias > plazo - AVISO_ANTES_DIAS ? "proxima" : "vigente";
  return { estado, dias };
}

/** Cifras del catálogo a una fecha: total, por tipo y por estado de revisión. */
export function cifrasDeFuentes(catalogo, hoy = new Date()) {
  const lista = catalogo?.fuentes ?? [];
  const porEstado = Object.fromEntries(ESTADOS_REVISION.map((e) => [e, 0]));
  for (const f of lista) porEstado[estadoDeRevision(f, hoy, catalogo?.plazo_revision_dias).estado] += 1;
  return {
    total: lista.length,
    externas: lista.filter((f) => f.tipo === "externa").length,
    casa: lista.filter((f) => f.tipo === "casa").length,
    ...porEstado,
  };
}

/**
 * Errores de forma del catálogo (lista vacía si está bien). `citadas` es el conjunto de ids que alguien cita
 * (regla, pool o principio): una fuente que nadie cita sobra. `raiz` permite comprobar que la ruta de una
 * fuente de la casa existe. Sin reloj: lo que depende de la fecha de hoy se mira con `estadoDeRevision`.
 */
export function problemasDeFuentes(catalogo, { citadas = null, raiz = null, techo = TECHO_SIN_REVISAR, hoy = new Date(), proyectos = null } = {}) {
  const malos = [];
  if (!Array.isArray(catalogo?.fuentes) || !catalogo.fuentes.length) return ["fuentes: el catálogo es una lista con una fuente como mínimo"];
  if (catalogo.plazo_revision_dias !== PLAZO_REVISION_DIAS) malos.push(`plazo_revision_dias: ${catalogo.plazo_revision_dias} no es ${PLAZO_REVISION_DIAS} (PLAZO_REVISION_DIAS)`);
  const ids = new Set();
  const direcciones = new Set();
  let sinRevisar = 0;
  for (const f of catalogo.fuentes) {
    const d = `fuente «${f?.id}»`;
    for (const c of Object.keys(f ?? {})) if (!CAMPOS.includes(c)) malos.push(`${d}: campo desconocido «${c}»`);
    if (!ID.test(f?.id ?? "")) malos.push(`${d}: el id va en minúsculas con guiones`);
    if (ids.has(f?.id)) malos.push(`${d}: id repetido`);
    ids.add(f?.id);
    if (typeof f?.nombre !== "string" || f.nombre.trim().length < 10) malos.push(`${d}: sin nombre (10 caracteres o más)`);
    if (!TIPOS.includes(f?.tipo)) malos.push(`${d}: tipo «${f?.tipo}» fuera de ${TIPOS.join(", ")}`);
    if (f?.uso !== undefined && !USOS.includes(f.uso)) malos.push(`${d}: uso «${f.uso}» fuera de ${USOS.join(", ")}`);
    if (f?.project !== undefined && proyectos && !proyectos.includes(f.project)) malos.push(`${d}: project «${f.project}» no es un proyecto de ops/entidades.json (${proyectos.join(", ")})`);
    if (f?.tipo === "casa") {
      if (typeof f.ruta !== "string" || !f.ruta) malos.push(`${d}: de la casa, sin ruta`);
      else if (raiz && !existsSync(join(raiz, f.ruta))) malos.push(`${d}: la ruta ${f.ruta} no existe en el repo`);
      if (f.url) malos.push(`${d}: una fuente de la casa lleva ruta y no url`);
    } else if (f?.tipo === "externa") {
      try { if (new URL(f.url).protocol !== "https:") malos.push(`${d}: la url va en https`); } catch { malos.push(`${d}: url no válida`); }
      if (f.ruta) malos.push(`${d}: una fuente externa lleva url y no ruta`);
    }
    const dir = f?.url ?? f?.ruta;
    if (dir !== undefined) {
      if (direcciones.has(dir)) malos.push(`${d}: la dirección ${dir} ya está en otra fuente (una fuente, un solo registro)`);
      direcciones.add(dir);
    }
    if (!esFecha(f?.fecha_alta)) malos.push(`${d}: fecha_alta no es AAAA-MM-DD`);
    if (!REVISADA.includes(f?.revisada)) malos.push(`${d}: revisada «${f?.revisada}» fuera de ${REVISADA.join(", ")}`);
    else if (f.revisada === "si") {
      if (!esFecha(f.fecha_revision)) malos.push(`${d}: revisada sin fecha_revision AAAA-MM-DD`);
      else if (esFecha(f.fecha_alta) && aMs(f.fecha_revision) < aMs(f.fecha_alta)) malos.push(`${d}: fecha_revision anterior a fecha_alta`);
      else if (aMs(f.fecha_revision) > hoy.getTime()) malos.push(`${d}: fecha_revision en el futuro (una revisión futura no caduca nunca)`);
    } else {
      sinRevisar += 1;
      if (f.fecha_revision !== null) malos.push(`${d}: sin revisar lleva fecha_revision null`);
    }
    if (citadas && !citadas.has(f?.id)) malos.push(`${d}: nadie la cita (ningún principio, regla ni práctica del pool)`);
  }
  if (citadas) for (const c of citadas) if (!ids.has(c)) malos.push(`se cita la fuente «${c}» y no está en ${RUTA_FUENTES}`);
  if (sinRevisar > techo) malos.push(`hay ${sinRevisar} fuentes sin revisar y el techo es ${techo} (TECHO_SIN_REVISAR solo baja): revisa la fuente antes de añadirla`);
  if (sinRevisar < techo) malos.push(`hay ${sinRevisar} fuentes sin revisar y el techo dice ${techo}: baja TECHO_SIN_REVISAR a ${sinRevisar}`);
  return malos;
}

/**
 * El lado que una fuente DEBE tener según lo que ya se sabe de ella (#710, PR 4), sin mirar su campo `project`:
 *  - «horizontal»: la ruta es de un agente (los agentes son horizontales, regla de Pablo, 13 oct 2026) o cae en
 *    zona de factoría;
 *  - «vertical»: la ruta cae en zona de producto (de HoMenu);
 *  - null: ninguna regla lo decide (una fuente externa, o una ruta en zona mixta): lo dice el campo `project`.
 * `zonaDe(ruta)` se inyecta (scripts/lib/zonasProyecto.mjs) para poder probar.
 */
export function ladoObligado(f, zonaDe) {
  if (f?.tipo !== "casa") return null;
  if (/^\.claude\/agents\/[\w-]+\.md$/.test(f.ruta)) return "horizontal";
  const z = zonaDe(f.ruta);
  return z === "factoria" ? "horizontal" : z === "producto" ? "vertical" : null;
}

/**
 * Decisión (orquestador, 14 oct 2026, #710; reversible): las docs de proveedor (sb-functions, sb-migrations, sb-rls,
 * vercel-troubleshoot) son documentación que sirve a cualquiera, así que quedan horizontales y sin `project` aunque las
 * cite una pieza del proyecto. Si Pablo decide lo contrario, basta ponerles `project`. Menor, anotado: la skill de Vercel
 * de la casa (casa-claude-skills-vercel-skill-md) es vertical por su zona, mientras la doc de Vercel es horizontal.
 */
/** El lado de una fuente: el campo `project` la hace vertical; sin él, vale lo obligado y, si nada obliga, horizontal. */
export const ladoDeFuente = (f, zonaDe) => (f?.project ? "vertical" : ladoObligado(f, zonaDe) ?? "horizontal");

/**
 * Errores de lado (lista vacía si está bien): una fuente horizontal no lleva `project` y una de proyecto sí
 * (una fuente en zona de producto lo exige). Las que ninguna regla decide (externas, zona mixta) son libres:
 * con `project` son del proyecto; sin él, de la casa.
 */
export function problemasDeLado(catalogo, zonaDe) {
  const malos = [];
  for (const f of catalogo?.fuentes ?? []) {
    const obligado = ladoObligado(f, zonaDe);
    if (obligado === "horizontal" && f.project) malos.push(`fuente «${f.id}»: es horizontal (${f.ruta}) y lleva project «${f.project}»: quítalo`);
    if (obligado === "vertical" && !f.project) malos.push(`fuente «${f.id}»: es de proyecto (${f.ruta} está en zona de producto) y no lleva project`);
  }
  return malos;
}
