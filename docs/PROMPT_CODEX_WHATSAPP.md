# Prompt para continuar o projeto Secretaria WhatsApp no Codex

Cole este prompt inteiro no Codex para continuar o desenvolvimento do projeto.

---

## PROMPT

Você vai continuar o desenvolvimento de um sistema de automação de WhatsApp chamado **Secretaria WhatsApp**, que usa Supabase como backend central. Vou te passar todo o contexto do que foi feito e do estado atual do sistema.

---

## Visão geral

Sistema de automação para um **escritório de representação comercial têxtil**. Recebe mensagens de WhatsApp, armazena no banco, classifica automaticamente por IA (categoria, prioridade, resumo) e armazena mídias (imagens, áudios, PDFs) no Supabase Storage.

**Projeto Supabase:** `npngojdiitcafndliatn`  
**URL:** `https://npngojdiitcafndliatn.supabase.co`

---

## Arquitetura atual (funcionando)

```
WhatsApp → n8n (Docker local) → Supabase (wa_messages)
                                        ↓
                               pg_cron (a cada 2 min)
                                        ↓
                         Edge Function: classify-messages
                                        ↓
                       Tenta Gemini → falha → usa Groq
                                        ↓
                          wa_messages atualizado (completed)
```

### Componentes em produção

| Componente | Status | Descrição |
|---|---|---|
| **n8n (Docker local)** | ✅ rodando | Recebe webhook WhatsApp via Cloudflare Tunnel, salva em `wa_messages` |
| **Cloudflare Tunnel** | ✅ rodando | Expõe o n8n para receber webhooks do WhatsApp |
| **Supabase PostgreSQL** | ✅ ativo | Banco central com todas as tabelas |
| **pg_cron** | ✅ ativo | Chama `classify-messages` a cada 2 minutos via `pg_net` |
| **pg_net** | ✅ ativo | Extensão para HTTP do banco |
| **Edge Function: classify-messages** | ✅ v5 | Classifica mensagens com Gemini→Groq fallback |
| **Edge Function: download-wa-media** | ✅ v1 | Baixa mídias do CDN do WhatsApp para Storage |
| **Edge Function: upload-wa-media** | ✅ v1 | Recebe mídias descriptografadas do worker |
| **Edge Function: dashboard-data** | ✅ v3 | Dados para o dashboard |
| **Storage bucket: wa-media** | ✅ privado | Imagens, áudios, PDFs, vídeos. 100MB por arquivo |

---

## Decisão técnica crítica: separação de funções SQL

O n8n e a edge function usam **funções SQL separadas** para não competirem pelas mesmas mensagens:

```sql
-- Usada pelo n8n: pega só mensagens novas (primeira tentativa)
claim_whatsapp_messages(p_limit int)
  WHERE ai_attempts = 0

-- Usada pela edge function: pega mensagens que já falharam uma vez
claim_wa_messages_for_edge(p_limit int)
  WHERE ai_attempts >= 1 AND ai_attempts < 6
```

Ambas usam `FOR UPDATE SKIP LOCKED` (atomic, sem race condition).

**Por que essa separação existe:** o n8n chamava Gemini diretamente. Quando o Gemini atingia rate limit, o n8n ficava em loop de retry, ocupando as mensagens e impedindo qualquer fallback para Groq. Com a separação: n8n faz a primeira tentativa, se falhar (ai_attempts vai para 1), a edge function pega no próximo ciclo e tenta Gemini→Groq.

---

## Classificação de mensagens

### Providers de IA

| Provider | Modelo | Papel | Por quê |
|---|---|---|---|
| **Gemini** | `gemini-2.5-flash-lite` | Principal | Mais barato, melhor qualidade |
| **Groq** | `llama-3.1-8b-instant` | Fallback | 100k tokens/min no free tier. NÃO usar `llama-3.3-70b-versatile` — tem só 12k tokens/min |

### Lógica de retry

- Backoff exponencial: `60s × 2^(attempts - 1)`
- Máximo 6 tentativas totais (n8n + edge function juntos)
- Após 6: `ai_status = 'failed'` permanentemente

### Campos de IA em `wa_messages`

```
ai_status        → pending | processing | completed | skipped | failed
ai_provider      → google | groq
ai_model         → nome exato do modelo usado
ai_error         → erro (preenchido mesmo em sucesso se houve fallback)
ai_attempts      → contador de tentativas
ai_next_retry_at → próxima tentativa (backoff exponencial)
category         → tarefa | pedido | cobranca | informacao | suporte | spam | outro
priority         → alta | media | baixa
summary          → resumo 1-2 frases
contains_date    → boolean
extracted_date   → ISO 8601 UTC ou null
action_required  → boolean
classified_at    → timestamp do sucesso
```

### Sistema prompt da classificação

```
Você classifica mensagens de WhatsApp de um representante têxtil comercial.
Responda SOMENTE com JSON válido, sem markdown, sem explicações.

Formato obrigatório:
{
  "category": "tarefa | pedido | cobranca | informacao | suporte | spam | outro",
  "priority": "alta | media | baixa",
  "summary": "resumo em 1-2 frases do que trata a mensagem",
  "contains_date": true ou false,
  "extracted_date": "YYYY-MM-DDTHH:MM:SS" ou null,
  "action_required": true ou false
}
```

---

## Edge Functions (Deno/TypeScript)

Todas têm `verify_jwt: false`. Usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` fornecidos automaticamente pelo Supabase.

### classify-messages (principal)

Chamada pelo cron a cada 2 minutos. Fluxo:
1. Chama `claim_wa_messages_for_edge(p_limit)` para pegar mensagens com `ai_attempts >= 1`
2. Para cada mensagem, tenta Gemini (15s timeout)
3. Se Gemini falhar por qualquer motivo → tenta Groq imediatamente
4. Se ambos falharem → backoff exponencial, status `pending`
5. Se `ai_attempts >= 6` → status `failed`

Secrets necessários: `GEMINI_API_KEY`, `GROQ_API_KEY`  
Secrets opcionais: `GEMINI_MODEL` (default: `gemini-2.5-flash-lite`), `GROQ_MODEL` (default: `llama-3.1-8b-instant`)

### download-wa-media

`POST /functions/v1/download-wa-media`

Busca mensagens com `media_url IS NOT NULL AND media_path IS NULL AND message_type != 'ciphertext'`, baixa em lotes de 20 do CDN do WhatsApp e salva no bucket `wa-media`.

Paths no Storage: `{message_type}/{message_id}.{ext}`  
Extensões: `ptt→.ogg, audio→.ogg, image→.jpg, video→.mp4, document→.bin, sticker→.webp`

Se URL expirou: salva `media_path = 'failed:{status}'`

**Atenção:** mídias no WhatsApp são cifradas (AES-256-CBC) no CDN e as URLs expiram em horas. Para mídias históricas antigas, não há recuperação. Para mídias novas, o n8n deve chamar `upload-wa-media` ao receber cada mensagem.

### upload-wa-media

`POST /functions/v1/upload-wa-media`

Chamado pelo n8n com a mídia já descriptografada. Aceita:
- `multipart/form-data { message_id, file }`
- `JSON { message_id, data (base64), mime_type }`

Salva no bucket e atualiza `media_path` e `media_mime_type` na mensagem.

---

## Storage: bucket wa-media

```
Bucket: wa-media
Tipo: privado
Limite: 100MB por arquivo

Paths:
  image/{id}.jpg
  audio/{id}.ogg
  video/{id}.mp4
  document/{id}.bin
  sticker/{id}.webp
  ptt/{id}.ogg
```

Política RLS: somente `service_role` tem acesso total.

---

## Cron job (pg_cron)

```sql
-- Job ativo:
-- Nome: classify-wa-messages
-- Schedule: */2 * * * *
-- Comando: SELECT net.http_post(
--   url := 'https://npngojdiitcafndliatn.supabase.co/functions/v1/classify-messages',
--   body := '{"batch":10}'::jsonb,
--   timeout_milliseconds := 55000
-- )

-- Ver histórico:
SELECT jobid, status, start_time, return_message
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

---

## Queries de diagnóstico

```sql
-- Resumo geral
SELECT ai_status, ai_provider, COUNT(*) as total
FROM wa_messages
GROUP BY ai_status, ai_provider ORDER BY ai_status;

-- Mensagens com erro
SELECT id, ai_status, ai_attempts, ai_error, ai_next_retry_at
FROM wa_messages WHERE ai_error IS NOT NULL
ORDER BY updated_at DESC LIMIT 20;

-- Resetar falhas para reprocessar
UPDATE wa_messages SET
  ai_status = 'pending', ai_attempts = 1, ai_error = NULL,
  ai_next_retry_at = now(), ai_provider = NULL, ai_model = NULL, updated_at = now()
WHERE ai_status = 'failed';

-- Mídias pendentes de download
SELECT id, message_type, media_url, media_path
FROM wa_messages WHERE media_url IS NOT NULL AND media_path IS NULL LIMIT 20;

-- Mensagens travadas em processing
SELECT id, ai_attempts, updated_at FROM wa_messages
WHERE ai_status = 'processing' AND updated_at < now() - interval '10 minutes';
```

---

## Problemas resolvidos (não repetir)

| Problema | Causa | Solução aplicada |
|---|---|---|
| Gemini rate limit em loop | n8n retentando indefinidamente | `claim_whatsapp_messages` só pega `ai_attempts=0` |
| Groq 413 / TPM estourado | Modelo `llama-3.3-70b-versatile` com 12k tokens/min | Trocado para `llama-3.1-8b-instant` (100k tokens/min) |
| Mídias sem download | Sem bucket nem código | Criados bucket `wa-media` + funções `download-wa-media` e `upload-wa-media` |
| Mensagens com 6 tentativas travadas | `claim_whatsapp_messages` não pegava `ai_attempts >= 6` | Reset manual + separação de funções |

---

## O que ainda pode ser melhorado (próximas fases)

1. **n8n chamar `upload-wa-media` automaticamente** ao receber cada mensagem nova com mídia — hoje mídias novas só chegam ao Storage se chamado manualmente
2. **Dashboard de monitoramento** com contadores em tempo real — a `dashboard-data` edge function já retorna dados, falta UI
3. **Envio de respostas automáticas** pelo WhatsApp — a tabela `wa_outbound_queue` existe mas o envio não está implementado
4. **Relatório diário automático** — `wa_outbound_queue` tem registros de relatórios diários criados mas nunca enviados (fila de envio não implementada)
5. **Alertas por prioridade** — mensagens com `priority = 'alta'` e `action_required = true` poderiam gerar notificação imediata
6. **Visualização de mídias** — acessar arquivos do bucket `wa-media` via URL assinada

---

## Secrets configurados no Supabase

```
GEMINI_API_KEY    → chave do Google AI Studio
GROQ_API_KEY      → chave do Groq (console.groq.com)
```

O Supabase fornece automaticamente: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## Contexto do dono do projeto

- Leonardo Garcia, leigo em programação
- Usa n8n para automações, Docker para rodar serviços localmente
- O sistema existe para organizar e priorizar as mensagens de WhatsApp do escritório de representação têxtil
- Prefere soluções automáticas que não exijam intervenção manual recorrente
