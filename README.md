# Gestão Comercial Multiempresa

Nova base do Estoque Beta com Supabase como banco central e importação separada dos arquivos do Google Drive.

Desde a versão `v0.2`, o projeto é multiempresa. A Beta Importadora continua com todos os dados anteriores e novas empresas podem ser cadastradas sem misturar produtos, estoque, preços, etiquetas ou mostruário.

## Estrutura multiempresa

- `organizations`: o escritório de representação que utiliza o sistema;
- `companies`: as empresas representadas, como a Beta Importadora;
- `organization_members`: usuários e funções de acesso;
- cada produto, fonte, estoque, preço, etiqueta, importação e atualização de mostruário possui empresa;
- clientes, fornecedores, transportadoras e vendedores pertencem ao escritório e podem ser usados em futuras vendas e pedidos;
- a Beta permite consulta pública, mas importações e alterações exigem acesso administrativo.

O cabeçalho do app possui um seletor de empresa. A área **Cadastros** contém empresas, produtos, clientes, fornecedores, transportadoras e vendedores.

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
2. os arquivos de `supabase/migrations/`, em ordem
3. `supabase/seed_sources.sql`

Isso cria:

- fontes de estoque;
- arquivos importados;
- produtos;
- itens de estoque;
- preços;
- etiquetas;
- logs de importação;
- views de busca e saúde.

No primeiro acesso administrativo, use o e-mail convidado na migração multiempresa e clique em **Criar acesso**. Depois da confirmação do e-mail, esse usuário recebe a função de proprietário do escritório.

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

1. Cadastro de pedidos e itens de pedido.
2. Relacionamento entre clientes, vendedores e empresas representadas.
3. Agenda comercial e histórico de contatos.
4. Contas a receber, comissões e relatórios.
5. Agendar a função `import-stock` por cron.

## Etiquetas dos produtos

O botão **Importar Etiquetas** lê recursivamente esta pasta do Drive:

```text
11msFrrRee3JfCMrl_-Ys64-UyYeV3LOt
```

As fotos renomeadas no padrão `BETA - PRODUTO - REF 0000.jpeg` entram em `product_labels`.
Também foram carregadas as linhas da planilha `ETIQUETAS BETA FEMININO.xlsx`, que preenchem referência, largura, gramatura, composição e modos de lavagem.
No card de cada produto, o app mostra esses dados técnicos no cabeçalho; ao abrir o card, aparecem os detalhes e o link **Ver foto** quando a etiqueta veio de imagem.

Os modos de lavagem ficam salvos em `washing_instructions` e são exibidos como ícones compactos no card.

Para sobrescrever a pasta padrão, configure este secret na Edge Function:

```text
LABEL_DRIVE_FOLDER_ID
```

## Tabela de preços

A aba **Preços** permite:

- importar a tabela do Drive pela Edge Function;
- inserir preços manualmente;
- escolher moeda em R$ ou U$;
- registrar comissões variadas, uma por linha, como `0% = 19,90`;
- visualizar preços com duas casas decimais, como `R$ 19,90`.

Por padrão, a importação automática usa esta pasta do Drive:

```text
1TLFeg3czJkesCOwFl7qMnTUB2B14xLKO
```

Para sobrescrever, configure pelo menos um destes secrets na Edge Function:

```text
PRICE_DRIVE_FILE_ID
PRICE_DRIVE_FOLDER_ID
```
