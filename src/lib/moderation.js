import { apiUrl } from "./apiUrl.js";

/**
 * Revisa un texto antes de publicarlo. Ver `api/moderate.js` para el porqué.
 *
 * Falla ABIERTO: si la red o el endpoint fallan, se publica. El filtro es una
 * capa más sobre reportar y bloquear, no el muro que sostiene la app, y dejar
 * a la gente sin poder comentar porque un proveedor tarda es peor remedio que
 * la enfermedad.
 *
 * @returns {Promise<{ok: boolean, message?: string}>} `message` ya viene
 *   redactado para enseñárselo a quien escribe.
 */
const MENSAJES = {
  acoso: "Ese comentario va contra alguien. Reescríbelo sin el ataque personal.",
  odio: "Eso no se puede publicar: contiene desprecio hacia un grupo de personas.",
  sexual: "Ese texto tiene contenido sexual explícito y aquí no encaja.",
  violencia: "Eso contiene amenazas o violencia y no se puede publicar.",
  spam: "Eso parece publicidad. HoMenu no es sitio para anuncios.",
  datos_personales: "No publiques datos personales de otra persona (teléfonos, direcciones o emails).",
};
const GENERICO = "Ese texto no se puede publicar. Prueba a escribirlo de otra forma.";

export async function reviewText(text) {
  const clean = (text ?? "").trim();
  if (!clean) return { ok: true };

  try {
    const res = await fetch(apiUrl("/api/moderate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });
    if (!res.ok) return { ok: true };

    const verdict = await res.json();
    if (verdict?.ok === false) {
      return { ok: false, message: MENSAJES[verdict.reason] ?? GENERICO };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
