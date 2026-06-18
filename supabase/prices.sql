-- Migração: tabela de preços com moedas, comissões variadas e cadastro manual.
-- Aplicar no Supabase Studio ou via MCP/CLI para bancos já existentes.

alter table public.price_items
  add column if not exists currency text not null default 'BRL',
  add column if not exists commission_prices jsonb not null default '{}'::jsonb,
  add column if not exists source_type text not null default 'drive',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_items_currency_check'
      and conrelid = 'public.price_items'::regclass
  ) then
    alter table public.price_items
      add constraint price_items_currency_check check (currency in ('BRL','USD'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_items_source_type_check'
      and conrelid = 'public.price_items'::regclass
  ) then
    alter table public.price_items
      add constraint price_items_source_type_check check (source_type in ('drive','manual'));
  end if;
end $$;

create index if not exists price_items_normalized_idx on public.price_items(normalized_name);
create index if not exists price_items_currency_idx on public.price_items(currency);
create unique index if not exists price_items_manual_unique
  on public.price_items(normalized_name, currency)
  where source_type = 'manual';

alter table public.price_files enable row level security;
alter table public.price_items enable row level security;

drop policy if exists "read price files" on public.price_files;
drop policy if exists "read price items" on public.price_items;
drop policy if exists "write price files" on public.price_files;
drop policy if exists "write price items" on public.price_items;

create policy "read price files" on public.price_files for select using (true);
create policy "read price items" on public.price_items for select using (true);
create policy "write price files" on public.price_files for all using (true) with check (true);
create policy "write price items" on public.price_items for all using (true) with check (true);

grant select, insert, update, delete on public.price_files to anon, authenticated;
grant select, insert, update, delete on public.price_items to anon, authenticated;
grant all on public.price_files to service_role;
grant all on public.price_items to service_role;
