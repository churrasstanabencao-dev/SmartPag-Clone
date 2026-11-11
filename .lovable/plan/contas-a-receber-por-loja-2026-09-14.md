# Contas a Receber por Loja

## Objetivo
Criar uma tela para registrar e acompanhar valores a receber de cada loja, com lançamento, vencimento, forma de pagamento e baixa, refletindo automaticamente no BI da Rede.

## Implementação
- Criar o cadastro de contas a receber com seleção de loja, descrição, valor, vencimento e forma de pagamento.
- Exibir indicadores de valores vencidos, que vencem hoje, a receber e recebidos no mês.
- Adicionar filtros para contas em aberto, vencidas, recebidas e todas.
- Permitir marcar como recebida, desfazer a baixa e excluir um lançamento.
- Adicionar a nova tela ao menu e ao controle de permissões por usuário.
- Atualizar o BI da Rede com valores a receber em aberto e valores recebidos no período selecionado.
- Fazer o BI atualizar automaticamente após lançamentos, baixas ou exclusões.

## Dados e segurança
- Criar uma tabela exclusiva para contas a receber, mantendo os recebimentos separados das despesas e das vendas do PDV.
- Vincular cada conta à loja e ao usuário responsável.
- Aplicar acesso somente a usuários autorizados da loja, seguindo as regras já usadas no sistema.
- Habilitar atualização em tempo real para a nova tabela.

## Validação
- Verificar criação, baixa, desfazer baixa, exclusão e troca de loja.
- Confirmar os totais na tela e no BI da Rede.
- Confirmar funcionamento em computador e celular sem alterar os módulos existentes.
