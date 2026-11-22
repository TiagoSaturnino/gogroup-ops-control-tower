import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Order } from '../lib/engine';
import { decideAction } from '../lib/action-decisions';
import { MemoryActionStore } from '../lib/store';
import { runCommunicationAgent, communicationTemplate } from '../lib/agent/communication';
import { runAgentLoop } from '../lib/agent/loop';
import { ROLES } from '../lib/agent/roles';
import { runAgentTool } from '../lib/agent/tools';
import { dashboard } from '../lib/tools';
import type { Action } from '../lib/actions';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Auditoria } from '../components/Auditoria';

const fixture = JSON.parse(readFileSync('data/fixtures/synthetic.json', 'utf8')) as { orders: Order[]; routes: unknown[] };
const envKeys = ['GROQ_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_DEMO_CUSTOMER_CHAT_ID'] as const;
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
afterEach(() => {
  for (const key of envKeys) { const value = savedEnv[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const facts = { marca: 'Gocase', status: 'em acompanhamento', prazoDiasUteis: 3, opcaoRecomendada: 'aguardar' };
const input = { orderId: 'GC-0001', motivo: 'acompanhar pedido', fatosDoMotor: facts, canal: 'aprovacao' as const };

describe('sub-agente de Comunicação', () => {
  it('usa uma chamada e um prompt próprios, separados do Orquestrador', async () => {
    let systemPrompt = '';
    const result = await runCommunicationAgent(input, async (_model, messages) => {
      systemPrompt = messages[0].content;
      return 'Estamos acompanhando seu pedido com atenção.';
    });
    expect(systemPrompt).not.toBe(ROLES.orquestrador.prompt);
    expect(systemPrompt).toContain('500 caracteres');
    expect(result.modelUsed).toBe('llama-3.3-70b-versatile');
    expect(result.validado).toBe(true);
  });

  it('remove prazo inventado e usa o template determinístico', async () => {
    const result = await runCommunicationAgent(input, async () => 'Sua entrega ocorrerá em 99 dias úteis.');
    expect(result.numeroNaoVerificado).toBe(true);
    expect(result.modelUsed).toBe('deterministic');
    expect(result.rascunho).toBe(communicationTemplate(input));
    expect(result.rascunho).not.toContain('99');
  });

  it('mantém o template funcional sem chave Groq', async () => {
    delete process.env.GROQ_API_KEY;
    const result = await runCommunicationAgent(input);
    expect(result.modelUsed).toBe('deterministic');
    expect(result.rascunho).toContain('Gocase');
    expect(result.rascunho.length).toBeLessThanOrEqual(500);
  });

  it('persiste o rascunho em Action pendente com responsável calculado pelo motor', async () => {
    const store = new MemoryActionStore();
    const order = (await dashboard(fixture, {}, store)).orders[0];
    const result = await runAgentTool('redigir_mensagem_cliente', { id: order.order_id, objetivo: 'acompanhar o caso' }, fixture, store) as { comunicacao: { modelUsed: string; entradaFatos: unknown; rascunho: string }; action: Action };
    const saved = await store.getAction(result.action.id);
    expect(saved?.tipo).toBe('comunicacao_cliente');
    expect(saved?.status).toBe('aguardando_aprovacao');
    expect(saved?.rascunho).toBe(result.comunicacao.rascunho);
    expect(saved?.calculo.decisor).toBeTruthy();
    expect(result.comunicacao.entradaFatos).toBeTruthy();
    const html = renderToStaticMarkup(createElement(Auditoria, { actions: saved ? [saved] : [], audit: [], orderStates: {}, onDecision: () => undefined }));
    expect(html).toContain(result.comunicacao.rascunho);
  });

  it('rejeitar não envia; aprovar envia ao chat de demonstração sem resolver o pedido', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_DEMO_CUSTOMER_CHAT_ID = '42';
    const calls: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (_input, init) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ ok: true, result: { message_id: calls.length } });
    }) as typeof fetch;
    const store = new MemoryActionStore();
    const order = (await dashboard(fixture, {}, store)).orders[0];
    const rejectedTool = await runAgentTool('redigir_mensagem_cliente', { id: order.order_id, objetivo: 'rascunho rejeitado' }, fixture, store) as { action: Action };
    const rejected = await decideAction(rejectedTool.action.id, 'rejeitar', store, 'Avaliadora');
    expect(rejected.status).toBe(200);
    expect(calls).toHaveLength(0);
    expect((await store.getOrderStates())[order.order_id]).toBeUndefined();

    const approvalTool = await runAgentTool('redigir_mensagem_cliente', { id: order.order_id, objetivo: 'rascunho aprovado' }, fixture, store) as { action: Action };
    const approved = await decideAction(approvalTool.action.id, 'aprovar', store, 'Avaliadora');
    expect(approved.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe(approvalTool.action.rascunho);
    expect('action' in approved ? approved.action?.efeito.tipo : undefined).toBe('real');
    expect((await store.getOrderStates())[order.order_id]).toBeUndefined();
  });

  it('inclui o papel Comunicação como etapa própria na trilha do agente', async () => {
    const store = new MemoryActionStore();
    const order = (await dashboard(fixture, {}, store)).orders[0];
    let turn = 0;
    const result = await runAgentLoop({
      message: 'Redija uma mensagem', context: {},
      callModel: async () => ++turn === 1
        ? { content: null, toolCalls: [{ id: 'draft', function: { name: 'redigir_mensagem_cliente', arguments: JSON.stringify({ id: order.order_id, objetivo: 'acompanhar' }) } }] }
        : { content: 'Rascunho preparado.' },
      runTool: (name, args) => runAgentTool(name, args, fixture, store),
      deterministicFallback: async () => { throw new Error('fallback não esperado'); },
    });
    const subagent = result.steps.find(step => step.tool === 'subagente_comunicacao');
    expect(subagent?.papel).toBe('comunicacao');
    expect(subagent?.resultado).toMatchObject({ modelUsed: 'deterministic', rascunho: expect.any(String) });
  });

  it('Zero-Touch salva mensagens do sub-agente na Action e na trilha', async () => {
    for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_DEMO_CUSTOMER_CHAT_ID']) delete process.env[key];
    const store = new MemoryActionStore();
    const result = await runAgentTool('executar_lote_zero_touch', { categoria: 'todos' }, fixture, store) as unknown as { resultado: { action: Action }; comunicacoes: Array<{ papel: string; rascunho: string }> };
    const saved = await store.getAction(result.resultado.action.id);
    expect(saved?.rascunhos?.length).toBeGreaterThan(0);
    expect(saved?.rascunho).toContain(saved?.rascunhos?.[0].texto);
    expect(result.comunicacoes.every(trace => trace.papel === 'comunicacao')).toBe(true);
    expect(result.comunicacoes.length).toBe(saved?.rascunhos?.length);
  });

  it('mostra a chamada própria de Comunicação no Zero-Touch dentro do loop', async () => {
    for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_DEMO_CUSTOMER_CHAT_ID']) delete process.env[key];
    const store = new MemoryActionStore();
    let turn = 0;
    const result = await runAgentLoop({
      message: 'Prepare o lote Zero-Touch', context: {},
      callModel: async () => ++turn === 1
        ? { content: null, toolCalls: [{ id: 'zero-touch', function: { name: 'executar_lote_zero_touch', arguments: JSON.stringify({ categoria: 'todos' }) } }] }
        : { content: 'Lote preparado.' },
      runTool: (name, args) => runAgentTool(name, args, fixture, store),
      deterministicFallback: async () => { throw new Error('fallback não esperado'); },
    });
    expect(result.steps.some(step => step.tool === 'subagente_comunicacao' && step.papel === 'comunicacao')).toBe(true);
  });
});
