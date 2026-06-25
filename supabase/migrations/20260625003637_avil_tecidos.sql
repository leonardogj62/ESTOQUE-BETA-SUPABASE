-- AVIL TECIDOS: empresa nova com upload direto de PDF (sem Drive)
-- Duas fontes: AVIL Tecidos (MT) e AVIL Malhas (KG)

-- Permite fontes sem pasta no Drive (AVIL usa upload manual)
ALTER TABLE public.stock_sources ALTER COLUMN drive_folder_id DROP NOT NULL;

-- Adiciona categorias e disponibilidades para AVIL
ALTER TABLE public.stock_sources
  DROP CONSTRAINT IF EXISTS stock_sources_category_check;
ALTER TABLE public.stock_sources
  ADD CONSTRAINT stock_sources_category_check
  CHECK (category IN ('masc','fem','avil'));

ALTER TABLE public.stock_sources
  DROP CONSTRAINT IF EXISTS stock_sources_availability_check;
ALTER TABLE public.stock_sources
  ADD CONSTRAINT stock_sources_availability_check
  CHECK (availability IN ('pronta_entrega','programacao','promocao','avil'));

-- Cria empresa AVIL TECIDOS ligada ao escritorio principal
INSERT INTO public.companies (
  organization_id, trade_name, legal_name, slug,
  notes, public_read, active
)
SELECT
  o.id,
  'AVIL TECIDOS',
  'AVIL TECIDOS LTDA',
  'avil-tecidos',
  'Estoque importado via PDF enviado pelo WhatsApp',
  false,
  true
FROM public.organizations o
WHERE o.slug = 'escritorio-principal'
ON CONFLICT (organization_id, slug) DO UPDATE SET
  trade_name = EXCLUDED.trade_name,
  active     = true;

-- Fontes: AVIL Tecidos (metragem) e AVIL Malhas (quilos)
INSERT INTO public.stock_sources (
  organization_id, company_id, slug, label,
  category, availability, drive_folder_id, active
)
SELECT
  c.organization_id, c.id,
  source.slug, source.label,
  'avil', 'avil', NULL, true
FROM public.companies c
CROSS JOIN (VALUES
  ('avil-tecidos-estoque', 'AVIL Tecidos'),
  ('avil-malhas-estoque',  'AVIL Malhas')
) AS source(slug, label)
WHERE c.slug = 'avil-tecidos'
ON CONFLICT (company_id, slug) DO UPDATE SET
  label    = EXCLUDED.label,
  active   = true;

-- Bucket no Supabase Storage para guardar os PDFs originais
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avil-stock-pdfs',
  'avil-stock-pdfs',
  false,
  15728640,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS do bucket: usuário autenticado pode fazer upload; service_role acessa tudo
DROP POLICY IF EXISTS "avil pdfs upload" ON storage.objects;
CREATE POLICY "avil pdfs upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avil-stock-pdfs');

DROP POLICY IF EXISTS "avil pdfs select" ON storage.objects;
CREATE POLICY "avil pdfs select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avil-stock-pdfs');
