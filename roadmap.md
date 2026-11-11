# SmartPag — Roadmap

## Contexto
Sistema de gestão para restaurantes/bares (referência: print enviado pelo usuário).
Visual: tema claro, cards arredondados, ícones coloridos em quadrados, rail lateral de ícones.

## Tarefas
- [x] Habilitar Lovable Cloud
- [x] Schema base (perfis, papéis, clientes, produtos)
- [x] Ajustar schema para restaurante (categorias, comandas, itens, pagamentos, estoque, funcionários)
- [x] Corrigir avisos do linter de segurança (funções SECURITY DEFINER)
- [x] Design system claro estilo SmartPag em src/styles.css
- [x] Autenticação (e-mail/senha + Google) em /auth
- [x] Layout com sidebar de ícones
- [x] Dashboard: movimentação do caixa, comandas abertas/fechadas, pagamentos por método (donut)
- [x] Cadastro (produtos e categorias)
- [x] Estoque
- [x] Relatórios
- [x] Financeiro
- [x] Funcionários
- [x] Estabelecimento (configurações)
- [x] SEO/head por rota
- [x] Caixa: abertura/fechamento, entradas e saídas, relatório do turno
- [x] Multi-loja: tabelas stores/store_members, store_id em todos os dados, RLS por loja
- [x] Matriz enxerga e opera filiais (seletor de loja no topo)
- [x] Módulo Rede: filiais, acessos por e-mail, visão consolidada
- [x] Gráficos comparativos (vendas, ticket médio, comandas por dia/semana) na visão consolidada
- [x] Matriz como centro de distribuição: venda/transferência para lojas (preço de repasse, custo médio no destino, conta a pagar/receber)
- [x] Fechamento de caixa com conferência (contagem de cédulas, quebra e auditoria por turno)
- [x] Comissões de garçons (garçom na comanda, % por funcionário, relatório e CSV)
- [x] Cardápio digital público com QR Code por mesa
- [ ] Pendente: retomar integração WhatsApp/Twilio quando o pagamento for resolvido
- [x] Tela de Caixa dentro do PDV: dinheiro + cartão, fechamento do dia e relatório, sem sair do app
- [x] PDV no modelo Sisfood (referência do usuário): barra de topo (Delivery–Balcão, Mesa, Fluxo Caixa, Configuração), kanban de pedidos, mapa de mesas com filtros e Fluxo de caixa em cards
- [x] Impressão por setor (cozinha/bar/chapa) configurável por categoria
- [x] Delivery: endereço, bairro, referência, taxa de entrega e entregador no pedido
- [x] Produtos: unidade de medida, tipo (simples/composto/combo/kit) e montagem com baixa dos componentes
- [ ] Divisão de conta e taxa de serviço 10% nas mesas
- [x] Baixa manual de estoque (desperdício, quebra, vencimento, cortesia) com custo da perda e CSV
- [ ] Fiscal (NFC-e) e TEF de maquininha
- [ ] Cancelamento/estorno com motivo e auditoria
- [ ] Ficha técnica/receita e ordens de produção (Produção Vips)
- [x] Contas a pagar por loja com lançamento, valor, vencimento e forma de pagamento
- [x] Relatório de contas a vencer em 7, 30 e 60 dias com exportação CSV
- [x] BI da Rede com custos por venda, margem de lucro e custo médio por item
- [x] Contas a receber por loja com atualização automática do BI da Rede
- [x] BI da Rede com estoque crítico e sugestão de quantidade para o próximo pedido
- [x] Fornecedores e pedidos por loja com data, valor, quantidade e cálculo de reposição
- [x] Aba de Caixa no BI da Rede (entradas, saídas, saldo em tempo real)
- [x] Tela de Caixa no app do garçom (saldo, entradas, saídas e histórico)
- [ ] Alerta visual no app do garçom quando o estoque de um produto zerar
