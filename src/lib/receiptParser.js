function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function extractJson(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Sin JSON");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/**
 * Extract product names from a receipt photo via Claude vision.
 * @returns {Promise<string[]>}
 */
export async function extractReceiptProducts(file, { signal } = {}) {
  const base64 = await fileToBase64(file);
  const mediaType = file.type?.startsWith("image/") ? file.type : "image/jpeg";

  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Lee este ticket de supermercado y extrae los nombres de productos alimenticios comprados.
Ignora totales, IVA, fecha y forma de pago.
Responde SOLO JSON: {"products":["nombre1","nombre2"]}`,
          },
        ],
      },
    ],
  };

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error("No se pudo leer el ticket");
  }

  const data = await response.json();
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = extractJson(text);
  const products = Array.isArray(parsed.products) ? parsed.products : [];
  return products.map((p) => String(p).trim()).filter(Boolean);
}
