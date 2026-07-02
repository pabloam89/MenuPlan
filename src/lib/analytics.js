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

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!supabase || queue.length === 0) return;
  const batch = queue;
  queue = [];
  const { error } = await supabase.from("user_events").insert(batch);
  if (error) console.warn("[analytics] flush", error.message);
}

// Last-chance flush when the tab hides/closes: direct REST call with
// keepalive so the browser lets the request finish after the page unloads.
function flushKeepalive() {
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
  if (!supabase || !user) return;
  queue.push({
    user_id: user.id,
    event,
    screen,
    metadata,
    created_at: new Date().toISOString(),
  });
  if (queue.length >= FLUSH_SIZE) {
    flush();
    return;
  }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}
