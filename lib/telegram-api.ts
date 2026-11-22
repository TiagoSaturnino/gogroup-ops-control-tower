import type { Action } from './actions';
import { getActionStore } from './store';

export type TelegramConfig = { token: string; secret: string; teamChatId: string; demoCustomerChatId: string };
export function getTelegramBotConfig() {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_TEAM_CHAT_ID: teamChatId } = process.env;
  return token && teamChatId ? { token, teamChatId } : null;
}
export function getTelegramCustomerConfig() {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_DEMO_CUSTOMER_CHAT_ID: demoCustomerChatId } = process.env;
  return token && demoCustomerChatId ? { token, demoCustomerChatId } : null;
}
export function getTelegramConfig(): TelegramConfig | null {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, TELEGRAM_TEAM_CHAT_ID: teamChatId, TELEGRAM_DEMO_CUSTOMER_CHAT_ID: demoCustomerChatId } = process.env;
  return token && secret && teamChatId && demoCustomerChatId ? { token, secret, teamChatId, demoCustomerChatId } : null;
}
async function telegramApi<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try { response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000), cache: 'no-store' }); }
  catch { throw new Error('Não foi possível conectar à Bot API do Telegram.'); }
  let payload: { ok?: boolean; result?: T };
  try { payload = await response.json() as typeof payload; } catch { throw new Error('Resposta inválida da Bot API do Telegram.'); }
  if (!response.ok || !payload.ok || payload.result === undefined) throw new Error('A Bot API do Telegram recusou a operação.');
  return payload.result;
}

export async function sendTelegramMessage(token: string, chatId: string, text: string, extra: Record<string, unknown> = {}) {
  return telegramApi<{ message_id: number }>(token, 'sendMessage', { chat_id: chatId, text: text.slice(0, 4096), ...extra });
}
export async function editTelegramMessage(token: string, chatId: string, messageId: number, text: string, extra: Record<string, unknown> = {}) {
  return telegramApi<{ message_id: number }>(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text: text.slice(0, 4096), ...extra });
}
export async function answerTelegramCallback(token: string, callbackQueryId: string, text: string) {
  return telegramApi<boolean>(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text: text.slice(0, 180), show_alert: false });
}

export async function sendZeroTouchTelegram(action: Action, orders: Array<{ order_id: string; marca?: string | null }>, store = getActionStore(), draftsByBrand?: Record<string, string>) {
  const config = getTelegramCustomerConfig();
  if (!config) return { configured: false, complete: false, sentOrderIds: [] as string[] };
  const operationKey = `zero-touch-message:${action.id}`;
  const sentOrderIds: string[] = [];
  const byBrand = new Map<string, string[]>();
  for (const order of orders) { const brand = order.marca || 'GoGroup'; byBrand.set(brand, [...(byBrand.get(brand) ?? []), order.order_id]); }
  for (const [brand, ids] of byBrand) {
    const draft = draftsByBrand?.[brand];
    if (draft) {
      const marker = `${operationKey}:${brand}:draft`;
      if (!await store.claimTelegramOperation(marker)) { sentOrderIds.push(...ids); continue; }
      try { await sendTelegramMessage(config.token, config.demoCustomerChatId, draft); }
      catch { await store.releaseTelegramOperation(marker); return { configured: true, complete: false, sentOrderIds }; }
      sentOrderIds.push(...ids);
      continue;
    }
    const chunks: string[][] = []; let chunk: string[] = [];
    for (const id of ids) {
      const candidate = [...chunk, id];
      const preview = `Olá! ${brand} está acompanhando seu pedido${candidate.length === 1 ? '' : 's'} ${candidate.join(', ')}. Esta é uma mensagem real no canal de demonstração do Telegram.`;
      if (preview.length > 3500 && chunk.length) { chunks.push(chunk); chunk = [id]; } else chunk = candidate;
    }
    if (chunk.length) chunks.push(chunk);
    for (let index = 0; index < chunks.length; index++) {
      const marker = `${operationKey}:${brand}:${index}`;
      if (!await store.claimTelegramOperation(marker)) { sentOrderIds.push(...chunks[index]); continue; }
      const idsInChunk = chunks[index], body = `Olá! ${brand} está acompanhando seu pedido${idsInChunk.length === 1 ? '' : 's'} ${idsInChunk.join(', ')}. Esta é uma mensagem real no canal de demonstração do Telegram.`;
      try { await sendTelegramMessage(config.token, config.demoCustomerChatId, body); }
      catch { await store.releaseTelegramOperation(marker); return { configured: true, complete: false, sentOrderIds }; }
      sentOrderIds.push(...idsInChunk);
    }
  }
  return { configured: true, complete: true, sentOrderIds };
}
