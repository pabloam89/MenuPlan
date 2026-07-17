-- Catalog version gate table — lets the app decide whether to trust the
-- remote recipe catalog or fall back to the bundled JSON.
--
-- The client reads catalog_meta.version and compares it to
-- BUNDLED_CATALOG_VERSION (src/data/catalogVersion.js). If the DB version
-- is behind, the bundled JSON wins — safe by design.
--
-- Without this table the client gets a 404 on every load and always falls
-- back to the bundled catalog, which works fine but prints a scary console
-- error and defeats the whole "update recipes without a redeploy" mechanism.

create table if not exists catalog_meta (
  id      text primary key,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table catalog_meta enable row level security;

create policy "catalog_meta is publicly readable"
  on catalog_meta for select
  using (true);

-- Seed the initial row so the version gate resolves immediately.
insert into catalog_meta (id, version)
values ('recipes', 2)
on conflict (id) do update set version = 2, updated_at = now();
