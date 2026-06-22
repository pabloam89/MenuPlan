// Diagnostic: isolate the Gemini image hang/timeout problem
// Run: node --env-file=.env.local scripts/diag-gemini.mjs

import { GoogleGenAI } from "@google/genai";
import { writeFileSync } from "fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_STUDIO_KEY });

const PROMPT =
  "Fotografía cenital a 90 grados de una tortilla española en un bol de cerámica " +
  "rústica moteada con borde oscuro, sobre fondo de pizarra negra. Iluminación " +
  "natural difusa, minimalista. Solo el bol, sin cubiertos ni props.";

function extractImage(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  return parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
}

// Try with streaming (the documented workaround for the SDK hang bug)
async function tryStream(model) {
  const t0 = Date.now();
  console.log(`\n=== STREAM ${model} ===`);
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: [{ role: "user", parts: [{ text: PROMPT }] }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
        httpOptions: { timeout: 120000, headers: {} },
      },
    });

    let imgPart = null;
    let textChunks = "";
    for await (const chunk of stream) {
      const parts = chunk?.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
        if (p.text) textChunks += p.text;
      }
      console.log(`  …chunk @ ${Date.now() - t0}ms (img=${!!imgPart})`);
    }

    if (imgPart) {
      const out = `public/dishes/diag_${model.replace(/[^a-z0-9]/gi, "_")}.jpg`;
      writeFileSync(out, Buffer.from(imgPart.inlineData.data, "base64"));
      console.log(`  ✅ IMAGE saved → ${out} in ${Date.now() - t0}ms`);
    } else {
      console.log(`  ⚠️  No image in ${Date.now() - t0}ms. Text: ${textChunks.slice(0, 200)}`);
    }
  } catch (e) {
    console.error(`  ❌ FAIL in ${Date.now() - t0}ms: ${e.message?.slice(0, 200)}`);
    if (e.cause) console.error(`     cause: ${JSON.stringify(e.cause).slice(0, 200)}`);
  }
}

await tryStream("gemini-2.5-flash-image");
await tryStream("gemini-3-pro-image");

console.log("\nDone.");
