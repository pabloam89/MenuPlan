/**
 * La higiene del vocabulario (F1 de #652, docs/ops/BASE-FORJA.md §12): los seis códigos de la skill
 * `higiene-de-vocabulario`, juntos en un solo informe, sin red ni modelos.
 *
 * | código                     | señal                                                         | capa     | gravedad |
 * | `termino-sin-entidad`      | artefacto sin entidad ni motivo                               | formal   | falta    |
 * | `entidad-sin-termino`      | entidad activa no vertical que ningún término nombra          | formal   | falta    |
 * | `sinonimo-nuevo`           | sinónimo prohibido nuevo en las zonas (lo que mide `--medir`) | formal   | falta    |
 * | `dominio-redefine-base`    | un dominio con el nombre o el sinónimo prohibido de la base   | formal   | falta    |
 * | `definicion-choca-con-base`| definición de dominio casi igual a una de la base             | material | aviso    |
 * | `equivoco-entre-dominios`  | el mismo nombre en dos dominios con definiciones distintas    | material | aviso    |
 *
 * Los mide cada uno su módulo (`glosarioMapeo.mjs`, `glosarioDominios.mjs`, `glosario.mjs`); esto solo los
 * junta, les pone código y gravedad y dice el arreglo. Lo lee `npm run glosario -- --higiene` y lo vigila
 * `scripts/higiene-vocabulario.test.js` con un glosario malo hecho a propósito que da los seis.
 */
import { comparar, medir } from "./glosario.mjs";
import { problemasDeDominios, equivocosEntreDominios, porDominio } from "./glosarioDominios.mjs";
import { entidadesSinTermino, terminosSinEntidad } from "./glosarioMapeo.mjs";

/** Los códigos, con su capa, su gravedad y el arreglo que se da. Vocabulario cerrado. */
export const CODIGOS_VOCABULARIO = {
  "termino-sin-entidad": { capa: "formal", gravedad: "falta", arreglo: "Dile qué entidad nombra (entidades: [{ entidad, relacion }]) o por qué no (sin_entidad, con un motivo de MOTIVOS_SIN_ENTIDAD)" },
  "entidad-sin-termino": { capa: "formal", gravedad: "falta", arreglo: "Añade el término que la nombra en ops/glosario/terminos/ (con su dominio y la relación de su clase) o pon su ficha de glosario en term" },
  "sinonimo-nuevo": { capa: "formal", gravedad: "falta", arreglo: "Escribe el término canónico donde sale; la lista de excepciones no sube" },
  "dominio-redefine-base": { capa: "formal", gravedad: "falta", arreglo: "Cambia el nombre del término de dominio, o estréchalo con amplio hacia el de la base; no lo redefinas" },
  "definicion-choca-con-base": { capa: "material", gravedad: "aviso", arreglo: "Mira si es el mismo concepto: si lo es, usa el término de la base (y estréchalo con amplio); si no, afila la diferencia con «que …»" },
  "equivoco-entre-dominios": { capa: "material", gravedad: "aviso", arreglo: "Dale a uno otro nombre, o llévalos a la base con una sola definición" },
};

/**
 * El informe de higiene de un glosario: [{ codigo, texto, capa, gravedad, arreglo }].
 * `registro` es ops/entidades.json; `excepciones` las de ops/glosario-excepciones/; `medicion` se puede pasar
 * ya hecha (los tests de mentira) o se mide del repo en `raiz`.
 */
export function higieneDeVocabulario(glosario, registro, { raiz = null, excepciones = {}, medicion = null } = {}) {
  const hallazgos = [];
  const anota = (codigo, texto) => hallazgos.push({ codigo, texto, ...CODIGOS_VOCABULARIO[codigo] });
  for (const t of terminosSinEntidad(glosario)) anota("termino-sin-entidad", `${t}: artefacto sin entidad ni motivo`);
  for (const id of entidadesSinTermino(glosario, registro)) anota("entidad-sin-termino", `${id}: entidad activa no vertical que ningún término nombra`);
  const m = medicion ?? (raiz ? medir(raiz, glosario) : { medida: {}, detalle: [] });
  for (const n of comparar(m.medida, excepciones).nuevas) {
    const d = m.detalle.find((x) => x.ruta === n.ruta && x.sinonimo === n.sinonimo);
    anota("sinonimo-nuevo", `${n.ruta}: «${n.sinonimo}» ${n.hay} (admitidas ${n.admitidas}) → di «${d?.canonico}»`);
  }
  const por = porDominio(glosario);
  const base = por.base ?? [];
  for (const [d, ts] of Object.entries(por)) {
    if (d === "base") continue;
    for (const x of problemasDeDominios(base, ts)) {
      const [codigo, ...resto] = x.split(": ");
      anota(codigo, resto.join(": "));
    }
  }
  for (const x of equivocosEntreDominios(por)) {
    const [codigo, ...resto] = x.split(": ");
    anota(codigo, resto.join(": "));
  }
  return hallazgos;
}

/** El glosario, que es el único que se repasa: el valor que abre la línea de cifra. */
const NOMBRE_DEL_GLOSARIO = "glosario";

/** La línea de cifra: `higiene vocabulario: glosario terminos: n faltas: a avisos: b`. */
export function cifraDeHigiene(glosario, hallazgos) {
  const faltas = hallazgos.filter((h) => h.gravedad === "falta").length;
  const avisos = hallazgos.length - faltas;
  const terminos = (glosario.terminos ?? []).filter((t) => t.estado !== "retirado").length;
  return `higiene vocabulario: ${NOMBRE_DEL_GLOSARIO} terminos: ${terminos} faltas: ${faltas} avisos: ${avisos}`;
}

/** Una línea por hallazgo: `  codigo (capa, gravedad): texto → arreglo`. */
export const lineaDeHallazgo = (h) => `  ${h.codigo} (${h.capa}, ${h.gravedad}): ${h.texto} → ${h.arreglo}`;
