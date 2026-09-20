import { blocked, cors } from "./_guard.js";

// Filtro de contenido para lo que la gente publica: comentarios, nombre
// visible, handle y biografía.
//
// Existe porque la Guideline 1.2 de App Store exige, en apps con contenido de
// usuarios, "un método para filtrar material objetable" — reportar y bloquear
// (que ya existían) son el respaldo, no el filtro. Sin esto, la ficha no pasa
// revisión.
//
// Endpoint propio y no un `task` de /api/generate a propósito: aquí la
// respuesta no es texto libre del modelo sino un veredicto de dos campos, y el
// que llama no elige ni modelo ni prompt ni longitud. Cuanto menos superficie,
// menos sitio donde convertir esto en un LLM de uso general para quien
// encuentre la URL.
//
// ── Falla ABIERTO, igual que el rate limit ────────────────────────────────
// Si Anthropic no contesta, el texto se publica y queda el log. La alternativa
// —tumbar los comentarios de toda la app porque un proveedor tiene un mal
// minuto— es peor para el usuario y no mejora la seguridad de nadie: reportar
// y bloquear siguen ahí. Lo mismo si falta la API key.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_LEN = 600;

// Categorías cerradas: el cliente las traduce a un mensaje para el usuario, y
// una categoría que no conozca cae en el mensaje genérico.
const SYSTEM = `Eres el filtro de moderación de HoMenu, una app española de cocina casera con perfiles, comentarios y recetas compartidas.

Recibes un texto escrito por una persona usuaria y decides si puede publicarse.

RECHAZA si contiene: insultos o acoso a una persona, odio o desprecio por raza, religión, sexo, orientación o nacionalidad, contenido sexual explícito, amenazas o violencia, spam o publicidad, o datos personales de terceros (teléfonos, direcciones, emails).

ACEPTA todo lo demás. En particular ACEPTA: críticas a una receta por duras que sean, jerga coloquial y tacos sueltos sin destinatario ("qué rico está esto, joder"), desacuerdos, humor, y cualquier cosa sobre comida por rara que parezca.

Ante la duda, ACEPTA: este filtro no está para imponer buenos modales.

Responde SOLO con JSON, sin texto alrededor:
{"ok":true}
o
{"ok":false,"reason":"acoso"}

reason es exactamente una de: acoso, odio, sexual, violencia, spam, datos_personales.`;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Generoso: escribir varios comentarios seguidos es uso normal, y quien
  // quiera abusar choca antes con el límite de la tabla que con este.
  if (await blocked(req, res, { bucket: "moderate", limit: 120, windowSec: 600 })) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[moderate] sin ANTHROPIC_API_KEY: se publica sin filtrar");
    return res.status(200).json({ ok: true, skipped: "no_api_key" });
  }

  const text = String(req.body?.text ?? "").trim().slice(0, MAX_LEN);
  if (!text) return res.status(200).json({ ok: true });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 64,
        system: SYSTEM,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      console.error("[moderate] Anthropic respondió", response.status, (await response.text()).slice(0, 300));
      return res.status(200).json({ ok: true, skipped: "upstream_error" });
    }

    const raw = (await response.json())?.content?.[0]?.text ?? "";
    // El modelo puede envolver el JSON en explicaciones pese al prompt; se
    // recorta al primer objeto en vez de fallar por un prefijo tonto.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("[moderate] respuesta sin JSON:", raw.slice(0, 200));
      return res.status(200).json({ ok: true, skipped: "unparseable" });
    }

    const verdict = JSON.parse(match[0]);
    if (verdict?.ok === false) {
      return res.status(200).json({ ok: false, reason: String(verdict.reason ?? "otro") });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[moderate] falló la llamada", err?.name, err?.message);
    return res.status(200).json({ ok: true, skipped: "exception" });
  }
}
