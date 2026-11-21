import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { addBusinessDaysAfter, businessDaysBetween, calculateOrder, runEngine, type Order } from '../lib/engine';
import { BUSINESS } from '../lib/params';
import { checkAgentRateLimit } from '../lib/ratelimit';

const fixture = JSON.parse(readFileSync('data/fixtures/synthetic.json', 'utf8')) as { orders: Order[]; routes: unknown[] };
const deduplicated = [...new Map(fixture.orders.map(order => [order.order_id, order])).values()];
const params = { capacidadeDiaria: BUSINESS.dailyCapacity, probAbandonoPagamento: BUSINESS.paymentAbandonmentProbability, tetoRuptura: BUSINESS.stockoutRiskFloor };
const base: Order = { order_id: 'GC-0001', customer_id: 'CLI-0001', data_pedido: '2026-09-04', valor: 100, tipo_excecao: 'item_faltante', sla_contratado_dias_uteis: 1, custo_medio_frete: 12, receita_acumulada: 1000, n_pedidos: 2 };

describe('motor determinístico com fixture sintética', () => {
  it('conta dias úteis excluindo fim de semana e feriados', () => {
    expect(addBusinessDaysAfter('2026-09-04', 1)).toBe('2026-09-08');
    expect(addBusinessDaysAfter('2026-09-04', 2)).toBe('2026-09-09');
    expect(businessDaysBetween('2026-09-04', '2026-09-08')).toBe(1);
  });
  it('recalcula a promessa em dias úteis, diferente do prazo corrido', () => {
    const result = calculateOrder({ ...base, data_pedido: '2026-09-04', sla_contratado_dias_uteis: 1 }, params);
    expect(result.data_prometida_real).toBe('2026-09-09');
    expect(result.data_prometida_real).not.toBe('2026-09-06');
  });
  it('deduplica fixture de 63 linhas para 60 pedidos e contempla 11 tipos', () => {
    expect(fixture.orders).toHaveLength(63);
    expect(deduplicated).toHaveLength(60);
    expect(new Set(deduplicated.map(order => order.tipo_excecao)).size).toBe(11);
  });
  it('aplica alçada VIP, valor e ruptura', () => {
    expect(calculateOrder({ ...base, receita_acumulada: 1501 }, params).requerAlcadaHumana).toBe(true);
    expect(calculateOrder({ ...base, valor: 251 }, params).requerAlcadaHumana).toBe(true);
    expect(calculateOrder({ ...base, valor: 220 }, params).requerAlcadaHumana).toBe(false);
    expect(calculateOrder({ ...base, tipo_excecao: 'ruptura_pos_venda' }, params).requerAlcadaHumana).toBe(true);
  });
  it('expira pagamento acima de cinco dias úteis e zera o custo de reembolso', () => {
    const expired = calculateOrder({ ...base, tipo_excecao: 'pagamento_pendente', data_pedido: '2026-09-21' }, params);
    const active = calculateOrder({ ...base, tipo_excecao: 'pagamento_pendente', data_pedido: '2026-09-28' }, params);
    expect(expired.zeroTouchAction).toBe('Cancelar por expiração');
    expect(expired.custo_reembolso).toBe(0);
    expect(expired.evRisco).toBe(0);
    expect(active.isZeroTouch).toBe(true);
  });
  it('mantém EV finito e produz burn-down FIFO e AI-First', () => {
    const result = runEngine(deduplicated, { ...params, routes: fixture.routes as never[] });
    expect(result.orders.every(order => Number.isFinite(order.evRisco))).toBe(true);
    expect(result.comparison.burndown.fifo.at(-1)?.remaining).toBe(0);
    expect(result.comparison.burndown.aiFirst.at(-1)?.remaining).toBe(0);
    expect(result.comparison.burndown.daysToClear.fifo).toBe(1);
  });
  it('limita a 20 chamadas por IP a cada dez minutos', () => {
    const ip = 'test-ip-rate-limit', now = 1_800_000_000_000;
    for (let call = 0; call < BUSINESS.agentRequestsPerWindow; call++) expect(checkAgentRateLimit(ip, now + call).allowed).toBe(true);
    expect(checkAgentRateLimit(ip, now + BUSINESS.agentRequestsPerWindow).allowed).toBe(false);
    expect(checkAgentRateLimit(ip, now + BUSINESS.agentRateLimitWindowMs + 1).allowed).toBe(true);
  });
  it('não contém mojibake no código nem nos datasets de demonstração', () => {
    const bad = [String.fromCharCode(0xc3, 0xa9), String.fromCharCode(0xc3, 0xa1), String.fromCharCode(0xc3, 0xa7)];
    const roots = ['app', 'components', 'lib', 'scripts', '__tests__', 'data'];
    const files: string[] = [];
    const visit = (directory: string) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) visit(file); else if (/\.(ts|tsx|mjs|md|json)$/.test(file) && !file.includes('private')) files.push(file); } };
    roots.forEach(root => { if (existsSync(root)) visit(root); });
    expect(files.filter(file => bad.some(sequence => readFileSync(file, 'utf8').includes(sequence)))).toEqual([]);
  });
});

describe.skipIf(!existsSync('data/private/snapshot_2000.json'))('snapshot privado opcional', () => {
  it('mantém 2.000 pedidos únicos no snapshot fornecido', () => {
    const data = JSON.parse(readFileSync('data/private/snapshot_2000.json', 'utf8')) as { orders: Order[] };
    expect(data.orders).toHaveLength(2000);
    expect(new Set(data.orders.map(order => order.order_id)).size).toBe(2000);
  });
});
