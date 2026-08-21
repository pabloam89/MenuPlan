-- Store product catalogs synced from supermarket APIs (Mercadona first).
-- Client reads bundled JSON in public/store/; this table is optional for
-- server-side queries, analytics, and future multi-store support.
--
-- Run in Supabase Dashboard → SQL Editor.

create table if not exists store_products (
  store         text not null default 'mercadona',
  product_id    text not null,
  name          text not null,
  price         numeric,
  unit_size     numeric,
  unit_format   text,
  bulk_price    numeric,
  section       text,
  category      text,
  subcategory   text,
  fetched_at    timestamptz not null,
  primary key (store, product_id)
);

create index if not exists store_products_store_name_idx
  on store_products (store, name);

alter table store_products enable row level security;

drop policy if exists "Public read store products" on store_products;
create policy "Public read store products"
  on store_products for select
  using (true);

-- Writes happen only via service role (sync script), not from the client.
