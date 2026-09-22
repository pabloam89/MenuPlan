import { CAMPOS_POR_ID } from "../../lib/notepadFields.js";
import { esAnadido, topeDe } from "../../lib/cocinaTopes.js";
import { SliderEjes } from "./SliderEjes.jsx";

/**
 * "¿Añadimos algo de fuera?" — cuántos platos de cada cocina, por semana.
 *
 * La fila la dibuja SliderEjes.jsx, la misma que el reparto y la misma que
 * "¿Cómo os gusta comer?": es la misma pregunta —cuántas veces por semana
 * quiero esto— y verla con otra forma en otro sitio se lee como otra cosa.
 * Aquí solo se dice qué cocinas salen, con qué color y hasta dónde llega cada
 * barra.
 *
 * ── Italiana no está ──────────────────────────────────────────────────────
 * Y no es un olvido: 52 de sus 62 platos servibles son `pasta_arroces`, así
 * que en este catálogo `cocina: italiana` es prácticamente "pasta". Eso ya se
 * mueve desde los estilos de comida y desde el reparto — ponerla aquí sería un
 * segundo mando sobre los mismos platos. Vive en `SIEMPRE_ENCENDIDAS`
 * (lib/cocinaTopes.js), con el porqué escrito.
 *
 * ── Cada fila tiene su propio tope ────────────────────────────────────────
 * El techo de una cocina no lo marca cuántos platos tiene sino cuántas
 * PROTEÍNAS distintas, porque el motor no encadena la misma dos comidas
 * seguidas. Peruana llega a dos —sus platos son casi todos pescado— y con un
 * tope común la barra prometía cinco y el valor se recortaba por detrás: el
 * pulgar dejaba de seguir al dedo.
 */

const ETIQUETA = {
  asiatica: "Asiática",
  mexicana: "Mexicana",
  arabe: "Árabe",
  francesa: "Francesa",
  americana: "Americana",
  india: "India",
  peruana: "Peruana",
};

/** Un color por cocina, de la paleta de categorías del sistema (§1.6). */
const COLOR = {
  asiatica: "#c0392b",
  mexicana: "#cf7833",
  arabe: "#b9770e",
  francesa: "#8a6cc4",
  americana: "#2f6f9f",
  india: "#d4a017",
  peruana: "#3f9656",
};

export function SliderCocinas({ sesgos = {}, onChange, movidasPorIA = [], porQue = null }) {
  // Solo las que son un AÑADIDO: italiana está fuera por diseño.
  const cocinas = CAMPOS_POR_ID.cocina.dominio.filter(esAnadido);

  return (
    <SliderEjes
      ejes={cocinas.map((cocina) => {
        const tope = topeDe(cocina);
        const n = Math.min(sesgos[cocina] ?? 0, tope);
        return {
          id: cocina,
          arte: `/categories/cut/cocinas/${cocina}.png`,
          etiqueta: ETIQUETA[cocina],
          aria: `${ETIQUETA[cocina]}: platos por semana`,
          color: COLOR[cocina],
          max: tope,
          valor: n,
          resumen: n > 0 ? `${n}/sem` : "No",
          // Lo que está a cero se apaga: es el estado de casi todas las filas,
          // y en color serían siete etiquetas gritando que no.
          apagado: n === 0,
        };
      })}
      movidas={movidasPorIA}
      porQue={porQue}
      onChange={(cocina, v) => onChange({ ...sesgos, [cocina]: v })}
    />
  );
}
