import { supabase } from "./supabase.js";

const deviceType = () =>
  /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop";

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "mvp-2026";

export async function upsertUserProfile(user, extra = {}) {
  if (!supabase || !user) return;
  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      email: user.email,
      display_name: user.user_metadata?.full_name ?? user.email,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      device_type: deviceType(),
      locale: navigator.language ?? null,
      ...extra,
    },
    { onConflict: "user_id" }
  );
  if (error) console.warn("[analytics] upsertUserProfile", error.message);
}

// ── Event batching ──────────────────────────────────────────────
// Events queue client-side and flush in a single insert every few seconds
// (or when the queue grows). Cuts Supabase write count ~10x for tap-heavy
// events like dish_viewed. trackEvent keeps the same fire-and-forget API.

const FLUSH_MS = 5000;
const FLUSH_SIZE = 10;
let queue = [];
let flushTimer = null;

// Guests have no session, and user_events' RLS only accepts rows for
// auth.uid(), so their events go through /api/track instead (service-role
// insert, user_id null) tagged with a random per-browser id. Kept in a separate
// queue: a batch never mixes the two paths.
const GUEST_TRACK_URL = "/api/track";
const ANON_ID_KEY = "mp_anon_id";
let guestQueue = [];
let anonId = null;

function getAnonId() {
  if (anonId) return anonId;
  try {
    anonId = localStorage.getItem(ANON_ID_KEY);
  } catch {
    // storage blocked — fall through to a per-session id
  }
  if (!anonId) {
    anonId =
      globalThis.crypto?.randomUUID?.() ??
      `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    try {
      localStorage.setItem(ANON_ID_KEY, anonId);
    } catch {
      // ignore
    }
  }
  return anonId;
}

// Cached access token so the pagehide flush can authenticate synchronously
// (supabase.auth.getSession() is async — too late during unload).
let accessToken = null;
if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    accessToken = data?.session?.access_token ?? null;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
  });
}

// /api/track accepts at most 20 events per request.
const GUEST_BATCH_MAX = 20;

function sendGuestBatch({ keepalive = false } = {}) {
  while (guestQueue.length > 0) {
    const events = guestQueue.slice(0, GUEST_BATCH_MAX);
    guestQueue = guestQueue.slice(events.length);
    try {
      fetch(GUEST_TRACK_URL, {
        method: "POST",
        keepalive,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId: getAnonId(), events }),
      }).catch(() => {});
    } catch {
      // best effort
    }
  }
}

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  sendGuestBatch();
  if (!supabase || queue.length === 0) return;
  const batch = queue;
  queue = [];
  const { error } = await supabase.from("user_events").insert(batch);
  if (error) console.warn("[analytics] flush", error.message);
}

// Last-chance flush when the tab hides/closes: direct REST call with
// keepalive so the browser lets the request finish after the page unloads.
function flushKeepalive() {
  sendGuestBatch({ keepalive: true });
  if (queue.length === 0) return;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !accessToken) return;
  const batch = queue;
  queue = [];
  try {
    fetch(`${url}/rest/v1/user_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
    });
  } catch {
    // best effort — never block unload
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushKeepalive);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushKeepalive();
  });
}

export async function trackEvent(user, event, screen, metadata = {}) {
  const created_at = new Date().toISOString();
  if (user) {
    if (!supabase) return;
    queue.push({ user_id: user.id, event, screen, metadata, created_at });
  } else {
    // No user_profiles row to join against for guests, so device and version
    // travel with each event.
    guestQueue.push({
      event,
      screen,
      metadata: { ...metadata, device: deviceType(), app_version: APP_VERSION },
      created_at,
    });
  }
  if (queue.length >= FLUSH_SIZE || guestQueue.length >= FLUSH_SIZE) {
    flush();
    return;
  }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}
