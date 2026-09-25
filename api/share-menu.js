/**
 * La preview de una SEMANA compartida por enlace.
 *
 * Hermana de api/share-recipe.js y con el mismo reparto de trabajo: WhatsApp,
 * Telegram y compañía piden esta URL antes de pintar la burbuja, y esperan
 * etiquetas Open Graph en el HTML. Una persona no ve nada de esto — se la
 * manda de vuelta a la app con un 302.
 *
 * ── Qué enseña y qué no ────────────────────────────────────────────────────
 *
 * El título y los platos de la semana, que es lo que hace que la burbuja
 * merezca un toque. Sin foto: un menú no tiene UNA imagen —tiene catorce— y
 * componer un mosaico en la función costaría segundos que el móvil de quien
 * comparte no espera (la lección de `warmShareImage` en lib/shareLink.js). La
 * preview sale como tarjeta de texto, que es lo que hacen también las apps de
 * recetas cuando comparten una lista.
 *
 * ── Quién decide si se puede ver ───────────────────────────────────────────
 *
 * Nadie aquí: `menu_from_link` (0056) aplica la llave en el servidor y
 * devuelve `gone` si no vale. Esta función se limita a preguntar con la clave
 * anónima y a maquetar lo que le contesten.
 */

import { rateLimit } from "./_guard.js";
import { isCrawler, escapeHtml, buildShareHtml } from "./share-recipe.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[a-f0-9]{32}$/;

function supabaseConfig() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return { url, headers };
}

/**
 * Los primeros platos de la semana, para la descripción.
 *
 * El payload lo construye lib/sharedMenu.js y su forma es
 * `{ weeks: [{ days: [{ day, meals: [{ meal, dishes: [{ name }] }] }] }] }`.
 * Se lee a la defensiva porque esto corre en un servidor y un payload viejo no
 * puede tumbar la preview: peor que una descripción corta es una burbuja sin
 * nada.
 */
export function resumenDePlatos(payload, tope = 4) {
  const nombres = [];
  for (const semana of payload?.weeks ?? []) {
    for (const dia of semana?.days ?? []) {
      for (const comida of dia?.meals ?? []) {
        for (const plato of comida?.dishes ?? []) {
          if (plato?.name) nombres.push(plato.name);
          if (nombres.length >= tope) return nombres;
        }
      }
    }
  }
  return nombres;
}

/** Cuántos platos trae la semana entera, para el «y N más». */
export function cuentaDePlatos(payload) {
  let n = 0;
  for (const semana of payload?.weeks ?? []) {
    for (const dia of semana?.days ?? []) {
      for (const comida of dia?.meals ?? []) n += (comida?.dishes ?? []).length;
    }
  }
  return n;
}

/** La frase de la burbuja: cuatro platos y cuántos quedan. */
export function descripcionDelMenu(payload) {
  const total = cuentaDePlatos(payload);
  if (total === 0) return "Una semana de comidas en HoMenu.";
  const muestra = resumenDePlatos(payload, 4);
  const restan = total - muestra.length;
  return muestra.join(" · ") + (restan > 0 ? ` y ${restan} más` : "");
}

async function resolverMenu({ id, token }) {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const res = await fetch(`${cfg.url}/rest/v1/rpc/menu_from_link`, {
    method: "POST",
    headers: cfg.headers,
    body: JSON.stringify({ p_id: id, p_token: token }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.status === "ok" ? data : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = typeof req.query?.id === "string" ? req.query.id : "";
  const rawToken = typeof req.query?.t === "string" ? req.query.t : "";
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Enlace inválido." });
  const token = TOKEN_RE.test(rawToken) ? rawToken : null;

  const { ok, retryAfter } = await rateLimit(req, { bucket: "share", limit: 300, windowSec: 600 });
  if (!ok) {
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).end();
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const origin = `https://${host}`;
  const redirect = `/?m=${encodeURIComponent(id)}${token ? `&t=${token}` : ""}`;

  // Ni CDN ni navegador guardan esto: la respuesta depende de una llave que
  // puede dejar de valer, y de si pregunta un robot o una persona.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "User-Agent");

  if (!isCrawler(req.headers["user-agent"])) {
    return res.redirect(302, redirect);
  }

  let menu = null;
  try {
    menu = await resolverMenu({ id, token });
  } catch (err) {
    console.warn("[share-menu] resolve failed", err?.message);
  }

  const quien = menu?.owner?.displayName || menu?.owner?.username;
  const title = menu?.title || (quien ? `La semana de ${quien}` : "Nuestra semana");
  const description = menu
    ? descripcionDelMenu(menu.payload)
    : "Abre este menú en HoMenu.";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(buildShareHtml({
    url: `${origin}/m/${encodeURIComponent(id)}${token ? `?t=${token}` : ""}`,
    title: escapeHtml(title),
    description,
    image: null,
    redirect,
  }));
}
