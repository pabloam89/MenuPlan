-- Las dos vistas de catálogo pasan a SECURITY INVOKER.
--
-- Son los dos únicos errores del advisor de Supabase. Una vista sin
-- `security_invoker` se ejecuta con los permisos de quien la creó, así que
-- consulta sus tablas SALTÁNDOSE la RLS de quien la llama.
--
-- Aquí el riesgo real es bajo -- las dos leen solo catálogo (ingredientes,
-- alérgenos, sustituciones), ningún dato de usuario, y son agregadas, así que
-- tampoco se puede escribir a través de ellas. Pero mientras estén así son una
-- puerta que no hace falta que exista: las tablas que consultan ya tienen
-- política de lectura pública propia ("ingredients are publicly readable",
-- "recipe_ingredients are publicly readable", "ingredient_substitutions are
-- publicly readable"), o sea que con invoker el resultado es exactamente el
-- mismo para todo el mundo, sin el atajo.
--
-- Requiere PostgreSQL 15+ (Supabase lo cumple desde hace tiempo).

alter view public.recipe_derived_allergens    set (security_invoker = on);
alter view public.recipe_substitution_options set (security_invoker = on);
