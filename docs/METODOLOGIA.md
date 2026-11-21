# Metodologia e parâmetros do motor

## Critério financeiro

- Margem de contribuição: `valor do pedido × (1 − CMV)`. CMV de 24%: dado oficial do enunciado.
- Custo de reenvio: `valor × CMV + custo médio de frete` informado no pedido/rota.
- LTV em risco: `queda de recompra × taxa de recompra × (receita acumulada / número de pedidos) × (1 − CMV)`. Queda de 50%, recompra VIP de 70% e regular de 28%: dados oficiais do enunciado. A conversão para margem aplica o critério único do motor.
- Probabilidade de cancelamento por atraso: até 2 dias úteis 4%, até 5 dias 10%, até 10 dias 22%, acima de 10 dias 40%; dados oficiais do enunciado.
- EV por atraso entregue: custo oficial de contato + perda de LTV.
- Pagamento em cobrança: probabilidade parametrizada de abandono × margem. Abandono padrão de 30%: PREMISSA NOSSA.
- Pagamento expirado: custo de reembolso e EV iguais a zero; expiração após mais de 5 dias úteis: PREMISSA NOSSA.
- Endereço divergente: probabilidade de cancelamento × margem + contato + LTV em risco.
- Ruptura: máximo entre probabilidade de cancelamento e piso de 40%, multiplicado pela margem, mais contato e LTV. Piso de 40%: PREMISSA NOSSA.
- Extravio, avaria, vazamento e personalização: máximo entre margem menos custo de reenvio e zero, mais contato e LTV.
- Item faltante: máximo entre margem menos 40% do custo de reenvio e zero, mais contato e LTV. Fração de 40%: PREMISSA NOSSA.
- Rastreio parado/devolução: máximo entre probabilidade de cancelamento e piso de 22%, multiplicado pela margem, mais contato e LTV. Piso de 22%: PREMISSA NOSSA.
- Economia estimada de causa-raiz: soma do EV dos pedidos afetados, limitada ao GMV exposto do grupo. Não representa economia realizada.
- Prazo real: data do pedido acrescida de 1 dia útil de preparação (PREMISSA NOSSA) e do SLA contratado em dias úteis. Feriados 07/09 e 12/10: dados oficiais do enunciado.
- Data de referência do motor: 30/09/2026, informada pela base do desafio.
- Burn-down: pedidos ordenados por FIFO (data de abertura, depois data do pedido) ou EV decrescente; processamento diário em lotes da capacidade parametrizada. EV acumulado é a soma dos EV dos pedidos processados até aquele dia.
- Zero-Touch: 12 minutos humanos poupados por caso; capacidade de 150/dia e 12 minutos/caso: dados oficiais do enunciado.
- Comparação de resolução: reenvio = custo CMV + frete + contato + perda esperada de LTV; reembolso = valor pago + contato + perda esperada de LTV; aguardar = EV_Risco do motor. O motor escolhe o menor custo calculado; LTV e custos diretos vêm exclusivamente dos dados e fórmulas acima.
- Orquestração: o Groq escolhe tools e redige texto; Triagem, Investigador e Comunicação têm permissões e alçadas delimitadas. Até seis rodadas de modelo; no erro ou indisponibilidade, o plano equivalente usa as mesmas tools determinísticas. A saída textual monetária ou temporal é validada contra os resultados de tools da execução.
- Chamado para transportadora e escalada: são Actions persistidas aguardando aprovação humana; não são chamadas externas executadas. O Zero-Touch só inclui pedidos sem alçada e persiste `em_tratativa`.

## Constantes e origens

## Dados sinteticos da demonstracao

**SKUs de regra, citados no motor:** `APC-1067` aparece somente nos exemplos de vazamento do lote `L2607-B`; `KSH-nnnn` aparece somente em exemplos de ruptura pós-venda. Esses identificadores são mantidos para exercitar as regras de causa-raiz. Todos os demais SKUs dos datasets públicos usam `DEMO-nnn`, e cada descrição usa o texto fictício genérico `Produto demonstrativo fictício nnn`. Os lotes e transportadoras dos exemplos são mantidos como dimensões sintéticas de teste.

As constantes centralizadas estão em `lib/params.ts`. Dados oficiais: CMV 24%, capacidade 150/dia, 12 minutos/caso, contato R$ 9, faixas de cancelamento 4%/10%/22%/40%, recompra VIP 70% e regular 28%, queda de 50%, feriados 07/09 e 12/10 e limite VIP R$ 1.500. Premissas nossas editáveis: preparação de 1 dia útil, expiração de pagamento em 5 dias úteis, abandono 30%, piso de ruptura 40%, alçada acima de R$ 250, fração de reenvio de item faltante 40% e piso de rastreio/devolução 22%. O limite de uso é 20 chamadas por 10 minutos e 500 caracteres por mensagem, conforme especificado na tarefa.

Os custos de frete de benchmark vêm das rotas recebidas com o dataset; se não houver tarifa da Rota Express na região Nordeste, o benchmark não é exibido. Nenhum benchmark ou economia é apresentado como resultado persistido.

## Ações e persistência

- Uma ação percorre `proposta → aguardando_aprovacao → aprovada → executada`, ou termina em `rejeitada`. Decisões de alçada humana são registradas no store e na trilha de auditoria.
- O Zero-Touch coloca pedidos em `em_tratativa`. Esse é um efeito persistido no GoGroup Ops; sem Telegram configurado, a notificação ao cliente é simulada. Com Telegram configurado, o envio confirmado ao chat de demonstração é real nesse canal, mas não é mensagem a cliente real nem comprova resolução. Os pedidos saem da fila ativa, dos totais ativos e do burn-down.
- Os estados `aberto`, `em_tratativa`, `resolvido` e `cancelado` são mantidos no store. Integração externa com WhatsApp Business API, ERP e painel da transportadora não está habilitada; o sistema informa qual integração seria chamada em produção.
- O store usa memória do processo sem credenciais. Com `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`, usa Upstash Redis REST. O estado da demo expira após sete dias.
- Telegram: o webhook só aceita chats autorizados e valida `X-Telegram-Bot-Api-Secret-Token`; `update_id` é deduplicado no store. O briefing é protegido por `CRON_SECRET`. O token do bot nunca deve ser registrado em logs.
- Métricas e limites da simulação, incluindo sensibilidade e definição de horas, estão em [METRICAS.md](METRICAS.md); não há desfecho real das tratativas na base.
