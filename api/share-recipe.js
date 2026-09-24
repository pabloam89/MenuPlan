import { readFileSync } from "node:fs";
import { rateLimit } from "./_guard.js";

// La preview de un enlace a receta (WhatsApp, Telegram, iMessage...).
//
// La app es una SPA: todas sus URLs devuelven el mismo index.html, así que un
// enlace a una receta salía en WhatsApp como "HoMenu" y sin foto, igual que
// cualquier otro. Los robots de previsualización no ejecutan JavaScript: leen
// el HTML que les llega y buscan las etiquetas Open Graph.
//
// vercel.json reescribe /r/<id> aquí. A un robot se le devuelve un HTML mínimo
// con og:title / og:image; a una persona, una redirección a la app (/?r=<id>),
// que es quien sabe abrir la ficha. Servir HTML también a las personas
// funcionaría, pero pasarían por una página en blanco antes de la app.
//
// La foto no se enlaza tal cual: las subidas al bucket pesan hasta 5 MB y
// WhatsApp no pinta imágenes por encima de unos cientos de KB. ?img=1 devuelve
// una miniatura JPEG reducida con sharp, cacheable en la CDN.

const ID_RE = /^[a-z0-9_-]{1,80}$/i;
const TOKEN_RE = /^[a-f0-9]{32}$/;
const CRAWLER_RE =
  /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|pinterest|skypeuripreview|applebot|googlebot|bingbot|embedly|redditbot|snapchat|viber|vkshare|line\/|quora link preview|outbrain|w3c_validator/i;

const THUMB_MAX_PX = 720;
const THUMB_QUALITY = 72;
const FETCH_TIMEOUT_MS = 8000;

let manifestCache = null;
/** Foto de catálogo por id de plato (el mismo manifiesto que usa la app). */
function catalogImage(id) {
  if (!id) return null;
  if (!manifestCache) {
    try {
      manifestCache = JSON.parse(
        readFileSync(new URL("../src/assets/dishes/dishImages.json", import.meta.url), "utf8"),
      );
    } catch {
      manifestCache = {};
    }
  }
  return manifestCache[id] ?? null;
}

export function isCrawler(userAgent) {
  return CRAWLER_RE.test(String(userAgent ?? ""));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * El HTML que lee el robot. Lleva también la redirección a la app por si un
 * robot desconocido cae aquí como persona: nadie se queda en una página en
 * blanco. Exportado para el test.
 */
export function buildShareHtml({ url, title, description, image, redirect }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const r = escapeHtml(redirect);
  const img = image
    ? `<meta property="og:image" content="${escapeHtml(image)}">\n` +
      `<meta property="og:image:type" content="image/jpeg">\n` +
      `<meta name="twitter:card" content="summary_large_image">\n` +
      `<meta name="twitter:image" content="${escapeHtml(image)}">\n`
    : `<meta name="twitter:card" content="summary">\n`;
  return (
    `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n` +
    `<title>${t} · HoMenu</title>\n` +
    `<meta name="description" content="${d}">\n` +
    `<meta property="og:type" content="article">\n` +
    `<meta property="og:site_name" content="HoMenu">\n` +
    `<meta property="og:locale" content="es_ES">\n` +
    `<meta property="og:title" content="${t}">\n` +
    `<meta property="og:description" content="${d}">\n` +
    `<meta property="og:url" content="${u}">\n` +
    img +
    `<meta name="twitter:title" content="${t}">\n` +
    `<meta name="twitter:description" content="${d}">\n` +
    `<meta http-equiv="refresh" content="0;url=${r}">\n` +
    `</head>\n<body><a href="${r}">Abrir en HoMenu</a></body>\n</html>\n`
  );
}

function supabaseConfig() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  // Basta la clave anónima: recipe_from_link decide por sí sola qué enseña.
  // La de servicio solo como respaldo si el entorno no trae la pública.
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
 * Nombre, foto y autor de lo que hay detrás del enlace, o null si no hay nada
 * que enseñar. Las recetas de gente pasan por recipe_from_link (0055), que
 * aplica la llave y las políticas; las del catálogo se leen de la tabla
 * pública y su foto sale del manifiesto.
 */
async function resolveRecipe({ id, token }) {
  const sb = supabaseConfig();
  if (!sb) return null;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  if (id.startsWith("user_")) {
    const r = await fetch(`${sb.url}/rest/v1/rpc/recipe_from_link`, {
      method: "POST",
      headers: sb.headers,
      body: JSON.stringify({ p_recipe: id, p_token: token ?? null }),
      signal,
    });
    if (!r.ok) return null;
    const out = await r.json().catch(() => null);
    if (out?.status === "ok" && out.recipe) {
      const row = out.recipe;
      return {
        name: row.name,
        image: row.photo || catalogImage(row.linked_catalog_id ?? row.base_dish_id),
        owner: row.owner_snapshot?.name ?? null,
        locked: false,
      };
    }
    if (out?.status === "locked" && out.preview) {
      const p = out.preview;
      return {
        name: p.name,
        image: p.photo || catalogImage(p.linked_catalog_id ?? p.base_dish_id),
        owner: p.owner?.display_name || (p.owner?.username ? `@${p.owner.username}` : null),
        locked: true,
      };
    }
    return null;
  }

  const r = await fetch(
    `${sb.url}/rest/v1/recipes?id=eq.${encodeURIComponent(id)}&select=name&limit=1`,
    { headers: sb.headers, signal },
  );
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  const name = rows?.[0]?.name;
  if (!name) return null;
  return { name, image: catalogImage(id), owner: null, locked: false };
}

function describeFound(found) {
  if (!found) return "Una receta en HoMenu";
  if (found.locked) return `Receta de ${found.owner ?? "una cuenta cerrada"}. Conéctate para verla en HoMenu.`;
  if (found.owner) return `Receta de ${found.owner} en HoMenu.`;
  return "Del catálogo de HoMenu.";
}

/** Solo se reduce lo que es nuestro: el bucket de Supabase y el Blob de Vercel. */
function allowedImageHost(host, sb) {
  if (host.endsWith(".public.blob.vercel-storage.com")) return true;
  try {
    return sb && new URL(sb.url).host === host;
  } catch {
    return false;
  }
}

async function sendThumbnail(res, image) {
  if (!image) return res.status(404).end();
  let buf;
  if (image.startsWith("data:")) {
    // Fotos antiguas aún incrustadas en la fila (ver lib/recipePhotos.js).
    const body = image.split(",")[1];
    if (!body) return res.status(404).end();
    buf = Buffer.from(body, "base64");
  } else {
    let u;
    try {
      u = new URL(image);
    } catch {
      return res.status(404).end();
    }
    if (u.protocol !== "https:" || !allowedImageHost(u.host, supabaseConfig())) {
      return res.status(404).end();
    }
    const up = await fetch(u, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!up.ok) return res.status(404).end();
    buf = Buffer.from(await up.arrayBuffer());
  }

  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buf)
      .rotate()
      .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toBuffer();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).send(out);
  } catch (err) {
    // Sin sharp (o imagen corrupta): la original tal cual. Puede que WhatsApp
    // no la pinte por peso, pero es mejor que nada.
    console.warn("[share-recipe] miniatura fallida", err?.message);
    if (image.startsWith("data:")) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.redirect(302, image);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = typeof req.query?.id === "string" ? req.query.id : "";
  const rawToken = typeof req.query?.t === "string" ? req.query.t : "";
  if (!ID_RE.test(id)) return res.status(400).json({ error: "Enlace inválido." });
  const token = TOKEN_RE.test(rawToken) ? rawToken : null;

  // Solo tope por IP: el guard completo (origen, presupuesto diario) es para
  // las rutas de IA, y aquí llegan robots sin cabecera Origin a propósito.
  const { ok, retryAfter } = await rateLimit(req, { bucket: "share", limit: 300, windowSec: 600 });
  if (!ok) {
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).end();
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const origin = `https://${host}`;
  const q = token ? `?t=${token}` : "";

  let found = null;
  try {
    found = await resolveRecipe({ id, token });
  } catch (err) {
    console.warn("[share-recipe] resolve failed", err?.message);
  }

  if (req.query?.img === "1") {
    return sendThumbnail(res, found?.image ?? null);
  }

  const redirect = `/?r=${encodeURIComponent(id)}${token ? `&t=${token}` : ""}`;
  // Ni CDN ni navegador guardan esto: la respuesta depende de quién pregunta
  // (robot o persona) y de una llave que puede dejar de valer.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "User-Agent");

  if (!isCrawler(req.headers["user-agent"])) {
    return res.redirect(302, redirect);
  }

  const html = buildShareHtml({
    url: `${origin}/r/${encodeURIComponent(id)}${q}`,
    title: found?.name ?? "Una receta en HoMenu",
    description: describeFound(found),
    image: found?.image ? `${origin}/api/share-recipe?id=${encodeURIComponent(id)}${token ? `&t=${token}` : ""}&img=1` : null,
    redirect,
  });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
