import { DAYS } from "./planner.js";
import { SCHOOL_DAYS, hasAnySchoolDish, getSchoolDish } from "./schoolMenu.js";
import {
  resolveMemberAge,
  stageForAge,
  memberAvatarColor,
  memberAvatarThumbSrc,
} from "./stages.js";

export const WEEKDAYS = DAYS.filter((d) => !["Sáb", "Dom"].includes(d));

export const isKidMember = (m) => stageForAge(resolveMemberAge(m)).id !== "adulto";

export const isHomeState = (v) => v === "casa" || v === "off" || v == null;

/**
 * Which "not at home" state to store when someone is toggled off the table.
 *
 * The planner treats `cole` and `fuera` identically (see modeForGroupSlot's
 * `allOut`), so this only decides the *label* — and the one place it's load-
 * bearing: `cole` is how the school-menu importer recognises the slots it owns
 * and may clear again. So we only claim `cole` when the comedor is a real
 * possibility: a child, at lunch, on a school day, with a menu actually
 * uploaded for them. Anything else — a kid out for dinner, a Saturday, a
 * family that never uploaded a menu — is plain `fuera`.
 *
 * The "Al cole" quick action bypasses this on purpose: there the user has said
 * the word, so we take it. This only governs the ambiguous single tap.
 */
export function outStateFor(member, day, meal, schoolMenus) {
  if (!isKidMember(member) || meal !== "Comida" || !SCHOOL_DAYS.includes(day)) return "fuera";
  return hasAnySchoolDish(getSchoolDish(schoolMenus, member.id, day)) ? "cole" : "fuera";
}

/**
 * Four habits that cover most of what a family would otherwise fill in cell by
 * cell — a household of five spends ~20 taps on the first card alone.
 *
 * They are deliberately **disjoint**: no two touch the same person on the same
 * day and meal. That's what lets each card be a real toggle instead of a
 * one-way stamp, because turning one off can never half-undo another, and a
 * card's on/off state can be read straight back off the schedule.
 *
 * All four say "these people are out then", never "these people are in". A card
 * that wrote `casa` would be a no-op on a fresh schedule, where everyone is
 * already home, and its "off" state would have no sensible meaning.
 */
export const QUICK_ACTIONS = [
  {
    id: "cole",
    label: "Niños comen en el cole entre semana",
    img: "/quick/cole.png",
    // Todas encuadran desde arriba: las cabezas son lo que identifica la
    // escena, así que se recorta por los pies, nunca por la coronilla.
    focus: "center top",
    value: "cole",
    days: WEEKDAYS,
    meals: ["Comida"],
    who: (members) => members.filter(isKidMember),
  },
  {
    id: "trabajo",
    label: "Adultos comen en el trabajo entre semana",
    img: "/quick/fuera.png",
    focus: "center top",
    value: "fuera",
    days: WEEKDAYS,
    meals: ["Comida"],
    who: (members) => members.filter((m) => !isKidMember(m)),
  },
  {
    id: "sabado",
    label: "Mayores cenan fuera el sábado",
    img: "/quick/cena.png",
    focus: "center 30%",
    value: "fuera",
    days: ["Sáb"],
    meals: ["Cena"],
    who: (members) => members.filter((m) => !isKidMember(m)),
  },
  {
    id: "domingo",
    label: "Todos comemos fuera el domingo",
    img: "/quick/familia.png",
    focus: "center 22%",
    value: "fuera",
    days: ["Dom"],
    meals: ["Comida"],
    who: (members) => members,
  },
];

/**
 * Resolve each card against this household: who it touches, which slots, and
 * whether it is already satisfied. Cards that can't apply — no children, or the
 * meal they act on is switched off — are dropped rather than shown disabled.
 */
export function resolveQuickActions(members, meals, schedule) {
  const out = [];
  for (const action of QUICK_ACTIONS) {
    const who = action.who(members);
    const useMeals = action.meals.filter((m) => meals.includes(m));
    if (who.length === 0 || useMeals.length === 0) continue;
    const keys = [];
    for (const m of who) {
      for (const day of action.days) {
        for (const meal of useMeals) keys.push(`${m.id}|${day}|${meal}`);
      }
    }
    const hits = keys.filter((k) => (schedule?.[k] ?? "casa") === action.value).length;
    out.push({
      ...action,
      keys,
      status: hits === 0 ? "off" : hits === keys.length ? "on" : "partial",
      faces: who.map((m) => ({
        id: m.id,
        name: m.name,
        src: memberAvatarThumbSrc(m),
        color: memberAvatarColor(m.id, members),
      })),
    });
  }
  return out;
}
