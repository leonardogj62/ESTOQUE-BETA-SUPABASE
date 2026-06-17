# Como gerar o Google Refresh Token

O importador do Supabase precisa de um `GOOGLE_REFRESH_TOKEN` para acessar o Drive sem depender do navegador aberto.

## 1. Google Cloud

1. Acesse https://console.cloud.google.com/
2. Abra o projeto que já tem o OAuth do Estoque Beta ou crie um novo.
3. Ative a API:
   - Google Drive API
   - Gmail API, quando formos importar tabela por email.
4. Vá em **APIs e serviços > Credenciais**.
5. Crie ou abra um **OAuth client ID** do tipo **Web application**.
6. Copie:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

## 2. OAuth Playground

1. Acesse https://developers.google.com/oauthplayground/
2. Clique na engrenagem no canto superior direito.
3. Marque **Use your own OAuth credentials**.
4. Cole o `GOOGLE_CLIENT_ID` e o `GOOGLE_CLIENT_SECRET`.
5. Em **Step 1**, selecione:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/gmail.readonly` se precisar de email.
6. Clique em **Authorize APIs**.
7. Faça login com a conta que tem acesso às pastas do Drive.
8. Em **Step 2**, clique em **Exchange authorization code for tokens**.
9. Copie o `refresh_token`.

## 3. Salvar no Supabase

```bash
supabase secrets set GOOGLE_CLIENT_ID="..."
supabase secrets set GOOGLE_CLIENT_SECRET="..."
supabase secrets set GOOGLE_REFRESH_TOKEN="..."
```

Guarde esse token como senha. Não coloque em commit.

