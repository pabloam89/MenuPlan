import { supabase } from "./supabase.js";

const deviceType = () =>
  /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop";

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

export async function trackEvent(user, event, screen, metadata = {}) {
  if (!supabase || !user) return;
  const { error } = await supabase.from("user_events").insert({
    user_id: user.id,
    event,
    screen,
    metadata,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn("[analytics] trackEvent", error.message);
}
