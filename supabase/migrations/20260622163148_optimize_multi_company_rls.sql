-- Indices usados pelas politicas e pelas consultas multiempresa.
create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists import_runs_org_idx on public.import_runs(organization_id);
create index if not exists import_runs_company_idx on public.import_runs(company_id);
create index if not exists price_files_org_idx on public.price_files(organization_id);
create index if not exists price_files_company_idx on public.price_files(company_id);
create index if not exists price_items_org_idx on public.price_items(organization_id);
create index if not exists product_labels_org_idx on public.product_labels(organization_id);
create index if not exists products_org_idx on public.products(organization_id);
create index if not exists showroom_items_org_idx on public.showroom_update_items(organization_id);
create index if not exists showroom_items_company_idx on public.showroom_update_items(company_id);
create index if not exists showroom_updates_org_idx on public.showroom_updates(organization_id);
create index if not exists showroom_updates_company_idx on public.showroom_updates(company_id);
create index if not exists stock_files_org_idx on public.stock_files(organization_id);
create index if not exists stock_items_org_idx on public.stock_items(organization_id);
create index if not exists stock_sources_org_idx on public.stock_sources(organization_id);

-- Separa leitura e escrita para evitar politicas permissivas duplicadas no SELECT.
drop policy if exists companies_admin_all on public.companies;
create policy companies_admin_insert on public.companies for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']));
create policy companies_admin_update on public.companies for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));
create policy companies_admin_delete on public.companies for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists members_admin_all on public.organization_members;
create policy members_admin_insert on public.organization_members for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']));
create policy members_admin_update on public.organization_members for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));
create policy members_admin_delete on public.organization_members for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists products_company_write on public.products;
create policy products_company_insert on public.products for insert to authenticated
with check (private.can_manage_company(company_id));
create policy products_company_update on public.products for update to authenticated
using (private.can_manage_company(company_id)) with check (private.can_manage_company(company_id));
create policy products_company_delete on public.products for delete to authenticated
using (private.can_manage_company(company_id));

drop policy if exists price_items_company_write on public.price_items;
create policy price_items_company_insert on public.price_items for insert to authenticated
with check (private.can_manage_company(company_id));
create policy price_items_company_update on public.price_items for update to authenticated
using (private.can_manage_company(company_id)) with check (private.can_manage_company(company_id));
create policy price_items_company_delete on public.price_items for delete to authenticated
using (private.can_manage_company(company_id));

drop policy if exists stock_sources_company_write on public.stock_sources;
create policy stock_sources_company_insert on public.stock_sources for insert to authenticated
with check (private.can_manage_company(company_id));
create policy stock_sources_company_update on public.stock_sources for update to authenticated
using (private.can_manage_company(company_id)) with check (private.can_manage_company(company_id));
create policy stock_sources_company_delete on public.stock_sources for delete to authenticated
using (private.can_manage_company(company_id));

do $$
declare t text;
begin
  foreach t in array array['customers','suppliers','carriers','sales_representatives']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_member_write', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''sales'']))', t || '_member_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''sales''])) with check (private.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''sales'']))', t || '_member_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''sales'']))', t || '_member_delete', t);
  end loop;
end $$;

-- A consulta publica enxerga somente os campos necessarios ao seletor.
revoke select on public.companies from anon;
grant select (id, trade_name, slug, public_read, active) on public.companies to anon;
