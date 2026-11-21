# Registro de alterações assistidas por IA

## 2026-11-21 — Endurecimento do motor, higiene e proteção de API

- **Pedido:** corrigir mojibake, centralizar e documentar parâmetros, alinhar cálculos financeiros à margem, separar causas-raiz, expirar pagamentos, gerar burn-down, criar fixture/testes/CI, limitar chamadas à API e ampliar o hash anonimizado.
- **Correção durante a tarefa:** um teste inicial esperava a promessa para terça-feira, mas o próprio SLA acrescenta um dia útil de preparação além do transporte; corrigi a expectativa para quarta-feira. O build também revelou um tipo de aprovação desatualizado após tornar explícito que a aprovação só existe na sessão; atualizei o tipo e validei novamente.
- **Decisão:** valores sem origem financeira demonstrável foram removidos ou derivados dos dados. O prazo usa um dia útil de preparação como premissa editável. Aprovações e lotes são apresentados como preparados/registrados na sessão, pois nenhuma ação é persistida em sistema externo.
- **Validação:** `npm test`, `npm run lint` e `npm run build` passaram; o teste automatizado de mojibake passou. A demo e fixture são sintéticas. O snapshot privado local permaneceu ignorado pelo Git.
