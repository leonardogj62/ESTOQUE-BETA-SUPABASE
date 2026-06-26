create table if not exists public.product_catalog_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  normalized_color text not null,
  color_label text not null,
  color_code text,
  image_path text not null,
  catalog_file_name text,
  catalog_page integer,
  updated_at timestamptz not null default now(),
  unique(company_id, normalized_name, normalized_color)
);

create index if not exists product_catalog_assets_company_idx
  on public.product_catalog_assets(company_id, normalized_name);

alter table public.product_catalog_assets enable row level security;

drop policy if exists catalog_assets_company_read on public.product_catalog_assets;
create policy catalog_assets_company_read
  on public.product_catalog_assets
  for select
  to anon, authenticated
  using (private.can_read_company(company_id));

insert into storage.buckets (id, name, public)
values ('product-catalog-images', 'product-catalog-images', true)
on conflict (id) do update set public = excluded.public;

grant select on public.product_catalog_assets to anon, authenticated;
