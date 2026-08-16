-- Wrap auth.uid() in a scalar subquery in every RLS policy that used it bare.
--
-- Postgres treats `auth.uid() = user_id` as a per-row expression: the function
-- is re-evaluated for every row the policy filters. Written as
-- `(select auth.uid()) = user_id` it becomes an InitPlan, evaluated once per
-- statement. Supabase's own linter flags the bare form (auth_rls_initplan) and
-- this is the documented remedy.
--
-- Purely a performance change — the predicates are semantically identical, and
-- isolation was re-verified afterwards (anonymous reads of user_state,
-- user_pantry, user_menus, user_profiles, user_events, app_feedback and
-- recipe_votes all return zero rows against a database that holds data).
--
-- NOTE: user_profiles."update own" has no WITH CHECK, and deliberately still
-- doesn't. Postgres falls back to the USING expression for the row check when
-- WITH CHECK is omitted on an UPDATE policy, so the behaviour is unchanged.

alter policy "insert own" on public.app_feedback with check (((select auth.uid()) = user_id));
alter policy "select own" on public.app_feedback using (((select auth.uid()) = user_id));
alter policy "Users manage own votes" on public.recipe_votes using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "insert own" on public.user_events with check (((select auth.uid()) = user_id));
alter policy "select own" on public.user_events using (((select auth.uid()) = user_id));
alter policy "Follows readable by involved users" on public.user_follows using ((((select auth.uid()) = follower_id) OR ((select auth.uid()) = followee_id)));
alter policy "Users manage own follows" on public.user_follows using (((select auth.uid()) = follower_id)) with check (((select auth.uid()) = follower_id));
alter policy "Users manage own menu recipes" on public.user_menu_recipes using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "Users manage own menu weeks" on public.user_menu_weeks using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "Users manage own menus" on public.user_menus using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "Users manage own pantry" on public.user_pantry using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "insert own" on public.user_profiles with check (((select auth.uid()) = user_id));
alter policy "select own" on public.user_profiles using (((select auth.uid()) = user_id));
alter policy "update own" on public.user_profiles using (((select auth.uid()) = user_id));
alter policy "Friends read friends recipes" on public.user_recipes using (((visibility = 'friends'::recipe_visibility) AND are_mutual_follows((select auth.uid()), owner_id)));
alter policy "Owner manages own recipes" on public.user_recipes using (((select auth.uid()) = owner_id)) with check (((select auth.uid()) = owner_id));
alter policy "Users manage own state" on public.user_state using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
