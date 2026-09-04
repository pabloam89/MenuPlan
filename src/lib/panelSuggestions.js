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

import { valorDe, proyectar } from "./notepad.js";

/** Cuántas se enseñan. Tres o cuatro caben sin scroll y no abruman. */
export const MAX_SUGERENCIAS = 4;

const FAMILIA_LABEL = {
  carne: "carne", pescado: "pescado", legumbres: "legumbre",
  pasta_arroz: "pasta o arroz", huevos: "huevo", verdura: "verdura",
};

// SOLO recortes de /categories/cut. Es la unica carpeta con transparencia real
// (PNG color type 6); el resto son PNG sin alfa, y dentro del circulo de la
// tarjeta se ven como una foto cuadrada metida a la fuerza en vez de como un
// objeto flotando. Mientras no haya recorte de algo, ese algo no sale en la
// rejilla — mejor una idea menos que una tarjeta fea.
//
// Hermana de FAMILY_ART en screens/Analytics.jsx: mismas rutas, mismo criterio
// (pasta y arroz comparten bol).
const CUT = {
  carne: "/categories/cut/carne.png",
  pescado: "/categories/cut/pescado.png",
  verduras: "/categories/cut/verduras.png",
  legumbres: "/categories/cut/legumbres.png",
  pasta_arroz: "/categories/cut/pasta_arroz.png",
  huevos: "/categories/cut/huevos.png",
  frutas: "/categories/cut/frutas.png",
};

const ARTE_FAMILIA = {
  pescado: CUT.pescado, carne: CUT.carne, verdura: CUT.verduras,
  legumbres: CUT.legumbres, pasta_arroz: CUT.pasta_arroz, huevos: CUT.huevos,
};


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
        porque: `Hay ${cuantas}, pediste ${objetivo}`,
        arte: ARTE_FAMILIA[familia] ?? CUT.frutas,
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
      texto: "Más variedad",
      frase: `menos ${tecnicaTop}`,
      porque: `${tecnicaN} ${preposicion(tecnicaTop)} ${tecnicaTop}`,
      arte: CUT.frutas,
    });
  }

  // 3. La sugerencia de cocina de fuera existia aqui y esta RETIRADA: no hay
  //    recorte de ninguna cocina, y con la ilustracion de especias —que no
  //    tiene alfa— la tarjeta se veia rota. Vuelve en cuanto esten los ocho
  //    recortes en /categories/cut/cocinas. Escribirlo a mano sigue yendo:
  //    lo que se ha quitado es la tarjeta, no la funcion.

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
  { id: "mas-verdura", texto: "Más verdura", frase: "más verdura", porque: "Sin dramas", arte: CUT.verduras },
  { id: "mas-legumbre", texto: "Más legumbre", frase: "más legumbre", porque: "Puchero del bueno", arte: CUT.legumbres },
  { id: "mas-pasta", texto: "Más pasta", frase: "más pasta", porque: "Gusta a todos", arte: CUT.pasta_arroz },
  { id: "mas-fruta", texto: "Fruta de postre", frase: "más fruta de postre", porque: "En vez de dulces", arte: CUT.frutas },
];

// Cuatro parejas de color, una por posición en la rejilla. Van por posición y
// no por contenido a propósito: así la rejilla siempre tiene los mismos cuatro
// colores en el mismo sitio y se reconoce de un vistazo, aunque el texto de
// cada tarjeta cambie cada semana.
const TONOS = [
  { tinta: "#1e5233", suave: "#eaf6ee", barra: "#4cba6e" },
  { tinta: "#8a4f00", suave: "#fdf1e3", barra: "#e0a55e" },
  { tinta: "#20456e", suave: "#e9f1fb", barra: "#5a8cc8" },
  { tinta: "#5c2f66", suave: "#f6edf8", barra: "#9a63a8" },
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
