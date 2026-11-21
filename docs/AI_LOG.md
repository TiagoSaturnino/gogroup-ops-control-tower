# Registro de trabalho assistido por IA

## 2026-11-21 — Tarefa A: motor, higiene e API

- **Problema → causa:** prazo exibido em dias corridos → a regra não considerava preparação e SLA em dias úteis.
- **Correção:** cálculo com calendário útil e feriados oficiais; o teste foi atualizado para refletir a preparação parametrizada.
- **Lição:** datas prometidas precisam ser calculadas pelo mesmo motor e calendário usados na operação.
- **Problema → causa:** pedidos duplicados inflavam fila e valores → identificadores repetidos eram tratados como pedidos distintos.
- **Correção:** deduplicação no preparo do snapshot e fixture de teste.
- **Lição:** validar a chave de negócio antes de somar qualquer impacto.
- **Problema → causa:** probabilidade de cancelamento de ruptura sem fonte → a regra usava um número inventado.
- **Correção:** parâmetros centralizados e identificados como dado oficial ou premissa; riscos sem fonte foram removidos ou derivados.
- **Lição:** toda constante de negócio precisa de origem explícita e sensibilidade quando for premissa.
- **Problema → causa:** mojibake em prompts, dados de demonstração e documentação → conversão de texto inconsistente.
- **Correção:** strings revisadas em UTF-8, dataset de demonstração regenerado e verificação automatizada adicionada.
- **Lição:** validar codificação também é parte da qualidade dos dados.
- **Problema → causa:** constantes sem origem e valores fixos no motor → hipóteses estavam escondidas em código e benchmark.
- **Correção:** parâmetros documentados em `lib/params.ts`; valores sem justificativa foram derivados dos dados ou retirados.
- **Lição:** fórmulas e premissas devem ser auditáveis fora da implementação.

## 2026-11-21 — Tarefa B: ações e persistência

- **Problema → causa:** a interface dizia “resolvido” sem efeito persistido → ações e aprovações viviam apenas no estado do navegador.
- **Correção:** ciclo de vida de Actions, store com Upstash e fallback em memória, atualização da fila e rótulos de efeito honesto.
- **Lição:** estado interno persistido, mensagem enviada e problema resolvido são fatos diferentes.
- **Decisão:** conforme escolha do usuário, Zero-Touch move o pedido para `em_tratativa`, sem declarar resolução externa.

## 2026-11-21 — Tarefa C: orquestração e especialistas

- **Problema → causa:** agente roteava uma ferramenta e o modelo não tinha fluxo de trabalho nem contexto adequado → implementação de uma única chamada.
- **Correção:** loop limitado, papéis especialistas, tools que consultam o motor/store, escalada humana, trilha e fallback determinístico.
- **Problema → causa:** o primeiro build encontrou `objective` fora do schema `objetivo`; a revisão também identificou itens com alçada no lote e trilha ausente no fallback.
- **Correção:** mapeamento alinhado, filtros de alçada e persistência da trilha nas Actions.
- **Decisão:** comparação de opções segue a regra confirmada pelo usuário; valores vêm exclusivamente do motor. Casos de alçada aguardam aprovação.

## 2026-11-21 — Tarefa D: Telegram

- **Problema → causa:** webhook e callbacks precisavam compartilhar autenticação, estado e idempotência; primeiro build também conflitou com runtime explícito e Cache Components.
- **Correção:** runtime Node padrão, secret token, autorização de chats, `update_id` com TTL, ações compartilhadas e escaping MarkdownV2.
- **Decisão:** `/causas` exibe as sete causas atuais. Efeito real de mensagem só é registrado após confirmação do Telegram no chat de demonstração; outras integrações permanecem simuladas.
- **Validação registrada na tarefa:** 24 testes, lint e build passaram; foi corrigida incompatibilidade de runtime e o import da rota nos testes.

## 2026-11-21 — Tarefa E: defesa e métricas

- **Pedido:** explicar solução e limites, calcular métricas do motor, sensibilidade, visão de implantação, pitch, sabatina e licença sem inventar números.
- **Correção durante a tarefa:** os documentos recebidos estavam com sequências de mojibake e o log não estava cronológico; reescrevi o registro e alinhei números aos agregados reproduzíveis por `scripts/print_metrics.mjs`.
- **Decisão:** horas são estimativas teóricas, ações autônomas não são chamadas resolvidas, e EV priorizado não é perda comprovadamente evitada. Marina é apresentada como persona representativa, não pessoa entrevistada. Sensibilidades são cenários, não fatos.
- **Lição:** a defesa deve distinguir cálculo, efeito persistido e resultado operacional observado.
- **Validação:** `npm run metrics` imprimiu apenas agregados do snapshot local; `npm run metrics -- --demo` confirmou execução sem snapshot privado. `npm test` passou com 24 testes, `npm run lint` passou e `npm run build` passou. A busca por sequências de mojibake nos arquivos de código e documentação retornou vazia.
