import { describe, it, expect, vi, afterEach } from "vitest";
import {
  findAccountMember,
  memberAvatarSrc,
  resolveMemberAge,
  stageForAge,
  stageLabel,
  userAvatarSrc,
} from "./stages.js";

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

describe("memberAvatarSrc resolves the folder from the key, not from profileKey", () => {
  it("keeps pointing at the set the key was picked from after the role is remapped", () => {
    // `adulto` now borrows the `hija` set, but a member saved earlier still
    // holds an `adulto_*` key and must not resolve to /avatares/hija/adulto_3.
    const member = { profileKey: "adulto", avatarKey: "adulto_3" };
    expect(memberAvatarSrc(member)).toBe("/avatares/adulto/adulto_3.png");
  });

  it("resolves a borrowed-set key under that set's folder", () => {
    expect(memberAvatarSrc({ profileKey: "amigo", avatarKey: "hijo_9" }))
      .toBe("/avatares/hijo/hijo_9.png");
  });

  it("prefers an uploaded photo over the illustrated avatar", () => {
    const member = { profileKey: "papa", avatarKey: "papa_4", photo: "data:image/png;base64,x" };
    expect(memberAvatarSrc(member)).toBe("data:image/png;base64,x");
  });

  it("returns null when there is no avatar to show", () => {
    expect(memberAvatarSrc({ profileKey: "otro" })).toBeNull();
    expect(memberAvatarSrc(null)).toBeNull();
  });
});

describe("userAvatarSrc keeps profile photo, own avatar and Google account apart", () => {
  const member = { profileKey: "papa", avatarKey: "papa_4" };

  it("an uploaded profile photo wins over everything", () => {
    expect(userAvatarSrc({ profilePhoto: "blob:me", member, googlePhoto: "https://g/p.jpg" }))
      .toBe("blob:me");
  });

  it("falls back to the member's own illustrated avatar before the Google picture", () => {
    expect(userAvatarSrc({ member, googlePhoto: "https://g/p.jpg" }))
      .toBe("/avatares/papa/papa_4.png");
  });

  it("uses the Google picture only when nothing was chosen in the app", () => {
    expect(userAvatarSrc({ googlePhoto: "https://g/p.jpg" })).toBe("https://g/p.jpg");
    expect(userAvatarSrc({})).toBeNull();
  });

  it("ignores an uploaded member photo, which belongs to the member not the account", () => {
    expect(userAvatarSrc({ member: { ...member, photo: "blob:member" } }))
      .toBe("/avatares/papa/papa_4.png");
  });
});

describe("findAccountMember", () => {
  const members = [{ id: "1", name: "Pablo" }, { id: "2", name: "Isa" }];

  it("matches the account holder on first name, ignoring accents and surnames", () => {
    expect(findAccountMember(members, "Pablo Artiñano")?.id).toBe("1");
    expect(findAccountMember([{ id: "3", name: "Álvaro" }], "alvaro perez")?.id).toBe("3");
  });

  it("stays undecided when the name is missing or ambiguous", () => {
    expect(findAccountMember(members, "Marta")).toBeNull();
    expect(findAccountMember(members, "")).toBeNull();
    expect(findAccountMember([{ id: "a", name: "Pablo" }, { id: "b", name: "Pablo" }], "Pablo")).toBeNull();
  });
});
