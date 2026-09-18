import { recipeCatalog } from "../data/recipeCatalog.js";
import { ahorroDelDia, tieneAdelanto } from "./adelanto.js";
import { COCINADO, NO_AGUANTA, SEMI } from "./tandaFamiliasDefs.js";

/**
 * Las familias de la sesión de tandas que NO son bases.
 *
 * La sesión tiene tres patas y cada una responde a una pregunta distinta:
 *
 *   bases        ¿qué INGREDIENTE dejo hecho? (una olla de arroz, un sofrito)
 *                Sirve para varios platos y vive en lib/bases.js.
 *   semi         ¿qué PLATO dejo a medio hacer? Croquetas formadas, lasaña
 *                montada. Se remata el día que toca. Vive en lib/adelanto.js.
 *   cocinado     ¿qué OLLA dejo hecha del todo y me dura varias noches?
 *                Cremas, sopas, gazpachos, caldo.
 *
 * Se agrupan en FAMILIAS y no en platos sueltos por la misma razón que las
 * bases: aquí se contesta "cuántas veces quiero croquetas esta semana", no
 * "quiero las de bacalao". Elegir la receta concreta es trabajo del generador,
 * que para eso sabe lo que ya comiste (lib/recientes.js).
 *
 * La pertenencia se DERIVA del catálogo y no se escribe a mano, para que una
 * receta nueva entre sola en su familia. `familiasCompletas` en el test
 * comprueba lo contrario: que ningún plato marcado se quede sin familia.
 */

function clasificar(cortes, nombre) {
  return cortes.find((c) => c.re.test(nombre))?.id ?? null;
}

/** Manos que cuesta dejar hecha una tanda de esta familia, en minutos. */
function medianaDe(numeros) {
  if (!numeros.length) return 0;
  const xs = [...numeros].sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)];
}

function manosDeReceta(receta) {
  let total = 0;
  for (const paso of receta.stepsRich ?? []) {
    if (paso?.kind === "activo" || paso?.kind === "prep") total += Number(paso?.minutes) || 0;
  }
  return total;
}

function construir() {
  const semi = new Map(SEMI.map((c) => [c.id, { ...c, recetas: [], manos: [] }]));
  const cocinado = new Map(COCINADO.map((c) => [c.id, { ...c, recetas: [], manos: [] }]));
  const sinFamilia = [];

  for (const r of recipeCatalog) {
    if (tieneAdelanto(r)) {
      // Sin comodin a proposito. Un "si no encaja, a la ultima" daria una
      // familia siempre llena y jamas sabriamos que una receta nueva cayo en
      // el sitio equivocado; asi se queda fuera y el test lo dice por su
      // nombre.
      const fam = semi.get(clasificar(SEMI, r.name));
      if (!fam) { sinFamilia.push(r.id); continue; }
      fam.recetas.push(r.id);
      fam.manos.push(ahorroDelDia(r));
      continue;
    }
    if (!r.estrella || r.category !== "sopas_cremas") continue;
    if (NO_AGUANTA.test(r.name)) continue;
    const id = clasificar(COCINADO, r.name);
    if (!id) continue;
    const fam = cocinado.get(id);
    fam.recetas.push(r.id);
    fam.manos.push(manosDeReceta(r));
  }

  const rematar = (mapa, tipo) => [...mapa.values()]
    .filter((f) => f.recetas.length > 0)
    .map(({ re, manos, ...f }) => ({ ...f, tipo, minutosPorTanda: medianaDe(manos) }));

  return { semi: rematar(semi, "semi"), cocinado: rematar(cocinado, "cocinado"), sinFamilia };
}

const { semi, cocinado, sinFamilia } = construir();

/** Platos marcados que no cayeron en ninguna familia. Debe estar vacio. */
export const SIN_FAMILIA = sinFamilia;

export const FAMILIAS_SEMI = semi;
export const FAMILIAS_COCINADO = cocinado;
export const FAMILIAS_PLATO = [...semi, ...cocinado];
export { CLAVES_PLATO } from "./tandaFamiliasDefs.js";

const POR_ID = new Map(FAMILIAS_PLATO.map((f) => [f.id, f]));
export const familiaDePlato = (id) => POR_ID.get(id) ?? null;

/**
 * Lo que cuesta dejar hechas `veces` tandas de esta familia, en minutos de manos.
 *
 * No es una multiplicación. Formar diez croquetas en vez de cinco no cuesta el
 * doble: la bechamel, el enfriado y sacar el pan rallado se pagan una sola vez,
 * y lo único que crece es el rato de dar forma. Se cobra la primera entera y
 * media por cada una más, que es el mismo trato que `minutosFijos` y
 * `minutosPorRacion` dan a las bases.
 */
export function manosDeTanda(familiaId, veces) {
  const fam = POR_ID.get(familiaId);
  if (!fam || veces <= 0) return 0;
  return Math.round(fam.minutosPorTanda * (1 + (veces - 1) * 0.5));
}
