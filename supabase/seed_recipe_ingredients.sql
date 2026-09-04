-- Generado por scripts/generate-supabase-seed.mjs — no editar a mano.
-- Requiere supabase/migrations/0030_recipe_ingredients.sql aplicada,
-- y seed_ingredients.sql ejecutada ANTES (hay FK a ingredients.id).
begin;

delete from recipe_ingredients;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_001', 0, 'calabacin', 'Calabacín', 80, 'g'),
  ('bebes_001', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 30, 'g'),
  ('bebes_001', 2, 'cuscus', 'Cuscús', 20, 'g'),
  ('bebes_001', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_001', 4, 'caldo-de-verduras', 'Caldo casero sin sal', 200, 'ml'),
  ('bebes_002', 0, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('bebes_002', 1, 'merluza', 'Merluza', 40, 'g'),
  ('bebes_002', 2, 'patata', 'Patata', 60, 'g'),
  ('bebes_002', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_003', 0, 'calabaza', 'Calabaza', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_003', 1, 'pechuga-de-pavo', 'Pechuga de pavo', 30, 'g'),
  ('bebes_003', 2, 'boniato', 'Boniato', 60, 'g'),
  ('bebes_003', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_004', 0, 'judia-verde', 'Judías verdes', 60, 'g'),
  ('bebes_004', 1, 'ternera-magra', 'Ternera magra', 30, 'g'),
  ('bebes_004', 2, 'patata', 'Patata', 70, 'g'),
  ('bebes_004', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_005', 0, 'guisantes', 'Guisantes', 60, 'g'),
  ('bebes_005', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 30, 'g'),
  ('bebes_005', 2, 'arroz', 'Arroz', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_005', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_006', 0, 'brocoli', 'Brócoli', 70, 'g'),
  ('bebes_006', 1, 'merluza', 'Merluza', 40, 'g'),
  ('bebes_006', 2, 'arroz', 'Arroz', 15, 'g'),
  ('bebes_006', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_007', 0, 'arroz', 'Arroz', 25, 'g'),
  ('bebes_007', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 30, 'g'),
  ('bebes_007', 2, 'zanahoria', 'Zanahoria', 40, 'g'),
  ('bebes_007', 3, 'aceite-oliva', 'Aceite de oliva', 3, 'ml'),
  ('bebes_008', 0, 'lentejas-rojas', 'Lentejas rojas', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_008', 1, 'zanahoria', 'Zanahoria', 50, 'g'),
  ('bebes_008', 2, 'calabacin', 'Calabacín', 40, 'g'),
  ('bebes_008', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_009', 0, 'boniato', 'Boniato', 80, 'g'),
  ('bebes_009', 1, 'pechuga-de-pavo', 'Pechuga de pavo', 30, 'g'),
  ('bebes_009', 2, 'calabacin', 'Calabacín', 50, 'g'),
  ('bebes_009', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_010', 0, 'puerro', 'Puerro', 50, 'g'),
  ('bebes_010', 1, 'salmon-fresco', 'Salmón fresco', 30, 'g'),
  ('bebes_010', 2, 'arroz', 'Arroz', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_010', 3, 'aceite-oliva', 'Aceite de oliva', 3, 'ml'),
  ('bebes_012', 0, 'garbanzos', 'Garbanzos cocidos', 60, 'g'),
  ('bebes_012', 1, 'calabaza', 'Calabaza', 60, 'g'),
  ('bebes_012', 2, 'zanahoria', 'Zanahoria', 40, 'g'),
  ('bebes_012', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_013', 0, 'huevos', 'Huevo', 1, 'ud'),
  ('bebes_013', 1, 'boniato', 'Boniato', 60, 'g'),
  ('bebes_013', 2, 'tomate', 'Tomate natural', 30, 'g'),
  ('bebes_013', 3, 'aceite-oliva', 'Aceite de oliva', 3, 'ml'),
  ('bebes_014', 0, 'avena', 'Copos de avena', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_014', 1, 'ternera-magra', 'Ternera magra', 30, 'g'),
  ('bebes_014', 2, 'espinacas', 'Espinacas frescas', 60, 'g'),
  ('bebes_014', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_014', 4, 'caldo-de-verduras', 'Caldo casero sin sal', 200, 'ml'),
  ('bebes_015', 0, 'calabacin', 'Calabacín', 100, 'g'),
  ('bebes_015', 1, 'huevos', 'Huevo', 1, 'ud'),
  ('bebes_015', 2, 'semola-de-trigo', 'Sémola de trigo', 15, 'g'),
  ('bebes_015', 3, 'aceite-oliva', 'Aceite de oliva', 3, 'ml'),
  ('bebes_016', 0, 'coliflor', 'Coliflor', 70, 'g'),
  ('bebes_016', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_016', 2, 'patata', 'Patata', 60, 'g'),
  ('bebes_016', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_018', 0, 'remolacha', 'Remolacha cocida', 60, 'g'),
  ('bebes_018', 1, 'pechuga-de-pavo', 'Pechuga de pavo', 30, 'g'),
  ('bebes_018', 2, 'patata', 'Patata', 60, 'g'),
  ('bebes_018', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_019', 0, 'espinacas', 'Espinacas frescas', 50, 'g'),
  ('bebes_019', 1, 'salmon-fresco', 'Salmón fresco', 30, 'g'),
  ('bebes_019', 2, 'boniato', 'Boniato', 60, 'g'),
  ('bebes_019', 3, 'aceite-oliva', 'Aceite de oliva', 3, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('bebes_021', 0, 'garbanzos', 'Garbanzos cocidos', 60, 'g'),
  ('bebes_021', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 30, 'g'),
  ('bebes_021', 2, 'espinacas', 'Espinacas frescas', 40, 'g'),
  ('bebes_021', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('bebes_022', 0, 'lentejas-rojas', 'Lentejas rojas', 30, 'g'),
  ('bebes_022', 1, 'ternera-magra', 'Ternera magra', 30, 'g'),
  ('bebes_022', 2, 'zanahoria', 'Zanahoria', 50, 'g'),
  ('bebes_022', 3, 'aceite-oliva', 'Aceite de oliva', 5, 'ml'),
  ('carnes_001', 0, 'contramuslos-de-pollo', 'Contramuslos de pollo', 400, 'g'),
  ('carnes_001', 1, 'patata', 'Patata', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_001', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_001', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_001', 4, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_001', 5, 'limon', 'Limón', 1, 'ud'),
  ('carnes_001', 6, 'romero', 'Romero', 3, 'g'),
  ('carnes_002', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_002', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_002', 2, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_002', 3, 'oregano', 'Orégano', 2, 'g'),
  ('carnes_002', 4, 'limon', 'Limón', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_003', 0, 'carne-picada', 'Carne picada de cerdo', 300, 'g'),
  ('carnes_003', 1, 'pan-rallado', 'Pan rallado', 30, 'g'),
  ('carnes_003', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_003', 3, 'tomate-triturado', 'Tomate triturado', 300, 'ml'),
  ('carnes_003', 4, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_003', 5, 'ajo', 'Ajo', 8, 'g'),
  ('carnes_003', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_003', 7, 'harina', 'Harina', 15, 'g'),
  ('carnes_004', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 300, 'g'),
  ('carnes_004', 1, 'huevos', 'Huevo', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_004', 2, 'pan-rallado', 'Pan rallado', 60, 'g'),
  ('carnes_004', 3, 'harina', 'Harina', 30, 'g'),
  ('carnes_004', 4, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_005', 0, 'carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 350, 'g'),
  ('carnes_005', 1, 'patata', 'Patata', 200, 'g'),
  ('carnes_005', 2, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('carnes_005', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_005', 4, 'vino-tinto', 'Vino tinto', 80, 'ml'),
  ('carnes_005', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('carnes_005', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_005', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_006', 0, 'pollo', 'Pollo troceado', 500, 'g'),
  ('carnes_006', 1, 'ajo', 'Ajo', 20, 'g'),
  ('carnes_006', 2, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_006', 3, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('carnes_006', 4, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_006', 5, 'guindilla', 'Guindilla', 1, 'ud'),
  ('carnes_007', 0, 'cinta-de-lomo', 'Cinta de lomo', 300, 'g'),
  ('carnes_007', 1, 'pimenton', 'Pimentón', 6, 'g'),
  ('carnes_007', 2, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_007', 3, 'oregano', 'Orégano', 3, 'g'),
  ('carnes_007', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_007', 5, 'vinagre', 'Vinagre', 15, 'ml'),
  ('carnes_009', 0, 'carne-picada', 'Carne picada de ternera', 300, 'g'),
  ('carnes_009', 1, 'cebolla', 'Cebolla', 40, 'g'),
  ('carnes_009', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_009', 3, 'pan-rallado', 'Pan rallado', 20, 'g'),
  ('carnes_009', 4, 'hamburguesa', 'Pan de hamburguesa', 2, 'ud'),
  ('carnes_009', 5, 'tomate', 'Tomate', 80, 'g'),
  ('carnes_009', 6, 'lechuga', 'Lechuga', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_009', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_010', 0, 'pollo', 'Pollo troceado', 500, 'g'),
  ('carnes_010', 1, 'pimiento-rojo', 'Pimiento rojo', 120, 'g'),
  ('carnes_010', 2, 'pimiento-verde', 'Pimiento verde', 120, 'g'),
  ('carnes_010', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_010', 4, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('carnes_010', 5, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_010', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_011', 0, 'costilla', 'Costillas de cerdo', 500, 'g'),
  ('carnes_011', 1, 'ajo', 'Ajo', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_011', 2, 'miel', 'Miel', 20, 'ml'),
  ('carnes_011', 3, 'limon', 'Limón', 1, 'ud'),
  ('carnes_011', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_011', 5, 'pimenton', 'Pimentón', 5, 'g'),
  ('carnes_011', 6, 'romero', 'Romero', 3, 'g'),
  ('carnes_012', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 250, 'g'),
  ('carnes_012', 1, 'jamon-york', 'Jamón cocido', 60, 'g'),
  ('carnes_012', 2, 'queso-en-lonchas', 'Queso en lonchas', 60, 'g'),
  ('carnes_012', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_012', 4, 'pan-rallado', 'Pan rallado', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_012', 5, 'harina', 'Harina', 20, 'g'),
  ('carnes_012', 6, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_013', 0, 'muslo-de-pollo', 'Muslos de pollo', 500, 'g'),
  ('carnes_013', 1, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_013', 2, 'ajo', 'Ajo', 12, 'g'),
  ('carnes_013', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_013', 4, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('carnes_013', 5, 'tomillo', 'Tomillo', 3, 'g'),
  ('carnes_014', 0, 'carne-picada', 'Carne picada de ternera', 300, 'g'),
  ('carnes_014', 1, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_014', 2, 'pan-rallado', 'Pan rallado', 25, 'g'),
  ('carnes_014', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_014', 4, 'ajo', 'Ajo', 6, 'g'),
  ('carnes_014', 5, 'perejil', 'Perejil', 5, 'g'),
  ('carnes_014', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_016', 0, 'pollo', 'Pollo troceado', 500, 'g'),
  ('carnes_016', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_016', 2, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_016', 3, 'almendras', 'Almendras', 30, 'g'),
  ('carnes_016', 4, 'huevos', 'Huevo cocido', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_016', 5, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('carnes_016', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_016', 7, 'azafran', 'Azafrán', 1, 'g'),
  ('carnes_017', 0, 'magro-de-cerdo', 'Magro de cerdo', 300, 'g'),
  ('carnes_017', 1, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('carnes_017', 2, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('carnes_017', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('carnes_017', 4, 'ajo', 'Ajo', 8, 'g'),
  ('carnes_017', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_018', 0, 'secreto-iberico', 'Secreto ibérico', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_018', 1, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('carnes_018', 2, 'ajo', 'Ajo', 6, 'g'),
  ('carnes_018', 3, 'romero', 'Romero', 2, 'g'),
  ('carnes_019', 0, 'alitas-de-pollo', 'Alitas de pollo', 500, 'g'),
  ('carnes_019', 1, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_019', 2, 'pimenton', 'Pimentón', 5, 'g'),
  ('carnes_019', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_019', 4, 'miel', 'Miel', 15, 'ml'),
  ('carnes_019', 5, 'limon', 'Limón', 1, 'ud'),
  ('carnes_020', 0, 'solomillo', 'Solomillo de cerdo', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_020', 1, 'pedro-ximenez', 'Pedro Ximénez', 80, 'ml'),
  ('carnes_020', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_020', 3, 'champinon', 'Champiñones', 100, 'g'),
  ('carnes_020', 4, 'nata', 'Nata', 40, 'ml'),
  ('carnes_020', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_022', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 300, 'g'),
  ('carnes_022', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_022', 2, 'ajo', 'Ajo', 8, 'g'),
  ('carnes_022', 3, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('carnes_022', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_022', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_022', 6, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_023', 0, 'escalopines-de-ternera', 'Escalopines de ternera', 300, 'g'),
  ('carnes_023', 1, 'harina', 'Harina', 15, 'g'),
  ('carnes_023', 2, 'limon', 'Limón', 1, 'ud'),
  ('carnes_023', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_023', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_023', 5, 'perejil', 'Perejil', 5, 'g'),
  ('carnes_024', 0, 'pechuga-de-pavo', 'Pechuga de pavo', 350, 'g'),
  ('carnes_024', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_024', 2, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_024', 3, 'oregano', 'Orégano', 2, 'g'),
  ('carnes_024', 4, 'limon', 'Limón', 1, 'ud'),
  ('carnes_025', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_025', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_025', 2, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('carnes_025', 3, 'nata', 'Nata', 60, 'ml'),
  ('carnes_025', 4, 'curry', 'Curry en polvo', 8, 'g'),
  ('carnes_025', 5, 'ajo', 'Ajo', 8, 'g'),
  ('carnes_025', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_026', 0, 'pollo', 'Carne picada de pollo', 300, 'g'),
  ('carnes_026', 1, 'pan-rallado', 'Pan rallado', 25, 'g'),
  ('carnes_026', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_026', 3, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('carnes_026', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('carnes_026', 5, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('carnes_026', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_026', 7, 'ajo', 'Ajo', 6, 'g'),
  ('carnes_027', 0, 'chuletas-de-cerdo', 'Chuletas de cerdo', 400, 'g'),
  ('carnes_027', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_027', 2, 'ajo', 'Ajo', 8, 'g'),
  ('carnes_027', 3, 'romero', 'Romero', 2, 'g'),
  ('carnes_028', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_028', 1, 'champinon', 'Champiñones', 200, 'g'),
  ('carnes_028', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('carnes_028', 3, 'ajo', 'Ajo', 8, 'g'),
  ('carnes_028', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('carnes_028', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_028', 6, 'perejil', 'Perejil', 5, 'g'),
  ('carnes_029', 0, 'redondo-de-ternera', 'Redondo de ternera', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_029', 1, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('carnes_029', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_029', 3, 'vino-tinto', 'Vino tinto', 100, 'ml'),
  ('carnes_029', 4, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_029', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_029', 6, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_029', 7, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('carnes_030', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_030', 1, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('carnes_030', 2, 'pimiento-verde', 'Pimiento verde', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_030', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('carnes_030', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_030', 5, 'oregano', 'Orégano', 3, 'g'),
  ('carnes_030', 6, 'limon', 'Limón', 1, 'ud'),
  ('carnes_031', 0, 'filetes-finos-de-ternera', 'Filetes finos de ternera', 300, 'g'),
  ('carnes_031', 1, 'setas', 'Setas', 150, 'g'),
  ('carnes_031', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_031', 3, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('carnes_031', 4, 'vino-blanco', 'Vino rancio', 60, 'ml'),
  ('carnes_031', 5, 'harina', 'Harina', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_031', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_031', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_032', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_032', 1, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_032', 2, 'pan-rallado', 'Pan rallado', 50, 'g'),
  ('carnes_032', 3, 'harina', 'Harina', 20, 'g'),
  ('carnes_032', 4, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_032', 5, 'limon', 'Limón', 1, 'ud'),
  ('carnes_033', 0, 'carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 350, 'g'),
  ('carnes_033', 1, 'zanahoria', 'Zanahoria', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_033', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_033', 3, 'apio', 'Apio', 50, 'g'),
  ('carnes_033', 4, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('carnes_033', 5, 'vino-tinto', 'Vino tinto', 80, 'ml'),
  ('carnes_033', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_033', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_034', 0, 'pollo', 'Pollo troceado', 500, 'g'),
  ('carnes_034', 1, 'cerveza', 'Cerveza', 200, 'ml'),
  ('carnes_034', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_034', 3, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_034', 4, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_034', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_035', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 250, 'g'),
  ('carnes_035', 1, 'jamon', 'Jamón serrano', 60, 'g'),
  ('carnes_035', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_035', 3, 'pan-rallado', 'Pan rallado', 50, 'g'),
  ('carnes_035', 4, 'harina', 'Harina', 20, 'g'),
  ('carnes_035', 5, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('carnes_037', 0, 'carrillera', 'Carrillera de ternera', 900, 'g'),
  ('carnes_037', 1, 'vino-tinto', 'Vino tinto', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_037', 2, 'apionabo', 'Apionabo', 600, 'g'),
  ('carnes_037', 3, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('carnes_037', 4, 'cebolla', 'Cebolla', 200, 'g'),
  ('carnes_037', 5, 'puerro', 'Puerro', 100, 'g'),
  ('carnes_037', 6, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_037', 7, 'caldo-de-carne', 'Caldo de carne', 300, 'ml'),
  ('carnes_037', 8, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_037', 9, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('carnes_037', 10, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('carnes_037', 11, 'harina', 'Harina', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_037', 12, 'tomillo', 'Tomillo', 3, 'g'),
  ('carnes_037', 13, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_037', 14, 'sal', 'Sal', 6, 'g'),
  ('carnes_037', 15, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_038', 0, 'solomillo', 'Solomillo de ternera', 900, 'g'),
  ('carnes_038', 1, 'foie', 'Foie mi-cuit', 150, 'g'),
  ('carnes_038', 2, 'champinon', 'Champiñones', 400, 'g'),
  ('carnes_038', 3, 'jamon', 'Jamón serrano en lonchas finas', 100, 'g'),
  ('carnes_038', 4, 'hojaldre', 'Hojaldre', 400, 'g'),
  ('carnes_038', 5, 'mostaza', 'Mostaza de Dijon', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_038', 6, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_038', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_038', 8, 'sal', 'Sal', 6, 'g'),
  ('carnes_038', 9, 'pimienta', 'Pimienta negra', 3, 'g'),
  ('carnes_038', 10, 'tomillo', 'Tomillo', 2, 'g'),
  ('carnes_039', 0, 'costilla', 'Costillar de cerdo', 1400, 'g'),
  ('carnes_039', 1, 'salsa-soja', 'Salsa de soja', 60, 'ml'),
  ('carnes_039', 2, 'miel', 'Miel', 80, 'g'),
  ('carnes_039', 3, 'ketchup', 'Ketchup', 60, 'g'),
  ('carnes_039', 4, 'vinagre-de-manzana', 'Vinagre de manzana', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_039', 5, 'ajo', 'Ajo', 20, 'g'),
  ('carnes_039', 6, 'pimenton', 'Pimentón dulce', 6, 'g'),
  ('carnes_039', 7, 'pimenton', 'Pimentón picante', 3, 'g'),
  ('carnes_039', 8, 'comino', 'Comino', 3, 'g'),
  ('carnes_039', 9, 'sal', 'Sal', 8, 'g'),
  ('carnes_039', 10, 'pimienta', 'Pimienta negra', 3, 'g'),
  ('carnes_039', 11, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_040', 0, 'pato', 'Pechuga de pato', 400, 'g'),
  ('carnes_040', 1, 'naranja', 'Naranja', 2, 'ud'),
  ('carnes_040', 2, 'naranja', 'Zumo de naranja', 150, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_040', 3, 'azucar', 'Azúcar', 40, 'g'),
  ('carnes_040', 4, 'cointreau', 'Cointreau', 50, 'ml'),
  ('carnes_040', 5, 'vinagre', 'Vinagre de vino blanco', 15, 'ml'),
  ('carnes_040', 6, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_040', 7, 'caldo-de-pollo', 'Caldo de pollo', 100, 'ml'),
  ('carnes_040', 8, 'sal', 'Sal', 4, 'g'),
  ('carnes_040', 9, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_041', 0, 'pato', 'Magret de pato', 400, 'g'),
  ('carnes_041', 1, 'frutos-rojos', 'Frutos rojos (frambuesa, mora, arándano)', 200, 'g'),
  ('carnes_041', 2, 'vino-tinto', 'Vino tinto', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_041', 3, 'azucar-moreno', 'Azúcar moreno', 30, 'g'),
  ('carnes_041', 4, 'vinagre-balsamico', 'Vinagre balsámico', 15, 'ml'),
  ('carnes_041', 5, 'chalota', 'Chalota', 40, 'g'),
  ('carnes_041', 6, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('carnes_041', 7, 'sal', 'Sal', 4, 'g'),
  ('carnes_041', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_042', 0, 'rabo-de-toro', 'Rabo de toro troceado', 1400, 'g'),
  ('carnes_042', 1, 'vino-blanco', 'Vino de Jerez', 300, 'ml'),
  ('carnes_042', 2, 'cebolla', 'Cebolla', 250, 'g'),
  ('carnes_042', 3, 'zanahoria', 'Zanahoria', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_042', 4, 'puerro', 'Puerro', 100, 'g'),
  ('carnes_042', 5, 'ajo', 'Ajo', 20, 'g'),
  ('carnes_042', 6, 'tomate-triturado', 'Tomate triturado', 200, 'g'),
  ('carnes_042', 7, 'caldo-de-carne', 'Caldo de carne', 400, 'ml'),
  ('carnes_042', 8, 'harina', 'Harina', 20, 'g'),
  ('carnes_042', 9, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_042', 10, 'laurel', 'Laurel', 2, 'ud'),
  ('carnes_042', 11, 'pimienta', 'Pimienta negra', 3, 'g'),
  ('carnes_042', 12, 'sal', 'Sal', 8, 'g'),
  ('carnes_042', 13, 'patata', 'Patata', 500, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_042', 14, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_042', 15, 'leche', 'Leche', 80, 'ml'),
  ('carnes_043', 0, 'medio-cochinillo', 'Medio cochinillo', 2500, 'g'),
  ('carnes_043', 1, 'manteca-de-cerdo', 'Manteca de cerdo', 300, 'g'),
  ('carnes_043', 2, 'ajo', 'Ajo', 40, 'g'),
  ('carnes_043', 3, 'laurel', 'Laurel', 4, 'ud'),
  ('carnes_043', 4, 'tomillo', 'Tomillo', 6, 'g'),
  ('carnes_043', 5, 'sal-gruesa', 'Sal gorda', 30, 'g'),
  ('carnes_043', 6, 'pimienta', 'Pimienta negra', 6, 'g'),
  ('carnes_043', 7, 'vino-blanco', 'Vino blanco', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_044', 0, 'solomillo', 'Solomillo de ternera', 400, 'g'),
  ('carnes_044', 1, 'patata', 'Patata', 500, 'g'),
  ('carnes_044', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('carnes_044', 3, 'whisky', 'Whisky', 60, 'ml'),
  ('carnes_044', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('carnes_044', 5, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_044', 6, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('carnes_044', 7, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_044', 8, 'sal', 'Sal', 6, 'g'),
  ('carnes_044', 9, 'pimienta', 'Pimienta negra', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_044', 10, 'perejil', 'Perejil fresco', 5, 'g'),
  ('carnes_045', 0, 'entrania-de-ternera', 'Entraña de ternera', 400, 'g'),
  ('carnes_045', 1, 'perejil', 'Perejil fresco', 20, 'g'),
  ('carnes_045', 2, 'oregano', 'Orégano seco', 3, 'g'),
  ('carnes_045', 3, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_045', 4, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('carnes_045', 5, 'vinagre', 'Vinagre de vino tinto', 20, 'ml'),
  ('carnes_045', 6, 'guindilla', 'Guindilla en copos', 1, 'g'),
  ('carnes_045', 7, 'sal', 'Sal', 6, 'g'),
  ('carnes_045', 8, 'pimienta', 'Pimienta negra', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_046', 0, 'solomillo', 'Solomillo de ternera muy fresco', 300, 'g'),
  ('carnes_046', 1, 'yema-de-huevo', 'Yema de huevo', 2, 'ud'),
  ('carnes_046', 2, 'alcaparras', 'Alcaparras', 20, 'g'),
  ('carnes_046', 3, 'pepinillos', 'Pepinillos en vinagre', 30, 'g'),
  ('carnes_046', 4, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('carnes_046', 5, 'mostaza', 'Mostaza de Dijon', 15, 'g'),
  ('carnes_046', 6, 'salsa-worcestershire', 'Salsa Worcestershire', 10, 'ml'),
  ('carnes_046', 7, 'tabasco', 'Tabasco', 2, 'ml'),
  ('carnes_046', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_046', 9, 'sal', 'Sal', 4, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_046', 10, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_046', 11, 'pan', 'Pan tostado', 100, 'g'),
  ('carnes_047', 0, 'presa-iberica', 'Presa ibérica', 400, 'g'),
  ('carnes_047', 1, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('carnes_047', 2, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_047', 3, 'comino', 'Comino', 2, 'g'),
  ('carnes_047', 4, 'pimenton', 'Pimentón dulce', 4, 'g'),
  ('carnes_047', 5, 'pimenton', 'Pimentón picante', 2, 'g'),
  ('carnes_047', 6, 'vinagre', 'Vinagre de vino', 15, 'ml'),
  ('carnes_047', 7, 'aceite-oliva', 'Aceite de oliva', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_047', 8, 'sal', 'Sal', 6, 'g'),
  ('carnes_047', 9, 'pan', 'Pan duro', 20, 'g'),
  ('carnes_048', 0, 'jarrete-de-ternera', 'Jarrete de ternera con hueso (ossobuco)', 1200, 'g'),
  ('carnes_048', 1, 'harina', 'Harina', 30, 'g'),
  ('carnes_048', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('carnes_048', 3, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('carnes_048', 4, 'apio', 'Apio', 100, 'g'),
  ('carnes_048', 5, 'vino-blanco', 'Vino blanco', 150, 'ml'),
  ('carnes_048', 6, 'tomate-triturado', 'Tomate triturado', 300, 'g'),
  ('carnes_048', 7, 'caldo-de-carne', 'Caldo de carne', 300, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_048', 8, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_048', 9, 'perejil', 'Perejil fresco', 15, 'g'),
  ('carnes_048', 10, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_048', 11, 'limon', 'Limón', 1, 'ud'),
  ('carnes_048', 12, 'patata', 'Patata', 500, 'g'),
  ('carnes_048', 13, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_048', 14, 'leche', 'Leche', 60, 'ml'),
  ('carnes_048', 15, 'sal', 'Sal', 8, 'g'),
  ('carnes_048', 16, 'pimienta', 'Pimienta negra', 3, 'g'),
  ('carnes_049', 0, 'pluma-iberica', 'Pluma ibérica', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_049', 1, 'pera', 'Pera', 2, 'ud'),
  ('carnes_049', 2, 'vino-blanco', 'Vino Pedro Ximénez', 150, 'ml'),
  ('carnes_049', 3, 'chalota', 'Chalota', 40, 'g'),
  ('carnes_049', 4, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_049', 5, 'caldo-de-carne', 'Caldo de carne', 80, 'ml'),
  ('carnes_049', 6, 'sal', 'Sal', 5, 'g'),
  ('carnes_049', 7, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_049', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_050', 0, 'codorniz', 'Codorniz limpia entera', 8, 'ud'),
  ('carnes_050', 1, 'cebolla', 'Cebolla', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_050', 2, 'zanahoria', 'Zanahoria', 200, 'g'),
  ('carnes_050', 3, 'ajo', 'Ajo', 30, 'g'),
  ('carnes_050', 4, 'vinagre', 'Vinagre de vino blanco', 200, 'ml'),
  ('carnes_050', 5, 'vino-blanco', 'Vino blanco', 150, 'ml'),
  ('carnes_050', 6, 'aceite-oliva', 'Aceite de oliva', 200, 'ml'),
  ('carnes_050', 7, 'laurel', 'Laurel', 4, 'ud'),
  ('carnes_050', 8, 'romero', 'Romero', 5, 'g'),
  ('carnes_050', 9, 'pimienta', 'Pimienta negra en grano', 3, 'g'),
  ('carnes_050', 10, 'sal', 'Sal', 8, 'g'),
  ('carnes_050', 11, 'harina', 'Harina', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_051', 0, 'costilla', 'Costillas de cerdo', 1200, 'g'),
  ('carnes_051', 1, 'salsa-barbacoa', 'Salsa barbacoa', 150, 'g'),
  ('carnes_051', 2, 'miel', 'Miel', 40, 'g'),
  ('carnes_051', 3, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('carnes_051', 4, 'ajo-polvo', 'Ajo en polvo', 5, 'g'),
  ('carnes_051', 5, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('carnes_051', 6, 'sal', 'Sal', 6, 'g'),
  ('carnes_051', 7, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_051', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_052', 0, 'carne-picada', 'Carne picada de ternera y cerdo', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_052', 1, 'pan-rallado', 'Pan rallado', 30, 'g'),
  ('carnes_052', 2, 'leche', 'Leche', 40, 'ml'),
  ('carnes_052', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_052', 4, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_052', 5, 'perejil', 'Perejil fresco', 8, 'g'),
  ('carnes_052', 6, 'boletus', 'Boletus', 200, 'g'),
  ('carnes_052', 7, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_052', 8, 'vino-blanco', 'Vino blanco', 80, 'ml'),
  ('carnes_052', 9, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('carnes_052', 10, 'caldo-de-carne', 'Caldo de carne', 150, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_052', 11, 'harina', 'Harina', 20, 'g'),
  ('carnes_052', 12, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_052', 13, 'sal', 'Sal', 6, 'g'),
  ('carnes_052', 14, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_053', 0, 'pato', 'Pechuga de pato', 400, 'g'),
  ('carnes_053', 1, 'boniato', 'Boniato', 500, 'g'),
  ('carnes_053', 2, 'naranja', 'Naranja', 2, 'ud'),
  ('carnes_053', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_053', 4, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('carnes_053', 5, 'sal', 'Sal', 6, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_053', 6, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_053', 7, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('carnes_054', 0, 'chuleton-de-ternera', 'Chuletón de ternera madurada', 900, 'g'),
  ('carnes_054', 1, 'sal-escamas', 'Sal en escamas', 8, 'g'),
  ('carnes_054', 2, 'pimienta', 'Pimienta negra', 3, 'g'),
  ('carnes_054', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_055', 0, 'carrillada', 'Carrillada ibérica', 1000, 'g'),
  ('carnes_055', 1, 'vino-blanco', 'Vino de Oporto', 250, 'ml'),
  ('carnes_055', 2, 'cebolla', 'Cebolla', 200, 'g'),
  ('carnes_055', 3, 'zanahoria', 'Zanahoria', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_055', 4, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_055', 5, 'caldo-de-carne', 'Caldo de carne', 250, 'ml'),
  ('carnes_055', 6, 'harina', 'Harina', 20, 'g'),
  ('carnes_055', 7, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_055', 8, 'laurel', 'Laurel', 2, 'ud'),
  ('carnes_055', 9, 'sal', 'Sal', 6, 'g'),
  ('carnes_055', 10, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_056', 0, 'solomillo', 'Solomillo de ternera', 300, 'g'),
  ('carnes_056', 1, 'sesamo', 'Sésamo blanco y negro', 25, 'g'),
  ('carnes_056', 2, 'salsa-soja', 'Salsa de soja', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_056', 3, 'mirin', 'Mirin', 20, 'ml'),
  ('carnes_056', 4, 'vinagre', 'Vinagre de arroz', 15, 'ml'),
  ('carnes_056', 5, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('carnes_056', 6, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('carnes_056', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_056', 8, 'cebollino', 'Cebollino', 5, 'g'),
  ('carnes_057', 0, 'filete-de-ternera', 'Filete de ternera', 350, 'g'),
  ('carnes_057', 1, 'perejil', 'Perejil fresco', 20, 'g'),
  ('carnes_057', 2, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_057', 3, 'limon', 'Limón', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_057', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_057', 5, 'sal', 'Sal', 5, 'g'),
  ('carnes_057', 6, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_058', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_058', 1, 'yogur', 'Yogur griego', 150, 'g'),
  ('carnes_058', 2, 'limon', 'Limón', 1, 'ud'),
  ('carnes_058', 3, 'ajo', 'Ajo', 5, 'g'),
  ('carnes_058', 4, 'eneldo', 'Eneldo fresco', 3, 'g'),
  ('carnes_058', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_058', 6, 'sal', 'Sal', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_058', 7, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_059', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 350, 'g'),
  ('carnes_059', 1, 'tomate', 'Tomate', 300, 'g'),
  ('carnes_059', 2, 'cebolla', 'Cebolla dulce', 80, 'g'),
  ('carnes_059', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_059', 4, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('carnes_059', 5, 'oregano', 'Orégano seco', 2, 'g'),
  ('carnes_059', 6, 'sal', 'Sal', 6, 'g'),
  ('carnes_059', 7, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_060', 0, 'pavo', 'Filetes de pavo', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_060', 1, 'mostaza', 'Mostaza de Dijon', 20, 'g'),
  ('carnes_060', 2, 'miel', 'Miel', 20, 'g'),
  ('carnes_060', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_060', 4, 'sal', 'Sal', 5, 'g'),
  ('carnes_060', 5, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_061', 0, 'solomillo', 'Solomillo de cerdo', 400, 'g'),
  ('carnes_061', 1, 'perejil', 'Perejil fresco', 15, 'g'),
  ('carnes_061', 2, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_061', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_061', 4, 'vinagre', 'Vinagre de vino tinto', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_061', 5, 'oregano', 'Orégano seco', 2, 'g'),
  ('carnes_061', 6, 'guindilla', 'Guindilla en copos', 1, 'g'),
  ('carnes_061', 7, 'sal', 'Sal', 6, 'g'),
  ('carnes_061', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_062', 0, 'entrecot', 'Entrecot de ternera', 500, 'g'),
  ('carnes_062', 1, 'patata', 'Patata', 500, 'g'),
  ('carnes_062', 2, 'aceite-girasol', 'Aceite de girasol', 400, 'ml'),
  ('carnes_062', 3, 'queso-azul', 'Queso azul', 80, 'g'),
  ('carnes_062', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('carnes_062', 5, 'mantequilla', 'Mantequilla', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_062', 6, 'sal', 'Sal', 6, 'g'),
  ('carnes_062', 7, 'pimienta', 'Pimienta negra', 3, 'g'),
  ('carnes_063', 0, 'entrecot', 'Entrecot de ternera', 400, 'g'),
  ('carnes_063', 1, 'patata', 'Patata', 500, 'g'),
  ('carnes_063', 2, 'aceite-girasol', 'Aceite de girasol', 400, 'ml'),
  ('carnes_063', 3, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('carnes_063', 4, 'perejil', 'Perejil fresco', 15, 'g'),
  ('carnes_063', 5, 'ajo', 'Ajo', 5, 'g'),
  ('carnes_063', 6, 'sal', 'Sal', 6, 'g'),
  ('carnes_063', 7, 'pimienta', 'Pimienta negra', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_064', 0, 'carne-picada', 'Carne picada de ternera', 350, 'g'),
  ('carnes_064', 1, 'hamburguesa', 'Pan de hamburguesa brioche', 2, 'ud'),
  ('carnes_064', 2, 'queso', 'Queso cheddar curado en lonchas', 60, 'g'),
  ('carnes_064', 3, 'bacon', 'Bacon', 80, 'g'),
  ('carnes_064', 4, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_064', 5, 'lechuga', 'Lechuga', 40, 'g'),
  ('carnes_064', 6, 'tomate', 'Tomate', 80, 'g'),
  ('carnes_064', 7, 'ketchup', 'Ketchup', 20, 'g'),
  ('carnes_064', 8, 'mostaza', 'Mostaza', 15, 'g'),
  ('carnes_064', 9, 'sal', 'Sal', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_064', 10, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_064', 11, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_065', 0, 'contramuslos-de-pollo', 'Contramuslos de pollo deshuesados', 400, 'g'),
  ('carnes_065', 1, 'harina', 'Harina de trigo', 60, 'g'),
  ('carnes_065', 2, 'maicena', 'Maicena', 30, 'g'),
  ('carnes_065', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_065', 4, 'leche', 'Leche', 50, 'ml'),
  ('carnes_065', 5, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('carnes_065', 6, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_065', 7, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_065', 8, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('carnes_065', 9, 'miel', 'Miel', 40, 'g'),
  ('carnes_065', 10, 'salsa-soja', 'Salsa de soja', 15, 'ml'),
  ('carnes_065', 11, 'guindilla', 'Copos de guindilla', 3, 'g'),
  ('carnes_065', 12, 'lima', 'Zumo de lima', 10, 'ml'),
  ('carnes_066', 0, 'costilla', 'Costillar de cerdo', 600, 'g'),
  ('carnes_066', 1, 'pimenton', 'Pimentón ahumado', 5, 'g'),
  ('carnes_066', 2, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_066', 3, 'azucar-moreno', 'Azúcar moreno', 15, 'g'),
  ('carnes_066', 4, 'sal', 'Sal', 4, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_066', 5, 'pimienta', 'Pimienta negra molida', 2, 'g'),
  ('carnes_066', 6, 'tomate-frito', 'Tomate frito', 100, 'g'),
  ('carnes_066', 7, 'vinagre-de-manzana', 'Vinagre de manzana', 15, 'ml'),
  ('carnes_066', 8, 'miel', 'Miel', 20, 'g'),
  ('carnes_066', 9, 'mostaza', 'Mostaza', 10, 'g'),
  ('carnes_066', 10, 'salsa-soja', 'Salsa de soja', 10, 'ml'),
  ('carnes_067', 0, 'filete-de-ternera', 'Filete de ternera para milanesa', 350, 'g'),
  ('carnes_067', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('carnes_067', 2, 'pan-rallado', 'Pan rallado', 100, 'g'),
  ('carnes_067', 3, 'harina', 'Harina de trigo', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_067', 4, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_067', 5, 'perejil', 'Perejil picado', 5, 'g'),
  ('carnes_067', 6, 'patata', 'Patata', 500, 'g'),
  ('carnes_067', 7, 'aceite-oliva', 'Aceite de oliva', 400, 'ml'),
  ('carnes_067', 8, 'sal', 'Sal', 5, 'g'),
  ('carnes_068', 0, 'solomillo', 'Filete de solomillo de ternera', 350, 'g'),
  ('carnes_068', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_068', 2, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_068', 3, 'pimienta', 'Pimienta verde en grano', 20, 'g'),
  ('carnes_068', 4, 'brandy', 'Brandy', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_068', 5, 'nata', 'Nata para cocinar', 150, 'ml'),
  ('carnes_068', 6, 'caldo-de-carne', 'Caldo de carne', 50, 'ml'),
  ('carnes_068', 7, 'sal', 'Sal', 3, 'g'),
  ('carnes_069', 0, 'solomillo', 'Solomillo de ternera', 250, 'g'),
  ('carnes_069', 1, 'rucula', 'Rúcula', 40, 'g'),
  ('carnes_069', 2, 'parmesano', 'Queso parmesano', 30, 'g'),
  ('carnes_069', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 30, 'ml'),
  ('carnes_069', 4, 'limon', 'Zumo de limón', 15, 'ml'),
  ('carnes_069', 5, 'sal-escamas', 'Sal en escamas', 2, 'g'),
  ('carnes_069', 6, 'pimienta', 'Pimienta negra', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_070', 0, 'solomillo', 'Solomillo de ternera', 300, 'g'),
  ('carnes_070', 1, 'yema-de-huevo', 'Yema de huevo', 2, 'ud'),
  ('carnes_070', 2, 'mostaza', 'Mostaza de Dijon', 15, 'g'),
  ('carnes_070', 3, 'alcaparras', 'Alcaparras', 15, 'g'),
  ('carnes_070', 4, 'pepinillos', 'Pepinillos en vinagre', 20, 'g'),
  ('carnes_070', 5, 'cebolleta', 'Cebolleta', 20, 'g'),
  ('carnes_070', 6, 'salsa-worcestershire', 'Salsa Perrins', 10, 'ml'),
  ('carnes_070', 7, 'tabasco', 'Tabasco', 2, 'ml'),
  ('carnes_070', 8, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('carnes_070', 9, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_070', 10, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_071', 0, 'carne-picada', 'Carne picada de ternera', 300, 'g'),
  ('carnes_071', 1, 'pan-rallado', 'Pan rallado', 25, 'g'),
  ('carnes_071', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_071', 3, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_071', 4, 'perejil', 'Perejil picado', 3, 'g'),
  ('carnes_071', 5, 'harina', 'Harina de trigo', 20, 'g'),
  ('carnes_071', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_071', 7, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_071', 8, 'almendras', 'Almendra molida', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_071', 9, 'azafran', 'Hebras de azafrán', 1, 'g'),
  ('carnes_071', 10, 'caldo-de-carne', 'Caldo de carne', 250, 'ml'),
  ('carnes_071', 11, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('carnes_071', 12, 'sal', 'Sal', 3, 'g'),
  ('carnes_072', 0, 'pollo', 'Pollo entero', 900, 'g'),
  ('carnes_072', 1, 'limon', 'Limón', 2, 'ud'),
  ('carnes_072', 2, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_072', 3, 'romero', 'Romero fresco', 3, 'g'),
  ('carnes_072', 4, 'tomillo', 'Tomillo fresco', 3, 'g'),
  ('carnes_072', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_072', 6, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_072', 7, 'sal', 'Sal', 6, 'g'),
  ('carnes_072', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_073', 0, 'muslo-de-pollo', 'Muslos de pollo', 500, 'g'),
  ('carnes_073', 1, 'miel', 'Miel', 40, 'g'),
  ('carnes_073', 2, 'mostaza', 'Mostaza de Dijon', 30, 'g'),
  ('carnes_073', 3, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_073', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_073', 5, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('carnes_073', 6, 'sal', 'Sal', 4, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_073', 7, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_074', 0, 'secreto-iberico', 'Secreto ibérico', 400, 'g'),
  ('carnes_074', 1, 'patata', 'Patata', 500, 'g'),
  ('carnes_074', 2, 'aceite-oliva', 'Aceite de oliva', 400, 'ml'),
  ('carnes_074', 3, 'sal', 'Sal', 6, 'g'),
  ('carnes_074', 4, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('carnes_074', 5, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_074', 6, 'pimenton', 'Pimentón picante', 5, 'g'),
  ('carnes_074', 7, 'comino', 'Comino molido', 2, 'g'),
  ('carnes_074', 8, 'vinagre', 'Vinagre de vino', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_074', 9, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 40, 'ml'),
  ('carnes_075', 0, 'solomillo', 'Solomillo de ternera', 350, 'g'),
  ('carnes_075', 1, 'patata', 'Patata', 400, 'g'),
  ('carnes_075', 2, 'aceite-oliva', 'Aceite de oliva', 400, 'ml'),
  ('carnes_075', 3, 'pimienta', 'Pimienta negra en grano', 15, 'g'),
  ('carnes_075', 4, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_075', 5, 'brandy', 'Brandy', 30, 'ml'),
  ('carnes_075', 6, 'nata', 'Nata para cocinar', 150, 'ml'),
  ('carnes_075', 7, 'caldo-de-carne', 'Caldo de carne', 40, 'ml'),
  ('carnes_075', 8, 'sal', 'Sal', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_076', 0, 'redondo-de-ternera', 'Redondo de ternera', 450, 'g'),
  ('carnes_076', 1, 'jamon-york', 'Jamón cocido en lonchas', 50, 'g'),
  ('carnes_076', 2, 'huevos', 'Huevo cocido', 1, 'ud'),
  ('carnes_076', 3, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('carnes_076', 4, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_076', 5, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_076', 6, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('carnes_076', 7, 'caldo-de-carne', 'Caldo de carne', 150, 'ml'),
  ('carnes_076', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_076', 9, 'sal', 'Sal', 4, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_076', 10, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_077', 0, 'morcillo', 'Carne para mechar (morcillo de ternera)', 400, 'g'),
  ('carnes_077', 1, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_077', 2, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('carnes_077', 3, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_077', 4, 'vino-tinto', 'Vino tinto', 75, 'ml'),
  ('carnes_077', 5, 'caldo-de-carne', 'Caldo de carne', 200, 'ml'),
  ('carnes_077', 6, 'tomate-triturado', 'Tomate triturado', 50, 'g'),
  ('carnes_077', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_077', 8, 'patata', 'Patata', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_077', 9, 'leche', 'Leche', 50, 'ml'),
  ('carnes_077', 10, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('carnes_077', 11, 'sal', 'Sal', 5, 'g'),
  ('carnes_077', 12, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_078', 0, 'carrillera', 'Carrilleras de cerdo', 400, 'g'),
  ('carnes_078', 1, 'boniato', 'Boniato', 250, 'g'),
  ('carnes_078', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_078', 3, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('carnes_078', 4, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_078', 5, 'vino-tinto', 'Vino tinto', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_078', 6, 'caldo-de-carne', 'Caldo de carne', 150, 'ml'),
  ('carnes_078', 7, 'tomate-triturado', 'Tomate triturado', 50, 'g'),
  ('carnes_078', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_078', 9, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_078', 10, 'sal', 'Sal', 4, 'g'),
  ('carnes_078', 11, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_079', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_079', 1, 'maicena', 'Maicena', 40, 'g'),
  ('carnes_079', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_079', 3, 'aceite-girasol', 'Aceite de girasol', 300, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_079', 4, 'limon', 'Zumo de limón', 60, 'ml'),
  ('carnes_079', 5, 'azucar', 'Azúcar', 40, 'g'),
  ('carnes_079', 6, 'salsa-soja', 'Salsa de soja', 15, 'ml'),
  ('carnes_079', 7, 'caldo-de-pollo', 'Caldo de pollo', 80, 'ml'),
  ('carnes_079', 8, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('carnes_079', 9, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_079', 10, 'sesamo', 'Sésamo tostado', 5, 'g'),
  ('carnes_080', 0, 'alitas-de-pollo', 'Alitas de pollo', 600, 'g'),
  ('carnes_080', 1, 'miel', 'Miel', 40, 'g'),
  ('carnes_080', 2, 'ajo', 'Ajo', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_080', 3, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('carnes_080', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_080', 5, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('carnes_080', 6, 'sal', 'Sal', 4, 'g'),
  ('carnes_080', 7, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_081', 0, 'carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 350, 'g'),
  ('carnes_081', 1, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('carnes_081', 2, 'guisantes', 'Guisantes', 80, 'g'),
  ('carnes_081', 3, 'judia-verde', 'Judía verde', 80, 'g'),
  ('carnes_081', 4, 'patata', 'Patata', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_081', 5, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_081', 6, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_081', 7, 'tomate-triturado', 'Tomate triturado', 50, 'g'),
  ('carnes_081', 8, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('carnes_081', 9, 'caldo-de-carne', 'Caldo de carne', 200, 'ml'),
  ('carnes_081', 10, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_081', 11, 'sal', 'Sal', 4, 'g'),
  ('carnes_081', 12, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_082', 0, 'carne-de-cerdo-en-dado-aguja-o-secreto', 'Carne de cerdo en dados (aguja o secreto)', 400, 'g'),
  ('carnes_082', 1, 'pimenton', 'Pimentón dulce', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_082', 2, 'comino', 'Comino molido', 3, 'g'),
  ('carnes_082', 3, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_082', 4, 'curcuma', 'Cúrcuma', 2, 'g'),
  ('carnes_082', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_082', 6, 'limon', 'Zumo de limón', 15, 'ml'),
  ('carnes_082', 7, 'patata', 'Patata', 500, 'g'),
  ('carnes_082', 8, 'aceite-oliva', 'Aceite de oliva (para freír)', 400, 'ml'),
  ('carnes_082', 9, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_082', 10, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_082', 11, 'sal', 'Sal', 6, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_083', 0, 'cordero', 'Chuletillas de cordero', 500, 'g'),
  ('carnes_083', 1, 'romero', 'Romero fresco', 5, 'g'),
  ('carnes_083', 2, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_083', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_083', 4, 'sal', 'Sal', 5, 'g'),
  ('carnes_083', 5, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_084', 0, 'cordero', 'Paletilla de cordero', 700, 'g'),
  ('carnes_084', 1, 'patata', 'Patata', 350, 'g'),
  ('carnes_084', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_084', 3, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_084', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('carnes_084', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_084', 6, 'manteca-de-cerdo', 'Manteca de cerdo', 10, 'g'),
  ('carnes_084', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_084', 8, 'sal', 'Sal', 6, 'g'),
  ('carnes_084', 9, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_085', 0, 'cinta-de-lomo', 'Cinta de lomo de cerdo abierta en libro', 500, 'g'),
  ('carnes_085', 1, 'ciruelas-pasas', 'Ciruelas pasas sin hueso', 50, 'g'),
  ('carnes_085', 2, 'pinones', 'Piñones', 20, 'g'),
  ('carnes_085', 3, 'bacon', 'Bacon en lonchas', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_085', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('carnes_085', 5, 'caldo-de-carne', 'Caldo de carne', 75, 'ml'),
  ('carnes_085', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_085', 7, 'sal', 'Sal', 4, 'g'),
  ('carnes_085', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_086', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 400, 'g'),
  ('carnes_086', 1, 'jamon-york', 'Jamón cocido en lonchas', 80, 'g'),
  ('carnes_086', 2, 'queso', 'Queso para fundir en lonchas', 80, 'g'),
  ('carnes_086', 3, 'harina', 'Harina de trigo', 40, 'g'),
  ('carnes_086', 4, 'huevos', 'Huevo', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_086', 5, 'pan-rallado', 'Pan rallado', 60, 'g'),
  ('carnes_086', 6, 'aceite-oliva', 'Aceite de oliva', 300, 'ml'),
  ('carnes_086', 7, 'sal', 'Sal', 4, 'g'),
  ('carnes_086', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_087', 0, 'cinta-de-lomo', 'Filetes de lomo de cerdo', 350, 'g'),
  ('carnes_087', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('carnes_087', 2, 'pan-rallado', 'Pan rallado', 100, 'g'),
  ('carnes_087', 3, 'harina', 'Harina de trigo', 30, 'g'),
  ('carnes_087', 4, 'patata', 'Patata', 500, 'g'),
  ('carnes_087', 5, 'aceite-oliva', 'Aceite de oliva', 400, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_087', 6, 'sal', 'Sal', 5, 'g'),
  ('carnes_087', 7, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_088', 0, 'carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 400, 'g'),
  ('carnes_088', 1, 'champinon', 'Champiñones', 250, 'g'),
  ('carnes_088', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('carnes_088', 3, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_088', 4, 'harina', 'Harina de trigo', 15, 'g'),
  ('carnes_088', 5, 'vino-blanco', 'Vino blanco', 150, 'ml'),
  ('carnes_088', 6, 'caldo-de-carne', 'Caldo de carne', 200, 'ml'),
  ('carnes_088', 7, 'nata', 'Nata para cocinar', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_088', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_088', 9, 'sal', 'Sal', 5, 'g'),
  ('carnes_088', 10, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_089', 0, 'solomillo', 'Solomillo de ternera', 350, 'g'),
  ('carnes_089', 1, 'queso-cabra', 'Queso de cabra en rulo', 100, 'g'),
  ('carnes_089', 2, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('carnes_089', 3, 'miel', 'Miel', 30, 'g'),
  ('carnes_089', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_089', 5, 'sal', 'Sal', 4, 'g'),
  ('carnes_089', 6, 'pimienta', 'Pimienta negra', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_090', 0, 'escalopines-de-ternera', 'Escalopines de ternera', 350, 'g'),
  ('carnes_090', 1, 'harina', 'Harina de trigo', 20, 'g'),
  ('carnes_090', 2, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_090', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_090', 4, 'champinon', 'Champiñones', 150, 'g'),
  ('carnes_090', 5, 'cava', 'Cava', 150, 'ml'),
  ('carnes_090', 6, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('carnes_090', 7, 'sal', 'Sal', 4, 'g'),
  ('carnes_090', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_091', 0, 'costilla', 'Costillar de cerdo', 600, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_091', 1, 'aceite-oliva', 'Aceite de oliva suave', 300, 'ml'),
  ('carnes_091', 2, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_091', 3, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_091', 4, 'tomillo', 'Tomillo', 2, 'g'),
  ('carnes_091', 5, 'miel', 'Miel', 20, 'g'),
  ('carnes_091', 6, 'mostaza', 'Mostaza de Dijon', 15, 'g'),
  ('carnes_091', 7, 'sal', 'Sal', 4, 'g'),
  ('carnes_091', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_092', 0, 'solomillo', 'Solomillo de ternera en dados', 350, 'g'),
  ('carnes_092', 1, 'pimiento-rojo', 'Pimiento rojo', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_092', 2, 'pimiento-verde', 'Pimiento verde', 100, 'g'),
  ('carnes_092', 3, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_092', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_092', 5, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_092', 6, 'oregano', 'Orégano', 3, 'g'),
  ('carnes_092', 7, 'sal', 'Sal', 5, 'g'),
  ('carnes_092', 8, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('carnes_093', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_093', 1, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_093', 2, 'maicena', 'Maicena', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_093', 3, 'harina', 'Harina', 20, 'g'),
  ('carnes_093', 4, 'aceite-girasol', 'Aceite de girasol', 200, 'ml'),
  ('carnes_093', 5, 'naranja', 'Zumo de naranja', 150, 'ml'),
  ('carnes_093', 6, 'naranja', 'Ralladura de naranja', 5, 'g'),
  ('carnes_093', 7, 'azucar-moreno', 'Azúcar moreno', 30, 'g'),
  ('carnes_093', 8, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('carnes_093', 9, 'vinagre', 'Vinagre de arroz', 15, 'ml'),
  ('carnes_093', 10, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_093', 11, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('carnes_093', 12, 'sesamo', 'Sésamo tostado', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_093', 13, 'cebolleta', 'Cebolleta', 10, 'g'),
  ('carnes_094', 0, 'solomillo', 'Solomillo de ternera', 350, 'g'),
  ('carnes_094', 1, 'champinon', 'Champiñones', 200, 'g'),
  ('carnes_094', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_094', 3, 'nata', 'Nata para cocinar', 150, 'ml'),
  ('carnes_094', 4, 'caldo-de-carne', 'Caldo de carne', 100, 'ml'),
  ('carnes_094', 5, 'mostaza', 'Mostaza de Dijon', 15, 'g'),
  ('carnes_094', 6, 'harina', 'Harina', 10, 'g'),
  ('carnes_094', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_094', 8, 'mantequilla', 'Mantequilla', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_094', 9, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('carnes_094', 10, 'perejil', 'Perejil fresco', 5, 'g'),
  ('carnes_095', 0, 'carrillada', 'Carrillada de cerdo', 500, 'g'),
  ('carnes_095', 1, 'cebolla', 'Cebolla', 150, 'g'),
  ('carnes_095', 2, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('carnes_095', 3, 'puerro', 'Puerro', 80, 'g'),
  ('carnes_095', 4, 'vino-tinto', 'Vino tinto', 200, 'ml'),
  ('carnes_095', 5, 'caldo-de-carne', 'Caldo de carne', 300, 'ml'),
  ('carnes_095', 6, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_095', 7, 'harina', 'Harina', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_095', 8, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_095', 9, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_095', 10, 'patata', 'Patata', 400, 'g'),
  ('carnes_095', 11, 'leche', 'Leche', 100, 'ml'),
  ('carnes_095', 12, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_096', 0, 'carne-picada', 'Carne picada de ternera', 600, 'g'),
  ('carnes_096', 1, 'cebolla', 'Cebolla', 150, 'g'),
  ('carnes_096', 2, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('carnes_096', 3, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_096', 4, 'tomate-triturado', 'Tomate triturado', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_096', 5, 'caldo-de-carne', 'Caldo de carne', 100, 'ml'),
  ('carnes_096', 6, 'salsa-worcestershire', 'Salsa Worcestershire', 10, 'ml'),
  ('carnes_096', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_096', 8, 'patata', 'Patata', 800, 'g'),
  ('carnes_096', 9, 'leche', 'Leche', 150, 'ml'),
  ('carnes_096', 10, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('carnes_096', 11, 'queso', 'Queso rallado', 80, 'g'),
  ('carnes_096', 12, 'tomillo', 'Tomillo', 2, 'g'),
  ('carnes_097', 0, 'cinta-de-lomo', 'Lomo de cerdo (filetes)', 350, 'g'),
  ('carnes_097', 1, 'miel', 'Miel', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_097', 2, 'mostaza', 'Mostaza de Dijon', 30, 'g'),
  ('carnes_097', 3, 'mostaza', 'Mostaza a la antigua', 15, 'g'),
  ('carnes_097', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_097', 5, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_097', 6, 'vinagre-de-manzana', 'Vinagre de manzana', 15, 'ml'),
  ('carnes_098', 0, 'jarrete-de-ternera', 'Jarrete de ternera', 700, 'g'),
  ('carnes_098', 1, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('carnes_098', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('carnes_098', 3, 'puerro', 'Puerro', 100, 'g'),
  ('carnes_098', 4, 'patata', 'Patata baby', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_098', 5, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_098', 6, 'vino-blanco', 'Vino blanco', 150, 'ml'),
  ('carnes_098', 7, 'caldo-de-carne', 'Caldo de carne', 300, 'ml'),
  ('carnes_098', 8, 'tomate-triturado', 'Tomate triturado', 100, 'g'),
  ('carnes_098', 9, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_098', 10, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_098', 11, 'romero', 'Romero', 3, 'g'),
  ('carnes_098', 12, 'harina', 'Harina', 15, 'g'),
  ('carnes_099', 0, 'solomillo', 'Solomillo de ternera', 350, 'g'),
  ('carnes_099', 1, 'mantequilla', 'Mantequilla', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_099', 2, 'perejil', 'Perejil fresco', 10, 'g'),
  ('carnes_099', 3, 'cebollino', 'Cebollino', 5, 'g'),
  ('carnes_099', 4, 'ajo', 'Ajo', 6, 'g'),
  ('carnes_099', 5, 'chalota', 'Chalota', 20, 'g'),
  ('carnes_099', 6, 'mostaza', 'Mostaza de Dijon', 10, 'g'),
  ('carnes_099', 7, 'brandy', 'Brandy', 15, 'ml'),
  ('carnes_099', 8, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('carnes_099', 9, 'curry', 'Curry en polvo', 1, 'g'),
  ('carnes_099', 10, 'limon', 'Zumo de limón', 5, 'ml'),
  ('carnes_099', 11, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_100', 0, 'solomillo', 'Solomillo de ternera (para tartar)', 300, 'g'),
  ('carnes_100', 1, 'yema-de-huevo', 'Yema de huevo', 2, 'ud'),
  ('carnes_100', 2, 'alcaparras', 'Alcaparras', 20, 'g'),
  ('carnes_100', 3, 'pepinillos', 'Pepinillos encurtidos', 30, 'g'),
  ('carnes_100', 4, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('carnes_100', 5, 'mostaza', 'Mostaza de Dijon', 15, 'g'),
  ('carnes_100', 6, 'salsa-worcestershire', 'Salsa Worcestershire', 10, 'ml'),
  ('carnes_100', 7, 'tabasco', 'Tabasco', 3, 'ml'),
  ('carnes_100', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_100', 9, 'perejil', 'Perejil fresco', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_100', 10, 'patata', 'Patata', 400, 'g'),
  ('carnes_100', 11, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('carnes_101', 0, 'solomillo', 'Solomillo de ternera', 350, 'g'),
  ('carnes_101', 1, 'patata', 'Patata', 400, 'g'),
  ('carnes_101', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('carnes_101', 3, 'boletus', 'Boletus', 100, 'g'),
  ('carnes_101', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('carnes_101', 5, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('carnes_101', 6, 'caldo-de-carne', 'Caldo de carne', 100, 'ml'),
  ('carnes_101', 7, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_101', 8, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('carnes_101', 9, 'perejil', 'Perejil fresco', 5, 'g'),
  ('carnes_102', 0, 'entrecot', 'Entrecot de ternera', 400, 'g'),
  ('carnes_102', 1, 'patata', 'Patata', 400, 'g'),
  ('carnes_102', 2, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('carnes_102', 3, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('carnes_102', 4, 'perejil', 'Perejil fresco', 8, 'g'),
  ('carnes_102', 5, 'cebollino', 'Cebollino', 5, 'g'),
  ('carnes_102', 6, 'ajo', 'Ajo', 6, 'g'),
  ('carnes_102', 7, 'chalota', 'Chalota', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_102', 8, 'mostaza', 'Mostaza de Dijon', 8, 'g'),
  ('carnes_102', 9, 'limon', 'Zumo de limón', 5, 'ml'),
  ('carnes_102', 10, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('carnes_102', 11, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_103', 0, 'costilla', 'Costillar de cerdo', 600, 'g'),
  ('carnes_103', 1, 'boniato', 'Boniato', 400, 'g'),
  ('carnes_103', 2, 'leche', 'Leche', 80, 'ml'),
  ('carnes_103', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_103', 4, 'ketchup', 'Ketchup', 80, 'g'),
  ('carnes_103', 5, 'miel', 'Miel', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_103', 6, 'vinagre-de-manzana', 'Vinagre de manzana', 20, 'ml'),
  ('carnes_103', 7, 'mostaza', 'Mostaza', 10, 'g'),
  ('carnes_103', 8, 'pimenton', 'Pimentón ahumado', 5, 'g'),
  ('carnes_103', 9, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_104', 0, 'secreto-iberico', 'Secreto ibérico', 350, 'g'),
  ('carnes_104', 1, 'patata', 'Patata', 400, 'g'),
  ('carnes_104', 2, 'tomate', 'Tomate maduro', 150, 'g'),
  ('carnes_104', 3, 'pimiento-choricero', 'Pimiento choricero', 15, 'g'),
  ('carnes_104', 4, 'almendras', 'Almendra tostada', 30, 'g'),
  ('carnes_104', 5, 'avellanas', 'Avellana tostada', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_104', 6, 'pan', 'Pan', 20, 'g'),
  ('carnes_104', 7, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_104', 8, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('carnes_104', 9, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('carnes_105', 0, 'pato', 'Magret de pato', 350, 'g'),
  ('carnes_105', 1, 'boniato', 'Boniato', 350, 'g'),
  ('carnes_105', 2, 'leche', 'Leche', 80, 'ml'),
  ('carnes_105', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_105', 4, 'frutos-rojos', 'Frutos rojos', 150, 'g'),
  ('carnes_105', 5, 'vino-tinto', 'Vino tinto', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_105', 6, 'azucar-moreno', 'Azúcar moreno', 30, 'g'),
  ('carnes_105', 7, 'vinagre-balsamico', 'Vinagre de Módena', 10, 'ml'),
  ('carnes_106', 0, 'chuleton-de-ternera', 'Chuletón de ternera', 700, 'g'),
  ('carnes_106', 1, 'patata', 'Patata', 400, 'g'),
  ('carnes_106', 2, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('carnes_106', 3, 'ajo', 'Cabeza de ajos', 1, 'ud'),
  ('carnes_106', 4, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_106', 5, 'aceite-oliva', 'Aceite de oliva suave', 150, 'ml'),
  ('carnes_106', 6, 'limon', 'Zumo de limón', 5, 'ml'),
  ('carnes_107', 0, 'costilla', 'Costillar de cerdo', 600, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_107', 1, 'patata', 'Patata', 400, 'g'),
  ('carnes_107', 2, 'leche', 'Leche', 100, 'ml'),
  ('carnes_107', 3, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('carnes_107', 4, 'ketchup', 'Ketchup', 80, 'g'),
  ('carnes_107', 5, 'miel', 'Miel', 30, 'g'),
  ('carnes_107', 6, 'vinagre-de-manzana', 'Vinagre de manzana', 15, 'ml'),
  ('carnes_107', 7, 'pimenton', 'Pimentón ahumado', 6, 'g'),
  ('carnes_107', 8, 'mostaza', 'Mostaza', 10, 'g'),
  ('carnes_107', 9, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('carnes_108', 0, 'contramuslos-de-pollo', 'Muslos y contramuslos de pollo', 500, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_108', 1, 'patata', 'Patata', 400, 'g'),
  ('carnes_108', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('carnes_108', 3, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_108', 4, 'caldo-de-pollo', 'Caldo de pollo', 150, 'ml'),
  ('carnes_108', 5, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('carnes_108', 6, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_108', 7, 'harina', 'Harina', 10, 'g'),
  ('carnes_108', 8, 'tomillo', 'Tomillo', 3, 'g'),
  ('carnes_109', 0, 'presa-iberica', 'Presa ibérica', 350, 'g'),
  ('carnes_109', 1, 'patata', 'Patata', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_109', 2, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('carnes_109', 3, 'pimienta', 'Pimienta verde en grano', 20, 'g'),
  ('carnes_109', 4, 'nata', 'Nata para cocinar', 150, 'ml'),
  ('carnes_109', 5, 'caldo-de-carne', 'Caldo de carne', 80, 'ml'),
  ('carnes_109', 6, 'brandy', 'Brandy', 20, 'ml'),
  ('carnes_109', 7, 'chalota', 'Chalota', 20, 'g'),
  ('carnes_109', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_110', 0, 'solomillo', 'Solomillo de ternera picado', 350, 'g'),
  ('carnes_110', 1, 'hamburguesa', 'Pan de hamburguesa', 2, 'ud'),
  ('carnes_110', 2, 'queso-azul', 'Queso azul', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_110', 3, 'nata', 'Nata para cocinar', 80, 'ml'),
  ('carnes_110', 4, 'lechuga', 'Lechuga', 40, 'g'),
  ('carnes_110', 5, 'tomate', 'Tomate', 80, 'g'),
  ('carnes_110', 6, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('carnes_110', 7, 'patata', 'Patata', 400, 'g'),
  ('carnes_110', 8, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('carnes_110', 9, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_111', 0, 'costilla', 'Costillas de cordero (chuletillas)', 400, 'g'),
  ('carnes_111', 1, 'boniato', 'Boniato', 350, 'g'),
  ('carnes_111', 2, 'leche', 'Leche', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_111', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_111', 4, 'menta', 'Menta fresca', 15, 'g'),
  ('carnes_111', 5, 'azucar', 'Azúcar', 15, 'g'),
  ('carnes_111', 6, 'vinagre', 'Vinagre de vino blanco', 20, 'ml'),
  ('carnes_111', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_111', 8, 'ajo', 'Ajo', 6, 'g'),
  ('carnes_112', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_112', 1, 'tomate-seco', 'Tomate seco en aceite', 40, 'g'),
  ('carnes_112', 2, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_112', 3, 'nata', 'Nata para cocinar', 200, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_112', 4, 'caldo-de-pollo', 'Caldo de pollo', 100, 'ml'),
  ('carnes_112', 5, 'parmesano', 'Parmesano rallado', 40, 'g'),
  ('carnes_112', 6, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('carnes_112', 7, 'albahaca', 'Albahaca fresca', 5, 'g'),
  ('carnes_112', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_113', 0, 'alitas-de-pollo', 'Alitas de pollo', 600, 'g'),
  ('carnes_113', 1, 'gochujang', 'Gochujang', 40, 'g'),
  ('carnes_113', 2, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('carnes_113', 3, 'miel', 'Miel', 30, 'g'),
  ('carnes_113', 4, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_113', 5, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_113', 6, 'jengibre', 'Jengibre fresco', 8, 'g'),
  ('carnes_113', 7, 'sesamo', 'Sésamo tostado', 5, 'g'),
  ('carnes_113', 8, 'cebolleta', 'Cebolleta', 10, 'g'),
  ('carnes_113', 9, 'aceite-girasol', 'Aceite de girasol', 15, 'ml'),
  ('carnes_114', 0, 'costilla', 'Costillas de ternera (corte fino estilo galbi)', 600, 'g'),
  ('carnes_114', 1, 'salsa-soja', 'Salsa de soja', 80, 'ml'),
  ('carnes_114', 2, 'pera', 'Pera', 100, 'g'),
  ('carnes_114', 3, 'azucar-moreno', 'Azúcar moreno', 40, 'g'),
  ('carnes_114', 4, 'ajo', 'Ajo', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_114', 5, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('carnes_114', 6, 'aceite-de-sesamo', 'Aceite de sésamo', 15, 'ml'),
  ('carnes_114', 7, 'sesamo', 'Sésamo tostado', 8, 'g'),
  ('carnes_114', 8, 'cebolleta', 'Cebolleta', 15, 'g'),
  ('carnes_115', 0, 'carne-picada', 'Carne picada de ternera', 300, 'g'),
  ('carnes_115', 1, 'hamburguesa', 'Pan de hamburguesa', 2, 'ud'),
  ('carnes_115', 2, 'queso', 'Queso cheddar (lonchas)', 4, 'ud'),
  ('carnes_115', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('carnes_115', 4, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('carnes_115', 5, 'pepinillos', 'Pepinillos en rodajas', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_115', 6, 'ketchup', 'Ketchup', 20, 'g'),
  ('carnes_115', 7, 'mostaza', 'Mostaza americana', 15, 'g'),
  ('carnes_115', 8, 'mayonesa', 'Mayonesa', 20, 'g'),
  ('carnes_116', 0, 'callo-de-ternera-limpio', 'Callos de ternera limpios', 1000, 'g'),
  ('carnes_116', 1, 'pata-de-ternera', 'Pata de ternera', 300, 'g'),
  ('carnes_116', 2, 'chorizo', 'Chorizo', 150, 'g'),
  ('carnes_116', 3, 'morcilla', 'Morcilla', 150, 'g'),
  ('carnes_116', 4, 'jamon', 'Jamón', 80, 'g'),
  ('carnes_116', 5, 'cebolla', 'Cebolla', 200, 'g'),
  ('carnes_116', 6, 'tomate-triturado', 'Tomate triturado', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_116', 7, 'pimenton', 'Pimentón dulce', 10, 'g'),
  ('carnes_116', 8, 'pimenton', 'Pimentón picante', 3, 'g'),
  ('carnes_116', 9, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_116', 10, 'laurel', 'Laurel', 2, 'ud'),
  ('carnes_116', 11, 'guindilla', 'Guindilla', 1, 'ud'),
  ('carnes_116', 12, 'vino-blanco', 'Vino blanco', 100, 'ml'),
  ('carnes_116', 13, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_117', 0, 'higado-de-ternera', 'Hígado de ternera', 350, 'g'),
  ('carnes_117', 1, 'cebolla', 'Cebolla', 300, 'g'),
  ('carnes_117', 2, 'harina', 'Harina', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_117', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('carnes_117', 4, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('carnes_117', 5, 'ajo', 'Ajo', 6, 'g'),
  ('carnes_117', 6, 'perejil', 'Perejil fresco', 5, 'g'),
  ('carnes_118', 0, 'manitas-de-cerdo', 'Manitas de cerdo partidas por la mitad', 1200, 'g'),
  ('carnes_118', 1, 'cebolla', 'Cebolla', 200, 'g'),
  ('carnes_118', 2, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('carnes_118', 3, 'puerro', 'Puerro', 100, 'g'),
  ('carnes_118', 4, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_118', 5, 'tomate-triturado', 'Tomate triturado', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_118', 6, 'vino-blanco', 'Vino blanco', 100, 'ml'),
  ('carnes_118', 7, 'pimenton', 'Pimentón dulce', 8, 'g'),
  ('carnes_118', 8, 'laurel', 'Laurel', 2, 'ud'),
  ('carnes_118', 9, 'harina', 'Harina', 15, 'g'),
  ('carnes_118', 10, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_118', 11, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('carnes_119', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 300, 'g'),
  ('carnes_119', 1, 'pan-rallado', 'Pan rallado', 60, 'g'),
  ('carnes_119', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_119', 3, 'harina', 'Harina', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_119', 4, 'aceite-girasol', 'Aceite de girasol', 200, 'ml'),
  ('carnes_119', 5, 'tortilla-de-trigo', 'Tortillas de trigo grandes', 2, 'ud'),
  ('carnes_119', 6, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_119', 7, 'lechuga', 'Lechuga', 60, 'g'),
  ('carnes_119', 8, 'tomate', 'Tomate', 60, 'g'),
  ('carnes_119', 9, 'yogur', 'Yogur natural', 40, 'g'),
  ('carnes_119', 10, 'parmesano', 'Parmesano rallado', 15, 'g'),
  ('carnes_119', 11, 'anchoa-en-aceite', 'Anchoas en aceite', 8, 'g'),
  ('carnes_119', 12, 'ajo', 'Ajo', 5, 'g'),
  ('carnes_119', 13, 'limon', 'Zumo de limón', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_119', 14, 'mostaza', 'Mostaza de Dijon', 5, 'g'),
  ('carnes_120', 0, 'tortilla-de-trigo', 'Tortillas de trigo grandes', 4, 'ud'),
  ('carnes_120', 1, 'queso', 'Queso rallado', 160, 'g'),
  ('carnes_120', 2, 'jamon-york', 'Jamón cocido', 100, 'g'),
  ('carnes_120', 3, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_120', 4, 'tomate', 'Tomate', 60, 'g'),
  ('carnes_120', 5, 'cebolla-morada', 'Cebolla morada', 20, 'g'),
  ('carnes_120', 6, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('carnes_120', 7, 'lima', 'Zumo de lima', 10, 'ml'),
  ('carnes_120', 8, 'aceite-oliva', 'Aceite de oliva', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_121', 0, 'quinoa', 'Quinoa', 120, 'g'),
  ('carnes_121', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 300, 'g'),
  ('carnes_121', 2, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('carnes_121', 3, 'pepino', 'Pepino', 100, 'g'),
  ('carnes_121', 4, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('carnes_121', 5, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_121', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_121', 7, 'limon', 'Limón', 1, 'ud'),
  ('carnes_121', 8, 'sal', 'Sal', 3, 'g'),
  ('carnes_122', 0, 'pan-molde', 'Pan de molde', 6, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_122', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 200, 'g'),
  ('carnes_122', 2, 'bacon', 'Bacon en lonchas', 70, 'g'),
  ('carnes_122', 3, 'huevos', 'Huevo', 2, 'ud'),
  ('carnes_122', 4, 'lechuga', 'Lechuga', 40, 'g'),
  ('carnes_122', 5, 'tomate', 'Tomate', 80, 'g'),
  ('carnes_122', 6, 'mayonesa', 'Mayonesa', 40, 'g'),
  ('carnes_122', 7, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('carnes_123', 0, 'lechuga', 'Lechuga romana', 200, 'g'),
  ('carnes_123', 1, 'pollo', 'Pollo asado de bolsa', 200, 'g'),
  ('carnes_123', 2, 'pan-molde', 'Pan de molde', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_123', 3, 'parmesano', 'Queso parmesano', 30, 'g'),
  ('carnes_123', 4, 'salsa-cesar', 'Salsa César', 60, 'g'),
  ('carnes_123', 5, 'anchoa-en-aceite', 'Anchoas en aceite', 10, 'g'),
  ('carnes_123', 6, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('carnes_124', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 300, 'g'),
  ('carnes_124', 1, 'tortilla-de-trigo', 'Tortillas de trigo', 6, 'ud'),
  ('carnes_124', 2, 'tomate', 'Tomate', 150, 'g'),
  ('carnes_124', 3, 'cebolla-morada', 'Cebolla morada', 50, 'g'),
  ('carnes_124', 4, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('carnes_124', 5, 'lima', 'Lima', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_124', 6, 'comino', 'Comino molido', 3, 'g'),
  ('carnes_124', 7, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('carnes_124', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_124', 9, 'sal', 'Sal', 3, 'g'),
  ('carnes_125', 0, 'pan', 'Pan rústico', 4, 'ud'),
  ('carnes_125', 1, 'sobrasada', 'Sobrasada', 150, 'g'),
  ('carnes_125', 2, 'queso-tierno', 'Queso semicurado en lonchas', 80, 'g'),
  ('carnes_125', 3, 'miel', 'Miel', 30, 'g'),
  ('carnes_126', 0, 'pan', 'Pan de centeno', 4, 'ud'),
  ('carnes_126', 1, 'pastrami-de-ternera-en-loncha', 'Pastrami de ternera en lonchas', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_126', 2, 'mostaza', 'Mostaza a la antigua', 30, 'g'),
  ('carnes_126', 3, 'pepinillos', 'Pepinillos encurtidos', 40, 'g'),
  ('carnes_126', 4, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('carnes_127', 0, 'hojas-verdes', 'Mezcla de hojas verdes', 150, 'g'),
  ('carnes_127', 1, 'pollo', 'Pollo asado de bolsa', 200, 'g'),
  ('carnes_127', 2, 'nueces', 'Nueces', 40, 'g'),
  ('carnes_127', 3, 'parmesano', 'Queso parmesano en virutas', 50, 'g'),
  ('carnes_127', 4, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('carnes_127', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_127', 6, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_127', 7, 'sal', 'Sal', 2, 'g'),
  ('carnes_128', 0, 'pan', 'Pan rústico', 4, 'ud'),
  ('carnes_128', 1, 'pate', 'Paté de cerdo', 120, 'g'),
  ('carnes_128', 2, 'higo', 'Higos frescos', 3, 'ud'),
  ('carnes_128', 3, 'rucula', 'Rúcula', 30, 'g'),
  ('carnes_128', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('carnes_129', 0, 'pan-molde', 'Pan de molde', 4, 'ud'),
  ('carnes_129', 1, 'jamon-york', 'Jamón cocido en lonchas', 120, 'g'),
  ('carnes_129', 2, 'queso', 'Queso emmental en lonchas', 80, 'g'),
  ('carnes_129', 3, 'mantequilla', 'Mantequilla', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_129', 4, 'harina', 'Harina', 15, 'g'),
  ('carnes_129', 5, 'leche', 'Leche', 150, 'ml'),
  ('carnes_129', 6, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('carnes_130', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('carnes_130', 1, 'pechuga-de-pavo', 'Pechuga de pavo en lonchas', 80, 'g'),
  ('carnes_130', 2, 'queso', 'Queso rallado', 40, 'g'),
  ('carnes_130', 3, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_130', 4, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('carnes_130', 5, 'queso-cabra', 'Queso de cabra', 60, 'g'),
  ('carnes_130', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_130', 7, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('carnes_130', 8, 'sal', 'Sal', 2, 'g'),
  ('carnes_131', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_131', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_131', 2, 'maiz', 'Maíz dulce cocido', 100, 'g'),
  ('carnes_131', 3, 'lima', 'Lima', 1, 'ud'),
  ('carnes_131', 4, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('carnes_131', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_131', 6, 'sal', 'Sal', 3, 'g'),
  ('carnes_131', 7, 'pimienta', 'Pimienta negra', 1, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_132', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 350, 'g'),
  ('carnes_132', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_132', 2, 'tomate-cherry', 'Tomate cherry', 120, 'g'),
  ('carnes_132', 3, 'queso-feta', 'Queso feta', 60, 'g'),
  ('carnes_132', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_132', 5, 'oregano', 'Orégano seco', 2, 'g'),
  ('carnes_132', 6, 'sal', 'Sal', 3, 'g'),
  ('carnes_133', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 350, 'g'),
  ('carnes_133', 1, 'especia-cajun', 'Especias cajún', 8, 'g'),
  ('carnes_133', 2, 'aguacate', 'Aguacate', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_133', 3, 'maiz', 'Maíz dulce cocido', 100, 'g'),
  ('carnes_133', 4, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('carnes_133', 5, 'lima', 'Lima', 1, 'ud'),
  ('carnes_133', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_133', 7, 'sal', 'Sal', 2, 'g'),
  ('carnes_134', 0, 'pavo', 'Filete de pavo', 350, 'g'),
  ('carnes_134', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_134', 2, 'tomate', 'Tomate', 150, 'g'),
  ('carnes_134', 3, 'mostaza', 'Mostaza a la antigua', 20, 'g'),
  ('carnes_134', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_134', 5, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('carnes_134', 6, 'sal', 'Sal', 2, 'g'),
  ('carnes_135', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 300, 'g'),
  ('carnes_135', 1, 'arroz', 'Arroz blanco', 150, 'g'),
  ('carnes_135', 2, 'judias-pintas', 'Frijoles negros cocidos', 200, 'g'),
  ('carnes_135', 3, 'maiz', 'Maíz dulce cocido', 80, 'g'),
  ('carnes_135', 4, 'tomate', 'Tomate', 100, 'g'),
  ('carnes_135', 5, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('carnes_135', 6, 'comino', 'Comino molido', 3, 'g'),
  ('carnes_135', 7, 'pimenton', 'Pimentón dulce', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_135', 8, 'lima', 'Lima', 1, 'ud'),
  ('carnes_135', 9, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_135', 10, 'sal', 'Sal', 3, 'g'),
  ('carnes_136', 0, 'vol-au-vent', 'Vol-au-vent de hojaldre', 4, 'ud'),
  ('carnes_136', 1, 'foie', 'Foie fresco o mi-cuit', 100, 'g'),
  ('carnes_136', 2, 'setas', 'Setas variadas', 250, 'g'),
  ('carnes_136', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('carnes_136', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('carnes_136', 5, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_136', 6, 'vino-blanco', 'Vino oloroso', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_136', 7, 'sal', 'Sal', 2, 'g'),
  ('carnes_136', 8, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('carnes_137', 0, 'pollo', 'Pollo asado desmenuzado', 300, 'g'),
  ('carnes_137', 1, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('carnes_137', 2, 'harina', 'Harina', 70, 'g'),
  ('carnes_137', 3, 'leche', 'Leche', 700, 'ml'),
  ('carnes_137', 4, 'cebolla', 'Cebolla', 50, 'g'),
  ('carnes_137', 5, 'huevos', 'Huevo', 2, 'ud'),
  ('carnes_137', 6, 'pan-rallado', 'Pan rallado', 150, 'g'),
  ('carnes_137', 7, 'aceite-oliva', 'Aceite de oliva', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_137', 8, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('carnes_137', 9, 'sal', 'Sal', 4, 'g'),
  ('carnes_138', 0, 'carne-de-cocido', 'Carne de cocido desmenuzada', 300, 'g'),
  ('carnes_138', 1, 'caldo-de-carne', 'Caldo de cocido', 500, 'ml'),
  ('carnes_138', 2, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('carnes_138', 3, 'harina', 'Harina', 70, 'g'),
  ('carnes_138', 4, 'leche', 'Leche', 250, 'ml'),
  ('carnes_138', 5, 'huevos', 'Huevo', 2, 'ud'),
  ('carnes_138', 6, 'pan-rallado', 'Pan rallado', 150, 'g'),
  ('carnes_138', 7, 'aceite-oliva', 'Aceite de oliva', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_138', 8, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('carnes_138', 9, 'sal', 'Sal', 3, 'g'),
  ('carnes_139', 0, 'obleas', 'Obleas de empanadilla', 16, 'ud'),
  ('carnes_139', 1, 'morcilla', 'Morcilla', 250, 'g'),
  ('carnes_139', 2, 'pinones', 'Piñones', 40, 'g'),
  ('carnes_139', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('carnes_139', 4, 'aceite-oliva', 'Aceite de oliva', 500, 'ml'),
  ('carnes_140', 0, 'masa-quebrada', 'Masa quebrada', 1, 'ud'),
  ('carnes_140', 1, 'puerro', 'Puerro', 400, 'g'),
  ('carnes_140', 2, 'bacon', 'Bacon en dados', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_140', 3, 'huevos', 'Huevo', 4, 'ud'),
  ('carnes_140', 4, 'nata', 'Nata para cocinar', 200, 'ml'),
  ('carnes_140', 5, 'queso', 'Queso rallado', 80, 'g'),
  ('carnes_140', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_140', 7, 'sal', 'Sal', 3, 'g'),
  ('carnes_140', 8, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('carnes_140', 9, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('carnes_141', 0, 'patata', 'Patata', 800, 'g'),
  ('carnes_141', 1, 'carne-picada', 'Carne picada de ternera', 400, 'g'),
  ('carnes_141', 2, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_141', 3, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('carnes_141', 4, 'guisantes', 'Guisantes', 80, 'g'),
  ('carnes_141', 5, 'caldo-de-carne', 'Caldo de carne', 150, 'ml'),
  ('carnes_141', 6, 'leche', 'Leche', 80, 'ml'),
  ('carnes_141', 7, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('carnes_141', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_141', 9, 'tomate-concentrado', 'Tomate concentrado', 20, 'g'),
  ('carnes_141', 10, 'sal', 'Sal', 4, 'g'),
  ('carnes_141', 11, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('carnes_142', 0, 'masa-de-pizza', 'Masa de pizza', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_142', 1, 'jamon-york', 'Jamón cocido en lonchas', 100, 'g'),
  ('carnes_142', 2, 'mozzarella', 'Queso mozzarella', 150, 'g'),
  ('carnes_142', 3, 'tomate-frito', 'Tomate frito', 60, 'g'),
  ('carnes_142', 4, 'oregano', 'Orégano seco', 2, 'g'),
  ('carnes_142', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_142', 6, 'harina', 'Harina', 20, 'g'),
  ('carnes_143', 0, 'harina', 'Harina', 120, 'g'),
  ('carnes_143', 1, 'huevos', 'Huevo', 3, 'ud'),
  ('carnes_143', 2, 'leche', 'Leche', 200, 'ml'),
  ('carnes_143', 3, 'mantequilla', 'Mantequilla', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_143', 4, 'queso', 'Queso rallado', 100, 'g'),
  ('carnes_143', 5, 'jamon-york', 'Jamón cocido en dados', 100, 'g'),
  ('carnes_143', 6, 'aceite-oliva', 'Aceite de oliva', 500, 'ml'),
  ('carnes_143', 7, 'sal', 'Sal', 2, 'g'),
  ('carnes_144', 0, 'jamon-york', 'Jamón cocido en dados', 200, 'g'),
  ('carnes_144', 1, 'queso', 'Queso rallado', 80, 'g'),
  ('carnes_144', 2, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('carnes_144', 3, 'harina', 'Harina', 70, 'g'),
  ('carnes_144', 4, 'leche', 'Leche', 700, 'ml'),
  ('carnes_144', 5, 'huevos', 'Huevo', 2, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_144', 6, 'pan-rallado', 'Pan rallado', 150, 'g'),
  ('carnes_144', 7, 'aceite-oliva', 'Aceite de oliva', 500, 'ml'),
  ('carnes_144', 8, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('carnes_144', 9, 'sal', 'Sal', 2, 'g'),
  ('carnes_145', 0, 'obleas', 'Obleas para gyoza', 18, 'ud'),
  ('carnes_145', 1, 'carne-picada', 'Carne picada de cerdo', 250, 'g'),
  ('carnes_145', 2, 'col', 'Col china', 150, 'g'),
  ('carnes_145', 3, 'cebolleta', 'Cebolleta', 30, 'g'),
  ('carnes_145', 4, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('carnes_145', 5, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_145', 6, 'salsa-soja', 'Salsa de soja', 40, 'ml'),
  ('carnes_145', 7, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('carnes_145', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_145', 9, 'vinagre', 'Vinagre de arroz', 15, 'ml'),
  ('carnes_145', 10, 'sesamo', 'Semillas de sésamo', 5, 'g'),
  ('carnes_146', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 400, 'g'),
  ('carnes_146', 1, 'huevos', 'Huevo', 1, 'ud'),
  ('carnes_146', 2, 'pan-rallado', 'Pan rallado', 80, 'g'),
  ('carnes_146', 3, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_146', 4, 'tomate', 'Tomate', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_146', 5, 'maiz', 'Maíz cocido', 80, 'g'),
  ('carnes_146', 6, 'lima', 'Lima', 1, 'ud'),
  ('carnes_146', 7, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('carnes_147', 0, 'filete-de-ternera', 'Filetes de ternera', 400, 'g'),
  ('carnes_147', 1, 'pimiento-rojo', 'Pimiento rojo', 1, 'ud'),
  ('carnes_147', 2, 'pimiento-verde', 'Pimiento verde', 1, 'ud'),
  ('carnes_147', 3, 'cebolla', 'Cebolla', 1, 'ud'),
  ('carnes_147', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_147', 5, 'ajo', 'Ajo', 2, 'ud'),
  ('carnes_148', 0, 'muslo-de-pollo', 'Muslos de pollo', 500, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_148', 1, 'patata', 'Patatas', 350, 'g'),
  ('carnes_148', 2, 'romero', 'Romero', 3, 'g'),
  ('carnes_148', 3, 'ajo', 'Ajo', 2, 'ud'),
  ('carnes_148', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_148', 5, 'limon', 'Limón', 1, 'ud'),
  ('carnes_149', 0, 'cinta-de-lomo', 'Filetes de lomo de cerdo', 400, 'g'),
  ('carnes_149', 1, 'cebolla', 'Cebolla', 2, 'ud'),
  ('carnes_149', 2, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_149', 3, 'azucar', 'Azúcar', 10, 'g'),
  ('carnes_149', 4, 'vino-blanco', 'Vino blanco', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_150', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 400, 'g'),
  ('carnes_150', 1, 'champinon', 'Champiñones', 300, 'g'),
  ('carnes_150', 2, 'ajo', 'Ajo', 3, 'ud'),
  ('carnes_150', 3, 'perejil', 'Perejil', 5, 'g'),
  ('carnes_150', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_151', 0, 'filete-de-cerdo', 'Filetes de cerdo', 400, 'g'),
  ('carnes_151', 1, 'patata', 'Patatas', 400, 'g'),
  ('carnes_151', 2, 'leche', 'Leche', 80, 'ml'),
  ('carnes_151', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('carnes_151', 4, 'cebollino', 'Cebollino', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_151', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('carnes_152', 0, 'costilla', 'Costillas de cerdo', 500, 'g'),
  ('carnes_152', 1, 'patata', 'Patatas', 300, 'g'),
  ('carnes_152', 2, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('carnes_152', 3, 'ajo', 'Ajo', 2, 'ud'),
  ('carnes_152', 4, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('carnes_152', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_153', 0, 'chuletas-de-cerdo', 'Chuletas de cerdo', 400, 'g'),
  ('carnes_153', 1, 'lechuga', 'Canónigos', 80, 'g'),
  ('carnes_153', 2, 'granada', 'Granada', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_153', 3, 'queso-cabra', 'Queso de cabra', 60, 'g'),
  ('carnes_153', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_153', 5, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('carnes_154', 0, 'solomillo', 'Solomillo de cerdo', 400, 'g'),
  ('carnes_154', 1, 'pimientos-del-piquillo', 'Pimientos del piquillo', 200, 'g'),
  ('carnes_154', 2, 'cebolla', 'Cebolla', 1, 'ud'),
  ('carnes_154', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_154', 4, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('carnes_155', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 400, 'g'),
  ('carnes_155', 1, 'jamon-york', 'Jamón cocido', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_155', 2, 'queso-en-lonchas', 'Queso en lonchas', 80, 'g'),
  ('carnes_155', 3, 'huevos', 'Huevo', 2, 'ud'),
  ('carnes_155', 4, 'pan-rallado', 'Pan rallado', 60, 'g'),
  ('carnes_155', 5, 'judia-verde', 'Judías verdes', 200, 'g'),
  ('carnes_155', 6, 'tomate', 'Tomate', 150, 'g'),
  ('carnes_155', 7, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('carnes_156', 0, 'filete-de-ternera', 'Filetes de ternera', 400, 'g'),
  ('carnes_156', 1, 'champinon', 'Champiñones', 250, 'g'),
  ('carnes_156', 2, 'zanahoria', 'Zanahoria', 250, 'g'),
  ('carnes_156', 3, 'pasas', 'Pasas', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_156', 4, 'comino', 'Comino', 2, 'g'),
  ('carnes_156', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_156', 6, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('carnes_157', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 600, 'g'),
  ('carnes_157', 1, 'naranja', 'Naranja', 2, 'ud'),
  ('carnes_157', 2, 'lima', 'Lima', 1, 'ud'),
  ('carnes_157', 3, 'pimenton', 'Pimentón dulce', 10, 'g'),
  ('carnes_157', 4, 'ajo', 'Ajo', 15, 'g'),
  ('carnes_157', 5, 'cebolla-morada', 'Cebolla morada', 150, 'g'),
  ('carnes_157', 6, 'vinagre', 'Vinagre de vino', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_157', 7, 'oregano', 'Orégano', 3, 'g'),
  ('carnes_157', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_157', 9, 'sal', 'Sal', 5, 'g'),
  ('carnes_158', 0, 'filetes-finos-de-ternera', 'Filetes finos de ternera', 400, 'g'),
  ('carnes_158', 1, 'tortilla-de-trigo', 'Tortillas de trigo', 4, 'ud'),
  ('carnes_158', 2, 'pimiento-rojo', 'Pimiento rojo', 1, 'ud'),
  ('carnes_158', 3, 'pimiento-verde', 'Pimiento verde', 1, 'ud'),
  ('carnes_158', 4, 'cebolla', 'Cebolla', 120, 'g'),
  ('carnes_158', 5, 'aguacate', 'Aguacate', 1, 'ud'),
  ('carnes_158', 6, 'lima', 'Lima', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_158', 7, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('carnes_158', 8, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('carnes_158', 9, 'sal', 'Sal', 4, 'g'),
  ('carnes_159', 0, 'lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 450, 'g'),
  ('carnes_159', 1, 'naranja', 'Naranja', 2, 'ud'),
  ('carnes_159', 2, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('carnes_159', 3, 'miel', 'Miel', 20, 'g'),
  ('carnes_159', 4, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('carnes_159', 5, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_159', 6, 'sesamo', 'Semillas de sésamo', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_159', 7, 'aceite-girasol', 'Aceite de girasol', 20, 'ml'),
  ('carnes_160', 0, 'filetes-finos-de-ternera', 'Filetes finos de ternera', 400, 'g'),
  ('carnes_160', 1, 'brocoli', 'Brócoli', 300, 'g'),
  ('carnes_160', 2, 'jengibre', 'Jengibre fresco', 15, 'g'),
  ('carnes_160', 3, 'ajo', 'Ajo', 10, 'g'),
  ('carnes_160', 4, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('carnes_160', 5, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('carnes_160', 6, 'aceite-girasol', 'Aceite de girasol', 20, 'ml'),
  ('carnes_160', 7, 'sesamo', 'Semillas de sésamo', 10, 'g'),
  ('cenas_rapidas_001', 0, 'pan-molde', 'Pan de molde', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_001', 1, 'jamon-york', 'Jamón cocido', 80, 'g'),
  ('cenas_rapidas_001', 2, 'queso-en-lonchas', 'Queso en lonchas', 60, 'g'),
  ('cenas_rapidas_001', 3, 'mantequilla', 'Mantequilla', 10, 'g'),
  ('cenas_rapidas_002', 0, 'pan', 'Pan de hogaza', 150, 'g'),
  ('cenas_rapidas_002', 1, 'tomate', 'Tomate maduro', 150, 'g'),
  ('cenas_rapidas_002', 2, 'jamon', 'Jamón serrano', 60, 'g'),
  ('cenas_rapidas_002', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('cenas_rapidas_003', 0, 'quinoa', 'Quinoa', 140, 'g'),
  ('cenas_rapidas_003', 1, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('cenas_rapidas_003', 2, 'pepino', 'Pepino', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_003', 3, 'queso-feta', 'Queso feta', 80, 'g'),
  ('cenas_rapidas_003', 4, 'granada', 'Granada', 60, 'g'),
  ('cenas_rapidas_003', 5, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('cenas_rapidas_003', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('cenas_rapidas_003', 7, 'limon', 'Limón', 1, 'ud'),
  ('cenas_rapidas_004', 0, 'pan-de-payes', 'Pan de payés', 150, 'g'),
  ('cenas_rapidas_004', 1, 'tomate', 'Tomate maduro', 120, 'g'),
  ('cenas_rapidas_004', 2, 'fuet', 'Fuet', 60, 'g'),
  ('cenas_rapidas_004', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('cenas_rapidas_005', 0, 'pan', 'Pan de hogaza', 120, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_005', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('cenas_rapidas_005', 2, 'tomate-cherry', 'Tomate cherry', 80, 'g'),
  ('cenas_rapidas_005', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('cenas_rapidas_005', 4, 'limon', 'Limón', 1, 'ud'),
  ('cenas_rapidas_006', 0, 'salchicha', 'Salchichas frescas', 250, 'g'),
  ('cenas_rapidas_006', 1, 'patata', 'Patata', 300, 'g'),
  ('cenas_rapidas_006', 2, 'leche', 'Leche', 60, 'ml'),
  ('cenas_rapidas_006', 3, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('cenas_rapidas_006', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('cenas_rapidas_007', 0, 'nachos', 'Nachos de maíz', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_007', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('cenas_rapidas_007', 2, 'tomate', 'Tomate', 80, 'g'),
  ('cenas_rapidas_007', 3, 'cebolla', 'Cebolla', 30, 'g'),
  ('cenas_rapidas_007', 4, 'limon', 'Limón', 1, 'ud'),
  ('cenas_rapidas_007', 5, 'cilantro', 'Cilantro', 5, 'g'),
  ('cenas_rapidas_008', 0, 'baguette', 'Pan chapata', 150, 'g'),
  ('cenas_rapidas_008', 1, 'tomate', 'Tomate maduro', 200, 'g'),
  ('cenas_rapidas_008', 2, 'ajo', 'Ajo', 6, 'g'),
  ('cenas_rapidas_008', 3, 'albahaca', 'Albahaca', 5, 'g'),
  ('cenas_rapidas_008', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_009', 0, 'jamon-york', 'Jamón cocido', 120, 'g'),
  ('cenas_rapidas_009', 1, 'queso', 'Queso en porciones', 80, 'g'),
  ('cenas_rapidas_009', 2, 'pepinillos', 'Pepinillos', 30, 'g'),
  ('cenas_rapidas_010', 0, 'queso', 'Queso curado', 80, 'g'),
  ('cenas_rapidas_010', 1, 'chorizo', 'Chorizo', 60, 'g'),
  ('cenas_rapidas_010', 2, 'jamon', 'Jamón serrano', 60, 'g'),
  ('cenas_rapidas_010', 3, 'aceitunas', 'Aceitunas', 40, 'g'),
  ('cenas_rapidas_010', 4, 'pan', 'Pan de barra', 80, 'g'),
  ('cenas_rapidas_012', 0, 'tomate', 'Tomate maduro', 400, 'g'),
  ('cenas_rapidas_012', 1, 'pepino', 'Pepino', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_012', 2, 'pimiento-verde', 'Pimiento verde', 40, 'g'),
  ('cenas_rapidas_012', 3, 'ajo', 'Ajo', 4, 'g'),
  ('cenas_rapidas_012', 4, 'pan', 'Pan', 30, 'g'),
  ('cenas_rapidas_012', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('cenas_rapidas_012', 6, 'vinagre', 'Vinagre', 10, 'ml'),
  ('cenas_rapidas_013', 0, 'pan', 'Pan de hogaza', 120, 'g'),
  ('cenas_rapidas_013', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('cenas_rapidas_013', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('cenas_rapidas_013', 3, 'lima', 'Lima', 1, 'ud'),
  ('cenas_rapidas_013', 4, 'cilantro', 'Cilantro', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_013', 5, 'vinagre', 'Vinagre', 10, 'ml'),
  ('cenas_rapidas_014', 0, 'tortilla-de-trigo', 'Tortilla de trigo', 2, 'ud'),
  ('cenas_rapidas_014', 1, 'atun-lata', 'Atún en conserva', 120, 'g'),
  ('cenas_rapidas_014', 2, 'lechuga', 'Lechuga', 50, 'g'),
  ('cenas_rapidas_014', 3, 'tomate', 'Tomate', 80, 'g'),
  ('cenas_rapidas_014', 4, 'maiz', 'Maíz dulce', 40, 'g'),
  ('cenas_rapidas_014', 5, 'mayonesa', 'Mayonesa', 20, 'g'),
  ('cenas_rapidas_015', 0, 'melon', 'Melón', 400, 'g'),
  ('cenas_rapidas_015', 1, 'jamon', 'Jamón serrano', 40, 'g'),
  ('cenas_rapidas_015', 2, 'yogur', 'Yogur natural', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('cenas_rapidas_015', 3, 'menta', 'Menta', 3, 'g'),
  ('cenas_rapidas_015', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('desayunos_001', 0, 'yogur', 'Yogur natural', 250, 'g'),
  ('desayunos_001', 1, 'platano', 'Plátano', 1, 'ud'),
  ('desayunos_001', 2, 'fresa', 'Fresas', 100, 'g'),
  ('desayunos_001', 3, 'avena', 'Copos de avena', 40, 'g'),
  ('desayunos_001', 4, 'miel', 'Miel', 15, 'ml'),
  ('desayunos_008', 0, 'avena', 'Copos de avena', 80, 'g'),
  ('desayunos_008', 1, 'leche', 'Leche', 350, 'ml'),
  ('desayunos_008', 2, 'platano', 'Plátano', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_008', 3, 'miel', 'Miel', 15, 'ml'),
  ('desayunos_009', 0, 'platano', 'Plátano', 2, 'ud'),
  ('desayunos_009', 1, 'leche', 'Leche', 350, 'ml'),
  ('desayunos_009', 2, 'avena', 'Copos de avena', 40, 'g'),
  ('desayunos_009', 3, 'canela', 'Canela molida', 2, 'g'),
  ('desayunos_009', 4, 'miel', 'Miel', 20, 'ml'),
  ('desayunos_010', 0, 'espinacas', 'Espinacas frescas', 60, 'g'),
  ('desayunos_010', 1, 'pina', 'Piña natural', 250, 'g'),
  ('desayunos_010', 2, 'platano', 'Plátano', 1, 'ud'),
  ('desayunos_010', 3, 'jengibre', 'Jengibre fresco', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_010', 4, 'agua', 'Agua', 150, 'ml'),
  ('desayunos_011', 0, 'frutos-rojos', 'Frutos rojos congelados', 250, 'g'),
  ('desayunos_011', 1, 'yogur', 'Yogur natural', 200, 'g'),
  ('desayunos_011', 2, 'leche', 'Leche', 100, 'ml'),
  ('desayunos_011', 3, 'miel', 'Miel', 15, 'ml'),
  ('desayunos_012', 0, 'platano', 'Plátano', 2, 'ud'),
  ('desayunos_012', 1, 'leche', 'Leche', 350, 'ml'),
  ('desayunos_012', 2, 'cacao', 'Cacao en polvo', 20, 'g'),
  ('desayunos_012', 3, 'avellanas', 'Avellanas', 30, 'g'),
  ('desayunos_012', 4, 'miel', 'Miel', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_013', 0, 'mango', 'Mango congelado', 300, 'g'),
  ('desayunos_013', 1, 'platano', 'Plátano congelado', 1, 'ud'),
  ('desayunos_013', 2, 'leche-coco', 'Leche de coco', 100, 'ml'),
  ('desayunos_013', 3, 'coco', 'Coco rallado', 15, 'g'),
  ('desayunos_013', 4, 'lima', 'Zumo de lima', 10, 'ml'),
  ('desayunos_014', 0, 'yogur', 'Yogur griego', 300, 'g'),
  ('desayunos_014', 1, 'granola', 'Granola', 60, 'g'),
  ('desayunos_014', 2, 'frutos-rojos', 'Frutos rojos', 150, 'g'),
  ('desayunos_014', 3, 'miel', 'Miel', 15, 'ml'),
  ('desayunos_015', 0, 'avena', 'Copos de avena', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_015', 1, 'leche', 'Leche', 300, 'ml'),
  ('desayunos_015', 2, 'yogur', 'Yogur natural', 100, 'g'),
  ('desayunos_015', 3, 'manzana', 'Manzana', 1, 'ud'),
  ('desayunos_015', 4, 'canela', 'Canela molida', 3, 'g'),
  ('desayunos_015', 5, 'miel', 'Miel', 20, 'ml'),
  ('desayunos_016', 0, 'avena', 'Copos de avena', 80, 'g'),
  ('desayunos_016', 1, 'leche', 'Leche', 350, 'ml'),
  ('desayunos_016', 2, 'platano', 'Plátano', 1, 'ud'),
  ('desayunos_016', 3, 'miel', 'Miel', 25, 'ml'),
  ('desayunos_017', 0, 'pulpa-de-acai-congelada', 'Pulpa de açaí congelada', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_017', 1, 'platano', 'Plátano congelado', 1, 'ud'),
  ('desayunos_017', 2, 'frutos-rojos', 'Frutos rojos', 100, 'g'),
  ('desayunos_017', 3, 'coco', 'Coco rallado', 15, 'g'),
  ('desayunos_017', 4, 'granola', 'Granola', 20, 'g'),
  ('desayunos_018', 0, 'pan', 'Pan', 160, 'g'),
  ('desayunos_018', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('desayunos_018', 2, 'leche', 'Leche', 100, 'ml'),
  ('desayunos_018', 3, 'canela', 'Canela molida', 3, 'g'),
  ('desayunos_018', 4, 'mantequilla', 'Mantequilla', 10, 'g'),
  ('desayunos_018', 5, 'sirope-de-arce', 'Sirope de arce', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_019', 0, 'pan', 'Pan', 160, 'g'),
  ('desayunos_019', 1, 'mantequilla-de-cacahuete', 'Mantequilla de cacahuete', 40, 'g'),
  ('desayunos_019', 2, 'platano', 'Plátano', 1, 'ud'),
  ('desayunos_019', 3, 'miel', 'Miel', 15, 'ml'),
  ('desayunos_020', 0, 'pan', 'Pan rústico', 160, 'g'),
  ('desayunos_020', 1, 'ajo', 'Ajo', 5, 'g'),
  ('desayunos_020', 2, 'tomate', 'Tomate maduro', 150, 'g'),
  ('desayunos_020', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('desayunos_020', 4, 'jamon', 'Jamón serrano', 80, 'g'),
  ('desayunos_020', 5, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_021', 0, 'harina', 'Harina', 140, 'g'),
  ('desayunos_021', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('desayunos_021', 2, 'leche', 'Leche', 250, 'ml'),
  ('desayunos_021', 3, 'levadura-quimica', 'Levadura química', 6, 'g'),
  ('desayunos_021', 4, 'azucar', 'Azúcar', 20, 'g'),
  ('desayunos_021', 5, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('desayunos_021', 6, 'sirope-de-arce', 'Sirope de arce', 30, 'ml'),
  ('desayunos_021', 7, 'frutos-rojos', 'Frutos rojos', 100, 'g'),
  ('desayunos_022', 0, 'harina', 'Harina', 140, 'g'),
  ('desayunos_022', 1, 'huevos', 'Huevo', 2, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_022', 2, 'leche', 'Leche', 220, 'ml'),
  ('desayunos_022', 3, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('desayunos_022', 4, 'levadura-quimica', 'Levadura química', 6, 'g'),
  ('desayunos_022', 5, 'azucar', 'Azúcar', 15, 'g'),
  ('desayunos_022', 6, 'nata-para-montar', 'Nata para montar', 80, 'g'),
  ('desayunos_022', 7, 'fresa', 'Fresas', 150, 'g'),
  ('desayunos_022', 8, 'azucar-glas', 'Azúcar glas', 5, 'g'),
  ('desayunos_023', 0, 'huevos', 'Huevo', 5, 'ud'),
  ('desayunos_023', 1, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('desayunos_023', 2, 'nata', 'Nata para cocinar', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_023', 3, 'cebollino', 'Cebollino fresco', 8, 'g'),
  ('desayunos_023', 4, 'sal', 'Sal', 2, 'g'),
  ('desayunos_024', 0, 'requeson', 'Requesón', 300, 'g'),
  ('desayunos_024', 1, 'miel', 'Miel', 30, 'ml'),
  ('desayunos_024', 2, 'nueces', 'Nueces', 40, 'g'),
  ('desayunos_024', 3, 'canela', 'Canela molida', 1, 'g'),
  ('desayunos_025', 0, 'pan', 'Pan', 160, 'g'),
  ('desayunos_025', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('desayunos_025', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('desayunos_025', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('desayunos_025', 4, 'limon', 'Limón', 1, 'ud'),
  ('desayunos_025', 5, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_001', 0, 'lechuga', 'Lechuga', 150, 'g'),
  ('ensaladas_verduras_001', 1, 'tomate', 'Tomate', 150, 'g'),
  ('ensaladas_verduras_001', 2, 'pepino', 'Pepino', 80, 'g'),
  ('ensaladas_verduras_001', 3, 'cebolla', 'Cebolla', 40, 'g'),
  ('ensaladas_verduras_001', 4, 'queso-fresco', 'Queso fresco', 80, 'g'),
  ('ensaladas_verduras_001', 5, 'aceitunas', 'Aceitunas', 30, 'g'),
  ('ensaladas_verduras_001', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_001', 7, 'vinagre', 'Vinagre', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_002', 0, 'calabacin', 'Calabacín', 200, 'g'),
  ('ensaladas_verduras_002', 1, 'pimiento-rojo', 'Pimiento rojo', 120, 'g'),
  ('ensaladas_verduras_002', 2, 'pimiento-verde', 'Pimiento verde', 120, 'g'),
  ('ensaladas_verduras_002', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('ensaladas_verduras_002', 4, 'tomate', 'Tomate maduro', 200, 'g'),
  ('ensaladas_verduras_002', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_002', 6, 'ajo', 'Ajo', 8, 'g'),
  ('ensaladas_verduras_003', 0, 'alcachofa', 'Alcachofas', 150, 'g'),
  ('ensaladas_verduras_003', 1, 'judia-verde', 'Judías verdes', 100, 'g'),
  ('ensaladas_verduras_003', 2, 'guisantes', 'Guisantes', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_003', 3, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('ensaladas_verduras_003', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('ensaladas_verduras_003', 5, 'jamon', 'Jamón serrano', 40, 'g'),
  ('ensaladas_verduras_003', 6, 'harina', 'Harina', 10, 'g'),
  ('ensaladas_verduras_003', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_004', 0, 'calabacin', 'Calabacín', 400, 'g'),
  ('ensaladas_verduras_004', 1, 'carne-picada', 'Carne picada de cerdo', 200, 'g'),
  ('ensaladas_verduras_004', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('ensaladas_verduras_004', 3, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('ensaladas_verduras_004', 4, 'ajo', 'Ajo', 6, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_004', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_005', 0, 'espinacas', 'Espinacas frescas', 300, 'g'),
  ('ensaladas_verduras_005', 1, 'pasas', 'Pasas', 20, 'g'),
  ('ensaladas_verduras_005', 2, 'pinones', 'Piñones', 20, 'g'),
  ('ensaladas_verduras_005', 3, 'ajo', 'Ajo', 8, 'g'),
  ('ensaladas_verduras_005', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_006', 0, 'pimiento-rojo', 'Pimientos rojos', 4, 'ud'),
  ('ensaladas_verduras_006', 1, 'carne-picada', 'Carne picada de ternera', 250, 'g'),
  ('ensaladas_verduras_006', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('ensaladas_verduras_006', 3, 'tomate-triturado', 'Tomate triturado', 200, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_006', 4, 'ajo', 'Ajo', 8, 'g'),
  ('ensaladas_verduras_006', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_007', 0, 'berenjena', 'Berenjena', 400, 'g'),
  ('ensaladas_verduras_007', 1, 'carne-picada', 'Carne picada de cerdo', 200, 'g'),
  ('ensaladas_verduras_007', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('ensaladas_verduras_007', 3, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('ensaladas_verduras_007', 4, 'queso', 'Queso rallado', 30, 'g'),
  ('ensaladas_verduras_007', 5, 'ajo', 'Ajo', 6, 'g'),
  ('ensaladas_verduras_007', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_008', 0, 'calabacin', 'Calabacín', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_008', 1, 'berenjena', 'Berenjena', 150, 'g'),
  ('ensaladas_verduras_008', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('ensaladas_verduras_008', 3, 'esparragos', 'Espárragos trigueros', 100, 'g'),
  ('ensaladas_verduras_008', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_009', 0, 'berenjena', 'Berenjena', 200, 'g'),
  ('ensaladas_verduras_009', 1, 'pimiento-rojo', 'Pimiento rojo', 200, 'g'),
  ('ensaladas_verduras_009', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('ensaladas_verduras_009', 3, 'tomate', 'Tomate', 150, 'g'),
  ('ensaladas_verduras_009', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_010', 0, 'judia-verde', 'Judías verdes', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_010', 1, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_010', 2, 'jamon', 'Jamón serrano', 30, 'g'),
  ('ensaladas_verduras_010', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_011', 0, 'brocoli', 'Brócoli', 400, 'g'),
  ('ensaladas_verduras_011', 1, 'bechamel', 'Bechamel', 100, 'ml'),
  ('ensaladas_verduras_011', 2, 'queso', 'Queso rallado', 40, 'g'),
  ('ensaladas_verduras_011', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('ensaladas_verduras_012', 0, 'coliflor', 'Coliflor', 400, 'g'),
  ('ensaladas_verduras_012', 1, 'harina', 'Harina', 30, 'g'),
  ('ensaladas_verduras_012', 2, 'huevos', 'Huevo', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_012', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('ensaladas_verduras_013', 0, 'patata', 'Patata', 250, 'g'),
  ('ensaladas_verduras_013', 1, 'tomate', 'Tomate', 120, 'g'),
  ('ensaladas_verduras_013', 2, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('ensaladas_verduras_013', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('ensaladas_verduras_013', 4, 'aceitunas', 'Aceitunas', 30, 'g'),
  ('ensaladas_verduras_013', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_013', 6, 'vinagre', 'Vinagre', 10, 'ml'),
  ('ensaladas_verduras_015', 0, 'patata', 'Patata', 250, 'g'),
  ('ensaladas_verduras_015', 1, 'zanahoria', 'Zanahoria', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_015', 2, 'guisantes', 'Guisantes', 60, 'g'),
  ('ensaladas_verduras_015', 3, 'atun-lata', 'Atún en conserva', 80, 'g'),
  ('ensaladas_verduras_015', 4, 'huevos', 'Huevo cocido', 2, 'ud'),
  ('ensaladas_verduras_015', 5, 'pimiento-verde', 'Pimiento morrón', 60, 'g'),
  ('ensaladas_verduras_015', 6, 'pepinillos', 'Pepinillos', 30, 'g'),
  ('ensaladas_verduras_015', 7, 'mayonesa', 'Mayonesa', 70, 'g'),
  ('ensaladas_verduras_015', 8, 'aceitunas', 'Aceitunas', 25, 'g'),
  ('ensaladas_verduras_016', 0, 'alcachofa', 'Alcachofas', 400, 'g'),
  ('ensaladas_verduras_016', 1, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_016', 2, 'jamon', 'Jamón serrano', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_016', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_016', 4, 'limon', 'Limón', 1, 'ud'),
  ('ensaladas_verduras_016', 5, 'perejil', 'Perejil', 5, 'g'),
  ('ensaladas_verduras_017', 0, 'patata', 'Patata', 200, 'g'),
  ('ensaladas_verduras_017', 1, 'berenjena', 'Berenjena', 200, 'g'),
  ('ensaladas_verduras_017', 2, 'pimiento-rojo', 'Pimiento rojo', 150, 'g'),
  ('ensaladas_verduras_017', 3, 'tomate', 'Tomate maduro', 200, 'g'),
  ('ensaladas_verduras_017', 4, 'ajo', 'Ajo', 8, 'g'),
  ('ensaladas_verduras_017', 5, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('ensaladas_verduras_018', 0, 'esparragos', 'Espárragos trigueros', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_018', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_018', 2, 'ajo', 'Ajo', 6, 'g'),
  ('ensaladas_verduras_018', 3, 'sal-escamas', 'Sal en escamas', 2, 'g'),
  ('ensaladas_verduras_020', 0, 'acelga', 'Acelgas', 400, 'g'),
  ('ensaladas_verduras_020', 1, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_020', 2, 'patata', 'Patata', 100, 'g'),
  ('ensaladas_verduras_020', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_020', 4, 'pimenton', 'Pimentón', 3, 'g'),
  ('ensaladas_verduras_021', 0, 'tomate', 'Tomate', 300, 'g'),
  ('ensaladas_verduras_021', 1, 'pepino', 'Pepino', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_021', 2, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('ensaladas_verduras_021', 3, 'cebolla-morada', 'Cebolla morada', 50, 'g'),
  ('ensaladas_verduras_021', 4, 'queso-feta', 'Queso feta', 100, 'g'),
  ('ensaladas_verduras_021', 5, 'aceitunas', 'Aceitunas', 40, 'g'),
  ('ensaladas_verduras_021', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_021', 7, 'oregano', 'Orégano', 2, 'g'),
  ('ensaladas_verduras_022', 0, 'lombarda', 'Lombarda', 400, 'g'),
  ('ensaladas_verduras_022', 1, 'manzana', 'Manzana', 100, 'g'),
  ('ensaladas_verduras_022', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('ensaladas_verduras_022', 3, 'vinagre', 'Vinagre', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_022', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_023', 0, 'coles-de-bruselas', 'Coles de Bruselas', 350, 'g'),
  ('ensaladas_verduras_023', 1, 'panceta', 'Panceta', 40, 'g'),
  ('ensaladas_verduras_023', 2, 'ajo', 'Ajo', 8, 'g'),
  ('ensaladas_verduras_023', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_024', 0, 'lechuga', 'Lechuga romana', 200, 'g'),
  ('ensaladas_verduras_024', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 200, 'g'),
  ('ensaladas_verduras_024', 2, 'pan', 'Pan', 40, 'g'),
  ('ensaladas_verduras_024', 3, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('ensaladas_verduras_024', 4, 'mayonesa', 'Mayonesa', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_024', 5, 'ajo', 'Ajo', 4, 'g'),
  ('ensaladas_verduras_024', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_024', 7, 'limon', 'Limón', 1, 'ud'),
  ('ensaladas_verduras_025', 0, 'brocoli', 'Brócoli', 150, 'g'),
  ('ensaladas_verduras_025', 1, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('ensaladas_verduras_025', 2, 'judia-verde', 'Judías verdes', 100, 'g'),
  ('ensaladas_verduras_025', 3, 'calabacin', 'Calabacín', 100, 'g'),
  ('ensaladas_verduras_025', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_031', 0, 'pan', 'Pan rústico', 100, 'g'),
  ('ensaladas_verduras_031', 1, 'burrata', 'Burrata', 125, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_031', 2, 'tomate-cherry', 'Tomate cherry', 150, 'g'),
  ('ensaladas_verduras_031', 3, 'pesto', 'Pesto de albahaca', 30, 'g'),
  ('ensaladas_verduras_031', 4, 'ajo', 'Ajo', 5, 'g'),
  ('ensaladas_verduras_031', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('ensaladas_verduras_031', 6, 'albahaca', 'Albahaca fresca', 5, 'g'),
  ('ensaladas_verduras_031', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_032', 0, 'nachos', 'Nachos de maíz', 120, 'g'),
  ('ensaladas_verduras_032', 1, 'aguacate', 'Aguacate', 200, 'g'),
  ('ensaladas_verduras_032', 2, 'tomate', 'Tomate', 100, 'g'),
  ('ensaladas_verduras_032', 3, 'cebolla', 'Cebolla', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_032', 4, 'lima', 'Lima', 20, 'ml'),
  ('ensaladas_verduras_032', 5, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('ensaladas_verduras_032', 6, 'queso', 'Queso rallado para fundir', 100, 'g'),
  ('ensaladas_verduras_032', 7, 'vinagre', 'Jalapeños en vinagre', 20, 'g'),
  ('ensaladas_verduras_032', 8, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_033', 0, 'calabacin', 'Calabacín', 300, 'g'),
  ('ensaladas_verduras_033', 1, 'huevos', 'Huevo', 100, 'g'),
  ('ensaladas_verduras_033', 2, 'harina', 'Harina de trigo', 40, 'g'),
  ('ensaladas_verduras_033', 3, 'parmesano', 'Queso parmesano rallado', 30, 'g'),
  ('ensaladas_verduras_033', 4, 'cebolleta', 'Cebolleta', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_033', 5, 'eneldo', 'Eneldo fresco', 5, 'g'),
  ('ensaladas_verduras_033', 6, 'yogur', 'Yogur griego', 60, 'g'),
  ('ensaladas_verduras_033', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_033', 8, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_034', 0, 'burrata', 'Burrata', 250, 'g'),
  ('ensaladas_verduras_034', 1, 'tomate-triturado', 'Tomate triturado de bote', 200, 'g'),
  ('ensaladas_verduras_034', 2, 'pan', 'Pan rústico', 80, 'g'),
  ('ensaladas_verduras_034', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('ensaladas_verduras_034', 4, 'oregano', 'Orégano seco', 2, 'g'),
  ('ensaladas_verduras_034', 5, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_034', 6, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('ensaladas_verduras_035', 0, 'tortilla-de-trigo', 'Tortillas de trigo', 120, 'g'),
  ('ensaladas_verduras_035', 1, 'champinon', 'Champiñones', 200, 'g'),
  ('ensaladas_verduras_035', 2, 'queso', 'Queso rallado para fundir', 120, 'g'),
  ('ensaladas_verduras_035', 3, 'cebolla', 'Cebolla', 40, 'g'),
  ('ensaladas_verduras_035', 4, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_035', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('ensaladas_verduras_035', 6, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('ensaladas_verduras_035', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_036', 0, 'espinacas', 'Espinacas baby', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_036', 1, 'bacon', 'Bacon en tiras', 80, 'g'),
  ('ensaladas_verduras_036', 2, 'huevos', 'Huevo', 100, 'g'),
  ('ensaladas_verduras_036', 3, 'pan', 'Pan', 40, 'g'),
  ('ensaladas_verduras_036', 4, 'vinagre-de-jerez', 'Vinagre de Jerez', 15, 'ml'),
  ('ensaladas_verduras_036', 5, 'mostaza', 'Mostaza de Dijon', 5, 'g'),
  ('ensaladas_verduras_036', 6, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('ensaladas_verduras_037', 0, 'pan', 'Pan rústico', 100, 'g'),
  ('ensaladas_verduras_037', 1, 'burrata', 'Burrata', 125, 'g'),
  ('ensaladas_verduras_037', 2, 'miel', 'Miel', 20, 'g'),
  ('ensaladas_verduras_037', 3, 'pistacho', 'Pistachos pelados', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_037', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 10, 'ml'),
  ('ensaladas_verduras_037', 5, 'sal-escamas', 'Sal en escamas', 2, 'g'),
  ('ensaladas_verduras_038', 0, 'burrata', 'Burrata', 250, 'g'),
  ('ensaladas_verduras_038', 1, 'melocoton', 'Melocotón', 200, 'g'),
  ('ensaladas_verduras_038', 2, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('ensaladas_verduras_038', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_038', 4, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_038', 5, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_038', 6, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('ensaladas_verduras_039', 0, 'remolacha', 'Remolacha cocida', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_039', 1, 'queso-cabra', 'Queso de cabra', 100, 'g'),
  ('ensaladas_verduras_039', 2, 'nueces', 'Nueces', 30, 'g'),
  ('ensaladas_verduras_039', 3, 'rucula', 'Rúcula', 60, 'g'),
  ('ensaladas_verduras_039', 4, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_039', 5, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_039', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_040', 0, 'pato', 'Magret de pato', 300, 'g'),
  ('ensaladas_verduras_040', 1, 'naranja', 'Naranja', 200, 'g'),
  ('ensaladas_verduras_040', 2, 'lechuga', 'Canónigos', 80, 'g'),
  ('ensaladas_verduras_040', 3, 'cebolla-morada', 'Cebolla morada', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_040', 4, 'vinagre-de-jerez', 'Vinagre de Jerez', 15, 'ml'),
  ('ensaladas_verduras_040', 5, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_040', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_040', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_041', 0, 'langostinos', 'Langostinos pelados', 200, 'g'),
  ('ensaladas_verduras_041', 1, 'aguacate', 'Aguacate', 200, 'g'),
  ('ensaladas_verduras_041', 2, 'tomate', 'Tomate', 100, 'g'),
  ('ensaladas_verduras_041', 3, 'lechuga', 'Lechuga', 60, 'g'),
  ('ensaladas_verduras_041', 4, 'lima', 'Lima', 20, 'ml'),
  ('ensaladas_verduras_041', 5, 'cilantro', 'Cilantro fresco', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_041', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_041', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_042', 0, 'lechuga', 'Canónigos', 80, 'g'),
  ('ensaladas_verduras_042', 1, 'pera', 'Pera', 200, 'g'),
  ('ensaladas_verduras_042', 2, 'roquefort', 'Queso roquefort', 80, 'g'),
  ('ensaladas_verduras_042', 3, 'nueces', 'Nueces', 30, 'g'),
  ('ensaladas_verduras_042', 4, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_042', 5, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_042', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_043', 0, 'sandia', 'Sandía', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_043', 1, 'queso-feta', 'Queso feta', 100, 'g'),
  ('ensaladas_verduras_043', 2, 'menta', 'Menta fresca', 10, 'g'),
  ('ensaladas_verduras_043', 3, 'aceitunas-negras', 'Aceitunas negras', 20, 'g'),
  ('ensaladas_verduras_043', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_043', 5, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_043', 6, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('ensaladas_verduras_044', 0, 'quinoa', 'Quinoa', 100, 'g'),
  ('ensaladas_verduras_044', 1, 'granada', 'Granada', 100, 'g'),
  ('ensaladas_verduras_044', 2, 'queso-feta', 'Queso feta', 80, 'g'),
  ('ensaladas_verduras_044', 3, 'pepino', 'Pepino', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_044', 4, 'menta', 'Menta fresca', 5, 'g'),
  ('ensaladas_verduras_044', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_044', 6, 'limon', 'Limón', 15, 'ml'),
  ('ensaladas_verduras_044', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_045', 0, 'manzana', 'Manzana', 200, 'g'),
  ('ensaladas_verduras_045', 1, 'apio', 'Apio', 80, 'g'),
  ('ensaladas_verduras_045', 2, 'nueces', 'Nueces', 40, 'g'),
  ('ensaladas_verduras_045', 3, 'pasas', 'Uvas pasas', 30, 'g'),
  ('ensaladas_verduras_045', 4, 'mayonesa', 'Mayonesa', 40, 'g'),
  ('ensaladas_verduras_045', 5, 'yogur', 'Yogur natural', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_045', 6, 'limon', 'Limón', 10, 'ml'),
  ('ensaladas_verduras_045', 7, 'lechuga', 'Lechuga', 60, 'g'),
  ('ensaladas_verduras_046', 0, 'pulpo', 'Pulpo cocido', 300, 'g'),
  ('ensaladas_verduras_046', 1, 'patata', 'Patata', 300, 'g'),
  ('ensaladas_verduras_046', 2, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('ensaladas_verduras_046', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 30, 'ml'),
  ('ensaladas_verduras_046', 4, 'sal-gruesa', 'Sal gorda', 3, 'g'),
  ('ensaladas_verduras_046', 5, 'laurel', 'Laurel', 2, 'g'),
  ('ensaladas_verduras_047', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('ensaladas_verduras_047', 1, 'comino', 'Comino molido', 4, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_047', 2, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('ensaladas_verduras_047', 3, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('ensaladas_verduras_047', 4, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('ensaladas_verduras_047', 5, 'perejil', 'Perejil fresco', 10, 'g'),
  ('ensaladas_verduras_047', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('ensaladas_verduras_047', 7, 'limon', 'Limón', 15, 'ml'),
  ('ensaladas_verduras_047', 8, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_048', 0, 'esparragos', 'Espárragos trigueros', 250, 'g'),
  ('ensaladas_verduras_048', 1, 'jamon', 'Jamón serrano', 60, 'g'),
  ('ensaladas_verduras_048', 2, 'ajo', 'Ajo', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_048', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('ensaladas_verduras_048', 4, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('ensaladas_verduras_048', 5, 'sal', 'Sal', 1, 'g'),
  ('ensaladas_verduras_048', 6, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('ensaladas_verduras_049', 0, 'tomate', 'Tomate raf', 300, 'g'),
  ('ensaladas_verduras_049', 1, 'ventresca', 'Ventresca de atún en aceite', 120, 'g'),
  ('ensaladas_verduras_049', 2, 'cebolleta', 'Cebolleta', 20, 'g'),
  ('ensaladas_verduras_049', 3, 'aceitunas-negras', 'Aceitunas negras', 20, 'g'),
  ('ensaladas_verduras_049', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('ensaladas_verduras_049', 5, 'sal-escamas', 'Sal en escamas', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_050', 0, 'higo', 'Higos', 200, 'g'),
  ('ensaladas_verduras_050', 1, 'jamon', 'Jamón serrano', 60, 'g'),
  ('ensaladas_verduras_050', 2, 'queso-cabra', 'Queso de cabra', 80, 'g'),
  ('ensaladas_verduras_050', 3, 'rucula', 'Rúcula', 50, 'g'),
  ('ensaladas_verduras_050', 4, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_050', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_050', 6, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_051', 0, 'rucula', 'Rúcula', 100, 'g'),
  ('ensaladas_verduras_051', 1, 'parmesano', 'Queso parmesano', 50, 'g'),
  ('ensaladas_verduras_051', 2, 'pinones', 'Piñones', 25, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_051', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('ensaladas_verduras_051', 4, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_051', 5, 'sal', 'Sal', 1, 'g'),
  ('ensaladas_verduras_051', 6, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('ensaladas_verduras_052', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 250, 'g'),
  ('ensaladas_verduras_052', 1, 'col', 'Col china', 150, 'g'),
  ('ensaladas_verduras_052', 2, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('ensaladas_verduras_052', 3, 'pepino', 'Pepino', 80, 'g'),
  ('ensaladas_verduras_052', 4, 'cacahuete', 'Cacahuetes tostados', 30, 'g'),
  ('ensaladas_verduras_052', 5, 'cilantro', 'Cilantro fresco', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_052', 6, 'lima', 'Lima', 20, 'ml'),
  ('ensaladas_verduras_052', 7, 'salsa-soja', 'Salsa de soja', 15, 'ml'),
  ('ensaladas_verduras_052', 8, 'salsa-worcestershire', 'Salsa de pescado', 10, 'ml'),
  ('ensaladas_verduras_052', 9, 'azucar-moreno', 'Azúcar moreno', 10, 'g'),
  ('ensaladas_verduras_052', 10, 'guindilla', 'Guindilla roja', 5, 'g'),
  ('ensaladas_verduras_052', 11, 'aceite-de-sesamo', 'Aceite de sésamo', 5, 'ml'),
  ('ensaladas_verduras_053', 0, 'bogavante', 'Bogavante', 600, 'g'),
  ('ensaladas_verduras_053', 1, 'lechuga', 'Lechugas variadas', 60, 'g'),
  ('ensaladas_verduras_053', 2, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('ensaladas_verduras_053', 3, 'aguacate', 'Aguacate', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_053', 4, 'huevos', 'Huevo', 50, 'g'),
  ('ensaladas_verduras_053', 5, 'aceite-oliva', 'Aceite de oliva suave', 100, 'ml'),
  ('ensaladas_verduras_053', 6, 'limon', 'Limón', 15, 'ml'),
  ('ensaladas_verduras_053', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_054', 0, 'hojas-verdes', 'Lechuga o mezclum', 100, 'g'),
  ('ensaladas_verduras_054', 1, 'tomate', 'Tomate', 150, 'g'),
  ('ensaladas_verduras_054', 2, 'judia-verde', 'Judías verdes', 150, 'g'),
  ('ensaladas_verduras_054', 3, 'patata', 'Patata', 200, 'g'),
  ('ensaladas_verduras_054', 4, 'huevos', 'Huevo', 2, 'ud'),
  ('ensaladas_verduras_054', 5, 'atun', 'Atún en aceite', 120, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_054', 6, 'anchoa-en-aceite', 'Anchoas', 20, 'g'),
  ('ensaladas_verduras_054', 7, 'aceitunas-negras', 'Aceitunas negras', 40, 'g'),
  ('ensaladas_verduras_054', 8, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_054', 9, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('ensaladas_verduras_054', 10, 'mostaza', 'Mostaza de Dijon', 10, 'g'),
  ('ensaladas_verduras_055', 0, 'lechuga', 'Canónigos', 100, 'g'),
  ('ensaladas_verduras_055', 1, 'aguacate', 'Aguacate', 200, 'g'),
  ('ensaladas_verduras_055', 2, 'gambas', 'Gambas cocidas peladas', 200, 'g'),
  ('ensaladas_verduras_055', 3, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('ensaladas_verduras_055', 4, 'mayonesa', 'Mayonesa', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_055', 5, 'ketchup', 'Ketchup', 20, 'g'),
  ('ensaladas_verduras_055', 6, 'limon', 'Limón', 10, 'ml'),
  ('ensaladas_verduras_056', 0, 'lechuga', 'Canónigos', 100, 'g'),
  ('ensaladas_verduras_056', 1, 'manzana', 'Manzana', 150, 'g'),
  ('ensaladas_verduras_056', 2, 'nueces', 'Nueces', 40, 'g'),
  ('ensaladas_verduras_056', 3, 'queso-azul', 'Queso azul', 60, 'g'),
  ('ensaladas_verduras_056', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_056', 5, 'vinagre-balsamico', 'Vinagre de Módena', 15, 'ml'),
  ('ensaladas_verduras_056', 6, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_057', 0, 'cuscus', 'Cuscús', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_057', 1, 'tomate', 'Tomate', 150, 'g'),
  ('ensaladas_verduras_057', 2, 'pepino', 'Pepino', 100, 'g'),
  ('ensaladas_verduras_057', 3, 'cebolleta', 'Cebolleta', 30, 'g'),
  ('ensaladas_verduras_057', 4, 'perejil', 'Perejil fresco', 20, 'g'),
  ('ensaladas_verduras_057', 5, 'menta', 'Menta fresca', 10, 'g'),
  ('ensaladas_verduras_057', 6, 'limon', 'Limón', 30, 'ml'),
  ('ensaladas_verduras_057', 7, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_058', 0, 'cuscus', 'Cuscús', 100, 'g'),
  ('ensaladas_verduras_058', 1, 'calabacin', 'Calabacín', 150, 'g'),
  ('ensaladas_verduras_058', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_058', 3, 'berenjena', 'Berenjena', 150, 'g'),
  ('ensaladas_verduras_058', 4, 'cebolla-morada', 'Cebolla roja', 50, 'g'),
  ('ensaladas_verduras_058', 5, 'aceite-oliva', 'Aceite de oliva', 35, 'ml'),
  ('ensaladas_verduras_058', 6, 'limon', 'Limón', 15, 'ml'),
  ('ensaladas_verduras_058', 7, 'perejil', 'Perejil fresco', 10, 'g'),
  ('ensaladas_verduras_059', 0, 'patata', 'Patata', 300, 'g'),
  ('ensaladas_verduras_059', 1, 'tomate', 'Tomate', 150, 'g'),
  ('ensaladas_verduras_059', 2, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('ensaladas_verduras_059', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('ensaladas_verduras_059', 4, 'ventresca', 'Ventresca de atún en aceite', 120, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_059', 5, 'huevos', 'Huevo', 1, 'ud'),
  ('ensaladas_verduras_059', 6, 'aceitunas', 'Aceitunas', 30, 'g'),
  ('ensaladas_verduras_059', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_059', 8, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('ensaladas_verduras_060', 0, 'hojas-verdes', 'Mezclum de hojas', 80, 'g'),
  ('ensaladas_verduras_060', 1, 'setas', 'Setas variadas', 250, 'g'),
  ('ensaladas_verduras_060', 2, 'jamon', 'Jamón serrano en taquitos', 60, 'g'),
  ('ensaladas_verduras_060', 3, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_060', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_060', 5, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_060', 6, 'perejil', 'Perejil fresco', 5, 'g'),
  ('ensaladas_verduras_061', 0, 'espinacas', 'Espinacas baby', 100, 'g'),
  ('ensaladas_verduras_061', 1, 'fresa', 'Fresas', 150, 'g'),
  ('ensaladas_verduras_061', 2, 'almendras', 'Almendras laminadas', 30, 'g'),
  ('ensaladas_verduras_061', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_061', 4, 'vinagre-balsamico', 'Vinagre balsámico', 15, 'ml'),
  ('ensaladas_verduras_061', 5, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_062', 0, 'lechuga', 'Canónigos', 100, 'g'),
  ('ensaladas_verduras_062', 1, 'granada', 'Granada (arilos)', 100, 'g'),
  ('ensaladas_verduras_062', 2, 'queso-cabra', 'Queso de cabra', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_062', 3, 'nueces', 'Nueces', 20, 'g'),
  ('ensaladas_verduras_062', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_062', 5, 'vinagre-balsamico', 'Vinagre de Módena', 15, 'ml'),
  ('ensaladas_verduras_062', 6, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_063', 0, 'tomate', 'Tomate', 250, 'g'),
  ('ensaladas_verduras_063', 1, 'mozzarella', 'Mozzarella fresca', 150, 'g'),
  ('ensaladas_verduras_063', 2, 'pesto', 'Pesto', 40, 'g'),
  ('ensaladas_verduras_063', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('ensaladas_verduras_063', 4, 'albahaca', 'Albahaca fresca', 5, 'g'),
  ('ensaladas_verduras_064', 0, 'lentejas', 'Lentejas cocidas', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_064', 1, 'queso-feta', 'Queso feta', 100, 'g'),
  ('ensaladas_verduras_064', 2, 'tomate-cherry', 'Tomate cherry', 120, 'g'),
  ('ensaladas_verduras_064', 3, 'cebolla-morada', 'Cebolla roja', 40, 'g'),
  ('ensaladas_verduras_064', 4, 'pepino', 'Pepino', 80, 'g'),
  ('ensaladas_verduras_064', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_064', 6, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('ensaladas_verduras_064', 7, 'perejil', 'Perejil fresco', 10, 'g'),
  ('ensaladas_verduras_065', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 260, 'g'),
  ('ensaladas_verduras_065', 1, 'harina', 'Harina', 40, 'g'),
  ('ensaladas_verduras_065', 2, 'huevos', 'Huevo', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_065', 3, 'pan-rallado', 'Pan rallado', 60, 'g'),
  ('ensaladas_verduras_065', 4, 'aceite-oliva', 'Aceite de oliva suave para freír', 200, 'ml'),
  ('ensaladas_verduras_065', 5, 'aguacate', 'Aguacate', 200, 'g'),
  ('ensaladas_verduras_065', 6, 'hojas-verdes', 'Mezclum de hojas', 100, 'g'),
  ('ensaladas_verduras_065', 7, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('ensaladas_verduras_065', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_065', 9, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('ensaladas_verduras_066', 0, 'calabaza', 'Calabaza', 400, 'g'),
  ('ensaladas_verduras_066', 1, 'rucula', 'Rúcula', 80, 'g'),
  ('ensaladas_verduras_066', 2, 'queso-cabra', 'Queso de cabra', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_066', 3, 'nueces', 'Nueces', 30, 'g'),
  ('ensaladas_verduras_066', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_066', 5, 'miel', 'Miel', 20, 'g'),
  ('ensaladas_verduras_066', 6, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_067', 0, 'lechuga', 'Lechuga romana', 200, 'g'),
  ('ensaladas_verduras_067', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 260, 'g'),
  ('ensaladas_verduras_067', 2, 'harina', 'Harina', 30, 'g'),
  ('ensaladas_verduras_067', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('ensaladas_verduras_067', 4, 'pan-rallado', 'Pan rallado', 50, 'g'),
  ('ensaladas_verduras_067', 5, 'pan-molde', 'Pan de molde para picatostes', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_067', 6, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_067', 7, 'parmesano', 'Queso parmesano', 40, 'g'),
  ('ensaladas_verduras_067', 8, 'mayonesa', 'Mayonesa', 40, 'g'),
  ('ensaladas_verduras_067', 9, 'anchoa-en-aceite', 'Anchoas', 10, 'g'),
  ('ensaladas_verduras_067', 10, 'ajo', 'Ajo', 5, 'g'),
  ('ensaladas_verduras_067', 11, 'limon', 'Limón', 15, 'ml'),
  ('ensaladas_verduras_067', 12, 'mostaza', 'Mostaza de Dijon', 5, 'g'),
  ('ensaladas_verduras_068', 0, 'zanahoria', 'Zanahoria', 300, 'g'),
  ('ensaladas_verduras_068', 1, 'pasas', 'Pasas', 40, 'g'),
  ('ensaladas_verduras_068', 2, 'comino', 'Comino molido', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_068', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_068', 4, 'limon', 'Limón', 20, 'ml'),
  ('ensaladas_verduras_068', 5, 'perejil', 'Perejil fresco', 10, 'g'),
  ('ensaladas_verduras_069', 0, 'brote-tierno', 'Brotes tiernos', 160, 'g'),
  ('ensaladas_verduras_069', 1, 'tomate-cherry', 'Tomate cherry', 120, 'g'),
  ('ensaladas_verduras_069', 2, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_069', 3, 'miel', 'Miel', 20, 'g'),
  ('ensaladas_verduras_069', 4, 'mostaza', 'Mostaza de Dijon', 15, 'g'),
  ('ensaladas_verduras_069', 5, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('ensaladas_verduras_070', 0, 'arroz', 'Arroz salvaje', 120, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_070', 1, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('ensaladas_verduras_070', 2, 'calabacin', 'Calabacín', 100, 'g'),
  ('ensaladas_verduras_070', 3, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('ensaladas_verduras_070', 4, 'cebolleta', 'Cebolleta', 40, 'g'),
  ('ensaladas_verduras_070', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_070', 6, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('ensaladas_verduras_070', 7, 'perejil', 'Perejil fresco', 10, 'g'),
  ('ensaladas_verduras_071', 0, 'judia-verde', 'Judías verdes', 300, 'g'),
  ('ensaladas_verduras_071', 1, 'tomate', 'Tomate', 200, 'g'),
  ('ensaladas_verduras_071', 2, 'huevos', 'Huevo', 2, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_071', 3, 'cebolla', 'Cebolla', 40, 'g'),
  ('ensaladas_verduras_071', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_071', 5, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('ensaladas_verduras_072', 0, 'patata', 'Patata', 400, 'g'),
  ('ensaladas_verduras_072', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('ensaladas_verduras_072', 2, 'atun-lata', 'Atún en conserva', 160, 'g'),
  ('ensaladas_verduras_072', 3, 'cebolla', 'Cebolla', 40, 'g'),
  ('ensaladas_verduras_072', 4, 'aceitunas', 'Aceitunas', 40, 'g'),
  ('ensaladas_verduras_072', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_072', 6, 'vinagre', 'Vinagre de vino', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_073', 0, 'pepino', 'Pepino', 400, 'g'),
  ('ensaladas_verduras_073', 1, 'yogur', 'Yogur griego natural', 200, 'g'),
  ('ensaladas_verduras_073', 2, 'menta', 'Menta fresca', 10, 'g'),
  ('ensaladas_verduras_073', 3, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_073', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_074', 0, 'naranja', 'Naranja', 300, 'g'),
  ('ensaladas_verduras_074', 1, 'hinojo', 'Hinojo', 200, 'g'),
  ('ensaladas_verduras_074', 2, 'aceitunas-negras', 'Aceitunas negras', 60, 'g'),
  ('ensaladas_verduras_074', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_075', 0, 'alcachofa-conserva', 'Corazones de alcachofa', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_075', 1, 'jamon', 'Jamón serrano en virutas', 80, 'g'),
  ('ensaladas_verduras_075', 2, 'aceite-oliva', 'Aceite de oliva', 120, 'ml'),
  ('ensaladas_verduras_075', 3, 'ajo', 'Ajo', 20, 'g'),
  ('ensaladas_verduras_075', 4, 'tomillo', 'Tomillo fresco', 5, 'g'),
  ('ensaladas_verduras_075', 5, 'limon', 'Limón', 15, 'ml'),
  ('ensaladas_verduras_076', 0, 'aguacate', 'Aguacate', 200, 'g'),
  ('ensaladas_verduras_076', 1, 'tomate', 'Tomate', 200, 'g'),
  ('ensaladas_verduras_076', 2, 'maiz', 'Maíz dulce cocido', 160, 'g'),
  ('ensaladas_verduras_076', 3, 'cebolla-morada', 'Cebolla roja', 40, 'g'),
  ('ensaladas_verduras_076', 4, 'cilantro', 'Cilantro fresco', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_076', 5, 'lima', 'Lima', 30, 'ml'),
  ('ensaladas_verduras_076', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_077', 0, 'col', 'Col kale', 150, 'g'),
  ('ensaladas_verduras_077', 1, 'manzana', 'Manzana', 150, 'g'),
  ('ensaladas_verduras_077', 2, 'nueces', 'Nueces', 30, 'g'),
  ('ensaladas_verduras_077', 3, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('ensaladas_verduras_077', 4, 'limon', 'Zumo de limón', 20, 'ml'),
  ('ensaladas_verduras_077', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('ensaladas_verduras_077', 6, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_077', 7, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_078', 0, 'esparragos-blancos', 'Espárragos blancos en conserva', 300, 'g'),
  ('ensaladas_verduras_078', 1, 'salmon-ahumado', 'Salmón ahumado', 100, 'g'),
  ('ensaladas_verduras_078', 2, 'rucula', 'Rúcula', 40, 'g'),
  ('ensaladas_verduras_078', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('ensaladas_verduras_078', 4, 'limon', 'Zumo de limón', 15, 'ml'),
  ('ensaladas_verduras_078', 5, 'mostaza', 'Mostaza de Dijon', 5, 'g'),
  ('ensaladas_verduras_078', 6, 'eneldo', 'Eneldo fresco', 5, 'g'),
  ('ensaladas_verduras_078', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_079', 0, 'coliflor', 'Coliflor', 500, 'g'),
  ('ensaladas_verduras_079', 1, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_079', 2, 'comino', 'Comino molido', 3, 'g'),
  ('ensaladas_verduras_079', 3, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('ensaladas_verduras_079', 4, 'tahini', 'Tahini', 40, 'g'),
  ('ensaladas_verduras_079', 5, 'limon', 'Zumo de limón', 20, 'ml'),
  ('ensaladas_verduras_079', 6, 'agua', 'Agua', 20, 'ml'),
  ('ensaladas_verduras_079', 7, 'ajo', 'Ajo', 5, 'g'),
  ('ensaladas_verduras_079', 8, 'perejil', 'Perejil fresco', 5, 'g'),
  ('ensaladas_verduras_079', 9, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_080', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('ensaladas_verduras_080', 1, 'atun-lata', 'Atún en conserva', 160, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_080', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('ensaladas_verduras_080', 3, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('ensaladas_verduras_080', 4, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('ensaladas_verduras_080', 5, 'tomate', 'Tomate', 100, 'g'),
  ('ensaladas_verduras_080', 6, 'aceitunas-negras', 'Aceitunas negras', 30, 'g'),
  ('ensaladas_verduras_080', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_080', 8, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('ensaladas_verduras_080', 9, 'perejil', 'Perejil fresco', 5, 'g'),
  ('ensaladas_verduras_080', 10, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_081', 0, 'fusilli', 'Fusilli', 140, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_081', 1, 'tomate-cherry', 'Tomate cherry', 150, 'g'),
  ('ensaladas_verduras_081', 2, 'pepino', 'Pepino', 100, 'g'),
  ('ensaladas_verduras_081', 3, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('ensaladas_verduras_081', 4, 'aceitunas-negras', 'Aceitunas negras', 30, 'g'),
  ('ensaladas_verduras_081', 5, 'mozzarella', 'Mozzarella (bocconcini)', 80, 'g'),
  ('ensaladas_verduras_081', 6, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('ensaladas_verduras_081', 7, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('ensaladas_verduras_081', 8, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_081', 9, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_082', 0, 'melon', 'Melón', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_082', 1, 'jamon', 'Jamón serrano', 80, 'g'),
  ('ensaladas_verduras_082', 2, 'rucula', 'Rúcula', 40, 'g'),
  ('ensaladas_verduras_082', 3, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('ensaladas_verduras_082', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_082', 5, 'vinagre-balsamico', 'Reducción de vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_083', 0, 'endivia', 'Endivias', 300, 'g'),
  ('ensaladas_verduras_083', 1, 'roquefort', 'Queso roquefort', 60, 'g'),
  ('ensaladas_verduras_083', 2, 'nueces', 'Nueces', 40, 'g'),
  ('ensaladas_verduras_083', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_083', 4, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_083', 5, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_083', 6, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_084', 0, 'langostinos', 'Langostinos pelados', 200, 'g'),
  ('ensaladas_verduras_084', 1, 'aguacate', 'Aguacate', 200, 'g'),
  ('ensaladas_verduras_084', 2, 'mayonesa', 'Mayonesa', 40, 'g'),
  ('ensaladas_verduras_084', 3, 'curry', 'Curry en polvo', 5, 'g'),
  ('ensaladas_verduras_084', 4, 'limon', 'Zumo de limón', 15, 'ml'),
  ('ensaladas_verduras_084', 5, 'lechuga', 'Canónigos', 60, 'g'),
  ('ensaladas_verduras_084', 6, 'tomate-cherry', 'Tomate cherry', 60, 'g'),
  ('ensaladas_verduras_084', 7, 'aceite-oliva', 'Aceite de oliva', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_084', 8, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_085', 0, 'remolacha', 'Remolacha cocida', 250, 'g'),
  ('ensaladas_verduras_085', 1, 'naranja', 'Naranja', 300, 'g'),
  ('ensaladas_verduras_085', 2, 'aceitunas-negras', 'Aceitunas negras', 40, 'g'),
  ('ensaladas_verduras_085', 3, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('ensaladas_verduras_085', 4, 'rucula', 'Rúcula', 40, 'g'),
  ('ensaladas_verduras_085', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('ensaladas_verduras_085', 6, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('ensaladas_verduras_085', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_086', 0, 'tomate-cherry', 'Tomate cherry', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_086', 1, 'mozzarella', 'Mozzarella fresca', 150, 'g'),
  ('ensaladas_verduras_086', 2, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('ensaladas_verduras_086', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('ensaladas_verduras_086', 4, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('ensaladas_verduras_086', 5, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_087', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 250, 'g'),
  ('ensaladas_verduras_087', 1, 'mango', 'Mango', 200, 'g'),
  ('ensaladas_verduras_087', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('ensaladas_verduras_087', 3, 'hojas-verdes', 'Mezclum de lechugas', 80, 'g'),
  ('ensaladas_verduras_087', 4, 'cebolla-morada', 'Cebolla morada', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_087', 5, 'lima', 'Zumo de lima', 20, 'ml'),
  ('ensaladas_verduras_087', 6, 'salsa-soja', 'Salsa de soja', 15, 'ml'),
  ('ensaladas_verduras_087', 7, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_087', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_087', 9, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_088', 0, 'burrata', 'Burrata', 200, 'g'),
  ('ensaladas_verduras_088', 1, 'rucula', 'Rúcula', 40, 'g'),
  ('ensaladas_verduras_088', 2, 'miel', 'Miel', 20, 'g'),
  ('ensaladas_verduras_088', 3, 'pistacho', 'Pistachos', 30, 'g'),
  ('ensaladas_verduras_088', 4, 'guindilla', 'Guindilla fresca', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_088', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('ensaladas_verduras_088', 6, 'sal-escamas', 'Sal en escamas', 2, 'g'),
  ('ensaladas_verduras_089', 0, 'orzo', 'Orzo', 130, 'g'),
  ('ensaladas_verduras_089', 1, 'queso-feta', 'Queso feta', 80, 'g'),
  ('ensaladas_verduras_089', 2, 'pepino', 'Pepino', 150, 'g'),
  ('ensaladas_verduras_089', 3, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('ensaladas_verduras_089', 4, 'aceitunas-negras', 'Aceitunas negras (kalamata)', 40, 'g'),
  ('ensaladas_verduras_089', 5, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('ensaladas_verduras_089', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('ensaladas_verduras_089', 7, 'limon', 'Zumo de limón', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_089', 8, 'oregano', 'Orégano seco', 2, 'g'),
  ('ensaladas_verduras_089', 9, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_090', 0, 'berenjena', 'Berenjena', 600, 'g'),
  ('ensaladas_verduras_090', 1, 'harina', 'Harina', 60, 'g'),
  ('ensaladas_verduras_090', 2, 'huevos', 'Huevo', 100, 'g'),
  ('ensaladas_verduras_090', 3, 'pan-rallado', 'Pan rallado', 80, 'g'),
  ('ensaladas_verduras_090', 4, 'tomate-frito', 'Salsa de tomate', 400, 'g'),
  ('ensaladas_verduras_090', 5, 'mozzarella', 'Mozzarella rallada', 200, 'g'),
  ('ensaladas_verduras_090', 6, 'parmesano', 'Queso parmesano rallado', 60, 'g'),
  ('ensaladas_verduras_090', 7, 'albahaca', 'Albahaca fresca', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_090', 8, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('ensaladas_verduras_090', 9, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_091', 0, 'calabacin', 'Calabacín', 200, 'g'),
  ('ensaladas_verduras_091', 1, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('ensaladas_verduras_091', 2, 'pimiento-verde', 'Pimiento verde', 100, 'g'),
  ('ensaladas_verduras_091', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('ensaladas_verduras_091', 4, 'tomate', 'Tomate maduro', 200, 'g'),
  ('ensaladas_verduras_091', 5, 'ajo', 'Ajo', 8, 'g'),
  ('ensaladas_verduras_091', 6, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_091', 7, 'huevos', 'Huevo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_091', 8, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_092', 0, 'coliflor', 'Coliflor entera', 1000, 'g'),
  ('ensaladas_verduras_092', 1, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('ensaladas_verduras_092', 2, 'comino', 'Comino molido', 5, 'g'),
  ('ensaladas_verduras_092', 3, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('ensaladas_verduras_092', 4, 'curcuma', 'Cúrcuma', 3, 'g'),
  ('ensaladas_verduras_092', 5, 'tahini', 'Tahini', 60, 'g'),
  ('ensaladas_verduras_092', 6, 'limon', 'Zumo de limón', 30, 'ml'),
  ('ensaladas_verduras_092', 7, 'agua', 'Agua', 40, 'ml'),
  ('ensaladas_verduras_092', 8, 'ajo', 'Ajo', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_092', 9, 'granada', 'Granada (arilos)', 100, 'g'),
  ('ensaladas_verduras_092', 10, 'perejil', 'Perejil fresco', 10, 'g'),
  ('ensaladas_verduras_092', 11, 'sal', 'Sal', 5, 'g'),
  ('ensaladas_verduras_093', 0, 'calabacin', 'Calabacín', 400, 'g'),
  ('ensaladas_verduras_093', 1, 'quinoa', 'Quinoa', 80, 'g'),
  ('ensaladas_verduras_093', 2, 'pimiento-rojo', 'Pimiento rojo', 50, 'g'),
  ('ensaladas_verduras_093', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('ensaladas_verduras_093', 4, 'tomate', 'Tomate', 80, 'g'),
  ('ensaladas_verduras_093', 5, 'maiz', 'Maíz dulce', 40, 'g'),
  ('ensaladas_verduras_093', 6, 'queso', 'Queso rallado', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_093', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_093', 8, 'ajo', 'Ajo', 5, 'g'),
  ('ensaladas_verduras_093', 9, 'oregano', 'Orégano seco', 2, 'g'),
  ('ensaladas_verduras_093', 10, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_094', 0, 'setas', 'Setas (champiñones portobello)', 400, 'g'),
  ('ensaladas_verduras_094', 1, 'ajo', 'Ajo', 15, 'g'),
  ('ensaladas_verduras_094', 2, 'perejil', 'Perejil fresco', 10, 'g'),
  ('ensaladas_verduras_094', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 30, 'ml'),
  ('ensaladas_verduras_094', 4, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_095', 0, 'esparragos', 'Espárragos trigueros', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_095', 1, 'tomate', 'Tomate', 100, 'g'),
  ('ensaladas_verduras_095', 2, 'pimiento-choricero', 'Pimiento choricero (pulpa)', 20, 'g'),
  ('ensaladas_verduras_095', 3, 'almendras', 'Almendras', 30, 'g'),
  ('ensaladas_verduras_095', 4, 'avellanas', 'Avellanas', 20, 'g'),
  ('ensaladas_verduras_095', 5, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_095', 6, 'pan', 'Pan frito', 20, 'g'),
  ('ensaladas_verduras_095', 7, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('ensaladas_verduras_095', 8, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 55, 'ml'),
  ('ensaladas_verduras_095', 9, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_096', 0, 'repollo', 'Repollo', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_096', 1, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('ensaladas_verduras_096', 2, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_096', 3, 'miso', 'Miso', 20, 'g'),
  ('ensaladas_verduras_096', 4, 'salsa-soja', 'Salsa de soja', 15, 'ml'),
  ('ensaladas_verduras_096', 5, 'sesamo', 'Sésamo tostado', 10, 'g'),
  ('ensaladas_verduras_096', 6, 'jengibre', 'Jengibre fresco', 8, 'g'),
  ('ensaladas_verduras_096', 7, 'ajo', 'Ajo', 8, 'g'),
  ('ensaladas_verduras_096', 8, 'agua', 'Agua', 40, 'ml'),
  ('ensaladas_verduras_097', 0, 'zanahoria', 'Zanahoria', 400, 'g'),
  ('ensaladas_verduras_097', 1, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_097', 2, 'comino', 'Comino molido', 3, 'g'),
  ('ensaladas_verduras_097', 3, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_097', 4, 'yogur', 'Yogur griego', 100, 'g'),
  ('ensaladas_verduras_097', 5, 'ajo', 'Ajo', 5, 'g'),
  ('ensaladas_verduras_097', 6, 'limon', 'Zumo de limón', 10, 'ml'),
  ('ensaladas_verduras_097', 7, 'perejil', 'Perejil fresco', 5, 'g'),
  ('ensaladas_verduras_097', 8, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_098', 0, 'puerro', 'Puerro', 400, 'g'),
  ('ensaladas_verduras_098', 1, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('ensaladas_verduras_098', 2, 'mostaza', 'Mostaza de Dijon', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_098', 3, 'vinagre-de-jerez', 'Vinagre de jerez', 15, 'ml'),
  ('ensaladas_verduras_098', 4, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_098', 5, 'perejil', 'Perejil fresco', 5, 'g'),
  ('ensaladas_verduras_099', 0, 'calabaza', 'Calabaza', 400, 'g'),
  ('ensaladas_verduras_099', 1, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_099', 2, 'comino', 'Comino molido', 3, 'g'),
  ('ensaladas_verduras_099', 3, 'canela', 'Canela molida', 1, 'g'),
  ('ensaladas_verduras_099', 4, 'tahini', 'Tahini', 30, 'g'),
  ('ensaladas_verduras_099', 5, 'limon', 'Zumo de limón', 15, 'ml'),
  ('ensaladas_verduras_099', 6, 'agua', 'Agua', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_099', 7, 'granada', 'Granada (arilos)', 50, 'g'),
  ('ensaladas_verduras_099', 8, 'perejil', 'Perejil fresco', 5, 'g'),
  ('ensaladas_verduras_099', 9, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_100', 0, 'berenjena', 'Berenjena', 400, 'g'),
  ('ensaladas_verduras_100', 1, 'miso', 'Miso blanco', 40, 'g'),
  ('ensaladas_verduras_100', 2, 'mirin', 'Mirin', 30, 'ml'),
  ('ensaladas_verduras_100', 3, 'azucar-moreno', 'Azúcar moreno', 15, 'g'),
  ('ensaladas_verduras_100', 4, 'aceite-de-sesamo', 'Aceite de sésamo', 15, 'ml'),
  ('ensaladas_verduras_100', 5, 'sesamo', 'Semillas de sésamo', 8, 'g'),
  ('ensaladas_verduras_100', 6, 'cebolleta', 'Cebolleta', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_101', 0, 'coles-de-bruselas', 'Coles de Bruselas', 400, 'g'),
  ('ensaladas_verduras_101', 1, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_101', 2, 'miel', 'Miel', 30, 'g'),
  ('ensaladas_verduras_101', 3, 'guindilla', 'Guindilla en copos', 2, 'g'),
  ('ensaladas_verduras_101', 4, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_101', 5, 'limon', 'Zumo de limón', 15, 'ml'),
  ('ensaladas_verduras_101', 6, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_102', 0, 'alcachofa', 'Alcachofas', 4, 'ud'),
  ('ensaladas_verduras_102', 1, 'aceite-oliva', 'Aceite de oliva', 300, 'ml'),
  ('ensaladas_verduras_102', 2, 'limon', 'Limón', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_102', 3, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_102', 4, 'perejil', 'Perejil', 5, 'g'),
  ('ensaladas_verduras_103', 0, 'tomate', 'Tomates grandes', 4, 'ud'),
  ('ensaladas_verduras_103', 1, 'arroz', 'Arroz', 80, 'g'),
  ('ensaladas_verduras_103', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('ensaladas_verduras_103', 3, 'calabacin', 'Calabacín', 60, 'g'),
  ('ensaladas_verduras_103', 4, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('ensaladas_verduras_103', 5, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_103', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_103', 7, 'queso', 'Queso rallado', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_103', 8, 'perejil', 'Perejil', 5, 'g'),
  ('ensaladas_verduras_103', 9, 'caldo-de-verduras', 'Caldo de verduras', 100, 'ml'),
  ('ensaladas_verduras_104', 0, 'champinon', 'Champiñones portobello', 4, 'ud'),
  ('ensaladas_verduras_104', 1, 'queso-cabra', 'Queso de cabra', 100, 'g'),
  ('ensaladas_verduras_104', 2, 'pan-rallado', 'Pan rallado', 30, 'g'),
  ('ensaladas_verduras_104', 3, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_104', 4, 'perejil', 'Perejil', 5, 'g'),
  ('ensaladas_verduras_104', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_104', 6, 'jamon', 'Jamón serrano', 60, 'g'),
  ('ensaladas_verduras_104', 7, 'queso', 'Queso rallado', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_105', 0, 'brocoli', 'Brócoli', 400, 'g'),
  ('ensaladas_verduras_105', 1, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_105', 2, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_105', 3, 'ajo', 'Ajo negro', 20, 'g'),
  ('ensaladas_verduras_105', 4, 'limon', 'Zumo de limón', 10, 'ml'),
  ('ensaladas_verduras_105', 5, 'almendras', 'Almendras laminadas', 20, 'g'),
  ('ensaladas_verduras_105', 6, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_106', 0, 'berenjena', 'Berenjena', 300, 'g'),
  ('ensaladas_verduras_106', 1, 'pimiento-rojo', 'Pimiento rojo', 300, 'g'),
  ('ensaladas_verduras_106', 2, 'cebolla', 'Cebolla', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_106', 3, 'anchoa-en-aceite', 'Anchoas en aceite', 40, 'g'),
  ('ensaladas_verduras_106', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 30, 'ml'),
  ('ensaladas_verduras_106', 5, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_106', 6, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_107', 0, 'espinacas', 'Espinacas frescas', 300, 'g'),
  ('ensaladas_verduras_107', 1, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('ensaladas_verduras_107', 2, 'pan', 'Pan', 30, 'g'),
  ('ensaladas_verduras_107', 3, 'ajo', 'Ajo', 15, 'g'),
  ('ensaladas_verduras_107', 4, 'comino', 'Comino', 2, 'g'),
  ('ensaladas_verduras_107', 5, 'pimenton', 'Pimentón', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_107', 6, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_107', 7, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('ensaladas_verduras_108', 0, 'pimientos-del-piquillo', 'Pimientos del piquillo', 8, 'ud'),
  ('ensaladas_verduras_108', 1, 'bacalao', 'Bacalao desalado', 200, 'g'),
  ('ensaladas_verduras_108', 2, 'patata', 'Patata', 150, 'g'),
  ('ensaladas_verduras_108', 3, 'leche', 'Leche', 100, 'ml'),
  ('ensaladas_verduras_108', 4, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('ensaladas_verduras_108', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_108', 6, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_108', 7, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_109', 0, 'calabacin', 'Calabacín', 400, 'g'),
  ('ensaladas_verduras_109', 1, 'queso-feta', 'Queso feta', 100, 'g'),
  ('ensaladas_verduras_109', 2, 'menta', 'Menta fresca', 8, 'g'),
  ('ensaladas_verduras_109', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_109', 4, 'limon', 'Zumo de limón', 10, 'ml'),
  ('ensaladas_verduras_109', 5, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_109', 6, 'pimienta', 'Pimienta', 1, 'g'),
  ('ensaladas_verduras_110', 0, 'remolacha', 'Remolacha', 400, 'g'),
  ('ensaladas_verduras_110', 1, 'rucula', 'Rúcula', 40, 'g'),
  ('ensaladas_verduras_110', 2, 'queso-cabra', 'Queso de cabra', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_110', 3, 'avellanas', 'Avellanas tostadas', 30, 'g'),
  ('ensaladas_verduras_110', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_110', 5, 'vinagre-balsamico', 'Vinagre balsámico', 15, 'ml'),
  ('ensaladas_verduras_110', 6, 'miel', 'Miel', 10, 'g'),
  ('ensaladas_verduras_111', 0, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('ensaladas_verduras_111', 1, 'brocoli', 'Brócoli', 150, 'g'),
  ('ensaladas_verduras_111', 2, 'calabacin', 'Calabacín', 150, 'g'),
  ('ensaladas_verduras_111', 3, 'judia-verde', 'Judías verdes', 100, 'g'),
  ('ensaladas_verduras_111', 4, 'naranja', 'Zumo de naranja', 60, 'ml'),
  ('ensaladas_verduras_111', 5, 'limon', 'Zumo de limón', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_111', 6, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('ensaladas_verduras_111', 7, 'mostaza', 'Mostaza', 5, 'g'),
  ('ensaladas_verduras_111', 8, 'miel', 'Miel', 5, 'g'),
  ('ensaladas_verduras_112', 0, 'endivia', 'Endivias', 4, 'ud'),
  ('ensaladas_verduras_112', 1, 'naranja', 'Naranja', 150, 'g'),
  ('ensaladas_verduras_112', 2, 'nueces', 'Nueces', 30, 'g'),
  ('ensaladas_verduras_112', 3, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('ensaladas_verduras_112', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('ensaladas_verduras_112', 5, 'azucar', 'Azúcar', 10, 'g'),
  ('ensaladas_verduras_112', 6, 'sal', 'Sal', 1, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_113', 0, 'setas', 'Setas variadas', 400, 'g'),
  ('ensaladas_verduras_113', 1, 'ajo', 'Ajo', 30, 'g'),
  ('ensaladas_verduras_113', 2, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('ensaladas_verduras_113', 3, 'guindilla', 'Guindilla', 2, 'g'),
  ('ensaladas_verduras_113', 4, 'perejil', 'Perejil', 10, 'g'),
  ('ensaladas_verduras_113', 5, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_114', 0, 'calabaza', 'Calabaza', 800, 'g'),
  ('ensaladas_verduras_114', 1, 'arroz', 'Arroz', 100, 'g'),
  ('ensaladas_verduras_114', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('ensaladas_verduras_114', 3, 'calabacin', 'Calabacín', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_114', 4, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('ensaladas_verduras_114', 5, 'champinon', 'Champiñones', 80, 'g'),
  ('ensaladas_verduras_114', 6, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_114', 7, 'caldo-de-verduras', 'Caldo de verduras', 150, 'ml'),
  ('ensaladas_verduras_114', 8, 'queso', 'Queso rallado', 40, 'g'),
  ('ensaladas_verduras_114', 9, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_114', 10, 'perejil', 'Perejil', 5, 'g'),
  ('ensaladas_verduras_115', 0, 'berenjena', 'Berenjena', 150, 'g'),
  ('ensaladas_verduras_115', 1, 'calabacin', 'Calabacín', 150, 'g'),
  ('ensaladas_verduras_115', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_115', 3, 'tomate', 'Tomate', 150, 'g'),
  ('ensaladas_verduras_115', 4, 'queso-cabra', 'Queso de cabra', 150, 'g'),
  ('ensaladas_verduras_115', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_115', 6, 'oregano', 'Orégano', 2, 'g'),
  ('ensaladas_verduras_115', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_115', 8, 'pimienta', 'Pimienta', 1, 'g'),
  ('ensaladas_verduras_116', 0, 'berenjena', 'Berenjena', 300, 'g'),
  ('ensaladas_verduras_116', 1, 'tomate', 'Tomate', 250, 'g'),
  ('ensaladas_verduras_116', 2, 'mozzarella', 'Mozzarella fresca', 200, 'g'),
  ('ensaladas_verduras_116', 3, 'albahaca', 'Albahaca fresca', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_116', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('ensaladas_verduras_116', 5, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_116', 6, 'pimienta', 'Pimienta', 1, 'g'),
  ('ensaladas_verduras_117', 0, 'perdiz', 'Perdiz', 2, 'ud'),
  ('ensaladas_verduras_117', 1, 'vino-blanco', 'Vino blanco', 100, 'ml'),
  ('ensaladas_verduras_117', 2, 'vinagre', 'Vinagre de vino', 100, 'ml'),
  ('ensaladas_verduras_117', 3, 'aceite-oliva', 'Aceite de oliva', 150, 'ml'),
  ('ensaladas_verduras_117', 4, 'ajo', 'Ajo', 20, 'g'),
  ('ensaladas_verduras_117', 5, 'laurel', 'Laurel', 2, 'g'),
  ('ensaladas_verduras_117', 6, 'zanahoria', 'Zanahoria', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_117', 7, 'cebolla', 'Cebolla', 80, 'g'),
  ('ensaladas_verduras_117', 8, 'hojas-verdes', 'Hojas verdes variadas', 100, 'g'),
  ('ensaladas_verduras_117', 9, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_118', 0, 'boletus', 'Boletus', 200, 'g'),
  ('ensaladas_verduras_118', 1, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('ensaladas_verduras_118', 2, 'harina', 'Harina', 60, 'g'),
  ('ensaladas_verduras_118', 3, 'leche', 'Leche', 400, 'ml'),
  ('ensaladas_verduras_118', 4, 'cebolla', 'Cebolla', 40, 'g'),
  ('ensaladas_verduras_118', 5, 'ajo', 'Ajo', 10, 'g'),
  ('ensaladas_verduras_118', 6, 'huevos', 'Huevo', 2, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_118', 7, 'pan-rallado', 'Pan rallado', 100, 'g'),
  ('ensaladas_verduras_118', 8, 'aceite-oliva', 'Aceite de oliva', 300, 'ml'),
  ('ensaladas_verduras_118', 9, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('ensaladas_verduras_118', 10, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_119', 0, 'berenjena', 'Berenjena', 800, 'g'),
  ('ensaladas_verduras_119', 1, 'carne-picada', 'Carne picada de ternera', 500, 'g'),
  ('ensaladas_verduras_119', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('ensaladas_verduras_119', 3, 'ajo', 'Ajo', 20, 'g'),
  ('ensaladas_verduras_119', 4, 'tomate-triturado', 'Tomate triturado', 500, 'g'),
  ('ensaladas_verduras_119', 5, 'vino-tinto', 'Vino tinto', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_119', 6, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('ensaladas_verduras_119', 7, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('ensaladas_verduras_119', 8, 'harina', 'Harina', 50, 'g'),
  ('ensaladas_verduras_119', 9, 'leche', 'Leche', 600, 'ml'),
  ('ensaladas_verduras_119', 10, 'queso', 'Queso rallado', 100, 'g'),
  ('ensaladas_verduras_119', 11, 'canela', 'Canela', 2, 'g'),
  ('ensaladas_verduras_119', 12, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('ensaladas_verduras_119', 13, 'sal', 'Sal', 4, 'g'),
  ('ensaladas_verduras_119', 14, 'pimienta', 'Pimienta', 2, 'g'),
  ('ensaladas_verduras_120', 0, 'harina', 'Harina de fuerza', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_120', 1, 'agua', 'Agua', 150, 'ml'),
  ('ensaladas_verduras_120', 2, 'levadura', 'Levadura fresca', 5, 'g'),
  ('ensaladas_verduras_120', 3, 'sal', 'Sal', 5, 'g'),
  ('ensaladas_verduras_120', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_120', 5, 'tomate-triturado', 'Tomate triturado', 150, 'g'),
  ('ensaladas_verduras_120', 6, 'burrata', 'Burrata', 200, 'g'),
  ('ensaladas_verduras_120', 7, 'rucula', 'Rúcula', 40, 'g'),
  ('ensaladas_verduras_120', 8, 'parmesano', 'Parmesano', 20, 'g'),
  ('ensaladas_verduras_120', 9, 'oregano', 'Orégano', 2, 'g'),
  ('ensaladas_verduras_121', 0, 'masa-quebrada', 'Masa quebrada', 230, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_121', 1, 'calabacin', 'Calabacín', 300, 'g'),
  ('ensaladas_verduras_121', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('ensaladas_verduras_121', 3, 'queso-feta', 'Queso feta', 150, 'g'),
  ('ensaladas_verduras_121', 4, 'huevos', 'Huevo', 3, 'ud'),
  ('ensaladas_verduras_121', 5, 'nata', 'Nata para cocinar', 150, 'ml'),
  ('ensaladas_verduras_121', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('ensaladas_verduras_121', 7, 'eneldo', 'Eneldo', 3, 'g'),
  ('ensaladas_verduras_121', 8, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_121', 9, 'pimienta', 'Pimienta', 1, 'g'),
  ('ensaladas_verduras_122', 0, 'aguacate', 'Aguacate', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_122', 1, 'pepino', 'Pepino', 100, 'g'),
  ('ensaladas_verduras_122', 2, 'cebolleta', 'Cebolleta', 20, 'g'),
  ('ensaladas_verduras_122', 3, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('ensaladas_verduras_122', 4, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('ensaladas_verduras_122', 5, 'sesamo', 'Semillas de sésamo tostado', 10, 'g'),
  ('ensaladas_verduras_122', 6, 'lima', 'Zumo de lima', 20, 'ml'),
  ('ensaladas_verduras_123', 0, 'espinacas', 'Espinaca fresca', 400, 'g'),
  ('ensaladas_verduras_123', 1, 'mantequilla', 'Mantequilla', 25, 'g'),
  ('ensaladas_verduras_123', 2, 'harina', 'Harina', 25, 'g'),
  ('ensaladas_verduras_123', 3, 'leche', 'Leche', 300, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_123', 4, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('ensaladas_verduras_123', 5, 'queso', 'Queso rallado', 30, 'g'),
  ('ensaladas_verduras_123', 6, 'sal', 'Sal', 3, 'g'),
  ('ensaladas_verduras_123', 7, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('ensaladas_verduras_124', 0, 'maiz', 'Maíz', 250, 'g'),
  ('ensaladas_verduras_124', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('ensaladas_verduras_124', 2, 'tomate-cherry', 'Tomate cherry', 150, 'g'),
  ('ensaladas_verduras_124', 3, 'cebolla-morada', 'Cebolla morada', 50, 'g'),
  ('ensaladas_verduras_124', 4, 'lima', 'Lima', 1, 'ud'),
  ('ensaladas_verduras_124', 5, 'cilantro', 'Cilantro fresco', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('ensaladas_verduras_124', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('ensaladas_verduras_124', 7, 'sal', 'Sal', 2, 'g'),
  ('ensaladas_verduras_125', 0, 'col', 'Col china', 300, 'g'),
  ('ensaladas_verduras_125', 1, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('ensaladas_verduras_125', 2, 'cebolleta', 'Cebolleta', 50, 'g'),
  ('ensaladas_verduras_125', 3, 'sesamo', 'Semillas de sésamo', 15, 'g'),
  ('ensaladas_verduras_125', 4, 'aceite-de-sesamo', 'Aceite de sésamo', 15, 'ml'),
  ('ensaladas_verduras_125', 5, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('ensaladas_verduras_125', 6, 'lima', 'Lima', 1, 'ud'),
  ('ensaladas_verduras_125', 7, 'miel', 'Miel', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_024', 0, 'patata', 'Patata', 400, 'g'),
  ('guarniciones_024', 1, 'leche', 'Leche entera', 100, 'ml'),
  ('guarniciones_024', 2, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('guarniciones_024', 3, 'nuez-moscada', 'Nuez moscada molida', 1, 'g'),
  ('guarniciones_024', 4, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_025', 0, 'boniato', 'Boniato', 400, 'g'),
  ('guarniciones_025', 1, 'miel', 'Miel', 20, 'g'),
  ('guarniciones_025', 2, 'tomillo', 'Tomillo fresco', 3, 'g'),
  ('guarniciones_025', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('guarniciones_025', 4, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_026', 0, 'coles-de-bruselas', 'Coles de Bruselas', 350, 'g'),
  ('guarniciones_026', 1, 'panceta', 'Panceta ahumada en taquitos', 60, 'g'),
  ('guarniciones_026', 2, 'vinagre-balsamico', 'Vinagre balsámico', 20, 'ml'),
  ('guarniciones_026', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('guarniciones_026', 4, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_027', 0, 'esparragos', 'Espárragos trigueros', 300, 'g'),
  ('guarniciones_027', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('guarniciones_027', 2, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('guarniciones_027', 3, 'vinagre', 'Vinagre', 15, 'ml'),
  ('guarniciones_027', 4, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_028', 0, 'patata', 'Patata', 400, 'g'),
  ('guarniciones_028', 1, 'cebolla', 'Cebolla', 100, 'g'),
  ('guarniciones_028', 2, 'caldo-de-verduras', 'Caldo de verduras', 150, 'ml'),
  ('guarniciones_028', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_028', 4, 'romero', 'Romero fresco', 3, 'g'),
  ('guarniciones_028', 5, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_029', 0, 'zanahoria', 'Zanahoria', 350, 'g'),
  ('guarniciones_029', 1, 'miel', 'Miel', 20, 'g'),
  ('guarniciones_029', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('guarniciones_029', 3, 'comino', 'Comino molido', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_029', 4, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_030', 0, 'champinon', 'Champiñones enteros', 400, 'g'),
  ('guarniciones_030', 1, 'ajo', 'Ajo', 15, 'g'),
  ('guarniciones_030', 2, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('guarniciones_030', 3, 'guindilla', 'Guindilla seca', 2, 'g'),
  ('guarniciones_030', 4, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('guarniciones_030', 5, 'perejil', 'Perejil fresco', 5, 'g'),
  ('guarniciones_030', 6, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_031', 0, 'coliflor', 'Coliflor', 500, 'g'),
  ('guarniciones_031', 1, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_031', 2, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_031', 3, 'perejil', 'Perejil fresco', 5, 'g'),
  ('guarniciones_031', 4, 'cebollino', 'Cebollino', 3, 'g'),
  ('guarniciones_031', 5, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_032', 0, 'alcachofa', 'Alcachofa', 4, 'ud'),
  ('guarniciones_032', 1, 'jamon', 'Jamón serrano en virutas', 40, 'g'),
  ('guarniciones_032', 2, 'aceite-oliva', 'Aceite de oliva', 200, 'ml'),
  ('guarniciones_032', 3, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_032', 4, 'laurel', 'Laurel', 1, 'ud'),
  ('guarniciones_032', 5, 'limon', 'Limón', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_032', 6, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_033', 0, 'setas', 'Setas variadas', 350, 'g'),
  ('guarniciones_033', 1, 'jamon', 'Jamón ibérico en taquitos', 50, 'g'),
  ('guarniciones_033', 2, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_033', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_033', 4, 'perejil', 'Perejil fresco', 5, 'g'),
  ('guarniciones_033', 5, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_034', 0, 'puerro', 'Puerro', 4, 'ud'),
  ('guarniciones_034', 1, 'tomate', 'Tomate maduro', 50, 'g'),
  ('guarniciones_034', 2, 'pimiento-choricero', 'Pimiento choricero', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_034', 3, 'almendras', 'Almendra tostada', 20, 'g'),
  ('guarniciones_034', 4, 'avellanas', 'Avellana tostada', 10, 'g'),
  ('guarniciones_034', 5, 'pan', 'Pan frito', 15, 'g'),
  ('guarniciones_034', 6, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_034', 7, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('guarniciones_034', 8, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('guarniciones_034', 9, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_035', 0, 'calabaza', 'Calabaza', 400, 'g'),
  ('guarniciones_035', 1, 'queso-cabra', 'Queso de cabra', 80, 'g'),
  ('guarniciones_035', 2, 'nueces', 'Nuez', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_035', 3, 'miel', 'Miel', 15, 'g'),
  ('guarniciones_035', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('guarniciones_035', 5, 'tomillo', 'Tomillo fresco', 2, 'g'),
  ('guarniciones_035', 6, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_036', 0, 'patata', 'Patata', 400, 'g'),
  ('guarniciones_036', 1, 'aceite-oliva', 'Aceite de oliva', 300, 'ml'),
  ('guarniciones_036', 2, 'tomate-triturado', 'Tomate triturado', 100, 'g'),
  ('guarniciones_036', 3, 'pimenton', 'Pimentón picante', 5, 'g'),
  ('guarniciones_036', 4, 'guindilla', 'Cayena molida', 1, 'g'),
  ('guarniciones_036', 5, 'ajo', 'Ajo', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_036', 6, 'huevos', 'Huevo', 1, 'ud'),
  ('guarniciones_036', 7, 'limon', 'Limón', 10, 'ml'),
  ('guarniciones_036', 8, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_037', 0, 'espinacas', 'Espinacas frescas', 400, 'g'),
  ('guarniciones_037', 1, 'pinones', 'Piñones', 25, 'g'),
  ('guarniciones_037', 2, 'pasas', 'Pasas', 25, 'g'),
  ('guarniciones_037', 3, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_037', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_037', 5, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_038', 0, 'patata', 'Patata', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_038', 1, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('guarniciones_038', 2, 'queso', 'Queso rallado', 50, 'g'),
  ('guarniciones_038', 3, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_038', 4, 'tomillo', 'Tomillo fresco', 2, 'g'),
  ('guarniciones_038', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('guarniciones_038', 6, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_039', 0, 'patata', 'Patata', 400, 'g'),
  ('guarniciones_039', 1, 'aceite-oliva', 'Aceite de oliva', 350, 'ml'),
  ('guarniciones_039', 2, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_040', 0, 'patata', 'Patata', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_040', 1, 'aceite-oliva', 'Aceite de oliva', 350, 'ml'),
  ('guarniciones_040', 2, 'parmesano', 'Parmesano rallado', 30, 'g'),
  ('guarniciones_040', 3, 'ajo', 'Ajo', 5, 'g'),
  ('guarniciones_040', 4, 'perejil', 'Perejil fresco', 5, 'g'),
  ('guarniciones_040', 5, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_041', 0, 'patata', 'Patata', 500, 'g'),
  ('guarniciones_041', 1, 'nata', 'Nata para cocinar', 200, 'ml'),
  ('guarniciones_041', 2, 'leche', 'Leche entera', 100, 'ml'),
  ('guarniciones_041', 3, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_041', 4, 'queso', 'Queso gruyere rallado', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_041', 5, 'nuez-moscada', 'Nuez moscada molida', 1, 'g'),
  ('guarniciones_041', 6, 'mantequilla', 'Mantequilla', 10, 'g'),
  ('guarniciones_041', 7, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_042', 0, 'coliflor', 'Coliflor', 500, 'g'),
  ('guarniciones_042', 1, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('guarniciones_042', 2, 'harina', 'Harina de trigo', 20, 'g'),
  ('guarniciones_042', 3, 'leche', 'Leche entera', 250, 'ml'),
  ('guarniciones_042', 4, 'queso', 'Queso rallado', 40, 'g'),
  ('guarniciones_042', 5, 'nuez-moscada', 'Nuez moscada molida', 1, 'g'),
  ('guarniciones_042', 6, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_043', 0, 'endivia', 'Endivia', 4, 'ud'),
  ('guarniciones_043', 1, 'jamon-york', 'Jamón cocido', 4, 'ud'),
  ('guarniciones_043', 2, 'mantequilla', 'Mantequilla', 25, 'g'),
  ('guarniciones_043', 3, 'harina', 'Harina de trigo', 20, 'g'),
  ('guarniciones_043', 4, 'leche', 'Leche entera', 300, 'ml'),
  ('guarniciones_043', 5, 'queso', 'Queso rallado', 40, 'g'),
  ('guarniciones_043', 6, 'nuez-moscada', 'Nuez moscada molida', 1, 'g'),
  ('guarniciones_043', 7, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_044', 0, 'boniato', 'Boniato', 450, 'g'),
  ('guarniciones_044', 1, 'mantequilla', 'Mantequilla', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_044', 2, 'canela', 'Canela molida', 2, 'g'),
  ('guarniciones_044', 3, 'leche', 'Leche entera', 50, 'ml'),
  ('guarniciones_044', 4, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_045', 0, 'patata', 'Patata', 350, 'g'),
  ('guarniciones_045', 1, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_045', 2, 'ajo', 'Ajo', 12, 'g'),
  ('guarniciones_045', 3, 'romero', 'Romero fresco', 3, 'g'),
  ('guarniciones_045', 4, 'sal', 'Sal', 4, 'g'),
  ('guarniciones_045', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('guarniciones_046', 0, 'patata', 'Patata', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_046', 1, 'mostaza', 'Mostaza de Dijon', 20, 'g'),
  ('guarniciones_046', 2, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('guarniciones_046', 3, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('guarniciones_046', 4, 'cebolleta', 'Cebolleta', 30, 'g'),
  ('guarniciones_046', 5, 'perejil', 'Perejil fresco', 5, 'g'),
  ('guarniciones_046', 6, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_046', 7, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('guarniciones_047', 0, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('guarniciones_047', 1, 'calabacin', 'Calabacín', 150, 'g'),
  ('guarniciones_047', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_047', 3, 'cebolla', 'Cebolla', 100, 'g'),
  ('guarniciones_047', 4, 'miel', 'Miel', 20, 'g'),
  ('guarniciones_047', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_047', 6, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_047', 7, 'tomillo', 'Tomillo fresco', 2, 'g'),
  ('guarniciones_048', 0, 'pimiento-verde', 'Pimiento de padrón', 300, 'g'),
  ('guarniciones_048', 1, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('guarniciones_048', 2, 'sal-escamas', 'Sal en escamas', 3, 'g'),
  ('guarniciones_049', 0, 'berenjena', 'Berenjena', 300, 'g'),
  ('guarniciones_049', 1, 'harina', 'Harina', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_049', 2, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('guarniciones_049', 3, 'miel', 'Miel de caña', 30, 'g'),
  ('guarniciones_049', 4, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_050', 0, 'guisantes', 'Guisantes congelados', 300, 'g'),
  ('guarniciones_050', 1, 'menta', 'Menta fresca', 5, 'g'),
  ('guarniciones_050', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('guarniciones_050', 3, 'nata', 'Nata líquida', 30, 'ml'),
  ('guarniciones_050', 4, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_050', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('guarniciones_051', 0, 'cebolla', 'Cebolla', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_051', 1, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_051', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('guarniciones_051', 3, 'azucar', 'Azúcar', 10, 'g'),
  ('guarniciones_051', 4, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_052', 0, 'boniato', 'Boniato', 350, 'g'),
  ('guarniciones_052', 1, 'aceite-oliva', 'Aceite de oliva', 70, 'ml'),
  ('guarniciones_052', 2, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_053', 0, 'esparragos-blancos', 'Espárragos blancos en conserva', 300, 'g'),
  ('guarniciones_053', 1, 'huevos', 'Huevo cocido', 50, 'g'),
  ('guarniciones_053', 2, 'aceite-oliva', 'Aceite de oliva', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_053', 3, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('guarniciones_053', 4, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_053', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('guarniciones_054', 0, 'judia-verde', 'Judía verde', 350, 'g'),
  ('guarniciones_054', 1, 'jamon', 'Jamón serrano', 60, 'g'),
  ('guarniciones_054', 2, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_054', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_054', 4, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_055', 0, 'calabaza', 'Calabaza', 400, 'g'),
  ('guarniciones_055', 1, 'jengibre', 'Jengibre fresco', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_055', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('guarniciones_055', 3, 'nata', 'Nata líquida', 30, 'ml'),
  ('guarniciones_055', 4, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_055', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('guarniciones_056', 0, 'calabacin', 'Calabacín', 400, 'g'),
  ('guarniciones_056', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('guarniciones_056', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('guarniciones_056', 3, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('guarniciones_056', 4, 'tomate', 'Tomate', 100, 'g'),
  ('guarniciones_056', 5, 'queso', 'Queso rallado', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_056', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_056', 7, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_056', 8, 'oregano', 'Orégano', 2, 'g'),
  ('guarniciones_057', 0, 'tomate', 'Tomate', 400, 'g'),
  ('guarniciones_057', 1, 'ajo', 'Ajo', 15, 'g'),
  ('guarniciones_057', 2, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('guarniciones_057', 3, 'tomillo', 'Tomillo fresco', 2, 'g'),
  ('guarniciones_057', 4, 'oregano', 'Orégano', 2, 'g'),
  ('guarniciones_057', 5, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_057', 6, 'pimienta', 'Pimienta negra', 1, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_058', 0, 'patata', 'Patata', 400, 'g'),
  ('guarniciones_058', 1, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('guarniciones_058', 2, 'huevos', 'Huevo', 60, 'g'),
  ('guarniciones_058', 3, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('guarniciones_058', 4, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_058', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('guarniciones_059', 0, 'champinon', 'Champiñón grande', 400, 'g'),
  ('guarniciones_059', 1, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_059', 2, 'pan-rallado', 'Pan rallado', 30, 'g'),
  ('guarniciones_059', 3, 'queso', 'Queso rallado', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_059', 4, 'perejil', 'Perejil fresco', 5, 'g'),
  ('guarniciones_059', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('guarniciones_059', 6, 'sal', 'Sal', 2, 'g'),
  ('guarniciones_060', 0, 'patata', 'Patata', 250, 'g'),
  ('guarniciones_060', 1, 'zanahoria', 'Zanahoria', 200, 'g'),
  ('guarniciones_060', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('guarniciones_060', 3, 'leche', 'Leche', 60, 'ml'),
  ('guarniciones_060', 4, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_060', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('guarniciones_061', 0, 'pimiento-rojo', 'Pimiento rojo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_061', 1, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('guarniciones_061', 2, 'calabacin', 'Calabacín', 100, 'g'),
  ('guarniciones_061', 3, 'brocoli', 'Brócoli', 100, 'g'),
  ('guarniciones_061', 4, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('guarniciones_061', 5, 'ajo', 'Ajo', 10, 'g'),
  ('guarniciones_061', 6, 'jengibre', 'Jengibre fresco', 5, 'g'),
  ('guarniciones_061', 7, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('guarniciones_061', 8, 'sesamo', 'Sésamo tostado', 5, 'g'),
  ('guarniciones_062', 0, 'boniato', 'Boniato', 350, 'g'),
  ('guarniciones_062', 1, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('guarniciones_062', 2, 'sal', 'Sal', 3, 'g'),
  ('guarniciones_062', 3, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('guarniciones_063', 0, 'patata', 'Patata baby', 450, 'g'),
  ('guarniciones_063', 1, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('guarniciones_063', 2, 'ajo', 'Ajo', 12, 'g'),
  ('guarniciones_063', 3, 'romero', 'Romero fresco', 3, 'g'),
  ('guarniciones_063', 4, 'sal', 'Sal', 4, 'g'),
  ('guarniciones_063', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('huevos_001', 0, 'patata', 'Patata', 300, 'g'),
  ('huevos_001', 1, 'huevos', 'Huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_001', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('huevos_001', 3, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('huevos_002', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_002', 1, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_003', 0, 'patata', 'Patata', 300, 'g'),
  ('huevos_003', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_003', 2, 'jamon', 'Jamón serrano', 60, 'g'),
  ('huevos_003', 3, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('huevos_004', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_004', 1, 'champinon', 'Champiñones', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_004', 2, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_004', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_004', 4, 'perejil', 'Perejil', 5, 'g'),
  ('huevos_005', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_005', 1, 'ajetes-tiernos', 'Ajetes tiernos', 100, 'g'),
  ('huevos_005', 2, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_005', 3, 'gambas', 'Gambas', 80, 'g'),
  ('huevos_006', 0, 'calabacin', 'Calabacín', 250, 'g'),
  ('huevos_006', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_006', 2, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_006', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_007', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_007', 1, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('huevos_008', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_008', 1, 'esparragos', 'Espárragos trigueros', 200, 'g'),
  ('huevos_008', 2, 'ajo', 'Ajo', 6, 'g'),
  ('huevos_008', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_009', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_009', 1, 'jamon', 'Jamón serrano', 40, 'g'),
  ('huevos_009', 2, 'tomate-triturado', 'Tomate triturado', 120, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_009', 3, 'guisantes', 'Guisantes', 60, 'g'),
  ('huevos_009', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_009', 5, 'chorizo', 'Chorizo', 30, 'g'),
  ('huevos_010', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_010', 1, 'atun-lata', 'Atún en conserva', 80, 'g'),
  ('huevos_010', 2, 'mayonesa', 'Mayonesa', 40, 'g'),
  ('huevos_010', 3, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('huevos_010', 4, 'pimiento-verde', 'Pimiento morrón', 30, 'g'),
  ('huevos_011', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_011', 1, 'gambas', 'Gambas peladas', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_011', 2, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_011', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_011', 4, 'perejil', 'Perejil', 5, 'g'),
  ('huevos_012', 0, 'espinacas', 'Espinacas frescas', 200, 'g'),
  ('huevos_012', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_012', 2, 'ajo', 'Ajo', 6, 'g'),
  ('huevos_012', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_013', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_013', 1, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('huevos_013', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_013', 3, 'guisantes', 'Guisantes', 60, 'g'),
  ('huevos_013', 4, 'jamon', 'Jamón serrano', 40, 'g'),
  ('huevos_013', 5, 'chorizo', 'Chorizo', 40, 'g'),
  ('huevos_013', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_013', 7, 'cebolla', 'Cebolla', 50, 'g'),
  ('huevos_014', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_014', 1, 'lechuga', 'Lechuga', 100, 'g'),
  ('huevos_014', 2, 'tomate', 'Tomate', 120, 'g'),
  ('huevos_014', 3, 'pepino', 'Pepino', 80, 'g'),
  ('huevos_014', 4, 'aceitunas', 'Aceitunas', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_014', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_014', 6, 'vinagre', 'Vinagre', 10, 'ml'),
  ('huevos_015', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_015', 1, 'setas', 'Setas variadas', 200, 'g'),
  ('huevos_015', 2, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_015', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_015', 4, 'perejil', 'Perejil', 5, 'g'),
  ('huevos_017', 0, 'calabacin', 'Calabacín', 180, 'g'),
  ('huevos_017', 1, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('huevos_017', 2, 'pimiento-verde', 'Pimiento verde', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_017', 3, 'cebolla', 'Cebolla', 70, 'g'),
  ('huevos_017', 4, 'tomate', 'Tomate maduro', 180, 'g'),
  ('huevos_017', 5, 'patata', 'Patata', 300, 'g'),
  ('huevos_017', 6, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_017', 7, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('huevos_017', 8, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_018', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_018', 1, 'espinacas', 'Espinacas frescas', 80, 'g'),
  ('huevos_018', 2, 'queso', 'Queso rallado', 60, 'g'),
  ('huevos_018', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_019', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_019', 1, 'gambas', 'Gambas peladas congeladas', 200, 'g'),
  ('huevos_019', 2, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_019', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_019', 4, 'perejil', 'Perejil', 5, 'g'),
  ('huevos_020', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_020', 1, 'salmon-ahumado', 'Salmón ahumado', 100, 'g'),
  ('huevos_020', 2, 'nata', 'Nata para cocinar', 30, 'ml'),
  ('huevos_020', 3, 'cebollino', 'Cebollino', 5, 'g'),
  ('huevos_020', 4, 'mantequilla', 'Mantequilla', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_021', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_021', 1, 'jamon-york', 'Jamón cocido', 80, 'g'),
  ('huevos_021', 2, 'queso', 'Queso curado', 30, 'g'),
  ('huevos_021', 3, 'aguacate', 'Aguacate', 150, 'g'),
  ('huevos_021', 4, 'tomate', 'Tomate', 150, 'g'),
  ('huevos_021', 5, 'cebollino', 'Cebollino', 5, 'g'),
  ('huevos_021', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_021', 7, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('huevos_022', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_022', 1, 'queso-cabra', 'Queso de cabra', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_022', 2, 'espinacas', 'Espinacas frescas', 60, 'g'),
  ('huevos_022', 3, 'tomate', 'Tomate', 200, 'g'),
  ('huevos_022', 4, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('huevos_022', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_022', 6, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('huevos_023', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_023', 1, 'jamon', 'Jamón serrano', 60, 'g'),
  ('huevos_023', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('huevos_023', 3, 'tomate', 'Tomate', 150, 'g'),
  ('huevos_023', 4, 'albahaca', 'Albahaca fresca', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_023', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('huevos_023', 6, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('huevos_024', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_024', 1, 'gambas', 'Gambas peladas', 200, 'g'),
  ('huevos_024', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('huevos_024', 3, 'mango', 'Mango', 150, 'g'),
  ('huevos_024', 4, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('huevos_024', 5, 'lima', 'Lima', 1, 'ud'),
  ('huevos_024', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_025', 0, 'huevos', 'Huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_025', 1, 'queso-brie', 'Queso brie', 60, 'g'),
  ('huevos_025', 2, 'nueces', 'Nueces', 30, 'g'),
  ('huevos_025', 3, 'lechuga', 'Canónigos', 60, 'g'),
  ('huevos_025', 4, 'pera', 'Pera', 150, 'g'),
  ('huevos_025', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_025', 6, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('huevos_026', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_026', 1, 'bacon', 'Bacon en lonchas', 60, 'g'),
  ('huevos_026', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('huevos_026', 3, 'rucula', 'Rúcula', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_026', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_026', 5, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('huevos_027', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_027', 1, 'calabacin', 'Calabacín', 200, 'g'),
  ('huevos_027', 2, 'queso-feta', 'Queso feta', 60, 'g'),
  ('huevos_027', 3, 'tomate-cherry', 'Tomate cherry', 150, 'g'),
  ('huevos_027', 4, 'menta', 'Menta fresca', 8, 'g'),
  ('huevos_027', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_027', 6, 'vinagre', 'Vinagre de vino', 8, 'ml'),
  ('huevos_028', 0, 'huevos', 'Huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_028', 1, 'champinon', 'Champiñones', 150, 'g'),
  ('huevos_028', 2, 'rucula', 'Rúcula', 60, 'g'),
  ('huevos_028', 3, 'parmesano', 'Parmesano en virutas', 30, 'g'),
  ('huevos_028', 4, 'pinones', 'Piñones', 15, 'g'),
  ('huevos_028', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_028', 6, 'vinagre', 'Vinagre de vino', 8, 'ml'),
  ('huevos_029', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_029', 1, 'salmon-ahumado', 'Salmón ahumado', 100, 'g'),
  ('huevos_029', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('huevos_029', 3, 'eneldo', 'Eneldo fresco', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_029', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_029', 5, 'limon', 'Zumo de limón', 10, 'ml'),
  ('huevos_029', 6, 'mantequilla', 'Mantequilla', 10, 'g'),
  ('huevos_030', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_030', 1, 'muffin-ingle', 'Muffin inglés', 2, 'ud'),
  ('huevos_030', 2, 'jamon-york', 'Jamón cocido', 80, 'g'),
  ('huevos_030', 3, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('huevos_030', 4, 'limon', 'Zumo de limón', 15, 'ml'),
  ('huevos_030', 5, 'vinagre', 'Vinagre de vino', 15, 'ml'),
  ('huevos_031', 0, 'patata', 'Patata', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_031', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_031', 2, 'jamon', 'Jamón serrano', 70, 'g'),
  ('huevos_031', 3, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('huevos_032', 0, 'patata', 'Patata', 350, 'g'),
  ('huevos_032', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_032', 2, 'jamon', 'Jamón serrano', 50, 'g'),
  ('huevos_032', 3, 'foie', 'Foie mi-cuit', 80, 'g'),
  ('huevos_032', 4, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('huevos_032', 5, 'vino-blanco', 'Vino Pedro Ximénez', 20, 'ml'),
  ('huevos_033', 0, 'patata', 'Patata', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_033', 1, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_033', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('huevos_033', 3, 'queso', 'Queso curado', 80, 'g'),
  ('huevos_033', 4, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('huevos_034', 0, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_034', 1, 'boletus', 'Boletus', 200, 'g'),
  ('huevos_034', 2, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_034', 3, 'perejil', 'Perejil', 8, 'g'),
  ('huevos_034', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_035', 0, 'patata', 'Patata', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_035', 1, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_035', 2, 'cebolla', 'Cebolla', 200, 'g'),
  ('huevos_035', 3, 'azucar', 'Azúcar', 10, 'g'),
  ('huevos_035', 4, 'aceite-oliva', 'Aceite de oliva', 70, 'ml'),
  ('huevos_036', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_036', 1, 'setas', 'Setas silvestres variadas', 250, 'g'),
  ('huevos_036', 2, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_036', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_036', 4, 'perejil', 'Perejil', 6, 'g'),
  ('huevos_037', 0, 'huevos', 'Huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_037', 1, 'gambas', 'Gambas peladas', 180, 'g'),
  ('huevos_037', 2, 'ajete', 'Ajetes', 150, 'g'),
  ('huevos_037', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_038', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_038', 1, 'esparragos', 'Espárragos verdes', 300, 'g'),
  ('huevos_038', 2, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('huevos_038', 3, 'limon', 'Zumo de limón', 15, 'ml'),
  ('huevos_038', 4, 'vinagre', 'Vinagre de vino', 15, 'ml'),
  ('huevos_039', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_039', 1, 'jamon', 'Jamón serrano', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_039', 2, 'parmesano', 'Parmesano en virutas', 25, 'g'),
  ('huevos_039', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('huevos_040', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_040', 1, 'chorizo', 'Chorizo', 60, 'g'),
  ('huevos_040', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('huevos_040', 3, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('huevos_040', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('huevos_040', 5, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('huevos_040', 6, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_040', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_041', 0, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_041', 1, 'gambas', 'Gambas peladas', 150, 'g'),
  ('huevos_041', 2, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_041', 3, 'perejil', 'Perejil', 5, 'g'),
  ('huevos_041', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_042', 0, 'masa-quebrada', 'Masa quebrada', 200, 'g'),
  ('huevos_042', 1, 'panceta', 'Panceta ahumada', 100, 'g'),
  ('huevos_042', 2, 'huevos', 'Huevo', 3, 'ud'),
  ('huevos_042', 3, 'nata', 'Nata', 150, 'ml'),
  ('huevos_042', 4, 'queso', 'Queso gruyère rallado', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_043', 0, 'masa-quebrada', 'Masa quebrada', 200, 'g'),
  ('huevos_043', 1, 'puerro', 'Puerro', 200, 'g'),
  ('huevos_043', 2, 'queso-cabra', 'Queso de cabra', 80, 'g'),
  ('huevos_043', 3, 'huevos', 'Huevo', 3, 'ud'),
  ('huevos_043', 4, 'nata', 'Nata', 120, 'ml'),
  ('huevos_043', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_044', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_044', 1, 'salmon-ahumado', 'Salmón ahumado', 100, 'g'),
  ('huevos_044', 2, 'pan', 'Pan de masa madre', 120, 'g'),
  ('huevos_044', 3, 'vinagre', 'Vinagre', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_044', 4, 'eneldo', 'Eneldo fresco', 5, 'g'),
  ('huevos_044', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_045', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_045', 1, 'atun-lata', 'Atún en conserva', 160, 'g'),
  ('huevos_045', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('huevos_045', 3, 'harina', 'Harina', 15, 'g'),
  ('huevos_045', 4, 'leche', 'Leche', 150, 'ml'),
  ('huevos_045', 5, 'queso', 'Queso rallado', 40, 'g'),
  ('huevos_046', 0, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_046', 1, 'bacalao', 'Bacalao desalado desmigado', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_046', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('huevos_046', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('huevos_047', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_047', 1, 'champinon', 'Champiñones', 150, 'g'),
  ('huevos_047', 2, 'nata', 'Nata', 100, 'ml'),
  ('huevos_047', 3, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('huevos_047', 4, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_047', 5, 'perejil', 'Perejil', 5, 'g'),
  ('huevos_048', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_048', 1, 'mayonesa', 'Mayonesa', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_048', 2, 'mostaza', 'Mostaza', 5, 'g'),
  ('huevos_048', 3, 'cebollino', 'Cebollino', 5, 'g'),
  ('huevos_048', 4, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('huevos_049', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_049', 1, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('huevos_049', 2, 'harina', 'Harina', 30, 'g'),
  ('huevos_049', 3, 'leche', 'Leche', 250, 'ml'),
  ('huevos_049', 4, 'queso', 'Queso gruyère rallado', 100, 'g'),
  ('huevos_050', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_050', 1, 'jamon-york', 'Jamón cocido', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_050', 2, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('huevos_050', 3, 'harina', 'Harina', 20, 'g'),
  ('huevos_050', 4, 'leche', 'Leche', 300, 'ml'),
  ('huevos_050', 5, 'queso', 'Queso rallado', 50, 'g'),
  ('huevos_051', 0, 'patata', 'Patata', 200, 'g'),
  ('huevos_051', 1, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_051', 2, 'judia-verde', 'Judías verdes', 60, 'g'),
  ('huevos_051', 3, 'guisantes', 'Guisantes', 40, 'g'),
  ('huevos_051', 4, 'pimiento-rojo', 'Pimiento rojo', 50, 'g'),
  ('huevos_051', 5, 'jamon-york', 'Jamón cocido', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_051', 6, 'cebolla', 'Cebolla', 50, 'g'),
  ('huevos_051', 7, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('huevos_052', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_052', 1, 'yogur', 'Yogur griego', 200, 'g'),
  ('huevos_052', 2, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_052', 3, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('huevos_052', 4, 'pimenton', 'Pimentón dulce', 4, 'g'),
  ('huevos_052', 5, 'vinagre', 'Vinagre', 10, 'ml'),
  ('huevos_052', 6, 'pan', 'Pan', 100, 'g'),
  ('huevos_053', 0, 'huevos', 'Huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_053', 1, 'aguacate', 'Aguacate', 200, 'g'),
  ('huevos_053', 2, 'pan', 'Pan de masa madre', 120, 'g'),
  ('huevos_053', 3, 'limon', 'Zumo de limón', 10, 'ml'),
  ('huevos_053', 4, 'vinagre', 'Vinagre', 10, 'ml'),
  ('huevos_053', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_054', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_054', 1, 'jamon-york', 'Jamón cocido', 60, 'g'),
  ('huevos_054', 2, 'queso-en-lonchas', 'Queso en lonchas', 60, 'g'),
  ('huevos_054', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_055', 0, 'huevos', 'Huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_055', 1, 'patata', 'Patata', 300, 'g'),
  ('huevos_055', 2, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('huevos_055', 3, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('huevos_056', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_056', 1, 'morcilla', 'Morcilla de Burgos', 150, 'g'),
  ('huevos_056', 2, 'pinones', 'Piñones', 20, 'g'),
  ('huevos_056', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_057', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_057', 1, 'esparragos', 'Espárragos trigueros', 150, 'g'),
  ('huevos_057', 2, 'jamon', 'Jamón serrano', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_057', 3, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_057', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_058', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_058', 1, 'patata', 'Patata', 400, 'g'),
  ('huevos_058', 2, 'leche', 'Leche', 80, 'ml'),
  ('huevos_058', 3, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('huevos_058', 4, 'vinagre', 'Vinagre', 10, 'ml'),
  ('huevos_058', 5, 'cebollino', 'Cebollino', 5, 'g'),
  ('huevos_059', 0, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_059', 1, 'calabacin', 'Calabacín', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_059', 2, 'queso', 'Queso rallado', 60, 'g'),
  ('huevos_059', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('huevos_059', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_060', 0, 'huevos', 'Huevo', 8, 'ud'),
  ('huevos_060', 1, 'calabacin', 'Calabacín', 150, 'g'),
  ('huevos_060', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('huevos_060', 3, 'cebolla', 'Cebolla', 100, 'g'),
  ('huevos_060', 4, 'espinacas', 'Espinacas', 100, 'g'),
  ('huevos_060', 5, 'queso', 'Queso rallado', 80, 'g'),
  ('huevos_060', 6, 'leche', 'Leche', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_060', 7, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('huevos_061', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_061', 1, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('huevos_061', 2, 'mozzarella', 'Queso mozzarella rallado', 60, 'g'),
  ('huevos_061', 3, 'ajo', 'Ajo', 8, 'g'),
  ('huevos_061', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_061', 5, 'oregano', 'Orégano', 2, 'g'),
  ('huevos_062', 0, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_062', 1, 'espinacas', 'Espinacas frescas', 200, 'g'),
  ('huevos_062', 2, 'pinones', 'Piñones', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_062', 3, 'cebolla', 'Cebolla', 40, 'g'),
  ('huevos_062', 4, 'ajo', 'Ajo', 5, 'g'),
  ('huevos_062', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('huevos_063', 0, 'pan', 'Pan rústico', 100, 'g'),
  ('huevos_063', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_063', 2, 'jamon', 'Jamón ibérico en lonchas', 60, 'g'),
  ('huevos_063', 3, 'trufa-negra', 'Trufa negra fresca', 10, 'g'),
  ('huevos_063', 4, 'ajo', 'Ajo', 5, 'g'),
  ('huevos_063', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('huevos_063', 6, 'aceite-oliva', 'Aceite de trufa', 5, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_064', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_064', 1, 'tomate-triturado', 'Tomate triturado', 400, 'g'),
  ('huevos_064', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('huevos_064', 3, 'cebolla', 'Cebolla', 100, 'g'),
  ('huevos_064', 4, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_064', 5, 'comino', 'Comino molido', 3, 'g'),
  ('huevos_064', 6, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('huevos_064', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_064', 8, 'pan', 'Pan rústico', 80, 'g'),
  ('huevos_065', 0, 'huevos', 'Huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_065', 1, 'tortilla-de-maiz', 'Tortilla de maíz', 4, 'ud'),
  ('huevos_065', 2, 'tomate-triturado', 'Tomate triturado', 200, 'g'),
  ('huevos_065', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('huevos_065', 4, 'cayena', 'Chile jalapeño', 15, 'g'),
  ('huevos_065', 5, 'ajo', 'Ajo', 5, 'g'),
  ('huevos_065', 6, 'judia-negra', 'Judías negras cocidas', 100, 'g'),
  ('huevos_065', 7, 'queso', 'Queso rallado', 40, 'g'),
  ('huevos_065', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_065', 9, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('huevos_066', 0, 'patata', 'Patata', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_066', 1, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_066', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('huevos_066', 3, 'chorizo', 'Chorizo', 80, 'g'),
  ('huevos_066', 4, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('huevos_067', 0, 'arroz-arborio', 'Arroz arborio', 160, 'g'),
  ('huevos_067', 1, 'setas', 'Setas variadas', 200, 'g'),
  ('huevos_067', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('huevos_067', 3, 'ajo', 'Ajo', 5, 'g'),
  ('huevos_067', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('huevos_067', 5, 'caldo-de-verduras', 'Caldo de verduras', 600, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_067', 6, 'parmesano', 'Queso parmesano rallado', 30, 'g'),
  ('huevos_067', 7, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('huevos_067', 8, 'huevos', 'Huevo', 2, 'ud'),
  ('huevos_067', 9, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_068', 0, 'patata', 'Patata', 400, 'g'),
  ('huevos_068', 1, 'zanahoria', 'Zanahoria', 150, 'g'),
  ('huevos_068', 2, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_068', 3, 'gambas', 'Gambas peladas', 200, 'g'),
  ('huevos_068', 4, 'mayonesa', 'Mayonesa', 150, 'g'),
  ('huevos_068', 5, 'guisantes', 'Guisantes cocidos', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_068', 6, 'aceitunas', 'Aceitunas', 30, 'g'),
  ('huevos_069', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_069', 1, 'carne-de-txangurro', 'Carne de txangurro', 150, 'g'),
  ('huevos_069', 2, 'cebolla', 'Cebolla', 40, 'g'),
  ('huevos_069', 3, 'tomate-frito', 'Tomate frito', 50, 'g'),
  ('huevos_069', 4, 'brandy', 'Brandy', 10, 'ml'),
  ('huevos_069', 5, 'leche', 'Leche', 100, 'ml'),
  ('huevos_069', 6, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('huevos_069', 7, 'harina', 'Harina', 15, 'g'),
  ('huevos_069', 8, 'queso', 'Queso rallado', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_069', 9, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_070', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_070', 1, 'queso-azul', 'Queso azul', 60, 'g'),
  ('huevos_070', 2, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('huevos_070', 3, 'nueces', 'Nueces', 20, 'g'),
  ('huevos_070', 4, 'pan', 'Pan rústico', 100, 'g'),
  ('huevos_070', 5, 'vinagre', 'Vinagre', 10, 'ml'),
  ('huevos_071', 0, 'patata', 'Patata', 300, 'g'),
  ('huevos_071', 1, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_071', 2, 'pimiento-verde', 'Pimiento verde italiano', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_071', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('huevos_071', 4, 'aceite-oliva', 'Aceite de oliva', 55, 'ml'),
  ('huevos_072', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_072', 1, 'guisantes', 'Guisantes', 300, 'g'),
  ('huevos_072', 2, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('huevos_072', 3, 'menta', 'Menta fresca', 5, 'g'),
  ('huevos_072', 4, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('huevos_072', 5, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('huevos_072', 6, 'cebolleta', 'Cebolleta', 30, 'g'),
  ('huevos_072', 7, 'aceite-oliva', 'Aceite de oliva', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_072', 8, 'vinagre', 'Vinagre', 10, 'ml'),
  ('huevos_073', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_073', 1, 'setas', 'Setas variadas', 200, 'g'),
  ('huevos_073', 2, 'jamon', 'Jamón serrano en taquitos', 60, 'g'),
  ('huevos_073', 3, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('huevos_073', 4, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_073', 5, 'perejil', 'Perejil fresco', 5, 'g'),
  ('huevos_073', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_073', 7, 'pan', 'Pan rústico', 80, 'g'),
  ('huevos_074', 0, 'patata', 'Patata', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_074', 1, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_074', 2, 'pulpo', 'Pulpo cocido', 150, 'g'),
  ('huevos_074', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('huevos_074', 4, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('huevos_074', 5, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('huevos_075', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_075', 1, 'espinacas', 'Espinacas frescas', 300, 'g'),
  ('huevos_075', 2, 'leche', 'Leche', 250, 'ml'),
  ('huevos_075', 3, 'mantequilla', 'Mantequilla', 25, 'g'),
  ('huevos_075', 4, 'harina', 'Harina', 25, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_075', 5, 'queso', 'Queso rallado', 40, 'g'),
  ('huevos_075', 6, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('huevos_075', 7, 'ajo', 'Ajo', 5, 'g'),
  ('huevos_075', 8, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_076', 0, 'huevos', 'Huevo', 5, 'ud'),
  ('huevos_076', 1, 'bacalao', 'Bacalao desalado desmigado', 200, 'g'),
  ('huevos_076', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('huevos_076', 3, 'ajo', 'Ajo', 15, 'g'),
  ('huevos_076', 4, 'guindilla', 'Guindilla', 2, 'g'),
  ('huevos_076', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_076', 6, 'perejil', 'Perejil fresco', 5, 'g'),
  ('huevos_077', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_077', 1, 'espinacas', 'Espinacas frescas', 250, 'g'),
  ('huevos_077', 2, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('huevos_077', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('huevos_077', 4, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_077', 5, 'queso-feta', 'Queso feta', 60, 'g'),
  ('huevos_077', 6, 'comino', 'Comino molido', 2, 'g'),
  ('huevos_077', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_077', 8, 'pan', 'Pan rústico', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_078', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_078', 1, 'burrata', 'Burrata', 150, 'g'),
  ('huevos_078', 2, 'tomate-triturado', 'Tomate triturado', 300, 'g'),
  ('huevos_078', 3, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_078', 4, 'albahaca', 'Albahaca fresca', 5, 'g'),
  ('huevos_078', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_078', 6, 'pan', 'Pan rústico', 80, 'g'),
  ('huevos_079', 0, 'patata', 'Patata', 300, 'g'),
  ('huevos_079', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_079', 2, 'jamon', 'Jamón serrano en lonchas', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_079', 3, 'boletus', 'Boletus', 100, 'g'),
  ('huevos_079', 4, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('huevos_079', 5, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_079', 6, 'vino-blanco', 'Vino blanco', 20, 'ml'),
  ('huevos_079', 7, 'aceite-oliva', 'Aceite de oliva para freír', 400, 'ml'),
  ('huevos_079', 8, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_080', 0, 'patata', 'Patata', 300, 'g'),
  ('huevos_080', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_080', 2, 'jamon', 'Jamón serrano en lonchas', 80, 'g'),
  ('huevos_080', 3, 'aceite-oliva', 'Aceite de oliva para freír', 400, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_080', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_081', 0, 'masa-quebrada', 'Masa quebrada', 230, 'g'),
  ('huevos_081', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_081', 2, 'nata', 'Nata para cocinar', 200, 'ml'),
  ('huevos_081', 3, 'setas', 'Setas variadas', 250, 'g'),
  ('huevos_081', 4, 'queso-cabra', 'Queso de cabra', 120, 'g'),
  ('huevos_081', 5, 'cebolla', 'Cebolla', 80, 'g'),
  ('huevos_081', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('huevos_081', 7, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('huevos_082', 0, 'espinacas', 'Espinacas frescas', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_082', 1, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_082', 2, 'leche', 'Leche', 250, 'ml'),
  ('huevos_082', 3, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('huevos_082', 4, 'harina', 'Harina', 30, 'g'),
  ('huevos_082', 5, 'parmesano', 'Queso parmesano rallado', 50, 'g'),
  ('huevos_082', 6, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('huevos_082', 7, 'ajo', 'Ajo', 5, 'g'),
  ('huevos_083', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_083', 1, 'bacon', 'Bacon en tiras', 100, 'g'),
  ('huevos_083', 2, 'champinon', 'Champiñones', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_083', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('huevos_084', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_084', 1, 'esparragos', 'Espárragos trigueros', 250, 'g'),
  ('huevos_084', 2, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('huevos_084', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('huevos_085', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_085', 1, 'patata', 'Patatas', 350, 'g'),
  ('huevos_085', 2, 'chorizo', 'Chorizo', 120, 'g'),
  ('huevos_085', 3, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('huevos_086', 0, 'huevos', 'Huevo', 6, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_086', 1, 'jamon-york', 'Jamón cocido en tacos', 100, 'g'),
  ('huevos_086', 2, 'queso', 'Queso curado rallado', 60, 'g'),
  ('huevos_086', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_087', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_087', 1, 'chorizo', 'Chorizo', 120, 'g'),
  ('huevos_087', 2, 'pimiento-verde', 'Pimiento verde', 2, 'ud'),
  ('huevos_087', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('huevos_088', 0, 'huevos', 'Huevo', 6, 'ud'),
  ('huevos_088', 1, 'atun-lata', 'Atún en lata', 160, 'g'),
  ('huevos_088', 2, 'tomate', 'Tomate', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_088', 3, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('huevos_088', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('huevos_089', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('huevos_089', 1, 'salchicha', 'Salchichas frescas', 4, 'ud'),
  ('huevos_089', 2, 'patata', 'Patatas', 350, 'g'),
  ('huevos_089', 3, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('huevos_090', 0, 'pimiento-verde', 'Pimiento verde', 4, 'ud'),
  ('huevos_090', 1, 'queso-fresco', 'Queso fresco', 200, 'g'),
  ('huevos_090', 2, 'huevos', 'Huevo', 3, 'ud'),
  ('huevos_090', 3, 'harina', 'Harina', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('huevos_090', 4, 'tomate', 'Tomate maduro', 400, 'g'),
  ('huevos_090', 5, 'cebolla', 'Cebolla', 80, 'g'),
  ('huevos_090', 6, 'ajo', 'Ajo', 10, 'g'),
  ('huevos_090', 7, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('huevos_090', 8, 'sal', 'Sal', 3, 'g'),
  ('legumbres_001', 0, 'lentejas', 'Lentejas', 200, 'g'),
  ('legumbres_001', 1, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('legumbres_001', 2, 'patata', 'Patata', 150, 'g'),
  ('legumbres_001', 3, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('legumbres_001', 4, 'cebolla', 'Cebolla', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_001', 5, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('legumbres_001', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_001', 7, 'pimenton', 'Pimentón', 5, 'g'),
  ('legumbres_002', 0, 'lentejas', 'Lentejas', 200, 'g'),
  ('legumbres_002', 1, 'chorizo', 'Chorizo', 80, 'g'),
  ('legumbres_002', 2, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('legumbres_002', 3, 'patata', 'Patata', 120, 'g'),
  ('legumbres_002', 4, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_002', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_002', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_002', 7, 'pimenton', 'Pimentón', 5, 'g'),
  ('legumbres_003', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_003', 1, 'espinacas', 'Espinacas', 200, 'g'),
  ('legumbres_003', 2, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_003', 3, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_003', 4, 'pan', 'Pan del día anterior', 30, 'g'),
  ('legumbres_003', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_003', 6, 'pimenton', 'Pimentón', 4, 'g'),
  ('legumbres_003', 7, 'comino', 'Comino', 2, 'g'),
  ('legumbres_004', 0, 'garbanzos', 'Garbanzos', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_004', 1, 'morcillo-de-ternera', 'Morcillo de ternera', 150, 'g'),
  ('legumbres_004', 2, 'pollo', 'Pollo', 120, 'g'),
  ('legumbres_004', 3, 'tocino', 'Tocino', 50, 'g'),
  ('legumbres_004', 4, 'chorizo', 'Chorizo', 60, 'g'),
  ('legumbres_004', 5, 'patata', 'Patata', 150, 'g'),
  ('legumbres_004', 6, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('legumbres_004', 7, 'repollo', 'Repollo', 150, 'g'),
  ('legumbres_005', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_005', 1, 'bacalao', 'Bacalao desalado', 150, 'g'),
  ('legumbres_005', 2, 'espinacas', 'Espinacas', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_005', 3, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_005', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_005', 5, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_005', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_005', 7, 'pimenton', 'Pimentón', 5, 'g'),
  ('legumbres_006', 0, 'fabes', 'Fabes', 250, 'g'),
  ('legumbres_006', 1, 'chorizo', 'Chorizo', 80, 'g'),
  ('legumbres_006', 2, 'morcilla', 'Morcilla', 80, 'g'),
  ('legumbres_006', 3, 'panceta', 'Panceta', 80, 'g'),
  ('legumbres_006', 4, 'lacon', 'Lacón', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_006', 5, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_006', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_006', 7, 'azafran', 'Azafrán', 1, 'g'),
  ('legumbres_007', 0, 'alubias-rojas', 'Alubias rojas', 250, 'g'),
  ('legumbres_007', 1, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('legumbres_007', 2, 'puerro', 'Puerro', 80, 'g'),
  ('legumbres_007', 3, 'pimiento-verde', 'Pimiento verde', 70, 'g'),
  ('legumbres_007', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_007', 5, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_007', 6, 'aceite-oliva', 'Aceite de oliva', 18, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_007', 7, 'pimenton', 'Pimentón', 4, 'g'),
  ('legumbres_008', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_008', 1, 'chorizo', 'Chorizo', 80, 'g'),
  ('legumbres_008', 2, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_008', 3, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('legumbres_008', 4, 'pimiento-rojo', 'Pimiento rojo', 70, 'g'),
  ('legumbres_008', 5, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_008', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_008', 7, 'pimenton', 'Pimentón', 5, 'g'),
  ('legumbres_009', 0, 'lentejas', 'Lentejas', 160, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_009', 1, 'arroz', 'Arroz', 80, 'g'),
  ('legumbres_009', 2, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('legumbres_009', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_009', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_009', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_009', 6, 'pimenton', 'Pimentón', 4, 'g'),
  ('legumbres_009', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_010', 0, 'garbanzos', 'Garbanzos cocidos', 250, 'g'),
  ('legumbres_010', 1, 'tahini', 'Tahini', 30, 'g'),
  ('legumbres_010', 2, 'limon', 'Zumo de limón', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_010', 3, 'ajo', 'Ajo', 6, 'g'),
  ('legumbres_010', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_010', 5, 'comino', 'Comino', 2, 'g'),
  ('legumbres_010', 6, 'pimenton', 'Pimentón', 2, 'g'),
  ('legumbres_011', 0, 'alubia-grande', 'Judiones', 250, 'g'),
  ('legumbres_011', 1, 'chorizo', 'Chorizo', 60, 'g'),
  ('legumbres_011', 2, 'morcilla', 'Morcilla', 60, 'g'),
  ('legumbres_011', 3, 'oreja-de-cerdo', 'Oreja de cerdo', 80, 'g'),
  ('legumbres_011', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_011', 5, 'ajo', 'Ajo', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_011', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_011', 7, 'pimenton', 'Pimentón', 4, 'g'),
  ('legumbres_012', 0, 'lentejas', 'Lentejas cocidas', 300, 'g'),
  ('legumbres_012', 1, 'tomate', 'Tomate', 120, 'g'),
  ('legumbres_012', 2, 'cebolla-morada', 'Cebolla morada', 50, 'g'),
  ('legumbres_012', 3, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_012', 4, 'pepino', 'Pepino', 80, 'g'),
  ('legumbres_012', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_012', 6, 'vinagre', 'Vinagre', 10, 'ml'),
  ('legumbres_013', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_013', 1, 'calabaza', 'Calabaza', 200, 'g'),
  ('legumbres_013', 2, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_013', 3, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_013', 4, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_013', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_013', 6, 'comino', 'Comino', 3, 'g'),
  ('legumbres_013', 7, 'pimenton', 'Pimentón', 4, 'g'),
  ('legumbres_014', 0, 'judias-pintas', 'Judías pintas', 200, 'g'),
  ('legumbres_014', 1, 'arroz', 'Arroz', 80, 'g'),
  ('legumbres_014', 2, 'zanahoria', 'Zanahoria', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_014', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_014', 4, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_014', 5, 'aceite-oliva', 'Aceite de oliva', 18, 'ml'),
  ('legumbres_014', 6, 'pimenton', 'Pimentón', 4, 'g'),
  ('legumbres_014', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_015', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_015', 1, 'pimiento-rojo', 'Pimiento rojo asado', 120, 'g'),
  ('legumbres_015', 2, 'tomate', 'Tomate', 100, 'g'),
  ('legumbres_015', 3, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('legumbres_015', 4, 'comino', 'Comino', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_015', 5, 'perejil', 'Perejil', 5, 'g'),
  ('legumbres_015', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_015', 7, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('legumbres_016', 0, 'alubias', 'Alubias blancas', 250, 'g'),
  ('legumbres_016', 1, 'patata', 'Patata', 150, 'g'),
  ('legumbres_016', 2, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('legumbres_016', 3, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_016', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_016', 5, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_016', 6, 'aceite-oliva', 'Aceite de oliva', 18, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_016', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_017', 0, 'lentejas', 'Lentejas', 180, 'g'),
  ('legumbres_017', 1, 'contramuslos-de-pollo', 'Contramuslo de pollo', 200, 'g'),
  ('legumbres_017', 2, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('legumbres_017', 3, 'patata', 'Patata', 120, 'g'),
  ('legumbres_017', 4, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_017', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_017', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_017', 7, 'pimenton', 'Pimentón', 4, 'g'),
  ('legumbres_018', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_018', 1, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('legumbres_018', 2, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_018', 3, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_018', 4, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_018', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_018', 6, 'comino', 'Comino', 3, 'g'),
  ('legumbres_019', 0, 'alubias', 'Alubias blancas cocidas', 300, 'g'),
  ('legumbres_019', 1, 'almejas', 'Almejas', 200, 'g'),
  ('legumbres_019', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_019', 3, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_019', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('legumbres_019', 5, 'perejil', 'Perejil', 5, 'g'),
  ('legumbres_019', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_019', 7, 'harina', 'Harina', 10, 'g'),
  ('legumbres_020', 0, 'lentejas', 'Lentejas pardinas cocidas', 300, 'g'),
  ('legumbres_020', 1, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('legumbres_020', 2, 'calabacin', 'Calabacín', 100, 'g'),
  ('legumbres_020', 3, 'cebolla-morada', 'Cebolla morada', 50, 'g'),
  ('legumbres_020', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_020', 5, 'vinagre-balsamico', 'Vinagre de Módena', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_020', 6, 'mostaza', 'Mostaza', 5, 'g'),
  ('legumbres_021', 0, 'garbanzos', 'Garbanzos cocidos de bote', 300, 'g'),
  ('legumbres_021', 1, 'atun', 'Atún en aceite de oliva', 160, 'g'),
  ('legumbres_021', 2, 'pimiento-rojo', 'Pimiento rojo asado', 100, 'g'),
  ('legumbres_021', 3, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_021', 4, 'cebolleta', 'Cebolleta', 40, 'g'),
  ('legumbres_021', 5, 'aceitunas-negras', 'Aceitunas negras', 40, 'g'),
  ('legumbres_021', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_021', 7, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('legumbres_021', 8, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_022', 0, 'pan', 'Pan de pueblo', 160, 'g'),
  ('legumbres_022', 1, 'garbanzos', 'Garbanzos cocidos', 240, 'g'),
  ('legumbres_022', 2, 'tahini', 'Tahini', 25, 'g'),
  ('legumbres_022', 3, 'limon', 'Zumo de limón', 20, 'ml'),
  ('legumbres_022', 4, 'ajo', 'Ajo', 5, 'g'),
  ('legumbres_022', 5, 'comino', 'Comino molido', 2, 'g'),
  ('legumbres_022', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_022', 7, 'pepino', 'Pepino', 150, 'g'),
  ('legumbres_022', 8, 'sesamo', 'Sésamo tostado', 10, 'g'),
  ('legumbres_022', 9, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_023', 0, 'tortilla-de-trigo', 'Tortilla de trigo', 2, 'ud'),
  ('legumbres_023', 1, 'garbanzos', 'Garbanzos cocidos', 200, 'g'),
  ('legumbres_023', 2, 'tahini', 'Tahini', 20, 'g'),
  ('legumbres_023', 3, 'limon', 'Zumo de limón', 15, 'ml'),
  ('legumbres_023', 4, 'ajo', 'Ajo', 5, 'g'),
  ('legumbres_023', 5, 'comino', 'Comino molido', 2, 'g'),
  ('legumbres_023', 6, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('legumbres_023', 7, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('legumbres_023', 8, 'pepino', 'Pepino', 60, 'g'),
  ('legumbres_023', 9, 'lechuga', 'Lechuga', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_023', 10, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('legumbres_023', 11, 'sal', 'Sal', 2, 'g'),
  ('legumbres_024', 0, 'falafel-congelado', 'Falafel congelado', 200, 'g'),
  ('legumbres_024', 1, 'garbanzos', 'Garbanzos cocidos', 120, 'g'),
  ('legumbres_024', 2, 'tahini', 'Tahini', 10, 'g'),
  ('legumbres_024', 3, 'limon', 'Zumo de limón', 10, 'ml'),
  ('legumbres_024', 4, 'aceite-oliva', 'Aceite de oliva', 18, 'ml'),
  ('legumbres_024', 5, 'lechuga', 'Lechuga variada', 80, 'g'),
  ('legumbres_024', 6, 'tomate-cherry', 'Tomate cherry', 100, 'g'),
  ('legumbres_024', 7, 'pepino', 'Pepino', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_024', 8, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('legumbres_024', 9, 'comino', 'Comino molido', 2, 'g'),
  ('legumbres_024', 10, 'sal', 'Sal', 2, 'g'),
  ('legumbres_025', 0, 'lentejas', 'Lentejas pardinas', 200, 'g'),
  ('legumbres_025', 1, 'chorizo', 'Chorizo', 100, 'g'),
  ('legumbres_025', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('legumbres_025', 3, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_025', 4, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('legumbres_025', 5, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_025', 6, 'tomate-triturado', 'Tomate triturado', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_025', 7, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_025', 8, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_025', 9, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_025', 10, 'huevos', 'Huevo', 2, 'ud'),
  ('legumbres_025', 11, 'vinagre', 'Vinagre', 10, 'ml'),
  ('legumbres_026', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_026', 1, 'remolacha', 'Remolacha cocida', 150, 'g'),
  ('legumbres_026', 2, 'tahini', 'Tahini', 30, 'g'),
  ('legumbres_026', 3, 'limon', 'Zumo de limón', 20, 'ml'),
  ('legumbres_026', 4, 'ajo', 'Ajo', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_026', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_026', 6, 'comino', 'Comino molido', 2, 'g'),
  ('legumbres_026', 7, 'pinones', 'Piñones', 20, 'g'),
  ('legumbres_026', 8, 'sal', 'Sal', 2, 'g'),
  ('legumbres_027', 0, 'garbanzos', 'Garbanzos cocidos', 250, 'g'),
  ('legumbres_027', 1, 'aguacate', 'Aguacate', 150, 'g'),
  ('legumbres_027', 2, 'lima', 'Zumo de lima', 25, 'ml'),
  ('legumbres_027', 3, 'tahini', 'Tahini', 15, 'g'),
  ('legumbres_027', 4, 'ajo', 'Ajo', 5, 'g'),
  ('legumbres_027', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_027', 6, 'comino', 'Comino molido', 2, 'g'),
  ('legumbres_027', 7, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('legumbres_027', 8, 'sal', 'Sal', 2, 'g'),
  ('legumbres_028', 0, 'garbanzos', 'Garbanzos secos crudos (en remojo)', 200, 'g'),
  ('legumbres_028', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_028', 2, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_028', 3, 'perejil', 'Perejil fresco', 15, 'g'),
  ('legumbres_028', 4, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('legumbres_028', 5, 'comino', 'Comino molido', 5, 'g'),
  ('legumbres_028', 6, 'cilantro', 'Cilantro molido', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_028', 7, 'harina', 'Harina', 20, 'g'),
  ('legumbres_028', 8, 'levadura-quimica', 'Levadura química', 2, 'g'),
  ('legumbres_028', 9, 'sal', 'Sal', 3, 'g'),
  ('legumbres_028', 10, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('legumbres_028', 11, 'yogur', 'Yogur griego', 150, 'g'),
  ('legumbres_028', 12, 'tahini', 'Tahini', 20, 'g'),
  ('legumbres_028', 13, 'limon', 'Zumo de limón', 15, 'ml'),
  ('legumbres_028', 14, 'agua', 'Agua', 20, 'ml'),
  ('legumbres_029', 0, 'alubia-grande', 'Fabes de la granja secas', 200, 'g'),
  ('legumbres_029', 1, 'almejas', 'Almejas', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_029', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('legumbres_029', 3, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_029', 4, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('legumbres_029', 5, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('legumbres_029', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_029', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_029', 8, 'perejil', 'Perejil fresco', 10, 'g'),
  ('legumbres_029', 9, 'sal', 'Sal', 3, 'g'),
  ('legumbres_030', 0, 'lentejas', 'Lentejas pardinas', 200, 'g'),
  ('legumbres_030', 1, 'chorizo', 'Chorizo', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_030', 2, 'manzana', 'Manzana', 150, 'g'),
  ('legumbres_030', 3, 'cebolleta', 'Cebolleta', 40, 'g'),
  ('legumbres_030', 4, 'vinagre-de-jerez', 'Vinagre de jerez', 15, 'ml'),
  ('legumbres_030', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_030', 6, 'mostaza', 'Mostaza a la antigua', 10, 'g'),
  ('legumbres_030', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_030', 8, 'sal', 'Sal', 2, 'g'),
  ('legumbres_031', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g'),
  ('legumbres_031', 1, 'espinacas', 'Espinacas frescas', 200, 'g'),
  ('legumbres_031', 2, 'pinones', 'Piñones', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_031', 3, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_031', 4, 'comino', 'Comino molido', 5, 'g'),
  ('legumbres_031', 5, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('legumbres_031', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_031', 7, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('legumbres_031', 8, 'sal', 'Sal', 2, 'g'),
  ('legumbres_032', 0, 'lentejas-rojas', 'Lentejas rojas peladas', 180, 'g'),
  ('legumbres_032', 1, 'leche-coco', 'Leche de coco', 200, 'ml'),
  ('legumbres_032', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('legumbres_032', 3, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_032', 4, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('legumbres_032', 5, 'curry', 'Curry en polvo', 10, 'g'),
  ('legumbres_032', 6, 'curcuma', 'Cúrcuma', 3, 'g'),
  ('legumbres_032', 7, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_032', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_032', 9, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('legumbres_032', 10, 'sal', 'Sal', 2, 'g'),
  ('legumbres_033', 0, 'guisantes', 'Guisantes congelados', 250, 'g'),
  ('legumbres_033', 1, 'garbanzos', 'Garbanzos cocidos', 100, 'g'),
  ('legumbres_033', 2, 'tahini', 'Tahini', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_033', 3, 'limon', 'Zumo de limón', 20, 'ml'),
  ('legumbres_033', 4, 'menta', 'Menta fresca', 10, 'g'),
  ('legumbres_033', 5, 'ajo', 'Ajo', 5, 'g'),
  ('legumbres_033', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_033', 7, 'sal', 'Sal', 2, 'g'),
  ('legumbres_034', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g'),
  ('legumbres_034', 1, 'harina', 'Harina', 40, 'g'),
  ('legumbres_034', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('legumbres_034', 3, 'cebolleta', 'Cebolleta', 40, 'g'),
  ('legumbres_034', 4, 'perejil', 'Perejil fresco', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_034', 5, 'comino', 'Comino molido', 5, 'g'),
  ('legumbres_034', 6, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('legumbres_034', 7, 'levadura-quimica', 'Levadura química', 3, 'g'),
  ('legumbres_034', 8, 'sal', 'Sal', 2, 'g'),
  ('legumbres_034', 9, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('legumbres_034', 10, 'yogur', 'Yogur natural', 100, 'g'),
  ('legumbres_034', 11, 'menta', 'Menta fresca', 5, 'g'),
  ('legumbres_034', 12, 'ajo', 'Ajo', 3, 'g'),
  ('legumbres_035', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g'),
  ('legumbres_035', 1, 'chorizo', 'Chorizo', 90, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_035', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('legumbres_035', 3, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('legumbres_035', 4, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('legumbres_035', 5, 'perejil', 'Perejil fresco', 10, 'g'),
  ('legumbres_035', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_035', 7, 'vinagre-de-jerez', 'Vinagre de jerez', 12, 'ml'),
  ('legumbres_035', 8, 'sal', 'Sal', 2, 'g'),
  ('legumbres_036', 0, 'alubia-grande', 'Judiones secos', 250, 'g'),
  ('legumbres_036', 1, 'almejas', 'Almejas', 350, 'g'),
  ('legumbres_036', 2, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_036', 3, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_036', 4, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_036', 5, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('legumbres_036', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_036', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_036', 8, 'perejil', 'Perejil fresco', 10, 'g'),
  ('legumbres_036', 9, 'sal', 'Sal', 3, 'g'),
  ('legumbres_037', 0, 'lentejas', 'Lentejas pardinas', 200, 'g'),
  ('legumbres_037', 1, 'boletus', 'Boletus', 200, 'g'),
  ('legumbres_037', 2, 'cebolla', 'Cebolla', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_037', 3, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_037', 4, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('legumbres_037', 5, 'tomillo', 'Tomillo fresco', 5, 'g'),
  ('legumbres_037', 6, 'vino-blanco', 'Vino oloroso', 30, 'ml'),
  ('legumbres_037', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_037', 8, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_037', 9, 'sal', 'Sal', 2, 'g'),
  ('legumbres_038', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g'),
  ('legumbres_038', 1, 'espinacas', 'Espinacas frescas', 200, 'g'),
  ('legumbres_038', 2, 'pan', 'Pan del día anterior', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_038', 3, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_038', 4, 'comino', 'Comino molido', 5, 'g'),
  ('legumbres_038', 5, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('legumbres_038', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_038', 7, 'huevos', 'Huevo', 2, 'ud'),
  ('legumbres_038', 8, 'vinagre', 'Vinagre', 10, 'ml'),
  ('legumbres_038', 9, 'sal', 'Sal', 2, 'g'),
  ('legumbres_039', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g'),
  ('legumbres_039', 1, 'langostinos', 'Langostinos', 250, 'g'),
  ('legumbres_039', 2, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_039', 3, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_039', 4, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('legumbres_039', 5, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('legumbres_039', 6, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_039', 7, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('legumbres_039', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_039', 9, 'caldo-de-pescado', 'Caldo de pescado', 300, 'ml'),
  ('legumbres_039', 10, 'sal', 'Sal', 2, 'g'),
  ('legumbres_040', 0, 'alubia-grande', 'Fabes de la granja secas', 400, 'g'),
  ('legumbres_040', 1, 'chorizo', 'Chorizo asturiano', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_040', 2, 'morcilla', 'Morcilla asturiana', 150, 'g'),
  ('legumbres_040', 3, 'panceta', 'Panceta', 100, 'g'),
  ('legumbres_040', 4, 'cebolla', 'Cebolla', 100, 'g'),
  ('legumbres_040', 5, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_040', 6, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_040', 7, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('legumbres_040', 8, 'laurel', 'Laurel', 2, 'ud'),
  ('legumbres_040', 9, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_040', 10, 'sal', 'Sal', 3, 'g'),
  ('legumbres_041', 0, 'alubias', 'Alubias blancas secas', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_041', 1, 'costilla', 'Costilla de cerdo', 300, 'g'),
  ('legumbres_041', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('legumbres_041', 3, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_041', 4, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('legumbres_041', 5, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_041', 6, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_041', 7, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_041', 8, 'laurel', 'Laurel', 1, 'ud'),
  ('legumbres_041', 9, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_041', 10, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_042', 0, 'lentejas', 'Lentejas pardinas', 200, 'g'),
  ('legumbres_042', 1, 'castanas', 'Castañas cocidas', 150, 'g'),
  ('legumbres_042', 2, 'calabaza', 'Calabaza', 150, 'g'),
  ('legumbres_042', 3, 'puerro', 'Puerro', 80, 'g'),
  ('legumbres_042', 4, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('legumbres_042', 5, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_042', 6, 'tomillo', 'Tomillo fresco', 3, 'g'),
  ('legumbres_042', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_042', 8, 'caldo-de-verduras', 'Caldo de verduras', 300, 'ml'),
  ('legumbres_042', 9, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_043', 0, 'alubias', 'Alubias blancas cocidas de bote', 350, 'g'),
  ('legumbres_043', 1, 'atun', 'Atún en aceite de oliva', 160, 'g'),
  ('legumbres_043', 2, 'pimiento-rojo', 'Pimiento rojo asado', 100, 'g'),
  ('legumbres_043', 3, 'cebolleta', 'Cebolleta', 40, 'g'),
  ('legumbres_043', 4, 'aceitunas-negras', 'Aceitunas negras', 30, 'g'),
  ('legumbres_043', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_043', 6, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('legumbres_043', 7, 'perejil', 'Perejil fresco', 5, 'g'),
  ('legumbres_043', 8, 'sal', 'Sal', 2, 'g'),
  ('legumbres_044', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_044', 1, 'calamar', 'Calamar limpio', 300, 'g'),
  ('legumbres_044', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('legumbres_044', 3, 'ajo', 'Ajo', 15, 'g'),
  ('legumbres_044', 4, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_044', 5, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('legumbres_044', 6, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_044', 7, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('legumbres_044', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_044', 9, 'perejil', 'Perejil fresco', 5, 'g'),
  ('legumbres_044', 10, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_045', 0, 'garbanzos', 'Garbanzos cocidos', 250, 'g'),
  ('legumbres_045', 1, 'remolacha', 'Remolacha cocida', 150, 'g'),
  ('legumbres_045', 2, 'tahini', 'Tahini', 25, 'g'),
  ('legumbres_045', 3, 'limon', 'Zumo de limón', 15, 'ml'),
  ('legumbres_045', 4, 'ajo', 'Ajo', 6, 'g'),
  ('legumbres_045', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_045', 6, 'comino', 'Comino molido', 3, 'g'),
  ('legumbres_046', 0, 'alubias', 'Alubias blancas cocidas', 350, 'g'),
  ('legumbres_046', 1, 'bacalao', 'Bacalao desalado', 150, 'g'),
  ('legumbres_046', 2, 'espinacas', 'Espinacas', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_046', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('legumbres_046', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_046', 5, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_046', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_046', 7, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_047', 0, 'lentejas', 'Lentejas', 200, 'g'),
  ('legumbres_047', 1, 'calabaza', 'Calabaza', 250, 'g'),
  ('legumbres_047', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('legumbres_047', 3, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('legumbres_047', 4, 'tomate-triturado', 'Tomate triturado', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_047', 5, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_047', 6, 'aceite-oliva', 'Aceite de oliva', 18, 'ml'),
  ('legumbres_047', 7, 'comino', 'Comino molido', 3, 'g'),
  ('legumbres_048', 0, 'alubias', 'Alubias pintas', 200, 'g'),
  ('legumbres_048', 1, 'costilla', 'Costillas de cerdo', 300, 'g'),
  ('legumbres_048', 2, 'cebolla', 'Cebolla', 90, 'g'),
  ('legumbres_048', 3, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_048', 4, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('legumbres_048', 5, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_048', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_048', 7, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_048', 8, 'laurel', 'Hoja de laurel', 1, 'ud'),
  ('legumbres_049', 0, 'lentejas', 'Lentejas cocidas', 300, 'g'),
  ('legumbres_049', 1, 'salmon-ahumado', 'Salmón ahumado', 100, 'g'),
  ('legumbres_049', 2, 'cebolleta', 'Cebolleta', 40, 'g'),
  ('legumbres_049', 3, 'rucula', 'Rúcula', 40, 'g'),
  ('legumbres_049', 4, 'eneldo', 'Eneldo fresco', 5, 'g'),
  ('legumbres_049', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_049', 6, 'vinagre-de-manzana', 'Vinagre de manzana', 15, 'ml'),
  ('legumbres_050', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_050', 1, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('legumbres_050', 2, 'pimenton', 'Pimentón picante', 4, 'g'),
  ('legumbres_050', 3, 'comino', 'Comino molido', 3, 'g'),
  ('legumbres_050', 4, 'ajo-polvo', 'Ajo en polvo', 3, 'g'),
  ('legumbres_051', 0, 'judia-verde', 'Judías verdes', 300, 'g'),
  ('legumbres_051', 1, 'garbanzos', 'Garbanzos cocidos', 250, 'g'),
  ('legumbres_051', 2, 'jamon', 'Jamón serrano', 60, 'g'),
  ('legumbres_051', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_051', 4, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_051', 5, 'tomate-triturado', 'Tomate triturado', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_051', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_052', 0, 'alubias', 'Alubias blancas', 220, 'g'),
  ('legumbres_052', 1, 'butifarra', 'Butifarra', 150, 'g'),
  ('legumbres_052', 2, 'costilla', 'Costilla de cerdo', 150, 'g'),
  ('legumbres_052', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('legumbres_052', 4, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('legumbres_052', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_052', 6, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_052', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_052', 8, 'laurel', 'Hoja de laurel', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_053', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_053', 1, 'pulpo', 'Pulpo cocido', 200, 'g'),
  ('legumbres_053', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_053', 3, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_053', 4, 'pimenton', 'Pimentón dulce', 4, 'g'),
  ('legumbres_053', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_053', 6, 'perejil', 'Perejil fresco', 5, 'g'),
  ('legumbres_054', 0, 'lentejas', 'Lentejas', 200, 'g'),
  ('legumbres_054', 1, 'morcilla', 'Morcilla de Burgos', 150, 'g'),
  ('legumbres_054', 2, 'manzana', 'Manzana', 120, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_054', 3, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_054', 4, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('legumbres_054', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_054', 6, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('legumbres_055', 0, 'judia-blanca', 'Judías blancas', 200, 'g'),
  ('legumbres_055', 1, 'conejo', 'Conejo troceado', 300, 'g'),
  ('legumbres_055', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('legumbres_055', 3, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('legumbres_055', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_055', 5, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_055', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_055', 7, 'pimenton', 'Pimentón dulce', 4, 'g'),
  ('legumbres_055', 8, 'laurel', 'Hoja de laurel', 1, 'ud'),
  ('legumbres_056', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_056', 1, 'queso-feta', 'Queso feta', 80, 'g'),
  ('legumbres_056', 2, 'tomate-cherry', 'Tomates cherry', 100, 'g'),
  ('legumbres_056', 3, 'pepino', 'Pepino', 80, 'g'),
  ('legumbres_056', 4, 'cebolla-morada', 'Cebolla roja', 30, 'g'),
  ('legumbres_056', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('legumbres_056', 6, 'limon', 'Zumo de limón', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_056', 7, 'oregano', 'Orégano seco', 2, 'g'),
  ('legumbres_056', 8, 'comino', 'Comino molido', 3, 'g'),
  ('legumbres_057', 0, 'alubias', 'Alubias negras cocidas', 300, 'g'),
  ('legumbres_057', 1, 'arroz', 'Arroz blanco', 160, 'g'),
  ('legumbres_057', 2, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_057', 3, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_057', 4, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_057', 5, 'comino', 'Comino molido', 3, 'g'),
  ('legumbres_057', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_057', 7, 'laurel', 'Hoja de laurel', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_058', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g'),
  ('legumbres_058', 1, 'espinacas', 'Espinacas', 150, 'g'),
  ('legumbres_058', 2, 'leche-coco', 'Leche de coco', 150, 'ml'),
  ('legumbres_058', 3, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_058', 4, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_058', 5, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('legumbres_058', 6, 'curry', 'Curry en polvo', 8, 'g'),
  ('legumbres_058', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_058', 8, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('legumbres_059', 0, 'lentejas', 'Lentejas', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_059', 1, 'salchicha', 'Salchichas frescas', 150, 'g'),
  ('legumbres_059', 2, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_059', 3, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('legumbres_059', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('legumbres_059', 5, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_059', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_059', 7, 'pimenton', 'Pimentón dulce', 6, 'g'),
  ('legumbres_060', 0, 'garbanzos', 'Garbanzos cocidos', 250, 'g'),
  ('legumbres_060', 1, 'calabaza', 'Calabaza', 200, 'g'),
  ('legumbres_060', 2, 'tahini', 'Tahini', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_060', 3, 'limon', 'Zumo de limón', 15, 'ml'),
  ('legumbres_060', 4, 'ajo', 'Ajo', 6, 'g'),
  ('legumbres_060', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_060', 6, 'comino', 'Comino molido', 2, 'g'),
  ('legumbres_061', 0, 'alubias', 'Alubias blancas cocidas', 350, 'g'),
  ('legumbres_061', 1, 'setas', 'Setas variadas', 200, 'g'),
  ('legumbres_061', 2, 'cebolla', 'Cebolla', 70, 'g'),
  ('legumbres_061', 3, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_061', 4, 'romero', 'Romero fresco', 3, 'g'),
  ('legumbres_061', 5, 'vino-blanco', 'Vino blanco', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_061', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_061', 7, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('legumbres_062', 0, 'garbanzos', 'Garbanzos cocidos', 350, 'g'),
  ('legumbres_062', 1, 'chorizo', 'Chorizo', 100, 'g'),
  ('legumbres_062', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('legumbres_062', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_062', 4, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_062', 5, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('legumbres_062', 6, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('legumbres_062', 7, 'pimenton', 'Pimentón dulce', 4, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_063', 0, 'garbanzos', 'Garbanzos', 500, 'g'),
  ('legumbres_063', 1, 'morcillo-de-ternera', 'Morcillo de ternera', 300, 'g'),
  ('legumbres_063', 2, 'pollo', 'Pollo', 240, 'g'),
  ('legumbres_063', 3, 'tocino', 'Tocino', 100, 'g'),
  ('legumbres_063', 4, 'jamon', 'Hueso de jamón', 100, 'g'),
  ('legumbres_063', 5, 'chorizo', 'Chorizo', 120, 'g'),
  ('legumbres_063', 6, 'morcilla', 'Morcilla', 100, 'g'),
  ('legumbres_063', 7, 'patata', 'Patata', 300, 'g'),
  ('legumbres_063', 8, 'zanahoria', 'Zanahoria', 200, 'g'),
  ('legumbres_063', 9, 'repollo', 'Repollo', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_063', 10, 'fideos', 'Fideos finos', 80, 'g'),
  ('legumbres_064', 0, 'caldo-de-carne', 'Caldo de cocido', 600, 'ml'),
  ('legumbres_064', 1, 'fideos', 'Fideos finos', 80, 'g'),
  ('legumbres_064', 2, 'perejil', 'Perejil fresco', 3, 'g'),
  ('legumbres_065', 0, 'garbanzos', 'Garbanzos cocidos', 250, 'g'),
  ('legumbres_065', 1, 'carne-de-cocido', 'Carne de cocido variada', 250, 'g'),
  ('legumbres_065', 2, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('legumbres_065', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('legumbres_065', 4, 'ajo', 'Ajo', 8, 'g'),
  ('legumbres_065', 5, 'tomate-triturado', 'Tomate triturado', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_065', 6, 'pimenton', 'Pimentón dulce', 4, 'g'),
  ('legumbres_065', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_066', 0, 'garbanzos', 'Garbanzos', 400, 'g'),
  ('legumbres_066', 1, 'pollo', 'Pollo troceado', 400, 'g'),
  ('legumbres_066', 2, 'tocino', 'Tocino', 80, 'g'),
  ('legumbres_066', 3, 'chorizo', 'Chorizo', 100, 'g'),
  ('legumbres_066', 4, 'patata', 'Patata', 300, 'g'),
  ('legumbres_066', 5, 'judia-verde', 'Judías verdes', 150, 'g'),
  ('legumbres_066', 6, 'calabaza', 'Calabaza', 200, 'g'),
  ('legumbres_066', 7, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_066', 8, 'tomate', 'Tomate', 150, 'g'),
  ('legumbres_066', 9, 'menta', 'Hierbabuena fresca', 10, 'g'),
  ('legumbres_066', 10, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_067', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_067', 1, 'quinoa', 'Quinoa', 100, 'g'),
  ('legumbres_067', 2, 'boniato', 'Boniato', 200, 'g'),
  ('legumbres_067', 3, 'rucula', 'Rúcula', 60, 'g'),
  ('legumbres_067', 4, 'aguacate', 'Aguacate', 100, 'g'),
  ('legumbres_067', 5, 'tahini', 'Tahini', 25, 'g'),
  ('legumbres_067', 6, 'limon', 'Zumo de limón', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_067', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_067', 8, 'comino', 'Comino molido', 3, 'g'),
  ('legumbres_067', 9, 'pimenton', 'Pimentón ahumado', 3, 'g'),
  ('legumbres_068', 0, 'alubias', 'Alubias blancas cocidas', 300, 'g'),
  ('legumbres_068', 1, 'zanahoria', 'Zanahoria', 1, 'ud'),
  ('legumbres_068', 2, 'puerro', 'Puerro', 0.5, 'ud'),
  ('legumbres_068', 3, 'jamon', 'Jamón serrano en tacos', 50, 'g'),
  ('legumbres_068', 4, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('legumbres_068', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_069', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_069', 1, 'acelga', 'Acelgas', 150, 'g'),
  ('legumbres_069', 2, 'patata', 'Patata', 1, 'ud'),
  ('legumbres_069', 3, 'zanahoria', 'Zanahoria', 1, 'ud'),
  ('legumbres_069', 4, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('legumbres_069', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_069', 6, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('legumbres_070', 0, 'judia-blanca', 'Judías blancas cocidas', 300, 'g'),
  ('legumbres_070', 1, 'arroz', 'Arroz', 100, 'g'),
  ('legumbres_070', 2, 'chorizo', 'Chorizo', 80, 'g'),
  ('legumbres_070', 3, 'cebolla', 'Cebolla', 0.5, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_070', 4, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('legumbres_070', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('legumbres_071', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_071', 1, 'patata', 'Patatas', 250, 'g'),
  ('legumbres_071', 2, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('legumbres_071', 3, 'ajo', 'Ajo', 2, 'ud'),
  ('legumbres_071', 4, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('legumbres_071', 5, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('legumbres_071', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('legumbres_072', 0, 'alubias', 'Alubias blancas cocidas', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_072', 1, 'costilla', 'Costilla de cerdo', 250, 'g'),
  ('legumbres_072', 2, 'zanahoria', 'Zanahoria', 1, 'ud'),
  ('legumbres_072', 3, 'puerro', 'Puerro', 0.5, 'ud'),
  ('legumbres_072', 4, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('legumbres_072', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('legumbres_073', 0, 'garbanzos', 'Garbanzos cocidos', 300, 'g'),
  ('legumbres_073', 1, 'arroz', 'Arroz', 100, 'g'),
  ('legumbres_073', 2, 'calabacin', 'Calabacín', 0.5, 'ud'),
  ('legumbres_073', 3, 'pimiento-rojo', 'Pimiento rojo', 0.5, 'ud'),
  ('legumbres_073', 4, 'cebolla', 'Cebolla', 0.5, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_073', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_074', 0, 'judias-pintas', 'Frijoles negros cocidos', 400, 'g'),
  ('legumbres_074', 1, 'chorizo', 'Chorizo', 80, 'g'),
  ('legumbres_074', 2, 'bacon', 'Bacon en lonchas', 60, 'g'),
  ('legumbres_074', 3, 'cebolla', 'Cebolla', 100, 'g'),
  ('legumbres_074', 4, 'tomate', 'Tomate maduro', 150, 'g'),
  ('legumbres_074', 5, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_074', 6, 'caldo-de-carne', 'Caldo de carne', 250, 'ml'),
  ('legumbres_074', 7, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('legumbres_074', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('legumbres_075', 0, 'garbanzos', 'Garbanzos cocidos', 400, 'g'),
  ('legumbres_075', 1, 'calabaza', 'Calabaza', 300, 'g'),
  ('legumbres_075', 2, 'leche-coco', 'Leche de coco', 250, 'ml'),
  ('legumbres_075', 3, 'cebolla', 'Cebolla', 100, 'g'),
  ('legumbres_075', 4, 'ajo', 'Ajo', 10, 'g'),
  ('legumbres_075', 5, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('legumbres_075', 6, 'curry', 'Curry en polvo', 12, 'g'),
  ('legumbres_075', 7, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('legumbres_075', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('legumbres_075', 9, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('meriendas_001', 0, 'kefir', 'Kéfir', 300, 'ml'),
  ('meriendas_001', 1, 'platano', 'Plátano', 1, 'ud'),
  ('meriendas_001', 2, 'fresa', 'Fresas', 120, 'g'),
  ('meriendas_001', 3, 'miel', 'Miel', 10, 'ml'),
  ('meriendas_002', 0, 'pan', 'Pan', 160, 'g'),
  ('meriendas_002', 1, 'platano', 'Plátano', 2, 'ud'),
  ('meriendas_002', 2, 'miel', 'Miel', 20, 'ml'),
  ('meriendas_003', 0, 'pan', 'Pan de barra', 200, 'g'),
  ('meriendas_003', 1, 'jamon', 'Jamón serrano', 80, 'g'),
  ('meriendas_003', 2, 'tomate', 'Tomate maduro', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('meriendas_003', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('meriendas_004', 0, 'pan', 'Pan de barra', 200, 'g'),
  ('meriendas_004', 1, 'pechuga-de-pavo', 'Pechuga de pavo', 90, 'g'),
  ('meriendas_004', 2, 'queso-en-lonchas', 'Queso en lonchas', 50, 'g'),
  ('meriendas_005', 0, 'manzana', 'Manzana', 1, 'ud'),
  ('meriendas_005', 1, 'platano', 'Plátano', 1, 'ud'),
  ('meriendas_005', 2, 'nueces', 'Nueces', 40, 'g'),
  ('meriendas_006', 0, 'leche', 'Leche', 400, 'ml'),
  ('meriendas_006', 1, 'cacao', 'Cacao en polvo', 30, 'g'),
  ('pasta_arroces_001', 0, 'macarrones', 'Macarrones', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_001', 1, 'tomate-triturado', 'Tomate triturado', 250, 'ml'),
  ('pasta_arroces_001', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_001', 3, 'ajo', 'Ajo', 6, 'g'),
  ('pasta_arroces_001', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_001', 5, 'oregano', 'Orégano', 3, 'g'),
  ('pasta_arroces_002', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_002', 1, 'carne-picada', 'Carne picada de ternera', 200, 'g'),
  ('pasta_arroces_002', 2, 'tomate-triturado', 'Tomate triturado', 250, 'ml'),
  ('pasta_arroces_002', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('pasta_arroces_002', 4, 'zanahoria', 'Zanahoria', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_002', 5, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_002', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_002', 7, 'vino-tinto', 'Vino tinto', 40, 'ml'),
  ('pasta_arroces_003', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_003', 1, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pasta_arroces_003', 2, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_003', 3, 'ajo', 'Ajo', 6, 'g'),
  ('pasta_arroces_004', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_004', 1, 'costilla', 'Costilla de cerdo', 150, 'g'),
  ('pasta_arroces_004', 2, 'morcilla', 'Morcilla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_004', 3, 'garbanzos', 'Garbanzos cocidos', 80, 'g'),
  ('pasta_arroces_004', 4, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_004', 5, 'patata', 'Patata', 100, 'g'),
  ('pasta_arroces_004', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_004', 7, 'pimenton', 'Pimentón', 5, 'g'),
  ('pasta_arroces_005', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_005', 1, 'panceta', 'Panceta', 100, 'g'),
  ('pasta_arroces_005', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('pasta_arroces_005', 3, 'parmesano', 'Queso parmesano', 40, 'g'),
  ('pasta_arroces_005', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_006', 0, 'macarrones', 'Macarrones', 200, 'g'),
  ('pasta_arroces_006', 1, 'atun-lata', 'Atún en conserva', 120, 'g'),
  ('pasta_arroces_006', 2, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('pasta_arroces_006', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_006', 4, 'ajo', 'Ajo', 6, 'g'),
  ('pasta_arroces_006', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_006', 6, 'oregano', 'Orégano', 2, 'g'),
  ('pasta_arroces_007', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_007', 1, 'contramuslos-de-pollo', 'Contramuslo de pollo', 250, 'g'),
  ('pasta_arroces_007', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_007', 3, 'guisantes', 'Guisantes', 60, 'g'),
  ('pasta_arroces_007', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pasta_arroces_007', 5, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_007', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_007', 7, 'pimenton', 'Pimentón', 4, 'g'),
  ('pasta_arroces_008', 0, 'fideos', 'Fideos gruesos', 180, 'g'),
  ('pasta_arroces_008', 1, 'carne-picada', 'Carne picada de cerdo', 200, 'g'),
  ('pasta_arroces_008', 2, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pasta_arroces_008', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_008', 4, 'pimiento-verde', 'Pimiento verde', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_008', 5, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_008', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_008', 7, 'pimenton', 'Pimentón', 4, 'g'),
  ('pasta_arroces_009', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_009', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('pasta_arroces_009', 2, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('pasta_arroces_009', 3, 'platano-macho', 'Plátano macho', 1, 'ud'),
  ('pasta_arroces_009', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_009', 5, 'ajo', 'Ajo', 6, 'g'),
  ('pasta_arroces_010', 0, 'espaguetis', 'Espaguetis', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_010', 1, 'albahaca', 'Albahaca fresca', 30, 'g'),
  ('pasta_arroces_010', 2, 'pinones', 'Piñones', 20, 'g'),
  ('pasta_arroces_010', 3, 'parmesano', 'Queso parmesano', 30, 'g'),
  ('pasta_arroces_010', 4, 'ajo', 'Ajo', 6, 'g'),
  ('pasta_arroces_010', 5, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pasta_arroces_011', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_011', 1, 'judia-verde', 'Judías verdes', 80, 'g'),
  ('pasta_arroces_011', 2, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('pasta_arroces_011', 3, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('pasta_arroces_011', 4, 'guisantes', 'Guisantes', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_011', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pasta_arroces_011', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_011', 7, 'pimenton', 'Pimentón', 4, 'g'),
  ('pasta_arroces_012', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_012', 1, 'gambas', 'Gambas peladas', 200, 'g'),
  ('pasta_arroces_012', 2, 'ajo', 'Ajo', 12, 'g'),
  ('pasta_arroces_012', 3, 'guindilla', 'Guindilla', 1, 'ud'),
  ('pasta_arroces_012', 4, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('pasta_arroces_012', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pasta_arroces_012', 6, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_013', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_013', 1, 'sepia', 'Sepia', 200, 'g'),
  ('pasta_arroces_013', 2, 'tinta-de-calamar', 'Tinta de calamar', 8, 'g'),
  ('pasta_arroces_013', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_013', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_013', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pasta_arroces_013', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_013', 7, 'caldo-de-pescado', 'Caldo de pescado', 400, 'ml'),
  ('pasta_arroces_014', 0, 'macarrones', 'Macarrones', 200, 'g'),
  ('pasta_arroces_014', 1, 'salmon', 'Salmón', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_014', 2, 'champinon', 'Champiñones', 150, 'g'),
  ('pasta_arroces_014', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('pasta_arroces_014', 4, 'nata', 'Nata', 80, 'ml'),
  ('pasta_arroces_014', 5, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_014', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_014', 7, 'perejil', 'Perejil', 5, 'g'),
  ('pasta_arroces_015', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_015', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('pasta_arroces_015', 2, 'guisantes', 'Guisantes', 60, 'g'),
  ('pasta_arroces_015', 3, 'zanahoria', 'Zanahoria', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_015', 4, 'jamon-york', 'Jamón cocido', 60, 'g'),
  ('pasta_arroces_015', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_015', 6, 'salsa-soja', 'Salsa de soja', 15, 'ml'),
  ('pasta_arroces_016', 0, 'tallarines', 'Tallarines', 200, 'g'),
  ('pasta_arroces_016', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 200, 'g'),
  ('pasta_arroces_016', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('pasta_arroces_016', 3, 'calabacin', 'Calabacín', 80, 'g'),
  ('pasta_arroces_016', 4, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('pasta_arroces_016', 5, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_016', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_017', 0, 'lasana', 'Placas de lasaña', 120, 'g'),
  ('pasta_arroces_017', 1, 'carne-picada', 'Carne picada de ternera', 250, 'g'),
  ('pasta_arroces_017', 2, 'tomate-triturado', 'Tomate triturado', 250, 'ml'),
  ('pasta_arroces_017', 3, 'bechamel', 'Bechamel', 200, 'ml'),
  ('pasta_arroces_017', 4, 'queso', 'Queso rallado', 40, 'g'),
  ('pasta_arroces_017', 5, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_017', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_018', 0, 'placas-de-cannelones', 'Placas de cannelones', 100, 'g'),
  ('pasta_arroces_018', 1, 'carne-picada', 'Carne picada de ternera', 250, 'g'),
  ('pasta_arroces_018', 2, 'cebolla', 'Cebolla', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_018', 3, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_018', 4, 'bechamel', 'Bechamel', 250, 'ml'),
  ('pasta_arroces_018', 5, 'queso', 'Queso rallado', 40, 'g'),
  ('pasta_arroces_018', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_018', 7, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('pasta_arroces_019', 0, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_019', 1, 'gambas', 'Gambas', 150, 'g'),
  ('pasta_arroces_019', 2, 'almejas', 'Almejas', 100, 'g'),
  ('pasta_arroces_019', 3, 'sepia', 'Sepia', 100, 'g'),
  ('pasta_arroces_019', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_019', 5, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_019', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_019', 7, 'caldo-de-pescado', 'Caldo de pescado', 500, 'ml'),
  ('pasta_arroces_020', 0, 'penne', 'Penne', 200, 'g'),
  ('pasta_arroces_020', 1, 'calabacin', 'Calabacín', 100, 'g'),
  ('pasta_arroces_020', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('pasta_arroces_020', 3, 'berenjena', 'Berenjena', 80, 'g'),
  ('pasta_arroces_020', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_020', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_020', 6, 'albahaca', 'Albahaca', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_021', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_021', 1, 'monkfish', 'Rape', 100, 'g'),
  ('pasta_arroces_021', 2, 'gambas', 'Gambas', 80, 'g'),
  ('pasta_arroces_021', 3, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('pasta_arroces_021', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_021', 5, 'pimenton', 'Pimentón', 4, 'g'),
  ('pasta_arroces_021', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_021', 7, 'caldo-de-pescado', 'Caldo de pescado', 400, 'ml'),
  ('pasta_arroces_022', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_022', 1, 'ajo', 'Ajo', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_022', 2, 'guindilla', 'Guindilla', 2, 'ud'),
  ('pasta_arroces_022', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_022', 4, 'perejil', 'Perejil', 5, 'g'),
  ('pasta_arroces_023', 0, 'fideo-mediano', 'Fideos n°2', 180, 'g'),
  ('pasta_arroces_023', 1, 'contramuslos-de-pollo', 'Contramuslo de pollo', 250, 'g'),
  ('pasta_arroces_023', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('pasta_arroces_023', 3, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pasta_arroces_023', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_023', 5, 'pimenton', 'Pimentón', 4, 'g'),
  ('pasta_arroces_023', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_023', 7, 'caldo-de-pollo', 'Caldo de pollo', 400, 'ml'),
  ('pasta_arroces_024', 0, 'fusilli', 'Fusilli', 200, 'g'),
  ('pasta_arroces_024', 1, 'tomate-cherry', 'Tomate cherry', 120, 'g'),
  ('pasta_arroces_024', 2, 'mozzarella', 'Mozzarella fresca', 100, 'g'),
  ('pasta_arroces_024', 3, 'rucula', 'Rúcula', 40, 'g'),
  ('pasta_arroces_024', 4, 'aceitunas-negras', 'Aceitunas negras', 30, 'g'),
  ('pasta_arroces_024', 5, 'pesto', 'Pesto', 30, 'g'),
  ('pasta_arroces_024', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_025', 0, 'arroz-arborio', 'Arroz arborio', 180, 'g'),
  ('pasta_arroces_025', 1, 'champinon', 'Champiñones', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_025', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_025', 3, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_025', 4, 'parmesano', 'Queso parmesano', 30, 'g'),
  ('pasta_arroces_025', 5, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('pasta_arroces_025', 6, 'caldo-de-verduras', 'Caldo de verduras', 500, 'ml'),
  ('pasta_arroces_026', 0, 'espaguetis', 'Espaguetis', 180, 'g'),
  ('pasta_arroces_026', 1, 'tomate-cherry', 'Tomates cherry', 300, 'g'),
  ('pasta_arroces_026', 2, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_026', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_026', 4, 'albahaca', 'Albahaca fresca', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_026', 5, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_026', 6, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('pasta_arroces_027', 0, 'espaguetis', 'Espaguetis', 180, 'g'),
  ('pasta_arroces_027', 1, 'huevos', 'Huevo', 120, 'g'),
  ('pasta_arroces_027', 2, 'yema-de-huevo', 'Yema de huevo', 20, 'g'),
  ('pasta_arroces_027', 3, 'parmesano', 'Queso parmesano', 50, 'g'),
  ('pasta_arroces_027', 4, 'bacon', 'Bacon en taquitos', 80, 'g'),
  ('pasta_arroces_027', 5, 'pimienta', 'Pimienta negra', 2, 'g'),
  ('pasta_arroces_027', 6, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_028', 0, 'fusilli', 'Fusilli', 180, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_028', 1, 'pesto', 'Pesto de albahaca', 80, 'g'),
  ('pasta_arroces_028', 2, 'tomate-cherry', 'Tomates cherry', 150, 'g'),
  ('pasta_arroces_028', 3, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('pasta_arroces_028', 4, 'pinones', 'Piñones', 15, 'g'),
  ('pasta_arroces_028', 5, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_029', 0, 'macarrones', 'Macarrones', 180, 'g'),
  ('pasta_arroces_029', 1, 'atun-lata', 'Atún en conserva', 160, 'g'),
  ('pasta_arroces_029', 2, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('pasta_arroces_029', 3, 'aceitunas-negras', 'Aceitunas negras', 50, 'g'),
  ('pasta_arroces_029', 4, 'ajo', 'Ajo', 6, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_029', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_029', 6, 'sal', 'Sal', 2, 'g'),
  ('pasta_arroces_030', 0, 'arroz-arborio', 'Arroz arborio', 160, 'g'),
  ('pasta_arroces_030', 1, 'setas', 'Setas variadas', 200, 'g'),
  ('pasta_arroces_030', 2, 'caldo-de-verduras', 'Caldo de verduras', 700, 'ml'),
  ('pasta_arroces_030', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_030', 4, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_030', 5, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('pasta_arroces_030', 6, 'parmesano', 'Queso parmesano', 40, 'g'),
  ('pasta_arroces_030', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_030', 8, 'trufa-negra', 'Trufa negra', 8, 'g'),
  ('pasta_arroces_030', 9, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_031', 0, 'arroz-bomba', 'Arroz bomba', 160, 'g'),
  ('pasta_arroces_031', 1, 'calamar', 'Calamar', 200, 'g'),
  ('pasta_arroces_031', 2, 'tinta-de-calamar', 'Tinta de calamar', 8, 'g'),
  ('pasta_arroces_031', 3, 'caldo-de-pescado', 'Caldo de pescado', 450, 'ml'),
  ('pasta_arroces_031', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pasta_arroces_031', 5, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_031', 6, 'pimiento-rojo', 'Pimiento rojo', 50, 'g'),
  ('pasta_arroces_031', 7, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_031', 8, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_031', 9, 'alioli', 'Alioli', 60, 'g'),
  ('pasta_arroces_031', 10, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_032', 0, 'arroz-bomba', 'Arroz bomba', 320, 'g'),
  ('pasta_arroces_032', 1, 'gambas', 'Gambas', 200, 'g'),
  ('pasta_arroces_032', 2, 'mejillones', 'Mejillones', 250, 'g'),
  ('pasta_arroces_032', 3, 'calamar', 'Calamar', 150, 'g'),
  ('pasta_arroces_032', 4, 'caldo-de-pescado', 'Caldo de pescado', 900, 'ml'),
  ('pasta_arroces_032', 5, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pasta_arroces_032', 6, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_032', 7, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('pasta_arroces_032', 8, 'ajo', 'Ajo', 15, 'g'),
  ('pasta_arroces_032', 9, 'azafran', 'Azafrán', 1, 'g'),
  ('pasta_arroces_032', 10, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pasta_arroces_032', 11, 'sal', 'Sal', 5, 'g'),
  ('pasta_arroces_033', 0, 'fideos', 'Fideos huecos nº 2', 180, 'g'),
  ('pasta_arroces_033', 1, 'calamar', 'Calamar', 150, 'g'),
  ('pasta_arroces_033', 2, 'gambas', 'Gambas', 100, 'g'),
  ('pasta_arroces_033', 3, 'tinta-de-calamar', 'Tinta de calamar', 6, 'g'),
  ('pasta_arroces_033', 4, 'caldo-de-pescado', 'Caldo de pescado', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_033', 5, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('pasta_arroces_033', 6, 'cebolla', 'Cebolla', 50, 'g'),
  ('pasta_arroces_033', 7, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_033', 8, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pasta_arroces_033', 9, 'alioli', 'Alioli', 50, 'g'),
  ('pasta_arroces_033', 10, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_034', 0, 'rabo-de-toro', 'Rabo de toro troceado', 800, 'g'),
  ('pasta_arroces_034', 1, 'arroz-bomba', 'Arroz bomba', 320, 'g'),
  ('pasta_arroces_034', 2, 'caldo-de-carne', 'Caldo de carne', 900, 'ml'),
  ('pasta_arroces_034', 3, 'vino-tinto', 'Vino tinto', 200, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_034', 4, 'cebolla', 'Cebolla', 150, 'g'),
  ('pasta_arroces_034', 5, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('pasta_arroces_034', 6, 'puerro', 'Puerro', 80, 'g'),
  ('pasta_arroces_034', 7, 'ajo', 'Ajo', 15, 'g'),
  ('pasta_arroces_034', 8, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_034', 9, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_034', 10, 'sal', 'Sal', 5, 'g'),
  ('pasta_arroces_035', 0, 'harina', 'Harina de trigo', 250, 'g'),
  ('pasta_arroces_035', 1, 'huevos', 'Huevo', 150, 'g'),
  ('pasta_arroces_035', 2, 'boletus', 'Boletus secos', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_035', 3, 'ricotta', 'Ricotta', 150, 'g'),
  ('pasta_arroces_035', 4, 'parmesano', 'Queso parmesano', 40, 'g'),
  ('pasta_arroces_035', 5, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pasta_arroces_035', 6, 'salvia', 'Salvia fresca', 8, 'g'),
  ('pasta_arroces_035', 7, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_036', 0, 'carne-de-jabali-picada', 'Carne de jabalí picada', 500, 'g'),
  ('pasta_arroces_036', 1, 'tallarines', 'Tagliatelle', 320, 'g'),
  ('pasta_arroces_036', 2, 'tomate-triturado', 'Tomate triturado', 400, 'ml'),
  ('pasta_arroces_036', 3, 'vino-tinto', 'Vino tinto', 150, 'ml'),
  ('pasta_arroces_036', 4, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_036', 5, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('pasta_arroces_036', 6, 'apio', 'Apio', 50, 'g'),
  ('pasta_arroces_036', 7, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_036', 8, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_036', 9, 'parmesano', 'Queso parmesano', 30, 'g'),
  ('pasta_arroces_036', 10, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_037', 0, 'arroz-arborio', 'Arroz arborio', 160, 'g'),
  ('pasta_arroces_037', 1, 'calabaza', 'Calabaza', 250, 'g'),
  ('pasta_arroces_037', 2, 'caldo-de-verduras', 'Caldo de verduras', 700, 'ml'),
  ('pasta_arroces_037', 3, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_037', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('pasta_arroces_037', 5, 'mantequilla', 'Mantequilla', 25, 'g'),
  ('pasta_arroces_037', 6, 'parmesano', 'Queso parmesano', 50, 'g'),
  ('pasta_arroces_037', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_037', 8, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_038', 0, 'orecchiette', 'Orecchiette', 180, 'g'),
  ('pasta_arroces_038', 1, 'brocoli', 'Brócoli', 250, 'g'),
  ('pasta_arroces_038', 2, 'anchoa-en-aceite', 'Anchoas en aceite', 30, 'g'),
  ('pasta_arroces_038', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_038', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_038', 5, 'guindilla', 'Guindilla', 1, 'g'),
  ('pasta_arroces_038', 6, 'sal', 'Sal', 2, 'g'),
  ('pasta_arroces_039', 0, 'bogavante', 'Bogavante', 500, 'g'),
  ('pasta_arroces_039', 1, 'arroz-bomba', 'Arroz bomba', 160, 'g'),
  ('pasta_arroces_039', 2, 'caldo-de-pescado', 'Caldo de pescado', 800, 'ml'),
  ('pasta_arroces_039', 3, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_039', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_039', 5, 'pimiento-rojo', 'Pimiento rojo', 50, 'g'),
  ('pasta_arroces_039', 6, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_039', 7, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_039', 8, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('pasta_arroces_039', 9, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_040', 0, 'rabo-de-toro', 'Rabo de toro troceado', 800, 'g'),
  ('pasta_arroces_040', 1, 'canelones', 'Placas de canelones', 16, 'ud'),
  ('pasta_arroces_040', 2, 'vino-tinto', 'Vino tinto', 200, 'ml'),
  ('pasta_arroces_040', 3, 'cebolla', 'Cebolla', 150, 'g'),
  ('pasta_arroces_040', 4, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('pasta_arroces_040', 5, 'puerro', 'Puerro', 80, 'g'),
  ('pasta_arroces_040', 6, 'ajo', 'Ajo', 15, 'g'),
  ('pasta_arroces_040', 7, 'caldo-de-carne', 'Caldo de carne', 400, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_040', 8, 'leche', 'Leche', 600, 'ml'),
  ('pasta_arroces_040', 9, 'harina', 'Harina de trigo', 50, 'g'),
  ('pasta_arroces_040', 10, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pasta_arroces_040', 11, 'parmesano', 'Queso parmesano', 50, 'g'),
  ('pasta_arroces_040', 12, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_040', 13, 'sal', 'Sal', 5, 'g'),
  ('pasta_arroces_041', 0, 'linguine', 'Linguine', 180, 'g'),
  ('pasta_arroces_041', 1, 'almejas', 'Almejas', 500, 'g'),
  ('pasta_arroces_041', 2, 'ajo', 'Ajo', 12, 'g'),
  ('pasta_arroces_041', 3, 'vino-blanco', 'Vino blanco', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_041', 4, 'aceite-oliva', 'Aceite de oliva', 35, 'ml'),
  ('pasta_arroces_041', 5, 'perejil', 'Perejil fresco', 10, 'g'),
  ('pasta_arroces_041', 6, 'guindilla', 'Guindilla', 1, 'g'),
  ('pasta_arroces_041', 7, 'sal', 'Sal', 2, 'g'),
  ('pasta_arroces_042', 0, 'arroz-arborio', 'Arroz arborio', 160, 'g'),
  ('pasta_arroces_042', 1, 'calamar', 'Calamar', 250, 'g'),
  ('pasta_arroces_042', 2, 'tinta-de-calamar', 'Tinta de calamar', 8, 'g'),
  ('pasta_arroces_042', 3, 'caldo-de-pescado', 'Caldo de pescado', 700, 'ml'),
  ('pasta_arroces_042', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_042', 5, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_042', 6, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_042', 7, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_042', 8, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('pasta_arroces_042', 9, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_043', 0, 'arroz-bomba', 'Arroz bomba', 320, 'g'),
  ('pasta_arroces_043', 1, 'muslo-de-pollo', 'Muslo de pollo deshuesado', 400, 'g'),
  ('pasta_arroces_043', 2, 'costilla', 'Costillas de cerdo', 300, 'g'),
  ('pasta_arroces_043', 3, 'butifarra', 'Butifarra', 200, 'g'),
  ('pasta_arroces_043', 4, 'garbanzos', 'Garbanzos cocidos', 150, 'g'),
  ('pasta_arroces_043', 5, 'caldo-de-pollo', 'Caldo de pollo', 750, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_043', 6, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_043', 7, 'huevos', 'Huevo', 300, 'g'),
  ('pasta_arroces_043', 8, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_043', 9, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_043', 10, 'azafran', 'Azafrán', 1, 'g'),
  ('pasta_arroces_043', 11, 'sal', 'Sal', 5, 'g'),
  ('pasta_arroces_044', 0, 'pato', 'Muslos de pato', 500, 'g'),
  ('pasta_arroces_044', 1, 'tallarines', 'Pappardelle', 180, 'g'),
  ('pasta_arroces_044', 2, 'tomate-triturado', 'Tomate triturado', 300, 'ml'),
  ('pasta_arroces_044', 3, 'vino-tinto', 'Vino tinto', 150, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_044', 4, 'cebolla', 'Cebolla', 80, 'g'),
  ('pasta_arroces_044', 5, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('pasta_arroces_044', 6, 'apio', 'Apio', 40, 'g'),
  ('pasta_arroces_044', 7, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_044', 8, 'parmesano', 'Queso parmesano', 30, 'g'),
  ('pasta_arroces_044', 9, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_045', 0, 'macarrones', 'Macarrones', 180, 'g'),
  ('pasta_arroces_045', 1, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('pasta_arroces_045', 2, 'parmesano', 'Queso parmesano', 50, 'g'),
  ('pasta_arroces_045', 3, 'salvia', 'Salvia fresca', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_045', 4, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_045', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pasta_arroces_046', 0, 'espaguetis', 'Espaguetis', 180, 'g'),
  ('pasta_arroces_046', 1, 'parmesano', 'Queso pecorino', 80, 'g'),
  ('pasta_arroces_046', 2, 'pimienta', 'Pimienta negra en grano', 4, 'g'),
  ('pasta_arroces_046', 3, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_047', 0, 'espaguetis', 'Espaguetis', 180, 'g'),
  ('pasta_arroces_047', 1, 'guanciale', 'Guanciale', 120, 'g'),
  ('pasta_arroces_047', 2, 'yema-de-huevo', 'Yema de huevo', 80, 'g'),
  ('pasta_arroces_047', 3, 'huevos', 'Huevo', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_047', 4, 'parmesano', 'Queso pecorino', 50, 'g'),
  ('pasta_arroces_047', 5, 'pimienta', 'Pimienta negra', 3, 'g'),
  ('pasta_arroces_047', 6, 'sal', 'Sal', 2, 'g'),
  ('pasta_arroces_048', 0, 'espaguetis', 'Espaguetis', 180, 'g'),
  ('pasta_arroces_048', 1, 'limon', 'Limón', 80, 'g'),
  ('pasta_arroces_048', 2, 'nata', 'Nata para cocinar', 80, 'ml'),
  ('pasta_arroces_048', 3, 'parmesano', 'Queso parmesano', 50, 'g'),
  ('pasta_arroces_048', 4, 'mantequilla', 'Mantequilla', 25, 'g'),
  ('pasta_arroces_048', 5, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_048', 6, 'pimienta', 'Pimienta negra', 1, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_049', 0, 'rigatoni', 'Rigatoni', 200, 'g'),
  ('pasta_arroces_049', 1, 'berenjena', 'Berenjena', 300, 'g'),
  ('pasta_arroces_049', 2, 'tomate-triturado', 'Tomate triturado', 300, 'ml'),
  ('pasta_arroces_049', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_049', 4, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('pasta_arroces_049', 5, 'ricotta', 'Ricotta salada', 40, 'g'),
  ('pasta_arroces_049', 6, 'albahaca', 'Albahaca fresca', 6, 'g'),
  ('pasta_arroces_049', 7, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_050', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_050', 1, 'ajo', 'Ajo', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_050', 2, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('pasta_arroces_050', 3, 'guindilla', 'Guindilla seca', 3, 'g'),
  ('pasta_arroces_050', 4, 'perejil', 'Perejil fresco', 8, 'g'),
  ('pasta_arroces_050', 5, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_051', 0, 'patata', 'Patata', 500, 'g'),
  ('pasta_arroces_051', 1, 'harina', 'Harina de trigo', 150, 'g'),
  ('pasta_arroces_051', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('pasta_arroces_051', 3, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pasta_arroces_051', 4, 'salvia', 'Salvia fresca', 6, 'g'),
  ('pasta_arroces_051', 5, 'parmesano', 'Parmesano', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_051', 6, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_051', 7, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('pasta_arroces_052', 0, 'ricotta', 'Ricotta', 250, 'g'),
  ('pasta_arroces_052', 1, 'espinacas', 'Espinacas frescas', 200, 'g'),
  ('pasta_arroces_052', 2, 'harina', 'Harina de trigo', 80, 'g'),
  ('pasta_arroces_052', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('pasta_arroces_052', 4, 'parmesano', 'Parmesano', 30, 'g'),
  ('pasta_arroces_052', 5, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('pasta_arroces_052', 6, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('pasta_arroces_052', 7, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_053', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_053', 1, 'almejas', 'Almejas', 400, 'g'),
  ('pasta_arroces_053', 2, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_053', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_053', 4, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_053', 5, 'perejil', 'Perejil fresco', 10, 'g'),
  ('pasta_arroces_053', 6, 'guindilla', 'Guindilla', 2, 'g'),
  ('pasta_arroces_053', 7, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_054', 0, 'ravioli', 'Tortellini frescos rellenos de carne', 300, 'g'),
  ('pasta_arroces_054', 1, 'caldo-de-carne', 'Caldo de carne', 800, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_054', 2, 'parmesano', 'Parmesano', 20, 'g'),
  ('pasta_arroces_054', 3, 'perejil', 'Perejil fresco', 5, 'g'),
  ('pasta_arroces_054', 4, 'sal', 'Sal', 2, 'g'),
  ('pasta_arroces_055', 0, 'macarrones', 'Macarrones', 350, 'g'),
  ('pasta_arroces_055', 1, 'leche', 'Leche', 800, 'ml'),
  ('pasta_arroces_055', 2, 'harina', 'Harina de trigo', 60, 'g'),
  ('pasta_arroces_055', 3, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('pasta_arroces_055', 4, 'queso', 'Queso rallado', 180, 'g'),
  ('pasta_arroces_055', 5, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('pasta_arroces_055', 6, 'sal', 'Sal', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_056', 0, 'lasana', 'Láminas de lasaña', 300, 'g'),
  ('pasta_arroces_056', 1, 'calabacin', 'Calabacín', 300, 'g'),
  ('pasta_arroces_056', 2, 'berenjena', 'Berenjena', 300, 'g'),
  ('pasta_arroces_056', 3, 'pimiento-rojo', 'Pimiento rojo', 200, 'g'),
  ('pasta_arroces_056', 4, 'cebolla', 'Cebolla', 120, 'g'),
  ('pasta_arroces_056', 5, 'tomate-triturado', 'Tomate triturado', 300, 'ml'),
  ('pasta_arroces_056', 6, 'leche', 'Leche', 700, 'ml'),
  ('pasta_arroces_056', 7, 'harina', 'Harina de trigo', 50, 'g'),
  ('pasta_arroces_056', 8, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pasta_arroces_056', 9, 'queso', 'Queso rallado', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_056', 10, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_056', 11, 'sal', 'Sal', 5, 'g'),
  ('pasta_arroces_057', 0, 'canelones', 'Placas de canelones', 16, 'ud'),
  ('pasta_arroces_057', 1, 'espinacas', 'Espinacas frescas', 600, 'g'),
  ('pasta_arroces_057', 2, 'pinones', 'Piñones', 50, 'g'),
  ('pasta_arroces_057', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('pasta_arroces_057', 4, 'leche', 'Leche', 700, 'ml'),
  ('pasta_arroces_057', 5, 'harina', 'Harina de trigo', 50, 'g'),
  ('pasta_arroces_057', 6, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pasta_arroces_057', 7, 'queso', 'Queso rallado', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_057', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_057', 9, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('pasta_arroces_057', 10, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_058', 0, 'canelones', 'Placas de canelones', 16, 'ud'),
  ('pasta_arroces_058', 1, 'pechuga-de-pollo', 'Pechuga de pollo asada', 500, 'g'),
  ('pasta_arroces_058', 2, 'jamon-york', 'Jamón cocido', 120, 'g'),
  ('pasta_arroces_058', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('pasta_arroces_058', 4, 'leche', 'Leche', 700, 'ml'),
  ('pasta_arroces_058', 5, 'harina', 'Harina de trigo', 50, 'g'),
  ('pasta_arroces_058', 6, 'mantequilla', 'Mantequilla', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_058', 7, 'queso', 'Queso rallado', 100, 'g'),
  ('pasta_arroces_058', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_058', 9, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_059', 0, 'lasana', 'Láminas de lasaña', 300, 'g'),
  ('pasta_arroces_059', 1, 'carne-picada', 'Carne picada de ternera', 600, 'g'),
  ('pasta_arroces_059', 2, 'cebolla', 'Cebolla', 150, 'g'),
  ('pasta_arroces_059', 3, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('pasta_arroces_059', 4, 'apio', 'Apio', 60, 'g'),
  ('pasta_arroces_059', 5, 'tomate-triturado', 'Tomate triturado', 700, 'ml'),
  ('pasta_arroces_059', 6, 'vino-tinto', 'Vino tinto', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_059', 7, 'leche', 'Leche', 800, 'ml'),
  ('pasta_arroces_059', 8, 'harina', 'Harina de trigo', 60, 'g'),
  ('pasta_arroces_059', 9, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('pasta_arroces_059', 10, 'queso', 'Queso rallado', 180, 'g'),
  ('pasta_arroces_059', 11, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_059', 12, 'sal', 'Sal', 6, 'g'),
  ('pasta_arroces_060', 0, 'fusilli', 'Fusilli', 200, 'g'),
  ('pasta_arroces_060', 1, 'tomate-cherry', 'Tomate cherry', 200, 'g'),
  ('pasta_arroces_060', 2, 'mozzarella', 'Mozzarella', 150, 'g'),
  ('pasta_arroces_060', 3, 'albahaca', 'Albahaca fresca', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_060', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_060', 5, 'vinagre-balsamico', 'Vinagre balsámico', 10, 'ml'),
  ('pasta_arroces_060', 6, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_061', 0, 'fusilli', 'Fusilli', 200, 'g'),
  ('pasta_arroces_061', 1, 'atun-lata', 'Atún en conserva', 160, 'g'),
  ('pasta_arroces_061', 2, 'aceitunas-negras', 'Aceitunas negras', 40, 'g'),
  ('pasta_arroces_061', 3, 'tomate-cherry', 'Tomate cherry', 150, 'g'),
  ('pasta_arroces_061', 4, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('pasta_arroces_061', 5, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('pasta_arroces_061', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_061', 7, 'vinagre', 'Vinagre', 10, 'ml'),
  ('pasta_arroces_061', 8, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_062', 0, 'trofie', 'Trofie', 200, 'g'),
  ('pasta_arroces_062', 1, 'patata', 'Patata', 100, 'g'),
  ('pasta_arroces_062', 2, 'judia-verde', 'Judía verde', 60, 'g'),
  ('pasta_arroces_062', 3, 'albahaca', 'Albahaca fresca', 60, 'g'),
  ('pasta_arroces_062', 4, 'pinones', 'Piñones', 20, 'g'),
  ('pasta_arroces_062', 5, 'parmesano', 'Parmesano', 40, 'g'),
  ('pasta_arroces_062', 6, 'ajo', 'Ajo', 6, 'g'),
  ('pasta_arroces_062', 7, 'aceite-oliva', 'Aceite de oliva', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_062', 8, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_063', 0, 'rigatoni', 'Rigatoni', 200, 'g'),
  ('pasta_arroces_063', 1, 'salchicha', 'Salchicha fresca italiana', 250, 'g'),
  ('pasta_arroces_063', 2, 'tomate-triturado', 'Tomate triturado', 300, 'ml'),
  ('pasta_arroces_063', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_063', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_063', 5, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('pasta_arroces_063', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_063', 7, 'oregano', 'Orégano', 2, 'g'),
  ('pasta_arroces_063', 8, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_064', 0, 'penne', 'Penne', 200, 'g'),
  ('pasta_arroces_064', 1, 'tomate-triturado', 'Tomate triturado', 300, 'ml'),
  ('pasta_arroces_064', 2, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_064', 3, 'guindilla', 'Guindilla', 4, 'g'),
  ('pasta_arroces_064', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_064', 5, 'perejil', 'Perejil fresco', 5, 'g'),
  ('pasta_arroces_064', 6, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_065', 0, 'tallarines', 'Tagliatelle', 200, 'g'),
  ('pasta_arroces_065', 1, 'boletus', 'Boletus', 200, 'g'),
  ('pasta_arroces_065', 2, 'nata', 'Nata para cocinar', 200, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_065', 3, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_065', 4, 'cebolla', 'Cebolla', 50, 'g'),
  ('pasta_arroces_065', 5, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('pasta_arroces_065', 6, 'perejil', 'Perejil fresco', 5, 'g'),
  ('pasta_arroces_065', 7, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_066', 0, 'farfalle', 'Farfalle', 200, 'g'),
  ('pasta_arroces_066', 1, 'salmon-fresco', 'Salmón fresco', 200, 'g'),
  ('pasta_arroces_066', 2, 'nata', 'Nata para cocinar', 150, 'ml'),
  ('pasta_arroces_066', 3, 'eneldo', 'Eneldo fresco', 6, 'g'),
  ('pasta_arroces_066', 4, 'cebolla', 'Cebolla', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_066', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_066', 6, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_066', 7, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pasta_arroces_067', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_067', 1, 'gambas', 'Gambas peladas', 250, 'g'),
  ('pasta_arroces_067', 2, 'ajo', 'Ajo', 12, 'g'),
  ('pasta_arroces_067', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pasta_arroces_067', 4, 'guindilla', 'Guindilla', 2, 'g'),
  ('pasta_arroces_067', 5, 'perejil', 'Perejil fresco', 8, 'g'),
  ('pasta_arroces_067', 6, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_068', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_068', 1, 'almejas', 'Almejas', 400, 'g'),
  ('pasta_arroces_068', 2, 'ajo', 'Ajo', 12, 'g'),
  ('pasta_arroces_068', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pasta_arroces_068', 4, 'vino-blanco', 'Vino blanco', 80, 'ml'),
  ('pasta_arroces_068', 5, 'perejil', 'Perejil fresco', 10, 'g'),
  ('pasta_arroces_068', 6, 'guindilla', 'Guindilla', 2, 'g'),
  ('pasta_arroces_068', 7, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_069', 0, 'harina', 'Harina de trigo', 250, 'g'),
  ('pasta_arroces_069', 1, 'huevos', 'Huevo', 3, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_069', 2, 'ricotta', 'Ricotta', 200, 'g'),
  ('pasta_arroces_069', 3, 'espinacas', 'Espinacas frescas', 150, 'g'),
  ('pasta_arroces_069', 4, 'parmesano', 'Parmesano', 40, 'g'),
  ('pasta_arroces_069', 5, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pasta_arroces_069', 6, 'salvia', 'Salvia fresca', 4, 'g'),
  ('pasta_arroces_069', 7, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('pasta_arroces_069', 8, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_070', 0, 'harina', 'Harina de trigo', 250, 'g'),
  ('pasta_arroces_070', 1, 'huevos', 'Huevo', 3, 'ud'),
  ('pasta_arroces_070', 2, 'calabaza', 'Calabaza', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_070', 3, 'parmesano', 'Parmesano', 40, 'g'),
  ('pasta_arroces_070', 4, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pasta_arroces_070', 5, 'salvia', 'Salvia fresca', 4, 'g'),
  ('pasta_arroces_070', 6, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('pasta_arroces_070', 7, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_071', 0, 'fettuccine', 'Fettuccine', 200, 'g'),
  ('pasta_arroces_071', 1, 'mantequilla', 'Mantequilla', 80, 'g'),
  ('pasta_arroces_071', 2, 'parmesano', 'Parmesano', 100, 'g'),
  ('pasta_arroces_071', 3, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('pasta_arroces_071', 4, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_071', 5, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pasta_arroces_072', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_072', 1, 'brocoli', 'Brócoli', 250, 'g'),
  ('pasta_arroces_072', 2, 'ajo', 'Ajo', 15, 'g'),
  ('pasta_arroces_072', 3, 'anchoa-en-aceite', 'Anchoas en aceite', 20, 'g'),
  ('pasta_arroces_072', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_072', 5, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('pasta_arroces_073', 0, 'arroz', 'Arroz basmati', 160, 'g'),
  ('pasta_arroces_073', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 300, 'g'),
  ('pasta_arroces_073', 2, 'leche-coco', 'Leche de coco', 200, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_073', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('pasta_arroces_073', 4, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_073', 5, 'jengibre', 'Jengibre', 10, 'g'),
  ('pasta_arroces_073', 6, 'curry', 'Curry en polvo', 8, 'g'),
  ('pasta_arroces_073', 7, 'caldo-de-pollo', 'Caldo de pollo', 200, 'ml'),
  ('pasta_arroces_073', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_073', 9, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('pasta_arroces_074', 0, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_074', 1, 'setas', 'Setas variadas', 300, 'g'),
  ('pasta_arroces_074', 2, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_074', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_074', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('pasta_arroces_074', 5, 'caldo-de-verduras', 'Caldo de verduras', 600, 'ml'),
  ('pasta_arroces_074', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_074', 7, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('pasta_arroces_074', 8, 'perejil', 'Perejil', 5, 'g'),
  ('pasta_arroces_075', 0, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_075', 1, 'costilla', 'Costillas de cerdo troceadas', 300, 'g'),
  ('pasta_arroces_075', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('pasta_arroces_075', 3, 'judia-verde', 'Judías verdes', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_075', 4, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('pasta_arroces_075', 5, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_075', 6, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_075', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_075', 8, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('pasta_arroces_075', 9, 'pimenton', 'Pimentón dulce', 4, 'g'),
  ('pasta_arroces_077', 0, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_077', 1, 'muslo-de-pollo', 'Muslos de pollo deshuesados', 200, 'g'),
  ('pasta_arroces_077', 2, 'gambas', 'Gambas', 100, 'g'),
  ('pasta_arroces_077', 3, 'mejillones', 'Mejillones', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_077', 4, 'judia-verde', 'Judía verde plana', 80, 'g'),
  ('pasta_arroces_077', 5, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('pasta_arroces_077', 6, 'tomate', 'Tomate rallado', 60, 'ml'),
  ('pasta_arroces_077', 7, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_077', 8, 'azafran', 'Azafrán', 0.3, 'g'),
  ('pasta_arroces_077', 9, 'caldo-de-marisco', 'Caldo de pollo y marisco', 500, 'ml'),
  ('pasta_arroces_077', 10, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_077', 11, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('pasta_arroces_078', 0, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_078', 1, 'costilla', 'Costillas de cerdo', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_078', 2, 'garbanzos', 'Garbanzos cocidos', 200, 'g'),
  ('pasta_arroces_078', 3, 'tomate', 'Tomate', 150, 'g'),
  ('pasta_arroces_078', 4, 'ajo', 'Cabeza de ajos', 1, 'ud'),
  ('pasta_arroces_078', 5, 'patata', 'Patata', 150, 'g'),
  ('pasta_arroces_078', 6, 'caldo-de-carne', 'Caldo de carne', 450, 'ml'),
  ('pasta_arroces_078', 7, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pasta_arroces_078', 8, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('pasta_arroces_078', 9, 'azafran', 'Azafrán', 1, 'g'),
  ('pasta_arroces_079', 0, 'arroz-arborio', 'Arroz arborio', 180, 'g'),
  ('pasta_arroces_079', 1, 'esparragos', 'Espárragos verdes', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_079', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_079', 3, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_079', 4, 'parmesano', 'Queso parmesano', 30, 'g'),
  ('pasta_arroces_079', 5, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('pasta_arroces_079', 6, 'caldo-de-verduras', 'Caldo de verduras', 500, 'ml'),
  ('pasta_arroces_080', 0, 'arroz-arborio', 'Arroz arborio', 180, 'g'),
  ('pasta_arroces_080', 1, 'gambas', 'Gambas peladas', 200, 'g'),
  ('pasta_arroces_080', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('pasta_arroces_080', 3, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_080', 4, 'caldo-de-pescado', 'Caldo de pescado', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_080', 5, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('pasta_arroces_080', 6, 'limon', 'Limón', 1, 'ud'),
  ('pasta_arroces_080', 7, 'perejil', 'Perejil', 5, 'g'),
  ('pasta_arroces_081', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_081', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('pasta_arroces_081', 2, 'guisantes', 'Guisantes', 60, 'g'),
  ('pasta_arroces_081', 3, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('pasta_arroces_081', 4, 'jamon-york', 'Jamón cocido', 60, 'g'),
  ('pasta_arroces_081', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_081', 6, 'salsa-soja', 'Salsa de soja', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_082', 0, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_082', 1, 'pato', 'Muslos de pato', 300, 'g'),
  ('pasta_arroces_082', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_082', 3, 'zanahoria', 'Zanahoria', 50, 'g'),
  ('pasta_arroces_082', 4, 'puerro', 'Puerro', 50, 'g'),
  ('pasta_arroces_082', 5, 'vino-tinto', 'Vino tinto', 60, 'ml'),
  ('pasta_arroces_082', 6, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('pasta_arroces_082', 7, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('pasta_arroces_082', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_082', 9, 'tomillo', 'Tomillo', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_083', 0, 'fideos', 'Fideos gordos', 200, 'g'),
  ('pasta_arroces_083', 1, 'costilla', 'Costillas de cerdo troceadas', 300, 'g'),
  ('pasta_arroces_083', 2, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('pasta_arroces_083', 3, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_083', 4, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_083', 5, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_083', 6, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('pasta_arroces_083', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_083', 8, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('pasta_arroces_084', 0, 'fusilli', 'Fusilli', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_084', 1, 'tomate-seco', 'Tomates secos en aceite', 60, 'g'),
  ('pasta_arroces_084', 2, 'pinones', 'Piñones', 20, 'g'),
  ('pasta_arroces_084', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_084', 4, 'parmesano', 'Queso parmesano', 25, 'g'),
  ('pasta_arroces_084', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_084', 6, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('pasta_arroces_085', 0, 'tallarines', 'Nidos de tallarines', 200, 'g'),
  ('pasta_arroces_085', 1, 'carne-picada', 'Carne picada de ternera', 250, 'g'),
  ('pasta_arroces_085', 2, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('pasta_arroces_085', 3, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_085', 4, 'zanahoria', 'Zanahoria', 40, 'g'),
  ('pasta_arroces_085', 5, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_085', 6, 'mozzarella', 'Queso mozzarella rallado', 60, 'g'),
  ('pasta_arroces_085', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_085', 8, 'oregano', 'Orégano', 3, 'g'),
  ('pasta_arroces_086', 0, 'macarrones', 'Macarrones', 200, 'g'),
  ('pasta_arroces_086', 1, 'atun', 'Atún en aceite', 160, 'g'),
  ('pasta_arroces_086', 2, 'tomate-frito', 'Tomate frito', 100, 'ml'),
  ('pasta_arroces_086', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('pasta_arroces_086', 4, 'leche', 'Leche entera', 400, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_086', 5, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('pasta_arroces_086', 6, 'harina', 'Harina', 30, 'g'),
  ('pasta_arroces_086', 7, 'queso', 'Queso rallado', 40, 'g'),
  ('pasta_arroces_086', 8, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('pasta_arroces_087', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_087', 1, 'almejas', 'Almejas', 400, 'g'),
  ('pasta_arroces_087', 2, 'ajo', 'Ajo', 15, 'g'),
  ('pasta_arroces_087', 3, 'guindilla', 'Guindilla fresca', 5, 'g'),
  ('pasta_arroces_087', 4, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_087', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_087', 6, 'perejil', 'Perejil', 8, 'g'),
  ('pasta_arroces_088', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_088', 1, 'sepia', 'Sepia', 250, 'g'),
  ('pasta_arroces_088', 2, 'tinta-de-calamar', 'Tinta de calamar', 8, 'g'),
  ('pasta_arroces_088', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_088', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pasta_arroces_088', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pasta_arroces_088', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_088', 7, 'caldo-de-pescado', 'Caldo de pescado', 450, 'ml'),
  ('pasta_arroces_089', 0, 'espaguetis', 'Espaguetis', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_089', 1, 'calabacin', 'Calabacín', 200, 'g'),
  ('pasta_arroces_089', 2, 'gambas', 'Gambas peladas', 200, 'g'),
  ('pasta_arroces_089', 3, 'ajo', 'Ajo', 15, 'g'),
  ('pasta_arroces_089', 4, 'guindilla', 'Guindilla', 2, 'g'),
  ('pasta_arroces_089', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_089', 6, 'perejil', 'Perejil', 5, 'g'),
  ('pasta_arroces_090', 0, 'penne', 'Penne', 200, 'g'),
  ('pasta_arroces_090', 1, 'queso-feta', 'Queso feta', 200, 'g'),
  ('pasta_arroces_090', 2, 'tomate-cherry', 'Tomates cherry', 300, 'g'),
  ('pasta_arroces_090', 3, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_090', 4, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('pasta_arroces_090', 5, 'albahaca', 'Albahaca fresca', 8, 'g'),
  ('pasta_arroces_090', 6, 'oregano', 'Orégano', 3, 'g'),
  ('pasta_arroces_091', 0, 'penne', 'Penne', 200, 'g'),
  ('pasta_arroces_091', 1, 'panceta', 'Panceta ahumada', 120, 'g'),
  ('pasta_arroces_091', 2, 'tomate-triturado', 'Tomate triturado', 200, 'ml'),
  ('pasta_arroces_091', 3, 'vodka', 'Vodka', 50, 'ml'),
  ('pasta_arroces_091', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('pasta_arroces_091', 5, 'cebolla', 'Cebolla', 50, 'g'),
  ('pasta_arroces_091', 6, 'parmesano', 'Queso parmesano', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_092', 0, 'orzo', 'Orzo', 180, 'g'),
  ('pasta_arroces_092', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 250, 'g'),
  ('pasta_arroces_092', 2, 'espinacas', 'Espinacas frescas', 150, 'g'),
  ('pasta_arroces_092', 3, 'limon', 'Limón', 1, 'ud'),
  ('pasta_arroces_092', 4, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_092', 5, 'caldo-de-pollo', 'Caldo de pollo', 400, 'ml'),
  ('pasta_arroces_092', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pasta_arroces_092', 7, 'queso-feta', 'Queso feta', 40, 'g'),
  ('pasta_arroces_093', 0, 'espaguetis', 'Espaguetis', 200, 'g'),
  ('pasta_arroces_093', 1, 'tomate-triturado', 'Tomate triturado', 400, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_093', 2, 'ajo', 'Ajo', 15, 'g'),
  ('pasta_arroces_093', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_093', 4, 'caldo-de-verduras', 'Caldo de verduras', 300, 'ml'),
  ('pasta_arroces_093', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_093', 6, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('pasta_arroces_093', 7, 'parmesano', 'Queso parmesano', 20, 'g'),
  ('pasta_arroces_094', 0, 'macarrones', 'Macarrones', 180, 'g'),
  ('pasta_arroces_094', 1, 'tomate-triturado', 'Tomate triturado', 300, 'ml'),
  ('pasta_arroces_094', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pasta_arroces_094', 3, 'ajo', 'Ajo', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_094', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pasta_arroces_094', 5, 'oregano', 'Orégano', 2, 'g'),
  ('pasta_arroces_094', 6, 'queso', 'Queso rallado curado', 50, 'g'),
  ('pasta_arroces_094', 7, 'sal', 'Sal', 3, 'g'),
  ('pasta_arroces_095', 0, 'pasta-corta', 'Pasta corta', 180, 'g'),
  ('pasta_arroces_095', 1, 'champinon', 'Champiñones', 250, 'g'),
  ('pasta_arroces_095', 2, 'bacon', 'Bacon en tiras', 100, 'g'),
  ('pasta_arroces_095', 3, 'ajo', 'Ajo', 2, 'ud'),
  ('pasta_arroces_095', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('pasta_arroces_095', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_096', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_096', 1, 'tomate-frito', 'Tomate frito', 150, 'g'),
  ('pasta_arroces_096', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('pasta_arroces_096', 3, 'platano', 'Plátano', 2, 'ud'),
  ('pasta_arroces_096', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pasta_arroces_097', 0, 'macarrones', 'Macarrones', 180, 'g'),
  ('pasta_arroces_097', 1, 'chorizo', 'Chorizo', 120, 'g'),
  ('pasta_arroces_097', 2, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pasta_arroces_097', 3, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('pasta_arroces_097', 4, 'queso', 'Queso rallado', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_097', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('pasta_arroces_098', 0, 'espaguetis', 'Espaguetis', 180, 'g'),
  ('pasta_arroces_098', 1, 'tomate-triturado', 'Tomate triturado', 250, 'ml'),
  ('pasta_arroces_098', 2, 'ajo', 'Ajo', 2, 'ud'),
  ('pasta_arroces_098', 3, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('pasta_arroces_098', 4, 'parmesano', 'Queso parmesano', 40, 'g'),
  ('pasta_arroces_098', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_099', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_099', 1, 'calabacin', 'Calabacín', 1, 'ud'),
  ('pasta_arroces_099', 2, 'pimiento-rojo', 'Pimiento rojo', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_099', 3, 'zanahoria', 'Zanahoria', 1, 'ud'),
  ('pasta_arroces_099', 4, 'cebolla', 'Cebolla', 0.5, 'ud'),
  ('pasta_arroces_099', 5, 'caldo-de-verduras', 'Caldo de verduras', 550, 'ml'),
  ('pasta_arroces_099', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_100', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 400, 'g'),
  ('pasta_arroces_100', 1, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_100', 2, 'tomate', 'Tomate maduro', 300, 'g'),
  ('pasta_arroces_100', 3, 'cebolla', 'Cebolla', 150, 'g'),
  ('pasta_arroces_100', 4, 'cayena', 'Chile fresco', 5, 'g'),
  ('pasta_arroces_100', 5, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_100', 6, 'aguacate', 'Aguacate', 1, 'ud'),
  ('pasta_arroces_100', 7, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pasta_arroces_100', 8, 'sal', 'Sal', 4, 'g'),
  ('pasta_arroces_101', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 400, 'g'),
  ('pasta_arroces_101', 1, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_101', 2, 'pimiento-rojo', 'Pimiento rojo', 1, 'ud'),
  ('pasta_arroces_101', 3, 'cebolla', 'Cebolla', 100, 'g'),
  ('pasta_arroces_101', 4, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('pasta_arroces_101', 5, 'vinagre', 'Vinagre de vino', 25, 'ml'),
  ('pasta_arroces_101', 6, 'azucar', 'Azúcar', 25, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_101', 7, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('pasta_arroces_101', 8, 'maicena', 'Maicena', 15, 'g'),
  ('pasta_arroces_101', 9, 'aceite-girasol', 'Aceite de girasol', 40, 'ml'),
  ('pasta_arroces_102', 0, 'arroz', 'Arroz', 180, 'g'),
  ('pasta_arroces_102', 1, 'huevos', 'Huevo', 3, 'ud'),
  ('pasta_arroces_102', 2, 'guisantes', 'Guisantes', 120, 'g'),
  ('pasta_arroces_102', 3, 'jamon-york', 'Jamón cocido', 100, 'g'),
  ('pasta_arroces_102', 4, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('pasta_arroces_102', 5, 'cebolleta', 'Cebolleta', 50, 'g'),
  ('pasta_arroces_102', 6, 'salsa-soja', 'Salsa de soja', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_102', 7, 'aceite-girasol', 'Aceite de girasol', 30, 'ml'),
  ('pescados_001', 0, 'merluza', 'Merluza en rodajas', 350, 'g'),
  ('pescados_001', 1, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_001', 2, 'harina', 'Harina', 10, 'g'),
  ('pescados_001', 3, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_001', 4, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_001', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_001', 6, 'guisantes', 'Guisantes', 50, 'g'),
  ('pescados_002', 0, 'salmon', 'Lomos de salmón', 300, 'g'),
  ('pescados_002', 1, 'patata', 'Patata', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_002', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('pescados_002', 3, 'limon', 'Limón', 1, 'ud'),
  ('pescados_002', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_002', 5, 'eneldo', 'Eneldo', 3, 'g'),
  ('pescados_003', 0, 'bacalao', 'Bacalao desalado', 350, 'g'),
  ('pescados_003', 1, 'tomate-triturado', 'Tomate triturado', 250, 'ml'),
  ('pescados_003', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('pescados_003', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_003', 4, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('pescados_003', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_004', 0, 'sardinas', 'Sardinas', 400, 'g'),
  ('pescados_004', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_004', 2, 'ajo', 'Ajo', 6, 'g'),
  ('pescados_004', 3, 'limon', 'Limón', 1, 'ud'),
  ('pescados_004', 4, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_005', 0, 'lubina', 'Lubina entera', 500, 'g'),
  ('pescados_005', 1, 'patata', 'Patata', 150, 'g'),
  ('pescados_005', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('pescados_005', 3, 'limon', 'Limón', 1, 'ud'),
  ('pescados_005', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_005', 5, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_006', 0, 'atun-fresco', 'Rodajas de atún fresco', 300, 'g'),
  ('pescados_006', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_006', 2, 'ajo', 'Ajo', 6, 'g'),
  ('pescados_006', 3, 'limon', 'Limón', 1, 'ud'),
  ('pescados_007', 0, 'merluza', 'Merluza en rodajas', 350, 'g'),
  ('pescados_007', 1, 'harina', 'Harina', 40, 'g'),
  ('pescados_007', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_007', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_007', 4, 'limon', 'Limón', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_008', 0, 'dorada', 'Dorada entera', 500, 'g'),
  ('pescados_008', 1, 'patata', 'Patata', 150, 'g'),
  ('pescados_008', 2, 'tomate', 'Tomate', 100, 'g'),
  ('pescados_008', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('pescados_008', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_008', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_009', 0, 'salmon', 'Lomos de salmón', 300, 'g'),
  ('pescados_009', 1, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('pescados_009', 2, 'limon', 'Limón', 1, 'ud'),
  ('pescados_009', 3, 'eneldo', 'Eneldo', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_010', 0, 'bacalao', 'Bacalao desalado', 350, 'g'),
  ('pescados_010', 1, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('pescados_010', 2, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_010', 3, 'guindilla', 'Guindilla', 1, 'ud'),
  ('pescados_011', 0, 'calamar', 'Calamares', 300, 'g'),
  ('pescados_011', 1, 'harina', 'Harina', 60, 'g'),
  ('pescados_011', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_011', 3, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('pescados_011', 4, 'limon', 'Limón', 1, 'ud'),
  ('pescados_012', 0, 'gambas', 'Gambas peladas', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_012', 1, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_012', 2, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_012', 3, 'guindilla', 'Guindilla', 1, 'ud'),
  ('pescados_012', 4, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_013', 0, 'merluza-lomos', 'Merluza en lomos', 350, 'g'),
  ('pescados_013', 1, 'patata', 'Patata', 150, 'g'),
  ('pescados_013', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('pescados_013', 3, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('pescados_013', 4, 'tomate', 'Tomate', 80, 'g'),
  ('pescados_013', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_013', 6, 'limon', 'Limón', 1, 'ud'),
  ('pescados_014', 0, 'bacalao', 'Bacalao desalado', 350, 'g'),
  ('pescados_014', 1, 'harina', 'Harina', 40, 'g'),
  ('pescados_014', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_014', 3, 'aceite-oliva', 'Aceite de oliva', 45, 'ml'),
  ('pescados_014', 4, 'limon', 'Limón', 1, 'ud'),
  ('pescados_015', 0, 'truchas-enteras', 'Truchas enteras', 400, 'g'),
  ('pescados_015', 1, 'jamon', 'Jamón serrano', 60, 'g'),
  ('pescados_015', 2, 'harina', 'Harina', 20, 'g'),
  ('pescados_015', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_015', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_015', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_016', 0, 'monkfish', 'Rape', 350, 'g'),
  ('pescados_016', 1, 'almejas', 'Almejas', 100, 'g'),
  ('pescados_016', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pescados_016', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_016', 4, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_016', 5, 'harina', 'Harina', 10, 'g'),
  ('pescados_016', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_016', 7, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_017', 0, 'merluza-lomos', 'Merluza en lomos', 300, 'g'),
  ('pescados_017', 1, 'pan-rallado', 'Pan rallado', 50, 'g'),
  ('pescados_017', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_017', 3, 'harina', 'Harina', 25, 'g'),
  ('pescados_017', 4, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_018', 0, 'salmon', 'Lomos de salmón', 300, 'g'),
  ('pescados_018', 1, 'calabacin', 'Calabacín', 100, 'g'),
  ('pescados_018', 2, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('pescados_018', 3, 'puerro', 'Puerro', 60, 'g'),
  ('pescados_018', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_018', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_018', 6, 'eneldo', 'Eneldo', 3, 'g'),
  ('pescados_019', 0, 'atun-fresco', 'Atún fresco', 300, 'g'),
  ('pescados_019', 1, 'cebolla', 'Cebolla', 200, 'g'),
  ('pescados_019', 2, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pescados_019', 3, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('pescados_019', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_019', 5, 'laurel', 'Laurel', 1, 'ud'),
  ('pescados_020', 0, 'rodajas-de-emperador', 'Rodajas de emperador', 300, 'g'),
  ('pescados_020', 1, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_020', 2, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_020', 3, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_020', 4, 'limon', 'Limón', 1, 'ud'),
  ('pescados_021', 0, 'fideo-mediano', 'Fideos n°2', 180, 'g'),
  ('pescados_021', 1, 'gambas', 'Gambas', 150, 'g'),
  ('pescados_021', 2, 'sepia', 'Sepia', 100, 'g'),
  ('pescados_021', 3, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pescados_021', 4, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_021', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_021', 6, 'pimenton', 'Pimentón', 4, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_021', 7, 'caldo-de-pescado', 'Caldo de pescado', 400, 'ml'),
  ('pescados_022', 0, 'merluza', 'Rosada en lomos', 350, 'g'),
  ('pescados_022', 1, 'limon', 'Limón', 1, 'ud'),
  ('pescados_022', 2, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_022', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_022', 4, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_022', 5, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('pescados_023', 0, 'caballa', 'Caballa', 350, 'g'),
  ('pescados_023', 1, 'limon', 'Limón', 1, 'ud'),
  ('pescados_023', 2, 'ajo', 'Ajo', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_023', 3, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_023', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_024', 0, 'pescadilla', 'Pescadilla en lomos', 350, 'g'),
  ('pescados_024', 1, 'patata', 'Patata', 150, 'g'),
  ('pescados_024', 2, 'cebolla', 'Cebolla', 70, 'g'),
  ('pescados_024', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_024', 4, 'limon', 'Limón', 1, 'ud'),
  ('pescados_024', 5, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_025', 0, 'calamar', 'Calamares', 300, 'g'),
  ('pescados_025', 1, 'cebolla', 'Cebolla', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_025', 2, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_025', 3, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_025', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_025', 5, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_025', 6, 'laurel', 'Laurel', 1, 'ud'),
  ('pescados_026', 0, 'pan', 'Pan de masa madre', 4, 'ud'),
  ('pescados_026', 1, 'aguacate', 'Aguacate', 200, 'g'),
  ('pescados_026', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('pescados_026', 3, 'salmon-ahumado', 'Salmón ahumado', 100, 'g'),
  ('pescados_026', 4, 'vinagre', 'Vinagre', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_026', 5, 'limon', 'Zumo de limón', 10, 'ml'),
  ('pescados_026', 6, 'eneldo', 'Eneldo fresco', 5, 'g'),
  ('pescados_026', 7, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 10, 'ml'),
  ('pescados_026', 8, 'sal', 'Sal', 2, 'g'),
  ('pescados_026', 9, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pescados_027', 0, 'arroz', 'Arroz sushi', 160, 'g'),
  ('pescados_027', 1, 'salmon-fresco', 'Salmón fresco para sushi', 200, 'g'),
  ('pescados_027', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_027', 3, 'edamame', 'Edamame desvainado', 100, 'g'),
  ('pescados_027', 4, 'zanahoria', 'Zanahoria', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_027', 5, 'pepino', 'Pepino', 80, 'g'),
  ('pescados_027', 6, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('pescados_027', 7, 'vinagre', 'Vinagre de arroz', 15, 'ml'),
  ('pescados_027', 8, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('pescados_027', 9, 'sesamo', 'Semillas de sésamo', 6, 'g'),
  ('pescados_027', 10, 'alga-nori', 'Alga nori', 2, 'g'),
  ('pescados_028', 0, 'pan', 'Pan de centeno', 4, 'ud'),
  ('pescados_028', 1, 'queso-crema', 'Queso crema', 100, 'g'),
  ('pescados_028', 2, 'salmon-ahumado', 'Salmón ahumado', 120, 'g'),
  ('pescados_028', 3, 'eneldo', 'Eneldo fresco', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_028', 4, 'limon', 'Zumo de limón', 5, 'ml'),
  ('pescados_028', 5, 'alcaparras', 'Alcaparras', 15, 'g'),
  ('pescados_028', 6, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pescados_029', 0, 'arroz', 'Arroz blanco', 160, 'g'),
  ('pescados_029', 1, 'atun-fresco', 'Atún fresco para sushi', 220, 'g'),
  ('pescados_029', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_029', 3, 'mango', 'Mango', 100, 'g'),
  ('pescados_029', 4, 'cebolleta', 'Cebolleta', 30, 'g'),
  ('pescados_029', 5, 'salsa-soja', 'Salsa de soja', 25, 'ml'),
  ('pescados_029', 6, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_029', 7, 'sesamo', 'Semillas de sésamo', 6, 'g'),
  ('pescados_029', 8, 'lima', 'Lima', 1, 'ud'),
  ('pescados_030', 0, 'tortilla-de-trigo', 'Tortilla de trigo', 2, 'ud'),
  ('pescados_030', 1, 'atun-lata', 'Atún en conserva escurrido', 160, 'g'),
  ('pescados_030', 2, 'maiz', 'Maíz dulce', 80, 'g'),
  ('pescados_030', 3, 'tomate', 'Tomate', 100, 'g'),
  ('pescados_030', 4, 'lechuga', 'Lechuga', 40, 'g'),
  ('pescados_030', 5, 'mayonesa', 'Mayonesa', 40, 'g'),
  ('pescados_030', 6, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('pescados_031', 0, 'pan-de-payes', 'Pan de payés', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_031', 1, 'tomate', 'Tomate maduro', 200, 'g'),
  ('pescados_031', 2, 'anchoa-en-aceite', 'Anchoas en aceite', 60, 'g'),
  ('pescados_031', 3, 'ajo', 'Ajo', 5, 'g'),
  ('pescados_031', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('pescados_031', 5, 'sal', 'Sal', 2, 'g'),
  ('pescados_033', 0, 'atun-fresco', 'Lomo de atún fresco', 300, 'g'),
  ('pescados_033', 1, 'tomate', 'Tomate', 200, 'g'),
  ('pescados_033', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_033', 3, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('pescados_033', 4, 'vinagre-de-jerez', 'Vinagre de Jerez', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_033', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('pescados_033', 6, 'sal', 'Sal', 3, 'g'),
  ('pescados_033', 7, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pescados_034', 0, 'gambas', 'Gambas peladas', 300, 'g'),
  ('pescados_034', 1, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_034', 2, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_034', 3, 'tomate-cherry', 'Tomates cherry', 150, 'g'),
  ('pescados_034', 4, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_034', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('pescados_034', 6, 'limon', 'Zumo de limón', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_034', 7, 'sal', 'Sal', 3, 'g'),
  ('pescados_035', 0, 'langostinos', 'Langostinos pelados', 300, 'g'),
  ('pescados_035', 1, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_035', 2, 'pomelo', 'Pomelo', 200, 'g'),
  ('pescados_035', 3, 'menta', 'Menta fresca', 8, 'g'),
  ('pescados_035', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('pescados_035', 5, 'lima', 'Zumo de lima', 15, 'ml'),
  ('pescados_035', 6, 'sal', 'Sal', 3, 'g'),
  ('pescados_035', 7, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pescados_036', 0, 'lubina', 'Lubina entera limpia', 800, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_036', 1, 'sal-gruesa', 'Sal gruesa', 1500, 'g'),
  ('pescados_036', 2, 'clara-de-huevo', 'Clara de huevo', 2, 'ud'),
  ('pescados_036', 3, 'romero', 'Romero fresco', 10, 'g'),
  ('pescados_036', 4, 'tomillo', 'Tomillo fresco', 10, 'g'),
  ('pescados_036', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_036', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('pescados_037', 0, 'rodaballo', 'Lomos de rodaballo', 350, 'g'),
  ('pescados_037', 1, 'gambas', 'Gambas peladas', 100, 'g'),
  ('pescados_037', 2, 'chalota', 'Chalota', 40, 'g'),
  ('pescados_037', 3, 'vino-blanco', 'Vino blanco', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_037', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('pescados_037', 5, 'caldo-de-pescado', 'Fumet de pescado', 100, 'ml'),
  ('pescados_037', 6, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('pescados_037', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_037', 8, 'sal', 'Sal', 3, 'g'),
  ('pescados_037', 9, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pescados_038', 0, 'atun', 'Atún rojo fresco de calidad sashimi', 250, 'g'),
  ('pescados_038', 1, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_038', 2, 'cebolleta', 'Cebolleta', 20, 'g'),
  ('pescados_038', 3, 'salsa-soja', 'Salsa de soja', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_038', 4, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('pescados_038', 5, 'sesamo', 'Semillas de sésamo', 8, 'g'),
  ('pescados_038', 6, 'jengibre', 'Jengibre fresco', 5, 'g'),
  ('pescados_038', 7, 'lima', 'Lima', 1, 'ud'),
  ('pescados_038', 8, 'sal', 'Sal', 2, 'g'),
  ('pescados_039', 0, 'corvina', 'Corvina fresca', 300, 'g'),
  ('pescados_039', 1, 'lima', 'Lima', 4, 'ud'),
  ('pescados_039', 2, 'cebolla-morada', 'Cebolla morada', 60, 'g'),
  ('pescados_039', 3, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('pescados_039', 4, 'guindilla', 'Ají amarillo o guindilla fresca', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_039', 5, 'jengibre', 'Jengibre fresco', 5, 'g'),
  ('pescados_039', 6, 'apio', 'Apio', 20, 'g'),
  ('pescados_039', 7, 'sal', 'Sal', 3, 'g'),
  ('pescados_039', 8, 'maiz', 'Maíz tostado', 40, 'g'),
  ('pescados_040', 0, 'vieira', 'Vieiras limpias', 6, 'ud'),
  ('pescados_040', 1, 'guisantes', 'Guisantes', 250, 'g'),
  ('pescados_040', 2, 'panceta', 'Panceta ahumada en lonchas finas', 60, 'g'),
  ('pescados_040', 3, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('pescados_040', 4, 'caldo-de-verduras', 'Caldo de verduras', 80, 'ml'),
  ('pescados_040', 5, 'menta', 'Menta fresca', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_040', 6, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('pescados_040', 7, 'sal', 'Sal', 2, 'g'),
  ('pescados_040', 8, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pescados_041', 0, 'merluza', 'Merluza en trozos', 300, 'g'),
  ('pescados_041', 1, 'merluza', 'Kokotxas de merluza', 150, 'g'),
  ('pescados_041', 2, 'almejas', 'Almejas', 250, 'g'),
  ('pescados_041', 3, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_041', 4, 'perejil', 'Perejil', 15, 'g'),
  ('pescados_041', 5, 'harina', 'Harina', 10, 'g'),
  ('pescados_041', 6, 'vino-blanco', 'Vino blanco', 50, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_041', 7, 'caldo-de-pescado', 'Caldo de pescado', 150, 'ml'),
  ('pescados_041', 8, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 40, 'ml'),
  ('pescados_041', 9, 'sal', 'Sal', 3, 'g'),
  ('pescados_042', 0, 'bacalao', 'Kokotxas de bacalao', 400, 'g'),
  ('pescados_042', 1, 'ajo', 'Ajo', 30, 'g'),
  ('pescados_042', 2, 'guindilla', 'Guindilla', 3, 'g'),
  ('pescados_042', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 120, 'ml'),
  ('pescados_042', 4, 'sal', 'Sal', 2, 'g'),
  ('pescados_043', 0, 'cigala', 'Cigalas frescas', 8, 'ud'),
  ('pescados_043', 1, 'huevos', 'Huevo', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_043', 2, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_043', 3, 'aceite-oliva', 'Aceite de oliva suave', 150, 'ml'),
  ('pescados_043', 4, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('pescados_043', 5, 'limon', 'Zumo de limón', 10, 'ml'),
  ('pescados_043', 6, 'sal', 'Sal', 3, 'g'),
  ('pescados_044', 0, 'bogavante', 'Bogavante', 800, 'g'),
  ('pescados_044', 1, 'arroz-bomba', 'Arroz bomba', 320, 'g'),
  ('pescados_044', 2, 'tomate-triturado', 'Tomate triturado', 150, 'g'),
  ('pescados_044', 3, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('pescados_044', 4, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_044', 5, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_044', 6, 'caldo-de-marisco', 'Caldo de pescado y marisco', 900, 'ml'),
  ('pescados_044', 7, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 40, 'ml'),
  ('pescados_044', 8, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('pescados_044', 9, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('pescados_044', 10, 'sal', 'Sal', 5, 'g'),
  ('pescados_045', 0, 'salmon-fresco', 'Lomo de salmón fresco con piel', 600, 'g'),
  ('pescados_045', 1, 'sal-gruesa', 'Sal gruesa', 100, 'g'),
  ('pescados_045', 2, 'azucar', 'Azúcar', 80, 'g'),
  ('pescados_045', 3, 'eneldo', 'Eneldo fresco', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_045', 4, 'pimienta', 'Pimienta negra en grano machacada', 5, 'g'),
  ('pescados_045', 5, 'mostaza', 'Mostaza de Dijon', 40, 'g'),
  ('pescados_045', 6, 'miel', 'Miel', 20, 'g'),
  ('pescados_045', 7, 'vinagre', 'Vinagre de vino blanco', 10, 'ml'),
  ('pescados_045', 8, 'aceite-girasol', 'Aceite de girasol', 30, 'ml'),
  ('pescados_046', 0, 'bacalao', 'Bacalao desalado y desmigado', 300, 'g'),
  ('pescados_046', 1, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('pescados_046', 2, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('pescados_046', 3, 'tomate-triturado', 'Tomate triturado', 200, 'g'),
  ('pescados_046', 4, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_046', 5, 'ajo', 'Ajo', 20, 'g'),
  ('pescados_046', 6, 'guindilla', 'Guindilla', 2, 'g'),
  ('pescados_046', 7, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 40, 'ml'),
  ('pescados_046', 8, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_047', 0, 'bacalao', 'Bacalao desalado en lomos', 350, 'g'),
  ('pescados_047', 1, 'pimiento-choricero', 'Pimientos choriceros', 4, 'ud'),
  ('pescados_047', 2, 'cebolla', 'Cebolla', 200, 'g'),
  ('pescados_047', 3, 'tomate-triturado', 'Tomate triturado', 100, 'g'),
  ('pescados_047', 4, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_047', 5, 'pan', 'Pan frito', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_047', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 40, 'ml'),
  ('pescados_047', 7, 'sal', 'Sal', 2, 'g'),
  ('pescados_048', 0, 'gambas', 'Gambas frescas o congeladas', 350, 'g'),
  ('pescados_048', 1, 'ajo', 'Ajo', 25, 'g'),
  ('pescados_048', 2, 'guindilla', 'Guindilla', 6, 'g'),
  ('pescados_048', 3, 'vino-blanco', 'Vino de Jerez', 40, 'ml'),
  ('pescados_048', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 60, 'ml'),
  ('pescados_048', 5, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_048', 6, 'sal', 'Sal', 2, 'g'),
  ('pescados_049', 0, 'navaja', 'Navajas frescas', 500, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_049', 1, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_049', 2, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_049', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('pescados_049', 4, 'limon', 'Limón', 1, 'ud'),
  ('pescados_049', 5, 'sal', 'Sal', 2, 'g'),
  ('pescados_050', 0, 'zamburina', 'Carne de zamburiña', 240, 'g'),
  ('pescados_050', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('pescados_050', 2, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_050', 3, 'pan-rallado', 'Pan rallado', 30, 'g'),
  ('pescados_050', 4, 'queso', 'Queso rallado', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_050', 5, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_050', 6, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('pescados_050', 7, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('pescados_050', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_051', 0, 'salmon-fresco', 'Salmón fresco calidad sashimi', 240, 'g'),
  ('pescados_051', 1, 'mango', 'Mango maduro', 150, 'g'),
  ('pescados_051', 2, 'lima', 'Lima', 2, 'ud'),
  ('pescados_051', 3, 'cebolleta', 'Cebolleta', 20, 'g'),
  ('pescados_051', 4, 'salsa-soja', 'Salsa de soja', 15, 'ml'),
  ('pescados_051', 5, 'aceite-de-sesamo', 'Aceite de sésamo', 5, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_051', 6, 'cilantro', 'Cilantro fresco', 8, 'g'),
  ('pescados_051', 7, 'sesamo', 'Sésamo tostado', 5, 'g'),
  ('pescados_052', 0, 'monkfish', 'Rape', 250, 'g'),
  ('pescados_052', 1, 'merluza', 'Merluza en rodajas', 200, 'g'),
  ('pescados_052', 2, 'gambas', 'Gambas peladas', 150, 'g'),
  ('pescados_052', 3, 'mejillones', 'Mejillones', 200, 'g'),
  ('pescados_052', 4, 'patata', 'Patata', 500, 'g'),
  ('pescados_052', 5, 'cebolla', 'Cebolla', 120, 'g'),
  ('pescados_052', 6, 'tomate-triturado', 'Tomate triturado', 100, 'g'),
  ('pescados_052', 7, 'pimiento-rojo', 'Pimiento rojo', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_052', 8, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_052', 9, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_052', 10, 'caldo-de-pescado', 'Caldo de pescado', 500, 'ml'),
  ('pescados_052', 11, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('pescados_052', 12, 'aceite-oliva', 'Aceite de oliva', 35, 'ml'),
  ('pescados_052', 13, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_053', 0, 'calamar', 'Calamares medianos limpios con tinta', 800, 'g'),
  ('pescados_053', 1, 'tinta-de-calamar', 'Bolsas de tinta de calamar', 4, 'ud'),
  ('pescados_053', 2, 'jamon', 'Jamón serrano en tacos', 50, 'g'),
  ('pescados_053', 3, 'cebolla', 'Cebolla', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_053', 4, 'pimiento-verde', 'Pimiento verde', 100, 'g'),
  ('pescados_053', 5, 'tomate-triturado', 'Tomate triturado', 250, 'g'),
  ('pescados_053', 6, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_053', 7, 'pan-rallado', 'Pan rallado', 30, 'g'),
  ('pescados_053', 8, 'huevos', 'Huevo cocido', 2, 'ud'),
  ('pescados_053', 9, 'vino-blanco', 'Vino blanco', 100, 'ml'),
  ('pescados_053', 10, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_053', 11, 'harina', 'Harina', 15, 'g'),
  ('pescados_053', 12, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_054', 0, 'merluza-lomos', 'Lomos de merluza', 320, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_054', 1, 'limon', 'Limón', 1, 'ud'),
  ('pescados_054', 2, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_054', 3, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_054', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_056', 0, 'lenguado', 'Filetes de lenguado', 320, 'g'),
  ('pescados_056', 1, 'harina', 'Harina', 20, 'g'),
  ('pescados_056', 2, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('pescados_056', 3, 'limon', 'Limón', 1, 'ud'),
  ('pescados_056', 4, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_056', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_057', 0, 'rodajas-de-emperador', 'Rodajas de emperador', 320, 'g'),
  ('pescados_057', 1, 'tomate-triturado', 'Tomate triturado', 150, 'g'),
  ('pescados_057', 2, 'albahaca', 'Albahaca fresca', 10, 'g'),
  ('pescados_057', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_057', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_057', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_058', 0, 'corvina', 'Corvina fresca en lomo limpio', 300, 'g'),
  ('pescados_058', 1, 'lima', 'Lima', 4, 'ud'),
  ('pescados_058', 2, 'aji-amarillo', 'Ají amarillo', 15, 'g'),
  ('pescados_058', 3, 'cebolla-morada', 'Cebolla morada', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_058', 4, 'cilantro', 'Cilantro fresco', 8, 'g'),
  ('pescados_058', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_059', 0, 'salmon-fresco', 'Salmón fresco calidad sashimi', 240, 'g'),
  ('pescados_059', 1, 'naranja', 'Naranja', 1, 'ud'),
  ('pescados_059', 2, 'pomelo', 'Pomelo', 1, 'ud'),
  ('pescados_059', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('pescados_059', 4, 'eneldo', 'Eneldo fresco', 5, 'g'),
  ('pescados_059', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_060', 0, 'boquerones', 'Boquerones frescos limpios en lomos', 320, 'g'),
  ('pescados_060', 1, 'vinagre', 'Vinagre de vino blanco', 200, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_060', 2, 'agua', 'Agua', 100, 'ml'),
  ('pescados_060', 3, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_060', 4, 'perejil', 'Perejil', 15, 'g'),
  ('pescados_060', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('pescados_060', 6, 'sal', 'Sal', 10, 'g'),
  ('pescados_061', 0, 'salmon', 'Lomos de salmón', 320, 'g'),
  ('pescados_061', 1, 'mostaza', 'Mostaza de Dijon', 25, 'g'),
  ('pescados_061', 2, 'eneldo', 'Eneldo fresco', 8, 'g'),
  ('pescados_061', 3, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('pescados_061', 4, 'miel', 'Miel', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_061', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_062', 0, 'merluza-lomos', 'Lomos de merluza', 320, 'g'),
  ('pescados_062', 1, 'harina', 'Harina', 30, 'g'),
  ('pescados_062', 2, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_062', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_062', 4, 'patata', 'Patata', 400, 'g'),
  ('pescados_062', 5, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_062', 6, 'mayonesa', 'Mayonesa', 35, 'g'),
  ('pescados_062', 7, 'limon', 'Limón', 1, 'ud'),
  ('pescados_063', 0, 'bacalao', 'Lomos de bacalao desalado', 320, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_063', 1, 'harina', 'Harina', 15, 'g'),
  ('pescados_063', 2, 'patata', 'Patata', 400, 'g'),
  ('pescados_063', 3, 'aceite-oliva', 'Aceite de oliva', 35, 'ml'),
  ('pescados_063', 4, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_063', 5, 'mayonesa', 'Mayonesa', 40, 'g'),
  ('pescados_063', 6, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_064', 0, 'lubina', 'Filetes de lubina', 320, 'g'),
  ('pescados_064', 1, 'alcaparras', 'Alcaparras', 20, 'g'),
  ('pescados_064', 2, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('pescados_064', 3, 'limon', 'Limón', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_064', 4, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_064', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_065', 0, 'monkfish', 'Medallones de rape', 350, 'g'),
  ('pescados_065', 1, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_065', 2, 'perejil', 'Perejil', 15, 'g'),
  ('pescados_065', 3, 'harina', 'Harina', 10, 'g'),
  ('pescados_065', 4, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('pescados_065', 5, 'caldo-de-pescado', 'Caldo de pescado', 50, 'ml'),
  ('pescados_065', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_066', 0, 'salmon', 'Lomos de salmón', 320, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_066', 1, 'salsa-soja', 'Salsa de soja', 40, 'ml'),
  ('pescados_066', 2, 'miel', 'Miel', 25, 'g'),
  ('pescados_066', 3, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('pescados_066', 4, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_066', 5, 'sesamo', 'Sésamo tostado', 10, 'g'),
  ('pescados_066', 6, 'aceite-de-sesamo', 'Aceite de sésamo', 5, 'ml'),
  ('pescados_066', 7, 'cebolleta', 'Cebolleta', 15, 'g'),
  ('pescados_067', 0, 'atun-fresco', 'Atún fresco', 300, 'g'),
  ('pescados_067', 1, 'cebolla', 'Cebolla', 200, 'g'),
  ('pescados_067', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_067', 3, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('pescados_067', 4, 'tomate-triturado', 'Tomate triturado', 80, 'g'),
  ('pescados_067', 5, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('pescados_067', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_067', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('pescados_068', 0, 'dorada', 'Dorada entera limpia sin escamar', 900, 'g'),
  ('pescados_068', 1, 'sal-gruesa', 'Sal gruesa', 1500, 'g'),
  ('pescados_068', 2, 'tomate', 'Tomate maduro', 100, 'g'),
  ('pescados_068', 3, 'pimiento-choricero', 'Ñora hidratada', 15, 'g'),
  ('pescados_068', 4, 'almendras', 'Almendras tostadas', 25, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_068', 5, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_068', 6, 'pan', 'Pan frito', 20, 'g'),
  ('pescados_068', 7, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('pescados_068', 8, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_069', 0, 'rodajas-de-emperador', 'Rodajas de emperador', 320, 'g'),
  ('pescados_069', 1, 'mayonesa', 'Mayonesa', 45, 'g'),
  ('pescados_069', 2, 'pepinillos', 'Pepinillos en vinagre', 20, 'g'),
  ('pescados_069', 3, 'alcaparras', 'Alcaparras', 15, 'g'),
  ('pescados_069', 4, 'mostaza', 'Mostaza de Dijon', 8, 'g'),
  ('pescados_069', 5, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_069', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_069', 7, 'limon', 'Limón', 1, 'ud'),
  ('pescados_070', 0, 'calamar', 'Chipirones limpios', 400, 'g'),
  ('pescados_070', 1, 'cebolla', 'Cebolla', 220, 'g'),
  ('pescados_070', 2, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_070', 3, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('pescados_070', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_070', 5, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_070', 6, 'laurel', 'Laurel', 1, 'ud'),
  ('pescados_071', 0, 'sepia', 'Sepia limpia', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_071', 1, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_071', 2, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_071', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_071', 4, 'limon', 'Limón', 1, 'ud'),
  ('pescados_072', 0, 'mejillones', 'Mejillones frescos', 800, 'g'),
  ('pescados_072', 1, 'cebolla', 'Cebolla', 100, 'g'),
  ('pescados_072', 2, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_072', 3, 'tomate-triturado', 'Tomate triturado', 100, 'g'),
  ('pescados_072', 4, 'vino-blanco', 'Vino blanco', 80, 'ml'),
  ('pescados_072', 5, 'pimenton', 'Pimentón dulce', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_072', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_072', 7, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_072', 8, 'laurel', 'Laurel', 1, 'ud'),
  ('pescados_073', 0, 'almejas', 'Almejas frescas', 600, 'g'),
  ('pescados_073', 1, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_073', 2, 'harina', 'Harina', 8, 'g'),
  ('pescados_073', 3, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_073', 4, 'caldo-de-pescado', 'Caldo de pescado', 50, 'ml'),
  ('pescados_073', 5, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_073', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_074', 0, 'berberecho', 'Berberechos frescos', 500, 'g'),
  ('pescados_074', 1, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_074', 2, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('pescados_074', 3, 'laurel', 'Laurel', 1, 'ud'),
  ('pescados_074', 4, 'sal-gruesa', 'Sal gorda', 20, 'g'),
  ('pescados_074', 5, 'agua', 'Agua', 1000, 'ml'),
  ('pescados_075', 0, 'boquerones', 'Boquerones limpios', 200, 'g'),
  ('pescados_075', 1, 'calamar', 'Calamar en anillas', 150, 'g'),
  ('pescados_075', 2, 'salmonete', 'Salmonetes pequeños', 150, 'g'),
  ('pescados_075', 3, 'harina', 'Harina fina de trigo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_075', 4, 'aceite-oliva', 'Aceite de oliva suave', 400, 'ml'),
  ('pescados_075', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_075', 6, 'sal', 'Sal', 5, 'g'),
  ('pescados_076', 0, 'bacalao', 'Bacalao desalado desmigado', 250, 'g'),
  ('pescados_076', 1, 'leche', 'Leche entera', 500, 'ml'),
  ('pescados_076', 2, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('pescados_076', 3, 'harina', 'Harina de trigo', 60, 'g'),
  ('pescados_076', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('pescados_076', 5, 'huevos', 'Huevo', 2, 'ud'),
  ('pescados_076', 6, 'pan-rallado', 'Pan rallado', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_076', 7, 'aceite-oliva', 'Aceite de oliva suave', 400, 'ml'),
  ('pescados_076', 8, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_076', 9, 'aceite-girasol', 'Aceite de girasol', 150, 'ml'),
  ('pescados_076', 10, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('pescados_077', 0, 'merluza-lomos', 'Merluza en lomos', 350, 'g'),
  ('pescados_077', 1, 'almejas', 'Almejas', 150, 'g'),
  ('pescados_077', 2, 'sidra', 'Sidra natural', 150, 'ml'),
  ('pescados_077', 3, 'manzana', 'Manzana ácida', 100, 'g'),
  ('pescados_077', 4, 'cebolla', 'Cebolla', 70, 'g'),
  ('pescados_077', 5, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_077', 6, 'harina', 'Harina de trigo', 15, 'g'),
  ('pescados_077', 7, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_077', 8, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_078', 0, 'bacalao', 'Bacalao desalado en lomos', 300, 'g'),
  ('pescados_078', 1, 'calabacin', 'Calabacín', 150, 'g'),
  ('pescados_078', 2, 'berenjena', 'Berenjena', 150, 'g'),
  ('pescados_078', 3, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('pescados_078', 4, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('pescados_078', 5, 'tomate-triturado', 'Tomate triturado', 200, 'g'),
  ('pescados_078', 6, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_078', 7, 'huevos', 'Huevo', 2, 'ud'),
  ('pescados_078', 8, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_078', 9, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_079', 0, 'salmon-fresco', 'Lomo de salmón fresco de calidad sashimi', 280, 'g'),
  ('pescados_079', 1, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_079', 2, 'salsa-soja', 'Salsa de soja', 25, 'ml'),
  ('pescados_079', 3, 'aceite-de-sesamo', 'Aceite de sésamo', 8, 'ml'),
  ('pescados_079', 4, 'cebolleta', 'Cebolleta', 20, 'g'),
  ('pescados_079', 5, 'lima', 'Lima', 1, 'ud'),
  ('pescados_079', 6, 'sesamo', 'Semillas de sésamo', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_079', 7, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('pescados_080', 0, 'lubina', 'Lomo de lubina fresca', 300, 'g'),
  ('pescados_080', 1, 'lima', 'Lima', 4, 'ud'),
  ('pescados_080', 2, 'cebolla-morada', 'Cebolla morada', 60, 'g'),
  ('pescados_080', 3, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('pescados_080', 4, 'cayena', 'Chile fresco', 5, 'g'),
  ('pescados_080', 5, 'jengibre', 'Jengibre fresco', 5, 'g'),
  ('pescados_080', 6, 'apio', 'Apio', 15, 'g'),
  ('pescados_080', 7, 'sal', 'Sal', 4, 'g'),
  ('pescados_081', 0, 'truchas-enteras', 'Trucha limpia sin espinas', 2, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_081', 1, 'jamon', 'Jamón serrano en lonchas finas', 60, 'g'),
  ('pescados_081', 2, 'almendras', 'Almendras laminadas', 30, 'g'),
  ('pescados_081', 3, 'harina', 'Harina de trigo', 20, 'g'),
  ('pescados_081', 4, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_081', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_081', 6, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_082', 0, 'sardinas', 'Sardinas frescas limpias', 400, 'g'),
  ('pescados_082', 1, 'limon', 'Limón', 1, 'ud'),
  ('pescados_082', 2, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_082', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_082', 4, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_082', 5, 'sal', 'Sal', 4, 'g'),
  ('pescados_083', 0, 'rodaballo', 'Rodaballo entero limpio', 800, 'g'),
  ('pescados_083', 1, 'patata', 'Patata', 350, 'g'),
  ('pescados_083', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('pescados_083', 3, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('pescados_083', 4, 'aceite-oliva', 'Aceite de oliva', 45, 'ml'),
  ('pescados_083', 5, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_083', 6, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('pescados_083', 7, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_084', 0, 'filete-de-pez-espada', 'Filetes de pez espada', 350, 'g'),
  ('pescados_084', 1, 'mango', 'Mango maduro', 150, 'g'),
  ('pescados_084', 2, 'lima', 'Lima', 1, 'ud'),
  ('pescados_084', 3, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('pescados_084', 4, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('pescados_084', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_084', 6, 'sal', 'Sal', 4, 'g'),
  ('pescados_085', 0, 'bacalao', 'Bacalao desalado en lomos', 320, 'g'),
  ('pescados_085', 1, 'tomate-triturado', 'Tomate triturado', 300, 'g'),
  ('pescados_085', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_085', 3, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('pescados_085', 4, 'cebolla', 'Cebolla', 100, 'g'),
  ('pescados_085', 5, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_085', 6, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_085', 7, 'azucar', 'Azúcar', 3, 'g'),
  ('pescados_086', 0, 'lenguado', 'Lenguado limpio', 2, 'ud'),
  ('pescados_086', 1, 'harina', 'Harina de trigo', 30, 'g'),
  ('pescados_086', 2, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('pescados_086', 3, 'limon', 'Limón', 1, 'ud'),
  ('pescados_086', 4, 'perejil', 'Perejil', 8, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_086', 5, 'sal', 'Sal', 4, 'g'),
  ('pescados_087', 0, 'calamar', 'Calamares limpios con sus tintas', 800, 'g'),
  ('pescados_087', 1, 'cebolla', 'Cebolla', 150, 'g'),
  ('pescados_087', 2, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('pescados_087', 3, 'tomate-triturado', 'Tomate triturado', 200, 'g'),
  ('pescados_087', 4, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_087', 5, 'vino-blanco', 'Vino blanco', 100, 'ml'),
  ('pescados_087', 6, 'tinta-de-calamar', 'Bolsitas de tinta de calamar', 4, 'ud'),
  ('pescados_087', 7, 'caldo-de-pescado', 'Caldo de pescado', 200, 'ml'),
  ('pescados_087', 8, 'aceite-oliva', 'Aceite de oliva', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_087', 9, 'arroz', 'Arroz blanco', 320, 'g'),
  ('pescados_088', 0, 'langostinos', 'Langostinos frescos con cáscara', 400, 'g'),
  ('pescados_088', 1, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_088', 2, 'aceite-girasol', 'Aceite de girasol', 150, 'ml'),
  ('pescados_088', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_088', 4, 'sal-gruesa', 'Sal gorda', 5, 'g'),
  ('pescados_088', 5, 'limon', 'Limón', 1, 'ud'),
  ('pescados_089', 0, 'bacalao', 'Bacalao desalado desmigado', 250, 'g'),
  ('pescados_089', 1, 'harina', 'Harina de trigo', 150, 'g'),
  ('pescados_089', 2, 'levadura-quimica', 'Levadura química', 6, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_089', 3, 'huevos', 'Huevo', 2, 'ud'),
  ('pescados_089', 4, 'leche', 'Leche entera', 100, 'ml'),
  ('pescados_089', 5, 'perejil', 'Perejil', 8, 'g'),
  ('pescados_089', 6, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_089', 7, 'aceite-oliva', 'Aceite de oliva suave', 500, 'ml'),
  ('pescados_090', 0, 'bonito-del-norte', 'Bonito fresco en tacos', 500, 'g'),
  ('pescados_090', 1, 'patata', 'Patata', 600, 'g'),
  ('pescados_090', 2, 'pimiento-verde', 'Pimiento verde', 100, 'g'),
  ('pescados_090', 3, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('pescados_090', 4, 'cebolla', 'Cebolla', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_090', 5, 'tomate-triturado', 'Tomate triturado', 200, 'g'),
  ('pescados_090', 6, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_090', 7, 'pimenton', 'Pimentón dulce', 6, 'g'),
  ('pescados_090', 8, 'caldo-de-pescado', 'Caldo de pescado', 600, 'ml'),
  ('pescados_090', 9, 'aceite-oliva', 'Aceite de oliva', 35, 'ml'),
  ('pescados_091', 0, 'pulpo', 'Pulpo congelado limpio', 1200, 'g'),
  ('pescados_091', 1, 'patata', 'Patata', 500, 'g'),
  ('pescados_091', 2, 'pimenton', 'Pimentón dulce', 10, 'g'),
  ('pescados_091', 3, 'pimenton', 'Pimentón picante', 3, 'g'),
  ('pescados_091', 4, 'sal-gruesa', 'Sal gorda', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_091', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 40, 'ml'),
  ('pescados_092', 0, 'fideos', 'Fideos gruesos', 320, 'g'),
  ('pescados_092', 1, 'monkfish', 'Colas de rape en trozos', 250, 'g'),
  ('pescados_092', 2, 'gambas', 'Gambas peladas', 200, 'g'),
  ('pescados_092', 3, 'gambas', 'Cabezas y cáscaras de gamba', 100, 'g'),
  ('pescados_092', 4, 'tomate-triturado', 'Tomate triturado', 150, 'g'),
  ('pescados_092', 5, 'cebolla', 'Cebolla', 100, 'g'),
  ('pescados_092', 6, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_092', 7, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('pescados_092', 8, 'caldo-de-pescado', 'Caldo de pescado', 700, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_092', 9, 'aceite-oliva', 'Aceite de oliva', 35, 'ml'),
  ('pescados_092', 10, 'azafran', 'Azafrán', 1, 'g'),
  ('pescados_093', 0, 'langostinos', 'Langostinos cocidos pelados', 150, 'g'),
  ('pescados_093', 1, 'mejillones', 'Mejillones cocidos', 100, 'g'),
  ('pescados_093', 2, 'surimi', 'Palitos de cangrejo o surimi', 80, 'g'),
  ('pescados_093', 3, 'pimiento-rojo', 'Pimiento rojo', 60, 'g'),
  ('pescados_093', 4, 'pimiento-verde', 'Pimiento verde', 50, 'g'),
  ('pescados_093', 5, 'cebolla-morada', 'Cebolla morada', 40, 'g'),
  ('pescados_093', 6, 'tomate', 'Tomate', 80, 'g'),
  ('pescados_093', 7, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_093', 8, 'vinagre', 'Vinagre de vino', 15, 'ml'),
  ('pescados_094', 0, 'vieira', 'Vieiras limpias en su concha', 8, 'ud'),
  ('pescados_094', 1, 'jamon', 'Jamón serrano picado', 40, 'g'),
  ('pescados_094', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('pescados_094', 3, 'pan-rallado', 'Pan rallado', 30, 'g'),
  ('pescados_094', 4, 'mantequilla', 'Mantequilla', 25, 'g'),
  ('pescados_094', 5, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('pescados_094', 6, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_095', 0, 'congrio', 'Congrio en rodajas', 400, 'g'),
  ('pescados_095', 1, 'almejas', 'Almejas', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_095', 2, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_095', 3, 'perejil', 'Perejil', 15, 'g'),
  ('pescados_095', 4, 'harina', 'Harina de trigo', 12, 'g'),
  ('pescados_095', 5, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_095', 6, 'caldo-de-pescado', 'Caldo de pescado', 100, 'ml'),
  ('pescados_095', 7, 'aceite-oliva', 'Aceite de oliva', 35, 'ml'),
  ('pescados_096', 0, 'salmon', 'Salmonetes limpios', 400, 'g'),
  ('pescados_096', 1, 'tomate', 'Tomate maduro', 150, 'g'),
  ('pescados_096', 2, 'pimiento-choricero', 'Pimiento choricero o ñora hidratado', 20, 'g'),
  ('pescados_096', 3, 'almendras', 'Almendras tostadas', 25, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_096', 4, 'ajo', 'Ajo', 12, 'g'),
  ('pescados_096', 5, 'pan', 'Pan frito', 20, 'g'),
  ('pescados_096', 6, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_096', 7, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('pescados_097', 0, 'bacalao', 'Filetes de merluza o abadejo', 300, 'g'),
  ('pescados_097', 1, 'harina', 'Harina de trigo', 60, 'g'),
  ('pescados_097', 2, 'cerveza', 'Cerveza fría', 100, 'ml'),
  ('pescados_097', 3, 'tortilla-de-trigo', 'Tortillas de trigo pequeñas', 6, 'ud'),
  ('pescados_097', 4, 'repollo', 'Repollo morado', 100, 'g'),
  ('pescados_097', 5, 'yogur', 'Yogur natural', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_097', 6, 'mayonesa', 'Mayonesa', 30, 'g'),
  ('pescados_097', 7, 'lima', 'Lima', 1, 'ud'),
  ('pescados_097', 8, 'cilantro', 'Cilantro fresco', 5, 'g'),
  ('pescados_097', 9, 'aceite-girasol', 'Aceite de girasol', 300, 'ml'),
  ('pescados_098', 0, 'salmon', 'Salmón (lomos)', 280, 'g'),
  ('pescados_098', 1, 'arroz', 'Arroz blanco', 140, 'g'),
  ('pescados_098', 2, 'aguacate', 'Aguacate', 100, 'g'),
  ('pescados_098', 3, 'pepino', 'Pepino', 80, 'g'),
  ('pescados_098', 4, 'edamame', 'Edamame', 60, 'g'),
  ('pescados_098', 5, 'mayonesa', 'Mayonesa', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_098', 6, 'sriracha', 'Sriracha', 15, 'g'),
  ('pescados_098', 7, 'salsa-soja', 'Salsa de soja', 10, 'ml'),
  ('pescados_098', 8, 'sesamo', 'Sésamo tostado', 5, 'g'),
  ('pescados_098', 9, 'cebollino', 'Cebollino', 5, 'g'),
  ('pescados_099', 0, 'rodaballo', 'Rodaballo (filetes)', 320, 'g'),
  ('pescados_099', 1, 'patata', 'Patata', 300, 'g'),
  ('pescados_099', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pescados_099', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_099', 4, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('pescados_099', 5, 'harina', 'Harina', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_099', 6, 'caldo-de-marisco', 'Fumet de marisco', 200, 'ml'),
  ('pescados_099', 7, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('pescados_099', 8, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('pescados_100', 0, 'bacalao', 'Bacalao desalado (lomos)', 320, 'g'),
  ('pescados_100', 1, 'coliflor', 'Coliflor', 400, 'g'),
  ('pescados_100', 2, 'aceite-oliva', 'Aceite de oliva suave', 70, 'ml'),
  ('pescados_100', 3, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_100', 4, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('pescados_100', 5, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('pescados_100', 6, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_101', 0, 'lubina', 'Lubina (filetes)', 320, 'g'),
  ('pescados_101', 1, 'patata', 'Patata', 300, 'g'),
  ('pescados_101', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('pescados_101', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_101', 4, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('pescados_101', 5, 'chalota', 'Chalota', 30, 'g'),
  ('pescados_101', 6, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_101', 7, 'vinagre', 'Vinagre de vino blanco', 10, 'ml'),
  ('pescados_101', 8, 'alcaparras', 'Alcaparras', 20, 'g'),
  ('pescados_102', 0, 'pescadilla', 'Pescadilla (filetes)', 320, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_102', 1, 'patata', 'Patata', 350, 'g'),
  ('pescados_102', 2, 'harina', 'Harina', 50, 'g'),
  ('pescados_102', 3, 'aceite-oliva', 'Aceite de oliva suave', 300, 'ml'),
  ('pescados_102', 4, 'mayonesa', 'Mayonesa', 60, 'g'),
  ('pescados_102', 5, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_102', 6, 'limon', 'Limón', 1, 'ud'),
  ('pescados_103', 0, 'salmon', 'Salmón (lomos)', 320, 'g'),
  ('pescados_103', 1, 'boniato', 'Boniato', 400, 'g'),
  ('pescados_103', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('pescados_103', 3, 'leche', 'Leche', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_103', 4, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('pescados_103', 5, 'miel', 'Miel', 20, 'g'),
  ('pescados_103', 6, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('pescados_103', 7, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_103', 8, 'maicena', 'Maicena', 5, 'g'),
  ('pescados_103', 9, 'aceite-de-sesamo', 'Aceite de sésamo', 5, 'ml'),
  ('pescados_103', 10, 'sesamo', 'Sésamo tostado', 5, 'g'),
  ('pescados_104', 0, 'monkfish', 'Rape (cola, en medallones)', 350, 'g'),
  ('pescados_104', 1, 'almejas', 'Almejas', 200, 'g'),
  ('pescados_104', 2, 'patata', 'Patata', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_104', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('pescados_104', 4, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_104', 5, 'harina', 'Harina', 10, 'g'),
  ('pescados_104', 6, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pescados_104', 7, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_104', 8, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_105', 0, 'dorada', 'Dorada (limpia, entera)', 700, 'g'),
  ('pescados_105', 1, 'patata', 'Patata', 300, 'g'),
  ('pescados_105', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('pescados_105', 3, 'tomate', 'Tomate', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_105', 4, 'pimiento-choricero', 'Pimiento choricero (pulpa de ñora)', 15, 'g'),
  ('pescados_105', 5, 'almendras', 'Almendra tostada', 30, 'g'),
  ('pescados_105', 6, 'ajo', 'Ajo', 15, 'g'),
  ('pescados_105', 7, 'pan', 'Pan', 20, 'g'),
  ('pescados_105', 8, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('pescados_105', 9, 'vinagre', 'Vinagre de vino', 10, 'ml'),
  ('pescados_106', 0, 'atun', 'Atún (lomo fresco)', 320, 'g'),
  ('pescados_106', 1, 'patata', 'Patata', 350, 'g'),
  ('pescados_106', 2, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('pescados_106', 3, 'leche', 'Leche', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_106', 4, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('pescados_106', 5, 'miel', 'Miel', 20, 'g'),
  ('pescados_106', 6, 'jengibre', 'Jengibre fresco', 8, 'g'),
  ('pescados_106', 7, 'ajo', 'Ajo', 8, 'g'),
  ('pescados_106', 8, 'maicena', 'Maicena', 5, 'g'),
  ('pescados_106', 9, 'aceite-de-sesamo', 'Aceite de sésamo', 5, 'ml'),
  ('pescados_106', 10, 'sesamo', 'Sésamo tostado', 5, 'g'),
  ('pescados_107', 0, 'harina', 'Harina de fuerza', 300, 'g'),
  ('pescados_107', 1, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('pescados_107', 2, 'levadura', 'Levadura de panadería seca', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_107', 3, 'pimiento-rojo', 'Pimiento rojo', 200, 'g'),
  ('pescados_107', 4, 'pimiento-verde', 'Pimiento verde', 150, 'g'),
  ('pescados_107', 5, 'berenjena', 'Berenjena', 200, 'g'),
  ('pescados_107', 6, 'cebolla', 'Cebolla', 150, 'g'),
  ('pescados_107', 7, 'tomate', 'Tomate', 150, 'g'),
  ('pescados_107', 8, 'sardinas', 'Sardinas ahumadas', 200, 'g'),
  ('pescados_108', 0, 'hojaldre', 'Masa de hojaldre', 230, 'g'),
  ('pescados_108', 1, 'cebolla', 'Cebolla', 500, 'g'),
  ('pescados_108', 2, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('pescados_108', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_108', 4, 'azucar', 'Azúcar', 10, 'g'),
  ('pescados_108', 5, 'anchoa-en-aceite', 'Anchoas en aceite', 60, 'g'),
  ('pescados_108', 6, 'aceitunas-negras', 'Aceitunas negras', 40, 'g'),
  ('pescados_108', 7, 'tomillo', 'Tomillo', 2, 'g'),
  ('pescados_109', 0, 'harina', 'Harina de fuerza', 350, 'g'),
  ('pescados_109', 1, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('pescados_109', 2, 'levadura', 'Levadura de panadería seca', 6, 'g'),
  ('pescados_109', 3, 'vieira', 'Vieiras (sin concha)', 200, 'g'),
  ('pescados_109', 4, 'gambas', 'Gambas peladas', 200, 'g'),
  ('pescados_109', 5, 'cebolla', 'Cebolla', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_109', 6, 'pimiento-verde', 'Pimiento verde', 100, 'g'),
  ('pescados_109', 7, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pescados_109', 8, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_110', 0, 'atun', 'Atún rojo (calidad sashimi)', 240, 'g'),
  ('pescados_110', 1, 'aguacate', 'Aguacate', 200, 'g'),
  ('pescados_110', 2, 'pan-de-payes', 'Pan de payés', 120, 'g'),
  ('pescados_110', 3, 'salsa-soja', 'Salsa de soja', 20, 'ml'),
  ('pescados_110', 4, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('pescados_110', 5, 'cebolleta', 'Cebolleta', 20, 'g'),
  ('pescados_110', 6, 'sesamo', 'Sésamo tostado', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_110', 7, 'lima', 'Lima', 1, 'ud'),
  ('pescados_110', 8, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_111', 0, 'bacalao', 'Bacalao desalado (desmigado)', 200, 'g'),
  ('pescados_111', 1, 'harina', 'Harina', 120, 'g'),
  ('pescados_111', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('pescados_111', 3, 'levadura-quimica', 'Levadura química', 5, 'g'),
  ('pescados_111', 4, 'leche', 'Leche', 100, 'ml'),
  ('pescados_111', 5, 'perejil', 'Perejil', 10, 'g'),
  ('pescados_111', 6, 'ajo', 'Ajo', 16, 'g'),
  ('pescados_111', 7, 'aceite-oliva', 'Aceite de oliva suave', 300, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_111', 8, 'mayonesa', 'Mayonesa', 60, 'g'),
  ('pescados_112', 0, 'cabracho', 'Cabracho (o rape/merluza)', 400, 'g'),
  ('pescados_112', 1, 'gambas', 'Gambas peladas', 150, 'g'),
  ('pescados_112', 2, 'huevos', 'Huevo', 4, 'ud'),
  ('pescados_112', 3, 'tomate-frito', 'Tomate frito', 100, 'g'),
  ('pescados_112', 4, 'nata', 'Nata para cocinar', 150, 'ml'),
  ('pescados_112', 5, 'mayonesa', 'Mayonesa', 80, 'g'),
  ('pescados_112', 6, 'cebolla', 'Cebolla', 50, 'g'),
  ('pescados_112', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('pescados_113', 0, 'harina', 'Harina de fuerza', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_113', 1, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('pescados_113', 2, 'levadura', 'Levadura de panadería seca', 7, 'g'),
  ('pescados_113', 3, 'bonito-del-norte', 'Bonito en conserva', 300, 'g'),
  ('pescados_113', 4, 'cebolla', 'Cebolla', 250, 'g'),
  ('pescados_113', 5, 'pimiento-rojo', 'Pimiento rojo', 150, 'g'),
  ('pescados_113', 6, 'pimiento-verde', 'Pimiento verde', 100, 'g'),
  ('pescados_113', 7, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pescados_113', 8, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('pescados_113', 9, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_114', 0, 'harina', 'Harina de fuerza', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_114', 1, 'aceite-oliva', 'Aceite de oliva', 55, 'ml'),
  ('pescados_114', 2, 'levadura', 'Levadura de panadería seca', 7, 'g'),
  ('pescados_114', 3, 'atun-lata', 'Atún en conserva', 280, 'g'),
  ('pescados_114', 4, 'pimiento-rojo', 'Pimiento rojo', 200, 'g'),
  ('pescados_114', 5, 'pimiento-verde', 'Pimiento verde', 150, 'g'),
  ('pescados_114', 6, 'cebolla', 'Cebolla', 150, 'g'),
  ('pescados_114', 7, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pescados_114', 8, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_115', 0, 'vol-au-vent', 'Vol-au-vent de hojaldre (cestas precocidas)', 6, 'ud'),
  ('pescados_115', 1, 'gambas', 'Gambas peladas', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_115', 2, 'mejillones', 'Mejillones (sin concha)', 100, 'g'),
  ('pescados_115', 3, 'champinon', 'Champiñones', 100, 'g'),
  ('pescados_115', 4, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('pescados_115', 5, 'harina', 'Harina', 30, 'g'),
  ('pescados_115', 6, 'leche', 'Leche', 300, 'ml'),
  ('pescados_115', 7, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('pescados_115', 8, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('pescados_116', 0, 'bacalao', 'Bacalao desalado (desmigado)', 250, 'g'),
  ('pescados_116', 1, 'patata', 'Patata', 400, 'g'),
  ('pescados_116', 2, 'cebolla', 'Cebolla', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_116', 3, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('pescados_116', 4, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_116', 5, 'queso', 'Queso rallado', 40, 'g'),
  ('pescados_116', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_116', 7, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_117', 0, 'salmon', 'Salmón (lomos)', 350, 'g'),
  ('pescados_117', 1, 'puerro', 'Puerro', 400, 'g'),
  ('pescados_117', 2, 'huevos', 'Huevo', 4, 'ud'),
  ('pescados_117', 3, 'nata', 'Nata para cocinar', 200, 'ml'),
  ('pescados_117', 4, 'mantequilla', 'Mantequilla', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_117', 5, 'queso', 'Queso rallado', 40, 'g'),
  ('pescados_117', 6, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('pescados_118', 0, 'obleas', 'Obleas para empanadillas', 16, 'ud'),
  ('pescados_118', 1, 'bonito-del-norte', 'Bonito en conserva', 200, 'g'),
  ('pescados_118', 2, 'pimiento-rojo', 'Pimiento rojo', 100, 'g'),
  ('pescados_118', 3, 'pimiento-verde', 'Pimiento verde', 80, 'g'),
  ('pescados_118', 4, 'cebolla', 'Cebolla', 80, 'g'),
  ('pescados_118', 5, 'tomate-frito', 'Tomate frito', 100, 'g'),
  ('pescados_118', 6, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_118', 7, 'aceite-oliva', 'Aceite de oliva suave', 300, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_119', 0, 'salmon', 'Lomos de salmón', 300, 'g'),
  ('pescados_119', 1, 'patata', 'Patata', 300, 'g'),
  ('pescados_119', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('pescados_119', 3, 'salsa-soja', 'Salsa de soja', 30, 'ml'),
  ('pescados_119', 4, 'miel', 'Miel', 15, 'g'),
  ('pescados_119', 5, 'ajo', 'Ajo', 5, 'g'),
  ('pescados_119', 6, 'jengibre', 'Jengibre fresco', 5, 'g'),
  ('pescados_119', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pescados_119', 8, 'cebollino', 'Cebollino', 3, 'g'),
  ('pescados_120', 0, 'merluza-lomos', 'Merluza en lomos', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_120', 1, 'huevos', 'Huevo', 1, 'ud'),
  ('pescados_120', 2, 'harina', 'Harina', 60, 'g'),
  ('pescados_120', 3, 'naranja', 'Naranja', 1, 'ud'),
  ('pescados_120', 4, 'hinojo', 'Hinojo', 150, 'g'),
  ('pescados_120', 5, 'aceitunas-negras', 'Aceitunas negras', 40, 'g'),
  ('pescados_120', 6, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('pescados_121', 0, 'salmon', 'Lomos de salmón', 400, 'g'),
  ('pescados_121', 1, 'limon', 'Limón', 1, 'ud'),
  ('pescados_121', 2, 'eneldo', 'Eneldo', 5, 'g'),
  ('pescados_121', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_121', 4, 'ajo', 'Ajo', 1, 'ud'),
  ('pescados_122', 0, 'atun-fresco', 'Atún fresco', 400, 'g'),
  ('pescados_122', 1, 'cebolla', 'Cebolla', 2, 'ud'),
  ('pescados_122', 2, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('pescados_122', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_122', 4, 'vino-blanco', 'Vino blanco', 30, 'ml'),
  ('pescados_123', 0, 'boquerones', 'Boquerones limpios', 400, 'g'),
  ('pescados_123', 1, 'harina', 'Harina', 80, 'g'),
  ('pescados_123', 2, 'pepino', 'Pepino', 1, 'ud'),
  ('pescados_123', 3, 'yogur', 'Yogur natural', 125, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_123', 4, 'menta', 'Menta fresca', 5, 'g'),
  ('pescados_123', 5, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('pescados_124', 0, 'merluza', 'Filetes de merluza', 400, 'g'),
  ('pescados_124', 1, 'ajo', 'Ajo', 4, 'ud'),
  ('pescados_124', 2, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('pescados_124', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_124', 4, 'vinagre', 'Vinagre', 10, 'ml'),
  ('pescados_125', 0, 'salmon', 'Lomos de salmón', 400, 'g'),
  ('pescados_125', 1, 'calabacin', 'Calabacín', 1, 'ud'),
  ('pescados_125', 2, 'pimiento-rojo', 'Pimiento rojo', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_125', 3, 'berenjena', 'Berenjena', 1, 'ud'),
  ('pescados_125', 4, 'cebolla', 'Cebolla', 1, 'ud'),
  ('pescados_125', 5, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('pescados_126', 0, 'bacalao', 'Lomos de bacalao desalado', 400, 'g'),
  ('pescados_126', 1, 'ajo', 'Ajo', 6, 'ud'),
  ('pescados_126', 2, 'aceite-oliva', 'Aceite de oliva', 150, 'ml'),
  ('pescados_126', 3, 'guindilla', 'Guindilla', 1, 'ud'),
  ('pescados_127', 0, 'lubina', 'Lubina entera limpia', 500, 'g'),
  ('pescados_127', 1, 'patata', 'Patatas', 300, 'g'),
  ('pescados_127', 2, 'cebolla', 'Cebolla', 0.5, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_127', 3, 'limon', 'Limón', 1, 'ud'),
  ('pescados_127', 4, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('pescados_128', 0, 'truchas-enteras', 'Truchas limpias', 400, 'g'),
  ('pescados_128', 1, 'almendras', 'Almendras laminadas', 40, 'g'),
  ('pescados_128', 2, 'ajo', 'Ajo', 2, 'ud'),
  ('pescados_128', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_128', 4, 'perejil', 'Perejil', 5, 'g'),
  ('pescados_129', 0, 'merluza-lomos', 'Merluza en lomos', 500, 'g'),
  ('pescados_129', 1, 'tomate', 'Tomate maduro', 400, 'g'),
  ('pescados_129', 2, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_129', 3, 'ajo', 'Ajo', 10, 'g'),
  ('pescados_129', 4, 'aceitunas', 'Aceitunas', 60, 'g'),
  ('pescados_129', 5, 'alcaparras', 'Alcaparras', 20, 'g'),
  ('pescados_129', 6, 'laurel', 'Laurel', 1, 'ud'),
  ('pescados_129', 7, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('pescados_129', 8, 'sal', 'Sal', 3, 'g'),
  ('platos_unicos_001', 0, 'arroz', 'Arroz', 200, 'g'),
  ('platos_unicos_001', 1, 'contramuslos-de-pollo', 'Contramuslo de pollo', 200, 'g'),
  ('platos_unicos_001', 2, 'judia-verde', 'Judías verdes', 80, 'g'),
  ('platos_unicos_001', 3, 'garrofon', 'Garrofón', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_001', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('platos_unicos_001', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('platos_unicos_001', 6, 'pimenton', 'Pimentón', 4, 'g'),
  ('platos_unicos_001', 7, 'azafran', 'Azafrán', 1, 'g'),
  ('platos_unicos_002', 0, 'harina', 'Harina', 250, 'g'),
  ('platos_unicos_002', 1, 'levadura', 'Levadura fresca', 10, 'g'),
  ('platos_unicos_002', 2, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('platos_unicos_002', 3, 'mozzarella', 'Mozzarella', 125, 'g'),
  ('platos_unicos_002', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('platos_unicos_002', 5, 'oregano', 'Orégano', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_003', 0, 'jamon', 'Jamón serrano', 80, 'g'),
  ('platos_unicos_003', 1, 'leche', 'Leche', 300, 'ml'),
  ('platos_unicos_003', 2, 'harina', 'Harina', 50, 'g'),
  ('platos_unicos_003', 3, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('platos_unicos_003', 4, 'huevos', 'Huevo', 1, 'ud'),
  ('platos_unicos_003', 5, 'pan-rallado', 'Pan rallado', 60, 'g'),
  ('platos_unicos_003', 6, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('platos_unicos_003', 7, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('platos_unicos_004', 0, 'harina', 'Harina', 250, 'g'),
  ('platos_unicos_004', 1, 'atun-lata', 'Atún en conserva', 160, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_004', 2, 'cebolla', 'Cebolla', 120, 'g'),
  ('platos_unicos_004', 3, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('platos_unicos_004', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('platos_unicos_004', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('platos_unicos_004', 6, 'huevos', 'Huevo', 1, 'ud'),
  ('platos_unicos_005', 0, 'obleas', 'Obleas de empanadilla', 8, 'ud'),
  ('platos_unicos_005', 1, 'atun-lata', 'Atún en conserva', 120, 'g'),
  ('platos_unicos_005', 2, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('platos_unicos_005', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('platos_unicos_005', 4, 'pimiento-verde', 'Pimiento verde', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_005', 5, 'huevos', 'Huevo cocido', 1, 'ud'),
  ('platos_unicos_005', 6, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('platos_unicos_006', 0, 'harina', 'Harina', 100, 'g'),
  ('platos_unicos_006', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('platos_unicos_006', 2, 'leche', 'Leche', 200, 'ml'),
  ('platos_unicos_006', 3, 'jamon-york', 'Jamón cocido', 80, 'g'),
  ('platos_unicos_006', 4, 'queso-en-lonchas', 'Queso en lonchas', 60, 'g'),
  ('platos_unicos_006', 5, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('platos_unicos_007', 0, 'masa-quebrada', 'Masa quebrada', 200, 'g'),
  ('platos_unicos_007', 1, 'calabacin', 'Calabacín', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_007', 2, 'puerro', 'Puerro', 80, 'g'),
  ('platos_unicos_007', 3, 'huevos', 'Huevo', 3, 'ud'),
  ('platos_unicos_007', 4, 'nata', 'Nata', 100, 'ml'),
  ('platos_unicos_007', 5, 'queso', 'Queso rallado', 40, 'g'),
  ('platos_unicos_007', 6, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('platos_unicos_008', 0, 'patata', 'Patata grande', 4, 'ud'),
  ('platos_unicos_008', 1, 'carne-picada', 'Carne picada de ternera', 200, 'g'),
  ('platos_unicos_008', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('platos_unicos_008', 3, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('platos_unicos_008', 4, 'queso', 'Queso rallado', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_008', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('platos_unicos_009', 0, 'tortilla-de-trigo', 'Tortilla de trigo', 2, 'ud'),
  ('platos_unicos_009', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 200, 'g'),
  ('platos_unicos_009', 2, 'lechuga', 'Lechuga', 50, 'g'),
  ('platos_unicos_009', 3, 'tomate', 'Tomate', 80, 'g'),
  ('platos_unicos_009', 4, 'yogur', 'Yogur natural', 40, 'g'),
  ('platos_unicos_009', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('platos_unicos_010', 0, 'bacalao', 'Bacalao desalado', 120, 'g'),
  ('platos_unicos_010', 1, 'leche', 'Leche', 300, 'ml'),
  ('platos_unicos_010', 2, 'harina', 'Harina', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_010', 3, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('platos_unicos_010', 4, 'huevos', 'Huevo', 1, 'ud'),
  ('platos_unicos_010', 5, 'pan-rallado', 'Pan rallado', 60, 'g'),
  ('platos_unicos_010', 6, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('platos_unicos_010', 7, 'perejil', 'Perejil', 5, 'g'),
  ('platos_unicos_011', 0, 'pan', 'Pan del día anterior', 200, 'g'),
  ('platos_unicos_011', 1, 'chorizo', 'Chorizo', 60, 'g'),
  ('platos_unicos_011', 2, 'panceta', 'Panceta', 60, 'g'),
  ('platos_unicos_011', 3, 'ajo', 'Ajo', 12, 'g'),
  ('platos_unicos_011', 4, 'pimenton', 'Pimentón', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_011', 5, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('platos_unicos_011', 6, 'uvas', 'Uvas', 60, 'g'),
  ('platos_unicos_012', 0, 'pimiento-rojo', 'Pimientos rojos', 4, 'ud'),
  ('platos_unicos_012', 1, 'arroz', 'Arroz', 150, 'g'),
  ('platos_unicos_012', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('platos_unicos_012', 3, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('platos_unicos_012', 4, 'champinon', 'Champiñones', 80, 'g'),
  ('platos_unicos_012', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('platos_unicos_012', 6, 'ajo', 'Ajo', 6, 'g'),
  ('platos_unicos_013', 0, 'harina', 'Harina', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_013', 1, 'levadura', 'Levadura fresca', 10, 'g'),
  ('platos_unicos_013', 2, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('platos_unicos_013', 3, 'mozzarella', 'Mozzarella', 100, 'g'),
  ('platos_unicos_013', 4, 'jamon-york', 'Jamón cocido', 60, 'g'),
  ('platos_unicos_013', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('platos_unicos_014', 0, 'pan', 'Pan de hogaza', 120, 'g'),
  ('platos_unicos_014', 1, 'aguacate', 'Aguacate', 1, 'ud'),
  ('platos_unicos_014', 2, 'huevos', 'Huevo', 2, 'ud'),
  ('platos_unicos_014', 3, 'tomate-cherry', 'Tomate cherry', 60, 'g'),
  ('platos_unicos_014', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_014', 5, 'limon', 'Limón', 1, 'ud'),
  ('platos_unicos_015', 0, 'patata', 'Patata', 400, 'g'),
  ('platos_unicos_015', 1, 'huevos', 'Huevo', 2, 'ud'),
  ('platos_unicos_015', 2, 'tomate-triturado', 'Tomate triturado', 100, 'ml'),
  ('platos_unicos_015', 3, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('platos_unicos_015', 4, 'pimenton', 'Pimentón picante', 4, 'g'),
  ('platos_unicos_015', 5, 'ajo', 'Ajo', 6, 'g'),
  ('platos_unicos_016', 0, 'pan', 'Pan de barra', 200, 'g'),
  ('platos_unicos_016', 1, 'patata', 'Patata', 200, 'g'),
  ('platos_unicos_016', 2, 'huevos', 'Huevo', 3, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_016', 3, 'cebolla', 'Cebolla', 60, 'g'),
  ('platos_unicos_016', 4, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('platos_unicos_017', 0, 'tortilla-de-trigo', 'Tortilla de trigo', 2, 'ud'),
  ('platos_unicos_017', 1, 'pechuga-de-pollo', 'Pechuga de pollo', 250, 'g'),
  ('platos_unicos_017', 2, 'pimiento-rojo', 'Pimiento rojo', 80, 'g'),
  ('platos_unicos_017', 3, 'arroz', 'Arroz cocido', 100, 'g'),
  ('platos_unicos_017', 4, 'queso', 'Queso rallado', 30, 'g'),
  ('platos_unicos_017', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('platos_unicos_018', 0, 'arroz', 'Arroz', 200, 'g'),
  ('platos_unicos_018', 1, 'gambas', 'Gambas', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_018', 2, 'mejillones', 'Mejillones', 150, 'g'),
  ('platos_unicos_018', 3, 'sepia', 'Sepia', 100, 'g'),
  ('platos_unicos_018', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('platos_unicos_018', 5, 'ajo', 'Ajo', 10, 'g'),
  ('platos_unicos_018', 6, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('platos_unicos_018', 7, 'azafran', 'Azafrán', 1, 'g'),
  ('platos_unicos_019', 0, 'tortilla-de-trigo', 'Tortilla de trigo', 2, 'ud'),
  ('platos_unicos_019', 1, 'queso', 'Queso rallado', 100, 'g'),
  ('platos_unicos_019', 2, 'jamon-york', 'Jamón cocido', 60, 'g'),
  ('platos_unicos_019', 3, 'pimiento-rojo', 'Pimiento rojo', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('platos_unicos_019', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('platos_unicos_020', 0, 'huevos', 'Huevo', 4, 'ud'),
  ('platos_unicos_020', 1, 'patata', 'Patata', 300, 'g'),
  ('platos_unicos_020', 2, 'pimiento-choricero', 'Pimiento choricero', 2, 'ud'),
  ('platos_unicos_020', 3, 'tomate-triturado', 'Tomate triturado', 150, 'ml'),
  ('platos_unicos_020', 4, 'chorizo', 'Chorizo', 50, 'g'),
  ('platos_unicos_020', 5, 'cebolla', 'Cebolla', 60, 'g'),
  ('platos_unicos_020', 6, 'ajo', 'Ajo', 6, 'g'),
  ('platos_unicos_020', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('postres_001', 0, 'manzana', 'Manzana', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_001', 1, 'platano', 'Plátano', 1, 'ud'),
  ('postres_001', 2, 'naranja', 'Naranja', 2, 'ud'),
  ('postres_001', 3, 'fresa', 'Fresas', 150, 'g'),
  ('postres_001', 4, 'limon', 'Zumo de limón', 15, 'ml'),
  ('postres_002', 0, 'yogur', 'Yogur natural', 250, 'g'),
  ('postres_002', 1, 'miel', 'Miel', 20, 'ml'),
  ('postres_002', 2, 'nueces', 'Nueces', 40, 'g'),
  ('postres_003', 0, 'manzana', 'Manzana', 1, 'ud'),
  ('postres_003', 1, 'naranja', 'Naranja', 1, 'ud'),
  ('postres_007', 0, 'manzana', 'Manzana', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_007', 1, 'azucar', 'Azúcar', 40, 'g'),
  ('postres_007', 2, 'limon', 'Limón', 1, 'ud'),
  ('postres_008', 0, 'yogur', 'Yogur natural', 250, 'g'),
  ('postres_009', 0, 'yogur', 'Yogur natural', 250, 'g'),
  ('postres_009', 1, 'platano', 'Plátano', 1, 'ud'),
  ('postres_009', 2, 'fresa', 'Fresas', 100, 'g'),
  ('postres_013', 0, 'yogur', 'Yogur de sabores', 250, 'g'),
  ('postres_014', 0, 'manzana', 'Manzana', 4, 'ud'),
  ('postres_014', 1, 'azucar', 'Azúcar', 40, 'g'),
  ('postres_014', 2, 'canela', 'Canela', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_014', 3, 'limon', 'Limón', 1, 'ud'),
  ('postres_019', 0, 'queso-crema', 'Queso crema', 600, 'g'),
  ('postres_019', 1, 'nata-para-montar', 'Nata para montar', 400, 'ml'),
  ('postres_019', 2, 'azucar', 'Azúcar', 220, 'g'),
  ('postres_019', 3, 'huevos', 'Huevo', 5, 'ud'),
  ('postres_019', 4, 'harina', 'Harina', 25, 'g'),
  ('postres_019', 5, 'sal', 'Sal', 2, 'g'),
  ('postres_020', 0, 'manzana', 'Manzana reineta', 1000, 'g'),
  ('postres_020', 1, 'mantequilla', 'Mantequilla', 100, 'g'),
  ('postres_020', 2, 'azucar', 'Azúcar', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_020', 3, 'hojaldre', 'Hojaldre', 230, 'g'),
  ('postres_020', 4, 'canela', 'Canela en polvo', 2, 'g'),
  ('postres_021', 0, 'chocolate', 'Chocolate negro', 200, 'g'),
  ('postres_021', 1, 'mantequilla', 'Mantequilla', 150, 'g'),
  ('postres_021', 2, 'azucar', 'Azúcar', 200, 'g'),
  ('postres_021', 3, 'huevos', 'Huevo', 3, 'ud'),
  ('postres_021', 4, 'harina', 'Harina', 100, 'g'),
  ('postres_021', 5, 'nueces', 'Nueces', 80, 'g'),
  ('postres_021', 6, 'cacao', 'Cacao en polvo', 20, 'g'),
  ('postres_021', 7, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_022', 0, 'harina', 'Harina', 200, 'g'),
  ('postres_022', 1, 'mantequilla', 'Mantequilla', 140, 'g'),
  ('postres_022', 2, 'azucar', 'Azúcar', 360, 'g'),
  ('postres_022', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('postres_022', 4, 'agua', 'Agua fría', 30, 'ml'),
  ('postres_022', 5, 'limon', 'Zumo de limón', 150, 'ml'),
  ('postres_022', 6, 'limon', 'Ralladura de limón', 10, 'g'),
  ('postres_022', 7, 'maicena', 'Maicena', 40, 'g'),
  ('postres_022', 8, 'agua', 'Agua', 250, 'ml'),
  ('postres_022', 9, 'yema-de-huevo', 'Yema de huevo', 4, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_022', 10, 'clara-de-huevo', 'Clara de huevo', 4, 'ud'),
  ('postres_023', 0, 'bizcocho-de-soletilla', 'Bizcochos de soletilla', 200, 'g'),
  ('postres_023', 1, 'cafe-espresso', 'Café espresso', 300, 'ml'),
  ('postres_023', 2, 'mascarpone', 'Mascarpone', 500, 'g'),
  ('postres_023', 3, 'yema-de-huevo', 'Yema de huevo', 4, 'ud'),
  ('postres_023', 4, 'clara-de-huevo', 'Clara de huevo', 4, 'ud'),
  ('postres_023', 5, 'azucar', 'Azúcar', 100, 'g'),
  ('postres_023', 6, 'cacao', 'Cacao en polvo', 15, 'g'),
  ('postres_023', 7, 'licor-de-cafe', 'Licor de café', 30, 'ml'),
  ('postres_024', 0, 'chocolate', 'Chocolate negro', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_024', 1, 'huevos', 'Huevo', 4, 'ud'),
  ('postres_024', 2, 'sal', 'Sal', 1, 'g'),
  ('postres_025', 0, 'manzana', 'Manzana', 800, 'g'),
  ('postres_025', 1, 'azucar', 'Azúcar', 60, 'g'),
  ('postres_025', 2, 'canela', 'Canela en polvo', 5, 'g'),
  ('postres_025', 3, 'mantequilla', 'Mantequilla', 150, 'g'),
  ('postres_025', 4, 'harina', 'Harina', 150, 'g'),
  ('postres_025', 5, 'azucar-moreno', 'Azúcar moreno', 100, 'g'),
  ('postres_025', 6, 'avena', 'Copos de avena', 50, 'g'),
  ('postres_025', 7, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_026', 0, 'agua', 'Agua', 250, 'ml'),
  ('postres_026', 1, 'mantequilla', 'Mantequilla', 100, 'g'),
  ('postres_026', 2, 'harina', 'Harina', 150, 'g'),
  ('postres_026', 3, 'huevos', 'Huevo', 4, 'ud'),
  ('postres_026', 4, 'sal', 'Sal', 2, 'g'),
  ('postres_026', 5, 'nata-para-montar', 'Nata para montar', 500, 'ml'),
  ('postres_026', 6, 'azucar', 'Azúcar', 30, 'g'),
  ('postres_026', 7, 'chocolate', 'Chocolate negro', 200, 'g'),
  ('postres_027', 0, 'harina', 'Harina', 250, 'g'),
  ('postres_027', 1, 'mantequilla', 'Mantequilla', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_027', 2, 'azucar-moreno', 'Azúcar moreno', 120, 'g'),
  ('postres_027', 3, 'azucar', 'Azúcar', 60, 'g'),
  ('postres_027', 4, 'huevos', 'Huevo', 1, 'ud'),
  ('postres_027', 5, 'chocolate', 'Chocolate negro', 150, 'g'),
  ('postres_027', 6, 'bicarbonato', 'Bicarbonato', 5, 'g'),
  ('postres_027', 7, 'sal', 'Sal', 2, 'g'),
  ('postres_027', 8, 'extracto-de-vainilla', 'Extracto de vainilla', 5, 'ml'),
  ('postres_028', 0, 'harina', 'Harina', 280, 'g'),
  ('postres_028', 1, 'cacao', 'Cacao en polvo', 15, 'g'),
  ('postres_028', 2, 'bicarbonato', 'Bicarbonato', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_028', 3, 'sal', 'Sal', 3, 'g'),
  ('postres_028', 4, 'mantequilla', 'Mantequilla', 200, 'g'),
  ('postres_028', 5, 'azucar', 'Azúcar', 300, 'g'),
  ('postres_028', 6, 'huevos', 'Huevo', 2, 'ud'),
  ('postres_028', 7, 'leche', 'Suero de leche', 240, 'ml'),
  ('postres_028', 8, 'colorante', 'Colorante rojo alimentario', 10, 'ml'),
  ('postres_028', 9, 'vinagre', 'Vinagre', 10, 'ml'),
  ('postres_028', 10, 'extracto-de-vainilla', 'Extracto de vainilla', 5, 'ml'),
  ('postres_028', 11, 'queso-crema', 'Queso crema', 250, 'g'),
  ('postres_028', 12, 'azucar-glas', 'Azúcar glas', 250, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_029', 0, 'zanahoria', 'Zanahoria', 300, 'g'),
  ('postres_029', 1, 'harina', 'Harina', 280, 'g'),
  ('postres_029', 2, 'azucar-moreno', 'Azúcar moreno', 200, 'g'),
  ('postres_029', 3, 'aceite-girasol', 'Aceite de girasol', 150, 'ml'),
  ('postres_029', 4, 'huevos', 'Huevo', 4, 'ud'),
  ('postres_029', 5, 'canela', 'Canela en polvo', 5, 'g'),
  ('postres_029', 6, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('postres_029', 7, 'bicarbonato', 'Bicarbonato', 6, 'g'),
  ('postres_029', 8, 'levadura-quimica', 'Levadura química', 6, 'g'),
  ('postres_029', 9, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_029', 10, 'nueces', 'Nueces', 60, 'g'),
  ('postres_029', 11, 'queso-crema', 'Queso crema', 180, 'g'),
  ('postres_029', 12, 'mantequilla', 'Mantequilla', 50, 'g'),
  ('postres_029', 13, 'azucar-glas', 'Azúcar glas', 180, 'g'),
  ('postres_030', 0, 'nata-para-montar', 'Nata para montar', 400, 'ml'),
  ('postres_030', 1, 'leche', 'Leche', 100, 'ml'),
  ('postres_030', 2, 'azucar', 'Azúcar', 90, 'g'),
  ('postres_030', 3, 'extracto-de-vainilla', 'Extracto de vainilla', 5, 'ml'),
  ('postres_030', 4, 'hoja-de-gelatina', 'Hojas de gelatina', 6, 'g'),
  ('postres_030', 5, 'frutos-rojos', 'Frutos rojos', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_030', 6, 'agua', 'Agua', 30, 'ml'),
  ('postres_031', 0, 'nata-para-montar', 'Nata para montar', 500, 'ml'),
  ('postres_031', 1, 'leche-condensada', 'Leche condensada', 400, 'g'),
  ('postres_031', 2, 'extracto-de-vainilla', 'Extracto de vainilla', 10, 'ml'),
  ('postres_031', 3, 'sal', 'Sal', 1, 'g'),
  ('postres_032', 0, 'limon', 'Zumo de limón', 200, 'ml'),
  ('postres_032', 1, 'agua', 'Agua', 350, 'ml'),
  ('postres_032', 2, 'azucar', 'Azúcar', 180, 'g'),
  ('postres_032', 3, 'limon', 'Ralladura de limón', 5, 'g'),
  ('postres_033', 0, 'chocolate', 'Chocolate negro', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_033', 1, 'mantequilla', 'Mantequilla', 150, 'g'),
  ('postres_033', 2, 'azucar', 'Azúcar', 80, 'g'),
  ('postres_033', 3, 'huevos', 'Huevo', 3, 'ud'),
  ('postres_033', 4, 'yema-de-huevo', 'Yema de huevo', 2, 'ud'),
  ('postres_033', 5, 'harina', 'Harina', 60, 'g'),
  ('postres_034', 0, 'harina', 'Harina', 250, 'g'),
  ('postres_034', 1, 'azucar', 'Azúcar', 300, 'g'),
  ('postres_034', 2, 'huevos', 'Huevo', 4, 'ud'),
  ('postres_034', 3, 'levadura-quimica', 'Levadura química', 8, 'g'),
  ('postres_034', 4, 'leche', 'Leche', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_034', 5, 'mantequilla', 'Mantequilla', 100, 'g'),
  ('postres_034', 6, 'agua', 'Agua', 200, 'ml'),
  ('postres_034', 7, 'ron', 'Ron', 80, 'ml'),
  ('postres_034', 8, 'limon', 'Ralladura de limón', 5, 'g'),
  ('postres_035', 0, 'harina', 'Harina', 300, 'g'),
  ('postres_035', 1, 'mantequilla', 'Mantequilla', 200, 'g'),
  ('postres_035', 2, 'azucar-glas', 'Azúcar glas', 270, 'g'),
  ('postres_035', 3, 'huevos', 'Huevo', 1, 'ud'),
  ('postres_035', 4, 'extracto-de-vainilla', 'Extracto de vainilla', 5, 'ml'),
  ('postres_035', 5, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('postres_035', 6, 'clara-de-huevo', 'Clara de huevo', 1, 'ud'),
  ('postres_035', 7, 'limon', 'Zumo de limón', 5, 'ml'),
  ('postres_036', 0, 'yogur', 'Yogur natural', 125, 'g'),
  ('postres_036', 1, 'azucar', 'Azúcar', 200, 'g'),
  ('postres_036', 2, 'aceite-girasol', 'Aceite de girasol', 150, 'ml'),
  ('postres_036', 3, 'harina', 'Harina', 300, 'g'),
  ('postres_036', 4, 'huevos', 'Huevo', 3, 'ud'),
  ('postres_036', 5, 'levadura-quimica', 'Levadura química', 16, 'g'),
  ('postres_036', 6, 'limon', 'Ralladura de limón', 10, 'g'),
  ('postres_036', 7, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_001', 0, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 60, 'ml'),
  ('salsas_001', 1, 'vinagre-de-jerez', 'Vinagre de Jerez', 20, 'ml'),
  ('salsas_001', 2, 'mostaza', 'Mostaza de Dijon', 10, 'g'),
  ('salsas_001', 3, 'sal', 'Sal', 2, 'g'),
  ('salsas_001', 4, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('salsas_002', 0, 'ajo', 'Ajo', 10, 'g'),
  ('salsas_002', 1, 'aceite-oliva', 'Aceite de oliva suave', 150, 'ml'),
  ('salsas_002', 2, 'sal', 'Sal', 2, 'g'),
  ('salsas_002', 3, 'limon', 'Zumo de limón', 5, 'ml'),
  ('salsas_003', 0, 'tomate-triturado', 'Tomate triturado', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_003', 1, 'cebolla', 'Cebolla', 50, 'g'),
  ('salsas_003', 2, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_003', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('salsas_003', 4, 'azucar', 'Azúcar', 5, 'g'),
  ('salsas_003', 5, 'sal', 'Sal', 3, 'g'),
  ('salsas_004', 0, 'caldo-de-carne', 'Caldo de carne', 300, 'ml'),
  ('salsas_004', 1, 'vino-tinto', 'Vino tinto', 50, 'ml'),
  ('salsas_004', 2, 'cebolla', 'Cebolla', 40, 'g'),
  ('salsas_004', 3, 'zanahoria', 'Zanahoria', 30, 'g'),
  ('salsas_004', 4, 'mantequilla', 'Mantequilla', 15, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_004', 5, 'harina', 'Harina', 10, 'g'),
  ('salsas_005', 0, 'perejil', 'Perejil fresco', 30, 'g'),
  ('salsas_005', 1, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_005', 2, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('salsas_005', 3, 'limon', 'Zumo de limón', 15, 'ml'),
  ('salsas_005', 4, 'alcaparras', 'Alcaparras', 10, 'g'),
  ('salsas_005', 5, 'sal', 'Sal', 2, 'g'),
  ('salsas_006', 0, 'cilantro', 'Cilantro fresco', 30, 'g'),
  ('salsas_006', 1, 'ajo', 'Ajo', 10, 'g'),
  ('salsas_006', 2, 'comino', 'Comino', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_006', 3, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('salsas_006', 4, 'vinagre', 'Vinagre', 15, 'ml'),
  ('salsas_006', 5, 'sal', 'Sal', 3, 'g'),
  ('salsas_007', 0, 'pimiento-choricero', 'Pimiento choricero (ñora)', 10, 'g'),
  ('salsas_007', 1, 'pimenton', 'Pimentón picante', 5, 'g'),
  ('salsas_007', 2, 'ajo', 'Ajo', 10, 'g'),
  ('salsas_007', 3, 'comino', 'Comino', 2, 'g'),
  ('salsas_007', 4, 'vinagre', 'Vinagre', 15, 'ml'),
  ('salsas_007', 5, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('salsas_007', 6, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_008', 0, 'perejil', 'Perejil fresco', 30, 'g'),
  ('salsas_008', 1, 'oregano', 'Orégano seco', 3, 'g'),
  ('salsas_008', 2, 'ajo', 'Ajo', 10, 'g'),
  ('salsas_008', 3, 'aceite-oliva', 'Aceite de oliva', 90, 'ml'),
  ('salsas_008', 4, 'vinagre', 'Vinagre de vino', 25, 'ml'),
  ('salsas_008', 5, 'guindilla', 'Guindilla', 1, 'g'),
  ('salsas_008', 6, 'sal', 'Sal', 3, 'g'),
  ('salsas_009', 0, 'mostaza', 'Mostaza de Dijon', 30, 'g'),
  ('salsas_009', 1, 'miel', 'Miel', 30, 'g'),
  ('salsas_009', 2, 'aceite-oliva', 'Aceite de oliva', 30, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_009', 3, 'limon', 'Zumo de limón', 10, 'ml'),
  ('salsas_009', 4, 'sal', 'Sal', 1, 'g'),
  ('salsas_010', 0, 'tomate', 'Tomate maduro', 100, 'g'),
  ('salsas_010', 1, 'pimiento-choricero', 'Pimiento choricero (ñora)', 10, 'g'),
  ('salsas_010', 2, 'almendras', 'Almendra tostada', 30, 'g'),
  ('salsas_010', 3, 'avellanas', 'Avellana tostada', 20, 'g'),
  ('salsas_010', 4, 'ajo', 'Ajo', 10, 'g'),
  ('salsas_010', 5, 'pan', 'Pan frito', 15, 'g'),
  ('salsas_010', 6, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('salsas_010', 7, 'vinagre', 'Vinagre', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_010', 8, 'sal', 'Sal', 3, 'g'),
  ('salsas_011', 0, 'tahini', 'Tahini', 60, 'g'),
  ('salsas_011', 1, 'limon', 'Zumo de limón', 30, 'ml'),
  ('salsas_011', 2, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_011', 3, 'agua', 'Agua', 40, 'ml'),
  ('salsas_011', 4, 'sal', 'Sal', 2, 'g'),
  ('salsas_012', 0, 'yogur', 'Yogur griego', 150, 'g'),
  ('salsas_012', 1, 'pepino', 'Pepino', 80, 'g'),
  ('salsas_012', 2, 'eneldo', 'Eneldo fresco', 5, 'g'),
  ('salsas_012', 3, 'ajo', 'Ajo', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_012', 4, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('salsas_012', 5, 'sal', 'Sal', 2, 'g'),
  ('salsas_013', 0, 'miso', 'Miso blanco', 40, 'g'),
  ('salsas_013', 1, 'mantequilla', 'Mantequilla', 40, 'g'),
  ('salsas_013', 2, 'mirin', 'Mirin', 15, 'ml'),
  ('salsas_013', 3, 'agua', 'Agua', 20, 'ml'),
  ('salsas_014', 0, 'perejil', 'Perejil fresco', 25, 'g'),
  ('salsas_014', 1, 'limon', 'Ralladura de limón', 5, 'g'),
  ('salsas_014', 2, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_015', 0, 'anchoa-en-aceite', 'Filetes de anchoa en aceite', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_015', 1, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_015', 2, 'aceite-oliva', 'Aceite de oliva', 60, 'ml'),
  ('salsas_015', 3, 'limon', 'Zumo de limón', 15, 'ml'),
  ('salsas_015', 4, 'perejil', 'Perejil fresco', 5, 'g'),
  ('salsas_016', 0, 'harissa', 'Harissa', 20, 'g'),
  ('salsas_016', 1, 'yogur', 'Yogur griego', 120, 'g'),
  ('salsas_016', 2, 'limon', 'Zumo de limón', 10, 'ml'),
  ('salsas_016', 3, 'sal', 'Sal', 1, 'g'),
  ('salsas_017', 0, 'pistacho', 'Pistacho pelado', 40, 'g'),
  ('salsas_017', 1, 'albahaca', 'Albahaca fresca', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_017', 2, 'aceite-oliva', 'Aceite de oliva', 70, 'ml'),
  ('salsas_017', 3, 'parmesano', 'Queso parmesano', 15, 'g'),
  ('salsas_017', 4, 'ajo', 'Ajo', 3, 'g'),
  ('salsas_019', 0, 'mantequilla', 'Mantequilla', 60, 'g'),
  ('salsas_019', 1, 'salvia', 'Salvia fresca', 3, 'g'),
  ('salsas_019', 2, 'limon', 'Zumo de limón', 5, 'ml'),
  ('salsas_020', 0, 'naranja', 'Zumo de naranja', 100, 'ml'),
  ('salsas_020', 1, 'jengibre', 'Jengibre fresco rallado', 10, 'g'),
  ('salsas_020', 2, 'miel', 'Miel', 15, 'g'),
  ('salsas_020', 3, 'salsa-soja', 'Salsa de soja', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_020', 4, 'maicena', 'Maicena', 5, 'g'),
  ('salsas_021', 0, 'ajo', 'Ajo', 10, 'g'),
  ('salsas_021', 1, 'aceite-oliva', 'Aceite de oliva suave', 150, 'ml'),
  ('salsas_021', 2, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('salsas_021', 3, 'sal', 'Sal', 2, 'g'),
  ('salsas_021', 4, 'limon', 'Zumo de limón', 5, 'ml'),
  ('salsas_023', 0, 'salsa-soja', 'Salsa de soja', 40, 'ml'),
  ('salsas_023', 1, 'miel', 'Miel', 20, 'g'),
  ('salsas_023', 2, 'aceite-de-sesamo', 'Aceite de sésamo', 10, 'ml'),
  ('salsas_023', 3, 'sesamo', 'Semillas de sésamo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_023', 4, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_023', 5, 'jengibre', 'Jengibre fresco rallado', 5, 'g'),
  ('salsas_024', 0, 'roquefort', 'Queso roquefort', 40, 'g'),
  ('salsas_024', 1, 'yogur', 'Yogur griego', 100, 'g'),
  ('salsas_024', 2, 'leche', 'Leche', 20, 'ml'),
  ('salsas_024', 3, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('salsas_025', 0, 'huevos', 'Huevo', 1, 'ud'),
  ('salsas_025', 1, 'aceite-girasol', 'Aceite de girasol', 200, 'ml'),
  ('salsas_025', 2, 'limon', 'Zumo de limón', 10, 'ml'),
  ('salsas_025', 3, 'sal', 'Sal', 2, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_026', 0, 'tomate-triturado', 'Tomate triturado', 150, 'g'),
  ('salsas_026', 1, 'pimenton', 'Pimentón picante', 5, 'g'),
  ('salsas_026', 2, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('salsas_026', 3, 'guindilla', 'Cayena', 1, 'g'),
  ('salsas_026', 4, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_026', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('salsas_026', 6, 'harina', 'Harina', 5, 'g'),
  ('salsas_027', 0, 'albahaca', 'Albahaca fresca', 30, 'g'),
  ('salsas_027', 1, 'pinones', 'Piñones', 20, 'g'),
  ('salsas_027', 2, 'parmesano', 'Queso parmesano', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_027', 3, 'ajo', 'Ajo', 5, 'g'),
  ('salsas_027', 4, 'aceite-oliva', 'Aceite de oliva', 80, 'ml'),
  ('salsas_028', 0, 'yema-de-huevo', 'Yema de huevo', 2, 'ud'),
  ('salsas_028', 1, 'mantequilla', 'Mantequilla', 100, 'g'),
  ('salsas_028', 2, 'limon', 'Zumo de limón', 10, 'ml'),
  ('salsas_028', 3, 'agua', 'Agua', 15, 'ml'),
  ('salsas_028', 4, 'sal', 'Sal', 1, 'g'),
  ('salsas_029', 0, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('salsas_029', 1, 'harina', 'Harina', 30, 'g'),
  ('salsas_029', 2, 'leche', 'Leche', 400, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('salsas_029', 3, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('salsas_029', 4, 'sal', 'Sal', 2, 'g'),
  ('salsas_030', 0, 'vino-blanco', 'Vino Pedro Ximénez', 200, 'ml'),
  ('salsas_030', 1, 'chalota', 'Chalota', 30, 'g'),
  ('salsas_030', 2, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('salsas_030', 3, 'sal', 'Sal', 1, 'g'),
  ('sopas_cremas_001', 0, 'calabacin', 'Calabacín', 400, 'g'),
  ('sopas_cremas_001', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_001', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_001', 3, 'quesito', 'Quesito en porciones', 30, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_001', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_002', 0, 'fideos', 'Fideos finos', 80, 'g'),
  ('sopas_cremas_002', 1, 'caldo-de-pollo', 'Caldo de pollo', 600, 'ml'),
  ('sopas_cremas_002', 2, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('sopas_cremas_002', 3, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('sopas_cremas_002', 4, 'perejil', 'Perejil', 5, 'g'),
  ('sopas_cremas_003', 0, 'calabaza', 'Calabaza', 400, 'g'),
  ('sopas_cremas_003', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_003', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_003', 3, 'zanahoria', 'Zanahoria', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_003', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_003', 5, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('sopas_cremas_004', 0, 'tomate', 'Tomate maduro', 500, 'g'),
  ('sopas_cremas_004', 1, 'pepino', 'Pepino', 80, 'g'),
  ('sopas_cremas_004', 2, 'pimiento-verde', 'Pimiento verde', 60, 'g'),
  ('sopas_cremas_004', 3, 'ajo', 'Ajo', 6, 'g'),
  ('sopas_cremas_004', 4, 'pan', 'Pan del día anterior', 30, 'g'),
  ('sopas_cremas_004', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('sopas_cremas_004', 6, 'vinagre-de-jerez', 'Vinagre de Jerez', 15, 'ml'),
  ('sopas_cremas_005', 0, 'tomate', 'Tomate maduro', 500, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_005', 1, 'pan', 'Pan del día anterior', 80, 'g'),
  ('sopas_cremas_005', 2, 'aceite-oliva', 'Aceite de oliva', 50, 'ml'),
  ('sopas_cremas_005', 3, 'ajo', 'Ajo', 6, 'g'),
  ('sopas_cremas_005', 4, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('sopas_cremas_005', 5, 'jamon', 'Jamón serrano', 20, 'g'),
  ('sopas_cremas_005', 6, 'huevos', 'Huevo cocido', 1, 'ud'),
  ('sopas_cremas_006', 0, 'zanahoria', 'Zanahoria', 400, 'g'),
  ('sopas_cremas_006', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_006', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_006', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_006', 4, 'jengibre', 'Jengibre fresco', 5, 'g'),
  ('sopas_cremas_007', 0, 'pan', 'Pan del día anterior', 80, 'g'),
  ('sopas_cremas_007', 1, 'ajo', 'Ajo', 12, 'g'),
  ('sopas_cremas_007', 2, 'pimenton', 'Pimentón', 6, 'g'),
  ('sopas_cremas_007', 3, 'jamon', 'Jamón serrano', 40, 'g'),
  ('sopas_cremas_007', 4, 'huevos', 'Huevo', 2, 'ud'),
  ('sopas_cremas_007', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_007', 6, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('sopas_cremas_008', 0, 'puerro', 'Puerro', 250, 'g'),
  ('sopas_cremas_008', 1, 'patata', 'Patata', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_008', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_008', 3, 'nata', 'Nata', 40, 'ml'),
  ('sopas_cremas_008', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_009', 0, 'puerro', 'Puerro', 300, 'g'),
  ('sopas_cremas_009', 1, 'patata', 'Patata', 150, 'g'),
  ('sopas_cremas_009', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_009', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_010', 0, 'cebolla', 'Cebolla', 400, 'g'),
  ('sopas_cremas_010', 1, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('sopas_cremas_010', 2, 'pan', 'Pan', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_010', 3, 'queso', 'Queso gruyère', 40, 'g'),
  ('sopas_cremas_010', 4, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_010', 5, 'vino-blanco', 'Vino blanco', 40, 'ml'),
  ('sopas_cremas_011', 0, 'calabacin', 'Calabacín', 150, 'g'),
  ('sopas_cremas_011', 1, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('sopas_cremas_011', 2, 'puerro', 'Puerro', 80, 'g'),
  ('sopas_cremas_011', 3, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_011', 4, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_011', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_012', 0, 'champinon', 'Champiñones', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_012', 1, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_012', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_012', 3, 'nata', 'Nata', 40, 'ml'),
  ('sopas_cremas_012', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_012', 5, 'ajo', 'Ajo', 6, 'g'),
  ('sopas_cremas_013', 0, 'patata', 'Patata', 400, 'g'),
  ('sopas_cremas_013', 1, 'leche', 'Leche', 80, 'ml'),
  ('sopas_cremas_013', 2, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_013', 3, 'nuez-moscada', 'Nuez moscada', 2, 'g'),
  ('sopas_cremas_014', 0, 'esparragos', 'Espárragos trigueros', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_014', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_014', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_014', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_014', 4, 'ajo', 'Ajo', 6, 'g'),
  ('sopas_cremas_015', 0, 'almendras', 'Almendras crudas', 100, 'g'),
  ('sopas_cremas_015', 1, 'pan', 'Pan del día anterior', 60, 'g'),
  ('sopas_cremas_015', 2, 'ajo', 'Ajo', 6, 'g'),
  ('sopas_cremas_015', 3, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('sopas_cremas_015', 4, 'vinagre-de-jerez', 'Vinagre de Jerez', 15, 'ml'),
  ('sopas_cremas_015', 5, 'uvas', 'Uvas', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_016', 0, 'tomate', 'Tomate maduro', 500, 'g'),
  ('sopas_cremas_016', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_016', 2, 'ajo', 'Ajo', 6, 'g'),
  ('sopas_cremas_016', 3, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_016', 4, 'oregano', 'Orégano', 3, 'g'),
  ('sopas_cremas_017', 0, 'brocoli', 'Brócoli', 350, 'g'),
  ('sopas_cremas_017', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_017', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_017', 3, 'ajo', 'Ajo', 6, 'g'),
  ('sopas_cremas_017', 4, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_018', 0, 'ajo', 'Ajo', 15, 'g'),
  ('sopas_cremas_018', 1, 'pan', 'Pan del día anterior', 60, 'g'),
  ('sopas_cremas_018', 2, 'pimenton', 'Pimentón', 6, 'g'),
  ('sopas_cremas_018', 3, 'huevos', 'Huevo', 2, 'ud'),
  ('sopas_cremas_018', 4, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_018', 5, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('sopas_cremas_019', 0, 'puerro', 'Puerro', 80, 'g'),
  ('sopas_cremas_019', 1, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('sopas_cremas_019', 2, 'judia-verde', 'Judías verdes', 80, 'g'),
  ('sopas_cremas_019', 3, 'nabo', 'Nabo', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_019', 4, 'repollo', 'Repollo', 60, 'g'),
  ('sopas_cremas_019', 5, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('sopas_cremas_019', 6, 'caldo-de-verduras', 'Caldo de verduras', 500, 'ml'),
  ('sopas_cremas_020', 0, 'lentejas-rojas', 'Lentejas rojas', 150, 'g'),
  ('sopas_cremas_020', 1, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('sopas_cremas_020', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_020', 3, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('sopas_cremas_020', 4, 'comino', 'Comino', 3, 'g'),
  ('sopas_cremas_020', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_021', 0, 'gazpacho-de-bote', 'Gazpacho de bote', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_021', 1, 'huevos', 'Huevo', 1, 'ud'),
  ('sopas_cremas_021', 2, 'jamon', 'Jamón serrano', 30, 'g'),
  ('sopas_cremas_021', 3, 'pan', 'Pan', 30, 'g'),
  ('sopas_cremas_021', 4, 'pepino', 'Pepino', 50, 'g'),
  ('sopas_cremas_021', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 10, 'ml'),
  ('sopas_cremas_022', 0, 'boletus', 'Boletus', 300, 'g'),
  ('sopas_cremas_022', 1, 'patata', 'Patata', 150, 'g'),
  ('sopas_cremas_022', 2, 'puerro', 'Puerro', 80, 'g'),
  ('sopas_cremas_022', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_022', 4, 'caldo-de-verduras', 'Caldo de verduras', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_022', 5, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('sopas_cremas_022', 6, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_022', 7, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_022', 8, 'perejil', 'Perejil fresco', 15, 'g'),
  ('sopas_cremas_023', 0, 'langostinos', 'Cáscaras y cabezas de langostinos', 300, 'g'),
  ('sopas_cremas_023', 1, 'langostinos', 'Langostinos pelados', 150, 'g'),
  ('sopas_cremas_023', 2, 'cebolla', 'Cebolla', 100, 'g'),
  ('sopas_cremas_023', 3, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('sopas_cremas_023', 4, 'puerro', 'Puerro', 60, 'g'),
  ('sopas_cremas_023', 5, 'tomate-triturado', 'Tomate triturado', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_023', 6, 'brandy', 'Brandy', 40, 'ml'),
  ('sopas_cremas_023', 7, 'vino-blanco', 'Vino blanco', 80, 'ml'),
  ('sopas_cremas_023', 8, 'arroz', 'Arroz', 30, 'g'),
  ('sopas_cremas_023', 9, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('sopas_cremas_023', 10, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('sopas_cremas_023', 11, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_023', 12, 'pimenton', 'Pimentón dulce', 4, 'g'),
  ('sopas_cremas_023', 13, 'agua', 'Agua', 800, 'ml'),
  ('sopas_cremas_024', 0, 'calabaza', 'Calabaza', 400, 'g'),
  ('sopas_cremas_024', 1, 'patata', 'Patata', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_024', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_024', 3, 'jengibre', 'Jengibre fresco', 15, 'g'),
  ('sopas_cremas_024', 4, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_024', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_024', 6, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('sopas_cremas_025', 0, 'sandia', 'Sandía', 500, 'g'),
  ('sopas_cremas_025', 1, 'tomate', 'Tomate maduro', 150, 'g'),
  ('sopas_cremas_025', 2, 'pepino', 'Pepino', 80, 'g'),
  ('sopas_cremas_025', 3, 'pimiento-verde', 'Pimiento verde', 40, 'g'),
  ('sopas_cremas_025', 4, 'ajo', 'Ajo', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_025', 5, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('sopas_cremas_025', 6, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('sopas_cremas_025', 7, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_026', 0, 'tomate', 'Tomate maduro', 500, 'g'),
  ('sopas_cremas_026', 1, 'pan', 'Pan del día anterior', 100, 'g'),
  ('sopas_cremas_026', 2, 'ajo', 'Ajo', 8, 'g'),
  ('sopas_cremas_026', 3, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 60, 'ml'),
  ('sopas_cremas_026', 4, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('sopas_cremas_026', 5, 'sal', 'Sal', 4, 'g'),
  ('sopas_cremas_026', 6, 'jamon', 'Jamón serrano', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_026', 7, 'huevos', 'Huevo', 1, 'ud'),
  ('sopas_cremas_027', 0, 'puerro', 'Puerro', 300, 'g'),
  ('sopas_cremas_027', 1, 'patata', 'Patata', 200, 'g'),
  ('sopas_cremas_027', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_027', 3, 'caldo-de-pollo', 'Caldo de pollo', 500, 'ml'),
  ('sopas_cremas_027', 4, 'nata', 'Nata para cocinar', 80, 'ml'),
  ('sopas_cremas_027', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_027', 6, 'bacon', 'Beicon en lonchas', 60, 'g'),
  ('sopas_cremas_028', 0, 'guisantes', 'Guisantes congelados', 350, 'g'),
  ('sopas_cremas_028', 1, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_028', 2, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_028', 3, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_028', 4, 'menta', 'Menta fresca', 10, 'g'),
  ('sopas_cremas_028', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_028', 6, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('sopas_cremas_029', 0, 'champinon', 'Champiñones', 350, 'g'),
  ('sopas_cremas_029', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_029', 2, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('sopas_cremas_029', 3, 'harina', 'Harina de trigo', 25, 'g'),
  ('sopas_cremas_029', 4, 'caldo-de-pollo', 'Caldo de pollo', 500, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_029', 5, 'nata', 'Nata para cocinar', 80, 'ml'),
  ('sopas_cremas_029', 6, 'limon', 'Zumo de limón', 5, 'ml'),
  ('sopas_cremas_030', 0, 'cebolla', 'Cebolla', 400, 'g'),
  ('sopas_cremas_030', 1, 'mantequilla', 'Mantequilla', 30, 'g'),
  ('sopas_cremas_030', 2, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('sopas_cremas_030', 3, 'caldo-de-carne', 'Caldo de carne', 600, 'ml'),
  ('sopas_cremas_030', 4, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('sopas_cremas_030', 5, 'pan', 'Pan tostado', 60, 'g'),
  ('sopas_cremas_030', 6, 'queso', 'Queso gruyère rallado', 80, 'g'),
  ('sopas_cremas_030', 7, 'azucar', 'Azúcar', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_030', 8, 'tomillo', 'Tomillo', 2, 'g'),
  ('sopas_cremas_031', 0, 'coliflor', 'Coliflor', 500, 'g'),
  ('sopas_cremas_031', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_031', 2, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_031', 3, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('sopas_cremas_031', 4, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_031', 5, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('sopas_cremas_031', 6, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('sopas_cremas_032', 0, 'esparragos', 'Espárragos verdes', 350, 'g'),
  ('sopas_cremas_032', 1, 'puerro', 'Puerro', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_032', 2, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_032', 3, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_032', 4, 'langostinos', 'Langostinos pelados', 150, 'g'),
  ('sopas_cremas_032', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_032', 6, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('sopas_cremas_033', 0, 'remolacha', 'Remolacha cocida', 250, 'g'),
  ('sopas_cremas_033', 1, 'tomate', 'Tomate maduro', 200, 'g'),
  ('sopas_cremas_033', 2, 'pepino', 'Pepino', 100, 'g'),
  ('sopas_cremas_033', 3, 'pimiento-verde', 'Pimiento verde', 40, 'g'),
  ('sopas_cremas_033', 4, 'ajo', 'Ajo', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_033', 5, 'pan', 'Pan del día anterior', 30, 'g'),
  ('sopas_cremas_033', 6, 'vinagre-de-jerez', 'Vinagre de jerez', 10, 'ml'),
  ('sopas_cremas_033', 7, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 25, 'ml'),
  ('sopas_cremas_033', 8, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_034', 0, 'pepino', 'Pepino', 400, 'g'),
  ('sopas_cremas_034', 1, 'yogur', 'Yogur griego natural', 200, 'g'),
  ('sopas_cremas_034', 2, 'ajo', 'Ajo', 5, 'g'),
  ('sopas_cremas_034', 3, 'menta', 'Menta fresca', 10, 'g'),
  ('sopas_cremas_034', 4, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('sopas_cremas_034', 5, 'limon', 'Zumo de limón', 10, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_034', 6, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_035', 0, 'castanas', 'Castañas cocidas y peladas', 300, 'g'),
  ('sopas_cremas_035', 1, 'puerro', 'Puerro', 80, 'g'),
  ('sopas_cremas_035', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_035', 3, 'caldo-de-pollo', 'Caldo de pollo', 500, 'ml'),
  ('sopas_cremas_035', 4, 'nata', 'Nata para cocinar', 80, 'ml'),
  ('sopas_cremas_035', 5, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_035', 6, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('sopas_cremas_036', 0, 'aguacate', 'Aguacate', 300, 'g'),
  ('sopas_cremas_036', 1, 'pepino', 'Pepino', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_036', 2, 'caldo-de-verduras', 'Caldo de verduras', 300, 'ml'),
  ('sopas_cremas_036', 3, 'lima', 'Lima (zumo)', 30, 'ml'),
  ('sopas_cremas_036', 4, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('sopas_cremas_036', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 15, 'ml'),
  ('sopas_cremas_036', 6, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_037', 0, 'zanahoria', 'Zanahoria', 400, 'g'),
  ('sopas_cremas_037', 1, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_037', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_037', 3, 'jengibre', 'Jengibre fresco', 15, 'g'),
  ('sopas_cremas_037', 4, 'caldo-de-verduras', 'Caldo de verduras', 450, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_037', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_037', 6, 'naranja', 'Zumo de naranja', 30, 'ml'),
  ('sopas_cremas_038', 0, 'brocoli', 'Brócoli', 400, 'g'),
  ('sopas_cremas_038', 1, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_038', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_038', 3, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_038', 4, 'queso-azul', 'Queso azul', 60, 'g'),
  ('sopas_cremas_038', 5, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('sopas_cremas_038', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_039', 0, 'patata', 'Patata', 500, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_039', 1, 'grelo', 'Grelos', 300, 'g'),
  ('sopas_cremas_039', 2, 'judia-blanca', 'Judías blancas cocidas', 400, 'g'),
  ('sopas_cremas_039', 3, 'chorizo', 'Chorizo', 150, 'g'),
  ('sopas_cremas_039', 4, 'lacon', 'Lacón', 150, 'g'),
  ('sopas_cremas_039', 5, 'unto', 'Unto', 30, 'g'),
  ('sopas_cremas_039', 6, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_039', 7, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('sopas_cremas_039', 8, 'agua', 'Agua', 1500, 'ml'),
  ('sopas_cremas_040', 0, 'calabacin', 'Calabacín', 400, 'g'),
  ('sopas_cremas_040', 1, 'patata', 'Patata', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_040', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_040', 3, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_040', 4, 'menta', 'Menta fresca', 10, 'g'),
  ('sopas_cremas_040', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_040', 6, 'queso', 'Queso en porciones', 30, 'g'),
  ('sopas_cremas_041', 0, 'mejillones', 'Mejillones', 200, 'g'),
  ('sopas_cremas_041', 1, 'langostinos', 'Langostinos', 200, 'g'),
  ('sopas_cremas_041', 2, 'monkfish', 'Rape', 150, 'g'),
  ('sopas_cremas_041', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_041', 4, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_041', 5, 'tomate-triturado', 'Tomate triturado', 100, 'g'),
  ('sopas_cremas_041', 6, 'pimiento-verde', 'Pimiento verde', 40, 'g'),
  ('sopas_cremas_041', 7, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('sopas_cremas_041', 8, 'caldo-de-pescado', 'Fumet de pescado', 600, 'ml'),
  ('sopas_cremas_041', 9, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('sopas_cremas_041', 10, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('sopas_cremas_041', 11, 'perejil', 'Perejil', 5, 'g'),
  ('sopas_cremas_042', 0, 'tomate', 'Tomate maduro', 800, 'g'),
  ('sopas_cremas_042', 1, 'cebolla', 'Cebolla', 100, 'g'),
  ('sopas_cremas_042', 2, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_042', 3, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('sopas_cremas_042', 4, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('sopas_cremas_042', 5, 'azucar', 'Azúcar', 5, 'g'),
  ('sopas_cremas_042', 6, 'albahaca', 'Albahaca fresca', 5, 'g'),
  ('sopas_cremas_042', 7, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_042', 8, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('sopas_cremas_043', 0, 'patata', 'Patata', 200, 'g'),
  ('sopas_cremas_043', 1, 'puerro', 'Puerro', 100, 'g'),
  ('sopas_cremas_043', 2, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_043', 3, 'nata', 'Nata para cocinar', 100, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_043', 4, 'queso', 'Queso Emmental', 40, 'g'),
  ('sopas_cremas_043', 5, 'queso', 'Queso Gruyère', 40, 'g'),
  ('sopas_cremas_043', 6, 'queso-crema', 'Queso crema', 40, 'g'),
  ('sopas_cremas_043', 7, 'mantequilla', 'Mantequilla', 15, 'g'),
  ('sopas_cremas_043', 8, 'sal', 'Sal', 2, 'g'),
  ('sopas_cremas_043', 9, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('sopas_cremas_043', 10, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('sopas_cremas_044', 0, 'merluza', 'Merluza', 200, 'g'),
  ('sopas_cremas_044', 1, 'gambas', 'Gambas', 150, 'g'),
  ('sopas_cremas_044', 2, 'mejillones', 'Mejillones', 200, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_044', 3, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_044', 4, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_044', 5, 'tomate-triturado', 'Tomate triturado', 100, 'g'),
  ('sopas_cremas_044', 6, 'pimiento-verde', 'Pimiento verde', 50, 'g'),
  ('sopas_cremas_044', 7, 'caldo-de-pescado', 'Fumet de pescado', 500, 'ml'),
  ('sopas_cremas_044', 8, 'vino-blanco', 'Vino blanco', 50, 'ml'),
  ('sopas_cremas_044', 9, 'azafran', 'Azafrán', 1, 'g'),
  ('sopas_cremas_044', 10, 'patata', 'Patata', 150, 'g'),
  ('sopas_cremas_044', 11, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_044', 12, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_044', 13, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_045', 0, 'tomate', 'Tomate maduro', 600, 'g'),
  ('sopas_cremas_045', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_045', 2, 'zanahoria', 'Zanahoria', 50, 'g'),
  ('sopas_cremas_045', 3, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('sopas_cremas_045', 4, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('sopas_cremas_045', 5, 'albahaca', 'Albahaca fresca', 15, 'g'),
  ('sopas_cremas_045', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_045', 7, 'azucar', 'Azúcar', 5, 'g'),
  ('sopas_cremas_045', 8, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_046', 0, 'fresa', 'Fresas', 400, 'g'),
  ('sopas_cremas_046', 1, 'tomate', 'Tomate maduro', 200, 'g'),
  ('sopas_cremas_046', 2, 'pepino', 'Pepino', 100, 'g'),
  ('sopas_cremas_046', 3, 'pimiento-rojo', 'Pimiento rojo', 50, 'g'),
  ('sopas_cremas_046', 4, 'pan', 'Pan', 30, 'g'),
  ('sopas_cremas_046', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('sopas_cremas_046', 6, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('sopas_cremas_046', 7, 'ajo', 'Ajo', 5, 'g'),
  ('sopas_cremas_046', 8, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_047', 0, 'alcachofa-conserva', 'Corazones de alcachofa', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_047', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_047', 2, 'puerro', 'Puerro', 80, 'g'),
  ('sopas_cremas_047', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_047', 4, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_047', 5, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('sopas_cremas_047', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_047', 7, 'limon', 'Zumo de limón', 10, 'ml'),
  ('sopas_cremas_047', 8, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_047', 9, 'pimienta-blanca', 'Pimienta blanca', 1, 'g'),
  ('sopas_cremas_048', 0, 'miso', 'Miso', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_048', 1, 'alga-wakame', 'Alga wakame', 5, 'g'),
  ('sopas_cremas_048', 2, 'tofu', 'Tofu firme', 100, 'g'),
  ('sopas_cremas_048', 3, 'champinon', 'Champiñones', 80, 'g'),
  ('sopas_cremas_048', 4, 'cebolleta', 'Cebolleta', 30, 'g'),
  ('sopas_cremas_048', 5, 'agua', 'Agua', 600, 'ml'),
  ('sopas_cremas_048', 6, 'salsa-soja', 'Salsa de soja', 10, 'ml'),
  ('sopas_cremas_048', 7, 'aceite-de-sesamo', 'Aceite de sésamo', 5, 'ml'),
  ('sopas_cremas_049', 0, 'garbanzos', 'Garbanzos cocidos', 400, 'g'),
  ('sopas_cremas_049', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_049', 2, 'ajo', 'Ajo', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_049', 3, 'zanahoria', 'Zanahoria', 60, 'g'),
  ('sopas_cremas_049', 4, 'comino', 'Comino molido', 3, 'g'),
  ('sopas_cremas_049', 5, 'curcuma', 'Cúrcuma', 2, 'g'),
  ('sopas_cremas_049', 6, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_049', 7, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('sopas_cremas_049', 8, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_049', 9, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('sopas_cremas_050', 0, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('sopas_cremas_050', 1, 'puerro', 'Puerro', 80, 'g'),
  ('sopas_cremas_050', 2, 'judia-verde', 'Judía verde', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_050', 3, 'nabo', 'Nabo', 50, 'g'),
  ('sopas_cremas_050', 4, 'jamon', 'Jamón serrano', 40, 'g'),
  ('sopas_cremas_050', 5, 'caldo-de-pollo', 'Caldo de pollo', 600, 'ml'),
  ('sopas_cremas_050', 6, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('sopas_cremas_050', 7, 'sal', 'Sal', 2, 'g'),
  ('sopas_cremas_051', 0, 'espinacas', 'Espinacas frescas', 400, 'g'),
  ('sopas_cremas_051', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_051', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_051', 3, 'caldo-de-verduras', 'Caldo de verduras', 300, 'ml'),
  ('sopas_cremas_051', 4, 'nata', 'Nata para cocinar', 80, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_051', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_051', 6, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('sopas_cremas_051', 7, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_052', 0, 'tomate', 'Tomate maduro', 500, 'g'),
  ('sopas_cremas_052', 1, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_052', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_052', 3, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_052', 4, 'albahaca', 'Albahaca fresca', 15, 'g'),
  ('sopas_cremas_052', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_052', 6, 'pan', 'Pan tostado', 40, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_052', 7, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_052', 8, 'azucar', 'Azúcar', 3, 'g'),
  ('sopas_cremas_053', 0, 'setas', 'Setas variadas', 400, 'g'),
  ('sopas_cremas_053', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_053', 2, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_053', 3, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_053', 4, 'caldo-de-verduras', 'Caldo de verduras', 350, 'ml'),
  ('sopas_cremas_053', 5, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('sopas_cremas_053', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_053', 7, 'tomillo', 'Tomillo fresco', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_053', 8, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_053', 9, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('sopas_cremas_054', 0, 'puerro', 'Puerro', 300, 'g'),
  ('sopas_cremas_054', 1, 'patata', 'Patata', 200, 'g'),
  ('sopas_cremas_054', 2, 'manzana', 'Manzana Golden', 150, 'g'),
  ('sopas_cremas_054', 3, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_054', 4, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('sopas_cremas_054', 5, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_054', 6, 'cebollino', 'Cebollino', 5, 'g'),
  ('sopas_cremas_054', 7, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_054', 8, 'pimienta-blanca', 'Pimienta blanca', 1, 'g'),
  ('sopas_cremas_055', 0, 'calabaza', 'Calabaza', 500, 'g'),
  ('sopas_cremas_055', 1, 'castanas', 'Castañas cocidas', 150, 'g'),
  ('sopas_cremas_055', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_055', 3, 'puerro', 'Puerro', 60, 'g'),
  ('sopas_cremas_055', 4, 'caldo-de-verduras', 'Caldo de verduras', 400, 'ml'),
  ('sopas_cremas_055', 5, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('sopas_cremas_055', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_055', 7, 'nuez-moscada', 'Nuez moscada', 1, 'g'),
  ('sopas_cremas_055', 8, 'sal', 'Sal', 3, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_056', 0, 'melon', 'Melón', 500, 'g'),
  ('sopas_cremas_056', 1, 'jamon', 'Jamón serrano', 40, 'g'),
  ('sopas_cremas_056', 2, 'yogur', 'Yogur griego', 100, 'g'),
  ('sopas_cremas_056', 3, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_056', 4, 'menta', 'Menta fresca', 5, 'g'),
  ('sopas_cremas_056', 5, 'sal', 'Sal', 2, 'g'),
  ('sopas_cremas_056', 6, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('sopas_cremas_057', 0, 'pimiento-rojo', 'Pimiento rojo', 500, 'g'),
  ('sopas_cremas_057', 1, 'pimiento-verde', 'Pimiento amarillo', 200, 'g'),
  ('sopas_cremas_057', 2, 'cebolla', 'Cebolla', 80, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_057', 3, 'tomate', 'Tomate maduro', 100, 'g'),
  ('sopas_cremas_057', 4, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('sopas_cremas_057', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('sopas_cremas_057', 6, 'vinagre-de-jerez', 'Vinagre de Jerez', 5, 'ml'),
  ('sopas_cremas_057', 7, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_057', 8, 'azucar', 'Azúcar', 3, 'g'),
  ('sopas_cremas_058', 0, 'hueso-de-ternera', 'Hueso de ternera', 400, 'g'),
  ('sopas_cremas_058', 1, 'morcillo-de-ternera', 'Morcillo de ternera', 200, 'g'),
  ('sopas_cremas_058', 2, 'jamon', 'Hueso de jamón', 100, 'g'),
  ('sopas_cremas_058', 3, 'zanahoria', 'Zanahoria', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_058', 4, 'puerro', 'Puerro', 80, 'g'),
  ('sopas_cremas_058', 5, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_058', 6, 'apio', 'Apio', 50, 'g'),
  ('sopas_cremas_058', 7, 'agua', 'Agua', 2000, 'ml'),
  ('sopas_cremas_058', 8, 'jerez-seco', 'Jerez seco', 40, 'ml'),
  ('sopas_cremas_058', 9, 'clara-de-huevo', 'Clara de huevo', 1, 'ud'),
  ('sopas_cremas_058', 10, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_059', 0, 'langostinos', 'Langostinos', 400, 'g'),
  ('sopas_cremas_059', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_059', 2, 'zanahoria', 'Zanahoria', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_059', 3, 'puerro', 'Puerro', 60, 'g'),
  ('sopas_cremas_059', 4, 'tomate-triturado', 'Tomate triturado', 80, 'g'),
  ('sopas_cremas_059', 5, 'brandy', 'Brandy', 30, 'ml'),
  ('sopas_cremas_059', 6, 'caldo-de-pescado', 'Fumet de pescado', 400, 'ml'),
  ('sopas_cremas_059', 7, 'nata', 'Nata para cocinar', 100, 'ml'),
  ('sopas_cremas_059', 8, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('sopas_cremas_059', 9, 'pimenton', 'Pimentón dulce', 2, 'g'),
  ('sopas_cremas_059', 10, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_060', 0, 'pan', 'Pan duro', 100, 'g'),
  ('sopas_cremas_060', 1, 'ajo', 'Ajo', 20, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_060', 2, 'pimenton', 'Pimentón dulce', 5, 'g'),
  ('sopas_cremas_060', 3, 'caldo-de-pollo', 'Caldo de pollo', 600, 'ml'),
  ('sopas_cremas_060', 4, 'huevos', 'Huevo', 2, 'ud'),
  ('sopas_cremas_060', 5, 'aceite-oliva', 'Aceite de oliva', 25, 'ml'),
  ('sopas_cremas_060', 6, 'sal', 'Sal', 2, 'g'),
  ('sopas_cremas_061', 0, 'tomate-triturado', 'Tomate triturado', 500, 'g'),
  ('sopas_cremas_061', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_061', 2, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_061', 3, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('sopas_cremas_061', 4, 'nata', 'Nata para cocinar', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_061', 5, 'azucar', 'Azúcar', 5, 'g'),
  ('sopas_cremas_061', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_061', 7, 'pan-molde', 'Pan de molde', 4, 'ud'),
  ('sopas_cremas_061', 8, 'queso', 'Queso cheddar en lonchas', 80, 'g'),
  ('sopas_cremas_061', 9, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_061', 10, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_062', 0, 'calabacin', 'Calabacín', 400, 'g'),
  ('sopas_cremas_062', 1, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_062', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_062', 3, 'caldo-de-verduras', 'Caldo de verduras', 350, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_062', 4, 'queso-azul', 'Queso azul', 60, 'g'),
  ('sopas_cremas_062', 5, 'nata', 'Nata para cocinar', 50, 'ml'),
  ('sopas_cremas_062', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_062', 7, 'sal', 'Sal', 2, 'g'),
  ('sopas_cremas_062', 8, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('sopas_cremas_063', 0, 'coliflor', 'Coliflor', 350, 'g'),
  ('sopas_cremas_063', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_063', 2, 'puerro', 'Puerro', 150, 'g'),
  ('sopas_cremas_063', 3, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_063', 4, 'nata', 'Nata para cocinar', 40, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_063', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_064', 0, 'boniato', 'Boniato', 400, 'g'),
  ('sopas_cremas_064', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_064', 2, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_064', 3, 'leche-coco', 'Leche de coco', 200, 'ml'),
  ('sopas_cremas_064', 4, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('sopas_cremas_064', 5, 'jengibre', 'Jengibre fresco', 10, 'g'),
  ('sopas_cremas_064', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_065', 0, 'pepino', 'Pepino', 300, 'g'),
  ('sopas_cremas_065', 1, 'aguacate', 'Aguacate', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_065', 2, 'pimiento-verde', 'Pimiento verde', 40, 'g'),
  ('sopas_cremas_065', 3, 'cebolleta', 'Cebolleta', 30, 'g'),
  ('sopas_cremas_065', 4, 'ajo', 'Ajo', 5, 'g'),
  ('sopas_cremas_065', 5, 'yogur', 'Yogur natural', 100, 'g'),
  ('sopas_cremas_065', 6, 'lima', 'Zumo de lima', 10, 'ml'),
  ('sopas_cremas_065', 7, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('sopas_cremas_065', 8, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_065', 9, 'agua', 'Agua fría', 100, 'ml'),
  ('sopas_cremas_066', 0, 'guisantes', 'Guisantes congelados', 300, 'g'),
  ('sopas_cremas_066', 1, 'cebolla', 'Cebolla', 50, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_066', 2, 'puerro', 'Puerro', 100, 'g'),
  ('sopas_cremas_066', 3, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_066', 4, 'caldo-de-pollo', 'Caldo de pollo', 300, 'ml'),
  ('sopas_cremas_066', 5, 'jamon', 'Jamón serrano en lonchas finas', 50, 'g'),
  ('sopas_cremas_066', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_066', 7, 'menta', 'Menta fresca', 5, 'g'),
  ('sopas_cremas_067', 0, 'pan-de-payes', 'Pan payés del día anterior', 150, 'g'),
  ('sopas_cremas_067', 1, 'tomate-triturado', 'Tomate triturado', 400, 'g'),
  ('sopas_cremas_067', 2, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_067', 3, 'albahaca', 'Albahaca fresca', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_067', 4, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('sopas_cremas_067', 5, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('sopas_cremas_068', 0, 'puerro', 'Puerro', 350, 'g'),
  ('sopas_cremas_068', 1, 'patata', 'Patata', 120, 'g'),
  ('sopas_cremas_068', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_068', 3, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('sopas_cremas_068', 4, 'almendras', 'Almendras tostadas', 30, 'g'),
  ('sopas_cremas_068', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_069', 0, 'gambas', 'Gambas', 200, 'g'),
  ('sopas_cremas_069', 1, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_069', 2, 'puerro', 'Puerro', 60, 'g'),
  ('sopas_cremas_069', 3, 'zanahoria', 'Zanahoria', 50, 'g'),
  ('sopas_cremas_069', 4, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_069', 5, 'harina', 'Harina', 15, 'g'),
  ('sopas_cremas_069', 6, 'nata', 'Nata para cocinar', 60, 'ml'),
  ('sopas_cremas_069', 7, 'brandy', 'Brandy', 30, 'ml'),
  ('sopas_cremas_069', 8, 'caldo-de-pescado', 'Fumet de pescado', 400, 'ml'),
  ('sopas_cremas_069', 9, 'tomate-concentrado', 'Tomate concentrado', 15, 'g'),
  ('sopas_cremas_069', 10, 'aceite-oliva', 'Aceite de oliva', 10, 'ml'),
  ('sopas_cremas_070', 0, 'guisantes', 'Guisantes congelados', 300, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_070', 1, 'langostinos', 'Langostinos pelados', 150, 'g'),
  ('sopas_cremas_070', 2, 'menta', 'Menta fresca', 10, 'g'),
  ('sopas_cremas_070', 3, 'caldo-de-verduras', 'Caldo de verduras', 250, 'ml'),
  ('sopas_cremas_070', 4, 'yogur', 'Yogur natural', 80, 'g'),
  ('sopas_cremas_070', 5, 'ajo', 'Ajo', 5, 'g'),
  ('sopas_cremas_070', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_071', 0, 'cebolla', 'Cebolla', 400, 'g'),
  ('sopas_cremas_071', 1, 'mantequilla', 'Mantequilla', 20, 'g'),
  ('sopas_cremas_071', 2, 'caldo-de-carne', 'Caldo de carne', 500, 'ml'),
  ('sopas_cremas_071', 3, 'vino-blanco', 'Vino blanco', 50, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_071', 4, 'baguette', 'Pan de baguette en rebanadas', 60, 'g'),
  ('sopas_cremas_071', 5, 'queso', 'Queso gruyère rallado', 80, 'g'),
  ('sopas_cremas_071', 6, 'jamon-york', 'Jamón cocido en tiras', 60, 'g'),
  ('sopas_cremas_071', 7, 'tomillo', 'Tomillo', 2, 'g'),
  ('sopas_cremas_072', 0, 'calabaza', 'Calabaza', 500, 'g'),
  ('sopas_cremas_072', 1, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_072', 2, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_072', 3, 'caldo-de-verduras', 'Caldo de verduras', 300, 'ml'),
  ('sopas_cremas_072', 4, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('sopas_cremas_072', 5, 'salvia', 'Hojas de salvia fresca', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_072', 6, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('sopas_cremas_073', 0, 'pepino', 'Pepino', 250, 'g'),
  ('sopas_cremas_073', 1, 'manzana', 'Manzana verde', 150, 'g'),
  ('sopas_cremas_073', 2, 'pimiento-verde', 'Pimiento verde', 40, 'g'),
  ('sopas_cremas_073', 3, 'apio', 'Apio', 30, 'g'),
  ('sopas_cremas_073', 4, 'ajo', 'Ajo', 5, 'g'),
  ('sopas_cremas_073', 5, 'vinagre-de-manzana', 'Vinagre de manzana', 15, 'ml'),
  ('sopas_cremas_073', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_073', 7, 'agua', 'Agua fría', 100, 'ml'),
  ('sopas_cremas_074', 0, 'apionabo', 'Apionabo', 350, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_074', 1, 'patata', 'Patata', 100, 'g'),
  ('sopas_cremas_074', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_074', 3, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('sopas_cremas_074', 4, 'avellanas', 'Avellanas tostadas', 30, 'g'),
  ('sopas_cremas_074', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_075', 0, 'tomate', 'Tomate maduro', 600, 'g'),
  ('sopas_cremas_075', 1, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_075', 2, 'ajo', 'Ajo', 15, 'g'),
  ('sopas_cremas_075', 3, 'burrata', 'Burrata', 125, 'g'),
  ('sopas_cremas_075', 4, 'albahaca', 'Albahaca fresca', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_075', 5, 'aceite-oliva', 'Aceite de oliva', 40, 'ml'),
  ('sopas_cremas_076', 0, 'esparragos', 'Espárragos verdes', 350, 'g'),
  ('sopas_cremas_076', 1, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_076', 2, 'cebolla', 'Cebolla', 50, 'g'),
  ('sopas_cremas_076', 3, 'caldo-de-verduras', 'Caldo de verduras', 300, 'ml'),
  ('sopas_cremas_076', 4, 'parmesano', 'Queso parmesano en virutas', 30, 'g'),
  ('sopas_cremas_076', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_077', 0, 'puerro', 'Puerro', 250, 'g'),
  ('sopas_cremas_077', 1, 'patata', 'Patata', 200, 'g'),
  ('sopas_cremas_077', 2, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_077', 3, 'nata', 'Nata para cocinar', 40, 'ml'),
  ('sopas_cremas_077', 4, 'jamon', 'Jamón serrano en lonchas finas', 50, 'g'),
  ('sopas_cremas_077', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_078', 0, 'setas', 'Setas variadas', 300, 'g'),
  ('sopas_cremas_078', 1, 'castanas', 'Castañas cocidas', 100, 'g'),
  ('sopas_cremas_078', 2, 'cebolla', 'Cebolla', 60, 'g'),
  ('sopas_cremas_078', 3, 'puerro', 'Puerro', 60, 'g'),
  ('sopas_cremas_078', 4, 'caldo-de-verduras', 'Caldo de verduras', 300, 'ml'),
  ('sopas_cremas_078', 5, 'nata', 'Nata para cocinar', 30, 'ml'),
  ('sopas_cremas_078', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_078', 7, 'tomillo', 'Tomillo', 2, 'g'),
  ('sopas_cremas_079', 0, 'tomate', 'Tomate maduro', 300, 'g'),
  ('sopas_cremas_079', 1, 'sandia', 'Sandía', 300, 'g'),
  ('sopas_cremas_079', 2, 'pepino', 'Pepino', 50, 'g'),
  ('sopas_cremas_079', 3, 'ajo', 'Ajo', 5, 'g'),
  ('sopas_cremas_079', 4, 'vinagre-de-jerez', 'Vinagre de Jerez', 10, 'ml'),
  ('sopas_cremas_079', 5, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_079', 6, 'albahaca', 'Albahaca fresca', 5, 'g'),
  ('sopas_cremas_080', 0, 'zanahoria', 'Zanahoria', 400, 'g'),
  ('sopas_cremas_080', 1, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_080', 2, 'patata', 'Patata', 80, 'g'),
  ('sopas_cremas_080', 3, 'naranja', 'Zumo de naranja', 150, 'ml'),
  ('sopas_cremas_080', 4, 'caldo-de-verduras', 'Caldo de verduras', 200, 'ml'),
  ('sopas_cremas_080', 5, 'jengibre', 'Jengibre fresco', 5, 'g'),
  ('sopas_cremas_080', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_081', 0, 'monkfish', 'Rape', 150, 'g'),
  ('sopas_cremas_081', 1, 'mejillones', 'Mejillones', 150, 'g'),
  ('sopas_cremas_081', 2, 'gambas', 'Gambas', 100, 'g'),
  ('sopas_cremas_081', 3, 'tomate-triturado', 'Tomate triturado', 150, 'g'),
  ('sopas_cremas_081', 4, 'cebolla', 'Cebolla', 60, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_081', 5, 'puerro', 'Puerro', 60, 'g'),
  ('sopas_cremas_081', 6, 'hinojo', 'Hinojo', 60, 'g'),
  ('sopas_cremas_081', 7, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_081', 8, 'azafran', 'Azafrán en hebras', 1, 'g'),
  ('sopas_cremas_081', 9, 'vino-blanco', 'Vino blanco', 80, 'ml'),
  ('sopas_cremas_081', 10, 'caldo-de-pescado', 'Fumet de pescado', 400, 'ml'),
  ('sopas_cremas_081', 11, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_081', 12, 'pan', 'Pan tostado', 40, 'g'),
  ('sopas_cremas_081', 13, 'perejil', 'Perejil fresco', 5, 'g'),
  ('sopas_cremas_082', 0, 'patata', 'Patata', 150, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_082', 1, 'puerro', 'Puerro', 100, 'g'),
  ('sopas_cremas_082', 2, 'zanahoria', 'Zanahoria', 100, 'g'),
  ('sopas_cremas_082', 3, 'calabacin', 'Calabacín', 100, 'g'),
  ('sopas_cremas_082', 4, 'pan-molde', 'Pan de molde', 40, 'g'),
  ('sopas_cremas_082', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_083', 0, 'caldo-de-pollo', 'Caldo de pollo', 600, 'ml'),
  ('sopas_cremas_083', 1, 'fideos', 'Fideos finos', 60, 'g'),
  ('sopas_cremas_083', 2, 'jamon', 'Jamón serrano en tacos', 40, 'g'),
  ('sopas_cremas_083', 3, 'huevos', 'Huevo', 2, 'ud'),
  ('sopas_cremas_083', 4, 'perejil', 'Perejil', 5, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_084', 0, 'pechuga-de-pollo', 'Pechuga de pollo', 150, 'g'),
  ('sopas_cremas_084', 1, 'fideos', 'Fideos finos', 60, 'g'),
  ('sopas_cremas_084', 2, 'zanahoria', 'Zanahoria', 1, 'ud'),
  ('sopas_cremas_084', 3, 'puerro', 'Puerro', 0.5, 'ud'),
  ('sopas_cremas_084', 4, 'apio', 'Apio', 0.5, 'ud'),
  ('sopas_cremas_084', 5, 'agua', 'Agua', 700, 'ml'),
  ('sopas_cremas_085', 0, 'merluza', 'Merluza o pescado blanco', 200, 'g'),
  ('sopas_cremas_085', 1, 'fideos', 'Fideos finos', 50, 'g'),
  ('sopas_cremas_085', 2, 'tomate-triturado', 'Tomate triturado', 60, 'ml'),
  ('sopas_cremas_085', 3, 'cebolla', 'Cebolla', 0.5, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_085', 4, 'pan-molde', 'Pan de molde', 30, 'g'),
  ('sopas_cremas_085', 5, 'aceite-oliva', 'Aceite de oliva', 15, 'ml'),
  ('sopas_cremas_085', 6, 'caldo-de-pescado', 'Caldo de pescado', 500, 'ml'),
  ('sopas_cremas_086', 0, 'caldo-de-verduras', 'Caldo de verduras', 600, 'ml'),
  ('sopas_cremas_086', 1, 'pasta', 'Pasta pequeña', 60, 'g'),
  ('sopas_cremas_086', 2, 'zanahoria', 'Zanahoria', 1, 'ud'),
  ('sopas_cremas_086', 3, 'judia-verde', 'Judía verde', 100, 'g'),
  ('sopas_cremas_086', 4, 'jamon', 'Jamón serrano en tacos', 40, 'g'),
  ('sopas_cremas_087', 0, 'tortilla-de-maiz', 'Tortillas de maíz', 4, 'ud'),
  ('sopas_cremas_087', 1, 'tomate', 'Tomate maduro', 400, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_087', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('sopas_cremas_087', 3, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_087', 4, 'caldo-de-pollo', 'Caldo de pollo', 600, 'ml'),
  ('sopas_cremas_087', 5, 'aguacate', 'Aguacate', 1, 'ud'),
  ('sopas_cremas_087', 6, 'queso-crema', 'Queso crema', 60, 'g'),
  ('sopas_cremas_087', 7, 'cilantro', 'Cilantro fresco', 10, 'g'),
  ('sopas_cremas_087', 8, 'aceite-oliva', 'Aceite de oliva', 30, 'ml'),
  ('sopas_cremas_087', 9, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_088', 0, 'calabaza', 'Calabaza', 600, 'g'),
  ('sopas_cremas_088', 1, 'cebolla', 'Cebolla', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_088', 2, 'ajo', 'Ajo', 10, 'g'),
  ('sopas_cremas_088', 3, 'cayena', 'Chile fresco', 5, 'g'),
  ('sopas_cremas_088', 4, 'caldo-de-verduras', 'Caldo de verduras', 500, 'ml'),
  ('sopas_cremas_088', 5, 'cacahuete', 'Cacahuetes tostados', 40, 'g'),
  ('sopas_cremas_088', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('sopas_cremas_088', 7, 'sal', 'Sal', 3, 'g'),
  ('sopas_cremas_089', 0, 'miso', 'Miso', 40, 'g'),
  ('sopas_cremas_089', 1, 'tofu', 'Tofu firme', 200, 'g'),
  ('sopas_cremas_089', 2, 'cebolleta', 'Cebolleta', 60, 'g'),
  ('sopas_cremas_089', 3, 'caldo-de-verduras', 'Caldo de verduras', 700, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('sopas_cremas_089', 4, 'salsa-soja', 'Salsa de soja', 10, 'ml'),
  ('sopas_cremas_089', 5, 'aceite-de-sesamo', 'Aceite de sésamo', 5, 'ml'),
  ('carnes_008', 0, 'carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 300, 'g'),
  ('carnes_008', 1, 'patata', 'Patata', 250, 'g'),
  ('carnes_008', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_008', 3, 'zanahoria', 'Zanahoria', 80, 'g'),
  ('carnes_008', 4, 'guisantes', 'Guisantes', 60, 'g'),
  ('carnes_008', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('carnes_008', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_008', 7, 'vino-blanco', 'Vino blanco', 60, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_015', 0, 'carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 350, 'g'),
  ('carnes_015', 1, 'zanahoria', 'Zanahoria', 200, 'g'),
  ('carnes_015', 2, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_015', 3, 'vino-tinto', 'Vino tinto', 80, 'ml'),
  ('carnes_015', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('carnes_015', 5, 'ajo', 'Ajo', 8, 'g'),
  ('carnes_015', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_015', 7, 'laurel', 'Laurel', 1, 'ud'),
  ('carnes_021', 0, 'carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 300, 'g'),
  ('carnes_021', 1, 'zanahoria', 'Zanahoria', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('carnes_021', 2, 'judia-verde', 'Judías verdes', 100, 'g'),
  ('carnes_021', 3, 'guisantes', 'Guisantes', 80, 'g'),
  ('carnes_021', 4, 'cebolla', 'Cebolla', 80, 'g'),
  ('carnes_021', 5, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('carnes_021', 6, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('carnes_021', 7, 'vino-blanco', 'Vino blanco', 60, 'ml'),
  ('pasta_arroces_076', 0, 'arroz', 'Arroz', 160, 'g'),
  ('pasta_arroces_076', 1, 'gambas', 'Gambas', 150, 'g'),
  ('pasta_arroces_076', 2, 'mejillones', 'Mejillones', 150, 'g'),
  ('pasta_arroces_076', 3, 'monkfish', 'Rape', 100, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pasta_arroces_076', 4, 'tomate-triturado', 'Tomate triturado', 80, 'ml'),
  ('pasta_arroces_076', 5, 'ajo', 'Ajo', 10, 'g'),
  ('pasta_arroces_076', 6, 'cebolla', 'Cebolla', 50, 'g'),
  ('pasta_arroces_076', 7, 'aceite-oliva', 'Aceite de oliva', 20, 'ml'),
  ('pasta_arroces_076', 8, 'caldo-de-pescado', 'Caldo de pescado', 550, 'ml'),
  ('pasta_arroces_076', 9, 'pimenton', 'Pimentón dulce', 3, 'g'),
  ('pescados_032', 0, 'salmon', 'Lomos de salmón', 300, 'g'),
  ('pescados_032', 1, 'aguacate', 'Aguacate', 150, 'g'),
  ('pescados_032', 2, 'pepino', 'Pepino', 150, 'g'),
  ('pescados_032', 3, 'eneldo', 'Eneldo fresco', 10, 'g')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_032', 4, 'limon', 'Zumo de limón', 20, 'ml'),
  ('pescados_032', 5, 'aceite-oliva-virgen', 'Aceite de oliva virgen extra', 20, 'ml'),
  ('pescados_032', 6, 'sal', 'Sal', 3, 'g'),
  ('pescados_032', 7, 'pimienta', 'Pimienta negra', 1, 'g'),
  ('pescados_055', 0, 'salmon', 'Lomos de salmón', 320, 'g'),
  ('pescados_055', 1, 'pepino', 'Pepino', 250, 'g'),
  ('pescados_055', 2, 'yogur', 'Yogur natural', 80, 'g'),
  ('pescados_055', 3, 'eneldo', 'Eneldo fresco', 8, 'g'),
  ('pescados_055', 4, 'cebolla-morada', 'Cebolla morada', 30, 'g'),
  ('pescados_055', 5, 'limon', 'Limón', 1, 'ud')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

insert into recipe_ingredients (
  recipe_id, position, ingredient_id, raw_name, amount, unit
) values
  ('pescados_055', 6, 'aceite-oliva', 'Aceite de oliva', 15, 'ml')
on conflict (recipe_id, position) do update set
  ingredient_id = excluded.ingredient_id,
  raw_name = excluded.raw_name,
  amount = excluded.amount,
  unit = excluded.unit;

commit;
