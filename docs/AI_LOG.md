# Registro de alterações assistidas por IA

## 2026-11-21 — Ações persistidas e integração honesta

- **Pedido:** criar ciclo de vida de ações, store Upstash com fallback em memória, persistência dos estados e auditoria, aprovação via API, atualizar fila após execução, esclarecer efeitos simulados e separar os painéis da interface.
- **Correção durante a tarefa:** a interface anterior registrava aprovação apenas em estado React e usava rótulos de resolução sem efeito persistido. Substituí isso por transições validadas, gravação no store, recarga do histórico via API e estados honestos. Corrigi tipos e integrações encontrados na compilação incremental.
- **Decisão:** conforme escolha do usuário, um aviso Zero-Touch simulado move o pedido para `em_tratativa`: a alteração da fila é real e persistida; o envio de mensagem continua simulado. Aprovações exigidas ficam pendentes até decisão persistida.
- **Validação:** cobertura de ciclo, memória sem credenciais, mudança de estado/fila e idempotência; testes, lint e build passaram. Sem credenciais Upstash, os dados duram enquanto o processo de memória estiver ativo (até sete dias de TTL lógico).

## 2026-11-21 — Endurecimento do motor, higiene e proteção de API

- **Pedido:** corrigir mojibake, centralizar e documentar parâmetros, alinhar cálculos financeiros à margem, separar causas-raiz, expirar pagamentos, gerar burn-down, criar fixture/testes/CI, limitar chamadas à API e ampliar o hash anonimizado.
- **Correção durante a tarefa:** um teste inicial esperava a promessa para terça-feira, mas o próprio SLA acrescenta um dia útil de preparação além do transporte; corrigi a expectativa para quarta-feira. O build também revelou um tipo de aprovação desatualizado após tornar explícito que a aprovação só existe na sessão; atualizei o tipo e validei novamente.
- **Decisão:** valores sem origem financeira demonstrável foram removidos ou derivados dos dados. O prazo usa um dia útil de preparação como premissa editável. Aprovações e lotes são apresentados como preparados/registrados na sessão, pois nenhuma ação é persistida em sistema externo.
- **Validação:** `npm test`, `npm run lint` e `npm run build` passaram; o teste automatizado de mojibake passou. A demo e fixture são sintéticas. O snapshot privado local permaneceu ignorado pelo Git.

## 2026-11-21 — Laço de trabalho e especialistas do agente

- **Pedido:** substituir a chamada de ferramenta única por orquestração limitada, papéis especialistas, ferramentas persistidas, escalada humana, validação numérica, fallback determinístico, trilha visível e testes com LLM mockado.
- **Correção durante a tarefa:** o primeiro build apontou um campo `objective` fora do schema `objetivo`; corrigi o mapeamento. A revisão também mostrou que o Zero-Touch poderia incluir pedidos com alçada e que o fallback não anexava a trilha às ações: filtrei a alçada antes da execução e persisti a trilha em cada ação gerada.
- **Decisão:** cada pedido de plano usa seis rodadas no máximo; a demonstração sem chave roda a sequência determinística com as mesmas tools. A recomendação de resolução compara reenvio (CMV + frete + contato + LTV), reembolso (valor pago + contato + LTV) e aguardar (EV_Risco), usando somente valores do motor. Casos com alçada ficam pendentes para o papel humano responsável.
- **Validação:** testes mockados cobrem limite do loop, escalada sem efeito de estado, remoção de números não verificados e plano determinístico com Zero-Touch, duas escaladas, dossiê e chamado pendente.