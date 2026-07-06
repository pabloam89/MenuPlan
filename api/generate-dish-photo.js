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

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = buildPhotoPrompt(dishName);

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
