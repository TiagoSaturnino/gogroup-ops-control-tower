export type ActionStatus = 'proposta' | 'aguardando_aprovacao' | 'aprovada' | 'rejeitada' | 'executada';
export type ActionType = 'zero_touch_aviso' | 'reenvio' | 'reembolso' | 'chamado_transportadora' | 'bloqueio_lote' | 'resolver_pedido' | 'simulacao' | 'consulta_fila' | 'comparacao' | 'investigacao' | 'comunicacao_cliente' | 'escalonamento';
const LEGACY_CONSULTATION_TYPES: ReadonlySet<ActionType> = new Set(['consulta_fila', 'comparacao', 'investigacao', 'simulacao']);
export function isConsultationActionType(type: ActionType) { return LEGACY_CONSULTATION_TYPES.has(type); }
export type Action = {
  id: string;
  orderIds: string[];
  tipo: ActionType;
  status: ActionStatus;
  responsavel: 'agente' | 'humano';
  canal: 'ui' | 'telegram' | 'simulado';
  impactoBrl: number;
  horasLiberadas: number;
  justificativa: string;
  calculo: Record<string, number | string | boolean | null>;
  criadaEm: string;
  atualizadaEm: string;
  efeito: { tipo: 'real' | 'simulado'; descricao: string; sistema: string };
  rascunho?: string;
  rascunhos?: Array<{ marca: string; texto: string; orderIds: string[] }>;
  trilhaAgente?: Array<{ round: number; papel: string; pensamentoResumido: string; tool: string; argumentos: Record<string, unknown>; resultado: unknown }>;
  telegramApprovalMessageId?: number;
};

export type OrderState = 'aberto' | 'em_tratativa' | 'resolvido' | 'cancelado';

export type AuditRecord = {
  id: string;
  actionId: string;
  evento: 'criada' | 'aprovada' | 'rejeitada' | 'executada' | 'texto_corrigido' | 'demo_reiniciada' | 'consultada';
  kind?: 'consulta' | 'acao';
  tool?: string;
  orderIds?: string[];
  responsavel: 'agente' | 'humano';
  ocorridaEm: string;
  descricao: string;
};

export function transitionAction(action: Action, status: ActionStatus, responsavel: Action['responsavel']): Action {
  const transitions: Record<ActionStatus, ActionStatus[]> = {
    proposta: ['aguardando_aprovacao'],
    aguardando_aprovacao: ['aprovada','rejeitada'],
    aprovada: ['executada'],
    rejeitada: [],
    executada: [],
  };
  if (!transitions[action.status].includes(status)) throw new Error(`Transição inválida: ${action.status} → ${status}`);
  return { ...action, status, responsavel, atualizadaEm: new Date().toISOString() };
}
