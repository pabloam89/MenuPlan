-- Foreign keys pointing at auth.users had no covering index, so every lookup
-- by user_id (and every cascade delete, including the account-deletion flow in
-- api/delete-account.js) had to scan the whole table. user_events is the one
-- that actually matters: it grows with every session and is already the
-- largest table here.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: the tables are small enough
-- that it's instantaneous, and CONCURRENTLY cannot run inside the transaction
-- a migration executes in.

create index if not exists idx_user_events_user_id on public.user_events (user_id);
create index if not exists idx_app_feedback_user_id on public.app_feedback (user_id);
create index if not exists idx_dish_images_garnish_id on public.dish_images (garnish_id);
