import { GoogleGenAI } from "@google/genai";

// Generates a single dish photo on demand for the recipe-creation wizard
// (src/screens/RecipePlanner.jsx). Reuses, verbatim, the fixed style formula
// that produced the entire curated catalog (scripts/lib/combos.mjs#buildPrompt)
// so AI-made photos stay visually consistent with the rest of MenuPlan —
// only the dish name changes, nothing else about the prompt.
const MODEL = "gemini-2.5-flash-image";

function buildPhotoPrompt(dishName) {
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dishName}. ` +
    `Servido en un bol de cerámica rústica moteada de color crema con borde marrón oscuro, ` +
    `perfectamente centrado sobre un fondo de pizarra negra texturizada que llena todo el encuadre. ` +
    `Iluminación natural difusa y suave, texturas hiperrealistas, estética minimalista y rústica, ` +
    `calidad de libro de cocina. ` +
    `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol.`
  );
}

// Every recipe in the "bebes" category ends its steps with "triturar" (blend
// to a smooth liquid purée) or "chafar"/"triturar o chafar" (fork-mash — a
// lumpier, spoonable texture like mashed potato or scrambled egg mashed with
// veg, NOT a liquid-smooth cream). The general prompt above produces
// adult-style plating (a whole salmon fillet, individual pasta shapes) which a
// baby literally cannot eat and misrepresents the dish; forcing the SAME
// perfectly-smooth-cream look onto a mashed dish like "Revuelto de huevo"
// misrepresents it just as much in the other direction (it isn't a soup).
// buildBabyPureePrompt = liquid-smooth purée (recipes whose last step is
// "triturar" only). buildBabyMashPrompt = chunkier mash, below.
function buildBabyPureePrompt(dishName) {
  return (
    `Fotografía cenital de un tarrito/papilla de bebé de "${dishName}", tipo potito comercial de bebé. ` +
    `TODO el contenido del bol es UNA SOLA masa triturada, lisa, cremosa y completamente homogénea, ` +
    `de un único color uniforme resultante de mezclar y batir juntos TODOS los ingredientes — como si se ` +
    `hubiera pasado entero por una batidora hasta quedar sin grumos. ` +
    `PROHIBIDO ABSOLUTAMENTE: ningún filete ni trozo de pescado o carne reconocible, ninguna pieza de ` +
    `verdura entera o en dados, ningún grano de arroz, pasta o legumbre suelto, nada crujiente ni tostado, ` +
    `ninguna textura, capa o elemento diferenciado sobre la superficie — ni un solo ingrediente debe ser ` +
    `identificable a simple vista, todo forma una crema lisa de un solo color. ` +
    `Superficie totalmente lisa y mate, como un puré de bebé recién batido, sin ningún relieve. ` +
    `El color resulta de MEZCLAR VISUALMENTE todos los ingredientes según su proporción real en la ` +
    `receta (por ejemplo: si lleva verdura de hoja verde en cantidad significativa, el resultado debe ` +
    `tener un tono verdoso u oliva perceptible, no el color limpio de un solo ingrediente dominante) — ` +
    `nunca el color aislado del ingrediente más vistoso o apetitoso, sino el tono real de una mezcla batida. ` +
    `Servido en un bol de cerámica rústica moteada de color crema con borde marrón oscuro, ` +
    `perfectamente centrado sobre un fondo de pizarra negra texturizada que llena todo el encuadre. ` +
    `Iluminación natural difusa y suave, estética minimalista y rústica. ` +
    `SOLO el bol con la papilla en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ningún objeto fuera del bol.`
  );
}

// For dishes fork-mashed ("chafar"), not blended smooth ("triturar"): e.g. a
// scrambled egg mashed with sweet potato, or pasta/couscous mashed with fish.
// The correct baby-safe texture here is a soft, chunky mash with small, soft
// visible pieces (like well-mashed potato or soft scrambled egg curds) — NOT
// a liquid-smooth cream (that would misrepresent a "revuelto" as a soup) and
// NOT whole/discrete pieces like a plated adult dish (a fork-mash has no large
// intact pieces, everything is broken down small and soft).
function buildBabyMashPrompt(dishName) {
  return (
    `Fotografía cenital de una papilla de bebé de "${dishName}", chafada con tenedor (no batida ni licuada): ` +
    `una masa blanda y húmeda de trozos pequeños y suaves, del tamaño de un grano de arroz o menor, ` +
    `bien integrados entre sí — como puré de patata casero chafado con tenedor o huevo revuelto ` +
    `bien machacado con verdura. ` +
    `PROHIBIDO: piezas grandes o enteras reconocibles (nada de filete entero, pieza de pasta entera, ` +
    `verdura en dados grandes), pero TAMBIÉN prohibido que sea una crema completamente lisa y ` +
    `líquida sin ninguna textura — debe verse claramente machacado/chafado, con pequeños grumos ` +
    `blandos visibles en la superficie, nunca un puré de textura perfectamente uniforme. ` +
    `El color resulta de mezclar visualmente todos los ingredientes según su proporción real en la receta. ` +
    `Servido en un bol de cerámica rústica moteada de color crema con borde marrón oscuro, ` +
    `perfectamente centrado sobre un fondo de pizarra negra texturizada que llena todo el encuadre. ` +
    `Iluminación natural difusa y suave, estética minimalista y rústica. ` +
    `SOLO el bol con la papilla en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ningún objeto fuera del bol.`
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_AI_STUDIO_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_AI_STUDIO_KEY not configured on server" });
  }

  const dishName = String(req.body?.dishName ?? "").trim();
  if (!dishName) {
    return res.status(400).json({ error: "dishName is required" });
  }
  const category = String(req.body?.category ?? "").trim();
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

  function babyPhotoPrompt() {
    // Whether the recipe's own steps mash ("chafar") or blend smooth
    // ("triturar") the dish decides which baby-texture prompt to use — see
    // the two functions above for why forcing the wrong one misrepresents
    // the dish (a "revuelto" mashed with a fork isn't a liquid cream, and a
    // vegetable purée blended smooth isn't a chunky mash).
    const stepsText = steps.join(" ").toLowerCase();
    return stepsText.includes("chafar") || stepsText.includes("chafa")
      ? buildBabyMashPrompt(dishName)
      : buildBabyPureePrompt(dishName);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = category === "bebes" ? babyPhotoPrompt() : buildPhotoPrompt(dishName);

    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
        httpOptions: { timeout: 60000, headers: {} },
      },
    });

    let imgPart = null;
    for await (const chunk of stream) {
      const parts = chunk?.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
      }
    }

    if (!imgPart) {
      return res.status(502).json({ error: "La IA no devolvió ninguna imagen. Prueba de nuevo." });
    }

    const mime = imgPart.inlineData.mimeType || "image/jpeg";
    const photo = `data:${mime};base64,${imgPart.inlineData.data}`;
    return res.status(200).json({ photo });
  } catch (err) {
    console.error("[generate-dish-photo]", err?.message);
    return res.status(502).json({ error: err?.message || "No se pudo generar la foto." });
  }
}
