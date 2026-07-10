import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveMemberAge, stageForAge, stageLabel } from "./stages.js";

afterEach(() => {
  vi.useRealTimers();
});

function setToday(iso) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("resolveMemberAge — birthDate edge cases (Fase 5, punto 4)", () => {
  it("a baby born today (birthDate === today) is age 0, not -1 or 1", () => {
    setToday("2026-07-10T12:00:00");
    const member = { useBirthDate: true, birthDate: "2026-07-10" };
    expect(resolveMemberAge(member)).toBe(0);
  });

  it("the day before the birthday still counts the pre-birthday age", () => {
    // Born 2020-07-11, "today" is 2026-07-10 → turns 6 tomorrow, so still 5.
    setToday("2026-07-10T12:00:00");
    const member = { useBirthDate: true, birthDate: "2020-07-11" };
    expect(resolveMemberAge(member)).toBe(5);
  });

  it("on the exact birthday the age increments (no off-by-one)", () => {
    // Born 2020-07-10, "today" is 2026-07-10 → turns 6 today.
    setToday("2026-07-10T12:00:00");
    const member = { useBirthDate: true, birthDate: "2020-07-10" };
    expect(resolveMemberAge(member)).toBe(6);
  });

  it("the day after the birthday keeps the incremented age", () => {
    // Born 2020-07-09, "today" is 2026-07-10 → turned 6 yesterday.
    setToday("2026-07-10T12:00:00");
    const member = { useBirthDate: true, birthDate: "2020-07-09" };
    expect(resolveMemberAge(member)).toBe(6);
  });

  it("month-boundary case: birth month already passed this year", () => {
    setToday("2026-07-10T12:00:00");
    const member = { useBirthDate: true, birthDate: "2020-06-30" };
    expect(resolveMemberAge(member)).toBe(6);
  });

  it("month-boundary case: birth month hasn't arrived yet this year", () => {
    setToday("2026-07-10T12:00:00");
    const member = { useBirthDate: true, birthDate: "2020-08-01" };
    expect(resolveMemberAge(member)).toBe(5);
  });

  it("falls back to plain numeric age when useBirthDate is false", () => {
    const member = { useBirthDate: false, age: 7, birthDate: "2010-01-01" };
    expect(resolveMemberAge(member)).toBe(7);
  });
});

describe("stageLabel goes through resolveMemberAge (not member.age directly)", () => {
  it("labels a birthDate-only baby as Bebé even when member.age is stale/missing", () => {
    setToday("2026-07-10T12:00:00");
    // member.age deliberately wrong/absent — only birthDate should matter.
    const member = { useBirthDate: true, birthDate: "2026-01-01" };
    expect(stageLabel(member)).toBe(stageForAge(resolveMemberAge(member)).short);
    expect(stageLabel(member)).toBe("Bebé");
  });
});
