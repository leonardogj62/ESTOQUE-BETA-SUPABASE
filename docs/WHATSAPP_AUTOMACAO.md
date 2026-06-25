# Secretaria WhatsApp — Documentação Técnica

Projeto Supabase separado do Estoque Beta. ID do projeto: `npngojdiitcafndliatn`.

## Arquitetura atual

```
WhatsApp → n8n (Docker local) → Supabase (wa_messages)
                                      ↓
                             cron pg_cron (a cada 2min)
                                      ↓
                         Edge Function: classify-messages
                                      ↓
                        Tenta Gemini → falha → usa Groq
                                      ↓
                         wa_messages atualizado (completed)
```

### Componentes

| Componente | Descrição |
|---|---|
| **n8n (Docker)** | Recebe webhook do WhatsApp via Cloudflare Tunnel, salva mensagens no Supabase |
| **Cloudflare Tunnel** | Expõe o n8n local para o WhatsApp receber webhooks |
| **Supabase** | Banco central (PostgreSQL + Edge Functions + Storage) |
| **pg_cron** | Agendador interno do Supabase — chama classify-messages a cada 2 minutos |
| **pg_net** | Extensão PostgreSQL para fazer chamadas HTTP do banco |
| **Edge Function: classify-messages** | Classifica mensagens com Gemini→Groq fallback |
| **Edge Function: download-wa-media** | Baixa mídias do CDN do WhatsApp para o Storage |
| **Edge Function: upload-wa-media** | Recebe mídias já descriptografadas do worker para o Storage |
| **Edge Function: dashboard-data** | Dados para o dashboard de monitoramento |
| **Supabase Storage bucket: wa-media** | Armazena imagens, áudios, PDFs e vídeos das conversas |

---

## Separação de responsabilidades (decisão chave)

O n8n e a edge function usam funções SQL diferentes para evitar conflito:

| Função SQL | Quem usa | O que busca |
|---|---|---|
| `claim_whatsapp_messages(limit)` | n8n | Mensagens novas (`ai_attempts = 0`) — primeira tentativa com Gemini |
| `claim_wa_messages_for_edge(limit)` | Edge function | Mensagens que falharam (`ai_attempts >= 1`) — retry com Gemini→Groq |

Ambas usam `FOR UPDATE SKIP LOCKED` para evitar processamento duplo.

**Por que essa separação existe:** o n8n rodava com Gemini puro. Quando o Gemini atingia rate limit, ele ficava em loop de retry ocupando as mensagens e impedindo qualquer fallback. Com a separação, o n8n faz a primeira tentativa e, se falhar, a edge function assume o retry com fallback automático para Groq.

---

## Classificação de mensagens

### Provedores de IA

| Provedor | Modelo | Papel | Limite (free) |
|---|---|---|---|
| **Gemini** | `gemini-2.5-flash-lite` | Principal | Cotas do Google AI Studio |
| **Groq** | `llama-3.1-8b-instant` | Fallback | 100.000 tokens/min |

O modelo Groq foi escolhido como `llama-3.1-8b-instant` (não o `llama-3.3-70b-versatile`) porque o 70B tem limite de apenas 12.000 tokens/min no plano gratuito, que estourava ao processar vários lotes. O 8B-instant tem 100.000 tokens/min.

### Campos classificados em `wa_messages`

| Campo | Tipo | Descrição |
|---|---|---|
| `ai_status` | text | `pending` / `processing` / `completed` / `skipped` / `failed` |
| `ai_provider` | text | `google` ou `groq` |
| `ai_model` | text | Nome exato do modelo usado |
| `ai_error` | text | Erro da tentativa anterior (preenchido mesmo em sucesso se houve fallback) |
| `ai_attempts` | int | Número de tentativas já realizadas |
| `ai_next_retry_at` | timestamptz | Quando pode ser tentada novamente (backoff exponencial) |
| `category` | text | `tarefa / pedido / cobranca / informacao / suporte / spam / outro` |
| `priority` | text | `alta / media / baixa` |
| `summary` | text | Resumo da mensagem em 1-2 frases |
| `contains_date` | boolean | Se a mensagem menciona data ou prazo |
| `extracted_date` | timestamptz | Data extraída em UTC ISO 8601 |
| `action_required` | boolean | Se o representante precisa tomar alguma ação |
| `classified_at` | timestamptz | Quando foi classificada com sucesso |

### Lógica de retry

- Backoff exponencial: `60s × 2^(tentativas - 1)`
- Máximo de 6 tentativas total (entre n8n e edge function)
- Após 6 tentativas: `ai_status = 'failed'` permanentemente

---

## Armazenamento de mídias

### Bucket: `wa-media` (privado, limite 100 MB por arquivo)

**Estrutura de paths:**
```
image/{message_id}.jpg
audio/{message_id}.ogg
video/{message_id}.mp4
document/{message_id}.bin
sticker/{message_id}.webp
ptt/{message_id}.ogg
```

### Como as mídias chegam ao Storage

**Situação 1 — URLs do CDN do WhatsApp não expiradas:**
- Chamar `POST /functions/v1/download-wa-media`
- Busca mensagens com `media_url IS NOT NULL AND media_path IS NULL`
- Baixa em lotes de 20, salva no bucket
- Marca `media_path` na mensagem

**Situação 2 — Worker com mídia descriptografada (mensagens novas):**
- Worker chama `POST /functions/v1/upload-wa-media`
- Aceita `multipart/form-data { message_id, file }` ou `JSON { message_id, data (base64), mime_type }`
- Salva no bucket e atualiza `media_path`

**Observação:** mídias no WhatsApp são cifradas (AES-256-CBC) no CDN. As URLs expiram em horas. Para mídias históricas antigas, as URLs já expiraram e não há como recuperar. Para mídias novas, o worker deve chamar `upload-wa-media` imediatamente ao receber a mensagem.

---

## Secrets necessários na Edge Function

Configurar em: Supabase Dashboard → Settings → Edge Functions → Secrets

| Secret | Descrição |
|---|---|
| `GEMINI_API_KEY` | Chave do Google AI Studio (aistudio.google.com/apikey) |
| `GROQ_API_KEY` | Chave do Groq (console.groq.com) |
| `GEMINI_MODEL` | Opcional. Default: `gemini-2.5-flash-lite` |
| `GROQ_MODEL` | Opcional. Default: `llama-3.1-8b-instant` |

O Supabase fornece automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

---

## Cron job (pg_cron)

```sql
-- Ver agendamento ativo
SELECT jobname, schedule, active FROM cron.job;

-- Ver histórico de execuções
SELECT jobid, status, start_time, return_message
FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 10;
```

O cron chama a edge function a cada 2 minutos:
```
*/2 * * * *  →  POST classify-messages  {"batch": 10}
```

A edge function processa até 3 mensagens por chamada (padrão interno, limitado a 10).

---

## Queries úteis de diagnóstico

```sql
-- Resumo geral por status e provedor
SELECT ai_status, ai_provider, COUNT(*) as total
FROM wa_messages
GROUP BY ai_status, ai_provider
ORDER BY ai_status;

-- Ver mensagens com erro
SELECT id, ai_status, ai_attempts, ai_error, ai_next_retry_at
FROM wa_messages
WHERE ai_error IS NOT NULL
ORDER BY updated_at DESC LIMIT 20;

-- Resetar mensagens com falha para tentar novamente
UPDATE wa_messages SET
  ai_status = 'pending',
  ai_attempts = 1,
  ai_error = NULL,
  ai_next_retry_at = now(),
  ai_provider = NULL,
  ai_model = NULL,
  updated_at = now()
WHERE ai_status = 'failed';

-- Ver mídias não baixadas
SELECT id, message_type, media_url, media_path
FROM wa_messages
WHERE media_url IS NOT NULL AND media_path IS NULL
LIMIT 20;
```

---

## Problemas conhecidos e soluções

### Gemini rate limit
**Sintoma:** `ai_error` contém "rate limit" ou "429", `ai_provider = 'google'`  
**Causa:** Muitas mensagens enviadas em pouco tempo para o Gemini  
**Solução:** A edge function faz fallback automático para Groq. Se o n8n também estiver sobrecarregando o Gemini, as mensagens vão para retry e a edge function usa Groq.

### Groq 413 / TPM estourado
**Sintoma:** `ai_error` contém "Groq 413" ou "Request too large"  
**Causa:** Modelo `llama-3.3-70b-versatile` tem limite de 12.000 tokens/min (muito baixo)  
**Solução:** Usar `llama-3.1-8b-instant` (100.000 tokens/min). Já está configurado como padrão.

### Mensagens travadas em `processing`
**Sintoma:** Mensagens com `ai_status = 'processing'` há mais de 10 minutos  
**Causa:** Edge function travou ou foi interrompida no meio  
**Solução:** A `claim_wa_messages_for_edge` recupera automaticamente mensagens em `processing` por mais de 10 minutos.

### n8n competindo com a edge function
**Sintoma:** Mensagens sendo tentadas pelo Gemini repetidamente sem usar Groq  
**Causa:** n8n e edge function acessando as mesmas mensagens  
**Solução (já implementada):** Funções SQL separadas — n8n usa `claim_whatsapp_messages` (só `ai_attempts=0`), edge function usa `claim_wa_messages_for_edge` (só `ai_attempts>=1`).
