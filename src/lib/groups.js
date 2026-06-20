import { stageForAge } from "./stages.js";

const GROUP_COLORS = ["#2d5a3d", "#c67030", "#5a7ea8", "#a85a7e", "#7e5aa8", "#5aa87e"];
const BABY_GROUP_LABEL = "Bebé";

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function resolveMemberAge(member) {
  if (member.useBirthDate && member.birthDate) {
    const d0 = new Date(member.birthDate);
    if (!Number.isNaN(d0.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - d0.getFullYear();
      const md = now.getMonth() - d0.getMonth();
      const dd = now.getDate() - d0.getDate();
      if (md < 0 || (md === 0 && dd < 0)) age -= 1;
      return Math.max(0, age);
    }
  }
  return Number.isFinite(member.age) ? member.age : parseInt(member.age, 10) || 30;
}

export function splitMembersByStage(members) {
  const adults = [];
  const children = [];
  const babies = [];
  for (const m of members) {
    const s = stageForAge(resolveMemberAge(m)).id;
    if (s === "adulto" || s === "secundaria") adults.push(m);
    else if (s === "baby") babies.push(m);
    else if (s === "infantil" || s === "primaria") children.push(m);
    else adults.push(m);
  }
  return { adults, children, babies };
}

export function memberIsBaby(member) {
  return stageForAge(resolveMemberAge(member)).id === "baby";
}

export function hasBabyMember(members) {
  return members.some((m) => memberIsBaby(m));
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
