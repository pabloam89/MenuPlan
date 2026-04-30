import { stageForAge } from "./stages.js";

const GROUP_COLORS = ["#2d5a3d", "#c67030", "#5a7ea8", "#a85a7e", "#7e5aa8", "#5aa87e"];

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Build default groups from members: "Adultos" (12+) and "Niños" (<12).
 * Returns the groups + unassigned list (shouldn't happen if members have ages).
 */
export function defaultGroupsFromMembers(members) {
  const adults = members.filter((m) => stageForAge(m.age).id === "adulto" || stageForAge(m.age).id === "secundaria");
  const kids = members.filter((m) => {
    const s = stageForAge(m.age).id;
    return s === "baby" || s === "infantil" || s === "primaria";
  });

  const groups = [];
  if (adults.length > 0) {
    groups.push({
      id: uid(),
      label: "Adultos",
      memberIds: adults.map((m) => m.id),
      color: GROUP_COLORS[0],
    });
  }
  if (kids.length > 0) {
    groups.push({
      id: uid(),
      label: "Niños",
      memberIds: kids.map((m) => m.id),
      color: GROUP_COLORS[1],
    });
  }
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
 * - "variation" / "separate": split Adultos / Niños when kids exist.
 * The planner can later use `menuModel` to decide whether to match recipes
 * between the two groups (variation) or pick independently (separate).
 */
export function groupsFromModel(members, model) {
  if (members.length === 0) return [];

  const adults = members.filter((m) => {
    const s = stageForAge(m.age).id;
    return s === "adulto" || s === "secundaria";
  });
  const kids = members.filter((m) => {
    const s = stageForAge(m.age).id;
    return s === "baby" || s === "infantil" || s === "primaria";
  });

  if (model === "same" || kids.length === 0 || adults.length === 0) {
    return [
      {
        id: uid(),
        label: "Familia",
        memberIds: members.map((m) => m.id),
        color: GROUP_COLORS[0],
      },
    ];
  }

  return [
    {
      id: uid(),
      label: "Adultos",
      memberIds: adults.map((m) => m.id),
      color: GROUP_COLORS[0],
    },
    {
      id: uid(),
      label: "Niños",
      memberIds: kids.map((m) => m.id),
      color: GROUP_COLORS[1],
    },
  ];
}
