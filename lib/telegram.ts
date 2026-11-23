import type { Action } from './actions';
import { dashboard, loadDataset } from './tools';
import { getActionStore } from './store';
import { compareResolutionOptions } from './resolution';
import { getTelegramBotConfig, sendTelegramMessage } from './telegram-api';
export { getTelegramBotConfig, getTelegramConfig, sendTelegramMessage, editTelegramMessage, answerTelegramCallback } from './telegram-api';
export function escapeMarkdownV2(value: string) { return value.replace(/([_\*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1'); }

const fmtMoney = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'não calculado';
const val = (action: Action, key: string) => action.calculo[key];
export async function formatActionApproval(action: Action) {
  const data = await dashboard(loadDataset(), {}, getActionStore());
  const orders = data.orders.filter(order => action.orderIds.includes(order.order_id));
  const exceptions = [...new Set(orders.map(order => order.tipo_excecao))];
  const computed = orders.map(compareResolutionOptions);
  const costs = Object.fromEntries(['reenvio', 'reembolso', 'aguardar'].map(option => {
    const stored = val(action, `${option}Brl`);
    const calculated = computed.reduce((sum, comparison) => sum + (comparison.options.find(item => item.option === option)?.costBrl ?? 0), 0);
    return [option, typeof stored === 'number' ? stored : calculated];
  })) as Record<string, number>;
  const options = orders.length ? ['reenvio', 'reembolso', 'aguardar'].map(option => `• ${escapeMarkdownV2(option)}: ${fmtMoney(costs[option])}`).join('\n') : 'Sem pedidos elegíveis para comparação financeira.';
  const recommendation = String(val(action, 'recomendacao') ?? Object.entries(costs).sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'aguardando decisão humana');
  const owner = String(val(action, 'decisor') ?? 'Responsável operacional');
  const orderList = action.orderIds.slice(0, 25).map(escapeMarkdownV2).join(', ') || 'sem pedido associado';
  const draft = action.rascunho ? `\n*Rascunho para aprova\u00e7\u00e3o:*\n${escapeMarkdownV2(action.rascunho)}` : '';
  return `*Aprovação pendente*\n*Pedido${escapeMarkdownV2('(s)')}:* ${orderList}\n*Exceção:* ${escapeMarkdownV2(exceptions.join(', ') || action.tipo)}\n*Opções comparadas:*\n${options}\n*Recomendação:* ${escapeMarkdownV2(recommendation)}\n*Responsável:* ${escapeMarkdownV2(owner)}\n*Justificativa:* ${escapeMarkdownV2(action.justificativa)}${draft}`;
}

export async function notifyPendingTelegramActions(actions: Action[]) {
  const config = getTelegramBotConfig();
  if (!config) return;
  const store = getActionStore();
  for (const action of actions) {
    if (action.status !== 'aguardando_aprovacao' || action.telegramApprovalMessageId) continue;
    const operationKey = `approval-message:${action.id}`;
    if (!await store.claimTelegramOperation(operationKey)) continue;
    try {
      const text = await formatActionApproval(action);
      const message = await sendTelegramMessage(config.token, config.teamChatId, text, { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [
        [{ text: '✅ Aprovar', callback_data: `act:${action.id}:aprovar` }, { text: '❌ Rejeitar', callback_data: `act:${action.id}:rejeitar` }],
        [{ text: 'Ver detalhes', callback_data: `act:${action.id}:detalhes` }],
      ] } });
      await store.saveAction({ ...action, telegramApprovalMessageId: message.message_id });
    } catch { await store.releaseTelegramOperation(operationKey); throw new Error('Não foi possível publicar uma aprovação no Telegram.'); }
  }
}

