# GRUPO VIPS

Painel de gestão para restaurantes (caixa, comandas, estoque e financeiro). O app é TanStack Start e publica na Vercel.

A troca do banco Lovable Cloud para o Supabase próprio está em [MIGRACAO.md](./MIGRACAO.md).

## Desenvolvimento

```sh
bun install
bun run dev
```

O build de produção (`bun run build`) gera o pacote da Vercel em `.vercel/output`.
