# App Garçom (celular e maquininha)

Uma tela nova, feita para tela pequena e toque, no mesmo sistema — tudo que o garçom lançar aparece no painel na hora, e o painel aparece no aparelho na hora.

## O que o garçom vê

1. **Abrir mesa / pedido**: lista das mesas abertas da loja + botão para abrir nova mesa ou pedido de balcão.
2. **Produtos por categoria**: abas de categoria no topo (como no vídeo), grade de cartões com:
   - foto do produto (quando não houver foto, um ícone neutro no lugar);
   - preço e nome;
   - selo redondo de estoque no canto da foto: **verde** com o saldo quando há estoque, **vermelho** quando está zerado ou negativo; produtos sem controle de estoque não mostram selo.
   - busca por nome para achar item rápido.
3. **Toque no produto** adiciona 1 ao pedido; barra fixa embaixo com quantidade de itens e total, tocando abre o pedido.
4. **Pedido aberto**: lista de itens com +/-, observação, enviar para produção/impressão e finalizar com as formas de pagamento já usadas no sistema (crédito, débito, PIX, dinheiro, etc.), com troco.

## Tempo real

- A tela escuta as tabelas de pedidos, itens e produtos: venda feita em outro aparelho, mudança de preço ou baixa de estoque atualizam o selo e a grade sem precisar recarregar.
- Ao finalizar, o painel (PDV, caixa, BI) já recebe os valores porque usa o mesmo fluxo atual.

## Uso na maquininha

- Layout em uma coluna, botões grandes (alvo mínimo de toque), grade de 2 colunas em telas estreitas e 3 em telas maiores.
- Sem menu lateral: cabeçalho compacto com loja, busca e voltar.

## Detalhes técnicos

- Nova rota `src/routes/_authenticated/garcom.tsx` + `src/features/garcom.tsx`, item **Garçom** no menu com permissão `garcom` (adicionada em `src/lib/permissions.tsx`).
- Reutiliza `PedidoEditor` de `src/features/pdv-pedido-editor.tsx` para o pedido/fechamento e `baixarEstoqueDoPedido`; nenhuma lógica de venda é duplicada.
- Grade lê `products` (`image_url`, `stock_qty`, `min_stock`, `track_stock`, `price_cents`, `category_id`) e `categories` filtrados por `currentStoreId()`.
- Realtime via canal Supabase em `tabs`, `tab_items`, `products` invalidando as queries correspondentes; canal criado em `useEffect` e removido no unmount.
- Sem mudança de banco: `products.image_url` e o cadastro de imagem já existem.
