-- Adds quantity and unit columns to user_pantry, and extends the source
-- constraint to include 'photo' (OCR ticket input).
--
-- qty + unit let the pantry store amounts ("500g de pollo") instead of just
-- binary presence. Defaults (qty=1, unit='ud') keep existing rows valid.

alter table user_pantry
  add column if not exists qty  numeric not null default 1 check (qty >= 0),
  add column if not exists unit text not null default 'ud' check (unit in ('g', 'ml', 'ud'));

alter table user_pantry drop constraint if exists user_pantry_source_check;
alter table user_pantry add constraint user_pantry_source_check
  check (source in ('manual', 'voice', 'photo'));
