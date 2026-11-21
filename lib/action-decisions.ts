import { transitionAction } from './actions';
import { executeActionEffect, type ActionStore } from './store';

export async function decideAction(actionId: string, decision: 'aprovar' | 'rejeitar', store: ActionStore, actorName = 'Operador') {
  const action = await store.getAction(actionId);
  if (!action) return { status: 404, error: 'Ação não encontrada.' } as const;
  if (action.status === 'executada' || action.status === 'rejeitada') return { status: 200, action, repeated: true } as const;
  if (action.status === 'aprovada' && decision === 'aprovar') {
    try { return { status: 200, action: await executeActionEffect(action, store), repeated: true } as const; }
    catch { return { status: 503, action, error: 'A aprovação foi persistida, mas o efeito interno falhou. Tente novamente.' } as const; }
  }
  if (action.status !== 'aguardando_aprovacao') return { status: 409, action, error: 'A ação já saiu da etapa de aprovação.' } as const;
  const approved = decision === 'aprovar', now = new Date().toISOString();
  const updated = transitionAction(action, approved ? 'aprovada' : 'rejeitada', 'humano');
  await store.saveAction(updated);
  await store.appendAudit({ id: `${action.id}:${approved ? 'aprovada' : 'rejeitada'}`, actionId: action.id, evento: approved ? 'aprovada' : 'rejeitada', responsavel: 'humano', ocorridaEm: now, descricao: approved ? `Aprovação humana registrada por ${actorName}.` : `Rejeição humana registrada por ${actorName}.` });
  if (!approved) return { status: 200, action: updated, repeated: false } as const;
  try { return { status: 200, action: await executeActionEffect(updated, store), repeated: false } as const; }
  catch { return { status: 503, action: updated, error: 'A aprovação foi persistida, mas o efeito interno falhou. Tente novamente.' } as const; }
}
