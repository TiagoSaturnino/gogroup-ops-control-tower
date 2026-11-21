import { describe, expect, it } from 'vitest';
import type { Action } from '../lib/actions';
import { resetDemoState } from '../lib/demo';
import { getHealthStatus } from '../lib/health';
import { MemoryActionStore } from '../lib/store';

const sampleAction: Action = {
  id: 'reset-test-action', orderIds: ['GC-TEST-1'], tipo: 'zero_touch_aviso', status: 'proposta',
  responsavel: 'agente', canal: 'ui', impactoBrl: 0, horasLiberadas: 0, justificativa: 'Teste de reset', calculo: {},
  criadaEm: '2026-11-21T00:00:00.000Z', atualizadaEm: '2026-11-21T00:00:00.000Z',
  efeito: { tipo: 'simulado', descricao: 'Teste', sistema: 'WhatsApp Business API' },
};

describe('health e reset da demonstração', () => {
  it('informa estado de memória e configuração sem revelar segredos', () => {
    const status = getHealthStatus(new MemoryActionStore(), {
      GROQ_API_KEY: 'nao-deve-aparecer', TELEGRAM_BOT_TOKEN: 'nao-deve-aparecer',
      TELEGRAM_WEBHOOK_SECRET: 'nao-deve-aparecer', TELEGRAM_TEAM_CHAT_ID: '-100', TELEGRAM_DEMO_CUSTOMER_CHAT_ID: '42',
    });
    expect(status).toEqual({ store: 'memoria', modelo: 'groq', telegram: 'configurado' });
    expect(JSON.stringify(status)).not.toContain('nao-deve-aparecer');
  });

  it('indica fallback determinístico quando não há credenciais opcionais', () => {
    expect(getHealthStatus(new MemoryActionStore(), {})).toEqual({ store: 'memoria', modelo: 'deterministic', telegram: 'nao_configurado' });
  });

  it('limpa ações, estado, auditoria antiga e updates Telegram, preservando o evento de reset', async () => {
    const store = new MemoryActionStore();
    await store.createAction(sampleAction);
    await store.setOrderState('GC-TEST-1', 'em_tratativa');
    await store.appendAudit({ id: 'old-audit', actionId: sampleAction.id, evento: 'criada', responsavel: 'agente', ocorridaEm: sampleAction.criadaEm, descricao: 'Antiga' });
    await store.claimTelegramUpdate('update-1');

    const record = await resetDemoState(store, new Date('2026-11-21T12:00:00.000Z'));

    expect(await store.listActions()).toEqual([]);
    expect(await store.getOrderStates()).toEqual({});
    expect(await store.listAudit()).toEqual([record]);
    expect(record.evento).toBe('demo_reiniciada');
    expect(await store.claimTelegramUpdate('update-1')).toBe(true);
  });
});
