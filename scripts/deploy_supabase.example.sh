#!/usr/bin/env bash
set -euo pipefail

# Rode este arquivo como referência, copiando os comandos um por um.
# Não coloque chaves reais neste arquivo.

supabase login
supabase link --project-ref "SEU_PROJECT_REF"

supabase db push

supabase secrets set SUPABASE_URL="https://SEU-PROJETO.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE_KEY"
supabase secrets set GOOGLE_CLIENT_ID="SEU_GOOGLE_CLIENT_ID"
supabase secrets set GOOGLE_CLIENT_SECRET="SEU_GOOGLE_CLIENT_SECRET"
supabase secrets set GOOGLE_REFRESH_TOKEN="SEU_GOOGLE_REFRESH_TOKEN"

supabase functions deploy import-stock

curl -X POST "https://SEU-PROJETO.functions.supabase.co/import-stock"
