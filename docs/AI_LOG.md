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

- **Pedido:** explicar solução e limites, calcular métricas do motor, sensibilidade, visão de implantação e licença sem inventar números.
- **Correção durante a tarefa:** os documentos recebidos estavam com sequências de mojibake e o log não estava cronológico; reescrevi o registro e alinhei números aos agregados reproduzíveis por `scripts/print_metrics.mjs`.
- **Decisão:** horas são estimativas teóricas, ações autônomas não são chamadas resolvidas, e EV priorizado não é perda comprovadamente evitada. Marina é apresentada como persona representativa, não pessoa entrevistada. Sensibilidades são cenários, não fatos.
- **Lição:** a defesa deve distinguir cálculo, efeito persistido e resultado operacional observado.
- **Validação:** `npm run metrics` imprimiu apenas agregados do snapshot local; `npm run metrics -- --demo` confirmou execução sem snapshot privado. `npm test` passou com 24 testes, `npm run lint` passou e `npm run build` passou. A busca por sequências de mojibake nos arquivos de código e documentação retornou vazia.

## 2026-11-21 — Tarefa F: demonstração compartilhada

- **Problema → causa:** avaliadores na demo pública compartilham estado do store, então ações e estados de pedidos de uma sessão podem afetar a fila de outra; sem um indicador, também não fica claro se o estado sobreviverá ao processo.
- **Decisão:** expor health sem segredos, mostrar o tipo de armazenamento, e oferecer reset com confirmação e rate limit. O reset limpa os dados operacionais e os identificadores de update sob o prefixo da demo, preservando somente o registro auditável do próprio reset. A fila volta ao dataset-base e a interface indica que ainda não há ações.
- **Lição:** demonstração compartilhada precisa de estado visível e um caminho explícito para restaurar o cenário, com o impacto sobre todos os visitantes informado antes da ação.
- **Validação:** health foi confirmado dinâmico conforme a documentação local do Next 16 com Cache Components. `npm test` passou com 27 testes, lint e build passaram. `npm run smoke -- http://127.0.0.1:3000` passou nas cinco etapas; o teste local leu 2.000 pedidos e o reset terminou com zero ações e estados.

## 2026-11-21 — Tarefas G/G2: auditoria e publicação

- **Pedido:** auditar histórico, segredos e dados sintéticos antes de publicar; corrigir SKUs/descrições sem quebrar causas-raiz; ajustar titular da licença e registrar a tarefa.
- **Problema → causa:** a primeira auditoria de publicação encontrou SKUs e descrições de demonstração sem o padrão fictício pedido. Uma execução intermediária do verificador também marcou as descrições como inválidas porque a codificação do terminal alterou o acento usado na expressão de comparação; a auditoria foi repetida com código Unicode e o teste unitário confirmou o padrão.
- **Correção:** os geradores preservam `APC-1067` somente no caso de vazamento do lote `L2607-B` e `KSH-nnnn` somente em ruptura; os demais SKUs usam `DEMO-nnn` e as descrições são genéricas e numeradas. O snapshot privado foi preservado e não foi impresso.
- **Verificação e resultado:** comparação na combinação data do pedido, valor, SKU, UF e transportadora encontrou zero colisões nos dois datasets. Histórico sem arquivos brutos/privados ou `.env*`, `git grep` sem padrões de segredo e dados sem campos de nome/email. `npm test` passou com 29 testes, lint e build passaram.
- **Decisão sobre a licença:** conforme instrução do usuário, o titular foi alterado de GoGroup para Tiago Saturnino, mudando somente essa linha. Os commits de fixtures e licença foram enviados para `origin/main` sem force; o registro desta auditoria foi commitado separadamente.
- **Lição:** a checagem precisa cobrir a história do Git e as combinações de dados, enquanto as exceções de teste devem ser estreitas, documentadas e exercitadas por teste.

## 2026-11-21 — Tarefa H1: separar consultas de ações

- **Pedido:** retirar consultas e simulações do ciclo de Actions, separar os KPIs, preservar o histórico legado sem classificá-lo como efeito e contar pedidos distintos processados por Zero-Touch.
- **Problema → causa:** ferramentas de leitura chamavam a rotina que persistia e executava Actions; por isso consultas podiam inflar o KPI de ações e gerar eventos/status enganosos.
- **Correção:** consultas e simulações agora gravam trilha `kind: consulta`; Actions com efeito permanecem no ciclo atual. O painel e a API classificam tipos de consulta antigos como consulta sem removê-los do store. O KPI autônomo deduplica IDs e exige Action Zero-Touch executada com pedido em `em_tratativa`.
- **Decisão:** `comunicacao_cliente` permanece fora dos tipos de consulta para que a H2 possa representá-la como Action com efeito; no comportamento atual, ela não altera o estado do pedido.
- **Erro corrigido no caminho:** o teste de histórico legado renderizado falhou porque Vitest não resolve o alias `@/`; o import do componente foi tornado relativo, mantendo a resolução compatível com Next. Uma asserção inicial também confundia o efeito simulado de Zero-Touch com cartões legados; ela passou a verificar somente os cartões de consulta.
- **Validação:** consultas, simulações, mudança de estado por efeito aprovado/Zero-Touch, contagem distinta e renderização de Actions legadas foram cobertas por testes. O snapshot privado permaneceu sem alterações.

## 2026-11-21 — Tarefa H2: sub-agente de Comunicação

- **Pedido:** tornar Comunicação uma chamada de modelo independente, persistir o rascunho como Action aprovável, enviar somente depois da aprovação e usar o mesmo sub-agente no Zero-Touch.
- **Problema → causa:** o papel Comunicação só constava no prompt geral do Orquestrador; a tool retornava política sem texto e não havia rascunho auditável para aprovar.
- **Correção:** criei `lib/agent/communication.ts` com prompt próprio, fatos limitados do motor, validador numérico e template determinístico. A tool persiste rascunho, modelo, fatos e papel responsável em `aguardando_aprovacao`; Zero-Touch grava mensagens por marca e adiciona etapas `comunicacao` à trilha. Aprovação envia ao chat Telegram de demonstração quando configurado; rejeição não envia e o estado do pedido não é alterado.
- **Erro corrigido no caminho:** uma edição intermediária via PowerShell recodificou `lib/agent/tools.ts`; restaurei esse arquivo do commit anterior e reapliquei apenas as mudanças necessárias por edição Node em UTF-8.
- **Decisão:** o texto gerado não pode prometer prazo ou valor; sem Groq ou com número não verificado, o rascunho usa template. O envio real é limitado ao chat de demonstração e permanece identificável como tal.
- **Lição:** um papel de agente só fica demonstrável quando existe chamada própria, saída visível, persistência e uma fronteira de aprovação observável.
- **Validação:** `npm test` passou com 40 testes; lint e build passaram após corrigir dois tipos nos testes. `npm run metrics` manteve os nove agregados de referência sem diff: 2.000 pedidos, EV_Risco R$ 97.456,36, Dia 1 FIFO R$ 8.290,25, prioridade R$ 22.998,23, incremento R$ 14.707,98, Zero-Touch 327/65,4 h e 14 dias.

## 2026-11-23 — Aprendizados de desenvolvimento assistido

| Data | O que a IA fez | Erro detectado | Correção humana | Aprendizado |
|---|---|---|---|---|
| 2026-11-23 [relato do autor] | Leitura inicial de contexto pelo Codex | A primeira leitura foi parcial e não sustentava as conclusões | Exigi evidências concretas antes de prosseguir | Contexto precisa ser conferido contra arquivos e histórico. |
| 2026-11-21 [relato do autor] | Anonimizou SKUs da demo | Exigir `DEMO-` em todos os SKUs quebraria regras de causa-raiz ligadas a `APC-1067` e `KSH-*` | Mantivemos SKUs necessários às regras e anonimizamos os demais; a verificação reportou zero colisões com o snapshot | Anonimização deve preservar os sinais funcionais e validar colisões. |
| 2026-11-21 [relato do autor] | Preparou dados para o repositório | O pacote recebido era um ZIP sem `.git` e sem `data/private` | O snapshot foi regenerado a partir da fonte disponível | Conferir proveniência e insumos antes de assumir que o pacote está completo. |
| 2026-11-21 [verificado no git] | Implementou o cálculo inicial de prazo e ingestão | Prazo em dias corridos e duplicatas distorciam o resultado | O motor passou a calcular dias úteis e a preparação deduplica os pedidos | Datas e chave de negócio precisam ser tratadas antes de priorizar e somar. |
| 2026-11-21 [relato do autor] | Análise inicial da IA apresentou uma hipótese para ruptura | O autor identificou a hipótese de cancelamento de 70–80% como inventada; ela não entrou no cálculo | Removemos a probabilidade sem fonte; o teto documentado passou a ser premissa explícita | Não transformar uma hipótese sem evidência em número operacional. |
| 2026-11-23 [relato do autor] | Retomou a tarefa sem contexto suficiente | A sessão do Codex perdeu o contexto do projeto | Mantemos um contexto fixo para reativá-lo | Revalidar invariantes e estado do repositório no início de cada sessão. |
