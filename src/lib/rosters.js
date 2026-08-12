import { uid } from "./groups.js";

/**
 * Rosters — the isolated sets of people you plan menús for.
 *
 * The app was built around exactly one roster living directly on `data`
 * (`data.members`, `data.groups`, …). "Otro grupo" only navigated into
 * onboarding without touching that, so anyone added while setting up a
 * different group was appended to the household you already had, permanently,
 * and the tier menus never learned about them.
 *
 * A roster now owns every field that describes *who eats and how they eat*.
 * The active roster keeps living at the top level of `data`, so the hundreds of
 * `data.members` / `data.groups` reads across the app work exactly as before;
 * the inactive ones are parked under `data.rosters` and swapped in on demand.
 *
 * Everything that describes the cook, the kitchen, the pantry, prices or the
 * account stays shared and is deliberately absent from ROSTER_SCOPED_KEYS —
 * your knife skills and your supermarket don't change because tonight you're
 * cooking for your in-laws.
 */

export const DEFAULT_ROSTER_ID = "default";
export const DEFAULT_ROSTER_NAME = "Mi familia";

/**
 * Fields swapped when you change roster. Adding a field here is what makes it
 * "per group"; leaving it out makes it shared across every group.
 */
export const ROSTER_SCOPED_KEYS = [
  // Who they are and how their menús are split
  "members",
  "groups",
  "menuModel",
  // What this group avoids / insists on
  "dislikes",
  "customAllergies",
  "customDislikes",
  "fixedDishes",
  // Which meals are planned and how a plate is built
  "meals",
  "extraMeals",
  "mealStructure",
  // When and where they eat
  "schedule",
  "menuScheduleSameForAllWeeks",
  "menuWeekOverrides",
  "schoolMenus",
  // Nutrition targets, globally and per menu-group
  "goals",
  "goalsByGroup",
  "kcal",
  "kcalByGroup",
  "freqs",
  "freqsByGroup",
  // Which weeks this group's menú covers
  "menuWeek",
  "menuWeekOffsets",
  "menuVarietyPref",
  // Generated menús belong to the group they were cooked for
  "menus",
  "activeMenuId",
];

function pickScoped(source) {
  const out = {};
  for (const key of ROSTER_SCOPED_KEYS) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

/** The active roster's current state, as stored on `data`. */
export function rosterSnapshot(data) {
  return pickScoped(data);
}

/**
 * A brand-new, empty roster. Built from INITIAL_DATA rather than a second copy
 * of the defaults, so the two can't drift apart.
 */
export function blankRosterSnapshot(defaults) {
  return structuredClone(pickScoped(defaults));
}

export function rosterName(data, id) {
  return data.rosters?.[id]?.name ?? DEFAULT_ROSTER_NAME;
}

/** Write the live top-level fields back into the active roster's slot. */
export function saveActiveRoster(data) {
  const id = data.activeRosterId;
  if (!id) return data;
  const existing = data.rosters?.[id];
  return {
    ...data,
    rosters: {
      ...(data.rosters ?? {}),
      [id]: {
        id,
        name: existing?.name ?? DEFAULT_ROSTER_NAME,
        createdAt: existing?.createdAt ?? Date.now(),
        snapshot: rosterSnapshot(data),
      },
    },
  };
}

/**
 * Give an account that predates rosters the one it always implicitly had, so
 * its existing household becomes a normal, switchable roster instead of a
 * special case everything else has to work around.
 */
export function ensureRosters(data) {
  const id = data.activeRosterId ?? DEFAULT_ROSTER_ID;
  if (data.rosters?.[id]) return data.activeRosterId ? data : { ...data, activeRosterId: id };
  return saveActiveRoster({ ...data, activeRosterId: id, rosters: data.rosters ?? {} });
}

/**
 * Park the current roster and make `targetId` live. The caller still has to
 * rehydrate `menuPlan`/`shopping`, which live outside `data`.
 */
export function switchRoster(data, targetId) {
  if (!targetId || targetId === data.activeRosterId) return data;
  const target = data.rosters?.[targetId];
  if (!target) return data;
  const saved = saveActiveRoster(data);
  return { ...saved, ...target.snapshot, activeRosterId: targetId };
}

/**
 * Park the current roster and start an empty one. This is what "Otro grupo"
 * does: the household you came from is kept intact and can be switched back to.
 */
export function createRoster(data, { name = "Otro grupo", defaults } = {}) {
  const saved = saveActiveRoster(data);
  const id = uid();
  const snapshot = blankRosterSnapshot(defaults);
  return {
    ...saved,
    ...snapshot,
    activeRosterId: id,
    rosters: {
      ...saved.rosters,
      [id]: { id, name, createdAt: Date.now(), snapshot },
    },
  };
}

export function renameRoster(data, id, name) {
  const target = data.rosters?.[id];
  if (!target) return data;
  return {
    ...data,
    rosters: { ...data.rosters, [id]: { ...target, name } },
  };
}

/**
 * Remove a roster. Deleting the active one falls back to whichever remains, so
 * the app is never left pointing at a roster that isn't there.
 */
export function deleteRoster(data, id, { defaults } = {}) {
  const rosters = { ...(data.rosters ?? {}) };
  if (!rosters[id]) return data;
  delete rosters[id];

  if (id !== data.activeRosterId) return { ...data, rosters };

  const fallbackId = Object.keys(rosters)[0];
  if (!fallbackId) {
    const snapshot = blankRosterSnapshot(defaults);
    return {
      ...data,
      ...snapshot,
      activeRosterId: DEFAULT_ROSTER_ID,
      rosters: {
        [DEFAULT_ROSTER_ID]: {
          id: DEFAULT_ROSTER_ID,
          name: DEFAULT_ROSTER_NAME,
          createdAt: Date.now(),
          snapshot,
        },
      },
    };
  }
  return { ...data, ...rosters[fallbackId].snapshot, activeRosterId: fallbackId, rosters };
}

/**
 * Every roster for a picker, newest last, with the member count read from the
 * live fields for whichever one is active (its slot is only rewritten on
 * switch, so the parked copy can lag behind by design).
 */
export function listRosters(data) {
  const active = data.activeRosterId;
  return Object.values(data.rosters ?? {})
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.id === active,
      members: r.id === active ? data.members ?? [] : r.snapshot?.members ?? [],
    }));
}
