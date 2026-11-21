import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { dashboard, loadDataset } from '@/lib/tools';
import { checkAgentRateLimit } from '@/lib/ratelimit';
import { BUSINESS } from '@/lib/params';
import { runAgentLoop } from '@/lib/agent/loop';
import { deterministicFallback } from '@/lib/agent/fallback';
import { runAgentTool } from '@/lib/agent/tools';
import { recordGuardrailOccurrence } from '@/lib/agent/guardrails';
import { getActionStore } from '@/lib/store';
import type { Action } from '@/lib/actions';

async function persistTrace(result: Awaited<ReturnType<typeof deterministicFallback>>, store: ReturnType<typeof getActionStore>) {
  const actionIds = new Set<string>();
  const scan = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if ('id' in value && 'status' in value && 'efeito' in value) actionIds.add(String((value as Action).id));
    if (Array.isArray(value)) value.forEach(scan); else Object.values(value).forEach(scan);
  };
  result.steps.forEach(step => scan(step.resultado));
  const actions = await store.listActions();
  for (const action of actions) if (actionIds.has(action.id)) await store.saveAction({ ...action, trilhaAgente: result.steps });
  return { ...result, actions: await store.listActions(), audit: await store.listAudit(), store: store.kind };
}

export async function POST(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const limit = checkAgentRateLimit(ip);
  if (!limit.allowed) return NextResponse.json({ error: 'Limite de uso atingido. Tente novamente após 10 minutos.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  let body: { message?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  if (typeof body.message !== 'string' || !body.message.trim()) return NextResponse.json({ error: 'Informe uma mensagem de texto.' }, { status: 400 });
  if (body.message.length > BUSINESS.agentMessageMaxLength) return NextResponse.json({ error: `A mensagem pode ter no máximo ${BUSINESS.agentMessageMaxLength} caracteres.` }, { status: 413 });

  const message = body.message.trim(), dataset = loadDataset(), store = getActionStore();
  const data = await dashboard(dataset, {}, store);
  const fallback = () => deterministicFallback(message, dataset, store);
  if (!process.env.GROQ_API_KEY) return NextResponse.json(await persistTrace(await fallback(), store));
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const result = await runAgentLoop({
      message,
      context: { activeOrders: data.totals.pedidos, pendingActions: (await store.listActions()).filter(action => action.status === 'aguardando_aprovacao').length, causes: data.systemic.map(({ id, title, count }) => ({ id, title, count })) },
      callModel: async (model, messages, tools) => {
        const response = await client.chat.completions.create({ model, messages: messages as never[], tools: tools as never[], tool_choice: 'auto' });
        const choice = response.choices[0]?.message;
        return { content: choice?.content ?? null, toolCalls: choice?.tool_calls?.map(call => ({ id: call.id, function: call.function })) };
      },
      runTool: (name, args) => runAgentTool(name, args, dataset, store),
      deterministicFallback: fallback,
      onGuardrail: description => recordGuardrailOccurrence(store, `agent:${Date.now()}`, description),
    });
    return NextResponse.json(await persistTrace(result, store));
  } catch {
    return NextResponse.json(await persistTrace(await fallback(), store));
  }
}
