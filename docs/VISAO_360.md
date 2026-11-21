# Visão 360° — colega agente para Operações

Um agente de Operações acompanha a rotina, age em sistemas autorizados, chama a pessoa certa quando encontra um limite e registra o que ocorreu. A prova de conceito demonstra esse ciclo em dados de referência e sintéticos; não é integração completa com a operação GoGroup.

## Seis frentes de trabalho

| Frente | O que o colega agente assumiria | Prova de conceito hoje | Roadmap / limite atual |
| --- | --- | --- | --- |
| **Prevenir** | Encontrar sinais recorrentes antes de novas exceções e sugerir contenção. | Calcula sete causas-raiz sobre a base fornecida e organiza evidências. | Ainda não monitora eventos em tempo real nem bloqueia lote, catálogo ou rota em ERP/WMS. A prevenção exige dados e autorização de escrita. |
| **Triar** | Ler a fila, priorizar impacto e separar autonomia de alçada. | O motor calcula EV_Risco, ordena fila e identifica Zero-Touch e pedidos que exigem revisão. | A prioridade depende da qualidade e atualização do snapshot/CSV recebido. |
| **Investigar** | Cruzar rota, lote, máquina, turno, CD e pedido para explicar a causa. | Tools geram dossiês com contagens, custos e evidências numéricas do motor. | Não consulta sistemas de origem em tempo real; correlação não prova causalidade. |
| **Resolver** | Executar passos reversíveis e acompanhar os casos que precisam de decisão. | Persiste Actions, estados e auditoria; executa o estado interno Zero-Touch e usa aprovação humana para casos em alçada. | Reembolso, reenvio, bloqueio de lote e alterações operacionais externas não são executados hoje. |
| **Comunicar** | Atualizar cliente e transportadora no canal da rotina, com política e contexto da marca. | Bot do Telegram recebe comandos da equipe, publica cartões de aprovação e pode enviar avisos ao chat privado de demonstração. | O chat de cliente é de demonstração. WhatsApp Business e chamados reais em painéis externos ainda não estão conectados. |
| **Aprender** | Comparar recomendação com resultado, corrigir premissas e reduzir recorrência. | Mantém trilha de auditoria, Actions e registro de mudanças assistidas por IA. | A base não inclui desfecho das tratativas; não há ciclo de aprendizado automático nem atribuição causal de resultado. |

## Onde as pessoas continuam no controle

O motor aplica alçadas configuradas em `lib/params.ts`: clientes VIP, pedidos acima do limite de valor, ruptura, baixa confiança e ações sistêmicas são encaminhados a papéis humanos responsáveis. A pessoa aprova ou rejeita no painel web ou no cartão do Telegram. Uma Action pendente não muda o pedido para resolvido; o Zero-Touch atualiza o estado interno para `em_tratativa`, sem declarar que o problema externo foi solucionado.

Alçadas e papéis ainda são premissas configuráveis que precisam ser validadas com Operações, Financeiro, Supply, Logística e áreas técnicas antes de qualquer piloto de escrita em sistemas reais.

## Integrações necessárias

| Sistema/canal | Para que serviria | Situação |
| --- | --- | --- |
| ERP | Consultar pedidos, aprovar reembolso/reenvio e registrar execução. | Não conectado; ações externas são simuladas. |
| WMS | Consultar estoque, lote, separação, turno e bloquear/inspecionar lote autorizado. | Não conectado; a demo usa campos do dataset. |
| Painéis/APIs de transportadoras | Consultar tracking/SLA, abrir e acompanhar chamados. | Não conectado; chamado é Action pendente de aprovação. |
| WhatsApp Business | Enviar mensagem aprovada e receber resposta do cliente. | Roadmap. Telegram envia apenas para o chat de demonstração configurado. |
| Gateway de pagamento | Confirmar pagamento, expiração, estorno e status da cobrança. | Não conectado; regras de pagamento são estimadas pelo motor. |
| Store persistente | Compartilhar ações e idempotência entre as funções de API. | Upstash Redis REST quando configurado; sem ele, a memória vale apenas durante a vida do processo. |

## Primeiro passo de implantação em 30 dias

| Período | Entrega e critério de saída |
| --- | --- |
| Dias 1–5 | Mapear fila, responsáveis, alçadas, política de contato e definições de “tratado” e “resolvido”; validar com a equipe os dados e premissas. |
| Dias 6–10 | Conectar uma fonte em leitura (por exemplo, export controlado de ERP/WMS) e comparar o motor com a triagem manual, sem escrever em sistemas. |
| Dias 11–20 | Rodar em sombra com uma equipe/recorte acordado; registrar recomendação, decisão humana e desfecho para medir falsos positivos, tempo e resultado real. |
| Dias 21–30 | Revisar evidências e segurança. Só propor uma ação externa limitada se donos dos sistemas aprovarem a integração, idempotência, reversão e alçadas. |

O cronograma é uma proposta de implantação, não uma promessa de integração concluída em 30 dias.

## Riscos e controles

- **Premissas ou dados incompletos:** resultados podem mudar com a fonte; controlar por versão do dataset, auditoria e revisão das premissas.
- **Ação externa indevida:** exigir alçada determinística, confirmação humana nas exceções e idempotência por ação/update.
- **Confusão entre execução e resolução:** exibir efeito real ou simulado, estado interno e evidência persistida separadamente.
- **Erro ou número inventado pelo LLM:** valores e prazos vêm do motor; texto do modelo é validado contra os resultados das tools.
- **Privacidade/LGPD:** minimizar identificadores, restringir chats e acessos, definir retenção e não versionar dados brutos; antes de produção, revisar base legal, finalidade e controles com a organização.
- **Falha de integração ou indisponibilidade de IA:** fallback determinístico mantém a demonstração; integração real precisa de monitoramento, retry e plano de recuperação próprios.

O resultado real só poderá ser afirmado depois de medir desfechos operacionais observados, não apenas EV_Risco calculado.
