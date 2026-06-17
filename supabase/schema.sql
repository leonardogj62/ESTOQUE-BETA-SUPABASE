create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create table if not exists public.stock_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category text not null check (category in ('masc','fem')),
  availability text not null check (availability in ('pronta_entrega','programacao','promocao')),
  drive_folder_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_files (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.stock_sources(id) on delete cascade,
  drive_file_id text not null,
  file_name text not null,
  mime_type text,
  modified_at timestamptz,
  imported_at timestamptz not null default now(),
  status text not null check (status in ('imported','empty','failed')),
  error_message text,
  product_count integer not null default 0,
  color_count integer not null default 0,
  raw_meta jsonb not null default '{}'::jsonb,
  unique(source_id, drive_file_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.stock_files(id) on delete cascade,
  source_id uuid not null references public.stock_sources(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  color_name text not null,
  normalized_color text not null,
  process_code text,
  quantity_meters numeric(14,2) not null check (quantity_meters >= 0),
  imported_at timestamptz not null default now()
);

create index if not exists stock_items_product_idx on public.stock_items(product_id);
create index if not exists stock_items_source_idx on public.stock_items(source_id);
create index if not exists stock_items_color_idx on public.stock_items(normalized_color);
create index if not exists products_name_trgm_idx on public.products using gin (normalized_name gin_trgm_ops);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.price_files (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text,
  file_name text not null,
  imported_at timestamptz not null default now(),
  status text not null check (status in ('imported','failed')),
  error_message text,
  item_count integer not null default 0
);

create table if not exists public.price_items (
  id uuid primary key default gen_random_uuid(),
  price_file_id uuid references public.price_files(id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  unit text,
  price_1 numeric(14,2),
  price_2 numeric(14,2),
  price_3 numeric(14,2),
  price_4 numeric(14,2),
  availability text,
  expected_arrival text
);

create table if not exists public.product_labels (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  display_name text not null,
  reference text,
  width text,
  weight text,
  composition text,
  origin text,
  washing_instructions jsonb not null default '[]'::jsonb,
  drive_photo_id text,
  ocr_text text,
  updated_at timestamptz not null default now()
);

create or replace view public.v_latest_stock_files as
select distinct on (sf.source_id)
  sf.*
from public.stock_files sf
where sf.status in ('imported','empty')
order by sf.source_id, coalesce(sf.modified_at, sf.imported_at) desc, sf.imported_at desc;

create or replace view public.v_stock_search as
select
  p.id as product_id,
  p.display_name as product_name,
  p.normalized_name,
  s.slug as source_slug,
  s.label as source_label,
  s.category,
  s.availability,
  si.color_name,
  si.normalized_color,
  si.process_code,
  si.quantity_meters,
  sf.file_name,
  sf.imported_at
from public.stock_items si
join public.products p on p.id = si.product_id
join public.stock_sources s on s.id = si.source_id
join public.v_latest_stock_files sf on sf.id = si.file_id;

create or replace view public.v_source_health as
select
  s.slug,
  s.label,
  s.category,
  s.availability,
  s.active,
  lf.file_name,
  lf.modified_at,
  lf.imported_at,
  lf.status,
  lf.error_message,
  coalesce(lf.product_count, 0) as product_count,
  coalesce(lf.color_count, 0) as color_count
from public.stock_sources s
left join public.v_latest_stock_files lf on lf.source_id = s.id
order by s.category, s.availability, s.label;

create or replace function public.normalize_text(value text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(upper(unaccent(coalesce(value,''))), '[^A-Z0-9 ]', ' ', 'g'));
$$;

create or replace function public.search_stock(q text default '')
returns table (
  product_name text,
  source_label text,
  color_name text,
  process_code text,
  quantity_meters numeric,
  file_name text,
  imported_at timestamptz
)
language sql
stable
as $$
  select
    v.product_name,
    v.source_label,
    v.color_name,
    v.process_code,
    v.quantity_meters,
    v.file_name,
    v.imported_at
  from public.v_stock_search v
  where coalesce(q,'') = ''
     or v.normalized_name ilike '%' || public.normalize_text(q) || '%'
     or v.normalized_color ilike '%' || public.normalize_text(q) || '%'
     or coalesce(v.process_code,'') ilike '%' || q || '%'
  order by v.product_name, v.source_label, v.color_name;
$$;

alter table public.stock_sources enable row level security;
alter table public.stock_files enable row level security;
alter table public.products enable row level security;
alter table public.stock_items enable row level security;
alter table public.import_runs enable row level security;
alter table public.price_files enable row level security;
alter table public.price_items enable row level security;
alter table public.product_labels enable row level security;

create policy "read stock sources" on public.stock_sources for select using (true);
create policy "read stock files" on public.stock_files for select using (true);
create policy "read products" on public.products for select using (true);
create policy "read stock items" on public.stock_items for select using (true);
create policy "read import runs" on public.import_runs for select using (true);
create policy "read price files" on public.price_files for select using (true);
create policy "read price items" on public.price_items for select using (true);
create policy "read product labels" on public.product_labels for select using (true);
