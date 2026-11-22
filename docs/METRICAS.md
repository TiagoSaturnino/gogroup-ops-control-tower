# Métricas da prova de conceito

## Fonte e leitura

Os números de referência nesta página foram impressos por `node scripts/print_metrics.mjs` em 21/11/2026, usando `data/private/snapshot_2000.json` disponível localmente. O script não imprime pedidos nem identificadores. Sem o snapshot, use `npm run metrics -- --demo`; a fixture sintética de clone não reproduz os totais privados.

Premissas padrão lidas de `lib/params.ts`: capacidade **150/dia**, contato de **R$ 9**, **12 minutos/caso**, CMV **24%**, abandono de pagamento **30%** (premissa nossa) e piso/teto de risco de ruptura **40%** (premissa nossa). O motor e a origem de cada fórmula estão em [METODOLOGIA.md](METODOLOGIA.md).

## Métrica de processo

### Horas estimadas sem intervenção humana

**Definição:** horas teóricas liberadas pelo Zero-Touch apenas nos pedidos que o motor marca elegíveis e sem alçada humana. A execução da Action é observável no store; a conta de horas não mede tempo cronometrado.

**Fórmula:** `pedidos Zero-Touch sem alçada × 12 minutos ÷ 60`. No snapshot: **327 pedidos / 2.000 = 16,35%** da fila e **65,4 horas estimadas**. Os 12 minutos vêm do enunciado; a contagem vem do motor.

O motor também classifica **368** pedidos como elegíveis antes de aplicar alçada (**18,4%**) e reporta **73,6 horas teóricas**. Essa medida bruta inclui casos que não podem ser executados pelo agente. O painel e esta métrica de automação usam a contagem sem alçada: **327 e 65,4 horas**.

### Percentual processado sem intervenção

O indicador correto da prova de conceito é **percentual processado autonomamente**, não “percentual resolvido”: `pedidos distintos em Actions Zero-Touch executadas, cujo estado persistido é em_tratativa ÷ pedidos ativos`. O painel deduplica os IDs dos pedidos, portanto reprocessar um lote não infla o KPI. Como referência pré-execução, o proxy de elegibilidade é **16,35%**. O sistema não mede quantos casos tiveram o problema externo solucionado.

## Métrica de impacto operacional/financeiro

### EV_Risco priorizado no Dia 1 (proxy de perda esperada)

**Definição:** soma de `EV_Risco` dos pedidos que cabem na capacidade diária, comparando FIFO com a fila decrescente por EV_Risco. É risco esperado colocado sob tratamento prioritário; não é uma perda efetivamente evitada nem receita realizada.

**Fórmula:** `EV_Risco AI-First do Dia 1 − EV_Risco FIFO do Dia 1`.

| Capacidade por dia | FIFO: EV_Risco Dia 1 | Prioridade: EV_Risco Dia 1 | Incremento priorizado | Dias para processar 2.000: FIFO / prioridade |
| ---: | ---: | ---: | ---: | ---: |
| 100 | R$ 4.880,68 | R$ 16.978,63 | R$ 12.097,95 | 20 / 20 |
| 150 | R$ 8.290,25 | R$ 22.998,23 | R$ 14.707,98 | 14 / 14 |
| 200 | R$ 11.313,49 | R$ 28.307,70 | R$ 16.994,21 | 10 / 10 |

O prazo para zerar a fila é `ceil(pedidos ativos ÷ capacidade diária)`. Mudar a ordem altera o risco atendido no Dia 1, mas não a quantidade de dias necessária se capacidade e tamanho da fila forem os mesmos.

## Sensibilidade — uma variável por vez

Cada linha recalcula o mesmo motor e snapshot variando somente o parâmetro indicado. Capacidade **100/150/200** e abandono **10%/30%/50%** são cenários pedidos para sensibilidade; o padrão de abandono é 30%. Para ruptura, **20%/40%/60%** são pontos analíticos ao redor do padrão nosso de 40%, não novas estimativas factuais.

### Abandono de pagamento

| Abandono | EV_Risco total do motor | EV_Risco FIFO Dia 1 | EV_Risco prioridade Dia 1 | Dias para zerar, ambos |
| ---: | ---: | ---: | ---: | ---: |
| 10% | R$ 97.348,79 | R$ 8.290,25 | R$ 22.998,23 | 14 |
| 30% (padrão) | R$ 97.456,36 | R$ 8.290,25 | R$ 22.998,23 | 14 |
| 50% | R$ 97.563,93 | R$ 8.290,25 | R$ 22.998,23 | 14 |

Nesse conjunto, a mudança altera o EV total estimado; o Dia 1 selecionado não muda porque nenhum pedido de pagamento entra nos primeiros 150 das filas FIFO/AI-First nesses cenários.

### Teto de risco de ruptura

| Teto usado na simulação | EV_Risco total | FIFO Dia 1 | Prioridade Dia 1 | Incremento prioridade − FIFO | Dias para zerar, ambos |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 20% | R$ 96.796,01 | R$ 8.290,25 | R$ 22.961,11 | R$ 14.670,86 | 14 |
| 40% (padrão) | R$ 97.456,36 | R$ 8.290,25 | R$ 22.998,23 | R$ 14.707,98 | 14 |
| 60% | R$ 99.280,11 | R$ 8.674,91 | R$ 23.214,26 | R$ 14.539,35 | 14 |

O aumento do teto eleva o EV calculado para pedidos de ruptura e pode mudar a ordem da fila. O incremento de Dia 1 não cresce de forma monotônica porque a composição dos pedidos priorizados também muda.

## O que esta simulação não prova

- A base não contém o desfecho observado de cada tratativa. Portanto, ela não permite calcular taxa real de resolução sem intervenção, perda evitada, recompra recuperada ou satisfação do cliente.
- `EV_Risco`, “economia estimada” e incremento FIFO × prioridade são estimativas derivadas das premissas. Não são valores financeiros realizados.
- A hipótese de 12 minutos poupados por caso precisa ser cronometrada no piloto; o motor aplica o dado oficial uniformemente.
- A simulação não comprova que uma mensagem enviada por Telegram resolve o problema nem que o cliente a recebeu/visualizou; o chat de cliente é apenas demonstração.

Para reproduzir os totais agregados: `npm run metrics` (usa snapshot privado local quando disponível) ou `npm run metrics -- --demo` (usa a demonstração sintética).
