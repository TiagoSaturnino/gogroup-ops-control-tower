import { transitionAction, type Action, type AuditRecord, type OrderState } from './actions';
import { isConsultationActionType } from './actions';
import { createHash, randomUUID } from 'node:crypto';

const PREFIX = 'gogroup:ops:demo:v1';
const TTL_SECONDS = 7 * 24 * 60 * 60;
type StoreData = { actions: Action[]; orderStates: Record<string, OrderState>; audit: AuditRecord[]; telegramUpdates: string[]; telegramOperations: string[] };
const emptyData = (): StoreData => ({ actions: [], orderStates: {}, audit: [], telegramUpdates: [], telegramOperations: [] });

export interface ActionStore {
  readonly kind: 'memory' | 'upstash';
  listActions(): Promise<Action[]>;
  getAction(id: string): Promise<Action | undefined>;
  createAction(action: Action): Promise<{ action: Action; created: boolean }>;
  saveAction(action: Action): Promise<void>;
  completeAction(action: Action, state: OrderState | null): Promise<void>;
  getOrderStates(): Promise<Record<string, OrderState>>;
  setOrderState(orderId: string, state: OrderState): Promise<void>;
  listAudit(): Promise<AuditRecord[]>;
  appendAudit(record: AuditRecord): Promise<void>;
  claimTelegramUpdate(updateId: string): Promise<boolean>;
  releaseTelegramUpdate(updateId: string): Promise<void>;
  claimTelegramOperation(operationId: string): Promise<boolean>;
  releaseTelegramOperation(operationId: string): Promise<void>;
  resetDemo(record: AuditRecord): Promise<void>;
}

abstract class DataStore implements ActionStore {
  abstract readonly kind: 'memory' | 'upstash';
  protected abstract read(): Promise<StoreData>;
  protected abstract write(data: StoreData): Promise<void>;
  private queue: Promise<void> = Promise.resolve();

  async listActions() { return (await this.read()).actions.sort((a,b) => b.criadaEm.localeCompare(a.criadaEm)); }
  async getAction(id: string) { return (await this.read()).actions.find(action => action.id === id); }
  async createAction(action: Action) {
    let result: { action: Action; created: boolean } = { action, created: false };
    await this.mutate(data => {
      const existing = data.actions.find(item => item.id === action.id);
      if (existing) result = { action: existing, created: false };
      else { data.actions.push(action); result = { action, created: true }; }
    });
    return result;
  }
  async saveAction(action: Action) { await this.mutate(data => { const index = data.actions.findIndex(item => item.id === action.id); if (index < 0) data.actions.push(action); else data.actions[index] = action; }); }
  async completeAction(action: Action, state: OrderState | null) {
    await this.mutate(data => {
      const index = data.actions.findIndex(item => item.id === action.id);
      if (index < 0) data.actions.push(action); else data.actions[index] = action;
      if (state) for (const orderId of action.orderIds) data.orderStates[orderId] = state;
      const auditId = `${action.id}:executada`;
      if (!data.audit.some(record => record.id === auditId)) data.audit.push({ id: auditId, actionId: action.id, evento: 'executada', responsavel: action.responsavel, ocorridaEm: action.atualizadaEm, descricao: action.efeito.descricao });
    });
  }
  async getOrderStates() { return (await this.read()).orderStates; }
  async setOrderState(orderId: string, state: OrderState) { await this.mutate(data => { data.orderStates[orderId] = state; }); }
  async listAudit() { return (await this.read()).audit.sort((a,b) => a.ocorridaEm.localeCompare(b.ocorridaEm)); }
  async appendAudit(record: AuditRecord) { await this.mutate(data => { if (!data.audit.some(item => item.id === record.id)) data.audit.push(record); }); }
  async claimTelegramUpdate(updateId: string) {
    let claimed = false;
    await this.mutate(data => { if (!data.telegramUpdates.includes(updateId)) { data.telegramUpdates.push(updateId); data.telegramUpdates = data.telegramUpdates.slice(-5000); claimed = true; } });
    return claimed;
  }
  async releaseTelegramUpdate(updateId: string) { await this.mutate(data => { data.telegramUpdates = data.telegramUpdates.filter(id => id !== updateId); }); }
  async claimTelegramOperation(operationId: string) {
    let claimed = false;
    await this.mutate(data => { if (!data.telegramOperations.includes(operationId)) { data.telegramOperations.push(operationId); data.telegramOperations = data.telegramOperations.slice(-5000); claimed = true; } });
    return claimed;
  }
  async releaseTelegramOperation(operationId: string) { await this.mutate(data => { data.telegramOperations = data.telegramOperations.filter(id => id !== operationId); }); }
  async resetDemo(record: AuditRecord) { await this.mutate(data => { Object.assign(data, emptyData(), { audit: [record] }); }); }

  private async mutate(change: (data: StoreData) => void) {
    const run = this.queue.then(async () => { const data = await this.read(); change(data); await this.write(data); });
    this.queue = run.catch(() => undefined);
    await run;
  }
}

export class MemoryActionStore extends DataStore {
  readonly kind = 'memory' as const;
  private data = emptyData();
  private expiresAt = Date.now() + TTL_SECONDS * 1000;
  protected async read() {
    if (Date.now() >= this.expiresAt) { this.data = emptyData(); this.expiresAt = Date.now() + TTL_SECONDS * 1000; }
    return structuredClone(this.data);
  }
  protected async write(data: StoreData) { this.data = structuredClone(data); this.expiresAt = Date.now() + TTL_SECONDS * 1000; }
}

export class UpstashActionStore extends DataStore {
  readonly kind = 'upstash' as const;
  constructor(private readonly url: string, private readonly token: string) { super(); }

  private async command(args: string[]): Promise<unknown> {
    const response = await fetch(this.url, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), cache: 'no-store' });
    if (!response.ok) throw new Error(`Upstash REST respondeu ${response.status}`);
    const payload = await response.json() as { result?: unknown; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.result;
  }
  protected async read() {
    const raw = await this.command(['GET', PREFIX]);
    if (typeof raw !== 'string' || !raw) return emptyData();
    try { return { ...emptyData(), ...JSON.parse(raw) as Partial<StoreData> }; } catch { return emptyData(); }
  }
  protected async write(data: StoreData) { await this.command(['SET', PREFIX, JSON.stringify(data), 'EX', String(TTL_SECONDS)]); }
  async resetDemo(record: AuditRecord) {
    const keys = await this.command(['KEYS', `${PREFIX}:telegram:*`]);
    if (Array.isArray(keys)) {
      const telegramKeys = keys.filter((key): key is string => typeof key === 'string');
      if (telegramKeys.length) await this.command(['DEL', ...telegramKeys]);
    }
    await this.command(['DEL', PREFIX]);
    await this.write({ ...emptyData(), audit: [record] });
  }
  private telegramKey(kind: string, id: string) { return `${PREFIX}:telegram:${kind}:${createHash('sha256').update(id).digest('hex')}`; }
  async claimTelegramUpdate(updateId: string) { return (await this.command(['SET', this.telegramKey('update', updateId), '1', 'NX', 'EX', String(TTL_SECONDS)])) === 'OK'; }
  async releaseTelegramUpdate(updateId: string) { await this.command(['DEL', this.telegramKey('update', updateId)]); }
  async claimTelegramOperation(operationId: string) { return (await this.command(['SET', this.telegramKey('operation', operationId), '1', 'NX', 'EX', String(TTL_SECONDS)])) === 'OK'; }
  async releaseTelegramOperation(operationId: string) { await this.command(['DEL', this.telegramKey('operation', operationId)]); }
}

type StoreGlobal = typeof globalThis & { __gogroupActionStore?: ActionStore };
export function createActionStore(env: Record<string, string | undefined> = process.env): ActionStore {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new UpstashActionStore(url, token) : new MemoryActionStore();
}
export function getActionStore() {
  const root = globalThis as StoreGlobal;
  root.__gogroupActionStore ??= createActionStore();
  return root.__gogroupActionStore;
}

export async function executeActionEffect(action: Action, store = getActionStore()) {
  if (isConsultationActionType(action.tipo)) throw new Error('Consultas e simulações não podem ser executadas como Actions.');
  if (action.status !== 'aprovada') throw new Error('Somente ações aprovadas podem ser executadas.');
  const updated = transitionAction(action, 'executada', action.responsavel);
  const state = action.tipo === 'reembolso' ? 'cancelado' : action.tipo === 'comunicacao_cliente' ? null : 'em_tratativa';
  await store.completeAction(updated, state);
  return updated;
}

export async function recordConsultation(store: ActionStore, input: { tool: string; summary: string; orderIds?: string[] }) {
  const id = randomUUID();
  const record: AuditRecord = {
    id,
    actionId: `consulta:${id}`,
    evento: 'consultada',
    kind: 'consulta',
    tool: input.tool,
    orderIds: input.orderIds,
    responsavel: 'agente',
    ocorridaEm: new Date().toISOString(),
    descricao: input.summary,
  };
  await store.appendAudit(record);
  return { id, kind: 'consulta' as const };
}
