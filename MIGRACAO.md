# Migração para o Supabase GRUPO VIPS

Projeto de destino (já criado, região `sa-east-1`):

- Nome: **GRUPO VIPS**
- Ref: `zedohgefwcsmtowxwtad`
- URL: `https://zedohgefwcsmtowxwtad.supabase.co`

O app na Vercel, depois do merge, fica em `https://grupo-vips-grupo-vips1.vercel.app`.

Não há buckets de Storage nem Edge Functions. As fotos de produto ficam na coluna `products.image_url` (data URL), então saem junto com a tabela.

## 1. Aplicar o schema

No SQL Editor do projeto `zedohgefwcsmtowxwtad`, execute os arquivos de `supabase/migrations` **em ordem de nome**, do `20260901000000_extensions.sql` até `20260903150000_receivables_and_payment_method.sql`.

O banco precisa estar vazio (projeto novo ou recém-restaurado, sem tabelas `public` do app). Cada arquivo roda uma vez. O último arquivo pode ser reaplicado; os anteriores não.

## 2. Auth

1. No Google Cloud, crie um cliente OAuth do tipo **Aplicativo da Web**.
   - URI de redirecionamento autorizado: `https://zedohgefwcsmtowxwtad.supabase.co/auth/v1/callback`
   - Origem JavaScript autorizada: `https://grupo-vips-grupo-vips1.vercel.app`
2. Em Authentication → Providers → Google, cole o Client ID e o Client Secret.
3. Authentication → URL Configuration:
   - Site URL: `https://grupo-vips-grupo-vips1.vercel.app`
   - Redirect URLs:
     - `https://grupo-vips-grupo-vips1.vercel.app/auth/callback`
     - `https://grupo-vips-grupo-vips1.vercel.app/auth/reset`
     - `https://*-grupo-vips1.vercel.app/auth/callback`
     - `https://*-grupo-vips1.vercel.app/auth/reset`
4. Deixe **Confirm email** ligado se a conta nova só puder entrar depois de abrir o e-mail. Desligue só se quiser entrar na hora.

Quem já existia no Lovable Cloud **não traz a senha**. No site novo, entra com Google ou usa **Esqueci minha senha**.

## 3. Variáveis na Vercel

Só os nomes. Os valores saem do projeto `zedohgefwcsmtowxwtad` (Settings → API) e do AI Gateway.

Obrigatórias para o app abrir e gravar dados:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

IA (agentes, leitura de documento, parecer financeiro, WhatsApp). Sem chave, essas telas avisam e o resto do sistema segue:

- `AI_GATEWAY_API_KEY`
- `AI_BASE_URL` (opcional; padrão `https://ai-gateway.vercel.sh/v1`)
- `AI_API_KEY` (opcional; use no lugar da chave do Gateway se o `AI_BASE_URL` for outro servidor compatível com a API da OpenAI)
- `AI_MODEL` (opcional; padrão `openai/gpt-4.1-mini`)
- `AI_VISION_MODEL` (opcional; padrão igual a `AI_MODEL`)

WhatsApp, só se for usar Twilio:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

Não há rota agendada hoje. Se no futuro existir um cron, a Vercel envia `Authorization: Bearer` com:

- `CRON_SECRET`

Fora da Vercel, para o Drizzle apontar neste banco:

- `DATABASE_URL` (connection string Postgres do projeto novo; não commitar)

## 4. Levar os dados do Lovable Cloud

Origem: projeto Lovable `77d45d92-165e-4418-a9e8-a3a4d18c7bc2` (banco antigo `xlueylkegjhqoqxmwayq`).

Isso **precisa de acesso ao Lovable**. Sem login nesse projeto não há connection string, CSV nem dump.

O que dá para exportar de lá:

- Tabelas do schema `public`: CSV na tela Database do Lovable, ou `pg_dump` só de dados (`--data-only --schema=public`) se a connection string aparecer em Cloud → Database.
- Arquivos de Storage: **não há buckets**. As imagens estão dentro de `products.image_url`.

O que não muda de projeto sozinho:

- Usuários de Auth. O hash da senha não serve no projeto novo, e o login Google antigo estava no Lovable. Crie a conta de novo (Google ou e-mail) e use **Esqueci minha senha** se precisar de senha.
- Os `user_id` / `owner_id` das tabelas apontam para os usuários antigos. Depois de criar o usuário novo, troque esses ids no dump **antes** de importar, senão a chave estrangeira para `auth.users` recusa a linha.

Ordem segura: aplicar as migrations no projeto novo, criar o usuário dono, ajustar os ids no export, importar o `public`. Não copie a tabela `auth.users`.
