import { describe, it, expect } from "vitest";
import { matchingHealthProfiles, HEALTH_PROFILE_BADGE } from "./healthProfileMatch.js";

describe("matchingHealthProfiles", () => {
  it("returns nothing when no profile is active", () => {
    expect(matchingHealthProfiles(["frito"], [])).toEqual([]);
    expect(matchingHealthProfiles(["frito"], undefined)).toEqual([]);
  });

  it("treats a missing healthFlags array as 'no risk factors present' (absence-based profiles match)", () => {
    expect(matchingHealthProfiles([], ["glucemico"]).map((b) => b.id)).toEqual(["glucemico"]);
    expect(matchingHealthProfiles(undefined, ["glucemico"]).map((b) => b.id)).toEqual(["glucemico"]);
  });

  it("glucemico: matches unless the dish has azucar_anadido", () => {
    expect(matchingHealthProfiles(["azucar_anadido"], ["glucemico"])).toEqual([]);
    expect(matchingHealthProfiles(["rico_hierro"], ["glucemico"]).map((b) => b.id)).toEqual(["glucemico"]);
  });

  it("corazon: requires absence of BOTH frito and embutido", () => {
    expect(matchingHealthProfiles(["frito"], ["corazon"])).toEqual([]);
    expect(matchingHealthProfiles(["embutido"], ["corazon"])).toEqual([]);
    expect(matchingHealthProfiles([], ["corazon"]).map((b) => b.id)).toEqual(["corazon"]);
  });

  it("bajo_sodio: requires absence of alto_sodio and embutido", () => {
    expect(matchingHealthProfiles(["alto_sodio"], ["bajo_sodio"])).toEqual([]);
    expect(matchingHealthProfiles(["embutido"], ["bajo_sodio"])).toEqual([]);
    expect(matchingHealthProfiles([], ["bajo_sodio"]).map((b) => b.id)).toEqual(["bajo_sodio"]);
  });

  it("reflux: requires absence of frito, picante and acido", () => {
    for (const flag of ["frito", "picante", "acido"]) {
      expect(matchingHealthProfiles([flag], ["reflux"])).toEqual([]);
    }
    expect(matchingHealthProfiles(["embutido"], ["reflux"]).map((b) => b.id)).toEqual(["reflux"]);
  });

  it("anemia: inverted — only matches when rico_hierro IS present", () => {
    expect(matchingHealthProfiles([], ["anemia"])).toEqual([]);
    expect(matchingHealthProfiles(["frito"], ["anemia"])).toEqual([]);
    expect(matchingHealthProfiles(["rico_hierro"], ["anemia"]).map((b) => b.id)).toEqual(["anemia"]);
  });

  it("evaluates multiple active profiles independently", () => {
    const badges = matchingHealthProfiles(["frito"], ["glucemico", "corazon", "reflux"]);
    // "frito" only breaks corazon and reflux, not glucemico.
    expect(badges.map((b) => b.id)).toEqual(["glucemico"]);
  });

  it("dedupes repeated profile ids and ignores unknown ones", () => {
    const badges = matchingHealthProfiles([], ["glucemico", "glucemico", "no_existe"]);
    expect(badges.map((b) => b.id)).toEqual(["glucemico"]);
  });

  it("every badge exposes label/Icon/color/explain for rendering", () => {
    for (const id of Object.keys(HEALTH_PROFILE_BADGE)) {
      const meta = HEALTH_PROFILE_BADGE[id];
      expect(typeof meta.label).toBe("string");
      expect(meta.Icon).toBeTruthy();
      expect(typeof meta.color).toBe("string");
      expect(typeof meta.explain).toBe("string");
    }
  });
});
