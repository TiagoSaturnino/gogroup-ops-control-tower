import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Order } from '../lib/engine';
import { runAgentLoop } from '../lib/agent/loop';
import { deterministicFallback } from '../lib/agent/fallback';
import { validateAgentText } from '../lib/agent/guardrails';
import { executeActionEffect, MemoryActionStore } from '../lib/store';
import { isConsultationActionType, transitionAction, type Action } from '../lib/actions';
import { runAgentTool } from '../lib/agent/tools';
import { dashboard } from '../lib/tools';
import { executeDeterministic } from '../lib/tools';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Auditoria } from '../components/Auditoria';

const fixture = JSON.parse(readFileSync('data/fixtures/synthetic.json', 'utf8')) as { orders: Order[]; routes: unknown[] };

describe('laço e ferramentas do agente', () => {
  it('encerra o laço em no máximo seis passos', async () => {
    let calls = 0;
    const result = await runAgentLoop({
      message: 'consulte a fila', context: {}, maxSteps: 20,
      callModel: async () => { calls++; return { content: null, toolCalls: [{ id: `call-${calls}`, function: { name: 'listar_fila', arguments: '{"limite":1}' } }] }; },
      runTool: async () => ({ pedidos: [] }), deterministicFallback: async () => { throw new Error('fallback não esperado'); },
    });
    expect(calls).toBe(6);
    expect(result.steps).toHaveLength(6);
  });

  it('cria escalada pendente em vez de executar pedido com alçada', async () => {
    const store = new MemoryActionStore();
    const resultData = await dashboard(fixture, {}, store);
    const governed = resultData.rankedOrders.find(order => order.requerAlcadaHumana);
    expect(governed).toBeDefined();
    const result = await runAgentLoop({
      message: 'Resolva o pedido', context: {},
      callModel: async () => ({ content: null, toolCalls: [{ id: 'escalate', function: { name: 'escalar_para_humano', arguments: JSON.stringify({ id: governed!.order_id, motivo: 'Requer alçada', quem_deve_decidir: 'Líder de Operações', opcoes: ['reenvio','reembolso','aguardar'], confianca: 'alta' }) } }] }),
      runTool: (name, args) => runAgentTool(name, args, fixture, store), deterministicFallback: async () => { throw new Error('fallback não esperado'); },
    });
    expect(result.steps[0].tool).toBe('escalar_para_humano');
    expect((await store.listActions()).some(action => action.status === 'aguardando_aprovacao')).toBe(true);
    expect((await store.getOrderStates())[governed!.order_id]).toBeUndefined();
  });

  it('remove valor monetário inventado pelo modelo', () => {
    const result = validateAgentText('A opção custa R$ 999,00 e levará 3 dias úteis.', [{ custoBrl: 120, prazoDiasUteis: 2 }]);
    expect(result.valid).toBe(false);
    expect(result.invalidMoney).toEqual([999]);
    expect(result.invalidPeriods).toEqual([3]);
    expect(result.text).toContain('valores ou prazos sem correspondência');
  });

  it('fallback determinístico monta plano com zero-touch, escaladas e chamado', async () => {
    const store = new MemoryActionStore();
    const result = await deterministicFallback('Monte o plano de hoje', fixture, store);
    const actions = await store.listActions();
    expect(result.modelUsed).toBe('deterministic');
    expect(result.steps.map(step => step.tool)).toContain('executar_lote_zero_touch');
    expect(result.steps.map(step => step.tool)).toContain('investigar_causa');
    expect(result.steps.map(step => step.tool)).toContain('abrir_chamado_transportadora');
    expect(actions.filter(action => action.tipo === 'escalonamento')).toHaveLength(2);
    expect(actions.some(action => action.tipo === 'chamado_transportadora' && action.status === 'aguardando_aprovacao')).toBe(true);
    expect(actions.some(action => action.tipo === 'zero_touch_aviso' && action.status === 'executada')).toBe(true);
  });

  it('usa o mesmo plano determinístico quando os dois modelos falham', async () => {
    const store = new MemoryActionStore();
    let modelCalls = 0;
    const result = await runAgentLoop({
      message: 'Monte o plano de hoje', context: {},
      callModel: async () => { modelCalls++; throw new Error('Groq 429'); },
      runTool: (name, args) => runAgentTool(name, args, fixture, store),
      deterministicFallback: () => deterministicFallback('Monte o plano de hoje', fixture, store),
    });
    const tools = result.steps.map(step => step.tool);
    expect(result.modelUsed).toBe('deterministic');
    expect(modelCalls).toBe(2);
    expect(tools).toContain('listar_fila');
    expect(tools).toContain('executar_lote_zero_touch');
    expect(tools.filter(tool => tool === 'escalar_para_humano')).toHaveLength(2);
    expect(tools).toContain('investigar_causa');
    expect(tools).toContain('abrir_chamado_transportadora');
    expect((await store.listActions()).filter(action => action.tipo === 'escalonamento')).toHaveLength(2);
  });

  it('keeps plan consultations out of effect Actions and reports separate KPIs', async () => {
    const store = new MemoryActionStore();
    const plan = await deterministicFallback('Monte o plano de hoje', fixture, store);
    const data = await dashboard(fixture, {}, store);
    const actions = await store.listActions();
    const querySteps = plan.steps.filter(step => ['listar_fila', 'comparar_opcoes_resolucao', 'investigar_causa'].includes(step.tool));
    const zeroTouchIds = new Set(actions.filter(action => action.tipo === 'zero_touch_aviso' && action.status === 'executada')
      .flatMap(action => action.orderIds.filter(orderId => data.orderStates[orderId] === 'em_tratativa')));

    expect(data.agentMetrics.consultasAgente).toBe(querySteps.length);
    expect(data.agentMetrics.acoesComEfeito).toBe(actions.length);
    expect(actions.every(action => !isConsultationActionType(action.tipo))).toBe(true);
    expect(data.agentMetrics.processadasAutonomamente).toBe(zeroTouchIds.size);
    expect(data.agentMetrics.processadasAutonomamente).toBeGreaterThan(0);
  });

  it('does not change order state for consultations or simulations; approved effects and Zero-Touch do', async () => {
    const store = new MemoryActionStore();
    const before = await store.getOrderStates();
    const firstOrder = (await dashboard(fixture, {}, store)).orders[0];
    await runAgentTool('listar_fila', { limite: 3 }, fixture, store);
    await runAgentTool('detalhar_pedido', { id: firstOrder.order_id }, fixture, store);
    await runAgentTool('comparar_opcoes_resolucao', { id: firstOrder.order_id }, fixture, store);
    await runAgentTool('investigar_causa', { id_causa: 'rota_express_ne' }, fixture, store);
    await executeDeterministic('simular_premissas_e_capacidade', {}, fixture, 'ui', store);
    expect(await store.getOrderStates()).toEqual(before);
    expect(await store.listActions()).toEqual([]);
    expect((await store.listAudit()).every(record => record.kind === 'consulta')).toBe(true);

    await runAgentTool('executar_lote_zero_touch', { categoria: 'todos' }, fixture, store);
    expect(Object.values(await store.getOrderStates()).some(state => state === 'em_tratativa')).toBe(true);

    const nextOrder = (await dashboard(fixture, {}, store)).orders[0];
    const pending: Action = { id: 'approved-effect', orderIds: [nextOrder.order_id], tipo: 'reenvio', status: 'proposta', responsavel: 'agente', canal: 'ui', impactoBrl: 0, horasLiberadas: 0, justificativa: 'Approval test', calculo: {}, criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString(), efeito: { tipo: 'simulado', descricao: 'Approved test action', sistema: 'ERP' } };
    await store.createAction(pending);
    const approved = transitionAction(transitionAction(pending, 'aguardando_aprovacao', 'agente'), 'aprovada', 'humano');
    await executeActionEffect(approved, store);
    expect((await store.getOrderStates())[nextOrder.order_id]).toBe('em_tratativa');
  });

  it('deduplicates autonomous KPI by order ID and classifies legacy read Actions without deleting them', async () => {
    const store = new MemoryActionStore();
    const legacy = (id: string, tipo: Action['tipo'], orderId: string): Action => ({ id, orderIds: [orderId], tipo, status: 'executada', responsavel: 'agente', canal: 'ui', impactoBrl: 0, horasLiberadas: 0, justificativa: 'Legacy record', calculo: {}, criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString(), efeito: { tipo: 'simulado', descricao: 'Legacy format', sistema: 'GoGroup Ops' } });
    const legacyQueue = legacy('legacy-queue', 'consulta_fila', 'GC-0001');
    const legacyInvestigation = legacy('legacy-investigation', 'investigacao', 'GC-0002');
    await store.createAction(legacyQueue);
    await store.createAction(legacyInvestigation);
    await store.createAction(legacy('zt-one', 'zero_touch_aviso', 'GC-0003'));
    await store.createAction({ ...legacy('zt-two', 'zero_touch_aviso', 'GC-0003'), orderIds: ['GC-0003', 'GC-0003'] });
    await store.setOrderState('GC-0003', 'em_tratativa');
    await expect(executeActionEffect({ ...legacyQueue, status: 'aprovada' }, store)).rejects.toThrow();

    const data = await dashboard(fixture, {}, store);
    const history = await store.listActions();
    const html = renderToStaticMarkup(createElement(Auditoria, { actions: history, audit: [], orderStates: await store.getOrderStates(), onDecision: () => undefined }));

    expect(data.agentMetrics.consultasAgente).toBe(2);
    expect(data.agentMetrics.acoesComEfeito).toBe(2);
    expect(data.agentMetrics.processadasAutonomamente).toBe(1);
    expect(history).toHaveLength(4);
    expect(html.match(/Consulta legada/g)).toHaveLength(2);
    const legacyCards = html.split('<article').filter(card => card.includes('Consulta legada'));
    expect(legacyCards.every(card => !card.includes('efeito:'))).toBe(true);
    expect(isConsultationActionType('comunicacao_cliente')).toBe(false);
  });

});
