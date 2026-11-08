-- Vocabulario cerrado de la app: cinco columnas de texto que la app solo
-- escribe desde una lista fija, y que la base aceptaba con cualquier cosa.
--
--   user_menu_weeks.active_days         ⊆ DAYS               (src/lib/planner.js)
--   user_pantry.pack_kind               ∈ PACK_KINDS         (src/lib/packUnits.js)
--   user_recipes.required_appliances    ⊆ KITCHEN_TOOL_IDS   (src/lib/electrodomesticos.js)
--   user_recipes.usage_tags             ⊆ USAGE_TAGS         (src/lib/userRecipes.js)
--   recipe_collections.collection_id    ∈ BUILT_IN_COLLECTIONS o 'fld_…' (src/lib/recipeCollections.js)
--
-- src/lib/vocabularioApp.test.js compara cada lista de aquí con su constante:
-- añadir un valor en JS sin migración hace fallar ese test.
--
-- Escritores revisados (también en origin/main, que sigue escribiendo en la
-- misma base mientras dure la transición):
--   · active_days: weekToRow (menusSync.js), que usa la app y el bot
--     (api/_bot/generar.js) y que pasa por las RPC de 0057/0068 sin tocarla.
--     Los días salen siempre de DAYS (Onboarding.jsx, semanaDias.js).
--   · pack_kind: packDbFields (pantry.js), con el selector de PantryInput.jsx
--     sobre PACK_KINDS y los valores de defaultPackFor. El bot (despensa.js)
--     no escribe envase.
--   · required_appliances: el asistente de recetas (APPLIANCES = KITCHEN_TOOLS)
--     y el bot (preparar_receta, enum de KITCHEN_TOOL_IDS). Los aparatos
--     propios (customKitchenTools) no llegan nunca a una receta.
--   · usage_tags: borradorDesdeRespuesta filtra por USAGE_TAGS y el resto sale
--     de deriveUsageTagsFromType. Copiar una receta copia la fila tal cual.
--   · collection_id: solo saveRecipeCollections, desde el selector de carpetas
--     (las 4 fijas + las del usuario, 'fld_<uuid>'). «descartados» no se guarda
--     aquí nunca: sale de los descartes. 0026 lo dejó sin CHECK para no cerrar
--     las carpetas del usuario; con el prefijo 'fld_' siguen abiertas, y solo
--     una carpeta FIJA nueva pide migración.
--
-- NOT VALID: no recorre las filas que ya hay, pero OJO, sí se comprueba en
-- cualquier UPDATE de una fila vieja. Si una fila trae un valor fuera de la
-- lista, editarla (renombrar la receta, cambiarle la foto, sumar a la
-- despensa) fallaría. Por eso, ANTES de aplicar, en el SQL editor de
-- producción, todo esto tiene que dar 0 filas:
--
--   select active_days, count(*) from public.user_menu_weeks
--    where not (active_days <@ array['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']::text[])
--    group by 1;
--   select pack_kind, count(*) from public.user_pantry
--    where pack_kind not in ('bote','lata','paquete','bolsa','brick','botella','carton')
--    group by 1;
--   select a, count(*) from public.user_recipes, unnest(required_appliances) a
--    where a <> all (array['Airfryer','Horno','Microondas','Olla rápida','Thermomix','Vaporera']::text[])
--    group by 1;
--   select t, count(*) from public.user_recipes, unnest(usage_tags) t
--    where t <> all (array['plato_unico','plato_normal','guarnicion']::text[])
--    group by 1;
--   select collection_id, count(*) from public.recipe_collections
--    where collection_id not in ('dia_a_dia','ocasion_especial','cena_rapida','hijos')
--      and collection_id not like 'fld\_%'
--    group by 1;
--
-- (Los días, con las tildes en NFC: si algo sale en la primera consulta con
-- 'Mié' o 'Sáb' a la vista, es que está en NFD; normalize(x, NFC) lo arregla.)
--
-- Después, cuando lo anterior siga en 0 y no haya errores 23514 en los logs:
--   alter table public.user_menu_weeks    validate constraint user_menu_weeks_active_days_vocabulario;
--   alter table public.user_pantry        validate constraint user_pantry_pack_kind_vocabulario;
--   alter table public.user_recipes       validate constraint user_recipes_required_appliances_vocabulario;
--   alter table public.user_recipes       validate constraint user_recipes_usage_tags_vocabulario;
--   alter table public.recipe_collections validate constraint recipe_collections_collection_id_vocabulario;

alter table public.user_menu_weeks drop constraint if exists user_menu_weeks_active_days_vocabulario;
alter table public.user_menu_weeks add constraint user_menu_weeks_active_days_vocabulario
  check (active_days is null
         or active_days <@ array['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']::text[]) not valid;

alter table public.user_pantry drop constraint if exists user_pantry_pack_kind_vocabulario;
alter table public.user_pantry add constraint user_pantry_pack_kind_vocabulario
  check (pack_kind is null
         or pack_kind in ('bote','lata','paquete','bolsa','brick','botella','carton')) not valid;

alter table public.user_recipes drop constraint if exists user_recipes_required_appliances_vocabulario;
alter table public.user_recipes add constraint user_recipes_required_appliances_vocabulario
  check (required_appliances is null
         or required_appliances <@ array['Airfryer','Horno','Microondas','Olla rápida','Thermomix','Vaporera']::text[]) not valid;

alter table public.user_recipes drop constraint if exists user_recipes_usage_tags_vocabulario;
alter table public.user_recipes add constraint user_recipes_usage_tags_vocabulario
  check (usage_tags <@ array['plato_unico','plato_normal','guarnicion']::text[]) not valid;

alter table public.recipe_collections drop constraint if exists recipe_collections_collection_id_vocabulario;
alter table public.recipe_collections add constraint recipe_collections_collection_id_vocabulario
  check (collection_id in ('dia_a_dia','ocasion_especial','cena_rapida','hijos')
         or collection_id like 'fld\_%') not valid;

comment on column public.recipe_collections.collection_id is
  'Id de carpeta: una de las 4 fijas de Inspíranos o un fld_<uuid> de recipe_folders. CHECK de 0086 (NOT VALID).';
