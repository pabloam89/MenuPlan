import { supabase } from "./supabase.js";

/**
 * Cloud access for shared households (see HOUSEHOLDS.md + 0017_households.sql).
 * All functions no-op without Supabase / session.
 */

/** @typedef {'owner' | 'viewer'} HouseholdRole */
/** @typedef {'dormant' | 'invite_ready' | 'active'} HouseholdSetupStatus */

/**
 * @typedef {Object} HouseholdSummary
 * @property {string} id
 * @property {string} name
 * @property {HouseholdRole} role
 * @property {HouseholdSetupStatus} setupStatus
 * @property {string} ownerUserId
 * @property {string|null} inviteToken
 * @property {string} joinedAt
 * @property {string} createdAt
 * @property {boolean} isOwn
 */

/**
 * @param {unknown} row
 * @returns {HouseholdSummary|null}
 */
export function parseHouseholdRow(row) {
  if (!row || typeof row !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  if (!r.id) return null;
  return {
    id: String(r.id),
    name: String(r.name ?? "Mi casa"),
    role: r.role === "owner" ? "owner" : "viewer",
    setupStatus: /** @type {HouseholdSetupStatus} */ (r.setupStatus ?? r.setup_status ?? "dormant"),
    ownerUserId: String(r.ownerUserId ?? r.owner_user_id ?? ""),
    inviteToken: r.inviteToken != null ? String(r.inviteToken) : r.invite_token != null ? String(r.invite_token) : null,
    joinedAt: String(r.joinedAt ?? r.joined_at ?? ""),
    createdAt: String(r.createdAt ?? r.created_at ?? ""),
    isOwn: Boolean(r.isOwn ?? r.is_own),
  };
}

/**
 * Ensures the signed-in user has an owned household, migrates legacy data,
 * and returns memberships + active household id.
 * @returns {Promise<{ households: HouseholdSummary[], activeHouseholdId: string|null, error?: string }|null>}
 */
export async function ensureUserHousehold() {
  if (!supabase) return { error: "Supabase no configurado en este build" };
  const { data, error } = await supabase.rpc("ensure_user_household");
  if (error) {
    console.warn("[householdsSync] ensure failed", error.message, error.code, error.details);
    return { error: error.message, households: [], activeHouseholdId: null };
  }
  const payload = data ?? {};
  const rawList = Array.isArray(payload.households) ? payload.households : [];
  return {
    households: rawList.map(parseHouseholdRow).filter(Boolean),
    activeHouseholdId: payload.activeHouseholdId ?? payload.active_household_id ?? null,
  };
}

/**
 * @param {string} householdId
 * @returns {Promise<boolean>}
 */
export async function setActiveHousehold(householdId) {
  if (!supabase || !householdId) return false;
  const { error } = await supabase.rpc("set_active_household", {
    p_household_id: householdId,
  });
  if (error) {
    console.warn("[householdsSync] setActive failed", error.message);
    return false;
  }
  return true;
}

/**
 * @param {string} token
 * @returns {Promise<{ householdId: string, alreadyMember: boolean }|null>}
 */
export async function joinHouseholdByToken(token) {
  if (!supabase || !token?.trim()) return null;
  const { data, error } = await supabase.rpc("join_household_by_token", {
    p_token: token.trim(),
  });
  if (error) {
    console.warn("[householdsSync] join failed", error.message);
    return { error: error.message };
  }
  return {
    householdId: data?.householdId ?? data?.household_id,
    alreadyMember: Boolean(data?.alreadyMember ?? data?.already_member),
  };
}

/**
 * @param {string} householdId
 * @returns {Promise<boolean>}
 */
export async function leaveHousehold(householdId) {
  if (!supabase || !householdId) return false;
  const { error } = await supabase.rpc("leave_household", {
    p_household_id: householdId,
  });
  if (error) {
    console.warn("[householdsSync] leave failed", error.message);
    return false;
  }
  return true;
}

/**
 * @param {string} householdId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function removeHouseholdMember(householdId, userId) {
  if (!supabase || !householdId || !userId) return false;
  const { error } = await supabase.rpc("remove_household_member", {
    p_household_id: householdId,
    p_user_id: userId,
  });
  if (error) {
    console.warn("[householdsSync] remove member failed", error.message);
    return false;
  }
  return true;
}

/**
 * @param {string} householdId
 * @param {{ name?: string, setupStatus?: HouseholdSetupStatus }} patch
 * @returns {Promise<boolean>}
 */
export async function updateHousehold(householdId, { name, setupStatus } = {}) {
  if (!supabase || !householdId) return false;
  const { error } = await supabase.rpc("update_household", {
    p_household_id: householdId,
    p_name: name ?? null,
    p_setup_status: setupStatus ?? null,
  });
  if (error) {
    console.warn("[householdsSync] update failed", error.message);
    return false;
  }
  return true;
}

/**
 * @param {string} householdId
 * @returns {Promise<boolean>}
 */
export async function deleteHousehold(householdId) {
  if (!supabase || !householdId) return false;
  const { error } = await supabase.rpc("delete_household", {
    p_household_id: householdId,
  });
  if (error) {
    console.warn("[householdsSync] delete failed", error.message);
    return false;
  }
  return true;
}

/**
 * @param {string|null|undefined} inviteToken
 * @param {string} [origin]
 * @returns {string|null}
 */
export function buildInviteUrl(inviteToken, origin = typeof window !== "undefined" ? window.location.origin : "") {
  if (!inviteToken || !origin) return null;
  const url = new URL(origin);
  url.searchParams.set("join", inviteToken);
  return url.toString();
}

/**
 * Reads ?join= token from the current URL (invite deep link).
 * @returns {string|null}
 */
export function readInviteTokenFromUrl() {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("join");
  return token?.trim() || null;
}

/**
 * Strips ?join= from the address bar after processing.
 */
export function clearInviteTokenFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("join")) return;
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

/**
 * @param {string|null|undefined} userId
 * @param {string|null|undefined} token
 */
export async function savePendingInviteToken(userId, token) {
  if (!supabase || !userId || !token) return;
  const { error } = await supabase.from("user_profiles").upsert(
    { user_id: userId, pending_invite_token: token },
    { onConflict: "user_id" },
  );
  if (error) console.warn("[householdsSync] pending invite save failed", error.message);
}

/**
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function loadPendingInviteToken(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("pending_invite_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[householdsSync] pending invite load failed", error.message);
    return null;
  }
  return data?.pending_invite_token ?? null;
}

/**
 * @param {HouseholdSummary[]} households
 * @param {string|null|undefined} activeId
 * @returns {HouseholdSummary|null}
 */
export function resolveActiveHousehold(households, activeId) {
  if (!households?.length) return null;
  if (activeId) {
    const hit = households.find((h) => h.id === activeId);
    if (hit) return hit;
  }
  return households.find((h) => h.role === "owner") ?? households[0];
}

/**
 * @param {HouseholdSummary|null|undefined} household
 * @returns {boolean}
 */
export function isHouseholdReadOnly(household) {
  return household?.role === "viewer";
}

/**
 * @param {HouseholdSummary|null|undefined} household
 * @returns {boolean}
 */
export function canShareHouseholdInvite(household) {
  return (
    household?.role === "owner"
    && (household.setupStatus === "invite_ready" || household.setupStatus === "active")
    && Boolean(household.inviteToken)
  );
}
