import { FAMILIAS } from "../../lib/notepadFields.js";
import { mover, normalizar, repartoAFreqs } from "../../lib/reparto.js";
import { SliderEjes } from "./SliderEjes.jsx";

/**
 * El reparto de la semana: seis sliders que suman 100.
 *
 * Mover uno mueve a los demás, porque el número de huecos de la semana no
 * cambia: quitar carne tiene que poner otra cosa. Toda la mecánica está en
 * lib/reparto.js y el dibujo en SliderEjes.jsx — aquí solo se traduce lo uno a
 * lo otro.
 *
 * El número de la derecha no es el porcentaje sino las VECES POR SEMANA que va
 * a ver el planner, que es lo único que el usuario reconoce como suyo. Un 22 %
 * no significa nada en una cocina; "3 por semana" sí.
 *
 * ── Etiqueta, color y orden salen de "¿Cómo os gusta comer?" ──────────────
 * Son las mismas seis familias, la misma pregunta y la misma fila, así que van
 * con el mismo color de categoría (§1.6) y en el mismo orden. Con otro orden,
 * la mitad del trabajo de reconocer la lista se pierde.
 */

const ORDEN = ["carne", "pescado", "pasta_arroz", "legumbres", "huevos", "verdura"];

// Las filas siguen siendo FAMILIAS, solo ordenadas: si mañana aparece una
// familia nueva en el cuaderno, sale igual —al final— en vez de desaparecer
// en silencio de este control.
const familiasOrdenadas = [...FAMILIAS].sort(
  (a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99),
);

const ARTE = {
  carne: "/categories/cut/carne.png",
  pescado: "/categories/cut/pescado.png",
  legumbres: "/categories/cut/legumbres.png",
  pasta_arroz: "/categories/cut/pasta_arroz.png",
  huevos: "/categories/cut/huevos.png",
  // El fichero va en plural y la familia en singular. Mismo desajuste que ya
  // resuelve el mapa ARTE de panelParser.js.
  verdura: "/categories/cut/verduras.png",
};

const ETIQUETA = {
  carne: "Carne",
  pescado: "Pescado",
  legumbres: "Legumbres",
  pasta_arroz: "Pasta y arroz",
  huevos: "Huevos",
  verdura: "Verdura",
};

/** Los mismos colores que FOOD_META en Onboarding: es la misma lista. */
const COLOR = {
  carne: "#c0562f",
  pescado: "#2f7dc0",
  pasta_arroz: "#ca8a04",
  legumbres: "#a06b2f",
  huevos: "#d6a01f",
  verdura: "#3f8f5b",
};

export function SliderReparto({ reparto, onChange, movidasPorIA = [], porQue = null }) {
  const actual = normalizar(reparto);
  const freqs = repartoAFreqs(actual);

  return (
    <SliderEjes
      ejes={familiasOrdenadas.map((familia) => ({
        id: familia,
        arte: ARTE[familia],
        etiqueta: ETIQUETA[familia],
        color: COLOR[familia],
        valor: actual[familia],
        resumen: `${freqs[familia]}/sem`,
        // Solo se apaga lo que está a cero. Ninguna otra se destaca: aquí las
        // seis cifras son igual de reales —la suma es fija, así que todas están
        // puestas— y resaltar las que se salían de la media dejaba "Carne
        // 3/sem" apagada y "Pasta 2/sem" en negrita por un umbral invisible.
        apagado: freqs[familia] === 0,
      }))}
      movidas={movidasPorIA}
      porQue={porQue}
      onChange={(familia, v) => onChange(mover(actual, familia, v))}
    />
  );
}
