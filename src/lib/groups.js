import { migrateHomeRole, resolveMemberAge, stageForAge, suggestHomeRole } from "./stages.js";

const GROUP_COLORS = ["#2d5a3d", "#c67030", "#5a7ea8", "#a85a7e", "#7e5aa8", "#5aa87e"];
const BABY_GROUP_LABEL = "Bebé";

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Re-exported for backwards compatibility: `resolveMemberAge` lives in
// stages.js (the single source of truth for age math), but historically
// callers import it from groups.js.
export { resolveMemberAge };

/**
 * Which menu tier ("Adultos" / "Niños" / "Bebé") a member belongs to by
 * default. Age decides the baby cutoff (nutrition-critical), but "child vs
 * adult" is decided by household role, not age: a 15-year-old with role
 * "Hijo/a" should still default into "Niños", while an "Adulto" role always
 * goes to "Adultos" regardless of age. This keeps teens assignable to the
 * kids' menu instead of being silently bucketed as adults.
 */
export function tierForMember(member) {
  const age = resolveMemberAge(member);
  if (memberIsBaby(member)) return "baby";
  const role = migrateHomeRole(member.homeRole ?? suggestHomeRole(age));
  if (role === "Hijo/a" || role === "Amigo/a") return "child";
  return "adult"; // Adulto, Papá, Mamá, Abuelo/a, Otro
}

export function splitMembersByStage(members) {
  const adults = [];
  const children = [];
  const babies = [];
  for (const m of members) {
    const tier = tierForMember(m);
    if (tier === "baby") babies.push(m);
    else if (tier === "child") children.push(m);
    else adults.push(m);
  }
  return { adults, children, babies };
}

export function memberIsBaby(member) {
  // Age decides the baby cutoff, but the user can override it ("ya come como
  // un niño") via `notBaby`, which promotes the member out of the baby menu.
  if (member?.notBaby) return false;
  return stageForAge(resolveMemberAge(member)).id === "baby";
}

export function hasBabyMember(members) {
  return members.some((m) => memberIsBaby(m));
}

/** True when a member is younger than adult (baby or child by age), i.e. the
 * household has someone a school/daycare menu could apply to. */
export function hasUnderageMember(members) {
  return members.some((m) => stageForAge(resolveMemberAge(m)).id !== "adulto");
}

/** True when "Menús separados" would actually produce more than one menu —
 * i.e. members span at least two tiers (adults/children/babies). If
 * everyone falls into the same tier there's nothing to split. */
export function canSplitMenus(members) {
  const { adults, children, babies } = splitMembersByStage(members);
  const nonEmptyTiers = [adults, children, babies].filter((g) => g.length > 0).length;
  return nonEmptyTiers > 1;
}

/** True when this group's menu must use only baby recipes. */
export function isBabyMenuGroup(group, members) {
  if (group?.label === BABY_GROUP_LABEL) return true;
  const groupMembers = membersOfGroup(group, members);
  return groupMembers.length > 0 && groupMembers.every((m) => memberIsBaby(m));
}

/** Groups a member may be assigned to in onboarding. */
export function groupsAvailableForMember(member, groups) {
  const isBaby = memberIsBaby(member);
  return groups.filter((g) =>
    isBaby ? g.label === BABY_GROUP_LABEL : g.label !== BABY_GROUP_LABEL
  );
}

export function canAssignMemberToGroup(member, group) {
  if (!group) return false;
  const isBaby = memberIsBaby(member);
  if (group.label === BABY_GROUP_LABEL) return isBaby;
  return !isBaby;
}

function buildSplitGroups({ adults, children, babies }) {
  const groups = [];
  let colorIdx = 0;
  if (adults.length > 0) {
    groups.push({
      id: uid(),
      label: "Adultos",
      memberIds: adults.map((m) => m.id),
      color: GROUP_COLORS[colorIdx++],
    });
  }
  if (children.length > 0) {
    groups.push({
      id: uid(),
      label: "Niños",
      memberIds: children.map((m) => m.id),
      color: GROUP_COLORS[colorIdx++],
    });
  }
  if (babies.length > 0) {
    groups.push({
      id: uid(),
      label: "Bebé",
      memberIds: babies.map((m) => m.id),
      color: GROUP_COLORS[colorIdx++],
    });
  }
  return groups;
}

/**
 * Build default groups from members: Adultos, Niños (3–11) and Bebé (0–2) when needed.
 */
export function defaultGroupsFromMembers(members) {
  const split = splitMembersByStage(members);
  const groups = buildSplitGroups(split);
  if (groups.length === 0 && members.length > 0) {
    groups.push({
      id: uid(),
      label: "Familia",
      memberIds: members.map((m) => m.id),
      color: GROUP_COLORS[0],
    });
  }
  return groups;
}

export function nextGroupColor(existing) {
  const used = new Set(existing.map((g) => g.color));
  return GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[existing.length % GROUP_COLORS.length];
}

// ── Ad-hoc individual menus ────────────────────────────────────────────────
// A short, single-person menu (e.g. "dieta blanda") that lives alongside the
// family menu as its own group, then auto-expires. It's a normal group object
// with extra bookkeeping fields (adHoc / sourceMemberId / sourceGroupId /
// reason / createdAt / days) so the whole existing pipeline — generation,
// hydration, rendering, persistence — treats it like any other menu group.

export const ADHOC_MENU_DAYS = 3;
const ADHOC_MENU_MS = ADHOC_MENU_DAYS * 24 * 60 * 60 * 1000;

export function isIndividualMenuGroup(group) {
  return Boolean(group?.adHoc);
}

export function individualMenuGroupFor(groups, memberId) {
  return (groups ?? []).find((g) => g.adHoc && g.sourceMemberId === memberId) ?? null;
}

// Fixed color (matches the "Dieta blanda" icon everywhere else: onboarding
// row, confirmation pop-up, scope picker) so an ad-hoc menu is always
// recognizable at a glance instead of picking up a rotating group color.
export const ADHOC_MENU_COLOR = "#7a8a3a";

// Labeled by *what* the menu is for, not *who* it's for — the person is
// already identifiable via their avatar in the "Personas" row, so the scope
// picker/badge only need to say "Dieta blanda", not repeat their name.
const ADHOC_REASON_LABEL = { dieta_blanda: "Dieta blanda" };
export function adhocReasonLabel(reason) {
  return ADHOC_REASON_LABEL[reason] ?? "Menú individual";
}

/** Create the ad-hoc group for one member, remembering their home group. */
export function createIndividualMenuGroup(member, sourceGroupId, reason) {
  return {
    id: uid(),
    label: adhocReasonLabel(reason),
    memberIds: [member.id],
    color: ADHOC_MENU_COLOR,
    adHoc: true,
    sourceMemberId: member.id,
    sourceGroupId: sourceGroupId ?? null,
    reason,
    createdAt: Date.now(),
    days: ADHOC_MENU_DAYS,
  };
}

/**
 * Drop ad-hoc menus older than ADHOC_MENU_DAYS and put their member back into
 * the home group they came from (if it still exists).
 * @returns {{ groups: Array, expired: Array }}
 */
export function pruneExpiredIndividualMenus(groups, nowMs = Date.now()) {
  const all = groups ?? [];
  const expired = all.filter(
    (g) => g.adHoc && g.createdAt && nowMs - g.createdAt >= ADHOC_MENU_MS,
  );
  if (expired.length === 0) return { groups: all, expired: [] };

  const kept = all.filter((g) => !expired.includes(g));
  const restored = kept.map((g) => {
    const back = expired
      .filter((e) => e.sourceGroupId === g.id)
      .map((e) => e.sourceMemberId);
    if (back.length === 0) return g;
    return { ...g, memberIds: Array.from(new Set([...g.memberIds, ...back])) };
  });
  return { groups: restored, expired };
}

export function membersOfGroup(group, members) {
  const set = new Set(group.memberIds);
  return members.filter((m) => set.has(m.id));
}

/**
 * Build groups based on the chosen menu model.
 * - "same": one group "Familia" with everyone.
 * - "separate": Adultos / Niños / Bebé when several profiles coexist.
 */
export function groupsFromModel(members, model) {
  if (members.length === 0) return [];

  if (model === "same") {
    const babies = members.filter((m) => memberIsBaby(m));
    const rest = members.filter((m) => !memberIsBaby(m));
    if (babies.length > 0 && rest.length > 0) {
      return [
        {
          id: uid(),
          label: "Familia",
          memberIds: rest.map((m) => m.id),
          color: GROUP_COLORS[0],
        },
        {
          id: uid(),
          label: BABY_GROUP_LABEL,
          memberIds: babies.map((m) => m.id),
          color: GROUP_COLORS[2],
        },
      ];
    }
    return [
      {
        id: uid(),
        label: "Familia",
        memberIds: members.map((m) => m.id),
        color: GROUP_COLORS[0],
      },
    ];
  }

  const split = splitMembersByStage(members);
  const groups = buildSplitGroups(split);
  if (groups.length <= 1) {
    return [
      {
        id: uid(),
        label: "Familia",
        memberIds: members.map((m) => m.id),
        color: GROUP_COLORS[0],
      },
    ];
  }
  return groups;
}

/** Keep babies only in Bebé and everyone else out of it (any menu model). */
export function migrateGroupsForBabies(members, groups, menuModel) {
  if (!Array.isArray(groups) || groups.length === 0) return groups;

  const babyIds = new Set(members.filter((m) => memberIsBaby(m)).map((m) => m.id));
  if (babyIds.size === 0) {
    return groups
      .filter((g) => g.label !== BABY_GROUP_LABEL)
      .map((g) => ({
        ...g,
        memberIds: g.memberIds.filter((id) => !babyIds.has(id)),
      }))
      .filter((g) => g.memberIds.length > 0);
  }

  let babyGroup = groups.find((g) => g.label === BABY_GROUP_LABEL);
  const updated = groups
    .filter((g) => g.label !== BABY_GROUP_LABEL)
    .map((g) => ({
      ...g,
      memberIds: g.memberIds.filter((id) => !babyIds.has(id)),
    }))
    .filter((g) => g.memberIds.length > 0);

  if (!babyGroup) {
    babyGroup = {
      id: uid(),
      label: BABY_GROUP_LABEL,
      memberIds: [],
      color: nextGroupColor(updated),
    };
  }

  updated.push({
    ...babyGroup,
    memberIds: Array.from(babyIds),
  });
  return updated;
}
