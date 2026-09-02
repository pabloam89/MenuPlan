-- Generado por scripts/generate-supabase-seed.mjs — no editar a mano.
-- Requiere supabase/migrations/0029_ingredients.sql aplicada.
begin;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('aceite-de-sesamo', 'Aceite de sésamo', 'Aceites y conservas', 'Despensa', '{"sesamo"}', '{}', '{}', true, true, 'ml', 10),
  ('aceite-girasol', 'Aceite de girasol', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'ml', 300),
  ('aceite-oliva', 'Aceite de oliva', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'ml', 20),
  ('aceite-oliva-virgen', 'Aceite de oliva virgen extra', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'ml', 20),
  ('aceitunas', 'Aceitunas', 'Aceites y conservas', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'g', 30),
  ('aceitunas-negras', 'Aceitunas negras', 'Aceites y conservas', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'g', 40),
  ('acelga', 'Acelgas', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 275),
  ('agua', 'Agua', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 100),
  ('aguacate', 'Aguacate', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('ajete', 'Ajetes', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('ajetes-tiernos', 'Ajetes tiernos', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 100),
  ('aji-amarillo', 'Ají amarillo', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 15),
  ('ajo', 'Ajo', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 10),
  ('ajo-polvo', 'Ajo en polvo', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 3),
  ('albahaca', 'Albahaca fresca', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 10),
  ('alcachofa', 'Alcachofas', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 77),
  ('alcachofa-conserva', 'Corazones de alcachofa', 'Verduras', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'g', 350),
  ('alcaparras', 'Alcaparras', 'Especias', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'g', 18),
  ('alga-nori', 'Alga nori', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 2),
  ('alga-wakame', 'Alga wakame', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 5)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('alioli', 'Alioli', 'Aceites y conservas', 'Verduras y frutas', '{"huevos"}', '{}', '{}', true, true, 'g', 55),
  ('alitas-de-pollo', 'Alitas de pollo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 600),
  ('almejas', 'Almejas', 'Pescado', 'Carnes y pescados', '{"moluscos"}', '{}', '{}', false, false, 'g', 275),
  ('almendras', 'Almendras', 'Aceites y conservas', 'Despensa', '{"frutos_cascara"}', '{}', '{}', true, true, 'g', 30),
  ('alubia-grande', 'Fabes de la granja secas', 'Legumbres', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 250),
  ('alubias', 'Alubias blancas cocidas', 'Legumbres', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 300),
  ('alubias-rojas', 'Alubias rojas', 'Legumbres', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 250),
  ('anchoa-en-aceite', 'Anchoas en aceite', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 20),
  ('apio', 'Apio', 'Verduras', 'Verduras y frutas', '{"apio"}', '{}', '{}', true, true, 'g', 50),
  ('apionabo', 'Apionabo', 'Verduras', 'Verduras y frutas', '{"apio"}', '{}', '{}', true, true, 'g', 475)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('arandanos', 'Arándanos', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 40),
  ('arroz', 'Arroz', 'Pasta y arroz', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 160),
  ('arroz-arborio', 'Arroz arborio', 'Pasta y arroz', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 160),
  ('arroz-bomba', 'Arroz bomba', 'Pasta y arroz', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 320),
  ('atun', 'Atún en aceite', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 160),
  ('atun-fresco', 'Atún fresco', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 300),
  ('atun-lata', 'Atún en conserva', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 160),
  ('avellanas', 'Avellanas', 'Aceites y conservas', 'Verduras y frutas', '{"frutos_cascara"}', '{}', '{}', true, true, 'g', 20),
  ('avena', 'Copos de avena', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', true, true, 'g', 50),
  ('azafran', 'Azafrán', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 1)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('azucar', 'Azúcar', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 40),
  ('azucar-glas', 'Azúcar glas', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 215),
  ('azucar-moreno', 'Azúcar moreno', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 30),
  ('bacalao', 'Bacalao desalado', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 300),
  ('bacon', 'Bacon en lonchas', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 80),
  ('baguette', 'Pan chapata', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', true, true, 'g', 105),
  ('bechamel', 'Bechamel', 'Aceites y conservas', 'Verduras y frutas', '{"gluten","leche"}', '{}', '{"lactosa_fina"}', true, false, 'ml', 200),
  ('berberecho', 'Berberechos frescos', 'Pescado', 'Verduras y frutas', '{"moluscos"}', '{}', '{}', false, false, 'g', 500),
  ('berenjena', 'Berenjena', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 250),
  ('bicarbonato', 'Bicarbonato', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 5)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('bizcocho-de-soletilla', 'Bizcochos de soletilla', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('bogavante', 'Bogavante', 'Pescado', 'Verduras y frutas', '{"crustaceos"}', '{}', '{}', false, false, 'g', 600),
  ('boletus', 'Boletus', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 200),
  ('boniato', 'Boniato', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 350),
  ('bonito-del-norte', 'Bonito en conserva', 'Pescado', 'Verduras y frutas', '{"pescado"}', '{}', '{}', false, false, 'g', 300),
  ('boquerones', 'Boquerones limpios', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 320),
  ('brandy', 'Brandy', 'Aceites y conservas', 'Verduras y frutas', '{}', '{"sulfitos"}', '{"alcohol_cocina"}', true, true, 'ml', 30),
  ('brocoli', 'Brócoli', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 250),
  ('brote-tierno', 'Brotes tiernos', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 160),
  ('burrata', 'Burrata', 'Lácteos', 'Verduras y frutas', '{"leche"}', '{}', '{}', true, false, 'g', 150)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('butifarra', 'Butifarra', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 175),
  ('caballa', 'Caballa', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 350),
  ('cabracho', 'Cabracho', 'Pescado', 'Verduras y frutas', '{"pescado"}', '{}', '{}', false, false, 'g', 400),
  ('cacahuete', 'Cacahuetes tostados', 'Aceites y conservas', 'Verduras y frutas', '{"cacahuetes"}', '{}', '{}', true, true, 'g', 30),
  ('cacao', 'Cacao en polvo', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 20),
  ('cafe-espresso', 'Café espresso', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 300),
  ('calabacin', 'Calabacín', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('calabaza', 'Calabaza', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 400),
  ('calamar', 'Calamar', 'Pescado', 'Carnes y pescados', '{"moluscos"}', '{}', '{}', false, false, 'g', 300),
  ('caldo-de-carne', 'Caldo de carne', 'Aceites y conservas', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'ml', 300)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('caldo-de-marisco', 'Caldo de marisco', 'Aceites y conservas', 'Despensa', '{"crustaceos","pescado"}', '{}', '{}', false, false, 'ml', 500),
  ('caldo-de-pescado', 'Caldo de pescado', 'Aceites y conservas', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'ml', 450),
  ('caldo-de-pollo', 'Caldo de pollo', 'Aceites y conservas', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'ml', 450),
  ('caldo-de-verduras', 'Caldo de verduras', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'ml', 350),
  ('callo-de-ternera-limpio', 'Callos de ternera limpios', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 1000),
  ('canela', 'Canela molida', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 2),
  ('canelones', 'Placas de canelones', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'ud', 16),
  ('carne-de-cerdo-en-dado-aguja-o-secreto', 'Carne de cerdo en dados (aguja o secreto)', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400),
  ('carne-de-cocido', 'Carne de cocido', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 275),
  ('carne-de-jabali-picada', 'Carne de jabalí picada', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 500)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('carne-de-ternera-para-guisar', 'Carne de ternera para guisar', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 350),
  ('carne-de-txangurro', 'Carne de txangurro', 'Pescado', 'Carnes y pescados', '{"crustaceos"}', '{}', '{}', false, false, 'g', 150),
  ('carne-picada', 'Carne picada de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 300),
  ('carrillada', 'Carrillada', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 750),
  ('carrillera', 'Carrillera de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 650),
  ('castanas', 'Castañas cocidas', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('cava', 'Cava', 'Aceites y conservas', 'Verduras y frutas', '{}', '{"sulfitos"}', '{"alcohol_cocina"}', true, true, 'ml', 150),
  ('cayena', 'Chile fresco', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 10),
  ('cebolla', 'Cebolla', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 70),
  ('cebolla-morada', 'Cebolla morada', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 35)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('cebolleta', 'Cebolleta', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 25),
  ('cebollino', 'Cebollino', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 5),
  ('cereales', 'Cereales', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', true, true, 'g', 80),
  ('cerveza', 'Cerveza', 'Aceites y conservas', 'Verduras y frutas', '{"gluten"}', '{}', '{"alcohol_cocina"}', true, true, 'ml', 150),
  ('chalota', 'Chalota', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 30),
  ('champinon', 'Champiñones', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 200),
  ('chocolate', 'Chocolate negro', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 175),
  ('chorizo', 'Chorizo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 80),
  ('chuletas-de-cerdo', 'Chuletas de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400),
  ('chuleton-de-ternera', 'Chuletón de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 800)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('cigala', 'Cigalas frescas', 'Pescado', 'Verduras y frutas', '{"crustaceos"}', '{}', '{}', false, false, 'ud', 8),
  ('cilantro', 'Cilantro fresco', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 5),
  ('cinta-de-lomo', 'Filetes de lomo de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 350),
  ('ciruelas-pasas', 'Ciruelas pasas', 'Frutas', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'g', 50),
  ('coco', 'Coco rallado', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 15),
  ('codorniz', 'Codorniz', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'ud', 8),
  ('cointreau', 'Cointreau', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 50),
  ('col', 'Col china', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('coles-de-bruselas', 'Coles de Bruselas', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 350),
  ('coliflor', 'Coliflor', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 500)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('colorante', 'Colorante rojo alimentario', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 10),
  ('comino', 'Comino molido', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 3),
  ('conejo', 'Conejo troceado', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 300),
  ('congrio', 'Congrio en rodajas', 'Pescado', 'Verduras y frutas', '{"pescado"}', '{}', '{}', false, false, 'g', 400),
  ('contramuslos-de-pollo', 'Contramuslo de pollo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 250),
  ('cordero', 'Chuletillas de cordero', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 600),
  ('corvina', 'Corvina', 'Pescado', 'Verduras y frutas', '{"pescado"}', '{}', '{}', false, false, 'g', 300),
  ('costilla', 'Costillas de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400),
  ('curcuma', 'Cúrcuma', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 3),
  ('curry', 'Curry en polvo', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 8)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('cuscus', 'Cuscús', 'Pasta y arroz', 'Legumbres y pasta', '{"gluten"}', '{}', '{}', true, true, 'g', 100),
  ('dorada', 'Dorada (limpia, entera)', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 700),
  ('edamame', 'Edamame', 'Legumbres', 'Verduras y frutas', '{"soja"}', '{}', '{}', true, true, 'g', 80),
  ('eneldo', 'Eneldo fresco', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 5),
  ('entrania-de-ternera', 'Entraña de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400),
  ('entrecot', 'Entrecot de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400),
  ('escalopines-de-ternera', 'Escalopines de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 325),
  ('espaguetis', 'Espaguetis', 'Pasta y arroz', 'Legumbres y pasta', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('esparragos', 'Espárragos trigueros', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 300),
  ('esparragos-blancos', 'Espárragos blancos en conserva', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 300)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('especia-cajun', 'Especias cajún', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 8),
  ('espinacas', 'Espinacas frescas', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 175),
  ('extracto-de-vainilla', 'Extracto de vainilla', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 5),
  ('fabes', 'Fabes', 'Legumbres', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 250),
  ('falafel-congelado', 'Falafel congelado', 'Legumbres', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('farfalle', 'Farfalle', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('fettuccine', 'Fettuccine', 'Pasta y arroz', 'Verduras y frutas', '{"gluten","huevos"}', '{}', '{}', true, true, 'g', 200),
  ('fideo-mediano', 'Fideos n°2', 'Pasta y arroz', 'Legumbres y pasta', '{"gluten"}', '{}', '{}', true, true, 'g', 180),
  ('fideos', 'Fideos finos', 'Pasta y arroz', 'Legumbres y pasta', '{"gluten"}', '{}', '{}', true, true, 'g', 80),
  ('filete-de-cerdo', 'Filetes de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('filete-de-pez-espada', 'Filetes de pez espada', 'Pescado', 'Verduras y frutas', '{"pescado"}', '{}', '{}', true, true, 'g', 350),
  ('filete-de-ternera', 'Filetes de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 375),
  ('filetes-finos-de-ternera', 'Filetes finos de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 300),
  ('foie', 'Foie mi-cuit', 'Carne', 'Verduras y frutas', '{"leche"}', '{}', '{}', false, false, 'g', 100),
  ('fresa', 'Fresas', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('frutos-rojos', 'Frutos rojos', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('fuet', 'Fuet', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 60),
  ('fusilli', 'Fusilli', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('galletas-maria', 'Galletas María', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 190),
  ('gambas', 'Gambas peladas', 'Pescado', 'Carnes y pescados', '{"crustaceos"}', '{}', '{}', false, false, 'g', 150)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('garbanzos', 'Garbanzos cocidos', 'Legumbres', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 300),
  ('garrofon', 'Garrofón', 'Legumbres', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 60),
  ('gazpacho-de-bote', 'Gazpacho de bote', 'Aceites y conservas', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'ml', 500),
  ('gochujang', 'Gochujang', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 40),
  ('granada', 'Granada', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 80),
  ('granola', 'Granola', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 40),
  ('grelo', 'Grelos', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 300),
  ('guanciale', 'Guanciale', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 120),
  ('guindilla', 'Guindilla', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 2),
  ('guisantes', 'Guisantes', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 80)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('hamburguesa', 'Pan de hamburguesa', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', false, false, 'ud', 2),
  ('harina', 'Harina', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', true, true, 'g', 30),
  ('harissa', 'Harissa', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 20),
  ('higado-de-ternera', 'Hígado de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 350),
  ('higo', 'Higos', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ud', 102),
  ('hinojo', 'Hinojo', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('hoja-de-gelatina', 'Hojas de gelatina', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 6),
  ('hojaldre', 'Hojaldre', 'Panadería', 'Verduras y frutas', '{"gluten","leche"}', '{}', '{}', true, true, 'g', 230),
  ('hojas-verdes', 'Hojas verdes variadas', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 100),
  ('hueso-de-ternera', 'Hueso de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('huevos', 'Huevo', 'Huevos', 'Lácteos y huevos', '{"huevos"}', '{}', '{}', true, false, 'ud', 3),
  ('jamon', 'Jamón serrano', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 60),
  ('jamon-york', 'Jamón cocido', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 80),
  ('jarrete-de-ternera', 'Jarrete de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 950),
  ('jengibre', 'Jengibre fresco', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 10),
  ('jerez-seco', 'Jerez seco', 'Aceites y conservas', 'Verduras y frutas', '{}', '{"sulfitos"}', '{}', true, true, 'ml', 40),
  ('judia-blanca', 'Judías blancas cocidas', 'Legumbres', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 300),
  ('judia-negra', 'Judías negras cocidas', 'Legumbres', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 100),
  ('judia-verde', 'Judías verdes', 'Verduras', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 100),
  ('judias-pintas', 'Frijoles negros cocidos', 'Legumbres', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 200)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('kefir', 'Kéfir', 'Lácteos', 'Verduras y frutas', '{"leche"}', '{}', '{}', true, false, 'ml', 300),
  ('ketchup', 'Ketchup', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 40),
  ('lacon', 'Lacón', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 115),
  ('langostinos', 'Langostinos pelados', 'Pescado', 'Carnes y pescados', '{"crustaceos"}', '{}', '{}', false, false, 'g', 200),
  ('lasana', 'Láminas de lasaña', 'Pasta y arroz', 'Verduras y frutas', '{"gluten","huevos"}', '{}', '{}', true, true, 'g', 300),
  ('laurel', 'Laurel', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'ud', 1),
  ('leche', 'Leche', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'ml', 230),
  ('leche-coco', 'Leche de coco', 'Lácteos', 'Lácteos y huevos', '{}', '{}', '{}', true, false, 'ml', 200),
  ('leche-condensada', 'Leche condensada', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'g', 400),
  ('lechuga', 'Lechuga', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 60)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('lenguado', 'Lenguado', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 161),
  ('lentejas', 'Lentejas', 'Legumbres', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 200),
  ('lentejas-rojas', 'Lentejas rojas', 'Legumbres', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 90),
  ('levadura', 'Levadura de panadería seca', 'Aceites y conservas', 'Panadería y cereales', '{}', '{}', '{}', true, true, 'g', 7),
  ('levadura-quimica', 'Levadura química', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 6),
  ('licor-de-cafe', 'Licor de café', 'Aceites y conservas', 'Verduras y frutas', '{}', '{"sulfitos"}', '{"alcohol_cocina"}', true, true, 'ml', 30),
  ('lima', 'Lima', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ud', 4),
  ('limon', 'Limón', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 5),
  ('linguine', 'Linguine', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 180),
  ('lombarda', 'Lombarda', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 400)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('lomo-de-cerdo-en-filetes', 'Lomo de cerdo en filetes', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 300),
  ('lubina', 'Lubina entera limpia', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 410),
  ('macarrones', 'Macarrones', 'Pasta y arroz', 'Legumbres y pasta', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('magro-de-cerdo', 'Magro de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 300),
  ('maicena', 'Maicena', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 20),
  ('maiz', 'Maíz', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 80),
  ('mango', 'Mango', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('manitas-de-cerdo', 'Manitas de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 1200),
  ('manteca-de-cerdo', 'Manteca de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 155),
  ('mantequilla', 'Mantequilla', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 20)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('mantequilla-de-cacahuete', 'Mantequilla de cacahuete', 'Lácteos', 'Lácteos y huevos', '{"cacahuetes"}', '{}', '{}', true, false, 'g', 40),
  ('manzana', 'Manzana', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 120),
  ('masa-de-pizza', 'Masa de pizza', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 300),
  ('masa-quebrada', 'Masa quebrada', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('mascarpone', 'Mascarpone', 'Lácteos', 'Verduras y frutas', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'g', 500),
  ('mayonesa', 'Mayonesa', 'Aceites y conservas', 'Verduras y frutas', '{"huevos"}', '{}', '{}', true, false, 'g', 40),
  ('medio-cochinillo', 'Medio cochinillo', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 2500),
  ('mejillones', 'Mejillones', 'Pescado', 'Carnes y pescados', '{"moluscos"}', '{}', '{}', false, false, 'g', 150),
  ('melocoton', 'Melocotón', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 200),
  ('melon', 'Melón', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 400)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('menta', 'Menta fresca', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 8),
  ('merluza', 'Merluza', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 200),
  ('merluza-lomos', 'Merluza en lomos', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 335),
  ('mermelada', 'Mermelada', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 40),
  ('miel', 'Miel', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, false, 'g', 20),
  ('mirin', 'Mirin', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 20),
  ('miso', 'Miso', 'Aceites y conservas', 'Verduras y frutas', '{"soja"}', '{}', '{}', true, true, 'g', 40),
  ('monkfish', 'Rape', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 250),
  ('morcilla', 'Morcilla', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 150),
  ('morcillo', 'Carne para mechar (morcillo de ternera)', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 400)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('morcillo-de-ternera', 'Morcillo de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 200),
  ('mostaza', 'Mostaza de Dijon', 'Aceites y conservas', 'Despensa', '{"mostaza"}', '{}', '{}', true, true, 'g', 15),
  ('mozzarella', 'Mozzarella fresca', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'g', 150),
  ('muffin-ingle', 'Muffin inglés', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'ud', 2),
  ('muslo-de-pollo', 'Muslos de pollo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 500),
  ('nabo', 'Nabo', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 55),
  ('nachos', 'Nachos de maíz', 'Panadería', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 135),
  ('naranja', 'Naranja', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ud', 60),
  ('nata', 'Nata para cocinar', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'ml', 80),
  ('nata-para-montar', 'Nata para montar', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'ml', 400)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('navaja', 'Navajas frescas', 'Pescado', 'Verduras y frutas', '{"moluscos"}', '{}', '{}', true, true, 'g', 500),
  ('nueces', 'Nueces', 'Aceites y conservas', 'Verduras y frutas', '{"frutos_cascara"}', '{}', '{}', true, true, 'g', 40),
  ('nuez-moscada', 'Nuez moscada', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 1),
  ('obleas', 'Obleas', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'ud', 16),
  ('orecchiette', 'Orecchiette', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 180),
  ('oregano', 'Orégano', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 2),
  ('oreja-de-cerdo', 'Oreja de cerdo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 80),
  ('orzo', 'Orzo', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 155),
  ('pan', 'Pan', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 80),
  ('pan-de-payes', 'Pan de payés', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', true, true, 'g', 135)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('pan-molde', 'Pan de molde', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', true, true, 'ud', 18),
  ('pan-rallado', 'Pan rallado', 'Panadería', 'Panadería y cereales', '{"gluten"}', '{}', '{}', true, true, 'g', 60),
  ('panceta', 'Panceta', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 80),
  ('parmesano', 'Queso parmesano', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 30),
  ('pasas', 'Pasas', 'Aceites y conservas', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'g', 30),
  ('pasta', 'Pasta pequeña', 'Pasta y arroz', 'Legumbres y pasta', '{"gluten"}', '{}', '{}', true, true, 'g', 60),
  ('pasta-corta', 'Pasta corta', 'Pasta y arroz', 'Legumbres y pasta', '{"gluten"}', '{}', '{}', true, true, 'g', 180),
  ('pastrami-de-ternera-en-loncha', 'Pastrami de ternera en lonchas', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 200),
  ('pata-de-ternera', 'Pata de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 300),
  ('patata', 'Patata', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 300)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('pate', 'Paté de cerdo', 'Carne', 'Carnes y pescados', '{"leche"}', '{}', '{}', false, false, 'g', 120),
  ('pato', 'Magret de pato', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 400),
  ('pavo', 'Filete de pavo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 350),
  ('pechuga-de-pavo', 'Pechuga de pavo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 80),
  ('pechuga-de-pollo', 'Pechuga de pollo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 300),
  ('pedro-ximenez', 'Pedro Ximénez', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 80),
  ('penne', 'Penne', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('pepinillos', 'Pepinillos', 'Aceites y conservas', 'Verduras y frutas', '{"sulfitos"}', '{}', '{}', true, true, 'g', 30),
  ('pepino', 'Pepino', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 80),
  ('pera', 'Pera', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 125)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('perdiz', 'Perdiz', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'ud', 2),
  ('perejil', 'Perejil', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 5),
  ('pescadilla', 'Pescadilla (filetes)', 'Pescado', 'Verduras y frutas', '{"pescado"}', '{}', '{}', false, false, 'g', 335),
  ('pesto', 'Pesto', 'Aceites y conservas', 'Verduras y frutas', '{"frutos_cascara","leche"}', '{}', '{}', true, true, 'g', 35),
  ('pimenton', 'Pimentón dulce', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 4),
  ('pimienta', 'Pimienta negra', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 2),
  ('pimienta-blanca', 'Pimienta blanca', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 1),
  ('pimiento-choricero', 'Pimiento choricero', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 15),
  ('pimiento-rojo', 'Pimiento rojo', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 80),
  ('pimiento-verde', 'Pimiento verde', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 60)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('pimientos-del-piquillo', 'Pimientos del piquillo', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 104),
  ('pina', 'Piña natural', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 250),
  ('pinones', 'Piñones', 'Aceites y conservas', 'Verduras y frutas', '{"frutos_cascara"}', '{}', '{}', true, true, 'g', 20),
  ('pistacho', 'Pistacho pelado', 'Aceites y conservas', 'Verduras y frutas', '{"frutos_cascara"}', '{}', '{}', true, true, 'g', 30),
  ('placas-de-cannelones', 'Placas de cannelones', 'Pasta y arroz', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 100),
  ('platano', 'Plátano', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ud', 1),
  ('platano-macho', 'Plátano macho', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ud', 1),
  ('pluma-iberica', 'Pluma ibérica', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 400),
  ('pollo', 'Pollo troceado', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 350),
  ('pomelo', 'Pomelo', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 101)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('presa-iberica', 'Presa ibérica', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 375),
  ('puerro', 'Puerro', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 80),
  ('pulpa-de-acai-congelada', 'Pulpa de açaí congelada', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 200),
  ('pulpo', 'Pulpo cocido', 'Pescado', 'Carnes y pescados', '{"moluscos"}', '{}', '{}', false, false, 'g', 250),
  ('quesito', 'Quesito en porciones', 'Lácteos', 'Verduras y frutas', '{"leche"}', '{}', '{}', true, false, 'g', 30),
  ('queso', 'Queso rallado', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 50),
  ('queso-azul', 'Queso azul', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 60),
  ('queso-brie', 'Queso brie', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 60),
  ('queso-cabra', 'Queso de cabra', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 80),
  ('queso-crema', 'Queso crema', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 180)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('queso-en-lonchas', 'Queso en lonchas', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 60),
  ('queso-feta', 'Queso feta', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 80),
  ('queso-fresco', 'Queso fresco', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'g', 80),
  ('queso-tierno', 'Queso semicurado en lonchas', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 80),
  ('quinoa', 'Quinoa', 'Pasta y arroz', 'Legumbres y pasta', '{}', '{}', '{}', true, true, 'g', 100),
  ('rabo-de-toro', 'Rabo de toro troceado', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 800),
  ('ravioli', 'Tortellini frescos rellenos de carne', 'Carne', 'Carnes y pescados', '{"gluten","huevos"}', '{}', '{}', false, false, 'g', 300),
  ('redondo-de-ternera', 'Redondo de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 425),
  ('remolacha', 'Remolacha cocida', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 200),
  ('repollo', 'Repollo', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 150)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('requeson', 'Requesón', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'g', 300),
  ('ricotta', 'Ricotta', 'Lácteos', 'Verduras y frutas', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'g', 175),
  ('rigatoni', 'Rigatoni', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('rodaballo', 'Rodaballo', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 350),
  ('rodajas-de-emperador', 'Rodajas de emperador', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 320),
  ('romero', 'Romero', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 3),
  ('ron', 'Ron', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{"alcohol_cocina"}', true, true, 'ml', 80),
  ('roquefort', 'Queso roquefort', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{}', true, false, 'g', 60),
  ('rucula', 'Rúcula', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 40),
  ('sal', 'Sal', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 3)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('sal-escamas', 'Sal en escamas', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 2),
  ('sal-gruesa', 'Sal gorda', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 25),
  ('salchicha', 'Salchichas frescas', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 200),
  ('salmon', 'Lomos de salmón', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 310),
  ('salmon-ahumado', 'Salmón ahumado', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 100),
  ('salmon-fresco', 'Salmón fresco', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 220),
  ('salsa-barbacoa', 'Salsa barbacoa', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 150),
  ('salsa-cesar', 'Salsa César', 'Aceites y conservas', 'Despensa', '{"huevos","mostaza","pescado"}', '{}', '{}', true, true, 'g', 60),
  ('salsa-soja', 'Salsa de soja', 'Legumbres', 'Despensa', '{"gluten","soja"}', '{}', '{}', true, true, 'ml', 20),
  ('salsa-worcestershire', 'Salsa Worcestershire', 'Aceites y conservas', 'Despensa', '{"pescado"}', '{}', '{}', false, false, 'ml', 10)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('salvia', 'Salvia fresca', 'Especias', 'Despensa', '{}', '{}', '{}', true, true, 'g', 6),
  ('sandia', 'Sandía', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 300),
  ('sardinas', 'Sardinas', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 400),
  ('secreto-iberico', 'Secreto ibérico', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 350),
  ('semola-de-trigo', 'Sémola de trigo', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 15),
  ('sepia', 'Sepia', 'Pescado', 'Carnes y pescados', '{"moluscos"}', '{}', '{}', false, false, 'g', 150),
  ('sesamo', 'Semillas de sésamo', 'Especias', 'Verduras y frutas', '{"sesamo"}', '{}', '{}', true, true, 'g', 6),
  ('setas', 'Setas variadas', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 250),
  ('sidra', 'Sidra natural', 'Aceites y conservas', 'Verduras y frutas', '{}', '{"sulfitos"}', '{"alcohol_cocina"}', true, true, 'ml', 150),
  ('sirope-de-arce', 'Sirope de arce', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 30)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('sobrasada', 'Sobrasada', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 150),
  ('solomillo', 'Solomillo de ternera', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 350),
  ('sriracha', 'Sriracha', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 15),
  ('surimi', 'Palitos de cangrejo o surimi', 'Pescado', 'Verduras y frutas', '{"crustaceos","huevos","pescado"}', '{}', '{}', false, false, 'g', 80),
  ('tabasco', 'Tabasco', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ml', 2),
  ('tahini', 'Tahini', 'Aceites y conservas', 'Verduras y frutas', '{"sesamo"}', '{}', '{}', true, true, 'g', 25),
  ('tallarines', 'Tagliatelle', 'Pasta y arroz', 'Verduras y frutas', '{"gluten","huevos"}', '{}', '{}', true, true, 'g', 200),
  ('ternera-magra', 'Ternera magra', 'Carne', 'Carnes y pescados', '{}', '{}', '{}', false, false, 'g', 30),
  ('tinta-de-calamar', 'Tinta de calamar', 'Pescado', 'Carnes y pescados', '{"moluscos","sulfitos"}', '{}', '{}', false, false, 'g', 8),
  ('tocino', 'Tocino', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 80)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('tofu', 'Tofu firme', 'Legumbres', 'Verduras y frutas', '{"soja"}', '{}', '{}', true, true, 'g', 100),
  ('tomate', 'Tomate', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 150),
  ('tomate-cherry', 'Tomate cherry', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 110),
  ('tomate-concentrado', 'Tomate concentrado', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 18),
  ('tomate-frito', 'Tomate frito', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 100),
  ('tomate-seco', 'Tomate seco en aceite', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'g', 50),
  ('tomate-triturado', 'Tomate triturado', 'Aceites y conservas', 'Despensa', '{}', '{}', '{}', true, true, 'ml', 100),
  ('tomillo', 'Tomillo', 'Especias', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 2),
  ('tortilla-de-maiz', 'Tortillas de maíz', 'Panadería', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'ud', 4),
  ('tortilla-de-trigo', 'Tortillas de trigo', 'Panadería', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'ud', 2)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('trofie', 'Trofie', 'Pasta y arroz', 'Verduras y frutas', '{"gluten"}', '{}', '{}', true, true, 'g', 200),
  ('truchas-enteras', 'Trucha limpia sin espinas', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 400),
  ('trufa-negra', 'Trufa negra', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 9),
  ('unto', 'Unto', 'Carne', 'Verduras y frutas', '{}', '{}', '{}', false, false, 'g', 30),
  ('uvas', 'Uvas', 'Frutas', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 60),
  ('ventresca', 'Ventresca de atún en aceite', 'Pescado', 'Carnes y pescados', '{"pescado"}', '{}', '{}', false, false, 'g', 120),
  ('vieira', 'Vieiras (sin concha)', 'Pescado', 'Verduras y frutas', '{"moluscos"}', '{}', '{}', false, false, 'ud', 8),
  ('vinagre', 'Vinagre', 'Aceites y conservas', 'Despensa', '{}', '{"sulfitos"}', '{}', true, true, 'ml', 10),
  ('vinagre-balsamico', 'Vinagre balsámico', 'Aceites y conservas', 'Despensa', '{}', '{"sulfitos"}', '{}', true, true, 'ml', 10),
  ('vinagre-de-jerez', 'Vinagre de Jerez', 'Aceites y conservas', 'Despensa', '{}', '{"sulfitos"}', '{}', true, true, 'ml', 10)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

insert into ingredients (
  id, name, aisle, category, allergens, cooking_allergens, restriction_conflicts, is_vegetarian, is_vegan, default_unit, median_amount
) values
  ('vinagre-de-manzana', 'Vinagre de manzana', 'Aceites y conservas', 'Despensa', '{}', '{"sulfitos"}', '{}', true, true, 'ml', 15),
  ('vino-blanco', 'Vino blanco', 'Aceites y conservas', 'Despensa', '{}', '{"sulfitos"}', '{"alcohol_cocina"}', true, true, 'ml', 60),
  ('vino-tinto', 'Vino tinto', 'Aceites y conservas', 'Despensa', '{}', '{"sulfitos"}', '{"alcohol_cocina"}', true, true, 'ml', 100),
  ('vodka', 'Vodka', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{"alcohol_cocina"}', true, true, 'ml', 50),
  ('vol-au-vent', 'Vol-au-vent de hojaldre', 'Panadería', 'Verduras y frutas', '{"gluten","leche"}', '{}', '{}', true, true, 'ud', 5),
  ('whisky', 'Whisky', 'Aceites y conservas', 'Verduras y frutas', '{}', '{}', '{"alcohol_cocina"}', true, true, 'ml', 60),
  ('yogur', 'Yogur natural', 'Lácteos', 'Lácteos y huevos', '{"leche"}', '{}', '{"lactosa_fina"}', true, false, 'g', 125),
  ('zamburina', 'Carne de zamburiña', 'Pescado', 'Carnes y pescados', '{"moluscos"}', '{}', '{}', false, false, 'g', 240),
  ('zanahoria', 'Zanahoria', 'Verduras', 'Verduras y frutas', '{}', '{}', '{}', true, true, 'g', 80)
on conflict (id) do update set
  name = excluded.name,
  aisle = excluded.aisle,
  category = excluded.category,
  allergens = excluded.allergens,
  cooking_allergens = excluded.cooking_allergens,
  restriction_conflicts = excluded.restriction_conflicts,
  is_vegetarian = excluded.is_vegetarian,
  is_vegan = excluded.is_vegan,
  default_unit = excluded.default_unit,
  median_amount = excluded.median_amount;

-- Ingredientes en la BD que ya no están en el bundle (revisar a mano):
--   select id, name from ingredients where id <> all (array[...]);

delete from ingredient_aliases;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('aceite de oliva suave', 'Aceite de oliva suave', 'aceite-oliva'),
  ('aceite de oliva para freir', 'Aceite de oliva para freír', 'aceite-oliva'),
  ('aceite de oliva (para freir)', 'Aceite de oliva (para freír)', 'aceite-oliva'),
  ('aceite de oliva suave para freir', 'Aceite de oliva suave para freír', 'aceite-oliva'),
  ('aceite de trufa', 'Aceite de trufa', 'aceite-oliva'),
  ('aceitunas negras (kalamata)', 'Aceitunas negras (kalamata)', 'aceitunas-negras'),
  ('agua fria', 'Agua fría', 'agua'),
  ('cabeza de ajos', 'Cabeza de ajos', 'ajo'),
  ('ajo negro', 'Ajo negro', 'ajo'),
  ('albahaca', 'Albahaca', 'albahaca')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('alcachofa', 'Alcachofa', 'alcachofa'),
  ('almejas frescas', 'Almejas frescas', 'almejas'),
  ('almendra tostada', 'Almendra tostada', 'almendras'),
  ('almendras laminadas', 'Almendras laminadas', 'almendras'),
  ('almendras tostadas', 'Almendras tostadas', 'almendras'),
  ('almendra molida', 'Almendra molida', 'almendras'),
  ('almendras crudas', 'Almendras crudas', 'almendras'),
  ('judiones', 'Judiones', 'alubia-grande'),
  ('judiones secos', 'Judiones secos', 'alubia-grande'),
  ('alubias blancas', 'Alubias blancas', 'alubias')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('alubias blancas cocidas de bote', 'Alubias blancas cocidas de bote', 'alubias'),
  ('alubias blancas secas', 'Alubias blancas secas', 'alubias'),
  ('alubias negras cocidas', 'Alubias negras cocidas', 'alubias'),
  ('alubias pintas', 'Alubias pintas', 'alubias'),
  ('anchoas', 'Anchoas', 'anchoa-en-aceite'),
  ('filetes de anchoa en aceite', 'Filetes de anchoa en aceite', 'anchoa-en-aceite'),
  ('arroz blanco', 'Arroz blanco', 'arroz'),
  ('arroz basmati', 'Arroz basmati', 'arroz'),
  ('arroz cocido', 'Arroz cocido', 'arroz'),
  ('arroz salvaje', 'Arroz salvaje', 'arroz')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('arroz sushi', 'Arroz sushi', 'arroz'),
  ('atun en aceite de oliva', 'Atún en aceite de oliva', 'atun'),
  ('atun (lomo fresco)', 'Atún (lomo fresco)', 'atun'),
  ('atun rojo (calidad sashimi)', 'Atún rojo (calidad sashimi)', 'atun'),
  ('atun rojo fresco de calidad sashimi', 'Atún rojo fresco de calidad sashimi', 'atun'),
  ('atun fresco para sushi', 'Atún fresco para sushi', 'atun-fresco'),
  ('lomo de atun fresco', 'Lomo de atún fresco', 'atun-fresco'),
  ('rodajas de atun fresco', 'Rodajas de atún fresco', 'atun-fresco'),
  ('atun en conserva escurrido', 'Atún en conserva escurrido', 'atun-lata'),
  ('atun en lata', 'Atún en lata', 'atun-lata')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('avellana tostada', 'Avellana tostada', 'avellanas'),
  ('avellanas tostadas', 'Avellanas tostadas', 'avellanas'),
  ('azafran en hebras', 'Azafrán en hebras', 'azafran'),
  ('hebras de azafran', 'Hebras de azafrán', 'azafran'),
  ('bacalao desalado desmigado', 'Bacalao desalado desmigado', 'bacalao'),
  ('bacalao desalado en lomos', 'Bacalao desalado en lomos', 'bacalao'),
  ('bacalao desalado (desmigado)', 'Bacalao desalado (desmigado)', 'bacalao'),
  ('lomos de bacalao desalado', 'Lomos de bacalao desalado', 'bacalao'),
  ('bacalao desalado (lomos)', 'Bacalao desalado (lomos)', 'bacalao'),
  ('bacalao desalado y desmigado', 'Bacalao desalado y desmigado', 'bacalao')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('filetes de merluza o abadejo', 'Filetes de merluza o abadejo', 'bacalao'),
  ('kokotxas de bacalao', 'Kokotxas de bacalao', 'bacalao'),
  ('bacon en tiras', 'Bacon en tiras', 'bacon'),
  ('bacon', 'Bacon', 'bacon'),
  ('bacon en dados', 'Bacon en dados', 'bacon'),
  ('bacon en taquitos', 'Bacon en taquitos', 'bacon'),
  ('beicon en lonchas', 'Beicon en lonchas', 'bacon'),
  ('pan de baguette en rebanadas', 'Pan de baguette en rebanadas', 'baguette'),
  ('boletus secos', 'Boletus secos', 'boletus'),
  ('bonito fresco en tacos', 'Bonito fresco en tacos', 'bonito-del-norte')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('boquerones frescos limpios en lomos', 'Boquerones frescos limpios en lomos', 'boquerones'),
  ('cabracho (o rape/merluza)', 'Cabracho (o rape/merluza)', 'cabracho'),
  ('calamares', 'Calamares', 'calamar'),
  ('calamar en anillas', 'Calamar en anillas', 'calamar'),
  ('calamar limpio', 'Calamar limpio', 'calamar'),
  ('calamares limpios con sus tintas', 'Calamares limpios con sus tintas', 'calamar'),
  ('calamares medianos limpios con tinta', 'Calamares medianos limpios con tinta', 'calamar'),
  ('chipirones limpios', 'Chipirones limpios', 'calamar'),
  ('caldo de cocido', 'Caldo de cocido', 'caldo-de-carne'),
  ('caldo de pescado y marisco', 'Caldo de pescado y marisco', 'caldo-de-marisco')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('caldo de pollo y marisco', 'Caldo de pollo y marisco', 'caldo-de-marisco'),
  ('fumet de marisco', 'Fumet de marisco', 'caldo-de-marisco'),
  ('fumet de pescado', 'Fumet de pescado', 'caldo-de-pescado'),
  ('caldo casero sin sal', 'Caldo casero sin sal', 'caldo-de-verduras'),
  ('canela en polvo', 'Canela en polvo', 'canela'),
  ('canela', 'Canela', 'canela'),
  ('carne de cocido desmenuzada', 'Carne de cocido desmenuzada', 'carne-de-cocido'),
  ('carne de cocido variada', 'Carne de cocido variada', 'carne-de-cocido'),
  ('carne picada de cerdo', 'Carne picada de cerdo', 'carne-picada'),
  ('carne picada de ternera y cerdo', 'Carne picada de ternera y cerdo', 'carne-picada')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('carrillada de cerdo', 'Carrillada de cerdo', 'carrillada'),
  ('carrillada iberica', 'Carrillada ibérica', 'carrillada'),
  ('carrilleras de cerdo', 'Carrilleras de cerdo', 'carrillera'),
  ('castanas cocidas y peladas', 'Castañas cocidas y peladas', 'castanas'),
  ('chile jalapeno', 'Chile jalapeño', 'cayena'),
  ('cebolla dulce', 'Cebolla dulce', 'cebolla'),
  ('cebolla roja', 'Cebolla roja', 'cebolla-morada'),
  ('cebollino fresco', 'Cebollino fresco', 'cebollino'),
  ('cerveza fria', 'Cerveza fría', 'cerveza'),
  ('champinon grande', 'Champiñón grande', 'champinon')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('champinones enteros', 'Champiñones enteros', 'champinon'),
  ('champinones portobello', 'Champiñones portobello', 'champinon'),
  ('chorizo asturiano', 'Chorizo asturiano', 'chorizo'),
  ('chuleton de ternera madurada', 'Chuletón de ternera madurada', 'chuleton-de-ternera'),
  ('cilantro', 'Cilantro', 'cilantro'),
  ('cilantro molido', 'Cilantro molido', 'cilantro'),
  ('cinta de lomo', 'Cinta de lomo', 'cinta-de-lomo'),
  ('cinta de lomo de cerdo abierta en libro', 'Cinta de lomo de cerdo abierta en libro', 'cinta-de-lomo'),
  ('lomo de cerdo (filetes)', 'Lomo de cerdo (filetes)', 'cinta-de-lomo'),
  ('ciruelas pasas sin hueso', 'Ciruelas pasas sin hueso', 'ciruelas-pasas')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('codorniz limpia entera', 'Codorniz limpia entera', 'codorniz'),
  ('col kale', 'Col kale', 'col'),
  ('coliflor entera', 'Coliflor entera', 'coliflor'),
  ('comino', 'Comino', 'comino'),
  ('contramuslos de pollo', 'Contramuslos de pollo', 'contramuslos-de-pollo'),
  ('contramuslos de pollo deshuesados', 'Contramuslos de pollo deshuesados', 'contramuslos-de-pollo'),
  ('muslos y contramuslos de pollo', 'Muslos y contramuslos de pollo', 'contramuslos-de-pollo'),
  ('paletilla de cordero', 'Paletilla de cordero', 'cordero'),
  ('corvina fresca', 'Corvina fresca', 'corvina'),
  ('corvina fresca en lomo limpio', 'Corvina fresca en lomo limpio', 'corvina')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('costillar de cerdo', 'Costillar de cerdo', 'costilla'),
  ('costilla de cerdo', 'Costilla de cerdo', 'costilla'),
  ('costillas de cerdo troceadas', 'Costillas de cerdo troceadas', 'costilla'),
  ('costillas de cordero (chuletillas)', 'Costillas de cordero (chuletillas)', 'costilla'),
  ('costillas de ternera (corte fino estilo galbi)', 'Costillas de ternera (corte fino estilo galbi)', 'costilla'),
  ('dorada entera', 'Dorada entera', 'dorada'),
  ('dorada entera limpia sin escamar', 'Dorada entera limpia sin escamar', 'dorada'),
  ('edamame desvainado', 'Edamame desvainado', 'edamame'),
  ('eneldo', 'Eneldo', 'eneldo'),
  ('esparragos verdes', 'Espárragos verdes', 'esparragos')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('espinacas', 'Espinacas', 'espinacas'),
  ('espinacas baby', 'Espinacas baby', 'espinacas'),
  ('espinaca fresca', 'Espinaca fresca', 'espinacas'),
  ('fideos gruesos', 'Fideos gruesos', 'fideos'),
  ('fideos gordos', 'Fideos gordos', 'fideos'),
  ('fideos huecos nº 2', 'Fideos huecos nº 2', 'fideos'),
  ('filete de ternera', 'Filete de ternera', 'filete-de-ternera'),
  ('filete de ternera para milanesa', 'Filete de ternera para milanesa', 'filete-de-ternera'),
  ('foie fresco o mi-cuit', 'Foie fresco o mi-cuit', 'foie'),
  ('frutos rojos (frambuesa, mora, arandano)', 'Frutos rojos (frambuesa, mora, arándano)', 'frutos-rojos')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('frutos rojos congelados', 'Frutos rojos congelados', 'frutos-rojos'),
  ('gambas', 'Gambas', 'gambas'),
  ('cabezas y cascaras de gamba', 'Cabezas y cáscaras de gamba', 'gambas'),
  ('gambas cocidas peladas', 'Gambas cocidas peladas', 'gambas'),
  ('gambas frescas o congeladas', 'Gambas frescas o congeladas', 'gambas'),
  ('gambas peladas congeladas', 'Gambas peladas congeladas', 'gambas'),
  ('garbanzos', 'Garbanzos', 'garbanzos'),
  ('garbanzos cocidos de bote', 'Garbanzos cocidos de bote', 'garbanzos'),
  ('garbanzos secos crudos (en remojo)', 'Garbanzos secos crudos (en remojo)', 'garbanzos'),
  ('granada (arilos)', 'Granada (arilos)', 'granada')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('guindilla en copos', 'Guindilla en copos', 'guindilla'),
  ('guindilla fresca', 'Guindilla fresca', 'guindilla'),
  ('guindilla seca', 'Guindilla seca', 'guindilla'),
  ('aji amarillo o guindilla fresca', 'Ají amarillo o guindilla fresca', 'guindilla'),
  ('cayena', 'Cayena', 'guindilla'),
  ('cayena molida', 'Cayena molida', 'guindilla'),
  ('copos de guindilla', 'Copos de guindilla', 'guindilla'),
  ('guindilla roja', 'Guindilla roja', 'guindilla'),
  ('guisantes congelados', 'Guisantes congelados', 'guisantes'),
  ('guisantes cocidos', 'Guisantes cocidos', 'guisantes')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('pan de hamburguesa brioche', 'Pan de hamburguesa brioche', 'hamburguesa'),
  ('harina de trigo', 'Harina de trigo', 'harina'),
  ('harina de fuerza', 'Harina de fuerza', 'harina'),
  ('harina fina de trigo', 'Harina fina de trigo', 'harina'),
  ('higos frescos', 'Higos frescos', 'higo'),
  ('masa de hojaldre', 'Masa de hojaldre', 'hojaldre'),
  ('mezclum de hojas', 'Mezclum de hojas', 'hojas-verdes'),
  ('lechuga o mezclum', 'Lechuga o mezclum', 'hojas-verdes'),
  ('mezcla de hojas verdes', 'Mezcla de hojas verdes', 'hojas-verdes'),
  ('mezclum de lechugas', 'Mezclum de lechugas', 'hojas-verdes')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('yema de huevo', 'Yema de huevo', 'huevos'),
  ('huevo cocido', 'Huevo cocido', 'huevos'),
  ('clara de huevo', 'Clara de huevo', 'huevos'),
  ('jamon serrano en lonchas finas', 'Jamón serrano en lonchas finas', 'jamon'),
  ('jamon serrano en tacos', 'Jamón serrano en tacos', 'jamon'),
  ('hueso de jamon', 'Hueso de jamón', 'jamon'),
  ('jamon serrano en lonchas', 'Jamón serrano en lonchas', 'jamon'),
  ('jamon serrano en taquitos', 'Jamón serrano en taquitos', 'jamon'),
  ('jamon serrano en virutas', 'Jamón serrano en virutas', 'jamon'),
  ('jamon', 'Jamón', 'jamon')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('jamon iberico en lonchas', 'Jamón ibérico en lonchas', 'jamon'),
  ('jamon iberico en taquitos', 'Jamón ibérico en taquitos', 'jamon'),
  ('jamon serrano picado', 'Jamón serrano picado', 'jamon'),
  ('jamon cocido en lonchas', 'Jamón cocido en lonchas', 'jamon-york'),
  ('jamon cocido en dados', 'Jamón cocido en dados', 'jamon-york'),
  ('jamon cocido en tacos', 'Jamón cocido en tacos', 'jamon-york'),
  ('jamon cocido en tiras', 'Jamón cocido en tiras', 'jamon-york'),
  ('jarrete de ternera con hueso (ossobuco)', 'Jarrete de ternera con hueso (ossobuco)', 'jarrete-de-ternera'),
  ('jengibre fresco rallado', 'Jengibre fresco rallado', 'jengibre'),
  ('jengibre', 'Jengibre', 'jengibre')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('judias blancas', 'Judías blancas', 'judia-blanca'),
  ('judia verde', 'Judía verde', 'judia-verde'),
  ('judia verde plana', 'Judía verde plana', 'judia-verde'),
  ('judias pintas', 'Judías pintas', 'judias-pintas'),
  ('langostinos', 'Langostinos', 'langostinos'),
  ('cascaras y cabezas de langostinos', 'Cáscaras y cabezas de langostinos', 'langostinos'),
  ('langostinos cocidos pelados', 'Langostinos cocidos pelados', 'langostinos'),
  ('langostinos frescos con cascara', 'Langostinos frescos con cáscara', 'langostinos'),
  ('placas de lasana', 'Placas de lasaña', 'lasana'),
  ('hoja de laurel', 'Hoja de laurel', 'laurel')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('leche entera', 'Leche entera', 'leche'),
  ('suero de leche', 'Suero de leche', 'leche'),
  ('canonigos', 'Canónigos', 'lechuga'),
  ('lechuga romana', 'Lechuga romana', 'lechuga'),
  ('endivias', 'Endivias', 'lechuga'),
  ('endivia', 'Endivia', 'lechuga'),
  ('lechuga variada', 'Lechuga variada', 'lechuga'),
  ('lechugas variadas', 'Lechugas variadas', 'lechuga'),
  ('filetes de lenguado', 'Filetes de lenguado', 'lenguado'),
  ('lenguado limpio', 'Lenguado limpio', 'lenguado')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('lentejas cocidas', 'Lentejas cocidas', 'lentejas'),
  ('lentejas pardinas', 'Lentejas pardinas', 'lentejas'),
  ('lentejas pardinas cocidas', 'Lentejas pardinas cocidas', 'lentejas'),
  ('lentejas rojas peladas', 'Lentejas rojas peladas', 'lentejas-rojas'),
  ('levadura fresca', 'Levadura fresca', 'levadura'),
  ('zumo de lima', 'Zumo de lima', 'lima'),
  ('lima (zumo)', 'Lima (zumo)', 'lima'),
  ('zumo de limon', 'Zumo de limón', 'limon'),
  ('ralladura de limon', 'Ralladura de limón', 'limon'),
  ('filetes de lubina', 'Filetes de lubina', 'lubina')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('lomo de lubina fresca', 'Lomo de lubina fresca', 'lubina'),
  ('lubina (filetes)', 'Lubina (filetes)', 'lubina'),
  ('lubina entera', 'Lubina entera', 'lubina'),
  ('maiz dulce', 'Maíz dulce', 'maiz'),
  ('maiz dulce cocido', 'Maíz dulce cocido', 'maiz'),
  ('maiz cocido', 'Maíz cocido', 'maiz'),
  ('maiz tostado', 'Maíz tostado', 'maiz'),
  ('mango maduro', 'Mango maduro', 'mango'),
  ('mango congelado', 'Mango congelado', 'mango'),
  ('manitas de cerdo partidas por la mitad', 'Manitas de cerdo partidas por la mitad', 'manitas-de-cerdo')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('manzana acida', 'Manzana ácida', 'manzana'),
  ('manzana golden', 'Manzana Golden', 'manzana'),
  ('manzana reineta', 'Manzana reineta', 'manzana'),
  ('manzana verde', 'Manzana verde', 'manzana'),
  ('mejillones (sin concha)', 'Mejillones (sin concha)', 'mejillones'),
  ('mejillones cocidos', 'Mejillones cocidos', 'mejillones'),
  ('mejillones frescos', 'Mejillones frescos', 'mejillones'),
  ('hierbabuena fresca', 'Hierbabuena fresca', 'menta'),
  ('menta', 'Menta', 'menta'),
  ('merluza en rodajas', 'Merluza en rodajas', 'merluza')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('filetes de merluza', 'Filetes de merluza', 'merluza'),
  ('kokotxas de merluza', 'Kokotxas de merluza', 'merluza'),
  ('merluza en trozos', 'Merluza en trozos', 'merluza'),
  ('merluza o pescado blanco', 'Merluza o pescado blanco', 'merluza'),
  ('rosada en lomos', 'Rosada en lomos', 'merluza'),
  ('lomos de merluza', 'Lomos de merluza', 'merluza-lomos'),
  ('miel de cana', 'Miel de caña', 'miel'),
  ('miso blanco', 'Miso blanco', 'miso'),
  ('colas de rape en trozos', 'Colas de rape en trozos', 'monkfish'),
  ('medallones de rape', 'Medallones de rape', 'monkfish')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('rape (cola, en medallones)', 'Rape (cola, en medallones)', 'monkfish'),
  ('morcilla de burgos', 'Morcilla de Burgos', 'morcilla'),
  ('morcilla asturiana', 'Morcilla asturiana', 'morcilla'),
  ('mostaza', 'Mostaza', 'mostaza'),
  ('mostaza a la antigua', 'Mostaza a la antigua', 'mostaza'),
  ('mostaza americana', 'Mostaza americana', 'mostaza'),
  ('mozzarella', 'Mozzarella', 'mozzarella'),
  ('queso mozzarella rallado', 'Queso mozzarella rallado', 'mozzarella'),
  ('mozzarella (bocconcini)', 'Mozzarella (bocconcini)', 'mozzarella'),
  ('mozzarella rallada', 'Mozzarella rallada', 'mozzarella')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('queso mozzarella', 'Queso mozzarella', 'mozzarella'),
  ('muslo de pollo deshuesado', 'Muslo de pollo deshuesado', 'muslo-de-pollo'),
  ('muslos de pollo deshuesados', 'Muslos de pollo deshuesados', 'muslo-de-pollo'),
  ('zumo de naranja', 'Zumo de naranja', 'naranja'),
  ('ralladura de naranja', 'Ralladura de naranja', 'naranja'),
  ('nata', 'Nata', 'nata'),
  ('nata liquida', 'Nata líquida', 'nata'),
  ('nuez', 'Nuez', 'nueces'),
  ('nuez moscada molida', 'Nuez moscada molida', 'nuez-moscada'),
  ('obleas de empanadilla', 'Obleas de empanadilla', 'obleas')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('obleas para empanadillas', 'Obleas para empanadillas', 'obleas'),
  ('obleas para gyoza', 'Obleas para gyoza', 'obleas'),
  ('oregano seco', 'Orégano seco', 'oregano'),
  ('pan rustico', 'Pan rústico', 'pan'),
  ('pan del dia anterior', 'Pan del día anterior', 'pan'),
  ('pan de hogaza', 'Pan de hogaza', 'pan'),
  ('pan frito', 'Pan frito', 'pan'),
  ('pan de barra', 'Pan de barra', 'pan'),
  ('pan tostado', 'Pan tostado', 'pan'),
  ('pan de masa madre', 'Pan de masa madre', 'pan')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('pan de centeno', 'Pan de centeno', 'pan'),
  ('pan duro', 'Pan duro', 'pan'),
  ('pan de pueblo', 'Pan de pueblo', 'pan'),
  ('pan payes del dia anterior', 'Pan payés del día anterior', 'pan-de-payes'),
  ('pan de molde para picatostes', 'Pan de molde para picatostes', 'pan-molde'),
  ('panceta ahumada', 'Panceta ahumada', 'panceta'),
  ('panceta ahumada en lonchas finas', 'Panceta ahumada en lonchas finas', 'panceta'),
  ('panceta ahumada en taquitos', 'Panceta ahumada en taquitos', 'panceta'),
  ('parmesano', 'Parmesano', 'parmesano'),
  ('queso parmesano rallado', 'Queso parmesano rallado', 'parmesano')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('parmesano rallado', 'Parmesano rallado', 'parmesano'),
  ('parmesano en virutas', 'Parmesano en virutas', 'parmesano'),
  ('queso parmesano en virutas', 'Queso parmesano en virutas', 'parmesano'),
  ('queso pecorino', 'Queso pecorino', 'parmesano'),
  ('uvas pasas', 'Uvas pasas', 'pasas'),
  ('patatas', 'Patatas', 'patata'),
  ('patata baby', 'Patata baby', 'patata'),
  ('patata grande', 'Patata grande', 'patata'),
  ('muslos de pato', 'Muslos de pato', 'pato'),
  ('pechuga de pato', 'Pechuga de pato', 'pato')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('filetes de pavo', 'Filetes de pavo', 'pavo'),
  ('pechuga de pavo en lonchas', 'Pechuga de pavo en lonchas', 'pechuga-de-pavo'),
  ('pechuga de pollo asada', 'Pechuga de pollo asada', 'pechuga-de-pollo'),
  ('pepinillos en vinagre', 'Pepinillos en vinagre', 'pepinillos'),
  ('pepinillos encurtidos', 'Pepinillos encurtidos', 'pepinillos'),
  ('pepinillos en rodajas', 'Pepinillos en rodajas', 'pepinillos'),
  ('perejil fresco', 'Perejil fresco', 'perejil'),
  ('perejil picado', 'Perejil picado', 'perejil'),
  ('pescadilla en lomos', 'Pescadilla en lomos', 'pescadilla'),
  ('pesto de albahaca', 'Pesto de albahaca', 'pesto')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('pimenton', 'Pimentón', 'pimenton'),
  ('pimenton picante', 'Pimentón picante', 'pimenton'),
  ('pimenton ahumado', 'Pimentón ahumado', 'pimenton'),
  ('pimienta', 'Pimienta', 'pimienta'),
  ('pimienta negra en grano', 'Pimienta negra en grano', 'pimienta'),
  ('pimienta verde en grano', 'Pimienta verde en grano', 'pimienta'),
  ('pimienta negra en grano machacada', 'Pimienta negra en grano machacada', 'pimienta'),
  ('pimienta negra molida', 'Pimienta negra molida', 'pimienta'),
  ('pimiento choricero (nora)', 'Pimiento choricero (ñora)', 'pimiento-choricero'),
  ('nora hidratada', 'Ñora hidratada', 'pimiento-choricero')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('pimiento choricero (pulpa de nora)', 'Pimiento choricero (pulpa de ñora)', 'pimiento-choricero'),
  ('pimiento choricero (pulpa)', 'Pimiento choricero (pulpa)', 'pimiento-choricero'),
  ('pimiento choricero o nora hidratado', 'Pimiento choricero o ñora hidratado', 'pimiento-choricero'),
  ('pimiento rojo asado', 'Pimiento rojo asado', 'pimiento-rojo'),
  ('pimientos rojos', 'Pimientos rojos', 'pimiento-rojo'),
  ('pimiento morron', 'Pimiento morrón', 'pimiento-verde'),
  ('pimiento amarillo', 'Pimiento amarillo', 'pimiento-verde'),
  ('pimiento de padron', 'Pimiento de padrón', 'pimiento-verde'),
  ('pimiento verde italiano', 'Pimiento verde italiano', 'pimiento-verde'),
  ('pimientos choriceros', 'Pimientos choriceros', 'pimiento-verde')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('pistachos', 'Pistachos', 'pistacho'),
  ('pistachos pelados', 'Pistachos pelados', 'pistacho'),
  ('platano congelado', 'Plátano congelado', 'platano'),
  ('pollo', 'Pollo', 'pollo'),
  ('pollo asado de bolsa', 'Pollo asado de bolsa', 'pollo'),
  ('carne picada de pollo', 'Carne picada de pollo', 'pollo'),
  ('pollo asado desmenuzado', 'Pollo asado desmenuzado', 'pollo'),
  ('pollo entero', 'Pollo entero', 'pollo'),
  ('pulpo congelado limpio', 'Pulpo congelado limpio', 'pulpo'),
  ('queso gruyere rallado', 'Queso gruyère rallado', 'queso')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('queso curado', 'Queso curado', 'queso'),
  ('queso en porciones', 'Queso en porciones', 'queso'),
  ('queso rallado para fundir', 'Queso rallado para fundir', 'queso'),
  ('queso cheddar (lonchas)', 'Queso cheddar (lonchas)', 'queso'),
  ('queso cheddar curado en lonchas', 'Queso cheddar curado en lonchas', 'queso'),
  ('queso cheddar en lonchas', 'Queso cheddar en lonchas', 'queso'),
  ('queso curado rallado', 'Queso curado rallado', 'queso'),
  ('queso emmental', 'Queso Emmental', 'queso'),
  ('queso emmental en lonchas', 'Queso emmental en lonchas', 'queso'),
  ('queso gruyere', 'Queso gruyère', 'queso')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('queso para fundir en lonchas', 'Queso para fundir en lonchas', 'queso'),
  ('queso rallado curado', 'Queso rallado curado', 'queso'),
  ('queso de cabra en rulo', 'Queso de cabra en rulo', 'queso-cabra'),
  ('remolacha', 'Remolacha', 'remolacha'),
  ('repollo morado', 'Repollo morado', 'repollo'),
  ('ricotta salada', 'Ricotta salada', 'ricotta'),
  ('lomos de rodaballo', 'Lomos de rodaballo', 'rodaballo'),
  ('rodaballo (filetes)', 'Rodaballo (filetes)', 'rodaballo'),
  ('rodaballo entero limpio', 'Rodaballo entero limpio', 'rodaballo'),
  ('romero fresco', 'Romero fresco', 'romero')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('sal gruesa', 'Sal gruesa', 'sal-gruesa'),
  ('salchicha fresca italiana', 'Salchicha fresca italiana', 'salchicha'),
  ('salmon (lomos)', 'Salmón (lomos)', 'salmon'),
  ('salmon', 'Salmón', 'salmon'),
  ('salmonetes limpios', 'Salmonetes limpios', 'salmon'),
  ('salmonetes pequenos', 'Salmonetes pequeños', 'salmon'),
  ('salmon fresco calidad sashimi', 'Salmón fresco calidad sashimi', 'salmon-fresco'),
  ('lomo de salmon fresco con piel', 'Lomo de salmón fresco con piel', 'salmon-fresco'),
  ('lomo de salmon fresco de calidad sashimi', 'Lomo de salmón fresco de calidad sashimi', 'salmon-fresco'),
  ('salmon fresco para sushi', 'Salmón fresco para sushi', 'salmon-fresco')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('salsa de pescado', 'Salsa de pescado', 'salsa-worcestershire'),
  ('salsa perrins', 'Salsa Perrins', 'salsa-worcestershire'),
  ('hojas de salvia fresca', 'Hojas de salvia fresca', 'salvia'),
  ('sardinas ahumadas', 'Sardinas ahumadas', 'sardinas'),
  ('sardinas frescas limpias', 'Sardinas frescas limpias', 'sardinas'),
  ('sepia limpia', 'Sepia limpia', 'sepia'),
  ('sesamo tostado', 'Sésamo tostado', 'sesamo'),
  ('semillas de sesamo tostado', 'Semillas de sésamo tostado', 'sesamo'),
  ('sesamo blanco y negro', 'Sésamo blanco y negro', 'sesamo'),
  ('setas', 'Setas', 'setas')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('setas (champinones portobello)', 'Setas (champiñones portobello)', 'setas'),
  ('setas silvestres variadas', 'Setas silvestres variadas', 'setas'),
  ('solomillo de cerdo', 'Solomillo de cerdo', 'solomillo'),
  ('filete de solomillo de ternera', 'Filete de solomillo de ternera', 'solomillo'),
  ('solomillo de ternera (para tartar)', 'Solomillo de ternera (para tartar)', 'solomillo'),
  ('solomillo de ternera en dados', 'Solomillo de ternera en dados', 'solomillo'),
  ('solomillo de ternera muy fresco', 'Solomillo de ternera muy fresco', 'solomillo'),
  ('solomillo de ternera picado', 'Solomillo de ternera picado', 'solomillo'),
  ('nidos de tallarines', 'Nidos de tallarines', 'tallarines'),
  ('pappardelle', 'Pappardelle', 'tallarines')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('tallarines', 'Tallarines', 'tallarines'),
  ('bolsas de tinta de calamar', 'Bolsas de tinta de calamar', 'tinta-de-calamar'),
  ('bolsitas de tinta de calamar', 'Bolsitas de tinta de calamar', 'tinta-de-calamar'),
  ('tomate maduro', 'Tomate maduro', 'tomate'),
  ('tomate natural', 'Tomate natural', 'tomate'),
  ('tomate raf', 'Tomate raf', 'tomate'),
  ('tomate rallado', 'Tomate rallado', 'tomate'),
  ('tomates grandes', 'Tomates grandes', 'tomate'),
  ('tomates cherry', 'Tomates cherry', 'tomate-cherry'),
  ('salsa de tomate', 'Salsa de tomate', 'tomate-frito')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('tomates secos en aceite', 'Tomates secos en aceite', 'tomate-seco'),
  ('tomate triturado de bote', 'Tomate triturado de bote', 'tomate-triturado'),
  ('tomillo fresco', 'Tomillo fresco', 'tomillo'),
  ('tortilla de maiz', 'Tortilla de maíz', 'tortilla-de-maiz'),
  ('tortilla de trigo', 'Tortilla de trigo', 'tortilla-de-trigo'),
  ('tortillas de trigo grandes', 'Tortillas de trigo grandes', 'tortilla-de-trigo'),
  ('tortillas de trigo pequenas', 'Tortillas de trigo pequeñas', 'tortilla-de-trigo'),
  ('truchas enteras', 'Truchas enteras', 'truchas-enteras'),
  ('truchas limpias', 'Truchas limpias', 'truchas-enteras'),
  ('trufa negra fresca', 'Trufa negra fresca', 'trufa-negra')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('vieiras limpias', 'Vieiras limpias', 'vieira'),
  ('vieiras limpias en su concha', 'Vieiras limpias en su concha', 'vieira'),
  ('vinagre de vino', 'Vinagre de vino', 'vinagre'),
  ('vinagre de vino blanco', 'Vinagre de vino blanco', 'vinagre'),
  ('vinagre de arroz', 'Vinagre de arroz', 'vinagre'),
  ('vinagre de vino tinto', 'Vinagre de vino tinto', 'vinagre'),
  ('jalapenos en vinagre', 'Jalapeños en vinagre', 'vinagre'),
  ('vinagre de modena', 'Vinagre de Módena', 'vinagre-balsamico'),
  ('crema de vinagre balsamico', 'Crema de vinagre balsámico', 'vinagre-balsamico'),
  ('reduccion de vinagre balsamico', 'Reducción de vinagre balsámico', 'vinagre-balsamico')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

insert into ingredient_aliases (
  alias_normalized, alias, ingredient_id
) values
  ('vino pedro ximenez', 'Vino Pedro Ximénez', 'vino-blanco'),
  ('vino de jerez', 'Vino de Jerez', 'vino-blanco'),
  ('vino oloroso', 'Vino oloroso', 'vino-blanco'),
  ('vino de oporto', 'Vino de Oporto', 'vino-blanco'),
  ('vino rancio', 'Vino rancio', 'vino-blanco'),
  ('vol-au-vent de hojaldre (cestas precocidas)', 'Vol-au-vent de hojaldre (cestas precocidas)', 'vol-au-vent'),
  ('yogur griego', 'Yogur griego', 'yogur'),
  ('yogur griego natural', 'Yogur griego natural', 'yogur'),
  ('yogur de sabores', 'Yogur de sabores', 'yogur')
on conflict (alias_normalized) do update set
  alias = excluded.alias,
  ingredient_id = excluded.ingredient_id;

commit;
