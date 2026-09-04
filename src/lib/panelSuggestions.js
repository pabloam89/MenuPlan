/**
 * Las sugerencias que abren el panel. SIN IA.
 *
 * Se leen del menú de esta semana y se comparan con lo que la libreta dice que
 * queríais. Cero latencia, cero coste, cero alucinación — y el usuario abre la
 * burbuja y ve que la app YA ha mirado su menú antes de que él escriba nada.
 * Eso compra más confianza que cualquier respuesta del modelo, y es lo que
 * mata la pantalla en blanco: una caja de texto vacía da mal material.
 *
 * La regla que las hace útiles: una sugerencia solo aparece si tiene algo que
 * decir de ESTE menú. "Menos pescado" cuando no hay pescado es ruido, y el
 * ruido enseña al usuario a ignorar el panel.
 */

import { CAMPOS_POR_ID } from "./notepadFields.js";
import { valorDe, proyectar } from "./notepad.js";

/** Cuántas se enseñan. Tres o cuatro caben sin scroll y no abruman. */
export const MAX_SUGERENCIAS = 4;

const FAMILIA_LABEL = {
  carne: "carne", pescado: "pescado", legumbres: "legumbre",
  pasta_arroz: "pasta o arroz", huevos: "huevo", verdura: "verdura",
};

// Nuestras ilustraciones 3D. Hermana de FAMILY_ART en screens/Analytics.jsx:
// mismas rutas, mismo criterio (pasta y arroz comparten bol). Se duplica en vez
// de importarse porque aquella vive dentro de una pantalla de 900 lineas y
// sacarla de ahi es otra faena; si un dia se mueven, se mueven las dos.
const ARTE_FAMILIA = {
  pescado: "/categories/cut/pescado.png",
  carne: "/categories/cut/carne.png",
  verdura: "/categories/cut/verduras.png",
  legumbres: "/categories/cut/legumbres.png",
  pasta_arroz: "/categories/cut/pasta_arroz.png",
  huevos: "/categories/cut/huevos.png",
};

const veces = (n) => (n === 1 ? "una vez" : n === 2 ? "dos veces" : `${n} veces`);

/**
 * @param {{familias: Record<string, number>, cocinas: Record<string, number>, tecnicas: Record<string, number>, huecos: number}} recuento
 *   Lo que hay en el menú de esta semana, ya contado por quien lo tiene a mano.
 * @param {object} notepad
 * @returns {Array<{id: string, texto: string, frase: string, porque: string}>}
 *   `frase` es lo que se escribe en el input al pulsarla — la sugerencia no
 *   ejecuta nada por su cuenta, rellena el campo y deja que el flujo normal
 *   siga. Así hay un solo camino que mantener y probar.
 */
export function sugerenciasDelMenu(recuento, notepad) {
  const { familias = {}, cocinas = {}, tecnicas = {}, huecos = 0 } = recuento ?? {};
  const objetivos = proyectar(notepad).freqs;
  const out = [];

  // 1. Una familia que se pasa de lo que pediste. Es la más accionable de
  //    todas porque el usuario ya dijo cuánto quería.
  for (const [familia, cuantas] of Object.entries(familias)) {
    const objetivo = objetivos[familia];
    if (objetivo != null && cuantas > objetivo) {
      out.push({
        id: `menos-${familia}`,
        texto: `Menos ${FAMILIA_LABEL[familia] ?? familia}`,
        frase: `menos ${FAMILIA_LABEL[familia] ?? familia}`,
        porque: `Hay ${veces(cuantas)} y pediste ${objetivo}`,
        arte: ARTE_FAMILIA[familia] ?? "/categories/platos_unicos.png",
      });
    }
  }

  // 2. Una técnica que domina la semana. El umbral es un TERCIO de los huecos:
  //    por debajo de eso no es monotonía, es casualidad, y avisar de una
  //    casualidad es exactamente el ruido que queremos evitar.
  const [tecnicaTop, tecnicaN] = mayor(tecnicas);
  if (tecnicaTop && huecos >= 6 && tecnicaN >= Math.ceil(huecos / 3)) {
    out.push({
      id: `variar-${tecnicaTop}`,
      texto: "Más variedad de estilos",
      frase: `menos ${tecnicaTop}`,
      porque: `${tecnicaN} platos ${preposicion(tecnicaTop)} ${tecnicaTop}`,
      arte: "/categories/faceta_gourmet.webp",
    });
  }

  // 3. Semana sin cocina de fuera. Solo si de verdad no hay NINGUNA: con una
  //    ya no es un hueco, es una semana normal.
  if (Object.keys(cocinas).length === 0 && huecos > 0) {
    const dominio = CAMPOS_POR_ID.cocina.dominio;
    const cual = dominio[Math.floor(Date.now() / 86400000) % dominio.length];
    out.push({
      id: `probar-${cual}`,
      // "Prueba algo francesa" es lo que sale si se concatena sin pensar, y
      // canta a máquina. Los nombres de cocina son adjetivos femeninos porque
      // concuerdan con "cocina": la frase tiene que llevar el sustantivo.
      texto: `Cocina ${cual}`,
      frase: `más comida ${cual}`,
      porque: "Esta semana no hay nada de fuera",
      // Provisional hasta que existan las banderas de cocina: las especias
      // son lo mas parecido a "de fuera" que hay hoy en el catalogo.
      arte: "/categories/especias.png",
    });
  }

  // 4. Comodines. La rejilla es de CUATRO y se rellena siempre: una rejilla de
  //    2×2 con un hueco se lee como que algo ha fallado, no como que no había
  //    nada que decir. Se añaden por orden y sin repetir lo ya propuesto.
  for (const c of COMODINES) {
    if (out.length >= MAX_SUGERENCIAS) break;
    if (out.some((s) => s.id === c.id)) continue;
    out.push(c);
  }

  return out.slice(0, MAX_SUGERENCIAS).map((s, i) => ({ ...s, tono: TONOS[i % TONOS.length] }));
}

// Siempre servibles: no dependen de cómo esté el menú, así que valen de
// relleno sin mentir. Ordenados por lo que más pide la gente.
const COMODINES = [
  { id: "mas-rapido", texto: "Algo más rápido", frase: "algo más rápido", porque: "Para las noches con prisa", arte: "/categories/faceta_rapido.webp" },
  { id: "mas-verdura", texto: "Más verdura", frase: "más verdura", porque: "Sin que parezca un castigo", arte: "/categories/cut/verduras.png" },
  { id: "mas-facil", texto: "Menos lío", frase: "algo más fácil", porque: "Platos de un cacharro", arte: "/categories/platos_unicos.png" },
  { id: "mas-salsa", texto: "Platos con salsa", frase: "más platos con salsa", porque: "De los que mojan pan", arte: "/categories/salsas.png" },
];

// Cuatro parejas de color, una por posición en la rejilla. Van por posición y
// no por contenido a propósito: así la rejilla siempre tiene los mismos cuatro
// colores en el mismo sitio y se reconoce de un vistazo, aunque el texto de
// cada tarjeta cambie cada semana.
const TONOS = [
  { fondo: "#eaf6ee", borde: "#c9e6d4", tinta: "#1e5233", glow: "rgba(76,186,110,.28)" },
  { fondo: "#fdf1e3", borde: "#f3ddc0", tinta: "#8a4f00", glow: "rgba(224,165,94,.28)" },
  { fondo: "#e9f1fb", borde: "#cfe0f2", tinta: "#20456e", glow: "rgba(90,140,200,.26)" },
  { fondo: "#f6edf8", borde: "#e6d4ea", tinta: "#5c2f66", glow: "rgba(150,95,165,.24)" },
];

function mayor(obj) {
  let clave = null, max = 0;
  for (const [k, v] of Object.entries(obj ?? {})) if (v > max) { clave = k; max = v; }
  return [clave, max];
}

// "al horno" pero "a la plancha": el castellano no perdona esto y una frase
// mal construida delata que la escribió una máquina.
const preposicion = (t) => (t === "plancha" ? "a la" : t === "sarten" ? "a la" : "al");

/**
 * El contexto que viaja al modelo: números, nunca nombres.
 *
 * Sin platos, sin personas, sin ids. El modelo solo necesita saber de dónde
 * parte para poder decir "ahora hay pescado dos veces"; darle el menú entero
 * sería mandar datos de casa a un tercero sin que haga falta.
 */
export function contextoParaElModelo(recuento, notepad) {
  const objetivos = proyectar(notepad).freqs;
  const lineas = [];
  for (const [familia, n] of Object.entries(recuento?.familias ?? {})) {
    const objetivo = objetivos[familia];
    lineas.push(`${FAMILIA_LABEL[familia] ?? familia}: ${n} esta semana${objetivo != null ? ` (pediste ${objetivo})` : ""}`);
  }
  const cocinas = Object.keys(recuento?.cocinas ?? {});
  return [
    `Huecos de la semana: ${recuento?.huecos ?? 0}.`,
    lineas.length ? `Reparto actual — ${lineas.join("; ")}.` : null,
    cocinas.length ? `Cocinas presentes: ${cocinas.join(", ")}.` : "No hay ningún plato de cocina de fuera.",
  ].filter(Boolean).join("\n");
}

export { FAMILIA_LABEL };
