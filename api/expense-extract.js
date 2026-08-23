import { blocked } from "./_guard.js";

// Server-side proxy to the Anthropic API for the expense tracker
// (apps/expense-tracker, served at /admin/expenses). Reads an uploaded
// invoice/receipt (image or PDF) with Claude vision and returns structured
// JSON. Mirrors api/generate.js's shape but is a dedicated endpoint because:
//
//   · the model, system prompt and max_tokens are all pinned here rather than
//     accepted from the client — same reasoning as api/generate.js: the
//     request body is attacker-controlled, so nothing that costs money can
//     come from the caller;
//   · this is meant to be an internal/admin tool, not a public feature, so it
//     adds one more layer on top of the shared rate limiter: an optional
//     shared-secret gate via ADMIN_EXPENSES_TOKEN. When that env var isn't
//     set (e.g. local dev), the gate is a no-op — same fail-open convention
//     as the rest of api/_guard.js.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const MAX_BASE64_LEN = 15_000_000; // ~10.5MB decoded — comfortably covers a photographed receipt or a multi-page PDF invoice
const ALLOWED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const SERVICES = [
  "Vercel",
  "Cursor",
  "Midjourney",
  "Gemini AI Studio",
  "Da Vinci Resolve",
  "Google Workspace",
  "Claude (Anthropic)",
  "API de MenuPlan",
  "Otro",
];

const SYSTEM_PROMPT = `Eres un asistente que extrae datos estructurados de facturas y recibos de gastos de software/servicios para un equipo interno.

Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin texto antes o después) con estos campos exactos:

{
  "date": "YYYY-MM-DD o null si no se puede determinar",
  "amount": número (el importe total pagado, sin símbolo de moneda) o null,
  "currency": "código ISO 4217 de 3 letras (ej. EUR, USD) o null",
  "service": "uno EXACTO de esta lista: ${SERVICES.join(", ")}",
  "customService": "si service es \\"Otro\\", el nombre real del servicio/proveedor tal como aparece en la factura; en cualquier otro caso, null",
  "description": "descripción breve en español (máx. 100 caracteres) de qué es el gasto (plan, concepto, periodo de facturación, etc.)"
}

Reglas:
- "service" debe coincidir EXACTAMENTE con una de las opciones listadas. Si el proveedor de la factura no es ninguno de ellos, usa "Otro" y pon el nombre real en "customService".
- Si algún dato no se puede determinar con certeza a partir del documento, usa null en ese campo (excepto "service", que siempre debe tener un valor de la lista).
- No inventes datos que no aparezcan en el documento.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requiredToken = process.env.ADMIN_EXPENSES_TOKEN;
  if (requiredToken && req.headers["x-admin-token"] !== requiredToken) {
    return res.status(401).json({ error: "Código de acceso inválido." });
  }

  if (await blocked(req, res, { bucket: "expense-extract", limit: 40, windowSec: 600 })) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  try {
    const { fileBase64, mediaType, filename } = req.body ?? {};

    if (typeof fileBase64 !== "string" || !fileBase64) {
      return res.status(400).json({ error: "fileBase64 es requerido" });
    }
    if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
      return res.status(400).json({ error: "Tipo de archivo no soportado" });
    }
    if (fileBase64.length > MAX_BASE64_LEN) {
      return res.status(400).json({ error: "Archivo demasiado grande (máx. ~10MB)" });
    }

    const isPdf = mediaType === "application/pdf";
    const documentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              documentBlock,
              {
                type: "text",
                text: `Extrae los datos de este documento de gasto${filename ? ` ("${filename}")` : ""}. Responde solo con el JSON.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (data?.usage) {
      console.log(
        JSON.stringify({ tag: "llm_usage", endpoint: "expense-extract", model: MODEL, ...data.usage }),
      );
    }

    const text = data?.content?.find((block) => block.type === "text")?.text ?? "";
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return res.status(502).json({ error: "No se pudo interpretar la respuesta de la IA", raw: text });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
