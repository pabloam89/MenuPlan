export const SCHOOL_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
export const SCHOOL_COURSES = ["Primero", "Segundo", "Postre"];

/**
 * Lookup the courses (1º / 2º / Postre) for a given member on a given school
 * day. Per-member entries take precedence over the family-wide "shared" map.
 *
 * Returns: { primero: string, segundo: string, postre: string }
 */
export function getSchoolDish(schoolMenus, memberId, day) {
  if (!schoolMenus) return { primero: "", segundo: "", postre: "" };
  const out = { primero: "", segundo: "", postre: "" };
  const own = schoolMenus.byMember?.[memberId] ?? {};
  const shared = schoolMenus.shared ?? {};
  for (const course of SCHOOL_COURSES) {
    const k = `${day}-${course}`;
    const value =
      (typeof own[k] === "string" && own[k].trim()) ||
      (typeof shared[k] === "string" && shared[k].trim()) ||
      "";
    out[course.toLowerCase()] = value;
  }
  return out;
}

export function hasAnySchoolDish(courses) {
  return Boolean(courses && (courses.primero || courses.segundo || courses.postre));
}
