import { transitionAction, type Action } from './actions';
import { executeActionEffect, type ActionStore } from './store';
import { getTelegramCustomerConfig, sendTelegramMessage } from './telegram-api';

async function executeApprovedAction(action: Action, store: ActionStore) {
  let ready = action;
  if (ready.tipo === 'comunicacao_cliente') {
    const config = getTelegramCustomerConfig();
    if (config && ready.rascunho && ready.calculo.telegramSent !== true) {
      const operationId = `communication-send:${ready.id}`;
      if (!await store.claimTelegramOperation(operationId)) {
        const latest = await store.getAction(ready.id);
        if (!latest || latest.calculo.telegramSent !== true) throw new Error('O envio da mensagem já está em processamento.');
        ready = latest;
      } else {
        try {
          await sendTelegramMessage(config.token, config.demoCustomerChatId, ready.rascunho);
          ready = {
            ...ready,
            canal: 'telegram',
            calculo: { ...ready.calculo, telegramSent: true },
            efeito: { tipo: 'real', descricao: 'Rascunho aprovado enviado ao chat de demonstração do Telegram; pedido permanece em tratativa.', sistema: 'Telegram (chat cliente de demonstração)' },
          };
          await store.saveAction(ready);
        } catch (error) {
          await store.releaseTelegramOperation(operationId);
          throw error;
        }
      }
    }
  }
  return executeActionEffect(ready, store);
}

export async function decideAction(actionId: string, decision: 'aprovar' | 'rejeitar', store: ActionStore, actorName = 'Operador') {
  const action = await store.getAction(actionId);
  if (!action) return { status: 404, error: 'Ação não encontrada.' } as const;
  if (action.status === 'executada' || action.status === 'rejeitada') return { status: 200, action, repeated: true } as const;
  if (action.status === 'aprovada' && decision === 'aprovar') {
    try { return { status: 200, action: await executeApprovedAction(action, store), repeated: true } as const; }
    catch { return { status: 503, action, error: 'A aprovação foi persistida, mas o efeito interno falhou. Tente novamente.' } as const; }
  }
  if (action.status !== 'aguardando_aprovacao') return { status: 409, action, error: 'A ação já saiu da etapa de aprovação.' } as const;
  const approved = decision === 'aprovar', now = new Date().toISOString();
  const updated = transitionAction(action, approved ? 'aprovada' : 'rejeitada', 'humano');
  await store.saveAction(updated);
  await store.appendAudit({ id: `${action.id}:${approved ? 'aprovada' : 'rejeitada'}`, actionId: action.id, evento: approved ? 'aprovada' : 'rejeitada', responsavel: 'humano', ocorridaEm: now, descricao: approved ? `Aprovação humana registrada por ${actorName}.` : `Rejeição humana registrada por ${actorName}.` });
  if (!approved) return { status: 200, action: updated, repeated: false } as const;
  try { return { status: 200, action: await executeApprovedAction(updated, store), repeated: false } as const; }
  catch { return { status: 503, action: updated, error: 'A aprovação foi persistida, mas o efeito interno falhou. Tente novamente.' } as const; }
}
