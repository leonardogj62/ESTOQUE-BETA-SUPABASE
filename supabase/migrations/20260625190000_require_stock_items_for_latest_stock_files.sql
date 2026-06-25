-- Evita que um upload marcado como importado, mas sem linhas gravadas,
-- substitua o estoque válido anterior na busca do app.

drop view if exists public.v_stock_search;
drop view if exists public.v_source_health;
drop view if exists public.v_latest_stock_files;

create view public.v_latest_stock_files with (security_invoker = true) as
select distinct on (sf.source_id)
  sf.id,
  sf.source_id,
  sf.drive_file_id,
  sf.file_name,
  sf.mime_type,
  sf.modified_at,
  sf.imported_at,
  sf.status,
  sf.error_message,
  sf.product_count,
  sf.color_count,
  sf.raw_meta,
  sf.organization_id,
  sf.company_id
from public.stock_files sf
where sf.status = 'imported'
  and exists (
    select 1
    from public.stock_items si
    where si.file_id = sf.id
  )
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

grant select on public.v_latest_stock_files, public.v_stock_search, public.v_source_health to anon, authenticated;
