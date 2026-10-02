-- 0070 · El cotitular: un papel nuevo, `editor` (specs/roles-de-la-casa-*.md).
--
-- Va SOLO en este fichero: PostgreSQL no deja usar un valor de enum en la
-- misma transacción en la que se añade. Aplicar esta, confirmar, y después la
-- 0071. Si se pegan juntas en el editor SQL (una sola transacción), la 0071
-- falla con «unsafe use of new value».
--
-- Los clientes viejos leen cualquier papel que no sea `owner` como `viewer`
-- (parseHouseholdRow): un cotitular con la app sin actualizar ve la casa en
-- solo lectura, que es lo seguro.

alter type public.household_member_role add value if not exists 'editor';
