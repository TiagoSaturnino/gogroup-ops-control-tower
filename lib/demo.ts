import { randomUUID } from 'node:crypto';
import type { AuditRecord } from './actions';
import type { ActionStore } from './store';

export async function resetDemoState(store: ActionStore, now = new Date()): Promise<AuditRecord> {
  const record: AuditRecord = {
    id: `demo-reset:${randomUUID()}`,
    actionId: 'demo-reset',
    evento: 'demo_reiniciada',
    responsavel: 'humano',
    ocorridaEm: now.toISOString(),
    descricao: 'Demonstração reiniciada; ações, estados de pedidos e updates do Telegram foram limpos.',
  };
  await store.resetDemo(record);
  return record;
}
