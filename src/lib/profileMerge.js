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

// Unions user-created recipes by id, with the remote copy winning on conflict.
//
// Callers MUST pass the CURRENT live recipes as `current`, not a snapshot taken
// before the (slow, network-bound) cloud load. The cloud-sync hydration in
// App.jsx captures state before its awaits; if a user creates a recipe while
// that hydration is still in flight, the recipe lives only in live state — it's
// in neither the pre-await snapshot nor the cloud yet. Merging from the stale
// snapshot silently dropped it ("creo mi receta, genero el menú y desaparece").
// Merging from the live state at apply time keeps it.
export function mergeUserRecipesById(current = [], remote = []) {
  const byId = new Map(current.map((r) => [r.id ?? r.name, r]));
  for (const r of remote) byId.set(r.id ?? r.name, r);
  return Array.from(byId.values());
}
