# Contas a pagar por loja

## Objetivo
Permitir registrar e acompanhar as contas de cada loja em uma única tela, incluindo descrição, valor, vencimento e forma de pagamento.

## Alterações
- Reaproveitar a tela existente de Contas a Pagar e adicionar um seletor de loja ao lançamento.
- Adicionar a forma de pagamento no formulário e salvar essa informação em cada conta.
- Exibir a loja e a forma de pagamento na listagem, mantendo filtros, baixa e exclusão já existentes.
- Quando uma loja for escolhida, listar somente suas contas e manter os totais correspondentes.
- Preservar a atualização automática do BI da Rede após lançamento ou baixa.

## Detalhes técnicos
- Acrescentar um campo opcional de forma de pagamento à estrutura existente de despesas, sem criar tabelas duplicadas.
- Usar o cadastro de lojas e os métodos de pagamento já existentes no sistema.
- Manter permissões e políticas atuais da tabela de despesas.
- Validar o funcionamento e a compilação após as mudanças.
