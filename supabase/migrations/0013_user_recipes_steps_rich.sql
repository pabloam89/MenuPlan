-- Paso a paso enriquecido para las recetas creadas por el usuario.
--
-- `steps` (text[]) sigue siendo la fuente de verdad / fallback y no se toca:
-- una receta antigua sin steps_rich se pinta igual que siempre, como lista
-- numerada. `steps_rich` añade la versión estructurada que ya usa el catálogo
-- (src/data/recipes/*.json), y que el detalle del menú pinta como stepper con
-- tipo de paso, tiempo y pasos en paralelo:
--
--   [{ "text": "Picar {{Ajo}}.", "minutes": 3, "kind": "prep" },
--    { "text": "Calentar la leche.", "minutes": 2, "kind": "paralelo", "during": 0 }]
--
-- kind ∈ prep | activo | paralelo | pasivo | espera | opcional | emplatado
-- during = índice 0-based del paso con el que corre en paralelo.
-- El `text` puede llevar marcadores ({{Ingrediente}}, {{@Sartén}}) que se
-- resuelven en cliente al pintar; por eso se guarda en crudo.
--
-- jsonb y no una tabla aparte porque los pasos solo se leen y escriben junto a
-- su receta, nunca se consultan por separado.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

alter table user_recipes
  add column if not exists steps_rich jsonb;
