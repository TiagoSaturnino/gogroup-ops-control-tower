export type AgentRole = 'orquestrador' | 'triagem' | 'investigador' | 'comunicacao';

export const ROLES: Record<AgentRole, { prompt: string; alçada: string; tools: string[] }> = {
  orquestrador: {
    prompt: 'Orquestre a solicitação, delegando triagem, investigação e comunicação pelas tools. Consolide fatos e decisões. Nunca calcule valores ou prazos.', alçada: 'Coordena o fluxo; não aprova exceções nem executa ações que exijam aprovação.',
    tools: ['listar_fila','detalhar_pedido','comparar_opcoes_resolucao','investigar_causa','executar_lote_zero_touch','abrir_chamado_transportadora','redigir_mensagem_cliente','escalar_para_humano'],
  },
  triagem: {
    prompt: 'Triagem: leia a fila priorizada pelo motor. Separe Zero-Touch autônomo, análise individual e casos que exigem humano. Não contorne alçadas.', alçada: 'Executa somente casos marcados autônomos pelo motor; VIP, valor acima do limite, ruptura e sistêmicos vão a humano.',
    tools: ['listar_fila','detalhar_pedido','comparar_opcoes_resolucao','executar_lote_zero_touch','escalar_para_humano'],
  },
  investigador: {
    prompt: 'Investigador: cruze pedidos com rota, lote, máquina, turno e CD. Use os números e evidências das tools; recomende processo e custo recorrente calculado pelo motor.', alçada: 'Investiga e recomenda; não autoriza reembolso, reenvio nem contato externo.',
    tools: ['listar_fila','detalhar_pedido','comparar_opcoes_resolucao','investigar_causa','abrir_chamado_transportadora','escalar_para_humano'],
  },
  comunicacao: {
    prompt: 'Comunicação: escreva com empatia, tom compatível com a marca e política. Não prometa data, reembolso ou solução sem autorização. Rascunhos aguardam aprovação humana; com Telegram configurado, o envio só ocorre no chat de demonstração após aprovação.', alçada: 'Redige rascunhos e aguarda aprovação humana antes de qualquer envio externo.',
    tools: ['detalhar_pedido','redigir_mensagem_cliente'],
  },
};

export const TOOL_ROLE: Record<string, AgentRole> = {
  listar_fila: 'triagem', detalhar_pedido: 'triagem', comparar_opcoes_resolucao: 'triagem',
  executar_lote_zero_touch: 'triagem', escalar_para_humano: 'triagem',
  investigar_causa: 'investigador', abrir_chamado_transportadora: 'investigador',
  redigir_mensagem_cliente: 'comunicacao',
};

export const TOOL_DEFINITIONS = [
  { type: 'function', function: { name: 'listar_fila', description: 'Lista os pedidos ativos priorizados pelo EV_Risco calculado.', parameters: { type: 'object', properties: { limite: { type: 'integer' }, filtro: { type: 'string' } } } } },
  { type: 'function', function: { name: 'detalhar_pedido', description: 'Retorna evidências determinísticas de um pedido.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'comparar_opcoes_resolucao', description: 'Compara custos determinísticos de reenvio, reembolso e aguardar.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'investigar_causa', description: 'Monta dossiê numérico para causa-raiz.', parameters: { type: 'object', properties: { id_causa: { type: 'string' } }, required: ['id_causa'] } } },
  { type: 'function', function: { name: 'executar_lote_zero_touch', description: 'Executa avisos simulados apenas em pedidos autônomos sem alçada humana.', parameters: { type: 'object', properties: { categoria: { type: 'string' } }, required: ['categoria'] } } },
  { type: 'function', function: { name: 'abrir_chamado_transportadora', description: 'Registra chamado simulado para transportadora e aguarda aprovação humana.', parameters: { type: 'object', properties: { transportadora: { type: 'string' }, pedidos: { type: 'array', items: { type: 'string' } } }, required: ['transportadora','pedidos'] } } },
  { type: 'function', function: { name: 'redigir_mensagem_cliente', description: 'Chama o sub-agente de Comunicação para redigir e persistir um rascunho pendente de aprovação.', parameters: { type: 'object', properties: { id: { type: 'string' }, objetivo: { type: 'string' } }, required: ['id','objetivo'] } } },
  { type: 'function', function: { name: 'escalar_para_humano', description: 'Cria ação pendente de aprovação com responsável e opções calculadas.', parameters: { type: 'object', properties: { id: { type: 'string' }, motivo: { type: 'string' }, quem_deve_decidir: { type: 'string' }, opcoes: { type: 'array', items: { type: 'string' } }, confianca: { type: 'string', enum: ['baixa','media','alta'] } }, required: ['id','motivo','quem_deve_decidir','opcoes'] } } },
] as const;
