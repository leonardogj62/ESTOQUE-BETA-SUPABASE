-- Multiempresa: preserva os dados atuais como pertencentes a Beta Importadora
-- e cria a base dos cadastros administrativos do escritorio de representacao.

create schema if not exists private;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  document text,
  email text,
  phone text,
  address jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','sales','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('owner','admin','manager','sales','viewer')),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists organization_invitations_pending_unique
  on public.organization_invitations(organization_id, lower(email))
  where accepted_at is null;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text,
  trade_name text not null,
  slug text not null,
  tax_id text,
  state_registration text,
  email text,
  phone text,
  website text,
  address jsonb not null default '{}'::jsonb,
  logo_url text,
  notes text,
  price_drive_folder_id text,
  label_drive_folder_id text,
  public_read boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

insert into public.organizations (name, slug, email)
values ('Escritorio de Representacao', 'escritorio-principal', 'leonardogarciajj@gmail.com')
on conflict (slug) do nothing;

insert into public.companies (
  organization_id, legal_name, trade_name, slug, price_drive_folder_id,
  label_drive_folder_id, public_read
)
select id, 'Beta Importadora', 'Beta Importadora', 'beta-importadora',
  '1TLFeg3czJkesCOwFl7qMnTUB2B14xLKO',
  '11msFrrRee3JfCMrl_-Ys64-UyYeV3LOt', true
from public.organizations where slug = 'escritorio-principal'
on conflict (organization_id, slug) do update set
  price_drive_folder_id = excluded.price_drive_folder_id,
  label_drive_folder_id = excluded.label_drive_folder_id;

insert into public.organization_invitations (organization_id, email, role)
select id, 'leonardogarciajj@gmail.com', 'owner'
from public.organizations where slug = 'escritorio-principal'
on conflict do nothing;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.organization_members (organization_id, user_id, role)
  select i.organization_id, new.id, i.role
  from public.organization_invitations i
  where lower(i.email) = lower(new.email)
    and i.accepted_at is null
  on conflict (organization_id, user_id) do update
    set role = excluded.role, active = true;

  update public.organization_invitations
  set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Se o usuario ja existir quando esta migracao for reaplicada, vincula o convite.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role)
select i.organization_id, u.id, i.role
from public.organization_invitations i
join auth.users u on lower(u.email) = lower(i.email)
on conflict (organization_id, user_id) do nothing;

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
  );
$$;

create or replace function private.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active
      and m.role = any(allowed_roles)
  );
$$;

create or replace function private.can_read_company(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.companies c
    where c.id = target_company
      and c.active
      and (c.public_read or private.is_org_member(c.organization_id))
  );
$$;

create or replace function private.can_manage_company(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.companies c
    where c.id = target_company
      and private.has_org_role(c.organization_id, array['owner','admin','manager'])
  );
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.is_org_member(uuid) to anon, authenticated;
grant execute on function private.has_org_role(uuid, text[]) to anon, authenticated;
grant execute on function private.can_read_company(uuid) to anon, authenticated;
grant execute on function private.can_manage_company(uuid) to anon, authenticated;

-- Vincula todas as tabelas existentes a organizacao e empresa.
alter table public.stock_sources add column if not exists organization_id uuid references public.organizations(id);
alter table public.stock_sources add column if not exists company_id uuid references public.companies(id);
alter table public.stock_files add column if not exists organization_id uuid references public.organizations(id);
alter table public.stock_files add column if not exists company_id uuid references public.companies(id);
alter table public.products add column if not exists organization_id uuid references public.organizations(id);
alter table public.products add column if not exists company_id uuid references public.companies(id);
alter table public.stock_items add column if not exists organization_id uuid references public.organizations(id);
alter table public.stock_items add column if not exists company_id uuid references public.companies(id);
alter table public.import_runs add column if not exists organization_id uuid references public.organizations(id);
alter table public.import_runs add column if not exists company_id uuid references public.companies(id);
alter table public.price_files add column if not exists organization_id uuid references public.organizations(id);
alter table public.price_files add column if not exists company_id uuid references public.companies(id);
alter table public.price_items add column if not exists organization_id uuid references public.organizations(id);
alter table public.price_items add column if not exists company_id uuid references public.companies(id);
alter table public.product_labels add column if not exists organization_id uuid references public.organizations(id);
alter table public.product_labels add column if not exists company_id uuid references public.companies(id);
alter table public.showroom_updates add column if not exists organization_id uuid references public.organizations(id);
alter table public.showroom_updates add column if not exists company_id uuid references public.companies(id);
alter table public.showroom_update_items add column if not exists organization_id uuid references public.organizations(id);
alter table public.showroom_update_items add column if not exists company_id uuid references public.companies(id);

-- Campos do cadastro comercial de produtos.
alter table public.products add column if not exists reference text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists unit text not null default 'm';
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists ncm text;
alter table public.products add column if not exists notes text;
alter table public.products add column if not exists active boolean not null default true;

update public.stock_sources s set
  organization_id = c.organization_id,
  company_id = c.id
from public.companies c
where c.slug = 'beta-importadora' and s.company_id is null;

update public.stock_files f set organization_id = s.organization_id, company_id = s.company_id
from public.stock_sources s where s.id = f.source_id and f.company_id is null;
update public.stock_items i set organization_id = s.organization_id, company_id = s.company_id
from public.stock_sources s where s.id = i.source_id and i.company_id is null;

update public.products p set organization_id = c.organization_id, company_id = c.id,
  unit = case when p.normalized_name ~ '(^| )MALHA(S)?( |$)' then 'kg' else coalesce(p.unit, 'm') end
from public.companies c where c.slug = 'beta-importadora' and p.company_id is null;

update public.import_runs r set organization_id = c.organization_id, company_id = c.id
from public.companies c where c.slug = 'beta-importadora' and r.company_id is null;
update public.price_files r set organization_id = c.organization_id, company_id = c.id
from public.companies c where c.slug = 'beta-importadora' and r.company_id is null;
update public.price_items r set organization_id = c.organization_id, company_id = c.id
from public.companies c where c.slug = 'beta-importadora' and r.company_id is null;
update public.product_labels r set organization_id = c.organization_id, company_id = c.id
from public.companies c where c.slug = 'beta-importadora' and r.company_id is null;
update public.showroom_updates r set organization_id = c.organization_id, company_id = c.id
from public.companies c where c.slug = 'beta-importadora' and r.company_id is null;
update public.showroom_update_items r set organization_id = u.organization_id, company_id = u.company_id
from public.showroom_updates u where u.id = r.update_id and r.company_id is null;

alter table public.stock_sources alter column organization_id set not null;
alter table public.stock_sources alter column company_id set not null;
alter table public.stock_files alter column organization_id set not null;
alter table public.stock_files alter column company_id set not null;
alter table public.products alter column organization_id set not null;
alter table public.products alter column company_id set not null;
alter table public.stock_items alter column organization_id set not null;
alter table public.stock_items alter column company_id set not null;
alter table public.price_files alter column organization_id set not null;
alter table public.price_files alter column company_id set not null;
alter table public.price_items alter column organization_id set not null;
alter table public.price_items alter column company_id set not null;
alter table public.product_labels alter column organization_id set not null;
alter table public.product_labels alter column company_id set not null;
alter table public.showroom_updates alter column organization_id set not null;
alter table public.showroom_updates alter column company_id set not null;
alter table public.showroom_update_items alter column organization_id set not null;
alter table public.showroom_update_items alter column company_id set not null;

alter table public.products drop constraint if exists products_normalized_name_key;
alter table public.stock_sources drop constraint if exists stock_sources_slug_key;
drop index if exists public.price_items_manual_unique;
create unique index if not exists products_company_name_unique on public.products(company_id, normalized_name);
create unique index if not exists stock_sources_company_slug_unique on public.stock_sources(company_id, slug);
create unique index if not exists price_items_manual_unique
  on public.price_items(company_id, normalized_name, currency) where source_type = 'manual';
create index if not exists stock_sources_company_idx on public.stock_sources(company_id);
create index if not exists stock_files_company_idx on public.stock_files(company_id);
create index if not exists products_company_idx on public.products(company_id);
create index if not exists stock_items_company_idx on public.stock_items(company_id);
create index if not exists price_items_company_idx on public.price_items(company_id);
create index if not exists product_labels_company_idx on public.product_labels(company_id);

insert into public.stock_sources (
  organization_id, company_id, slug, label, category, availability, drive_folder_id, active
)
select c.organization_id, c.id, source.slug, source.label, source.category, source.availability, source.drive_folder_id, true
from public.companies c
cross join (values
  ('masc-pronta-entrega', 'Masc. Pronta Entrega', 'masc', 'pronta_entrega', '1d-1geCZw4_K8AqwX3J1RlmkBIOA7OnIN'),
  ('masc-programacao', 'Masc. Programação', 'masc', 'programacao', '1yDaHnu-Niu4cSRANmVVlcaFMZuV63GwM'),
  ('fem-pronta-entrega', 'Fem. Pronta Entrega', 'fem', 'pronta_entrega', '1l-Yy6x3zvvLBydMvqKrs_x44sOUSPKgw'),
  ('fem-programacao', 'Fem. Programação', 'fem', 'programacao', '1-CKUHnLNpu0bYZgu8IRj7CWvO36B9gG3'),
  ('fem-promocao', 'Fem. Promoção', 'fem', 'promocao', '1f8BET1iBiAZe3QnbuIpfg-Nmixzy1NMN')
) as source(slug, label, category, availability, drive_folder_id)
where c.slug = 'beta-importadora'
on conflict (company_id, slug) do update set
  label = excluded.label,
  category = excluded.category,
  availability = excluded.availability,
  drive_folder_id = excluded.drive_folder_id,
  active = true;

-- Cadastros compartilhados pelo escritorio.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text,
  trade_name text not null,
  tax_id text,
  state_registration text,
  email text,
  phone text,
  contact_name text,
  address jsonb not null default '{}'::jsonb,
  credit_limit numeric(14,2),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text,
  trade_name text not null,
  tax_id text,
  state_registration text,
  email text,
  phone text,
  contact_name text,
  address jsonb not null default '{}'::jsonb,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text,
  trade_name text not null,
  tax_id text,
  state_registration text,
  email text,
  phone text,
  contact_name text,
  address jsonb not null default '{}'::jsonb,
  delivery_regions text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_representatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  document text,
  email text,
  phone text,
  commission_percent numeric(7,3),
  territory text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_org_idx on public.customers(organization_id);
create index if not exists suppliers_org_idx on public.suppliers(organization_id);
create index if not exists carriers_org_idx on public.carriers(organization_id);
create index if not exists sales_representatives_org_idx on public.sales_representatives(organization_id);

-- Views agora carregam a empresa para todo filtro e agrupamento.
drop function if exists public.search_stock(text);
drop view if exists public.v_stock_search;
drop view if exists public.v_source_health;
drop view if exists public.v_latest_stock_files;

create view public.v_latest_stock_files with (security_invoker = true) as
select distinct on (sf.source_id) sf.*
from public.stock_files sf
where sf.status in ('imported','empty')
order by sf.source_id, coalesce(sf.modified_at, sf.imported_at) desc, sf.imported_at desc;

create view public.v_stock_search with (security_invoker = true) as
select
  p.organization_id,
  p.company_id,
  c.trade_name as company_name,
  p.id as product_id,
  p.display_name as product_name,
  p.normalized_name,
  p.unit,
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
join public.companies c on c.id = p.company_id
join public.stock_sources s on s.id = si.source_id
join public.v_latest_stock_files sf on sf.id = si.file_id;

create view public.v_source_health with (security_invoker = true) as
select
  s.organization_id,
  s.company_id,
  c.trade_name as company_name,
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
join public.companies c on c.id = s.company_id
left join public.v_latest_stock_files lf on lf.source_id = s.id
order by c.trade_name, s.category, s.availability, s.label;

create function public.search_stock(q text default '', company_filter uuid default null)
returns table (
  company_id uuid, product_name text, source_label text, color_name text,
  process_code text, quantity_meters numeric, file_name text, imported_at timestamptz
)
language sql stable set search_path = public as $$
  select v.company_id, v.product_name, v.source_label, v.color_name,
    v.process_code, v.quantity_meters, v.file_name, v.imported_at
  from public.v_stock_search v
  where (company_filter is null or v.company_id = company_filter)
    and (coalesce(q,'') = ''
      or v.normalized_name ilike '%' || public.normalize_text(q) || '%'
      or v.normalized_color ilike '%' || public.normalize_text(q) || '%'
      or coalesce(v.process_code,'') ilike '%' || q || '%')
  order by v.product_name, v.source_label, v.color_name;
$$;

-- RLS multiempresa.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.companies enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.carriers enable row level security;
alter table public.sales_representatives enable row level security;

drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations for select to authenticated
using (private.is_org_member(id));
drop policy if exists organizations_owner_update on public.organizations;
create policy organizations_owner_update on public.organizations for update to authenticated
using (private.has_org_role(id, array['owner','admin']))
with check (private.has_org_role(id, array['owner','admin']));

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists members_org_select on public.organization_members;
create policy members_org_select on public.organization_members for select to authenticated
using (private.is_org_member(organization_id));
drop policy if exists members_admin_all on public.organization_members;
create policy members_admin_all on public.organization_members for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists invitations_admin_all on public.organization_invitations;
create policy invitations_admin_all on public.organization_invitations for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select to anon, authenticated
using (public_read or private.is_org_member(organization_id));
drop policy if exists companies_admin_all on public.companies;
create policy companies_admin_all on public.companies for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));

-- Substitui politicas publicas das tabelas ligadas a empresa.
do $$
declare t text;
begin
  foreach t in array array['stock_sources','stock_files','products','stock_items','import_runs','price_files','price_items','product_labels','showroom_updates','showroom_update_items']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists "read stock sources" on public.stock_sources;
drop policy if exists "read stock files" on public.stock_files;
drop policy if exists "read products" on public.products;
drop policy if exists "read stock items" on public.stock_items;
drop policy if exists "read import runs" on public.import_runs;
drop policy if exists "read price files" on public.price_files;
drop policy if exists "read price items" on public.price_items;
drop policy if exists "write price files" on public.price_files;
drop policy if exists "write price items" on public.price_items;
drop policy if exists "read product labels" on public.product_labels;
drop policy if exists "read showroom updates" on public.showroom_updates;
drop policy if exists "write showroom updates" on public.showroom_updates;
drop policy if exists "read showroom update items" on public.showroom_update_items;
drop policy if exists "write showroom update items" on public.showroom_update_items;

create policy stock_sources_company_read on public.stock_sources for select to anon, authenticated using (private.can_read_company(company_id));
create policy stock_files_company_read on public.stock_files for select to anon, authenticated using (private.can_read_company(company_id));
create policy products_company_read on public.products for select to anon, authenticated using (private.can_read_company(company_id));
create policy stock_items_company_read on public.stock_items for select to anon, authenticated using (private.can_read_company(company_id));
create policy price_files_company_read on public.price_files for select to anon, authenticated using (private.can_read_company(company_id));
create policy price_items_company_read on public.price_items for select to anon, authenticated using (private.can_read_company(company_id));
create policy labels_company_read on public.product_labels for select to anon, authenticated using (private.can_read_company(company_id));
create policy showroom_updates_company_read on public.showroom_updates for select to anon, authenticated using (private.can_read_company(company_id));
create policy showroom_items_company_read on public.showroom_update_items for select to anon, authenticated using (private.can_read_company(company_id));
create policy import_runs_company_read on public.import_runs for select to authenticated using (company_id is null or private.can_read_company(company_id));

create policy products_company_write on public.products for all to authenticated
using (private.can_manage_company(company_id)) with check (private.can_manage_company(company_id));
create policy stock_sources_company_write on public.stock_sources for all to authenticated
using (private.can_manage_company(company_id)) with check (private.can_manage_company(company_id));
create policy price_items_company_write on public.price_items for all to authenticated
using (private.can_manage_company(company_id)) with check (private.can_manage_company(company_id));
create policy showroom_updates_company_write on public.showroom_updates for insert to authenticated
with check (private.is_org_member(organization_id));
create policy showroom_items_company_write on public.showroom_update_items for insert to authenticated
with check (private.is_org_member(organization_id));

do $$
declare t text;
begin
  foreach t in array array['customers','suppliers','carriers','sales_representatives']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(organization_id))', t || '_member_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''sales''])) with check (private.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''sales'']))', t || '_member_write', t);
  end loop;
end $$;

revoke all on public.organizations, public.profiles, public.organization_members,
  public.organization_invitations, public.customers, public.suppliers,
  public.carriers, public.sales_representatives from anon;
grant select, update on public.organizations, public.profiles to authenticated;
grant select, insert, update, delete on public.organization_members,
  public.organization_invitations, public.companies, public.customers,
  public.suppliers, public.carriers, public.sales_representatives, public.products,
  public.stock_sources to authenticated;
grant select on public.companies to anon;
grant select on public.stock_sources, public.stock_files, public.products,
  public.stock_items, public.price_files, public.price_items, public.product_labels,
  public.showroom_updates, public.showroom_update_items,
  public.v_latest_stock_files, public.v_stock_search, public.v_source_health to anon, authenticated;
revoke insert, update, delete on public.price_files, public.price_items from anon;
grant select, insert, update, delete on public.price_items to authenticated;
grant select, insert on public.showroom_updates, public.showroom_update_items to authenticated;
grant execute on function public.search_stock(text, uuid) to anon, authenticated;
grant all on public.organizations, public.profiles, public.organization_members,
  public.organization_invitations, public.companies, public.customers,
  public.suppliers, public.carriers, public.sales_representatives to service_role;
