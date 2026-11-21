# Pitch — Torre de Controle AI-First (5 minutos)

## Slide 1 — Problema e usuária

- Marina: persona representativa de analista de Operações de Gocase/GoBeauté.
- Fila de referência do motor: 2.000 pedidos; capacidade oficial: 150 tratativas/dia.
- Decidir prioridade e próxima ação sem confundir estimativa com resolução.

**Fala (~35 s):** “Marina representa quem precisa organizar exceções de pedido entre entrega, pagamento, endereço e produto. A base de referência tem dois mil pedidos e a capacidade informada é de cento e cinquenta tratativas por dia. O desafio não é só ver a fila: é decidir o que pode avançar com segurança, o que precisa de investigação e quando levantar a mão. Marina é uma persona de apresentação; não estamos dizendo que entrevistamos uma pessoa real da GoGroup.”

## Slide 2 — Dor em números

- GMV na fila: **R$ 220.161,37**; EV_Risco estimado: **R$ 97.456,36**.
- Capacidade: **150/dia** × **12 min/caso** = **30 h/dia** equivalentes.
- Dia 1: FIFO **R$ 8.290,25** vs prioridade **R$ 22.998,23** de EV_Risco.

**Fala (~35 s):** “Esses são agregados calculados pelo motor sobre o snapshot privado de referência disponível durante a preparação. O EV_Risco não é uma perda contábil confirmada: é a estimativa usada para ordenar casos. Com a mesma capacidade de cento e cinquenta, FIFO coloca oito mil duzentos e noventa reais de risco estimado no Dia 1; a prioridade por risco coloca vinte e dois mil novecentos e noventa e oito. Vamos mostrar como o time pode revisar essa escolha.”

## Slide 3 — Como é hoje

- Referência manual do desafio: receber fila e conferir dados da exceção.
- Recalcular urgência e decidir tratamento caso a caso.
- Contatar área/cliente e acompanhar decisão e resultado.

**Fala (~35 s):** “A sequência representa a rotina que estamos propondo validar com Operações, não um mapeamento já feito dentro da empresa. Quando a análise fica dispersa, a pessoa precisa cruzar fatos e justificar prioridade repetidamente. A prova de conceito centraliza esses dados e torna explícito o que o motor calculou, o que o agente registrou e o que continua aguardando uma decisão humana.”

## Slide 4 — O agente e o papel da IA

- Orquestrador delega a Triagem, ao Investigador e à Comunicação.
- TypeScript é a única fonte de números, prazos, EV e alçadas.
- Tools criam Actions; casos de alçada aguardam aprovação.

**Fala (~35 s):** “A IA atua como colega de trabalho na conversa: entende o pedido, escolhe a próxima ferramenta e consolida a resposta. Ela não calcula dinheiro nem prazo. O motor determinístico faz essas contas e aplica as travas; as tools consultam e registram ações. Quando existe VIP, ruptura, valor acima da alçada, causa sistêmica ou dúvida, o agente chama o responsável em vez de executar sozinho.”

## Slide 5 — Demo ao vivo

- No chat de equipe, enviar `/plano` e ler fila, impacto estimado e plano.
- Abrir um cartão de alçada e escolher **Ver detalhes**.
- Tocar em **Aprovar**; recarregar a interface web e conferir Action/auditoria.

**Fala (~35 s):** “Vou começar no Telegram com o plano do dia. O bot usa o mesmo motor e o mesmo store da interface web. Depois abro um cartão de alçada para mostrar as opções calculadas, a recomendação e quem decide. Ao aprovar, o bot edita a mensagem; em seguida atualizo a página para conferir que a Action e a auditoria vieram do store, não de um estado temporário do navegador. Mensagens a cliente ficam no chat de demonstração.”

**Transição para a demo:** “Até aqui vimos a decisão; agora vou seguir a evidência de ponta a ponta, do comando ao registro compartilhado.”

## Slide 6 — Resultados e métricas

- **327** casos autônomos elegíveis; **65,4 h** teóricas com 12 min/caso.
- Incremento de EV_Risco priorizado no Dia 1: **R$ 14.707,98** vs FIFO.
- Fila de 2.000: **14 dias** a 150/dia, em FIFO e prioridade.

**Fala (~35 s):** “O motor separa trezentos e vinte e sete casos elegíveis sem alçada e calcula sessenta e cinco vírgula quatro horas teóricas. Isso depende da premissa oficial de doze minutos por caso. A prioridade desloca quatorze mil setecentos e sete reais e noventa e oito centavos de EV_Risco para a capacidade do Dia 1, comparada com FIFO. O tamanho da fila e a capacidade permanecem iguais, então os dois métodos levam quatorze dias. Não afirmamos que esse risco foi efetivamente evitado.”

## Slide 7 — Visão 360° e próximo passo

- Seis frentes: prevenir, triar, investigar, resolver, comunicar e aprender.
- Hoje: triagem/dossiê, Actions, alçada e Telegram de demonstração.
- Próximo passo: piloto em sombra, com integração de leitura e desfechos observados.

**Fala (~35 s):** “A visão completa inclui prevenção, investigação e aprendizado com desfechos, mas a prova de conceito cobre principalmente triagem, dossiês, persistência, aprovação e comunicação de demonstração. O primeiro passo de implantação é validar processo, políticas e dados com os donos da operação e rodar em sombra. Só depois conectamos ERP, WMS, transportadoras, pagamento ou WhatsApp, com permissões específicas e teste de reversão.”

## Slide 8 — Aprendizados e o que falta

- Corrigir datas, deduplicar e documentar cada premissa muda a decisão.
- Aprovação, execução interna e resolução externa são estados diferentes.
- Medir desfechos reais é necessário antes de falar em perda evitada.

**Fala (~35 s):** “O aprendizado principal é que transparência faz parte da automação: prazo útil, pedido duplicado e premissa sem origem mudam o resultado. Também aprendemos a separar uma Action executada no store de um problema resolvido no sistema externo. Ainda faltam integrações reais e dados de resultado para medir taxa de resolução e perda realmente evitada. O próximo passo seria um piloto supervisionado, com critérios de sucesso combinados com a equipe.”

## Plano B para a demo

- Captura da interface com KPIs, fila, linha do tempo e causa investigada.
- Captura do cartão Telegram com opções, recomendação e alçada; segunda captura após aprovação refletida na web.
- Vídeo curto gravado antes da apresentação: `/plano` → cartão → aprovação → recarga da interface. Se Telegram estiver indisponível, declarar a falha e demonstrar o fluxo determinístico na interface sem chamar isso de envio real.
