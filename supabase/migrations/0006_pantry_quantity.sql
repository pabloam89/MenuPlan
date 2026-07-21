-- Upgrades user_pantry from a binary presence checklist to real quantities,
-- so "lo que tengo en casa" can actually be consumed by cooked recipes
-- instead of just gating whether an ingredient shows up on the shopping list.
-- See 0002_user_pantry.sql for the original table (deliberately binary at
-- the time — this migration is the "add quantities" follow-up).
--
-- Also widens `source` to accept 'photo' (despensa photo/OCR capture),
-- alongside the existing 'manual' and 'voice'.
--
-- Run this in: Supabase Dashboard → SQL Editor → staging project → Run.

alter table user_pantry
  add column if not exists qty  numeric not null default 1 check (qty >= 0),
  -- Same closed unit vocabulary the recipe catalog itself uses (g / ml / ud —
  -- see src/lib/kitchenUnits.js), so a recipe's consumption can subtract
  -- directly without a conversion layer.
  add column if not exists unit text not null default 'ud' check (unit in ('g', 'ml', 'ud'));

alter table user_pantry drop constraint if exists user_pantry_source_check;
alter table user_pantry add constraint user_pantry_source_check
  check (source in ('manual', 'voice', 'photo'));
