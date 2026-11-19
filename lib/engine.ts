export type Order = {
  order_id: string; customer_id: string; marca?: string; data_pedido: string; valor: number | string; sku?: string;
  descricao_produto?: string; qtd_itens?: number | string; brinde_no_pedido?: boolean | string; tipo_excecao: string; status?: string;
  transportadora?: string; uf?: string; cidade?: string; data_prometida?: string | null; data_entrega?: string | null;
  maquina?: string | null; turno?: string; cd?: string; lote_produto?: string | null; data_abertura_excecao?: string;
  n_pedidos?: number | string; receita_acumulada?: number | string; n_contatos_atendimento?: number | string;
  uf_atendida?: string; sla_contratado_dias_uteis?: number | string; custo_medio_frete?: number | string;
};
export type EngineParams = { capacidadeDiaria?: number; probAbandonoPagamento?: number; tetoRuptura?: number };
export type EnrichedOrder = Order & { valor: number; isVip: boolean; data_prometida_real: string; dias_atraso_uteis: number; cmv: number; custo_reenvio: number; custo_reembolso: number; custo_contato: number; probCancel: number; perda_ltv_12m: number; isZeroTouch: boolean; zeroTouchAction: string | null; requerAlcadaHumana: boolean; evRisco: number };
export const REFERENCE_DATE = '2026-09-30';
const holidays = new Set(['2026-09-07', '2026-10-12']);
const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const plusDay = (date: string) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const isBusiness = (date: string) => { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return day !== 0 && day !== 6 && !holidays.has(date); };
export function addBusinessDaysAfter(date: string, days: number): string { let cursor = date, count = 0; while (count < days) { cursor = plusDay(cursor); if (isBusiness(cursor)) count++; } return cursor; }
export function businessDaysBetween(startExclusive: string, endInclusive: string): number { if (endInclusive <= startExclusive) return 0; let count = 0, cursor = startExclusive; while (cursor < endInclusive) { cursor = plusDay(cursor); if (isBusiness(cursor)) count++; } return count; }
const cancelProbability = (delay: number) => delay <= 0 ? 0 : delay <= 2 ? 0.04 : delay <= 5 ? 0.10 : delay <= 10 ? 0.22 : 0.40;
export function calculateOrder(order: Order, params: Required<EngineParams>): EnrichedOrder {
  const valor = num(order.valor), receita = num(order.receita_acumulada), nPedidos = Math.max(1, num(order.n_pedidos, 1));
  const isVip = receita > 1500, cmv = 0.24 * valor, custoReenvio = cmv + num(order.custo_medio_frete);
  const sla = Math.max(0, num(order.sla_contratado_dias_uteis));
  const promised = addBusinessDaysAfter(order.data_pedido, 1 + sla);
  const end = order.data_entrega || REFERENCE_DATE;
  const atraso = businessDaysBetween(promised, end);
  const probCancel = cancelProbability(atraso), probRecompra = isVip ? 0.70 : 0.28;
  const perda = 0.5 * probRecompra * (receita / nPedidos);
  const type = order.tipo_excecao;
  let isZeroTouch = false, action: string | null = null, ev = 0;
  if (type === 'atraso_entrega' && order.data_entrega) { isZeroTouch = true; action = 'Auto-encerramento + aviso proativo'; ev = 4.5 + perda; }
  else if (type === 'pagamento_pendente') { isZeroTouch = true; action = 'Régua automatizada Pix/Cartão'; ev = params.probAbandonoPagamento * (valor - cmv); }
  else if (type === 'endereco_divergente') { isZeroTouch = true; action = 'Webhook WhatsApp confirmação endereço'; ev = probCancel * valor + 9 + perda; }
  else if (type === 'ruptura_pos_venda') ev = Math.max(probCancel, params.tetoRuptura) * valor + 9 + perda;
  else if (['extravio','avaria_transporte','vazamento_produto','falha_personalizacao'].includes(type)) ev = Math.max(valor - custoReenvio, 0) + 9 + perda;
  else if (type === 'item_faltante') ev = Math.max(valor - 0.4 * custoReenvio, 0) + 9 + perda;
  else if (['rastreio_parado','devolvido_transportadora'].includes(type)) ev = Math.max(probCancel, 0.22) * valor + 9 + perda;
  return { ...order, valor, isVip, data_prometida_real: promised, dias_atraso_uteis: atraso, cmv, custo_reenvio: custoReenvio, custo_reembolso: valor, custo_contato: 9, probCancel, perda_ltv_12m: perda, isZeroTouch, zeroTouchAction: action, requerAlcadaHumana: isVip || valor > 200 || type === 'ruptura_pos_venda', evRisco: ev };
}
export function runEngine(orders: Order[], input: EngineParams = {}) {
  const params: Required<EngineParams> = { capacidadeDiaria: input.capacidadeDiaria ?? 150, probAbandonoPagamento: input.probAbandonoPagamento ?? 0.30, tetoRuptura: input.tetoRuptura ?? 0.40 };
  const enriched = orders.map(o => calculateOrder(o, params));
  const fifo = [...enriched].sort((a,b) => (a.data_abertura_excecao ?? '').localeCompare(b.data_abertura_excecao ?? '') || a.data_pedido.localeCompare(b.data_pedido)).slice(0, params.capacidadeDiaria);
  const ranked = [...enriched].sort((a,b) => b.evRisco-a.evRisco);
  const prioritized = ranked.slice(0, params.capacidadeDiaria);
  const systemic = [
    anomaly('bug_checkout', 'Bug checkout: promessa em dias corridos vs úteis', o => businessDaysBetween(o.data_prometida ?? o.data_prometida_real, o.data_prometida_real) > 0 || (Boolean(o.data_entrega) && o.dias_atraso_uteis === 0 && !!o.data_prometida && o.data_entrega! > o.data_prometida)),
    anomaly('cd2_turno_noite', 'CD2 Turno Noite: item faltante e brindes', o => o.tipo_excecao === 'item_faltante' && o.cd === 'CD2' && o.turno === 'noite'),
    anomaly('rota_express_ne', 'Colapso Rota Express no Nordeste', o => o.transportadora === 'Rota Express' && ['BA','PE','CE','RN','PB','MA','AL','PI','SE'].includes(o.uf ?? '') && ['atraso_entrega','rastreio_parado'].includes(o.tipo_excecao)),
    anomaly('vazamento_lote_l2607b', 'Vazamento lote L2607-B / SKU APC-1067', o => o.tipo_excecao === 'vazamento_produto' && o.lote_produto === 'L2607-B' && o.sku === 'APC-1067'),
    anomaly('falha_imp02', 'Falha de personalização na IMP-02', o => o.tipo_excecao === 'falha_personalizacao' && o.maquina === 'IMP-02'),
    anomaly('carga_norte_kokeshi', 'Avarias Carga Norte e ruptura Kokeshi', o => (o.tipo_excecao === 'avaria_transporte' && o.transportadora === 'Carga Norte') || (o.tipo_excecao === 'ruptura_pos_venda' && (o.descricao_produto ?? '').toLowerCase().includes('kokeshi'))),
  ].map(fn => fn(enriched));
  const routeAnomaly = systemic.find(item => item.id === 'rota_express_ne');
  if (routeAnomaly) routeAnomaly.benchmark = [
    { label: 'Atual — Rota Express (NE): SLA 6 d.u. • frete R$ 19,78 (396 exceções)' },
    { label: 'Alternativa 1 — Veloz Log (NE): mesmo SLA 6 d.u. • frete R$ 23,00 (+R$ 3,22)' },
    { label: 'Alternativa 2 — Entrega Já (NE): SLA 5 d.u. (-1 d.u.) • frete R$ 26,45 (+R$ 6,67)' },
  ];
  return { referenceDate: REFERENCE_DATE, params, totals: { pedidos: enriched.length, gmv: sum(enriched.map(o=>o.valor)), evRisco: sum(enriched.map(o=>o.evRisco)), zeroTouch: enriched.filter(o=>o.isZeroTouch).length, zeroTouchHoursSaved: enriched.filter(o=>o.isZeroTouch).length * 0.2 }, comparison: { fifo: summarize(fifo), aiFirst: summarize(prioritized), hoursHumanFreedByZeroTouch: enriched.filter(o=>o.isZeroTouch).length * 0.2 }, systemic, rankedOrders: ranked, orders: enriched };
}
const sum = (xs: number[]) => xs.reduce((a,b)=>a+b,0);
function summarize(xs: EnrichedOrder[]) { return { count: xs.length, gmvCovered: sum(xs.map(o=>o.valor)), evRiscoProtected: sum(xs.map(o=>o.evRisco)), vipsAttended: xs.filter(o=>o.isVip).length, hoursSavedByZeroTouch: xs.filter(o=>o.isZeroTouch).length*0.2 }; }
function anomaly(id: string, title: string, predicate: (o: EnrichedOrder)=>boolean) { return (orders: EnrichedOrder[]) => { const hits=orders.filter(predicate); return { id,title,count:hits.length,gmvExposto:sum(hits.map(o=>o.valor)),economiaEstimada:sum(hits.map(o=>o.evRisco)),orders:hits.length, benchmark: id==='rota_express_ne' ? [] as { label: string }[] : undefined, brindes:hits.filter(o=>o.brinde_no_pedido===true || o.brinde_no_pedido==='True').length }; }; }

