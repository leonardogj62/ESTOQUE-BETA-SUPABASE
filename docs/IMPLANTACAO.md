# Checklist de Implantação

## Supabase

- [ ] Criar projeto no Supabase.
- [ ] Rodar `supabase/schema.sql`.
- [ ] Rodar `supabase/seed_sources.sql`.
- [ ] Copiar `Project URL`.
- [ ] Copiar `anon public key`.

## Google OAuth

- [ ] Criar ou reutilizar OAuth Client no Google Cloud.
- [ ] Garantir escopos:
  - `https://www.googleapis.com/auth/drive.readonly`
  - `https://www.googleapis.com/auth/gmail.readonly` quando entrar importação de preços por email.
- [ ] Gerar `GOOGLE_REFRESH_TOKEN` para a conta que acessa as pastas.
- [ ] Salvar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REFRESH_TOKEN` como secrets da função.
- [ ] Nao criar secret com nome `SUPABASE_`; o Supabase reserva esse prefixo e fornece esses valores automaticamente.

## Importação

- [ ] Deploy da função `import-stock`.
- [ ] Rodar importação manual.
- [ ] Verificar `v_source_health`.
- [ ] Conferir se cada fonte tem `product_count > 0`.
- [ ] Conferir se `Fem. Promoção` importou pelo PDF mais recente.
- [ ] Se alguma fonte vier zero, baixar o arquivo citado no diagnóstico e ajustar o parser.

## App Web

- [ ] Preencher `web/app.js` com URL e anon key.
- [ ] Abrir `web/index.html`.
- [ ] Validar busca por produto.
- [ ] Validar busca por cor.
- [ ] Validar busca por processo.
- [ ] Validar filtro por cada tipo de estoque.

## Publicação

- [ ] Escolher hospedagem: GitHub Pages, Vercel ou Supabase Hosting.
- [ ] Configurar URL final.
- [ ] Testar no celular.
- [ ] Agendar importação automática.
