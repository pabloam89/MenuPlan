import { describe, it, expect } from "vitest";
import {
  parseHouseholdRow,
  resolveActiveHousehold,
  isHouseholdReadOnly,
  canShareHouseholdInvite,
  buildInviteUrl,
} from "./householdsSync.js";

describe("householdsSync helpers", () => {
  it("parseHouseholdRow maps snake_case payload", () => {
    const row = parseHouseholdRow({
      id: "abc",
      name: "Mi casa",
      role: "owner",
      setup_status: "active",
      owner_user_id: "u1",
      invite_token: "tok",
      joined_at: "2026-01-01",
      created_at: "2026-01-01",
      is_own: true,
    });
    expect(row?.name).toBe("Mi casa");
    expect(row?.setupStatus).toBe("active");
    expect(row?.isOwn).toBe(true);
  });

  it("resolveActiveHousehold prefers explicit id", () => {
    const list = [
      { id: "a", role: "owner", name: "A" },
      { id: "b", role: "viewer", name: "B" },
    ];
    expect(resolveActiveHousehold(list, "b")?.id).toBe("b");
  });

  it("viewer is read-only", () => {
    expect(isHouseholdReadOnly({ role: "viewer" })).toBe(true);
    expect(isHouseholdReadOnly({ role: "owner" })).toBe(false);
  });

  it("canShareHouseholdInvite requires owner + ready token", () => {
    expect(
      canShareHouseholdInvite({ role: "owner", setupStatus: "invite_ready", inviteToken: "x" }),
    ).toBe(true);
    expect(
      canShareHouseholdInvite({ role: "owner", setupStatus: "dormant", inviteToken: "x" }),
    ).toBe(false);
  });

  it("buildInviteUrl adds join param", () => {
    const url = buildInviteUrl("abc123", "https://menuplan.app");
    expect(url).toContain("join=abc123");
  });
});
