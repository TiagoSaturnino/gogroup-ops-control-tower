import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dashboard, loadDataset } from '@/lib/tools';
import { getActionStore } from '@/lib/store';
import { getTelegramBotConfig, escapeMarkdownV2, sendTelegramMessage } from '@/lib/telegram';

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });
function secretMatches(supplied: string, expected: string) {
  const left = Buffer.from(supplied), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
const money = (value: number) => escapeMarkdownV2(`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fortalezaDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, authorization = request.headers.get('authorization') ?? '';
  if (!secret) return json({ error: 'Briefing indisponível: configure CRON_SECRET.' }, 503);
  if (!secretMatches(authorization.replace(/^Bearer\s+/i, ''), secret)) return json({ error: 'Não autorizado.' }, 401);
  const telegram = getTelegramBotConfig();
  if (!telegram) return json({ error: 'Briefing indisponível: configure TELEGRAM_BOT_TOKEN e TELEGRAM_TEAM_CHAT_ID.' }, 503);

  const store = getActionStore(), now = new Date(), date = fortalezaDate(now);
  const operationId = `briefing:${date}`;
  if (!await store.claimTelegramOperation(operationId)) return json({ ok: true, duplicate: true });
  try {
    const [data, actions] = await Promise.all([dashboard(loadDataset(), {}, store), store.listActions()]);
    const pending = actions.filter(action => action.status === 'aguardando_aprovacao').length;
    const zeroTouchToday = actions.filter(action => action.tipo === 'zero_touch_aviso' && action.status === 'executada' && fortalezaDate(new Date(action.criadaEm)) === date);
    const causes = [...data.systemic].sort((a, b) => b.economiaEstimada - a.economiaEstimada).slice(0, 3);
    const dayCount = Math.min(data.totals.pedidos, data.params.capacidadeDiaria);
    const causeText = causes.map(cause => `• ${escapeMarkdownV2(cause.title)} — ${money(cause.economiaEstimada)} de EV exposto`).join('\n');
    const sentOrders = zeroTouchToday.filter(action => action.efeito.tipo === 'real').reduce((sum, action) => sum + action.orderIds.length, 0);
    const simulatedOrders = zeroTouchToday.filter(action => action.efeito.tipo === 'simulado').reduce((sum, action) => sum + action.orderIds.length, 0);
    const text = `*Briefing diário · ${escapeMarkdownV2(date)}*\nFila ativa: ${data.totals.pedidos} pedidos. Capacidade de hoje: ${dayCount} tratativas; EV_Risco Dia 1 ${money(data.comparison.aiFirst.evRiscoProtected)}.\nZero\-Touch processado hoje: ${zeroTouchToday.reduce((sum, action) => sum + action.orderIds.length, 0)} pedidos; ${escapeMarkdownV2(zeroTouchToday.reduce((sum, action) => sum + action.horasLiberadas, 0).toLocaleString('pt-BR'))} horas liberadas. Avisos enviados no Telegram demo: ${sentOrders}; avisos externos simulados: ${simulatedOrders}.\nAguardando aprovação: ${pending} ações.\n*Três causas-raiz de maior EV exposto*\n${causeText || 'Sem causa ativa.'}\nDias para zerar a fila: ${data.comparison.burndown.daysToClear.aiFirst}.`;
    await sendTelegramMessage(telegram.token, telegram.teamChatId, text, { parse_mode: 'MarkdownV2' });
    return json({ ok: true, date, store: store.kind });
  } catch {
    await store.releaseTelegramOperation(operationId);
    return json({ error: 'Falha temporária ao enviar o briefing.' }, 503);
  }
}
