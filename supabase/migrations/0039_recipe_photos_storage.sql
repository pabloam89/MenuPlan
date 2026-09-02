-- ═══ Las fotos de receta salen de la base y pasan a ser ficheros ═══════════
--
-- Hasta ahora `user_recipes.photo` guardaba la imagen ENTERA como texto
-- (`data:image/png;base64,...`). Medido en producción: 2,2 MB por receta, de
-- los que 2,2 MB son la foto — el nombre, los pasos y los ingredientes juntos
-- no llegan a 1 KB. Pedir 50 recetas eran 11,5 MB en una sola petición.
--
-- Y no era solo tamaño. Una imagen incrustada como texto:
--   · pesa un 33% más que el fichero original (eso hace base64),
--   · no se puede cachear por separado, así que el navegador la vuelve a
--     descargar CADA vez que lee la fila,
--   · viaja aunque solo quieras el nombre del plato.
-- Resultado: 6 GB de salida en tres semanas con 3 usuarios, y el proyecto
-- excediendo la cuota del plan gratuito con la base al 15% de su tamaño.
--
-- A partir de aquí la foto es un fichero en Storage y en la fila queda solo
-- su URL (~100 bytes). La sirve la CDN, se descarga una vez y se reutiliza.

-- ── El cubo ────────────────────────────────────────────────────────────────
--
-- Público a propósito: estas fotos acompañan a recetas que se publican en el
-- feed, así que tienen que verse sin sesión y sin firmar URLs. Lo que se
-- protege no es la lectura — es quién puede escribir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-photos',
  'recipe-photos',
  true,
  5242880,  -- 5 MB por fichero: de sobra para una foto de plato ya comprimida
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Quién puede escribir ───────────────────────────────────────────────────
--
-- Cada persona manda solo dentro de SU carpeta. Las rutas son
-- "<user_id>/<recipe_id>.jpg", así que la primera carpeta del nombre es el
-- dueño: comparándola con auth.uid() nadie puede pisar las fotos de otro ni
-- llenar el cubo a su nombre.

drop policy if exists "Recipe photos are publicly readable" on storage.objects;
create policy "Recipe photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'recipe-photos');

drop policy if exists "Owner uploads own recipe photos" on storage.objects;
create policy "Owner uploads own recipe photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Update hace falta para el `upsert` de la subida: regenerar la foto de una
-- receta sobreescribe el mismo fichero en vez de dejar huérfanos.
drop policy if exists "Owner replaces own recipe photos" on storage.objects;
create policy "Owner replaces own recipe photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owner deletes own recipe photos" on storage.objects;
create policy "Owner deletes own recipe photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on column public.user_recipes.photo is
  'URL pública de la foto en el bucket recipe-photos. Las filas antiguas pueden traer todavía un data: URL incrustado; el cliente las sube a Storage y las sustituye la primera vez que las toca (ver lib/recipePhotos.js).';
