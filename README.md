# Torre de Controle AI-First — Operações GoGroup

Uma torre de controle operacional que combina priorização determinística, ações auditáveis e aprovação humana quando necessária.

**Demonstração pública:** https://gogroup-ops-control-tower.vercel.app

## Demonstração

Prints feitos neste ambiente, com dados fictícios do desafio. Nenhum dado bruto está no repositório e os IDs de pedido foram omitidos.

### Painel web

![Painel web com indicadores operacionais e fila priorizada após as ações](img/web-01-painel-kpis.png)

Estado após executar o Zero-Touch e aprovar 3 ações; consultas do agente separadas de ações com efeito.

### Agente no Telegram

| Plano do dia | Cartões de aprovação |
| --- | --- |
| ![Mensagem do plano diário com fila, capacidade e Zero-Touch](img/telegram-01-plano-do-dia.jpg)<br>Plano do dia | ![Cartões do Telegram com opções, alçada e botões de aprovação](img/telegram-02-cartoes-de-aprovacao.jpg)<br>Cartões de aprovação |
| ![Cartão de chamado da Rota Express aprovado, com IDs ocultos](img/telegram-03-chamado-rota-express-aprovado.jpg)<br>Chamado aprovado | ![Mensagens de comunicação por marca e confirmações de aprovação no Telegram](img/telegram-04-comunicacao-e-aprovacoes.jpg)<br>Comunicação por marca e aprovações |

O Telegram é restrito à conta do autor; os prints mostram esse canal de demonstração.

### Trilha e auditoria

![Trilha com consultas, ações executadas e aprovações registradas](img/web-02-trilha-e-auditoria.png)

Consultas (somente leitura) separadas de ações com efeito; cada aprovação humana fica registrada.

### Como testar em 30 segundos

1. Abra o [link público](https://gogroup-ops-control-tower.vercel.app).
2. Clique em **Preparar lote Zero-Touch** e depois em uma ação de alçada para aprová-la.
3. Veja a trilha e a auditoria.
4. Use **Reiniciar demonstração** para voltar ao estado inicial.

## Em dois minutos

**Para quem:** Marina é uma persona representativa: analista de operações de Gocase/GoBeauté, responsável por organizar exceções de pedidos com capacidade de referência de **150 tratativas por dia**. O problema demonstrado é uma fila de **2.000 pedidos** cuja prioridade e custo de atraso precisam ser avaliados com critério comum. Marina não é uma usuária real entrevistada; o fluxo da área precisa ser validado com a equipe.


### Fluxo de referência e fluxo com agente

O fluxo manual abaixo é a hipótese operacional representada pela prova de conceito, não um processo observado dentro da GoGroup.

| Referência manual | Com agente |
| --- | --- |
| 1. Receber exceções de pedidos em uma fila. | 1. Receber comandos na interface ou no Telegram autorizado. |
| 2. Conferir atraso, pagamento, rota ou produto pedido a pedido. | 2. Triar a fila pela prioridade determinística `EV_Risco`. |
| 3. Estimar impacto e decidir a próxima ação. | 3. Investigar causas, comparar opções e executar apenas Zero-Touch sem alçada. |
| 4. Contatar áreas e acompanhar aprovações manualmente. | 4. Persistir Actions/auditoria e encaminhar exceções às pessoas responsáveis. |

## Números da execução do motor

Os resultados abaixo foram impressos por `scripts/print_metrics.mjs` usando a cópia local do snapshot privado de referência. Nenhum registro do snapshot foi copiado para este repositório. Sem esse arquivo, o clone usa a demonstração sintética, com resultados diferentes.

| Indicador calculado | Resultado |
| --- | ---: |
| Pedidos únicos na entrada do motor | 2.000 |
| GMV na fila | R$ 220.161,37 |
| EV_Risco total estimado | R$ 97.456,36 |
| EV_Risco no Dia 1: FIFO | R$ 8.290,25 |
| EV_Risco no Dia 1: prioridade por EV_Risco | R$ 22.998,23 |
| Incremento de EV_Risco priorizado no Dia 1 | R$ 14.707,98 |
| Zero-Touch elegível sem alçada humana | 327 (16,35% da fila) |
| Horas teóricas poupadas pelos casos autônomos | 65,4 h |
| Dias para processar a fila a 150/dia: FIFO e prioridade | 14 dias em ambos |

EV_Risco priorizado é uma estimativa do motor e não dinheiro recuperado nem perda observada como evitada. As horas são estimadas a partir dos casos elegíveis e dos 12 minutos por caso do enunciado. O desfecho real das tratativas não está na base.

## Como experimentar sem login

Abra a URL pública do deploy e use o painel **Agente**, sem criar conta. Exemplos: “Monte o plano de hoje”, “Investigue a Rota Express no Nordeste”, “O que fazer com o lote L2607-B?” e “Resolva o pedido `<id>`”. Os botões de aprovação persistem a decisão no store configurado.

O Telegram é opcional. Sem credenciais Groq, o agente usa o fallback determinístico. Para configurar o bot e o briefing, siga [docs/TELEGRAM.md](docs/TELEGRAM.md).

## O que é real × o que é simulado hoje

| Fluxo | Estado atual |
| --- | --- |
| Cálculo de custos, EV_Risco, prazos úteis, capacidade e fila | **Real e determinístico** no motor TypeScript. |
| Ações, estados internos e auditoria | **Persistidos** no Upstash quando configurado; senão, na memória do processo. Memória não compartilha estado entre instâncias de produção. |
| Aprovação humana | **Real e persistida** no store; pode ser feita na web ou no cartão do Telegram. |
| Zero-Touch na web sem Telegram | Estado interno `em_tratativa` persiste; envio ao cliente é **simulado**. |
| Telegram de demonstração configurado | Avisos são **enviados** ao chat de demonstração; a Action registra o efeito real nesse canal. Não são mensagens a clientes reais. |
| WhatsApp Business, ERP, WMS, gateway de pagamento e painel de transportadora | **Roadmap/simulados**; ainda não há chamadas a esses sistemas. |
| LLM Groq | Escolhe tools e redige texto; é **opcional**. Nunca calcula valores ou prazos. |

O agente não marca um pedido como resolvido só por preparar uma ação. O Zero-Touch o coloca em `em_tratativa`; a integração externa indicada na Action não é considerada executada sem confirmação do canal.

### Comunicação

O sub-agente de Comunicação faz uma chamada própria ao modelo para redigir a mensagem usando fatos do motor. O texto passa pelo validador; sem Groq ou se a validação falhar, é usado um template determinístico. Na comunicação individual, o rascunho fica registrado em uma Action `aguardando_aprovacao`; só após aprovação ele pode ser enviado, e apenas ao chat de demonstração do Telegram quando configurado. Rejeitar não envia a mensagem. No Zero-Touch sem alçada, a mensagem por marca é registrada na Action e na trilha de auditoria e segue sem aprovação individual; com Telegram configurado, é enviada ao chat de demonstração. Sem esse canal, o envio permanece simulado. Em nenhum desses fluxos o envio declara o pedido resolvido: seu estado interno é `em_tratativa`.

### O que aprendemos

- Prazo útil e deduplicação mudam a prioridade e o impacto calculado.
- SKUs ligados a regras precisam ser preservados; os demais podem ser anonimizados.
- Premissas sem fonte não devem virar números operacionais.
- A trilha deve separar rascunho, aprovação, envio e estado do pedido.

## Rodar localmente sem dados privados

Requisitos: Node.js e npm. Nenhuma chave Groq, Redis ou Telegram é necessária para abrir a demo.

```sh
npm install
npm run dev
```

Abra `http://localhost:3000`. Sem `data/private/snapshot_2000.json`, o projeto carrega `data/demo_fallback.json`. Para imprimir os totais do motor sobre a demo sintética:

```sh
npm run metrics -- --demo
```

Com o snapshot privado local, `npm run metrics` usa essa fonte e imprime apenas agregados do motor. Para testes e build: `npm test`, `npm run lint` e `npm run build`.

## Privacidade

Nenhum dado bruto (CSV, PDF, ZIP) ou `.env*` deve entrar no Git. `data/raw/` e `data/private/` permanecem ignorados; o snapshot privado não está no repositório. A demo e a fixture são sintéticas. Não copie IDs, mensagens ou registros privados para `public/`, documentação ou logs.

## Documentação do projeto

- [Metodologia e fórmulas](docs/METODOLOGIA.md)
- [Métricas, sensibilidade e limites](docs/METRICAS.md)
- [Visão 360° e implantação](docs/VISAO_360.md)
- [Telegram](docs/TELEGRAM.md)
- [Registro de trabalho assistido por IA](docs/AI_LOG.md)
