import { BUSINESS, ZERO_TOUCH_MINUTES_SAVED } from './params';

export type Order = {
  order_id: string; customer_id: string; marca?: string; data_pedido: string; valor: number | string; sku?: string;
  descricao_produto?: string; qtd_itens?: number | string; brinde_no_pedido?: boolean | string; tipo_excecao: string; status?: string;
  transportadora?: string; uf?: string; cidade?: string; data_prometida?: string | null; data_entrega?: string | null;
  maquina?: string | null; turno?: string; cd?: string; lote_produto?: string | null; data_abertura_excecao?: string;
  n_pedidos?: number | string; receita_acumulada?: number | string; n_contatos_atendimento?: number | string;
  uf_atendida?: string; sla_contratado_dias_uteis?: number | string; custo_medio_frete?: number | string;
};
export type EngineParams = { capacidadeDiaria?: number; probAbandonoPagamento?: number; tetoRuptura?: number; routes?: Route[] };
export type Route = { transportadora?: string; uf_atendida?: string; sla_contratado_dias_uteis?: number | string; custo_medio_frete?: number | string };
export type EnrichedOrder = Order & { valor: number; estadoAtual: 'aberto'; isVip: boolean; data_prometida_real: string; dias_atraso_uteis: number; cmv: number; margem: number; custo_reenvio: number; custo_reembolso: number; custo_contato: number; probCancel: number; perda_ltv_12m: number; isZeroTouch: boolean; zeroTouchAction: string | null; requerAlcadaHumana: boolean; evRisco: number };
export const REFERENCE_DATE = BUSINESS.referenceDate;
const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const plusDay = (date: string) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const isBusiness = (date: string) => { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return day !== 0 && day !== 6 && !(BUSINESS.holidays as readonly string[]).includes(date); };
export function addBusinessDaysAfter(date: string, days: number): string { let cursor = date, count = 0; while (count < days) { cursor = plusDay(cursor); if (isBusiness(cursor)) count++; } return cursor; }
export function businessDaysBetween(startExclusive: string, endInclusive: string): number { if (endInclusive <= startExclusive) return 0; let count = 0, cursor = startExclusive; while (cursor < endInclusive) { cursor = plusDay(cursor); if (isBusiness(cursor)) count++; } return count; }
const cancelProbability = (delay: number) => delay <= 0 ? 0 : BUSINESS.cancelBands.find(band => delay <= band.maxDays)!.probability;
export function calculateOrder(order: Order, params: Required<Omit<EngineParams, 'routes'>>): EnrichedOrder {
  const valor = num(order.valor), receita = num(order.receita_acumulada), nPedidos = Math.max(1, num(order.n_pedidos, 1));
  const margem = valor * (1 - BUSINESS.cmvRate), isVip = receita > BUSINESS.vipThreshold, cmv = valor * BUSINESS.cmvRate;
  const custoReenvio = cmv + num(order.custo_medio_frete), sla = Math.max(0, num(order.sla_contratado_dias_uteis));
  const promised = addBusinessDaysAfter(order.data_pedido, BUSINESS.orderPreparationBusinessDays + sla), end = order.data_entrega || REFERENCE_DATE;
  const atraso = businessDaysBetween(promised, end), probCancel = cancelProbability(atraso);
  const probRecompra = isVip ? BUSINESS.vipRepurchaseRate : BUSINESS.regularRepurchaseRate;
  const perda = BUSINESS.ltvDropRate * probRecompra * (receita / nPedidos) * (1 - BUSINESS.cmvRate);
  const type = order.tipo_excecao, expiredPayment = type === 'pagamento_pendente' && businessDaysBetween(order.data_pedido, REFERENCE_DATE) > BUSINESS.paymentExpiryBusinessDays;
  let isZeroTouch = false, action: string | null = null, ev = 0;
  if (type === 'atraso_entrega' && order.data_entrega) { isZeroTouch = true; action = 'Autoencerramento + aviso proativo'; ev = BUSINESS.contactCost + perda; }
  else if (type === 'pagamento_pendente' && expiredPayment) { action = 'Cancelar por expiração'; ev = 0; }
  else if (type === 'pagamento_pendente') { isZeroTouch = true; action = 'Régua automatizada Pix/Cartão'; ev = params.probAbandonoPagamento * margem; }
  else if (type === 'endereco_divergente') { isZeroTouch = true; action = 'Confirmação de endereço'; ev = probCancel * margem + BUSINESS.contactCost + perda; }
  else if (type === 'ruptura_pos_venda') ev = Math.max(probCancel, params.tetoRuptura) * margem + BUSINESS.contactCost + perda;
  else if (['extravio','avaria_transporte','vazamento_produto','falha_personalizacao'].includes(type)) ev = Math.max(margem - custoReenvio, 0) + BUSINESS.contactCost + perda;
  else if (type === 'item_faltante') ev = Math.max(margem - BUSINESS.itemMissingReshipShare * custoReenvio, 0) + BUSINESS.contactCost + perda;
  else if (['rastreio_parado','devolvido_transportadora'].includes(type)) ev = Math.max(probCancel, BUSINESS.trackingRiskFloor) * margem + BUSINESS.contactCost + perda;
  if (!Number.isFinite(ev)) ev = 0;
  return { ...order, valor, estadoAtual: 'aberto', margem, isVip, data_prometida_real: promised, dias_atraso_uteis: atraso, cmv, custo_reenvio: custoReenvio, custo_reembolso: type === 'pagamento_pendente' && expiredPayment ? 0 : valor, custo_contato: BUSINESS.contactCost, probCancel, perda_ltv_12m: perda, isZeroTouch, zeroTouchAction: action, requerAlcadaHumana: isVip || valor > BUSINESS.approvalValueThreshold || type === 'ruptura_pos_venda', evRisco: ev };
}
export function runEngine(orders: Order[], input: EngineParams = {}) {
  const requestedCapacity = input.capacidadeDiaria ?? BUSINESS.dailyCapacity;
  const params = { capacidadeDiaria: Number.isFinite(requestedCapacity) ? Math.max(1, Math.floor(requestedCapacity)) : BUSINESS.dailyCapacity, probAbandonoPagamento: input.probAbandonoPagamento ?? BUSINESS.paymentAbandonmentProbability, tetoRuptura: input.tetoRuptura ?? BUSINESS.stockoutRiskFloor };
  const enriched = orders.map(o => calculateOrder(o, params));
  const fifoAll = [...enriched].sort((a,b) => (a.data_abertura_excecao ?? '').localeCompare(b.data_abertura_excecao ?? '') || a.data_pedido.localeCompare(b.data_pedido));
  const ranked = [...enriched].sort((a,b) => b.evRisco-a.evRisco);
  const fifo = fifoAll.slice(0, params.capacidadeDiaria), prioritized = ranked.slice(0, params.capacidadeDiaria);
  const specs: [string,string,(o:EnrichedOrder)=>boolean,(o:EnrichedOrder)=>number][] = [
    ['bug_checkout','Bug checkout: promessa em dias corridos vs úteis', o => Boolean(o.data_prometida && o.data_prometida < o.data_prometida_real), o => o.custo_contato + o.perda_ltv_12m],
    ['cd2_turno_noite','CD2 turno noite: item faltante e brindes', o => o.tipo_excecao === 'item_faltante' && o.cd === 'CD2' && o.turno === 'noite', o => Math.max(o.margem - o.custo_reenvio, 0) + o.custo_contato + o.perda_ltv_12m],
    ['rota_express_ne','Rota Express no Nordeste', o => o.transportadora === 'Rota Express' && ['BA','PE','CE','RN','PB','MA','AL','PI','SE'].includes(o.uf ?? '') && ['atraso_entrega','rastreio_parado'].includes(o.tipo_excecao), o => o.evRisco],
    ['vazamento_lote_l2607b','Vazamento lote L2607-B / SKU APC-1067', o => o.tipo_excecao === 'vazamento_produto' && o.lote_produto === 'L2607-B' && o.sku === 'APC-1067', o => o.evRisco],
    ['falha_imp02','Falha de personalização na IMP-02', o => o.tipo_excecao === 'falha_personalizacao' && o.maquina === 'IMP-02', o => o.evRisco],
    ['avaria_carga_norte','Avaria da Carga Norte em Lescent', o => o.tipo_excecao === 'avaria_transporte' && o.transportadora === 'Carga Norte' && o.marca === 'Lescent', o => o.evRisco],
    ['ruptura_kokeshi','Ruptura pós-venda de Kokeshi', o => o.tipo_excecao === 'ruptura_pos_venda' && (o.sku ?? '').startsWith('KSH-'), o => o.evRisco],
  ];
  const systemic = specs.map(([id,title,predicate,savings]) => { const hits=enriched.filter(predicate); const item=anomaly(id,title,predicate)(enriched); const savingsTotal = sum(hits.map(savings)); return { ...item, economiaEstimada: Math.min(item.gmvExposto, savingsTotal) }; });
  const routeAnomaly = systemic.find(item => item.id === 'rota_express_ne');
  if (routeAnomaly) {
    const relevant = (input.routes ?? []).filter(route => ['BA','PE','CE','RN','PB','MA','AL','PI','SE'].includes(route.uf_atendida ?? ''));
    const average = (carrier: string) => { const values = relevant.filter(route => route.transportadora === carrier).map(route => num(route.custo_medio_frete)).filter(value => value > 0); return values.length ? sum(values) / values.length : null; };
    const current = average('Rota Express');
    routeAnomaly.benchmark = current === null ? [] : relevant.map(route => route.transportadora).filter((name,index,array): name is string => Boolean(name) && array.indexOf(name) === index && name !== 'Rota Express').map(carrier => { const alternative = average(carrier); return alternative === null ? null : { label: `${carrier}: frete médio ${alternative.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} (diferença ${((alternative-current)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})})` }; }).filter((row): row is {label:string} => Boolean(row));
  }
  const burndown = (sorted: EnrichedOrder[]) => { const days = []; for (let start=0, day=1; start<sorted.length; start+=params.capacidadeDiaria, day++) { const batch=sorted.slice(start,start+params.capacidadeDiaria); days.push({ day, processed: Math.min(start+params.capacidadeDiaria, sorted.length), remaining: Math.max(0,sorted.length-start-batch.length), evProtected: sum(batch.map(order=>order.evRisco)), evProtectedAccumulated: sum(sorted.slice(0,start+batch.length).map(order=>order.evRisco)) }); } return days; };
  const saved = enriched.filter(o=>o.isZeroTouch).length * ZERO_TOUCH_MINUTES_SAVED / 60;
  return { referenceDate: REFERENCE_DATE, params, totals: { pedidos: enriched.length, gmv: sum(enriched.map(o=>o.valor)), evRisco: sum(enriched.map(o=>o.evRisco)), zeroTouch: enriched.filter(o=>o.isZeroTouch).length, zeroTouchHoursSaved: saved }, comparison: { fifo: summarize(fifo), aiFirst: summarize(prioritized), hoursHumanFreedByZeroTouch: saved, burndown: { fifo: burndown(fifoAll), aiFirst: burndown(ranked), daysToClear: { fifo: Math.ceil(enriched.length/params.capacidadeDiaria), aiFirst: Math.ceil(enriched.length/params.capacidadeDiaria) } } }, systemic, rankedOrders: ranked, orders: enriched };
}
const sum = (xs: number[]) => xs.reduce((a,b)=>a+b,0);
function summarize(xs: EnrichedOrder[]) { return { count: xs.length, gmvCovered: sum(xs.map(o=>o.valor)), evRiscoProtected: sum(xs.map(o=>o.evRisco)), vipsAttended: xs.filter(o=>o.isVip).length, hoursSavedByZeroTouch: xs.filter(o=>o.isZeroTouch).length*ZERO_TOUCH_MINUTES_SAVED/60 }; }
function anomaly(id: string, title: string, predicate: (o:EnrichedOrder)=>boolean) { return (orders: EnrichedOrder[]) => { const hits=orders.filter(predicate); return { id,title,count:hits.length,gmvExposto:sum(hits.map(o=>o.valor)),economiaEstimada:sum(hits.map(o=>o.evRisco)),orders:hits.length, benchmark: id==='rota_express_ne' ? [] as { label: string }[] : undefined, brindes:hits.filter(o=>o.brinde_no_pedido===true || o.brinde_no_pedido==='True').length }; }; }
