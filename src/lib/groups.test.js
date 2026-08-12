import { describe, it, expect } from "vitest";
import { reconcileTierGroups, reconcileGroupsWithMembers } from "./groups.js";

const adult = (id, name) => ({ id, name, age: 38, homeRole: "Adulto" });
const kid = (id, name) => ({ id, name, age: 8, homeRole: "Hijo/a" });
const baby = (id, name) => ({ id, name, age: 1, homeRole: "Bebé" });

const tier = (label, memberIds) => ({ id: `g-${label}`, label, memberIds, color: "#2d5a3d" });
const byLabel = (groups, label) => groups.find((g) => g.label === label);

describe("reconcileTierGroups", () => {
  it("drops a tier menu nobody belongs to", () => {
    const members = [adult("a1"), adult("a2"), baby("b1")];
    const groups = [tier("Adultos", []), tier("Niños", []), tier("Bebé", [])];
    const out = reconcileTierGroups(members, groups);
    expect(out.map((g) => g.label)).toEqual(["Adultos", "Bebé"]);
  });

  it("default-assigns each member to the menu for their own tier", () => {
    const members = [adult("a1"), adult("a2"), baby("b1")];
    const out = reconcileTierGroups(members, [tier("Adultos", []), tier("Bebé", [])]);
    expect(byLabel(out, "Adultos").memberIds).toEqual(["a1", "a2"]);
    expect(byLabel(out, "Bebé").memberIds).toEqual(["b1"]);
  });

  it("keeps a manual assignment instead of re-defaulting it", () => {
    // A teen moved onto the adults' menu on purpose stays there.
    const teen = { id: "t1", age: 15, homeRole: "Hijo/a" };
    const members = [adult("a1"), teen, kid("k1")];
    const out = reconcileTierGroups(members, [tier("Adultos", ["a1", "t1"]), tier("Niños", [])]);
    expect(byLabel(out, "Adultos").memberIds).toEqual(["a1", "t1"]);
    expect(byLabel(out, "Niños").memberIds).toEqual(["k1"]);
  });

  it("creates the tier menu when a tier gains its first member", () => {
    const members = [adult("a1"), kid("k1")];
    const out = reconcileTierGroups(members, [tier("Adultos", ["a1"])]);
    expect(byLabel(out, "Niños").memberIds).toEqual(["k1"]);
  });

  it("re-places someone whose only menu just disappeared", () => {
    // k1 grew up: the Niños tier is now empty, so that menu goes and the
    // former child lands on the adults' menu instead of nowhere.
    const grown = { id: "k1", age: 22, homeRole: "Adulto" };
    const out = reconcileTierGroups([adult("a1"), grown], [tier("Adultos", ["a1"]), tier("Niños", ["k1"])]);
    expect(out.map((g) => g.label)).toEqual(["Adultos"]);
    expect(byLabel(out, "Adultos").memberIds).toEqual(["a1", "k1"]);
  });

  it("forgets members that no longer exist", () => {
    const out = reconcileTierGroups([adult("a1")], [tier("Adultos", ["a1", "ghost"])]);
    expect(byLabel(out, "Adultos").memberIds).toEqual(["a1"]);
  });

  it("leaves the single-Familia model untouched", () => {
    const groups = [tier("Familia", ["a1", "b1"])];
    expect(reconcileTierGroups([adult("a1"), baby("b1")], groups)).toBe(groups);
  });

  it("preserves ad-hoc individual menus and the member on them", () => {
    const adhoc = { id: "x", label: "Dieta blanda", memberIds: ["a2"], color: "#7a8a3a", adHoc: true };
    const out = reconcileTierGroups([adult("a1"), adult("a2")], [tier("Adultos", ["a1"]), adhoc]);
    expect(byLabel(out, "Dieta blanda").memberIds).toEqual(["a2"]);
    expect(byLabel(out, "Adultos").memberIds).toEqual(["a1"]);
  });
});

describe("reconcileGroupsWithMembers", () => {
  it("puts a newcomer on the single Familia menu", () => {
    // The bug this exists for: reconcileTierGroups hands the Familia model back
    // untouched, so someone added to a same-menu household joined no menu and
    // stayed invisible to the planner and every avatar stack.
    const members = [adult("a1"), adult("a2"), kid("k1")];
    const out = reconcileGroupsWithMembers(members, [tier("Familia", ["a1", "a2"])]);
    expect(byLabel(out, "Familia").memberIds).toEqual(["a1", "a2", "k1"]);
  });

  it("sends a newcomer baby to the Bebé menu, not the general one", () => {
    const members = [adult("a1"), baby("b1")];
    const groups = [tier("Familia", ["a1"]), tier("Bebé", [])];
    const out = reconcileGroupsWithMembers(members, groups);
    expect(byLabel(out, "Familia").memberIds).toEqual(["a1"]);
    expect(byLabel(out, "Bebé").memberIds).toEqual(["b1"]);
  });

  it("forgets members that left the roster", () => {
    const out = reconcileGroupsWithMembers([adult("a1")], [tier("Familia", ["a1", "gone"])]);
    expect(byLabel(out, "Familia").memberIds).toEqual(["a1"]);
  });

  it("returns the very same groups when nobody moved", () => {
    // App.jsx reconciles inside an effect keyed on members/groups: a fresh array
    // every run would write state on every render and loop forever.
    const groups = [tier("Familia", ["a1", "a2"])];
    const out = reconcileGroupsWithMembers([adult("a1"), adult("a2")], groups);
    expect(out).toBe(groups);
  });

  it("returns the very same groups when a tier split is already correct", () => {
    const groups = [tier("Adultos", ["a1"]), tier("Niños", ["k1"])];
    const out = reconcileGroupsWithMembers([adult("a1"), kid("k1")], groups);
    expect(out).toBe(groups);
  });

  it("still defers to the tier split when there is one", () => {
    const members = [adult("a1"), kid("k1")];
    const out = reconcileGroupsWithMembers(members, [tier("Adultos", ["a1"])]);
    expect(byLabel(out, "Niños").memberIds).toEqual(["k1"]);
  });

  it("leaves an empty group list alone", () => {
    expect(reconcileGroupsWithMembers([adult("a1")], [])).toEqual([]);
  });
});
