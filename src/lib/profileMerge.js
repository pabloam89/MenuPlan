// Decides whether to adopt the cloud snapshot of `data` (members, groups,
// allergies, intolerances, healthProfiles, ...) or keep the local one when a
// session first authenticates.
//
// This only governs the *profile* object (see App.jsx's cloud-sync effect).
// userRecipes/recipeVotes are merged separately by id, which is safe because
// those are independent per-item collections. The profile isn't: it's one
// object, so "merge" has to mean "pick a winner" for the whole thing.
//
// The scenario this exists to protect: a user starts with "Entrar sin
// cuenta" (local-only), completes onboarding (members, allergies,
// intolerances, healthProfiles all set up locally), and *then* signs in with
// Google. If that Google account happens to already have *any* prior cloud
// row (even a stale/partial one from another device or an earlier abandoned
// session), blindly preferring "remote when it has members" discards the
// profile the user just finished building — silently.
//
// Policy: local wins whenever it already has a completed profile (at least
// one member configured). Remote is only adopted to hydrate a *fresh*
// session — new device, cleared storage, or the tail end of the "sin
// cuenta" flow before onboarding ran. This can't silently drop a profile a
// user just built locally, at the cost of not "pulling down" a richer
// remote profile on top of a small local one signed in from — an
// intentional trade-off since the alternative is data loss with no undo.
export function shouldAdoptRemoteProfile({ localMemberCount, remoteMemberCount }) {
  const remoteHasProfile = (remoteMemberCount ?? 0) > 0;
  const localHasProfile = (localMemberCount ?? 0) > 0;
  return remoteHasProfile && !localHasProfile;
}
