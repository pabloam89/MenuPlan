// La app como frontal de Lola (30 sep 2026).
//
// HoMenu pasa a ser «chatbot first»: lo normal es hablar con Lola en
// Telegram, pero todo se puede cambiar también desde la app (los dos escriben
// en la misma casa). Con este interruptor encendido:
//   · Inicio: «Pídeselo a Lola» en vez de «Generar menú»;
//   · la entrada ofrece hablar con Lola antes que la cuenta;
//   · el Menú y la Compra tienen su botón para pedírselo a Lola;
//   · la barra baja a Inicio · Recetas · Menú · Compra (Gente, fuera);
//   · sin guías ni tutoriales.
// Apagarlo devuelve la app de antes tal cual: no se ha borrado nada.

import { supabase } from "./supabase.js";
import { payloadStart } from "./pedidoLola.js";

export const FRONTAL_BOT = true;

// Guías, visitas y tutoriales de la app: apagados con el frontal (el alta y
// la configuración viven en el chat) y en staging (VITE_GUIAS por rama, ver
// vite.config.js). EXACTAMENTE `import.meta.env.VITE_GUIAS`, sin `?.`: si no,
// el define de Vite no lo sustituye.
export const GUIAS_ACTIVAS = !FRONTAL_BOT && import.meta.env.VITE_GUIAS !== "off";

export const BOT_URL = "https://t.me/homenuers_bot";

/**
 * Abre Telegram con Lola. Con sesión, el enlace lleva un código de un solo
 * uso (api/bot/link) que conecta ese chat con esta casa; sin sesión, el bot a
 * secas, que da el alta (o reconoce a quien ya se conectó desde ese Telegram).
 *
 * `pedido` (src/lib/pedidoLola.js): lo que se le pide desde ese sitio
 * («cambia la cena del viernes»). Va en el mismo /start y Lola lo atiende
 * nada más abrirse, como si se lo hubieran escrito.
 */
let abriendo = false;
export async function abrirLola(pedido = null) {
  // `onClick={abrirLola}` pasa el evento del clic: eso no es un pedido.
  if (typeof pedido !== "string") pedido = null;
  // Un doble toque no crea dos códigos.
  if (abriendo) return;
  abriendo = true;
  setTimeout(() => { abriendo = false; }, 4000);
  try {
    const token = (await supabase?.auth.getSession())?.data?.session?.access_token;
    if (token) {
      const res = await fetch("/api/bot/link", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.privado) {
        window.location.href = pedido ? `${body.privado}-${pedido}` : body.privado;
        return;
      }
    }
  } catch {
    // Sin enlace con código, al bot a secas: mejor eso que un error.
  }
  window.location.href = pedido ? `${BOT_URL}?start=${payloadStart(null, pedido)}` : BOT_URL;
}

/**
 * Acabó el alta en la app: que Lola lo diga en su chat, si hay uno (quien
 * eligió «Prefiero rellenarlo en la app» lo tiene esperando). Sin chat, el
 * servidor no hace nada. Suelto: si falla, el alta ya está hecha igual.
 */
export async function avisarAltaALola() {
  try {
    const token = (await supabase?.auth.getSession())?.data?.session?.access_token;
    if (!token) return;
    await fetch("/api/bot/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ aviso: "alta" }),
    });
  } catch {
    // Sin red: Lola lo verá en la casa la próxima vez que le escriban.
  }
}

/**
 * ¿Esta persona ya habla con Lola en Telegram? true, false, o null si no se
 * sabe (sin sesión o sin red): quien pinta el botón decide qué hacer con null.
 */
export async function lolaConectada() {
  try {
    const token = (await supabase?.auth.getSession())?.data?.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/bot/link", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()).conectado === true;
  } catch {
    return null;
  }
}
