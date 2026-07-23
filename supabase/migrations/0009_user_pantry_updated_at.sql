-- Adds `updated_at` to user_pantry so "En casa" can show a compact "última
-- actualización" date per row and filter by it. This is a stock table (not a
-- purchase log), so `updated_at` is a proxy for "fecha de compra": it bumps
-- whenever the row's qty is topped up (new ticket, manual add) or edited —
-- exactly the moments a real purchase date would also move.
--
-- Reuses set_updated_at(), already defined in 0001_recipe_catalog.sql.
--
-- Run this in: Supabase Dashboard → SQL Editor → staging project → Run.

alter table user_pantry add column if not exists updated_at timestamptz;

-- Backfill existing rows with their creation date instead of "now" — an old
-- item shouldn't suddenly look freshly-updated just because this migration
-- ran today.
update user_pantry set updated_at = created_at where updated_at is null;

alter table user_pantry alter column updated_at set not null;
alter table user_pantry alter column updated_at set default now();

drop trigger if exists trg_user_pantry_updated_at on user_pantry;
create trigger trg_user_pantry_updated_at
  before update on user_pantry
  for each row execute function set_updated_at();
