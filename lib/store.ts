import { transitionAction, type Action, type AuditRecord, type OrderState } from './actions';

const PREFIX = 'gogroup:ops:demo:v1';
const TTL_SECONDS = 7 * 24 * 60 * 60;
type StoreData = { actions: Action[]; orderStates: Record<string, OrderState>; audit: AuditRecord[] };
const emptyData = (): StoreData => ({ actions: [], orderStates: {}, audit: [] });

export interface ActionStore {
  readonly kind: 'memory' | 'upstash';
  listActions(): Promise<Action[]>;
  getAction(id: string): Promise<Action | undefined>;
  createAction(action: Action): Promise<{ action: Action; created: boolean }>;
  saveAction(action: Action): Promise<void>;
  completeAction(action: Action, state: OrderState): Promise<void>;
  getOrderStates(): Promise<Record<string, OrderState>>;
  setOrderState(orderId: string, state: OrderState): Promise<void>;
  listAudit(): Promise<AuditRecord[]>;
  appendAudit(record: AuditRecord): Promise<void>;
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
  async completeAction(action: Action, state: OrderState) {
    await this.mutate(data => {
      const index = data.actions.findIndex(item => item.id === action.id);
      if (index < 0) data.actions.push(action); else data.actions[index] = action;
      for (const orderId of action.orderIds) data.orderStates[orderId] = state;
      const auditId = `${action.id}:executada`;
      if (!data.audit.some(record => record.id === auditId)) data.audit.push({ id: auditId, actionId: action.id, evento: 'executada', responsavel: action.responsavel, ocorridaEm: action.atualizadaEm, descricao: action.efeito.descricao });
    });
  }
  async getOrderStates() { return (await this.read()).orderStates; }
  async setOrderState(orderId: string, state: OrderState) { await this.mutate(data => { data.orderStates[orderId] = state; }); }
  async listAudit() { return (await this.read()).audit.sort((a,b) => a.ocorridaEm.localeCompare(b.ocorridaEm)); }
  async appendAudit(record: AuditRecord) { await this.mutate(data => { if (!data.audit.some(item => item.id === record.id)) data.audit.push(record); }); }

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

  private async command(args: string[]) {
    const response = await fetch(this.url, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), cache: 'no-store' });
    if (!response.ok) throw new Error(`Upstash REST respondeu ${response.status}`);
    const payload = await response.json() as { result?: string | null; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.result;
  }
  protected async read() {
    const raw = await this.command(['GET', PREFIX]);
    if (!raw) return emptyData();
    try { return { ...emptyData(), ...JSON.parse(raw) as Partial<StoreData> }; } catch { return emptyData(); }
  }
  protected async write(data: StoreData) { await this.command(['SET', PREFIX, JSON.stringify(data), 'EX', String(TTL_SECONDS)]); }
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
  if (action.status !== 'aprovada') throw new Error('Somente ações aprovadas podem ser executadas.');
  const updated = transitionAction(action, 'executada', action.responsavel);
  const state = action.tipo === 'reembolso' ? 'cancelado' : 'em_tratativa';
  await store.completeAction(updated, state);
  return updated;
}
