/**
 * Buscar recetas por lo que se QUIERE, no por cómo se llaman: «algo de la
 * abuela para el frío», «una cena que parezca de restaurante», «lo que comía
 * de pequeño en verano». La búsqueda por palabras (recetas.js filtrarRecetas)
 * solo encuentra «lentejas» si pone «lentejas».
 *
 * Cómo: el Recetario Estrella entero, una línea por receta (nombre, carpeta,
 * tiempo y los atributos blandos: connotación, textura, sabor), va como
 * instrucciones con caché a Haiku, que devuelve las que mejor encajan. Se
 * pensó en embeddings, pero no hay proveedor a mano (Anthropic no los tiene,
 * el crédito de Gemini está agotado, el gateway de Vercel pide una clave
 * nueva), y con 743 recetas el índice entero (~86 KB, unos 28k tokens) cabe
 * en la caché. Coste: con la caché caliente (otra búsqueda en 5 min), unos
 * 0,3 céntimos y ~1,2 s; en frío, unos 3,5 céntimos y algo más de tiempo.
 * Por eso solo entra cuando las palabras no bastan (recetas.js
 * conSignificado). Además entiende la frase entera («sin horno», «que no sea
 * pescado»), que un vector no.
 *
 * Nunca decide nada: devuelve ids del catálogo, y quien llama filtra por
 * carpeta, tiempo y alergias como siempre. Si falla o tarda, [] y sigue la
 * búsqueda por palabras.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODELO = process.env.BOT_SIGNIFICADO_MODELO || "claude-haiku-4-5-20251001";
const ESPERA_MS = 6000;

let cliente = null;
const anthropic = () => (cliente ??= new Anthropic());

/** La línea de una receta en el índice. Pura, para el test. */
export function lineaIndice(r, carpeta = r.category) {
  const rasgos = [
    ...(r.connotacion ?? []), r.textura, ...(r.sabor ?? []), r.picante ? "picante" : "",
    r.caloriasNivel === "ligero" ? "ligero" : r.caloriasNivel === "contundente" ? "contundente" : "",
    r.costeNivel === "economico" ? "barato" : "",
  ].filter(Boolean);
  return `${r.id}|${r.name}|${carpeta ?? ""}|${r.time ? `${r.time}min` : ""}|${rasgos.join(",")}`;
}

// El índice se hace una vez por catálogo y SIEMPRE igual (mismo orden), para
// que la caché de instrucciones acierte entre llamadas.
const indices = new WeakMap();
function indiceDe(catalogo, carpetaDe) {
  if (indices.has(catalogo)) return indices.get(catalogo);
  const estrella = catalogo.filter((r) => r.estrella).sort((a, b) => a.id.localeCompare(b.id));
  const indice = {
    ids: new Set(estrella.map((r) => r.id)),
    texto: estrella.map((r) => lineaIndice(r, carpetaDe(r))).join("\n"),
  };
  indices.set(catalogo, indice);
  return indice;
}

const INSTRUCCIONES = `Eres el buscador del recetario de HoMenu (cocina de casa española). Te dan una petición en lenguaje natural y el recetario, una receta por línea: id|nombre|carpeta|tiempo|rasgos. Devuelve los ids de las recetas que MEJOR encajan con lo que se pide, de más a menos, como mucho las que te pidan. Entiende la intención («de la abuela» = casero y de siempre; «para el frío» = de cuchara, reconfortante; «que no sea pescado» excluye pescados). Si pocas encajan de verdad, devuelve pocas: mejor 3 buenas que 10 flojas. Solo ids que estén en la lista.`;

/**
 * @param {string} consulta  lo que piden, tal cual
 * @param {{ catalogo: any[], carpetaDe: (r: any) => string, n?: number }} p
 * @returns {Promise<string[]>} ids del catálogo, de más a menos
 */
export async function porSignificado(consulta, { catalogo, carpetaDe, n = 8 }) {
  if (!String(consulta ?? "").trim()) return [];
  const { ids, texto } = indiceDe(catalogo, carpetaDe);
  try {
    const r = await anthropic().messages.create({
      model: MODELO,
      max_tokens: 400,
      temperature: 0,
      system: [
        { type: "text", text: INSTRUCCIONES },
        { type: "text", text: `Recetario:\n${texto}`, cache_control: { type: "ephemeral" } },
      ],
      tools: [{
        name: "elegir",
        description: "Las recetas que encajan, de más a menos.",
        input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 12 } }, required: ["ids"] },
      }],
      tool_choice: { type: "tool", name: "elegir" },
      messages: [{ role: "user", content: `Petición: «${consulta}». Como mucho ${n}.` }],
    }, { timeout: ESPERA_MS, maxRetries: 0 });
    const elegidos = r.content.find((b) => b.type === "tool_use")?.input?.ids ?? [];
    return [...new Set(elegidos)].filter((id) => ids.has(id)).slice(0, n);
  } catch (err) {
    console.error("[significado]", String(err?.message ?? err).slice(0, 150));
    return [];
  }
}
