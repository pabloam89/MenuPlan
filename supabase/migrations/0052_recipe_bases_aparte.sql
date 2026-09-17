-- `bases_aparte`: las preparaciones que un plato admite YA HECHAS y que no son
-- una fécula.
--
-- Por qué no cabía en una columna existente: `main_base` responde "¿qué hidrato
-- lleva el plato?" y alimenta carbType y las reglas de variedad. El sofrito no
-- es un hidrato, y un plato puede llevar arroz Y sofrito — así que meterlo ahí
-- habría roto el eje y además solo habría dejado declarar uno de los dos.
--
-- Hoy la lista tiene un solo valor, "sofrito", y lo llevan 265 platos: más que
-- las siete bases de fécula juntas. Y es el que más tiempo ahorra de verdad,
-- porque es el único que ahorra TRABAJO: una olla de arroz son 18 minutos de
-- los que 8 son tuyos; un sofrito son 30 y son los 30. Con él, el ahorro real
-- de una semana pasa de 6 minutos a 93 (medido sobre 2.000 semanas simuladas).
--
-- Nullable y sin default, como el resto: ausente significa "este plato no
-- aprovecha ninguna", que es la respuesta correcta para la mayoría.
--
-- NO se añade `base_key`: solo lo llevan las recetas `type: "base"`, y esas
-- viajan siempre en el bundle (bases.json se importa directo en
-- recipeCatalog.js), nunca desde aquí. Sería una columna muerta, y está
-- declarado así en src/data/recipeRow.test.js.

alter table recipes
  add column if not exists bases_aparte text[];

comment on column recipes.bases_aparte is
  'Preparaciones no feculentas que el plato admite ya hechas (hoy: sofrito). Ver src/lib/bases.js.';
