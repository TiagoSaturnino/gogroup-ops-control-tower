import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Order } from '../lib/engine';
import { runAgentLoop } from '../lib/agent/loop';
import { deterministicFallback } from '../lib/agent/fallback';
import { validateAgentText } from '../lib/agent/guardrails';
import { MemoryActionStore } from '../lib/store';
import { runAgentTool } from '../lib/agent/tools';
import { dashboard } from '../lib/tools';

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
});
