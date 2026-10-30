import { blocked, cors } from "./_guard.js";
import { paraEscribir } from "../src/lib/vocabularios.js";
import { MAX_DESCARTES, RECETA_ID_RE } from "../src/lib/descartesForma.js";

// Analytics intake for guests (no Supabase session).
//
// Signed-in users write to user_events straight from the browser, but its RLS
// only accepts rows where user_id = auth.uid(), so a guest's insert is always
// rejected — and guests are exactly who runs onboarding and the first menu
// generation. This endpoint writes their events with the service-role key,
// tagged with a random per-browser id (metadata.anon_id) instead of a user id.
//
// Like /api/generate it is callable without a session, so everything is
// bounded here: per-IP rate limit, batch size, event-name shape, metadata size
// and timestamp window. Nothing from the body can target another user's rows —
// user_id is always null.
const MAX_EVENTS = 20;
const EVENT_RE = /^[a-z][a-z0-9_]{1,60}$/;
const ANON_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_METADATA_CHARS = 4000;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
// Los platos que un invitado tira al regenerar (receta_descartes, 0102). Misma puerta que
// los eventos: anonId con su forma, tope por petición, y la fila sale de lo validado,
// nunca del cuerpo (user_id y household_id siempre null).

/** Validates a batch and turns it into user_events rows. Exported for tests. */
export function rowsFromBody(body, now = Date.now()) {
  const { anonId, events } = body ?? {};
  if (typeof anonId !== "string" || !ANON_ID_RE.test(anonId)) return null;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS) return null;

  const rows = [];
  for (const e of events) {
    if (!e || typeof e.event !== "string" || !EVENT_RE.test(e.event)) continue;
    let metadata =
      e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata) ? e.metadata : {};
    if (JSON.stringify(metadata).length > MAX_METADATA_CHARS) metadata = { truncated: true };
    const created = Date.parse(e.created_at);
    rows.push({
      user_id: null,
      event: e.event,
      screen: typeof e.screen === "string" ? e.screen.slice(0, 60) : null,
      metadata: { ...metadata, anon_id: anonId },
      // Keep the client's timestamp (events are batched a few seconds late)
      // unless it is clearly off.
      created_at: new Date(
        Number.isFinite(created) && Math.abs(now - created) < MAX_CLOCK_SKEW_MS ? created : now,
      ).toISOString(),
    });
  }
  return rows;
}

/**
 * Valida los descartes de un invitado y los vuelve filas de receta_descartes. Sin anonId
 * válido, sin lista o con más del tope, no hay ninguna; una fila con id o alcance raros se
 * salta. Exportada para los tests.
 */
export function descartesFromBody(body) {
  const { anonId, descartes } = body ?? {};
  // Sin la clave `descartes` no hay nada que rechazar. Si viene, lo que se tira se dice en el
  // log (solo el motivo y el número, nunca el cuerpo): un lote entero rechazado no se pierde
  // sin rastro.
  if (descartes === undefined) return [];
  if (typeof anonId !== "string" || !ANON_ID_RE.test(anonId)) {
    console.warn("[track] descartes rechazados: anonId inválido");
    return [];
  }
  if (!Array.isArray(descartes) || descartes.length === 0) {
    console.warn("[track] descartes rechazados: lista vacía o no es una lista");
    return [];
  }
  if (descartes.length > MAX_DESCARTES) {
    console.warn("[track] descartes rechazados: más del tope", descartes.length);
    return [];
  }
  const rows = [];
  let idsMalos = 0;
  let alcancesMalos = 0;
  for (const d of descartes) {
    if (!d || typeof d.receta_id !== "string" || !RECETA_ID_RE.test(d.receta_id)) {
      idsMalos++;
      continue;
    }
    let fila;
    try {
      fila = { user_id: null, household_id: null, anon_id: anonId, receta_id: d.receta_id, alcance: paraEscribir("alcances_descarte", d.alcance) };
    } catch {
      alcancesMalos++;
      continue;
    }
    if (fila.alcance == null) {
      alcancesMalos++;
      continue;
    }
    rows.push(fila);
  }
  if (idsMalos > 0) console.warn("[track] descartes con id de receta inválido:", idsMalos);
  if (alcancesMalos > 0) console.warn("[track] descartes con alcance fuera del vocabulario:", alcancesMalos);
  return rows;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // A guest session flushes at most every few seconds, in batches of ≤10.
  // Generous because mobile carriers share IPs via CGNAT.
  if (await blocked(req, res, { bucket: "track", limit: 120, windowSec: 600 })) return;

  // Same env naming fallbacks as api/delete-account.js.
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[track] missing Supabase URL or service-role/secret key env vars");
    return res.status(500).json({ error: "Servidor mal configurado." });
  }

  const rows = rowsFromBody(req.body);
  const descartes = descartesFromBody(req.body);
  // Un lote de eventos presente pero inválido sigue dando 400 aunque vengan descartes buenos:
  // no se pierde en silencio. Solo descartes (sin la clave events) es una petición válida.
  const traeEventos = req.body?.events !== undefined;
  if ((traeEventos && !rows) || (!rows && descartes.length === 0)) return res.status(400).json({ error: "Batch inválido." });
  if ((rows?.length ?? 0) === 0 && descartes.length === 0) return res.status(204).end();

  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Prefer: "return=minimal",
  };
  // Legacy service_role keys are JWTs and go in Authorization too; the newer
  // sb_secret_ keys are not JWTs and PostgREST rejects them in that header.
  if (serviceRoleKey.startsWith("eyJ")) headers.Authorization = `Bearer ${serviceRoleKey}`;

  try {
    if (rows?.length) {
      const insert = await fetch(`${supabaseUrl}/rest/v1/user_events`, {
        method: "POST",
        headers,
        body: JSON.stringify(rows),
      });
      if (!insert.ok) {
        const detail = await insert.text().catch(() => "");
        console.error("[track] insert failed", insert.status, detail.slice(0, 300));
        return res.status(502).json({ error: "No se pudo guardar." });
      }
    }
    if (descartes.length > 0) {
      // Plan B: si la tabla aún no está (la migración 0102 la aplica Pablo) o falla, se
      // pierde el descarte pero la petición no falla: es analítica, no el flujo del invitado.
      const ins = await fetch(`${supabaseUrl}/rest/v1/receta_descartes`, {
        method: "POST",
        headers,
        body: JSON.stringify(descartes),
      });
      if (!ins.ok) {
        // Solo el estado: el detalle de PostgREST puede traer la fila entera.
        console.error("[track] descartes failed", ins.status);
      }
    }
    return res.status(204).end();
  } catch (err) {
    console.error("[track] insert threw", err?.name, err?.message);
    return res.status(502).json({ error: "No se pudo guardar." });
  }
}
