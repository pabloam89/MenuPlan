import { membersOfGroup } from "./groups.js";
import { slotKey } from "./planner.js";
import { initialsOf } from "./stages.js";

/** Members of `group` who eat this slot at home or tupper. */
export function eatersForSlot(group, members, schedule, day, meal) {
  const groupMembers = membersOfGroup(group, members);
  return groupMembers.filter((m) => {
    const status = schedule[slotKey(m.id, day, meal)] ?? "casa";
    return status === "casa" || status === "tupper";
  });
}

/**
 * Initials to show on a dish card: only when a strict subset of the group eats.
 * Returns [] if everyone in the group eats (or group has 0–1 members).
 */
export function partialEaterInitials(group, members, schedule, day, meal) {
  const groupMembers = membersOfGroup(group, members);
  if (groupMembers.length <= 1) return [];
  const eating = eatersForSlot(group, members, schedule, day, meal);
  if (eating.length === 0 || eating.length === groupMembers.length) return [];
  return eating.map((m) => initialsOf(m.name));
}
