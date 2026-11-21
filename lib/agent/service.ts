import Groq from 'groq-sdk';
import { dashboard, loadDataset } from '../tools';
import { checkAgentRateLimit } from '../ratelimit';
import { BUSINESS } from '../params';
import { runAgentLoop, type AgentLoopResult } from './loop';
import { deterministicFallback } from './fallback';
import { runAgentTool } from './tools';
import { recordGuardrailOccurrence } from './guardrails';
import { getActionStore } from '../store';
import type { Action } from '../actions';
import { notifyPendingTelegramActions } from '../telegram';

export async function runAgentService(message: string, rateLimitKey: string) {
  const limit = checkAgentRateLimit(rateLimitKey);
  if (!limit.allowed) return { status: 429, retryAfterSeconds: limit.retryAfterSeconds, body: { error: 'Limite de uso atingido. Tente novamente após 10 minutos.' } };
  if (typeof message !== 'string' || !message.trim()) return { status: 400, retryAfterSeconds: 0, body: { error: 'Informe uma mensagem de texto.' } };
  if (message.length > BUSINESS.agentMessageMaxLength) return { status: 413, retryAfterSeconds: 0, body: { error: `A mensagem pode ter no máximo ${BUSINESS.agentMessageMaxLength} caracteres.` } };

  const normalized = message.trim(), dataset = loadDataset(), store = getActionStore();
  const snapshot = await dashboard(dataset, {}, store);
  const fallback = () => deterministicFallback(normalized, dataset, store);
  let result: AgentLoopResult;
  if (!process.env.GROQ_API_KEY) result = await fallback();
  else {
    try {
      const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
      result = await runAgentLoop({
        message: normalized,
        context: { activeOrders: snapshot.totals.pedidos, pendingActions: (await store.listActions()).filter(action => action.status === 'aguardando_aprovacao').length, causes: snapshot.systemic.map(({ id, title, count }) => ({ id, title, count })) },
        callModel: async (model, messages, tools) => {
          const response = await client.chat.completions.create({ model, messages: messages as never[], tools: tools as never[], tool_choice: 'auto' });
          const choice = response.choices[0]?.message;
          return { content: choice?.content ?? null, toolCalls: choice?.tool_calls?.map(call => ({ id: call.id, function: call.function })) };
        },
        runTool: (name, args) => runAgentTool(name, args, dataset, store),
        deterministicFallback: fallback,
        onGuardrail: description => recordGuardrailOccurrence(store, `agent:${Date.now()}`, description),
      });
    } catch { result = await fallback(); }
  }

  const toolNames = result.steps.map(step => step.tool);
  if (/plano.*hoje|monte.*plano|plano de hoje/i.test(normalized)) {
    const completePlan = toolNames.includes('listar_fila') && toolNames.includes('executar_lote_zero_touch') && toolNames.filter(name => name === 'escalar_para_humano').length >= 2 && toolNames.includes('investigar_causa') && toolNames.includes('abrir_chamado_transportadora');
    if (!completePlan) { const completion = await deterministicFallback(normalized, dataset, store, result.steps); result = { ...completion, modelUsed: 'deterministic' }; }
  } else if (/\bcausas\b|causa-raiz/i.test(normalized) && toolNames.filter(name => name === 'investigar_causa').length < snapshot.systemic.length) {
    result = await deterministicFallback(normalized, dataset, store, result.steps);
  } else if (/\bfila\b|pedidos ativos/i.test(normalized) && !toolNames.includes('listar_fila')) {
    result = await deterministicFallback(normalized, dataset, store, result.steps);
  } else if (/\b(?:GC|GB)-?[A-Z0-9-]+\b/i.test(normalized) && !toolNames.includes('detalhar_pedido')) {
    result = await deterministicFallback(normalized, dataset, store, result.steps);
  }

  const currentIds = new Set<string>();
  const scan = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if ('id' in value && 'status' in value && 'efeito' in value) currentIds.add(String((value as Action).id));
    if (Array.isArray(value)) value.forEach(scan); else Object.values(value).forEach(scan);
  };
  result.steps.forEach(step => scan(step.resultado));
  for (const action of await store.listActions()) if (currentIds.has(action.id)) await store.saveAction({ ...action, trilhaAgente: result.steps });
  const currentActions = (await store.listActions()).filter(action => currentIds.has(action.id));
  let notificationWarning = '';
  try { await notifyPendingTelegramActions(currentActions); }
  catch { notificationWarning = ' Não consegui publicar um ou mais cartões no Telegram; as ações seguem pendentes e persistidas.'; }
  if (notificationWarning) result = { ...result, text: `${result.text}${notificationWarning}` };
  return {
    status: 200, retryAfterSeconds: 0,
    body: { ...result, actions: await store.listActions(), audit: await store.listAudit(), store: store.kind,
      operationalSnapshot: { totalPedidos: snapshot.totals.pedidos, capacidadeDiaria: snapshot.params.capacidadeDiaria, evRiscoDia: snapshot.comparison.aiFirst.evRiscoProtected, gmvDia: snapshot.comparison.aiFirst.gmvCovered, diasParaZerar: snapshot.comparison.burndown.daysToClear.aiFirst, horasZeroTouch: snapshot.totals.zeroTouchHoursSaved } },
  };
}
