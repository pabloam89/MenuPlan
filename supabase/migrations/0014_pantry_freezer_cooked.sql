-- Congelador + platos cocinados en "En casa".
--
-- Amplía user_pantry (0002 + 0007) con dos ejes nuevos:
--   - frozen: único eje de ubicación que cambia comportamiento (requiere
--     descongelar; el planner lo trata distinto). Despensa vs nevera NO se
--     modela: se deriva en la UI del aisle (isPerishableAisle) — nevera para
--     frescos perecederos, despensa para el resto.
--   - item_type: 'ingredient' (lo de siempre) | 'cooked_dish' (algo ya
--     preparado guardado en tuppers, en raciones).
--
-- Campos solo de plato cocinado (nullable para ingredientes):
--   - portions:   nº de raciones guardadas.
--   - recipe_ref: id de receta del catálogo (recipeCatalogById) para poder
--                 reabrir la receta desde DishDetail.
--   - cooked_at:  cuándo se cocinó, para avisos de frescura (nevera ≈3-4 días).
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

alter table user_pantry
  add column if not exists frozen     boolean not null default false,
  add column if not exists item_type  text not null default 'ingredient'
    check (item_type in ('ingredient', 'cooked_dish')),
  add column if not exists portions   numeric check (portions is null or portions > 0),
  add column if not exists recipe_ref text,
  add column if not exists cooked_at  timestamptz;

-- 'racion' se suma al set cerrado g/ml/ud para los platos cocinados.
alter table user_pantry drop constraint if exists user_pantry_unit_check;
alter table user_pantry add constraint user_pantry_unit_check
  check (unit in ('g', 'ml', 'ud', 'racion'));

-- La unicidad vieja (user_id, ingredient_normalized) impedía tener el MISMO
-- ingrediente fresco y congelado a la vez, y no tiene sentido para platos
-- cocinados (cada tupper es su propia fila). La sustituimos por un índice
-- único PARCIAL solo para ingredientes, incluyendo `frozen`.
alter table user_pantry drop constraint if exists user_pantry_user_id_ingredient_normalized_key;
drop index if exists user_pantry_user_id_ingredient_normalized_key;

create unique index if not exists user_pantry_ingredient_unique
  on user_pantry (user_id, ingredient_normalized, frozen)
  where item_type = 'ingredient';

create index if not exists idx_pantry_item_type on user_pantry(user_id, item_type);
