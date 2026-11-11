# Fornecedores e Pedidos por Loja

## Objetivo
Criar uma tela única para acompanhar fornecedores e montar pedidos de reposição por loja, reutilizando os cadastros, produtos, estoque e compras já existentes.

## O que será entregue
- Seletor de loja para visualizar e registrar dados de cada unidade.
- Cadastro e listagem de fornecedores da loja, aproveitando o cadastro atual.
- Novo pedido com fornecedor escolhido no momento do lançamento, data e itens com quantidade e valor unitário.
- Cálculo automático por produto de **quanto falta para o próximo pedido**: `máximo de 0 entre estoque mínimo e estoque atual`.
- Resumo do pedido com quantidade total e valor total antes de salvar.
- Histórico de pedidos por loja mostrando fornecedor, data, quantidade total, valor e situação.
- Destaque visual para produtos abaixo do estoque mínimo.
- Novo acesso no menu, respeitando as permissões atuais.

## Reutilização e impacto
- Usar as tabelas e processos existentes de `suppliers`, `purchases`, `purchase_items` e `products`.
- Salvar os pedidos no fluxo de compras atual, sem criar tabela nova e sem alterar o banco.
- Não vincular permanentemente fornecedor ao produto; o fornecedor será escolhido em cada pedido, conforme solicitado.
- Não alterar aprovação, entrada de estoque, custo médio ou contas a pagar existentes.

## Validação
- Conferir seleção de loja, fornecedor, cálculo das quantidades sugeridas, total do pedido e histórico.
- Verificar a tela em computador e celular e confirmar que o projeto continua sem erros.
