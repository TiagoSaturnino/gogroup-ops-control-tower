import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runAgentService } from '../../../lib/agent/service';
import { checkAgentRateLimit } from '../../../lib/ratelimit';
import { getActionStore } from '../../../lib/store';
import { decideAction } from '../../../lib/action-decisions';
import { answerTelegramCallback, editTelegramMessage, escapeMarkdownV2, formatActionApproval, getTelegramConfig, notifyPendingTelegramActions, sendTelegramMessage } from '../../../lib/telegram';
import { BUSINESS } from '../../../lib/params';

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TelegramMessage = { message_id: number; chat: { id: number }; text?: string; from?: TelegramUser };
type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: { id: string; data?: string; from: TelegramUser; message?: TelegramMessage } };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });
const markdown = (text: string) => sendTelegramMessage(getTelegramConfig()!.token, getTelegramConfig()!.teamChatId, text, { parse_mode: 'MarkdownV2' });
const money = (value: number) => escapeMarkdownV2(`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const HELP = `*Comandos disponíveis*\n/plano — plano operacional do dia\n/fila ${escapeMarkdownV2('[n]')} — pedidos ativos priorizados\n/pedido <id> — dossiê e opções\n/causas — sete causas-raiz com custo recorrente\n/aprovacoes — ações que aguardam decisão\n/ajuda — esta lista`;

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function collect(value: unknown, result: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return result;
  if ('tipo' in value && 'status' in value && 'orderIds' in value && 'efeito' in value) result.push(value as Record<string, unknown>);
  if (Array.isArray(value)) value.forEach(item => collect(item, result)); else Object.values(value).forEach(item => collect(item, result));
  return result;
}
function getStep(body: Record<string, unknown>, tool: string) {
  const steps = Array.isArray(body.steps) ? body.steps as Array<{ tool: string; resultado: unknown }> : [];
  return steps.find(step => step.tool === tool)?.resultado as Record<string, unknown> | undefined;
}

async function executeCommand(text: string, chatId: string) {
  const parsed = text.trim().match(/^(\/[a-z]+)(?:@[\w]+)?(?:\s+([\s\S]*))?$/i);
  if (!parsed) { await markdown('Use \/ajuda para ver os comandos disponíveis.'); return; }
  const command = parsed[1].toLowerCase(), argument = (parsed[2] ?? '').trim(), rateKey = `telegram:${chatId}`;
  if (command === '/ajuda') { const limit = checkAgentRateLimit(rateKey); await markdown(limit.allowed ? HELP : 'Limite de uso atingido. Tente novamente após 10 minutos.'); return; }
  if (command === '/aprovacoes') {
    const limit = checkAgentRateLimit(rateKey);
    if (!limit.allowed) { await markdown('Limite de uso atingido. Tente novamente após 10 minutos.'); return; }
    const store = getActionStore(), pending = (await store.listActions()).filter(action => action.status === 'aguardando_aprovacao');
    await notifyPendingTelegramActions(pending);
    const brief = pending.slice(0, 20).map(action => `• ${escapeMarkdownV2(action.orderIds.join(', ') || action.tipo)} — ${escapeMarkdownV2(String(action.calculo.decisor ?? 'Responsável operacional'))}`).join('\n');
    await markdown(pending.length ? `*Aguardando aprovação (${pending.length})*\n${brief}\nOs cartões com botões estão no chat.` : 'Não há ações aguardando aprovação.');
    return;
  }
  let prompt: string;
  if (command === '/plano') prompt = 'Monte o plano de hoje.';
  else if (command === '/fila') {
    const requested = argument ? Number(argument) : 10;
    if (!Number.isInteger(requested) || requested < 1 || requested > 50) { await markdown('Uso: /fila ' + escapeMarkdownV2('[n]') + ', com n entre 1 e 50.'); return; }
    prompt = `Liste a fila ativa priorizada pelo motor, limite ${Math.min(requested, 50)}. Não execute ações.`;
  } else if (command === '/pedido') {
    if (!/^[A-Z]{2}-?[A-Z0-9-]{3,24}$/i.test(argument)) { await markdown('Uso: \/pedido <id>.'); return; }
    prompt = `Investigue o pedido ${argument.toUpperCase()}, compare opções e escale se houver alçada. Não execute ação externa.`;
  } else if (command === '/causas') prompt = 'Investigue as sete causas-raiz atuais e mostre o custo recorrente calculado pelo motor.';
  else { await markdown('Comando não reconhecido. Use \/ajuda.'); return; }

  const service = await runAgentService(prompt, rateKey);
  if (service.status !== 200) { await markdown(escapeMarkdownV2(String(service.body.error ?? 'Falha ao executar o agente.'))); return; }
  const body = service.body as Record<string, unknown>;
  if (command === '/plano') {
    const snapshot = body.operationalSnapshot as { totalPedidos: number; capacidadeDiaria: number; evRiscoDia: number; diasParaZerar: number };
    const batch = getStep(body, 'executar_lote_zero_touch');
    const zeroTouch = collect(batch).find(action => action.tipo === 'zero_touch_aviso');
    const actions = [...new Map(collect(body.steps).map(action => [String(action.id), action])).values()], pending = actions.filter(action => action.status === 'aguardando_aprovacao').length;
    const count = Array.isArray(zeroTouch?.orderIds) ? zeroTouch.orderIds.length : 0;
    const hours = typeof zeroTouch?.horasLiberadas === 'number' ? zeroTouch.horasLiberadas : 0;
    const answer = `*Plano de hoje*\nFila ativa: ${snapshot.totalPedidos} pedidos; capacidade de hoje: ${Math.min(snapshot.totalPedidos, snapshot.capacidadeDiaria)} tratativas.\nEV_Risco protegido no Dia 1: ${money(snapshot.evRiscoDia)}.\nZero\-Touch: ${count} pedidos; ${escapeMarkdownV2(hours.toLocaleString('pt-BR'))} horas liberadas.\nAções aguardando aprovação: ${pending}.\nDias para zerar a fila: ${snapshot.diasParaZerar}.\n\n${escapeMarkdownV2(String(body.text ?? 'Plano calculado pelo motor.'))}`;
    await markdown(answer);
  } else if (command === '/fila') {
    const listing = getStep(body, 'listar_fila'), orders = Array.isArray(listing?.pedidos) ? listing!.pedidos as Array<Record<string, unknown>> : [];
    const rows = orders.slice(0, 20).map(order => `• ${escapeMarkdownV2(String(order.orderId))} — ${escapeMarkdownV2(String(order.tipo))} — ${money(Number(order.evBrl))}`).join('\n');
    await markdown(`*Fila priorizada*\n${rows || escapeMarkdownV2(String(body.text ?? 'Sem pedidos retornados.'))}`);
  } else if (command === '/pedido') {
    const detailResult = getStep(body, 'detalhar_pedido'), detail = detailResult?.pedido as Record<string, unknown> | undefined;
    const comparison = getStep(body, 'comparar_opcoes_resolucao');
    if (!detail) await markdown(escapeMarkdownV2(String(detailResult?.error ?? body.text ?? 'Pedido não encontrado.')));
    else {
      const options = comparison?.options as Array<{ option: string; costBrl: number }> | undefined;
      const costLines = options?.map(option => `• ${escapeMarkdownV2(option.option)}: ${money(option.costBrl)}`).join('\n') ?? 'Opções ainda não calculadas.';
      await markdown(`*Dossiê ${escapeMarkdownV2(String(detail.orderId))}*\nMarca: ${escapeMarkdownV2(String(detail.marca ?? 'não informada'))}\nExceção: ${escapeMarkdownV2(String(detail.tipo))}\nEV_Risco: ${money(Number(detail.evBrl))}\nAlçada humana: ${detail.requerAlcada ? 'sim' : 'não'}\n*Opções:*\n${costLines}\nRecomendação: ${escapeMarkdownV2(String(comparison?.recommended ?? 'aguardando avaliação'))}`);
    }
  } else {
    const results = (Array.isArray(body.steps) ? body.steps as Array<{ resultado: unknown }> : []).map(step => step.resultado as Record<string, unknown>);
    const dossiers = results.map(result => result.evidencias as Record<string, unknown> | undefined).filter((evidence): evidence is Record<string, unknown> => Boolean(evidence));
    const lines = dossiers.map(item => `• ${escapeMarkdownV2(String(item.titulo))}: ${Number(item.pedidos ?? 0)} pedidos; custo recorrente ${money(Number(item.custoContatoRecorrenteBrl ?? 0))}.`).join('\n');
    await markdown(`*Causas-raiz (${dossiers.length})*\n${lines || escapeMarkdownV2(String(body.text ?? 'Sem dossiês retornados.'))}`);
  }
}

async function executeCallback(update: TelegramUpdate, chatId: string) {
  const callback = update.callback_query!;
  const match = callback.data?.match(/^act:([a-f0-9]{24}):(aprovar|rejeitar|detalhes)$/i);
  if (!match || !callback.message) { await answerTelegramCallback(getTelegramConfig()!.token, callback.id, 'Botão inválido ou mensagem indisponível.'); return; }
  const [, actionId, operation] = match, config = getTelegramConfig()!, store = getActionStore();
  if (operation === 'detalhes') {
    const action = await store.getAction(actionId);
    if (!action) { await answerTelegramCallback(config.token, callback.id, 'Ação não encontrada.'); return; }
    const details = await formatActionApproval(action);
    await editTelegramMessage(config.token, chatId, callback.message.message_id, details, { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [
      [{ text: '✅ Aprovar', callback_data: `act:${action.id}:aprovar` }, { text: '❌ Rejeitar', callback_data: `act:${action.id}:rejeitar` }],
      [{ text: 'Ver detalhes', callback_data: `act:${action.id}:detalhes` }],
    ] } });
    await answerTelegramCallback(config.token, callback.id, 'Detalhes atualizados.');
    return;
  }
  const actor = callback.from.first_name || callback.from.username || 'Operador';
  const decision = operation as 'aprovar' | 'rejeitar';
  const outcome = await decideAction(actionId, decision, store, actor);
  if (outcome.status !== 200 || !('action' in outcome)) { await answerTelegramCallback(config.token, callback.id, outcome.error ?? 'Não foi possível registrar a decisão.'); return; }
  const audit = (await store.listAudit()).find(record => record.id === `${actionId}:${decision === 'aprovar' ? 'aprovada' : 'rejeitada'}`);
  const actorName = audit?.descricao.match(/ por (.+)\.$/)?.[1] ?? actor;
  const happenedAt = new Date(outcome.action.atualizadaEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' });
  const status = decision === 'aprovar' ? `✅ *Aprovado por ${escapeMarkdownV2(actorName)} às ${escapeMarkdownV2(happenedAt)}*\nAção interna: ${escapeMarkdownV2(outcome.action.status)}. Integrações externas permanecem conforme o efeito registrado.` : `❌ *Rejeitado por ${escapeMarkdownV2(actorName)} às ${escapeMarkdownV2(happenedAt)}*`;
  await editTelegramMessage(config.token, chatId, callback.message.message_id, status, { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [] } });
  await answerTelegramCallback(config.token, callback.id, decision === 'aprovar' ? 'Aprovação persistida.' : 'Rejeição persistida.');
}

export async function POST(request: Request) {
  const config = getTelegramConfig();
  if (!config) return json({ error: 'Telegram indisponível: configure TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_TEAM_CHAT_ID e TELEGRAM_DEMO_CUSTOMER_CHAT_ID.' }, 503);
  const suppliedSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!constantTimeEqual(suppliedSecret, config.secret)) return json({ error: 'Webhook não autorizado.' }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 65_536) return json({ error: 'Update excede o limite permitido.' }, 413);
  let update: TelegramUpdate;
  try { update = JSON.parse(raw) as TelegramUpdate; } catch { return json({ error: 'JSON inválido.' }, 400); }
  if (!Number.isSafeInteger(update.update_id)) return json({ error: 'Update sem identificador válido.' }, 400);
  const message = update.message ?? update.callback_query?.message;
  if (!message) return json({ ok: true, ignored: true });
  const chatId = String(message.chat.id);
  if (chatId !== config.teamChatId && chatId !== config.demoCustomerChatId) return json({ error: 'Este chat não está autorizado.' }, 403);
  const store = getActionStore(), updateId = String(update.update_id);
  if (!await store.claimTelegramUpdate(updateId)) return json({ ok: true, duplicate: true });
  try {
    if (update.callback_query) {
      if (chatId !== config.teamChatId) await answerTelegramCallback(config.token, update.callback_query.id, 'Aprovação disponível apenas no chat da equipe.');
      else await executeCallback(update, chatId);
    } else if (chatId === config.teamChatId && typeof update.message?.text === 'string') {
      if (update.message.text.length > BUSINESS.agentMessageMaxLength) await markdown('Mensagem longa demais. O limite é 500 caracteres.');
      else await executeCommand(update.message.text, chatId);
    }
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Falha ao processar update do Telegram:', message.split(config.token).join('[redacted]'));
    await store.releaseTelegramUpdate(updateId);
    return json({ error: 'Falha temporária ao processar o update. O Telegram pode tentar novamente.' }, 500);
  }
}
