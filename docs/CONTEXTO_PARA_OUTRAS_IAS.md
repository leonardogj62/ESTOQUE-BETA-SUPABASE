# Contexto do App Estoque Beta Supabase

Este arquivo existe para dar contexto a outra IA ou desenvolvedor que precise continuar o projeto sem desfazer o que ja esta funcionando.

## Resumo rapido

Este projeto e uma nova versao do Estoque Beta usando Supabase como banco central. O objetivo e evitar que o navegador precise ler diretamente arquivos do Google Drive. Agora a importacao roda em uma Edge Function do Supabase, grava tudo no banco e a tela web consulta as views do Supabase.

Repositorio local:

```text
/Users/leonardomacbook/Documents/New project/ESTOQUE-BETA-SUPABASE
```

Repositorio GitHub:

```text
https://github.com/leonardogj62/ESTOQUE-BETA-SUPABASE
```

Projeto Supabase:

```text
https://jqffpijcrzflojahbfyp.supabase.co
```

App local testado:

```text
http://127.0.0.1:8010/
```

Possivel link GitHub Pages, depois de ativar Pages no GitHub:

```text
https://leonardogj62.github.io/ESTOQUE-BETA-SUPABASE/web/
```

## Estado atual funcionando

Em 18/06/2026, o app foi testado com sucesso pelo navegador local e pelo Supabase.

Resultado validado:

```text
Fem. Programacao:       47 produtos, 693 cores
Fem. Promocao:          55 produtos, 356 cores
Fem. Pronta Entrega:   148 produtos, 3556 cores
Masc. Programacao:       2 produtos, 55 cores
Masc. Pronta Entrega:   12 produtos, 190 cores
Total na busca:       4850 cores
```

A busca foi testada com:

```text
Filtro: Fem. Promocao
Busca: castanho
Resultado esperado: ALFAIATARIA CETIM ALEXIS / CASTANHO / Fem. Promocao / 32 m
```

## Commits importantes

Ultimos commits relevantes:

```text
af8f34b Corrige importacao completa dos estoques
fe6cf94 Corrige importacao de planilhas de estoque
b8e91bd Concede permissoes de importacao ao service role
e099242 Mostra erros de importacao legiveis
e0571e5 Carrega app sem module em arquivo local
feab682 Permite abrir app direto por arquivo
```

O commit principal da solucao atual e:

```text
af8f34b Corrige importacao completa dos estoques
```

Esse commit foi enviado para o GitHub com sucesso.

## Arquivos principais

```text
web/index.html
web/styles.css
web/app.js
supabase/schema.sql
supabase/seed_sources.sql
supabase/functions/import-stock/index.ts
docs/GOOGLE_REFRESH_TOKEN.md
docs/IMPLANTACAO.md
```

## Como a arquitetura funciona

O fluxo correto e:

```text
Google Drive -> Supabase Edge Function import-stock -> tabelas Supabase -> views -> web/app.js -> tela Buscar
```

Nao voltar a fazer a tela web ler os arquivos do Google Drive diretamente. Isso foi justamente o problema da versao antiga.

## Supabase

Edge Function:

```text
import-stock
```

Versao ativa testada:

```text
15
```

Configuracao atual da funcao:

```text
verify_jwt = false
```

Isso foi mantido porque o app web chama a funcao diretamente. Nao mudar sem tambem ajustar autenticacao no front-end.

Secrets esperados na Edge Function:

```text
ESTOQUE_SUPABASE_SECRET_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

Nao colocar valores desses secrets no codigo, no README ou neste arquivo. Eles devem ficar apenas nos Secrets do Supabase.

Observacao importante: o Supabase nao aceitou secret com nome `SUPABASE_SERVICE_ROLE_KEY`, porque nomes iniciados com `SUPABASE_` sao bloqueados no painel. Por isso o app usa:

```text
ESTOQUE_SUPABASE_SECRET_KEY
```

## Banco de dados

As tabelas/views principais estao em:

```text
supabase/schema.sql
```

Principais tabelas:

```text
stock_sources
stock_files
products
stock_items
import_runs
price_items
product_labels
```

Principais views:

```text
v_source_health
v_stock_search
```

A tela usa:

```text
v_source_health
v_stock_search
```

Para validar os numeros no Supabase, usar:

```sql
select s.label, sf.status, sf.product_count, sf.color_count, sf.error_message, sf.imported_at
from public.stock_sources s
left join lateral (
  select * from public.stock_files f
  where f.source_id = s.id
  order by f.imported_at desc
  limit 1
) sf on true
order by s.label;
```

E:

```sql
select source_label, count(*) as search_rows
from public.v_stock_search
group by source_label
order by source_label;
```

## Google Drive e formatos

As cinco fontes configuradas ficam em:

```text
supabase/seed_sources.sql
```

O comportamento correto do importador:

- se existir planilha `.xlsx`, usar a planilha;
- se a pasta tiver apenas PDF, usar o PDF;
- ordenar por data do nome do arquivo, como `17.06.26`;
- preferir planilha quando houver planilha e PDF da mesma data;
- registrar erro legivel em `stock_files.error_message` quando algo falhar.

Importante: a fonte `Fem. Promocao` estava em PDF, nao em planilha. Esse foi um dos principais motivos de ela nao aparecer antes.

## O problema que foi corrigido

Problema original:

```text
A busca so mostrava Pronta Entrega Masculina ou nao mostrava as outras abas corretamente.
```

Depois, no app Supabase, as planilhas entraram, mas:

```text
Fem. Promocao nao aparecia porque era PDF.
```

Depois de configurar o Google Refresh Token com permissao completa de Drive, o PDF passou a ser encontrado, mas:

```text
O parser antigo esperava "Cor" e quantidade na mesma linha.
```

O PDF real vinha assim:

```text
Cor : CASTANHO (1 item)
32,000
```

Por isso `parsePdfText` foi ajustado para guardar a cor pendente e ler a quantidade na linha seguinte.

## Correcoes implementadas no importador

Arquivo:

```text
supabase/functions/import-stock/index.ts
```

O que foi corrigido:

- `parsePdfText` agora entende quantidade em linha separada no PDF.
- A funcao aceita `source_slug` no corpo da requisicao para importar uma fonte por vez.
- `upsertItems` insere itens em blocos de 500, evitando falhas com envios grandes.
- A importacao continua gravando status, contagem e erros em `stock_files`.

Nao remover a logica de fallback de PDF via Google Drive conversion. Ela e necessaria porque o `pdfjs` pode falhar na Edge Function com erro de worker.

## Correcoes implementadas no front-end

Arquivo:

```text
web/app.js
```

O que foi corrigido:

- A tela agora carrega todas as paginas de `v_stock_search`, nao apenas os primeiros 1000 registros.
- A funcao `supabaseSelectAll` usa ranges de 1000 em 1000.
- O botao **Importar Drive** chama a Edge Function uma fonte por vez.
- A tela atualiza os cards de saude depois de cada fonte importada.

Nao voltar para uma unica chamada importando tudo de uma vez; isso causou erro de limite de processamento no Supabase.

## Erros conhecidos ja resolvidos

### redirect_uri_mismatch

Esse erro apareceu ao gerar/usar OAuth do Google. Para OAuth Playground, o redirect URI autorizado precisa incluir:

```text
https://developers.google.com/oauthplayground
```

### invalid_client

Esse erro apareceu quando Client ID ou Client Secret estavam errados no Supabase Secrets.

### ACCESS_TOKEN_SCOPE_INSUFFICIENT

Esse erro apareceu quando o refresh token do Google tinha permissao insuficiente. O token correto precisa do escopo:

```text
https://www.googleapis.com/auth/drive
```

Isso e necessario porque a funcao cria temporariamente um Google Doc para extrair texto do PDF e depois apaga esse arquivo temporario.

### WORKER_RESOURCE_LIMIT

Esse erro apareceu quando tentamos importar tudo em uma unica chamada. A solucao foi importar uma fonte por vez pelo front-end.

### A busca mostrava so 1000 cores

Isso era limite padrao da API REST do Supabase. A solucao foi paginar a leitura em `web/app.js`.

## Como rodar localmente

Na pasta:

```text
/Users/leonardomacbook/Documents/New project/ESTOQUE-BETA-SUPABASE/web
```

Rodar:

```bash
python3 -m http.server 8010
```

Abrir:

```text
http://127.0.0.1:8010/
```

## Como publicar no GitHub

Repositorio remoto configurado:

```text
origin https://github.com/leonardogj62/ESTOQUE-BETA-SUPABASE.git
```

Para enviar commits:

```bash
cd "/Users/leonardomacbook/Documents/New project/ESTOQUE-BETA-SUPABASE"
git status
git add .
git commit -m "Mensagem do commit"
git push origin main
```

## Como ativar GitHub Pages

No GitHub:

```text
Settings -> Pages -> Branch: main -> Folder: /root -> Save
```

Depois acessar:

```text
https://leonardogj62.github.io/ESTOQUE-BETA-SUPABASE/web/
```

Se o repositorio estiver privado, GitHub Pages pode exigir conta paga. Para usar Pages gratis, deixar o repositorio publico.

## Cuidados para outra IA

Antes de mexer, conferir:

```bash
git status --short --branch
```

Nao expor secrets.

Nao colocar `service_role`, refresh token, client secret ou qualquer chave sensivel dentro de `web/app.js`.

Nao trocar `ESTOQUE_SUPABASE_SECRET_KEY` por `SUPABASE_SERVICE_ROLE_KEY` no painel do Supabase, pois o painel bloqueia nomes com prefixo `SUPABASE_`.

Nao remover a paginacao da busca. Sem ela, a tela volta a mostrar so 1000 cores.

Nao importar todos os estoques em uma unica chamada pelo front-end. Isso pode causar limite de processamento na Edge Function.

Nao assumir que todas as pastas do Drive tem planilha. `Fem. Promocao` e PDF.

Nao assumir que o PDF tem cor e quantidade na mesma linha. No PDF real, a quantidade pode vir na linha seguinte.

Nao mudar os IDs das fontes em `seed_sources.sql` sem validar as pastas reais no Google Drive.

Depois de qualquer alteracao, validar no app e no banco.

## Checklist de validacao

Depois de mexer, o esperado e:

```text
Todos os 5 cards de saude com status imported.
Busca total com 4850 cores ou mais, dependendo dos arquivos novos do Drive.
Fem. Promocao com produtos e cores, nao zero.
Filtro Fem. Promocao funcionando.
Busca por castanho mostrando resultado da promocao.
```

Consultas de validacao:

```sql
select source_label, count(*) as search_rows
from public.v_stock_search
group by source_label
order by source_label;
```

```sql
select s.label, sf.status, sf.product_count, sf.color_count, sf.error_message, sf.imported_at
from public.stock_sources s
left join lateral (
  select * from public.stock_files f
  where f.source_id = s.id
  order by f.imported_at desc
  limit 1
) sf on true
order by s.label;
```

## Proximos passos ainda nao feitos

Ainda nao foi implementado:

- importacao da tabela de precos para `price_items`;
- importacao de etiquetas/OCR para `product_labels`;
- comparacao historica entre importacoes;
- agendamento automatico por cron;
- tela administrativa de diagnostico mais completa.

O app de busca de estoque ja esta funcionando.

## Funcionalidade: Mostruario fisico

Em 18/06/2026 foi adicionada a aba:

```text
Mostruario
```

Objetivo:

```text
Registrar cada atualizacao fisica do mostruario de tecidos e comparar o estoque atual com a ultima atualizacao registrada para os mesmos produtos/cores/fontes.
```

Arquivos alterados:

```text
web/index.html
web/styles.css
web/app.js
supabase/schema.sql
supabase/showroom.sql
```

Tabelas novas:

```text
showroom_updates
showroom_update_items
```

Fluxo no app:

```text
1. Abrir a aba Mostruario.
2. Clicar em Atualizar Mostruario.
3. Selecionar os produtos atualizados fisicamente.
4. Confirmar.
5. O app salva uma foto do estoque atual desses produtos.
6. O app compara com a atualizacao anterior que tiver os mesmos produtos/cores/fontes.
7. O historico fica salvo para consulta.
```

Observacoes tecnicas importantes:

- a selecao e feita por produto;
- ao salvar, o app registra todas as cores/fontes daquele produto que estao em `v_stock_search`;
- a comparacao nao usa somente a atualizacao imediatamente anterior; ela procura a ultima ocorrencia anterior de cada produto + fonte + cor;
- se nao existir base anterior para os itens selecionados, o primeiro registro vira a base da proxima comparacao;
- as tabelas tem leitura e insercao liberadas para `anon`, seguindo o padrao atual do app sem login.

Para aplicar o banco em outro projeto, rodar:

```text
supabase/showroom.sql
```

Ou rodar o schema completo:

```text
supabase/schema.sql
```

## Interface da Busca

Em 18/06/2026 a tela de Busca foi ajustada para nao iniciar com todas as cores abertas.

Comportamento esperado:

```text
1. Ao abrir o app, cada produto aparece como uma faixa fechada.
2. A faixa mostra nome do produto, quantidade de cores, metragem total e etiquetas das fontes.
3. No fim da faixa existe uma seta para baixo.
4. Ao clicar na faixa/seta, o produto abre e mostra as cores.
5. O botao Abrir todos abre todos os produtos visiveis no filtro atual.
6. Quando tudo esta aberto, o mesmo botao vira Fechar todos.
7. O botao Separar por processo muda o agrupamento para produto + processo.
8. Nesse modo, um produto com varios processos aparece em blocos separados, por exemplo:
   ALFAIATARIA CETIM ALEXIS / Processo AT-25042
   ALFAIATARIA CETIM ALEXIS / Processo AT-24096
```

Arquivos principais dessa interface:

```text
web/index.html
web/styles.css
web/app.js
```

Cuidados:

- nao voltar a renderizar todas as cores abertas por padrao;
- manter o botao de abrir/fechar atuando apenas no resultado filtrado atual;
- ao filtrar por fonte ou texto, a busca deve voltar fechada por padrao;
- ao ativar Separar por processo, a busca tambem deve voltar fechada por padrao;
- a busca por texto continua procurando produto, cor e processo.
- produtos com nome contendo `malha` ou `malhas` devem mostrar quantidade em `kg`, nao em `m`.

## Tabela de Precos

Em 18/06/2026 foi iniciada a implementacao da tabela de precos.

Comportamento esperado:

```text
1. Existe uma aba Precos.
2. A aba permite importar a tabela de precos do Drive.
3. A aba permite inserir preco manualmente.
4. O preco manual aceita moeda BRL/R$ e USD/U$.
5. Valores devem aparecer com duas casas decimais, exemplo: R$ 19,90 ou U$ 19,90.
6. Comissoes variadas sao guardadas em JSON no campo commission_prices.
7. A Busca mostra um resumo de preco no produto quando existe preco cadastrado.
```

Banco:

```text
price_files
price_items
```

Campos importantes adicionados em `price_items`:

```text
currency
commission_prices
source_type
updated_at
```

Arquivo de migracao separado:

```text
supabase/prices.sql
```

Edge Function:

```text
supabase/functions/import-stock/index.ts
```

A funcao aceita:

```json
{ "action": "import_prices" }
```

Secrets opcionais para importacao automatica:

```text
PRICE_DRIVE_FILE_ID
PRICE_DRIVE_FOLDER_ID
```

Use `PRICE_DRIVE_FILE_ID` para apontar diretamente para a planilha de precos. Use `PRICE_DRIVE_FOLDER_ID` para pegar a planilha mais recente dentro de uma pasta.

Observacao importante:

```text
O banco ja pode receber precos manuais depois de aplicar supabase/prices.sql.
A importacao automatica pelo botao Importar Precos depende de publicar novamente a Edge Function import-stock no Supabase.
```
