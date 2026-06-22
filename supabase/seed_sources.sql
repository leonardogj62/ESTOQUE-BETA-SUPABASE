insert into public.stock_sources (organization_id, company_id, slug, label, category, availability, drive_folder_id)
select c.organization_id, c.id, source.slug, source.label, source.category, source.availability, source.drive_folder_id
from public.companies c
cross join (values
  ('masc-pronta-entrega', 'Masc. Pronta Entrega', 'masc', 'pronta_entrega', '1d-1geCZw4_K8AqwX3J1RlmkBIOA7OnIN'),
  ('masc-programacao', 'Masc. Programação', 'masc', 'programacao', '1yDaHnu-Niu4cSRANmVVlcaFMZuV63GwM'),
  ('fem-pronta-entrega', 'Fem. Pronta Entrega', 'fem', 'pronta_entrega', '1l-Yy6x3zvvLBydMvqKrs_x44sOUSPKgw'),
  ('fem-programacao', 'Fem. Programação', 'fem', 'programacao', '1-CKUHnLNpu0bYZgu8IRj7CWvO36B9gG3'),
  ('fem-promocao', 'Fem. Promoção', 'fem', 'promocao', '1f8BET1iBiAZe3QnbuIpfg-Nmixzy1NMN')
) as source(slug, label, category, availability, drive_folder_id)
where c.slug = 'beta-importadora'
on conflict (company_id, slug) do update
set
  label = excluded.label,
  category = excluded.category,
  availability = excluded.availability,
  drive_folder_id = excluded.drive_folder_id,
  active = true;
