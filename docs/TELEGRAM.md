# Bot do Telegram

O bot integra o chat da equipe ao mesmo motor, às mesmas tools e ao mesmo store da interface web. As decisões de custo, EV, capacidade e prazo continuam vindo de `lib/engine.ts`; o modelo escolhe etapas e redige texto, sem fazer contas.

## Configuração

1. No Telegram, abra `@BotFather`, use `/newbot`, escolha nome e username, e guarde o token como segredo. Adicione o bot ao grupo da equipe. Para receber comandos em grupo, envie `/comando@username_do_bot` se o modo de privacidade do BotFather estiver ativo.
2. Crie um chat privado para a demonstração de mensagens ao cliente e envie `/start` ao bot. Obtenha os IDs numéricos dos dois chats por uma ferramenta de inspeção de updates durante a configuração; não publique esses IDs.
3. Cadastre estas variáveis no ambiente de produção da Vercel:

   - `TELEGRAM_BOT_TOKEN`: token do BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: segredo aleatório, de 1 a 256 caracteres, usando letras, números, `_` ou `-`.
   - `TELEGRAM_TEAM_CHAT_ID`: ID numérico do chat da equipe autorizado a comandar e aprovar.
   - `TELEGRAM_DEMO_CUSTOMER_CHAT_ID`: ID numérico do chat privado de demonstração que recebe avisos Zero-Touch.
   - `CRON_SECRET`: segredo do endpoint de briefing; configure também esse mesmo valor no ambiente da Vercel.
   - `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: recomendados em produção para compartilhar ações e deduplicação entre funções. Sem eles, o app usa memória do processo.
   - `GROQ_API_KEY`: opcional; sem ela, o fallback determinístico responde aos comandos operacionais.

4. No ambiente local, defina `APP_BASE_URL` com a URL pública HTTPS do app e rode:

   ```sh
   node scripts/set_telegram_webhook.mjs
   ```

   O script chama `setWebhook` com `secret_token` e assina apenas `message` e `callback_query`. Ele não imprime nem inclui o token na saída.

O webhook valida `X-Telegram-Bot-Api-Secret-Token`, permite apenas os dois chats configurados e guarda `update_id` no store por sete dias. Se qualquer uma das quatro variáveis do bot não estiver configurada, `/api/telegram` responde `503`; os endpoints web continuam funcionando. O limite de mensagens operacionais é 500 caracteres e o rate limit é o mesmo do agente, por chat.

## Comandos e aprovação

- `/plano`: priorização do motor dentro da capacidade do dia, impacto EV_Risco, Zero-Touch e horas liberadas, aprovações pendentes e dias para esvaziar a fila.
- `/fila [n]`: amostra priorizada; o limite é de 1 a 50 pedidos.
- `/pedido <id>`: dossiê, comparação de reenvio/reembolso/aguardar e escalada quando houver alçada.
- `/causas`: exibe as sete causas atuais do motor. A avaria da Carga Norte e a ruptura de Kokeshi são causas independentes.
- `/aprovacoes`: lista pendências e republica cartões ainda sem mensagem.
- `/ajuda`: lista os comandos.

Ações que aguardam aprovação são publicadas no chat da equipe com pedido(s), exceção, custos calculados, recomendação, responsável e botões Aprovar, Rejeitar e Ver detalhes. A decisão passa pelo mesmo serviço de `POST /api/actions`; ela atualiza a ação, a auditoria e o estado interno e então edita a mensagem do Telegram. Repetir um callback já processado não duplica a decisão.

## Zero-Touch no canal de demonstração

Quando os quatro parâmetros de Telegram estão configurados, o lote Zero-Touch envia mensagens agrupadas por marca para `TELEGRAM_DEMO_CUSTOMER_CHAT_ID`. Cada mensagem e cada grupo de pedidos têm marcador de idempotência. A Action só recebe `efeito: real` e canal `telegram` após os envios terminarem; caso o chat não esteja configurado ou algum envio falhe, permanece com efeito externo simulado, embora o estado interno em `em_tratativa` continue persistido. O chat de demonstração não representa uma integração com clientes reais.

Em produção, o adaptador de comunicação ao cliente usaria a WhatsApp Business API, com templates e consentimento adequados. A integração real do Telegram fica identificada como canal de demonstração na Action e na interface.

## Briefing diário

`vercel.json` agenda `GET /api/cron/briefing` às 11:00 UTC, correspondente a 8:00 em Fortaleza. A rota exige `Authorization: Bearer $CRON_SECRET` e envia fila/capacidade, EV do Dia 1, Zero-Touch processado (separando avisos Telegram de itens ainda simulados), aprovações pendentes, três causas de maior EV exposto e dias para zerar a fila. Vercel registra crons estáticos pelo `vercel.json` no deploy de produção e invoca o caminho conforme a expressão cron. Veja a [referência oficial de `vercel.json`](https://vercel.com/docs/project-configuration/vercel-json).

## Como isso escala para Slack/WhatsApp

O motor, as tools, as Actions, as alçadas e o store são independentes do canal. Para Slack, substitua o adaptador Bot API por mensagens Block Kit e valide a assinatura dos requests interativos; mantenha IDs de ação nas ações dos botões e direcione as decisões ao mesmo serviço de aprovação. Para WhatsApp, mantenha o webhook e a decisão em um adaptador Cloud API, use templates aprovados para mensagens proativas e encaminhe botões interativos para `decideAction`. Não duplique cálculos nem regras por canal: ambos devem consumir os mesmos resultados do motor e persistir a mesma Action/auditoria.
