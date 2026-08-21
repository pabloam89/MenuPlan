-- Optional pack metadata for pantry rows: how the product was bought/stored
-- (e.g. "1 bote · 570 g") while qty/unit stay in the culinary g/ml/ud domain.

alter table user_pantry
  add column if not exists pack_count numeric,
  add column if not exists pack_kind text,
  add column if not exists pack_size numeric,
  add column if not exists pack_size_unit text check (pack_size_unit is null or pack_size_unit in ('g', 'ml'));
