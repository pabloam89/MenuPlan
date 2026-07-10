import { describe, it, expect } from "vitest";
import { shouldAdoptRemoteProfile } from "./profileMerge.js";

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
