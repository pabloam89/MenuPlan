-- Optional garnish paired with a cooked-dish tupper (e.g. carrilleras + arroz).
alter table user_pantry add column if not exists garnish_ref text;
