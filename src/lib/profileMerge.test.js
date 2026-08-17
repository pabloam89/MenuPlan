import { describe, it, expect } from "vitest";
import { shouldAdoptRemoteProfile, mergeUserRecipesById } from "./profileMerge.js";

// Fase 5, punto 5: "Entrar sin cuenta" → completa onboarding localmente →
// luego "Continuar con Google" no debe perder el perfil local (miembros,
// alergias, intolerancias, healthProfiles) si la cuenta de Google ya tenía
// algún dato remoto (de otro dispositivo o una sesión previa abandonada).
describe("shouldAdoptRemoteProfile", () => {
  it("keeps local when local already has a completed profile, even if remote also has one", () => {
    expect(
      shouldAdoptRemoteProfile({ localMemberCount: 3, remoteMemberCount: 1 })
    ).toBe(false);
  });

  it("adopts remote when local has no profile yet (fresh device / cleared storage)", () => {
    expect(
      shouldAdoptRemoteProfile({ localMemberCount: 0, remoteMemberCount: 4 })
    ).toBe(true);
  });

  it("keeps local (no-op) when neither side has a profile", () => {
    expect(
      shouldAdoptRemoteProfile({ localMemberCount: 0, remoteMemberCount: 0 })
    ).toBe(false);
  });

  it("keeps local when remote is empty, regardless of local size", () => {
    expect(
      shouldAdoptRemoteProfile({ localMemberCount: 2, remoteMemberCount: 0 })
    ).toBe(false);
  });
});

// Bug: "si me hago mi propia receta en prod, luego genero el menú y desaparece".
// Root cause: App.jsx's cloud-sync hydration captured `data.userRecipes` before
// its (slow, prod-only) network awaits and later overwrote state with a merge
// built from that stale snapshot. A recipe created WHILE hydration was in
// flight was in neither the snapshot nor the cloud, so the overwrite dropped it.
// The fix merges against the LIVE state at apply time.
describe("mergeUserRecipesById", () => {
  it("unions by id with remote winning on conflict", () => {
    const current = [
      { id: "a", name: "Local A" },
      { id: "b", name: "Local B (stale)" },
    ];
    const remote = [{ id: "b", name: "Remote B (fresh)" }];
    const merged = mergeUserRecipesById(current, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === "b").name).toBe("Remote B (fresh)");
    expect(merged.find((r) => r.id === "a").name).toBe("Local A");
  });

  it("keeps a recipe created mid-hydration (regression for the disappearing bug)", () => {
    // Snapshot taken before the awaits (what hydration captured at mount).
    const snapshotAtHydrationStart = [{ id: "user_1", name: "Vieja" }];
    // Cloud returns only what existed before the new recipe was created.
    const remoteRecipes = [{ id: "user_1", name: "Vieja" }];

    // The user creates a recipe DURING hydration; live state now has it too.
    const liveStateAtApplyTime = [
      { id: "user_1", name: "Vieja" },
      { id: "user_2", name: "Recién creada" },
    ];

    // OLD behaviour (merging from the stale snapshot) would drop user_2.
    const buggy = mergeUserRecipesById(snapshotAtHydrationStart, remoteRecipes);
    expect(buggy.find((r) => r.id === "user_2")).toBeUndefined();

    // FIXED behaviour (merging from live state) keeps it.
    const fixed = mergeUserRecipesById(liveStateAtApplyTime, remoteRecipes);
    expect(fixed.find((r) => r.id === "user_2")?.name).toBe("Recién creada");
    expect(fixed).toHaveLength(2);
  });

  it("handles empty inputs without throwing", () => {
    expect(mergeUserRecipesById()).toEqual([]);
    expect(mergeUserRecipesById([{ id: "x" }], undefined)).toHaveLength(1);
    expect(mergeUserRecipesById(undefined, [{ id: "y" }])).toHaveLength(1);
  });
});
