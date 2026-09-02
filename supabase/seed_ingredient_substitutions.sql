-- Generado por scripts/generate-supabase-seed.mjs — no editar a mano.
-- Requiere supabase/migrations/0031_ingredient_substitutions.sql,
-- y seed_ingredients.sql ejecutada ANTES (FK a ingredients.id).
begin;

delete from ingredient_substitutions;

insert into ingredient_substitutions (
  ingredient_id, restriction, replacement_label, replacement_id, invisible, note
) values
  ('bechamel', 'lactosa_fina', 'Bechamel sin lactosa', NULL, true, 'Se hace igual, con leche sin lactosa.'),
  ('cava', 'alcohol_cocina', 'Cava sin alcohol', NULL, true, NULL),
  ('cerveza', 'alcohol_cocina', 'Cerveza sin alcohol', NULL, true, NULL),
  ('leche', 'lactosa_fina', 'Leche sin lactosa', NULL, true, NULL),
  ('leche-condensada', 'lactosa_fina', 'Leche condensada sin lactosa', NULL, true, NULL),
  ('nata', 'lactosa_fina', 'Nata para cocinar sin lactosa', NULL, true, NULL),
  ('nata-para-montar', 'lactosa_fina', 'Nata para montar sin lactosa', NULL, true, NULL),
  ('queso-fresco', 'lactosa_fina', 'Queso fresco sin lactosa', NULL, true, NULL),
  ('sidra', 'alcohol_cocina', 'Sidra sin alcohol', NULL, true, NULL),
  ('vino-blanco', 'alcohol_cocina', 'Vino blanco sin alcohol', NULL, true, NULL)
on conflict (ingredient_id, restriction) do update set
  replacement_label = excluded.replacement_label,
  replacement_id = excluded.replacement_id,
  invisible = excluded.invisible,
  note = excluded.note;

insert into ingredient_substitutions (
  ingredient_id, restriction, replacement_label, replacement_id, invisible, note
) values
  ('vino-tinto', 'alcohol_cocina', 'Vino tinto sin alcohol', NULL, true, NULL),
  ('yogur', 'lactosa_fina', 'Yogur natural sin lactosa', NULL, true, NULL)
on conflict (ingredient_id, restriction) do update set
  replacement_label = excluded.replacement_label,
  replacement_id = excluded.replacement_id,
  invisible = excluded.invisible,
  note = excluded.note;

commit;
