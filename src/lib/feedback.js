import { supabase } from "./supabase.js";

export async function submitFeedback({ type, message, screen, user, metadata = {} }) {
  if (!supabase) throw new Error("Supabase not configured");
  const row = {
    user_id: user.id,
    user_email: user.email,
    type,
    message,
    screen,
    metadata,
    user_agent: navigator.userAgent,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("app_feedback").insert(row);
  if (error) throw error;
}
