import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {

  ensureUserHousehold,

  joinHouseholdByToken,

  leaveHousehold,

  readInviteTokenFromUrl,

  clearInviteTokenFromUrl,

  loadPendingInviteToken,

  savePendingInviteToken,

  clearPendingInviteToken,

  previewHouseholdInvite,

  setActiveHousehold,

  updateHousehold,

  deleteHousehold,

  removeHouseholdMember,

  resolveActiveHousehold,

  isHouseholdReadOnly,

  canShareHouseholdInvite,

  buildInviteUrl,

} from "./householdsSync.js";



/**

 * Manages household memberships, active household, and invite deep links.

 * @param {{ user: { id: string }|null, loading: boolean }} auth

 */

export function useHousehold({ user, loading: authLoading }) {

  const [households, setHouseholds] = useState([]);

  const [activeHouseholdId, setActiveHouseholdId] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(null);

  const [pendingInvite, setPendingInvite] = useState(null);

  const bootedRef = useRef(false);



  const activeHousehold = useMemo(

    () => resolveActiveHousehold(households, activeHouseholdId),

    [households, activeHouseholdId],

  );



  const readOnly = isHouseholdReadOnly(activeHousehold);

  const canShareInvite = canShareHouseholdInvite(activeHousehold);

  const inviteUrl = useMemo(

    () => buildInviteUrl(activeHousehold?.inviteToken),

    [activeHousehold?.inviteToken],

  );



  const refresh = useCallback(async () => {

    if (!user?.id) {

      setHouseholds([]);

      setActiveHouseholdId(null);

      return null;

    }

    setLoading(true);

    setError(null);

    const result = await ensureUserHousehold();

    if (!result) {

      setLoading(false);

      setError("No se pudieron cargar los hogares");

      bootedRef.current = false;

      return null;

    }

    if (result.error) {

      setHouseholds(result.households ?? []);

      setActiveHouseholdId(result.activeHouseholdId ?? null);

      setLoading(false);

      setError(result.error);

      bootedRef.current = false;

      return null;

    }

    setHouseholds(result.households);

    setActiveHouseholdId(result.activeHouseholdId);

    setLoading(false);

    return result;

  }, [user?.id]);



  const switchHousehold = useCallback(async (householdId) => {

    if (!householdId || householdId === activeHouseholdId) return true;

    const ok = await setActiveHousehold(householdId);

    if (!ok) return false;

    setActiveHouseholdId(householdId);

    return true;

  }, [activeHouseholdId]);



  const joinByToken = useCallback(async (token) => {

    const result = await joinHouseholdByToken(token);

    if (!result || result.error) {

      setError(result?.error ?? "No se pudo unir al hogar");

      return null;

    }

    if (user?.id) await clearPendingInviteToken(user.id);

    setPendingInvite(null);

    await refresh();

    setActiveHouseholdId(result.householdId);

    return result;

  }, [refresh, user?.id]);



  const leave = useCallback(async (householdId) => {

    const ok = await leaveHousehold(householdId);

    if (!ok) return false;

    await refresh();

    return true;

  }, [refresh]);



  const removeMember = useCallback(async (householdId, memberUserId) => {

    const ok = await removeHouseholdMember(householdId, memberUserId);

    if (!ok) return false;

    return true;

  }, []);



  const renameHousehold = useCallback(async (householdId, name) => {

    const ok = await updateHousehold(householdId, { name });

    if (!ok) return false;

    await refresh();

    return true;

  }, [refresh]);



  const advanceSetupStatus = useCallback(async (householdId, setupStatus) => {

    const ok = await updateHousehold(householdId, { setupStatus });

    if (!ok) return false;

    await refresh();

    return true;

  }, [refresh]);



  const destroyHousehold = useCallback(async (householdId) => {
    const ok = await deleteHousehold(householdId);
    if (!ok) return { ok: false, householdId: null };

    const result = await refresh();
    const newId = result?.activeHouseholdId ?? null;

    if (newId) {
      await updateHousehold(newId, { setupStatus: "invite_ready" });
      await refresh();
    }

    return { ok: true, householdId: newId };
  }, [refresh]);



  const acceptPendingInvite = useCallback(async () => {

    if (!pendingInvite?.token) return null;

    return joinByToken(pendingInvite.token);

  }, [joinByToken, pendingInvite]);



  const dismissPendingInvite = useCallback(async () => {

    if (user?.id) await clearPendingInviteToken(user.id);

    setPendingInvite(null);

  }, [user?.id]);



  // Bootstrap on login + capture ?join= for accept banner (no auto-join)

  useEffect(() => {

    if (authLoading) return;

    if (!user?.id) {

      bootedRef.current = false;

      setHouseholds([]);

      setActiveHouseholdId(null);

      setPendingInvite(null);

      return;

    }

    if (bootedRef.current) return;

    bootedRef.current = true;



    (async () => {

      const urlToken = readInviteTokenFromUrl();

      if (urlToken) {

        await savePendingInviteToken(user.id, urlToken);

        clearInviteTokenFromUrl();

      }



      await refresh();



      const pending = urlToken || (await loadPendingInviteToken(user.id));

      if (!pending) return;



      const preview = await previewHouseholdInvite(pending);

      if (preview) {

        setPendingInvite({

          token: pending,

          householdId: preview.householdId,

          householdName: preview.householdName,

        });

      } else if (user.id) {

        await clearPendingInviteToken(user.id);

      }

    })();

  }, [authLoading, user?.id, refresh]);



  return {

    households,

    activeHousehold,

    activeHouseholdId,

    loading,

    error,

    readOnly,

    canShareInvite,

    inviteUrl,

    pendingInvite,

    refresh,

    switchHousehold,

    joinByToken,

    leave,

    removeMember,

    renameHousehold,

    advanceSetupStatus,

    destroyHousehold,

    acceptPendingInvite,

    dismissPendingInvite,

  };

}

