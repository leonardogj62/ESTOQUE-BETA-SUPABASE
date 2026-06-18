-- Migração: tabelas de mostruário físico
-- Aplicar no Supabase Studio ou via CLI para banco já existente.
-- O schema.sql completo também inclui estas definições.

create table if not exists public.showroom_updates (
  id         bigint generated always as identity primary key,
  updated_at timestamptz not null default now(),
  note       text
);

create table if not exists public.showroom_update_items (
  id               bigint generated always as identity primary key,
  update_id        bigint not null references public.showroom_updates(id) on delete cascade,
  product_name     text not null,
  source_label     text not null,
  color            text,
  quantity_at_time numeric
);

-- Índice único com coalesce para tratar color = NULL corretamente
create unique index if not exists showroom_update_items_unique
  on public.showroom_update_items(update_id, product_name, source_label, coalesce(color, ''));

create index if not exists showroom_update_items_update_idx
  on public.showroom_update_items(update_id);

create index if not exists showroom_update_items_lookup_idx
  on public.showroom_update_items(product_name, source_label, coalesce(color, ''), update_id desc);

alter table public.showroom_updates      enable row level security;
alter table public.showroom_update_items enable row level security;

drop policy if exists "read showroom updates"        on public.showroom_updates;
drop policy if exists "write showroom updates"       on public.showroom_updates;
drop policy if exists "read showroom update items"   on public.showroom_update_items;
drop policy if exists "write showroom update items"  on public.showroom_update_items;

create policy "read showroom updates"
  on public.showroom_updates for select using (true);

create policy "write showroom updates"
  on public.showroom_updates for insert with check (true);

create policy "read showroom update items"
  on public.showroom_update_items for select using (true);

create policy "write showroom update items"
  on public.showroom_update_items for insert with check (true);

grant select, insert on public.showroom_updates      to anon, authenticated;
grant select, insert on public.showroom_update_items to anon, authenticated;
grant all            on public.showroom_updates      to service_role;
grant all            on public.showroom_update_items to service_role;

-- Sequences dos identity columns
grant usage on sequence public.showroom_updates_id_seq        to anon, authenticated;
grant usage on sequence public.showroom_update_items_id_seq   to anon, authenticated;
