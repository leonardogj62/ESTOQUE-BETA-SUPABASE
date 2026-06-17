# Estoque Beta Supabase

Nova base do Estoque Beta com Supabase como banco central e importação separada dos arquivos do Google Drive.

## O que este projeto resolve

O app antigo lia Excel, PDF, Drive e Gmail diretamente no navegador. Isso deixava a busca frágil quando cada arquivo vinha em um layout diferente.

Nesta versão:

- o importador lê os arquivos do Drive;
- quando existir `.xlsx`, ele usa a planilha; quando a pasta tiver só PDF, ele usa o texto do PDF;
- os dados tratados são gravados no Supabase;
- a tela Buscar consulta o Supabase, não os arquivos brutos;
- cada pasta tem diagnóstico de arquivo, status, quantidade de produtos e erros.

## Estrutura

```text
ESTOQUE-BETA-SUPABASE/
  web/
    index.html
    styles.css
    app.js
  supabase/
    schema.sql
    seed_sources.sql
    functions/import-stock/index.ts
  docs/
```

## Passo 1: criar o banco

No painel do Supabase, crie um projeto novo e rode no SQL Editor:

1. `supabase/schema.sql`
2. `supabase/seed_sources.sql`

Isso cria:

- fontes de estoque;
- arquivos importados;
- produtos;
- itens de estoque;
- preços;
- etiquetas;
- logs de importação;
- views de busca e saúde.

Se preferir usar CLI, instale o Supabase CLI e use o roteiro em `scripts/deploy_supabase.example.sh`.

## Passo 2: configurar a função import-stock

A função espera estes secrets:

```text
ESTOQUE_SUPABASE_SECRET_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

O Supabase fornece `SUPABASE_URL` automaticamente para a função. Como o painel bloqueia nomes começando com `SUPABASE_`, salve a secret key administrativa como `ESTOQUE_SUPABASE_SECRET_KEY`.

Veja `docs/GOOGLE_REFRESH_TOKEN.md` para gerar o refresh token.

No Supabase CLI, o comando fica assim:

```bash
supabase secrets set ESTOQUE_SUPABASE_SECRET_KEY="SUA_SECRET_KEY"
supabase secrets set GOOGLE_CLIENT_ID="SEU_GOOGLE_CLIENT_ID"
supabase secrets set GOOGLE_CLIENT_SECRET="SEU_GOOGLE_CLIENT_SECRET"
supabase secrets set GOOGLE_REFRESH_TOKEN="SEU_REFRESH_TOKEN"
```

Depois publique:

```bash
supabase functions deploy import-stock
```

## Passo 3: configurar o app web

Abra `web/app.js` e troque:

```js
supabaseUrl: "COLE_AQUI_SUPABASE_URL",
supabaseAnonKey: "COLE_AQUI_SUPABASE_ANON_KEY",
importFunctionUrl: "COLE_AQUI_FUNCTION_URL/import-stock",
```

Exemplo:

```js
supabaseUrl: "https://abc123.supabase.co",
supabaseAnonKey: "ey...",
importFunctionUrl: "https://abc123.functions.supabase.co/import-stock",
```

## Como testar

1. Abra `web/index.html`.
2. Confirme que aparecem os cards de saúde dos estoques.
3. Clique em **Importar Drive**.
4. Veja se cada pasta mostra quantidade maior que zero.
5. Busque por produto, cor ou processo.

Observação: a pasta `Fem. Promoção` hoje tem apenas PDFs. Ela foi tratada como caso especial pelo importador, então não precisa mais existir uma planilha para aparecer na busca.

## Próximas fases recomendadas

1. Importar tabela de preços para `price_items`.
2. Importar etiquetas OCR para `product_labels`.
3. Criar comparação entre snapshots por `stock_files`.
4. Agendar a função `import-stock` por cron.
5. Publicar o app web no GitHub Pages ou Vercel.
