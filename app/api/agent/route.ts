import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { dashboard, executeDeterministic, loadDataset } from '@/lib/tools';
import { checkAgentRateLimit } from '@/lib/ratelimit';
import { BUSINESS } from '@/lib/params';

const tools = [
  { type: 'function', function: { name: 'executar_lote_zero_touch', description: 'Prepara um lote Zero-Touch elegível para revisão/envio.', parameters: { type: 'object', properties: { categoria: { type: 'string', enum: ['atraso_entregue','pagamento_pendente','endereco_divergente','todos'] } }, required: ['categoria'] } } },
  { type: 'function', function: { name: 'resolver_pedido_individual', description: 'Prepara encaminhamento individual respeitando alçadas.', parameters: { type: 'object', properties: { orderId: { type: 'string' }, acaoRecomendada: { type: 'string' } }, required: ['orderId','acaoRecomendada'] } } },
  { type: 'function', function: { name: 'aplicar_acao_sistemica', description: 'Prepara ação para causa-raiz operacional, sujeita a validação humana.', parameters: { type: 'object', properties: { anomaliaId: { type: 'string' } }, required: ['anomaliaId'] } } },
  { type: 'function', function: { name: 'simular_premissas_e_capacidade', description: 'Simula capacidade e premissas operacionais determinísticas.', parameters: { type: 'object', properties: { capacidadeDiaria: { type: 'number' }, probAbandonoPagamento: { type: 'number' }, tetoRuptura: { type: 'number' } } } } },
] as const;

export async function POST(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const limit = checkAgentRateLimit(ip);
  if (!limit.allowed) return NextResponse.json({ error: 'Limite de uso atingido. Tente novamente após 10 minutos.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  let body: { message?: string; prompt?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const message = body.message ?? body.prompt ?? 'Priorize casos elegíveis para automação.';
  if (typeof message !== 'string') return NextResponse.json({ error: 'A mensagem deve ser um texto.' }, { status: 400 });
  if (message.length > BUSINESS.agentMessageMaxLength) return NextResponse.json({ error: `A mensagem pode ter no máximo ${BUSINESS.agentMessageMaxLength} caracteres.` }, { status: 413 });
  const dataset = loadDataset(), context = dashboard(dataset);
  const fallback = (name = 'executar_lote_zero_touch', args: Record<string, unknown> = { categoria: 'todos' }) => NextResponse.json(executeDeterministic(name, args, dataset));
  if (!process.env.GROQ_API_KEY) return fallback();
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    let model = 'llama-3.3-70b-versatile';
    let response;
    const messages = [{ role: 'system' as const, content: `Você é agente operacional. Escolha ferramentas apropriadas. Não invente valores financeiros ou prazos; use somente resultados do motor determinístico. Ações são preparadas, não persistidas. Contexto: ${JSON.stringify({ totals: context.totals, systemic: context.systemic.map(({ id, title, count, gmvExposto, economiaEstimada }) => ({ id, title, count, gmvExposto, economiaEstimada })) })}` }, { role: 'user' as const, content: message }];
    try { response = await client.chat.completions.create({ model, messages, tools: [...tools], tool_choice: 'auto' }); }
    catch { model = 'llama-3.1-8b-instant'; response = await client.chat.completions.create({ model, messages, tools: [...tools], tool_choice: 'auto' }); }
    const call = response.choices[0]?.message.tool_calls?.[0];
    if (!call) return NextResponse.json({ ...executeDeterministic('executar_lote_zero_touch', { categoria: 'todos' }, dataset), modelUsed: model });
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    return NextResponse.json({ ...executeDeterministic(call.function.name, args, dataset), modelUsed: model });
  } catch { return fallback(); }
}
